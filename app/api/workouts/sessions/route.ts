/**
 * Workout sessions: starting, resuming, recording, and finishing one workout.
 *
 * A session row exists only for a workout somebody actually started; planned
 * future workouts are never written. Starting one snapshots everything it
 * prescribes, so editing the program, an exercise description, or a video
 * later cannot change what history says was done.
 *
 * Finishing a workout writes exactly one entry in the daily activity diary and
 * remembers it, so completing again — or switching between Completed and
 * Partial — updates that entry instead of double-counting the day.
 */
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import {
  exerciseLibrary, workoutSessionExercises, workoutSessions, workoutSets,
  workoutTemplateExercises, workoutTemplates,
} from "../../../../db/schema";
import { MAX_ACTIVITY_CALORIES, MAX_ACTIVITY_COMMENTS, MAX_ACTIVITY_MINUTES } from "../../activity";
import { stampDailyGoal } from "../../daily-goal";
import { profileFrom } from "../../profile";
import { localDate, round } from "../../../shared";
import {
  MAX_WORKOUT_NOTES, diaryActivityName, sessionTitle, usesCardio, usesReps, workingVolume,
} from "../../../workout-shared";
import {
  chunkForD1, cleanText, findCycle, isDate, loadProgram, loadSession, optionalInteger,
  optionalNumber, previousPerformance, removeDiaryEntry, roundTwo, syncDiaryEntry,
} from "../store";

const MAX_HISTORY = 200;

/** Minutes between two timestamps, never negative and never below one. */
function elapsedMinutes(startedAt: string, finishedAt: string) {
  const started = Date.parse(startedAt);
  const finished = Date.parse(finishedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished <= started) return 1;
  return Math.max(1, roundTwo((finished - started) / 60000));
}

type LoadedSession = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

/**
 * The concise summary the daily diary receives.
 *
 * Set-level detail stays in the workout module; this is the linked recap, kept
 * short enough to read inside a day's activity list.
 */
