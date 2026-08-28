/**
 * Individual sets inside a workout in progress.
 *
 * Every value is optional and every blank stays null: an unrecorded weight is
 * never stored as a zero, and a bodyweight or cardio set is never forced to
 * carry a field that does not apply to it. Zero is accepted where it has a
 * real meaning — zero reps completed, a flat incline — but a negative never is.
 *
 * Saving a set keeps its exercise's status in step, so ticking the last set
 * marks the exercise completed without a second tap. An exercise deliberately
 * marked skipped stays skipped.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { workoutSessionExercises, workoutSets } from "../../../../db/schema";
import { profileFrom } from "../../profile";
import {
  MAX_DISTANCE, MAX_INCLINE, MAX_RESISTANCE, MAX_SETS_PER_EXERCISE, MAX_SET_REPS,
  MAX_SET_WEIGHT, MAX_WORKOUT_MINUTES, MAX_WORKOUT_NOTES, setTypes, usesCardio, usesReps,
} from "../../../workout-shared";
import { cleanText, findSessionExercise, findSet, optionalInteger, optionalNumber } from "../store";

const MAX_DURATION_SECONDS = MAX_WORKOUT_MINUTES * 60;

/** Reads every set field a request may carry, refusing anything out of range. */
function readSetFields(payload: Record<string, unknown>) {
  const fields: Record<string, unknown> = {};
  const numbers: [string, unknown, { min?: number; max?: number }, boolean][] = [
    ["targetReps", payload.targetReps, { min: 0, max: MAX_SET_REPS }, true],
    ["actualReps", payload.actualReps, { min: 0, max: MAX_SET_REPS }, true],
    ["weight", payload.weight, { min: 0, max: MAX_SET_WEIGHT }, false],
    ["durationSeconds", payload.durationSeconds, { min: 0, max: MAX_DURATION_SECONDS }, false],
    ["distance", payload.distance, { min: 0, max: MAX_DISTANCE }, false],
    ["incline", payload.incline, { min: 0, max: MAX_INCLINE }, false],
    ["resistanceLevel", payload.resistanceLevel, { min: 0, max: MAX_RESISTANCE }, false],
    ["difficulty", payload.difficulty, { min: 1, max: 10 }, true],
    ["repsInReserve", payload.repsInReserve, { min: 0, max: 20 }, true],
  ];
  for (const [name, value, range, whole] of numbers) {
    if (value === undefined) continue;
    const parsed = whole ? optionalInteger(value, range) : optionalNumber(value, range);
    if (!parsed.ok) return { ok: false as const, field: name };
    fields[name] = parsed.value;
  }
  if (payload.setType !== undefined) {
    const setType = String(payload.setType);
    if (!setTypes.includes(setType as typeof setTypes[number])) return { ok: false as const, field: "setType" };
    fields.setType = setType;
  }
  if (payload.completed !== undefined) fields.completed = payload.completed === true || payload.completed === 1 ? 1 : 0;
  if (payload.weightUnit !== undefined) fields.weightUnit = String(payload.weightUnit) === "kg" ? "kg" : "lb";
  if (payload.distanceUnit !== undefined) {
    const unit = String(payload.distanceUnit);
    fields.distanceUnit = ["mi", "km", "m", "ft"].includes(unit) ? unit : null;
  }
  if (payload.notes !== undefined) fields.notes = cleanText(payload.notes, MAX_WORKOUT_NOTES) || null;
  return { ok: true as const, fields };
}

const fieldProblem = (field: string) =>
  `${field} is not a valid number. Leave a value blank when it does not apply, and never enter a negative.`;

/** Adds one more set to an exercise, prefilled from what it prescribes. */
export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const sessionExerciseId = Number(payload.sessionExerciseId);
    if (!Number.isInteger(sessionExerciseId)) return Response.json({ error: "A valid exercise is required" }, { status: 400 });

    const db = getDb();
    const owner = profileFrom(request);
    const found = await findSessionExercise(db, owner, sessionExerciseId);
    if (!found) return Response.json({ error: "That exercise was not found" }, { status: 404 });

    const [{ count, highest }] = await db.select({
      count: sql<number>`count(*)`,
      highest: sql<number | null>`max(${workoutSets.setNumber})`,
    }).from(workoutSets).where(eq(workoutSets.workoutSessionExerciseId, sessionExerciseId));
    if (Number(count) >= MAX_SETS_PER_EXERCISE) {
      return Response.json({ error: `That is already ${MAX_SETS_PER_EXERCISE} sets. Check the numbers before adding more.` }, { status: 400 });
    }

    const measurement = found.exercise.measurementTypeSnapshot;
    const [created] = await db.insert(workoutSets).values({
      workoutSessionExerciseId: sessionExerciseId,
      setNumber: Number(highest ?? 0) + 1,
      setType: "working",
      targetReps: usesReps(measurement) ? found.exercise.targetRepsSnapshot : null,
      actualReps: usesReps(measurement) ? found.exercise.targetRepsSnapshot : null,
      incline: usesCardio(measurement) ? found.exercise.targetInclineSnapshot : null,
      distanceUnit: usesCardio(measurement) ? "mi" : null,
      weightUnit: "lb",
      completed: 0,
    }).returning();
    return Response.json({ set: created }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to add that set" }, { status: 500 });
  }
}

/** Saves one set. Called on every autosave, so it only writes what was sent. */
export async function PUT(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    if (!Number.isInteger(id)) return Response.json({ error: "A valid set is required" }, { status: 400 });

    const db = getDb();
    const owner = profileFrom(request);
    const found = await findSet(db, owner, id);
    if (!found) return Response.json({ error: "That set was not found" }, { status: 404 });

    const read = readSetFields(payload);
    if (!read.ok) return Response.json({ error: fieldProblem(read.field) }, { status: 400 });

    const [set] = await db.update(workoutSets)
      .set({ ...read.fields, updatedAt: new Date().toISOString() })
      .where(eq(workoutSets.id, id))
      .returning();

    const exerciseStatus = await refreshExerciseStatus(db, found.exercise.id, found.exercise.status);
    return Response.json({ set, exerciseStatus });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save that set" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) return Response.json({ error: "A valid set is required" }, { status: 400 });
    const db = getDb();
    const owner = profileFrom(request);
    const found = await findSet(db, owner, id);
    if (!found) return Response.json({ error: "That set was not found" }, { status: 404 });
    await db.delete(workoutSets).where(eq(workoutSets.id, id));
    const exerciseStatus = await refreshExerciseStatus(db, found.exercise.id, found.exercise.status);
    return Response.json({ deleted: true, exerciseStatus });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to remove that set" }, { status: 500 });
  }
}

/**
 * Keeps an exercise's status in step with its sets.
 *
 * Every set done means completed, some means partial, none means back to
 * pending. A skipped exercise is left alone, because that was a decision
 * rather than a side effect.
 */
async function refreshExerciseStatus(db: ReturnType<typeof getDb>, exerciseId: number, current: string) {
  if (current === "skipped") return current;
  const [counts] = await db.select({
    total: sql<number>`count(*)`,
    done: sql<number>`sum(case when ${workoutSets.completed} = 1 then 1 else 0 end)`,
  }).from(workoutSets).where(eq(workoutSets.workoutSessionExerciseId, exerciseId));

  const total = Number(counts?.total ?? 0);
  const done = Number(counts?.done ?? 0);
  const status = total > 0 && done === total ? "completed" : done > 0 ? "partial" : "pending";
  if (status === current) return current;
  await db.update(workoutSessionExercises)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(and(eq(workoutSessionExercises.id, exerciseId)));
  return status;
}
