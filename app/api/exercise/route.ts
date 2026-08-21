import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { exerciseEntries } from "../../../db/schema";
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

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const exercisedOn = String(payload.exercisedOn ?? "");
    const activity = String(payload.activity ?? "").trim();
    const minutes = Number(payload.minutes);
    const calories = Number(payload.calories ?? 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exercisedOn) || !activity || activity.length > 100 || !Number.isFinite(minutes) || minutes <= 0 || minutes > 1440 || !Number.isFinite(calories) || calories < 0 || calories > 10000) {
      return Response.json({ error: "Enter an activity, valid minutes, and optional calories burned" }, { status: 400 });
    }
    const db = getDb(); const owner = profileFrom(request);
    const [entry] = await db.insert(exerciseEntries).values({ owner, exercisedOn, activity, minutes, calories }).returning();
    await stampDailyGoal(db, owner, exercisedOn);
    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to add exercise" }, { status: 500 });
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
