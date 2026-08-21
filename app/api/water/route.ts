import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { waterEntries } from "../../../db/schema";
import { stampDailyGoal } from "../daily-goal";
import { profileFrom } from "../profile";

export async function GET(request: Request) {
  try {
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "A valid date is required" }, { status: 400 });
    const entries = await getDb().select().from(waterEntries)
      .where(and(eq(waterEntries.owner, profileFrom(request)), eq(waterEntries.drankOn, date)))
      .orderBy(asc(waterEntries.id));
    return Response.json({ entries });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load water" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { drankOn?: unknown; ounces?: unknown };
    const drankOn = String(payload.drankOn ?? "");
    const ounces = Number(payload.ounces);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(drankOn) || !Number.isFinite(ounces) || ounces <= 0 || ounces > 256) {
      return Response.json({ error: "Enter a valid amount between 1 and 256 ounces" }, { status: 400 });
    }
    const db = getDb(); const owner = profileFrom(request);
    const [entry] = await db.insert(waterEntries).values({ owner, drankOn, ounces }).returning();
    await stampDailyGoal(db, owner, drankOn);
    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to add water" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) return Response.json({ error: "A valid water entry is required" }, { status: 400 });
    await getDb().delete(waterEntries).where(and(eq(waterEntries.id, id), eq(waterEntries.owner, profileFrom(request))));
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to remove water" }, { status: 500 });
  }
}