export function buildDiarySummary(session: LoadedSession) {
  const planned = session.exercises.length;
  const done = session.exercises.filter(exercise => exercise.status === "completed").length;
  const partial = session.exercises.filter(exercise => exercise.status === "partial").length;
  const skipped = session.exercises.filter(exercise => exercise.status === "skipped").length;
  const workingSets = session.exercises.reduce(
    (total, exercise) => total + exercise.sets.filter(set => set.setType === "working" && set.completed === 1).length, 0);

  const lines = [
    sessionTitle(session),
    `Exercises completed: ${done} of ${planned}${partial > 0 ? ` (${partial} partial)` : ""}${skipped > 0 ? ` · ${skipped} skipped` : ""}`,
    `Working sets completed: ${workingSets}`,
  ];
  for (const exercise of session.exercises) {
    if (exercise.status === "skipped") { lines.push(`- ${exercise.exerciseNameSnapshot}: skipped`); continue; }
    const completed = exercise.sets.filter(set => set.completed === 1);
    if (completed.length === 0) continue;
    if (usesCardio(exercise.measurementTypeSnapshot)) {
      const minutes = completed.reduce((total, set) => total + (set.durationSeconds ?? 0), 0) / 60;
      const distance = completed.reduce((total, set) => total + (set.distance ?? 0), 0);
      const detail = [
        minutes > 0 ? `${round(minutes)} min` : "",
        distance > 0 ? `${round(distance)} ${completed[0]?.distanceUnit ?? "mi"}` : "",
        completed[0]?.incline !== null && completed[0]?.incline !== undefined ? `${round(Number(completed[0].incline))}% incline` : "",
      ].filter(Boolean).join(", ");
      lines.push(`- ${exercise.exerciseNameSnapshot}${detail ? `: ${detail}` : ""}`);
      continue;
    }
    const reps = completed.map(set => set.actualReps ?? 0).join("/");
    const weights = completed.filter(set => set.weight !== null).map(set => Number(set.weight));
    const weight = weights.length > 0 ? ` @ ${round(Math.max(...weights))} ${completed[0]?.weightUnit ?? "lb"}` : "";
    lines.push(`- ${exercise.exerciseNameSnapshot}: ${completed.length} sets, reps ${reps}${weight}`);
  }
  const volume = workingVolume(session.exercises.flatMap(exercise => exercise.sets));
  if (volume > 0) lines.push(`Volume: ${Math.round(volume)} lb`);
  if (session.notes) lines.push(`Notes: ${session.notes}`);
  return lines.join("\n").slice(0, MAX_ACTIVITY_COMMENTS);
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const db = getDb();
    const owner = profileFrom(request);

    const id = Number(params.get("id"));
    if (params.get("id") !== null) {
      if (!Number.isInteger(id)) return Response.json({ error: "A valid workout is required" }, { status: 400 });
      const session = await loadSession(db, owner, id);
      if (!session) return Response.json({ error: "That workout was not found" }, { status: 404 });
      // Previous performance ignores cycles entirely: Cycle 2 still sees what
      // was lifted in Cycle 1.
      const previous = await previousPerformance(
        db, owner,
        session.exercises.map(exercise => exercise.exerciseId).filter((value): value is number => value !== null),
        session.id,
      );
      return Response.json({
        session,
        previous: Object.fromEntries(previous),
        volume: Math.round(workingVolume(session.exercises.flatMap(exercise => exercise.sets))),
      });
    }

    const conditions = [eq(workoutSessions.owner, owner)];
    const start = params.get("start"); const end = params.get("end");
    if (start !== null) {
      if (!isDate(start)) return Response.json({ error: "A valid start date is required" }, { status: 400 });
      conditions.push(gte(workoutSessions.workoutDate, start));
    }
    if (end !== null) {
      if (!isDate(end)) return Response.json({ error: "A valid end date is required" }, { status: 400 });
      conditions.push(lte(workoutSessions.workoutDate, end));
    }
    const cycle = Number(params.get("cycle"));
    if (params.get("cycle") !== null && Number.isInteger(cycle)) conditions.push(eq(workoutSessions.programCycleId, cycle));
    const week = Number(params.get("week"));
    if (params.get("week") !== null && Number.isInteger(week)) conditions.push(eq(workoutSessions.weekNumberSnapshot, week));
    const workout = Number(params.get("workout"));
    if (params.get("workout") !== null && Number.isInteger(workout)) conditions.push(eq(workoutSessions.workoutNumberSnapshot, workout));
    const status = params.get("status");
    if (status) conditions.push(eq(workoutSessions.status, status));
    if (params.get("active") === "1") conditions.push(eq(workoutSessions.status, "in_progress"));

    const sessions = await db.select().from(workoutSessions)
      .where(and(...conditions))
      .orderBy(desc(workoutSessions.workoutDate), desc(workoutSessions.id))
      .limit(MAX_HISTORY);

    // Counts for the list come from two grouped queries rather than a query
    // per session.
    const ids = sessions.map(session => session.id);
    const [exerciseCounts, setCounts] = ids.length === 0 ? [[], []] : await Promise.all([
      db.select({
        sessionId: workoutSessionExercises.workoutSessionId,
        planned: sql<number>`count(*)`,
        completed: sql<number>`sum(case when ${workoutSessionExercises.status} = 'completed' then 1 else 0 end)`,
      }).from(workoutSessionExercises)
        .where(inArray(workoutSessionExercises.workoutSessionId, ids))
        .groupBy(workoutSessionExercises.workoutSessionId),
      db.select({
        sessionId: workoutSessionExercises.workoutSessionId,
        workingSets: sql<number>`sum(case when ${workoutSets.setType} = 'working' and ${workoutSets.completed} = 1 then 1 else 0 end)`,
        volume: sql<number>`sum(case when ${workoutSets.setType} = 'working' and ${workoutSets.completed} = 1 and ${workoutSets.weight} is not null and ${workoutSets.actualReps} is not null then ${workoutSets.weight} * ${workoutSets.actualReps} else 0 end)`,
      }).from(workoutSets)
        .innerJoin(workoutSessionExercises, eq(workoutSets.workoutSessionExerciseId, workoutSessionExercises.id))
        .where(inArray(workoutSessionExercises.workoutSessionId, ids))
        .groupBy(workoutSessionExercises.workoutSessionId),
    ]);
    const exerciseBySession = new Map(exerciseCounts.map(row => [row.sessionId, row]));
    const setBySession = new Map(setCounts.map(row => [row.sessionId, row]));

    return Response.json({
      sessions: sessions.map(session => ({
        ...session,
        title: sessionTitle(session),
        plannedExercises: Number(exerciseBySession.get(session.id)?.planned ?? 0),
        completedExercises: Number(exerciseBySession.get(session.id)?.completed ?? 0),
        workingSets: Number(setBySession.get(session.id)?.workingSets ?? 0),
        volume: Math.round(Number(setBySession.get(session.id)?.volume ?? 0)),
      })),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load workouts" }, { status: 500 });
  }
}

/**
 * Starts a workout, or resumes the one already under way.
 *
 * The unique index on (owner, cycle, template) for in-progress sessions is the
 * real guard; this check makes it a friendly Resume rather than an error.
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const templateId = Number(payload.templateId);
    const cycleId = Number(payload.cycleId);
    if (!Number.isInteger(templateId) || !Number.isInteger(cycleId)) {
      return Response.json({ error: "A valid workout and cycle are required" }, { status: 400 });
    }
    const workoutDate = typeof payload.workoutDate === "string" && payload.workoutDate ? payload.workoutDate : localDate();
    if (!isDate(workoutDate)) return Response.json({ error: "A valid workout date is required" }, { status: 400 });

    const db = getDb();
    const owner = profileFrom(request);
    // Authorization: the cycle must be this profile's, and the workout must
    // belong to that cycle's program.
    const cycle = await findCycle(db, owner, cycleId);
    if (!cycle) return Response.json({ error: "That cycle was not found" }, { status: 404 });
    const [template] = await db.select().from(workoutTemplates).where(eq(workoutTemplates.id, templateId)).limit(1);
    if (!template || template.programId !== cycle.programId) {
      return Response.json({ error: "That workout is not part of this cycle's program" }, { status: 404 });
    }

    const [existing] = await db.select({ id: workoutSessions.id }).from(workoutSessions)
      .where(and(
        eq(workoutSessions.owner, owner),
        eq(workoutSessions.programCycleId, cycleId),
        eq(workoutSessions.workoutTemplateId, templateId),
        eq(workoutSessions.status, "in_progress"),
      )).limit(1);
    if (existing) {
      const session = await loadSession(db, owner, existing.id);
      return Response.json({ session, resumed: true });
    }

    const program = await loadProgram(db, cycle.programId);
    const prescribed = await db.select({
      id: workoutTemplateExercises.id,
      exerciseId: workoutTemplateExercises.exerciseId,
      targetSets: workoutTemplateExercises.targetSets,
      targetReps: workoutTemplateExercises.targetReps,
      targetDurationMinutes: workoutTemplateExercises.targetDurationMinutes,
      targetDistance: workoutTemplateExercises.targetDistance,
      targetIncline: workoutTemplateExercises.targetIncline,
      targetResistance: workoutTemplateExercises.targetResistance,
      isPerSide: workoutTemplateExercises.isPerSide,
      displayOrder: workoutTemplateExercises.displayOrder,
      descriptionOverride: workoutTemplateExercises.descriptionOverride,
      videoUrlOverride: workoutTemplateExercises.videoUrlOverride,
      name: exerciseLibrary.name,
      measurementType: exerciseLibrary.measurementType,
      description: exerciseLibrary.description,
      videoUrl: exerciseLibrary.videoUrl,
    }).from(workoutTemplateExercises)
      .innerJoin(exerciseLibrary, eq(workoutTemplateExercises.exerciseId, exerciseLibrary.id))
      .where(eq(workoutTemplateExercises.workoutTemplateId, templateId))
      .orderBy(asc(workoutTemplateExercises.displayOrder));

    const startedAt = new Date().toISOString();
    const [session] = await db.insert(workoutSessions).values({
      owner,
      programId: cycle.programId,
      programCycleId: cycle.id,
      workoutTemplateId: template.id,
      programNameSnapshot: program?.name ?? null,
      templateNameSnapshot: template.name,
      cycleNumberSnapshot: cycle.cycleNumber,
      weekNumberSnapshot: template.weekNumber,
      workoutNumberSnapshot: template.workoutNumber,
      workoutDate, startedAt, status: "in_progress",
    }).returning();
    if (!session) return Response.json({ error: "That workout could not be started" }, { status: 500 });

    try {
      if (prescribed.length > 0) {
        // Everything the screen shows is frozen here, so a later edit to the
        // program or the exercise never rewrites this workout.
        const exerciseRows = prescribed.map(row => ({
          workoutSessionId: session.id,
          sourceTemplateExerciseId: row.id,
          exerciseId: row.exerciseId,
          exerciseNameSnapshot: row.name,
          measurementTypeSnapshot: row.measurementType,
          descriptionSnapshot: row.descriptionOverride ?? row.description,
          videoUrlSnapshot: row.videoUrlOverride ?? row.videoUrl,
          targetSetsSnapshot: row.targetSets,
          targetRepsSnapshot: row.targetReps,
          targetDurationSnapshot: row.targetDurationMinutes,
          targetDistanceSnapshot: row.targetDistance,
          targetInclineSnapshot: row.targetIncline,
          targetResistanceSnapshot: row.targetResistance,
          isPerSideSnapshot: row.isPerSide,
          displayOrder: row.displayOrder,
          status: "pending" as const,
        }));
        // Written in D1-sized statements rather than as one oversized insert.
        const created: (typeof workoutSessionExercises.$inferSelect)[] = [];
        for (const chunk of chunkForD1(exerciseRows)) {
          created.push(...await db.insert(workoutSessionExercises).values(chunk).returning());
        }

        // The weight and machine settings from last time, so the gym screen
        // opens with something sensible instead of empty boxes.
        const previous = await previousPerformance(
          db, owner, prescribed.map(row => row.exerciseId), session.id,
        );
        // Typed as insert rows, because a strength set and a cardio set carry
        // deliberately different fields.
        const setRows = created.flatMap((exercise): (typeof workoutSets.$inferInsert)[] => {
          const history = exercise.exerciseId === null ? undefined : previous.get(exercise.exerciseId);
          if (usesReps(exercise.measurementTypeSnapshot)) {
            const count = exercise.targetSetsSnapshot ?? 0;
            return Array.from({ length: count }, (_, index) => {
              const last = history?.sets.find(set => set.setNumber === index + 1) ?? null;
              return {
                workoutSessionExerciseId: exercise.id,
                setNumber: index + 1,
                setType: "working" as const,
                targetReps: exercise.targetRepsSnapshot,
                // Preloaded, not recorded: a set counts only once it is ticked.
                actualReps: exercise.targetRepsSnapshot,
                weight: last?.weight ?? history?.topWeight ?? null,
                weightUnit: "lb",
                completed: 0,
              };
            });
          }
          if (usesCardio(exercise.measurementTypeSnapshot)) {
            return [{
              workoutSessionExerciseId: exercise.id,
              setNumber: 1,
              setType: "working" as const,
              durationSeconds: exercise.targetDurationSnapshot === null ? null : Number(exercise.targetDurationSnapshot) * 60,
              incline: exercise.targetInclineSnapshot,
              resistanceLevel: exercise.targetResistanceSnapshot,
              distanceUnit: "mi",
              completed: 0,
            }];
          }
          // A class has nothing to prescribe. A set can still be added by hand
          // if there is something worth recording.
          return [];
        });
        for (const chunk of chunkForD1(setRows as Record<string, unknown>[])) {
          await db.insert(workoutSets).values(chunk as (typeof workoutSets.$inferInsert)[]);
        }
      }
    } catch (error) {
      // D1 has no interactive transaction, so a half-built session is cleaned
      // up rather than left behind for the user to trip over.
      const orphans = await db.select({ id: workoutSessionExercises.id }).from(workoutSessionExercises)
        .where(eq(workoutSessionExercises.workoutSessionId, session.id));
      if (orphans.length > 0) {
        await db.delete(workoutSets).where(inArray(workoutSets.workoutSessionExerciseId, orphans.map(row => row.id)));
        await db.delete(workoutSessionExercises).where(eq(workoutSessionExercises.workoutSessionId, session.id));
      }
      await db.delete(workoutSessions).where(and(eq(workoutSessions.id, session.id), eq(workoutSessions.owner, owner)));
      throw error;
    }

    const full = await loadSession(db, owner, session.id);
    return Response.json({ session: full, resumed: false }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start that workout";
    if (/unique/i.test(message)) {
      return Response.json({ error: "That workout is already in progress. Resume it instead." }, { status: 409 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * Saves, finishes, or abandons a workout.
 *
 * `complete` and `partial` both record a real finish; a workout is never
 * completed merely because it was started. Both write the linked diary entry,
 * and doing either twice updates the same entry.
 */
export async function PUT(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    if (!Number.isInteger(id)) return Response.json({ error: "A valid workout is required" }, { status: 400 });
    const action = String(payload.action ?? "save");
    if (!["save", "complete", "partial", "abandon"].includes(action)) {
      return Response.json({ error: "That workout action is not valid" }, { status: 400 });
    }

    const db = getDb();
    const owner = profileFrom(request);
    const current = await loadSession(db, owner, id);
    if (!current) return Response.json({ error: "That workout was not found" }, { status: 404 });

    const calories = optionalNumber(payload.caloriesBurned, { min: 0, max: MAX_ACTIVITY_CALORIES });
    if (!calories.ok) return Response.json({ error: `Calories burned must be between 0 and ${MAX_ACTIVITY_CALORIES}` }, { status: 400 });
    const duration = optionalNumber(payload.durationMinutes, { min: 0, max: MAX_ACTIVITY_MINUTES });
    if (!duration.ok) return Response.json({ error: `Duration must be between 0 and ${MAX_ACTIVITY_MINUTES} minutes` }, { status: 400 });
    const difficulty = optionalInteger(payload.perceivedDifficulty, { min: 1, max: 10 });
    if (!difficulty.ok) return Response.json({ error: "Perceived difficulty must be between 1 and 10" }, { status: 400 });
    const workoutDate = payload.workoutDate === undefined ? current.workoutDate : String(payload.workoutDate);
    if (!isDate(workoutDate)) return Response.json({ error: "A valid workout date is required" }, { status: 400 });

    const finishing = action === "complete" || action === "partial";
    const finishedAt = new Date().toISOString();
    const changes: Record<string, unknown> = { updatedAt: finishedAt, workoutDate };
    if (payload.notes !== undefined) changes.notes = cleanText(payload.notes, MAX_WORKOUT_NOTES) || null;
    if (payload.caloriesBurned !== undefined) changes.caloriesBurned = calories.value;
    if (payload.perceivedDifficulty !== undefined) changes.perceivedDifficulty = difficulty.value;
    if (duration.value !== null) changes.durationMinutes = duration.value;

    if (finishing) {
      changes.status = action === "complete" ? "completed" : "partial";
      // Re-finishing keeps the original completion time rather than moving it.
      changes.completedAt = current.completedAt ?? finishedAt;
      if (changes.durationMinutes === undefined && current.durationMinutes === null) {
        changes.durationMinutes = elapsedMinutes(current.startedAt, String(changes.completedAt));
      }
    }
    if (action === "abandon") {
      changes.status = "abandoned";
      changes.completedAt = null;
    }

    await db.update(workoutSessions).set(changes)
      .where(and(eq(workoutSessions.id, id), eq(workoutSessions.owner, owner)));
    const updated = await loadSession(db, owner, id);
    if (!updated) return Response.json({ error: "That workout was not found" }, { status: 404 });

    if (action === "abandon") {
      // An abandoned workout should not go on counting as movement for the day.
      await removeDiaryEntry(db, owner, current.linkedActivityEntryId);
      await db.update(workoutSessions).set({ linkedActivityEntryId: null })
        .where(and(eq(workoutSessions.id, id), eq(workoutSessions.owner, owner)));
      return Response.json({ session: { ...updated, linkedActivityEntryId: null } });
    }

    // The diary is written when the workout finishes, and refreshed on any
    // later edit of one that already has an entry.
    if (finishing || updated.linkedActivityEntryId !== null) {
      const entryId = await syncDiaryEntry(db, owner, {
        sessionId: updated.id,
        linkedActivityEntryId: updated.linkedActivityEntryId,
        exercisedOn: updated.workoutDate,
        activity: diaryActivityName(updated),
        minutes: updated.durationMinutes ?? elapsedMinutes(updated.startedAt, updated.completedAt ?? finishedAt),
        calories: updated.caloriesBurned ?? 0,
        comments: buildDiarySummary(updated),
      });
      if (entryId !== updated.linkedActivityEntryId) {
        await db.update(workoutSessions).set({ linkedActivityEntryId: entryId })
          .where(and(eq(workoutSessions.id, id), eq(workoutSessions.owner, owner)));
      }
      // The day now holds activity, so it gets the same calorie-goal stamp any
      // other entry would give it.
      await stampDailyGoal(db, owner, updated.workoutDate);
      return Response.json({ session: { ...updated, linkedActivityEntryId: entryId } });
    }

    return Response.json({ session: updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save that workout" }, { status: 500 });
  }
}

/** Removes a workout and the diary entry it created. */
export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) return Response.json({ error: "A valid workout is required" }, { status: 400 });
    const db = getDb();
    const owner = profileFrom(request);
    const session = await loadSession(db, owner, id);
    if (!session) return Response.json({ error: "That workout was not found" }, { status: 404 });

    await removeDiaryEntry(db, owner, session.linkedActivityEntryId);
    const exerciseIds = session.exercises.map(exercise => exercise.id);
    if (exerciseIds.length > 0) {
      await db.delete(workoutSets).where(inArray(workoutSets.workoutSessionExerciseId, exerciseIds));
      await db.delete(workoutSessionExercises).where(eq(workoutSessionExercises.workoutSessionId, id));
    }
    await db.delete(workoutSessions).where(and(eq(workoutSessions.id, id), eq(workoutSessions.owner, owner)));
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to remove that workout" }, { status: 500 });
  }
}
