/**
 * Weight log for one profile.
 *
 * A day holds at most one reading, so re-weighing on the same date corrects
 * that day instead of adding a second row. Every read, update, and delete is
 * scoped by owner.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { weightEntries } from "../../../db/schema";
import { profileFrom } from "../profile";

const MAX_POUNDS = 1500;
const MAX_NOTE = 240;
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Positive, believable, and no more than two decimal places. */
function validPounds(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_POUNDS) return null;
  return Math.round(parsed * 100) / 100;
}

const cleanNote = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE);

export async function GET(request: Request) {
  try {
    const entries = await getDb().select().from(weightEntries)
      .where(eq(weightEntries.owner, profileFrom(request)))
      .orderBy(desc(weightEntries.weighedOn))
      .limit(400);
    return Response.json({ entries });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load your weight log" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const weighedOn = String(payload.weighedOn ?? "");
    const pounds = validPounds(payload.pounds);
    if (!isDate(weighedOn)) return Response.json({ error: "A valid date is required" }, { status: 400 });
    if (pounds === null) return Response.json({ error: `Enter a weight between 0.01 and ${MAX_POUNDS} pounds` }, { status: 400 });

    const owner = profileFrom(request);
    const [existing] = await getDb().select({ id: weightEntries.id }).from(weightEntries)
      .where(and(eq(weightEntries.owner, owner), eq(weightEntries.weighedOn, weighedOn))).limit(1);
    if (existing) return Response.json({ error: "A weight is already logged for that date. Edit that entry instead." }, { status: 409 });

    const [entry] = await getDb().insert(weightEntries)
      .values({ owner, weighedOn, pounds, note: cleanNote(payload.note) }).returning();
    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save that weight" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    const weighedOn = String(payload.weighedOn ?? "");
    const pounds = validPounds(payload.pounds);
    if (!Number.isInteger(id)) return Response.json({ error: "A valid weight entry is required" }, { status: 400 });
    if (!isDate(weighedOn)) return Response.json({ error: "A valid date is required" }, { status: 400 });
    if (pounds === null) return Response.json({ error: `Enter a weight between 0.01 and ${MAX_POUNDS} pounds` }, { status: 400 });

    const owner = profileFrom(request);
    const [clash] = await getDb().select({ id: weightEntries.id }).from(weightEntries)
      .where(and(eq(weightEntries.owner, owner), eq(weightEntries.weighedOn, weighedOn))).limit(1);
    if (clash && clash.id !== id) return Response.json({ error: "Another entry already covers that date." }, { status: 409 });

    const [entry] = await getDb().update(weightEntries)
      .set({ weighedOn, pounds, note: cleanNote(payload.note), updatedAt: new Date().toISOString() })
      .where(and(eq(weightEntries.id, id), eq(weightEntries.owner, owner)))
      .returning();
    if (!entry) return Response.json({ error: "That weight entry was not found" }, { status: 404 });
    return Response.json({ entry });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update that weight" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) return Response.json({ error: "A valid weight entry is required" }, { status: 400 });
    await getDb().delete(weightEntries)
      .where(and(eq(weightEntries.id, id), eq(weightEntries.owner, profileFrom(request))));
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to remove that weight" }, { status: 500 });
  }
}
