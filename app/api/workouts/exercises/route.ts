/**
 * One exercise inside a workout in progress: its status, its machine settings,
 * and its notes.
 *
 * The prescribed values are snapshots and are never edited here — changing what
 * a past workout says it prescribed is exactly what the snapshots exist to
 * prevent. Ownership is resolved through the session, so an id belonging to
 * the other profile simply does not resolve.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { workoutSessionExercises } from "../../../../db/schema";
import { profileFrom } from "../../profile";
import { MAX_MACHINE_SETTINGS, MAX_WORKOUT_NOTES, sessionExerciseStatuses } from "../../../workout-shared";
import { cleanText, findSessionExercise } from "../store";

export async function PUT(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    if (!Number.isInteger(id)) return Response.json({ error: "A valid exercise is required" }, { status: 400 });

    const db = getDb();
    const owner = profileFrom(request);
    const found = await findSessionExercise(db, owner, id);
    if (!found) return Response.json({ error: "That exercise was not found" }, { status: 404 });

    const changes: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (payload.status !== undefined) {
      const status = String(payload.status);
      if (!sessionExerciseStatuses.includes(status as typeof sessionExerciseStatuses[number])) {
        return Response.json({ error: "That exercise status is not valid" }, { status: 400 });
      }
      changes.status = status;
    }
    // A blank field clears the note rather than storing an empty string that
    // reads like a recorded value.
    if (payload.machineSettings !== undefined) changes.machineSettings = cleanText(payload.machineSettings, MAX_MACHINE_SETTINGS) || null;
    if (payload.equipmentNotes !== undefined) changes.equipmentNotes = cleanText(payload.equipmentNotes, MAX_MACHINE_SETTINGS) || null;
    if (payload.exerciseNotes !== undefined) changes.exerciseNotes = cleanText(payload.exerciseNotes, MAX_WORKOUT_NOTES) || null;

    const [exercise] = await db.update(workoutSessionExercises).set(changes)
      .where(eq(workoutSessionExercises.id, id))
      .returning();
    return Response.json({ exercise });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save that exercise" }, { status: 500 });
  }
}
