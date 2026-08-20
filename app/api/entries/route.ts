import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { foodEntries, nutritionGoals } from "../../../db/schema";

const validMeals = new Set(["Breakfast", "Lunch", "Dinner", "Snacks"]);
const ownerFrom = (request: Request) => request.headers.get("oai-authenticated-user-email") ?? "site-owner";
const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : NaN;

export async function GET(request: Request) {
  try {
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "A valid date is required" }, { status: 400 });
    const db = getDb(); const owner = ownerFrom(request);
    const [entries, goalRows] = await Promise.all([
      db.select().from(foodEntries).where(and(eq(foodEntries.owner, owner), eq(foodEntries.eatenOn, date))).orderBy(asc(foodEntries.id)),
      db.select().from(nutritionGoals).where(eq(nutritionGoals.owner, owner)).limit(1),
    ]);
    return Response.json({ entries, goals: goalRows[0] ?? null });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to load entries" }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const name = String(payload.name ?? "").trim(); const serving = String(payload.serving ?? "").trim(); const meal = String(payload.meal ?? ""); const eatenOn = String(payload.eatenOn ?? "");
    const nutrition = { calories: numberValue(payload.calories), protein: numberValue(payload.protein), fat: numberValue(payload.fat), carbs: numberValue(payload.carbs), fiber: numberValue(payload.fiber) };
    if (!name || !serving || !validMeals.has(meal) || !/^\d{4}-\d{2}-\d{2}$/.test(eatenOn) || Object.values(nutrition).some(value => !Number.isFinite(value) || value < 0)) return Response.json({ error: "Please complete every nutrition field with a valid value" }, { status: 400 });
    const [entry] = await getDb().insert(foodEntries).values({ owner: ownerFrom(request), eatenOn, meal, name, serving, ...nutrition }).returning();
    return Response.json({ entry }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to save food" }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) return Response.json({ error: "A valid entry is required" }, { status: 400 });
    await getDb().delete(foodEntries).where(and(eq(foodEntries.id, id), eq(foodEntries.owner, ownerFrom(request))));
    return Response.json({ deleted: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to remove food" }, { status: 500 }); }
}
