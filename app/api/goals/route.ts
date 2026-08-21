import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { nutritionGoals } from "../../../db/schema";
import { profileFrom } from "../profile";

// Water shortcut buttons accept fractional ounces, but never more precision
// than the two decimal places the rest of the tracker stores.
const MAX_WATER_OUNCES = 256;
function validShortcut(value: number) {
  return Number.isFinite(value) && value > 0 && value <= MAX_WATER_OUNCES && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const goals = { calories: Number(payload.calories), protein: Number(payload.protein), fat: Number(payload.fat), netCarbs: Number(payload.netCarbs), fiber: Number(payload.fiber), waterOunces: Number(payload.waterOunces) };
    if (Object.values(goals).some(value => !Number.isFinite(value) || value <= 0)) return Response.json({ error: "Every goal must be greater than zero" }, { status: 400 });
    const shortcuts = { waterShortcutOne: Number(payload.waterShortcutOne), waterShortcutTwo: Number(payload.waterShortcutTwo), waterShortcutThree: Number(payload.waterShortcutThree) };
    if (Object.values(shortcuts).some(value => !validShortcut(value))) return Response.json({ error: `Water shortcuts must be positive numbers up to ${MAX_WATER_OUNCES} with no more than two decimal places` }, { status: 400 });
    const saved = { ...goals, ...Object.fromEntries(Object.entries(shortcuts).map(([key, value]) => [key, Math.round(value * 100) / 100])) as typeof shortcuts };
    const db = getDb(); const owner = profileFrom(request);
    const existing = await db.select({ id: nutritionGoals.id }).from(nutritionGoals).where(eq(nutritionGoals.owner, owner)).limit(1);
    if (existing[0]) await db.update(nutritionGoals).set({ ...saved, updatedAt: new Date().toISOString() }).where(eq(nutritionGoals.owner, owner));
    else await db.insert(nutritionGoals).values({ owner, ...saved });
    return Response.json({ goals: saved });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to save goals" }, { status: 500 }); }
}
