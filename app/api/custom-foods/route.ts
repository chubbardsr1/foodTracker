import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { customFoods } from "../../../db/schema";
import { profileFrom } from "../profile";

const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : NaN;

export async function GET(request: Request) {
  try {
    const foods = await getDb().select().from(customFoods)
      .where(eq(customFoods.owner, profileFrom(request)))
      .orderBy(asc(customFoods.name))
      .limit(100);
    return Response.json({ foods });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load custom foods" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = numberValue(payload.id);
    const name = String(payload.name ?? "").trim();
    const serving = String(payload.serving ?? "").trim();
    const nutrition = { calories: numberValue(payload.calories), protein: numberValue(payload.protein), fat: numberValue(payload.fat), carbs: numberValue(payload.carbs), fiber: numberValue(payload.fiber) };
    if (!Number.isInteger(id) || !name || !serving || Object.values(nutrition).some(value => !Number.isFinite(value) || value < 0)) return Response.json({ error: "Please complete every field with a valid value" }, { status: 400 });
    const [food] = await getDb().update(customFoods).set({ name, serving, ...nutrition })
      .where(and(eq(customFoods.id, id), eq(customFoods.owner, profileFrom(request))))
      .returning();
    if (!food) return Response.json({ error: "Saved food was not found" }, { status: 404 });
    return Response.json({ food });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update saved food" }, { status: 500 });
  }
}
