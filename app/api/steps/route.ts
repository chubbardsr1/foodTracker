/**
 * Manually entered daily step count for one profile.
 *
 * A day holds a single total, so saving twice corrects the day instead of
 * adding a second row. `GET` takes either a single `date` or a `start`/`end`
 * range. Every read, write, and delete is scoped by owner.
 */
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { stepEntries } from "../../../db/schema";
import { stampDailyGoal } from "../daily-goal";
import { profileFrom } from "../profile";

/** Roughly twice the furthest anyone has walked in a day; anything above is a typo. */
export const MAX_STEPS = 200000;
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Whole steps only. A decimal, a negative, or a number beyond the cap is
 * rejected rather than rounded, so a mistyped entry is never silently stored.
 */
function validSteps(value: unknown) {
  if (typeof value === "string" && !/^\s*\d+\s*$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_STEPS) return null;
  return parsed;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const owner = profileFrom(request);
    const date = params.get("date");
    if (date !== null) {
      if (!isDate(date)) return Response.json({ error: "A valid date is required" }, { status: 400 });
      const [entry] = await getDb().select().from(stepEntries)
        .where(and(eq(stepEntries.owner, owner), eq(stepEntries.steppedOn, date))).limit(1);
      return Response.json({ entry: entry ?? null });
    }
    const start = params.get("start") ?? ""; const end = params.get("end") ?? "";
    if (!isDate(start) || !isDate(end)) return Response.json({ error: "A valid start and end date are required" }, { status: 400 });
    if (start > end) return Response.json({ error: "The start date must come before the end date" }, { status: 400 });
    const entries = await getDb().select().from(stepEntries)
      .where(and(eq(stepEntries.owner, owner), gte(stepEntries.steppedOn, start), lte(stepEntries.steppedOn, end)))
      .orderBy(asc(stepEntries.steppedOn));
    return Response.json({ entries });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load steps" }, { status: 500 });
  }
}

/** Writes the day, creating it the first time and replacing it afterwards. */
export async function PUT(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const steppedOn = String(payload.steppedOn ?? "");
    const steps = validSteps(payload.steps);
    if (!isDate(steppedOn)) return Response.json({ error: "A valid date is required" }, { status: 400 });
    if (steps === null) return Response.json({ error: `Enter whole steps between 0 and ${MAX_STEPS.toLocaleString("en-US")}` }, { status: 400 });

    const db = getDb(); const owner = profileFrom(request);
    const [entry] = await db.insert(stepEntries)
      .values({ owner, steppedOn, steps })
      .onConflictDoUpdate({
        target: [stepEntries.owner, stepEntries.steppedOn],
        set: { steps, updatedAt: new Date().toISOString() },
      })
      .returning();
    await stampDailyGoal(db, owner, steppedOn);
    return Response.json({ entry });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save those steps" }, { status: 500 });
  }
}

/** Removes the day's total. The day is the key, so no id is needed. */
export async function DELETE(request: Request) {
  try {
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!isDate(date)) return Response.json({ error: "A valid date is required" }, { status: 400 });
    await getDb().delete(stepEntries)
      .where(and(eq(stepEntries.owner, profileFrom(request)), eq(stepEntries.steppedOn, date)));
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to remove those steps" }, { status: 500 });
  }
}
