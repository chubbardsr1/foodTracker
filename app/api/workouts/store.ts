/**
 * Database access shared by the workout routes.
 *
 * Everything here takes an `owner` and puts it in the condition, exactly like
 * the rest of the API: one profile can never read or change the other's
 * cycles, sessions, exercises, sets, or notes. Reads are batched so loading a
 * program or a whole session never runs a query per row.
 */
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { getDb } from "../../../db";
import {
  exerciseEntries, exerciseLibrary, workoutProgramCycles, workoutProgramWeeks, workoutPrograms,
  workoutSessionExercises, workoutSessions, workoutSets, workoutTemplateExercises, workoutTemplates,
} from "../../../db/schema";
import { workoutStatusFrom } from "../../workout-shared";

type Db = ReturnType<typeof getDb>;

export const isDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
export const roundTwo = (value: number) => Math.round(value * 100) / 100;

/**
 * An optional number from a request body.
 *
 * Blank, null, and undefined all mean "not recorded" and stay null — a missing
 * weight is never stored as a zero. Anything else must be a real number inside
 * the range, so a negative or a stray word is refused rather than coerced.
 */
export function optionalNumber(value: unknown, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === null || value === undefined || value === "") return { ok: true as const, value: null };
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return { ok: false as const, value: null };
  return { ok: true as const, value: parsed };
}

/** The same, for whole numbers such as reps and set counts. */
export function optionalInteger(value: unknown, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const result = optionalNumber(value, { min, max });
  if (!result.ok) return result;
  if (result.value !== null && !Number.isInteger(result.value)) return { ok: false as const, value: null };
  return result;
}

export function cleanText(value: unknown, limit: number) {
  const text = String(value ?? "").replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").trim();
  return text.slice(0, limit);
}

/**
 * D1 refuses a statement carrying more than 100 bound parameters.
 *
 * A snapshotted session exercise has around twenty columns, so a seven-exercise
 * workout written as one multi-row insert is well past that limit. Rows are
 * therefore written in statements small enough to be accepted, which is still
 * far fewer round trips than inserting one row at a time. Plain SQLite has no
 * such limit, which is why this only shows up against the real database.
 */
export const D1_MAX_BOUND_PARAMETERS = 100;

/** Splits rows into inserts that stay inside D1's parameter limit. */
export function chunkForD1<T extends Record<string, unknown>>(rows: T[]) {
  const columns = rows.reduce((widest, row) => Math.max(widest, Object.keys(row).length), 1);
  const perStatement = Math.max(1, Math.floor(D1_MAX_BOUND_PARAMETERS / columns));
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += perStatement) {
    chunks.push(rows.slice(index, index + perStatement));
  }
  return chunks;
}

/** The whole reusable program in four queries, never one per week or workout. */
export async function loadProgram(db: Db, programId: number) {
  const [program] = await db.select().from(workoutPrograms).where(eq(workoutPrograms.id, programId)).limit(1);
  if (!program) return null;

  const [weeks, templates, prescribed] = await Promise.all([
    db.select().from(workoutProgramWeeks)
      .where(eq(workoutProgramWeeks.programId, programId))
      .orderBy(asc(workoutProgramWeeks.weekNumber)),
    db.select().from(workoutTemplates)
      .where(and(eq(workoutTemplates.programId, programId), eq(workoutTemplates.isActive, 1)))
      .orderBy(asc(workoutTemplates.weekNumber), asc(workoutTemplates.workoutNumber)),
    db.select({
      id: workoutTemplateExercises.id,
      workoutTemplateId: workoutTemplateExercises.workoutTemplateId,
      exerciseId: workoutTemplateExercises.exerciseId,
      targetSets: workoutTemplateExercises.targetSets,
      targetReps: workoutTemplateExercises.targetReps,
      targetDurationMinutes: workoutTemplateExercises.targetDurationMinutes,
      targetDistance: workoutTemplateExercises.targetDistance,
      targetDistanceUnit: workoutTemplateExercises.targetDistanceUnit,
      targetIncline: workoutTemplateExercises.targetIncline,
      targetResistance: workoutTemplateExercises.targetResistance,
      suggestedStartingWeight: workoutTemplateExercises.suggestedStartingWeight,
      weightUnit: workoutTemplateExercises.weightUnit,
      restSeconds: workoutTemplateExercises.restSeconds,
      isPerSide: workoutTemplateExercises.isPerSide,
      isOptional: workoutTemplateExercises.isOptional,
      instructions: workoutTemplateExercises.instructions,
      displayOrder: workoutTemplateExercises.displayOrder,
      // The override wins where a workout genuinely prescribes something
      // different; otherwise the exercise's own definition is shown.
      descriptionOverride: workoutTemplateExercises.descriptionOverride,
      videoUrlOverride: workoutTemplateExercises.videoUrlOverride,
      name: exerciseLibrary.name,
      measurementType: exerciseLibrary.measurementType,
      description: exerciseLibrary.description,
      videoUrl: exerciseLibrary.videoUrl,
      equipmentType: exerciseLibrary.equipmentType,
      primaryMuscleGroup: exerciseLibrary.primaryMuscleGroup,
    }).from(workoutTemplateExercises)
      .innerJoin(workoutTemplates, eq(workoutTemplateExercises.workoutTemplateId, workoutTemplates.id))
      .innerJoin(exerciseLibrary, eq(workoutTemplateExercises.exerciseId, exerciseLibrary.id))
      .where(eq(workoutTemplates.programId, programId))
      .orderBy(asc(workoutTemplateExercises.workoutTemplateId), asc(workoutTemplateExercises.displayOrder)),
  ]);

  const byTemplate = new Map<number, typeof prescribed>();
  for (const row of prescribed) {
    const list = byTemplate.get(row.workoutTemplateId) ?? [];
    list.push(row);
    byTemplate.set(row.workoutTemplateId, list);
  }

  return {
    ...program,
    weeks: weeks.map(week => ({
      ...week,
      templates: templates.filter(template => template.weekNumber === week.weekNumber).map(template => ({
        ...template,
        exercises: (byTemplate.get(template.id) ?? []).map(row => ({
          ...row,
          description: row.descriptionOverride ?? row.description,
          videoUrl: row.videoUrlOverride ?? row.videoUrl,
        })),
      })),
    })),
  };
}

