/**
 * Daily journal for one profile: one entry per day, written by hand.
 *
 * `GET` without a date returns the recent entries for the list view; with a
 * date it returns just that day. `PUT` writes the day, creating it the first
 * time and replacing it afterwards, so the client never has to know which.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { journalEntries } from "../../../db/schema";
import { profileFrom } from "../profile";

const MAX_BODY = 8000;
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export async function GET(request: Request) {
  try {
    const date = new URL(request.url).searchParams.get("date");
    const owner = profileFrom(request);
    if (date !== null) {
      if (!isDate(date)) return Response.json({ error: "A valid date is required" }, { status: 400 });
      const [entry] = await getDb().select().from(journalEntries)
        .where(and(eq(journalEntries.owner, owner), eq(journalEntries.entryOn, date))).limit(1);
      return Response.json({ entry: entry ?? null });
    }
    const entries = await getDb().select().from(journalEntries)
      .where(eq(journalEntries.owner, owner))
      .orderBy(desc(journalEntries.entryOn))
      .limit(200);
    return Response.json({ entries });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load your journal" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const entryOn = String(payload.entryOn ?? "");
    const body = String(payload.body ?? "").trim();
    if (!isDate(entryOn)) return Response.json({ error: "A valid date is required" }, { status: 400 });
    if (!body) return Response.json({ error: "Write something first, then save the day." }, { status: 400 });
    if (body.length > MAX_BODY) return Response.json({ error: `Keep the entry under ${MAX_BODY} characters.` }, { status: 400 });

    const owner = profileFrom(request);
    const now = new Date().toISOString();
    const [entry] = await getDb().insert(journalEntries)
      .values({ owner, entryOn, body, source: "manual" })
      .onConflictDoUpdate({
        target: [journalEntries.owner, journalEntries.entryOn],
        set: { body, source: "manual", updatedAt: now },
      })
      .returning();
    return Response.json({ entry });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save that journal entry" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) return Response.json({ error: "A valid journal entry is required" }, { status: 400 });
    await getDb().delete(journalEntries)
      .where(and(eq(journalEntries.id, id), eq(journalEntries.owner, profileFrom(request))));
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to remove that journal entry" }, { status: 500 });
  }
}
