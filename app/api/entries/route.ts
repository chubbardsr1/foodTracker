import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { customFoods, foodEntries, nutritionGoals } from "../../../db/schema";
import { profileFrom } from "../profile";

const validMeals = new Set(["Breakfast", "Lunch", "Dinner", "Snacks"]);
const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : NaN;
const roundTwo = (value: number) => Math.round(value * 100) / 100;

export async function GET(request: Request) {
  try {
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "A valid date is required" }, { status: 400 });
    const db = getDb(); const owner = profileFrom(request);
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
    const servings = numberValue(payload.servings ?? 1);
    const baseNutrition = { calories: numberValue(payload.calories), protein: numberValue(payload.protein), fat: numberValue(payload.fat), carbs: numberValue(payload.carbs), fiber: numberValue(payload.fiber) };
    if (!name || !serving || !validMeals.has(meal) || !/^\d{4}-\d{2}-\d{2}$/.test(eatenOn) || !Number.isFinite(servings) || servings <= 0 || servings > 100 || Object.values(baseNutrition).some(value => !Number.isFinite(value) || value < 0)) return Response.json({ error: "Please complete every nutrition field with a valid value" }, { status: 400 });
    const nutrition = Object.fromEntries(Object.entries(baseNutrition).map(([key, value]) => [key, roundTwo(value * servings)])) as typeof baseNutrition;
    const entryServing = servings === 1 ? serving : `${roundTwo(servings)} × ${serving}`;
    const db = getDb();
    const owner = profileFrom(request);
    const [entry] = await db.insert(foodEntries).values({ owner, eatenOn, meal, name, serving: entryServing, ...nutrition }).returning();
    if (payload.saveCustom === true) {
      await db.insert(customFoods).values({ owner, name, serving, ...baseNutrition }).onConflictDoUpdate({
        target: [customFoods.owner, customFoods.name, customFoods.serving],
        set: baseNutrition,
      });
    }
    return Response.json({ entry }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to save food" }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) return Response.json({ error: "A valid entry is required" }, { status: 400 });
    await getDb().delete(foodEntries).where(and(eq(foodEntries.id, id), eq(foodEntries.owner, profileFrom(request))));
    return Response.json({ deleted: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to remove food" }, { status: 500 }); }
}