export async function findProgramBySlug(db: Db, slug: string) {
  const [row] = await db.select().from(workoutPrograms).where(eq(workoutPrograms.slug, slug)).limit(1);
  return row ?? null;
}

/** One profile's cycles of a program, oldest first. */
export async function loadCycles(db: Db, owner: string, programId: number) {
  return db.select().from(workoutProgramCycles)
    .where(and(eq(workoutProgramCycles.owner, owner), eq(workoutProgramCycles.programId, programId)))
    .orderBy(asc(workoutProgramCycles.cycleNumber));
}

export async function findCycle(db: Db, owner: string, cycleId: number) {
  const [row] = await db.select().from(workoutProgramCycles)
    .where(and(eq(workoutProgramCycles.id, cycleId), eq(workoutProgramCycles.owner, owner))).limit(1);
  return row ?? null;
}

export type TemplateProgress = {
  status: ReturnType<typeof workoutStatusFrom>;
  activeSessionId: number | null;
  sessions: { id: number; status: string; workoutDate: string; completedAt: string | null }[];
};

/**
 * Every workout's status inside one cycle, from that cycle's sessions only.
 *
 * Statuses therefore start fresh for a new cycle without anything being copied
 * or reset, and a late session recorded against Cycle 1 can never complete the
 * matching workout in Cycle 2.
 */
export async function cycleProgress(db: Db, owner: string, cycleId: number) {
  const rows = await db.select({
    id: workoutSessions.id,
    templateId: workoutSessions.workoutTemplateId,
    status: workoutSessions.status,
    workoutDate: workoutSessions.workoutDate,
    completedAt: workoutSessions.completedAt,
  }).from(workoutSessions)
    .where(and(eq(workoutSessions.owner, owner), eq(workoutSessions.programCycleId, cycleId)))
    .orderBy(asc(workoutSessions.workoutDate), asc(workoutSessions.id));

  const progress = new Map<number, TemplateProgress>();
  for (const row of rows) {
    if (row.templateId === null) continue;
    const entry = progress.get(row.templateId) ?? { status: "not_started" as const, activeSessionId: null, sessions: [] };
    entry.sessions.push({ id: row.id, status: row.status, workoutDate: row.workoutDate, completedAt: row.completedAt });
    if (row.status === "in_progress") entry.activeSessionId = row.id;
    entry.status = workoutStatusFrom(entry.sessions.map(session => session.status));
    progress.set(row.templateId, entry);
  }
  return progress;
}

/** One session with its snapshotted exercises and every set, in three queries. */
export async function loadSession(db: Db, owner: string, sessionId: number) {
  const [session] = await db.select().from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.owner, owner))).limit(1);
  if (!session) return null;

  const exercises = await db.select().from(workoutSessionExercises)
    .where(eq(workoutSessionExercises.workoutSessionId, sessionId))
    .orderBy(asc(workoutSessionExercises.displayOrder));
  const exerciseIds = exercises.map(exercise => exercise.id);
  const sets = exerciseIds.length === 0 ? [] : await db.select().from(workoutSets)
    .where(inArray(workoutSets.workoutSessionExerciseId, exerciseIds))
    .orderBy(asc(workoutSets.workoutSessionExerciseId), asc(workoutSets.setNumber));

  const setsByExercise = new Map<number, typeof sets>();
  for (const set of sets) {
    const list = setsByExercise.get(set.workoutSessionExerciseId) ?? [];
    list.push(set);
    setsByExercise.set(set.workoutSessionExerciseId, list);
  }
  return {
    ...session,
    exercises: exercises.map(exercise => ({ ...exercise, sets: setsByExercise.get(exercise.id) ?? [] })),
  };
}

