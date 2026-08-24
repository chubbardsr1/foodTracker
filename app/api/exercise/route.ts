import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { exerciseEntries } from "../../../db/schema";
import {
  MAX_ACTIVITY_CALORIES, MAX_ACTIVITY_COMMENTS, MAX_ACTIVITY_MINUTES,
  MAX_ACTIVITY_NAME, cleanComments,
} from "../activity";
import { stampDailyGoal } from "../daily-goal";
import { profileFrom } from "../profile";

export async function GET(request: Request) {
  try {
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "A valid date is required" }, { status: 400 });
    const entries = await getDb().select().from(exerciseEntries)
      .where(and(eq(exerciseEntries.owner, profileFrom(request)), eq(exerciseEntries.exercisedOn, date)))
      .orderBy(asc(exerciseEntries.id));
    return Response.json({ entries });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load exercise" }, { status: 500 });
  }
}

/** Shared shape check for the create and update forms. */
function invalidFields(activity: string, minutes: number, calories: number) {
  return !activity || activity.length > MAX_ACTIVITY_NAME
    || !Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_ACTIVITY_MINUTES
    || !Number.isFinite(calories) || calories < 0 || calories > MAX_ACTIVITY_CALORIES;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const exercisedOn = String(payload.exercisedOn ?? "");
    const activity = String(payload.activity ?? "").trim();
    const minutes = Number(payload.minutes);
    const calories = Number(payload.calories ?? 0);
    const rawComments = String(payload.comments ?? "");
    if (rawComments.trim().length > MAX_ACTIVITY_COMMENTS) {
      return Response.json({ error: `Keep the comments to ${MAX_ACTIVITY_COMMENTS} characters or fewer` }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exercisedOn) || invalidFields(activity, minutes, calories)) {
      return Response.json({ error: "Enter an activity, valid minutes, and optional calories burned" }, { status: 400 });
    }
    const db = getDb(); const owner = profileFrom(request);
    const [entry] = await db.insert(exerciseEntries)
      .values({ owner, exercisedOn, activity, minutes, calories, comments: cleanComments(rawComments) })
      .returning();
    await stampDailyGoal(db, owner, exercisedOn);
    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to add exercise" }, { status: 500 });
  }
}

/**
 * Corrects one activity entry.
 *
 * `comments` is only touched when the field is actually sent, so an edit that
 * changes the minutes can never blank out notes it never carried. The date and
 * the owner are never changed here.
 */
export async function PUT(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    const activity = String(payload.activity ?? "").trim();
    const minutes = Number(payload.minutes);
    const calories = Number(payload.calories ?? 0);
    if (!Number.isInteger(id)) return Response.json({ error: "A valid exercise entry is required" }, { status: 400 });
    if (invalidFields(activity, minutes, calories)) {
      return Response.json({ error: "Enter an activity, valid minutes, and optional calories burned" }, { status: 400 });
    }
    const changes: { activity: string; minutes: number; calories: number; comments?: string } = { activity, minutes, calories };
    if (payload.comments !== undefined) {
      const rawComments = String(payload.comments ?? "");
      if (rawComments.trim().length > MAX_ACTIVITY_COMMENTS) {
        return Response.json({ error: `Keep the comments to ${MAX_ACTIVITY_COMMENTS} characters or fewer` }, { status: 400 });
      }
      changes.comments = cleanComments(rawComments);
    }

    const [entry] = await getDb().update(exerciseEntries).set(changes)
      .where(and(eq(exerciseEntries.id, id), eq(exerciseEntries.owner, profileFrom(request))))
      .returning();
    if (!entry) return Response.json({ error: "That exercise entry was not found" }, { status: 404 });
    return Response.json({ entry });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update exercise" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) return Response.json({ error: "A valid exercise entry is required" }, { status: 400 });
    await getDb().delete(exerciseEntries).where(and(eq(exerciseEntries.id, id), eq(exerciseEntries.owner, profileFrom(request))));
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to remove exercise" }, { status: 500 });
  }
}