export type PreviousPerformance = {
  sessionId: number;
  workoutDate: string;
  machineSettings: string | null;
  equipmentNotes: string | null;
  topWeight: number | null;
  bestWeight: number | null;
  sets: {
    setNumber: number; setType: string; actualReps: number | null; weight: number | null;
    weightUnit: string; durationSeconds: number | null; distance: number | null;
    incline: number | null; resistanceLevel: number | null; completed: number;
  }[];
};

/**
 * How each of these exercises went last time, and the best weight ever lifted.
 *
 * The search is never limited to one cycle: starting Cycle 2 still shows what
 * was done in Cycle 1. Completion statuses reset with a new cycle, performance
 * history does not.
 */
export async function previousPerformance(
  db: Db, owner: string, exerciseIds: number[], excludeSessionId: number | null,
): Promise<Map<number, PreviousPerformance>> {
  const result = new Map<number, PreviousPerformance>();
  const ids = exerciseIds.filter((id): id is number => Number.isInteger(id));
  if (ids.length === 0) return result;

  const candidates = await db.select({
    sessionExerciseId: workoutSessionExercises.id,
    exerciseId: workoutSessionExercises.exerciseId,
    machineSettings: workoutSessionExercises.machineSettings,
    equipmentNotes: workoutSessionExercises.equipmentNotes,
    sessionId: workoutSessions.id,
    workoutDate: workoutSessions.workoutDate,
  }).from(workoutSessionExercises)
    .innerJoin(workoutSessions, eq(workoutSessionExercises.workoutSessionId, workoutSessions.id))
    .where(and(
      eq(workoutSessions.owner, owner),
      inArray(workoutSessionExercises.exerciseId, ids),
      inArray(workoutSessions.status, ["completed", "partial"]),
      inArray(workoutSessionExercises.status, ["completed", "partial"]),
      excludeSessionId === null ? undefined : ne(workoutSessions.id, excludeSessionId),
    ))
    .orderBy(desc(workoutSessions.workoutDate), desc(workoutSessions.id));

  const chosen = new Map<number, typeof candidates[number]>();
  for (const row of candidates) {
    if (row.exerciseId === null || chosen.has(row.exerciseId)) continue;
    chosen.set(row.exerciseId, row);
  }
  if (chosen.size === 0) return result;

  const [sets, bests] = await Promise.all([
    db.select().from(workoutSets)
      .where(inArray(workoutSets.workoutSessionExerciseId, [...chosen.values()].map(row => row.sessionExerciseId)))
      .orderBy(asc(workoutSets.setNumber)),
    // The heaviest completed working set ever recorded for each exercise, for
    // the simple personal-best marker.
    db.select({
      exerciseId: workoutSessionExercises.exerciseId,
      best: sql<number | null>`max(${workoutSets.weight})`,
    }).from(workoutSets)
      .innerJoin(workoutSessionExercises, eq(workoutSets.workoutSessionExerciseId, workoutSessionExercises.id))
      .innerJoin(workoutSessions, eq(workoutSessionExercises.workoutSessionId, workoutSessions.id))
      .where(and(
        eq(workoutSessions.owner, owner),
        inArray(workoutSessionExercises.exerciseId, ids),
        eq(workoutSets.completed, 1),
        eq(workoutSets.setType, "working"),
      ))
      .groupBy(workoutSessionExercises.exerciseId),
  ]);

  const bestByExercise = new Map(bests.map(row => [row.exerciseId, row.best === null ? null : Number(row.best)]));
  for (const [exerciseId, row] of chosen) {
    const own = sets.filter(set => set.workoutSessionExerciseId === row.sessionExerciseId);
    const weights = own.filter(set => set.completed === 1 && set.weight !== null).map(set => Number(set.weight));
    result.set(exerciseId, {
      sessionId: row.sessionId,
      workoutDate: row.workoutDate,
      machineSettings: row.machineSettings,
      equipmentNotes: row.equipmentNotes,
      topWeight: weights.length > 0 ? Math.max(...weights) : null,
      bestWeight: bestByExercise.get(exerciseId) ?? null,
      sets: own.map(set => ({
        setNumber: set.setNumber, setType: set.setType, actualReps: set.actualReps,
        weight: set.weight, weightUnit: set.weightUnit, durationSeconds: set.durationSeconds,
        distance: set.distance, incline: set.incline, resistanceLevel: set.resistanceLevel,
        completed: set.completed,
      })),
    });
  }
  return result;
}

/**
 * Writes this workout's one line in the daily activity diary.
 *
 * The session remembers the entry it created, so completing again, correcting
 * the duration, or switching between Completed and Partial all update that
 * same row. Nothing here ever adds a second entry, and the detailed set data
 * stays in the workout module rather than being duplicated into the diary.
 *
 * Calories are whatever the user entered and stay informational, exactly like
 * every other activity entry: they never change the food-calorie allowance.
 */
export async function syncDiaryEntry(db: Db, owner: string, input: {
  sessionId: number;
  linkedActivityEntryId: number | null;
  exercisedOn: string;
  activity: string;
  minutes: number;
  calories: number;
  comments: string;
}) {
  const values = {
    exercisedOn: input.exercisedOn,
    activity: input.activity.slice(0, 100),
    // The diary requires positive minutes, so a workout finished in under a
    // minute still reports one rather than failing to appear at all.
    minutes: Math.max(1, roundTwo(input.minutes)),
    calories: Math.max(0, roundTwo(input.calories)),
    comments: input.comments,
  };

  if (input.linkedActivityEntryId !== null) {
    const [updated] = await db.update(exerciseEntries).set(values)
      .where(and(eq(exerciseEntries.id, input.linkedActivityEntryId), eq(exerciseEntries.owner, owner)))
      .returning({ id: exerciseEntries.id });
    if (updated) return updated.id;
    // The linked entry was deleted from the diary by hand. A new one is written
    // and relinked rather than leaving the finished workout unrecorded.
  }
  const [created] = await db.insert(exerciseEntries).values({ owner, ...values }).returning({ id: exerciseEntries.id });
  return created?.id ?? null;
}

/** Removes the diary entry a session created, used when a session is deleted. */
export async function removeDiaryEntry(db: Db, owner: string, entryId: number | null) {
  if (entryId === null) return;
  await db.delete(exerciseEntries)
    .where(and(eq(exerciseEntries.id, entryId), eq(exerciseEntries.owner, owner)));
}

/** Cycles of the same program whose scheduled range overlaps the proposed one. */
export async function overlappingCycles(
  db: Db, owner: string, programId: number, startDate: string, endDate: string, ignoreCycleId: number | null,
) {
  const rows = await db.select().from(workoutProgramCycles)
    .where(and(
      eq(workoutProgramCycles.owner, owner),
      eq(workoutProgramCycles.programId, programId),
      ne(workoutProgramCycles.status, "archived"),
      ignoreCycleId === null ? undefined : ne(workoutProgramCycles.id, ignoreCycleId),
    ));
  return rows.filter(cycle => cycle.startDate <= endDate && cycle.scheduledEndDate >= startDate);
}

/** Sessions that are still in progress anywhere, so Resume can be offered. */
export async function activeSessions(db: Db, owner: string) {
  return db.select().from(workoutSessions)
    .where(and(eq(workoutSessions.owner, owner), eq(workoutSessions.status, "in_progress")))
    .orderBy(desc(workoutSessions.startedAt));
}

/** Exercise definitions the tracker knows about, shared ones plus this profile's. */
export async function loadExerciseLibrary(db: Db, owner: string) {
  return db.select().from(exerciseLibrary)
    .where(and(
      eq(exerciseLibrary.isActive, 1),
      or(isNull(exerciseLibrary.owner), eq(exerciseLibrary.owner, owner)),
    ))
    .orderBy(asc(exerciseLibrary.name));
}

/**
 * One snapshotted exercise from a session this profile owns.
 *
 * The owner check lives in the join, so an id belonging to the other profile
 * simply does not resolve rather than being trusted from the request.
 */
export async function findSessionExercise(db: Db, owner: string, id: number) {
  const [row] = await db.select({
    exercise: workoutSessionExercises,
    session: workoutSessions,
  }).from(workoutSessionExercises)
    .innerJoin(workoutSessions, eq(workoutSessionExercises.workoutSessionId, workoutSessions.id))
    .where(and(eq(workoutSessionExercises.id, id), eq(workoutSessions.owner, owner)))
    .limit(1);
  return row ?? null;
}

/** One set, resolved the same owner-checked way. */
export async function findSet(db: Db, owner: string, id: number) {
  const [row] = await db.select({
    set: workoutSets,
    exercise: workoutSessionExercises,
    session: workoutSessions,
  }).from(workoutSets)
    .innerJoin(workoutSessionExercises, eq(workoutSets.workoutSessionExerciseId, workoutSessionExercises.id))
    .innerJoin(workoutSessions, eq(workoutSessionExercises.workoutSessionId, workoutSessions.id))
    .where(and(eq(workoutSets.id, id), eq(workoutSessions.owner, owner)))
    .limit(1);
  return row ?? null;
}
