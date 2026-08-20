import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { nutritionGoals } from "../../../db/schema";

const ownerFrom = (request: Request) => request.headers.get("oai-authenticated-user-email") ?? "site-owner";

export async function PUT(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const goals = { calories: Number(payload.calories), protein: Number(payload.protein), fat: Number(payload.fat), netCarbs: Number(payload.netCarbs) };
    if (Object.values(goals).some(value => !Number.isFinite(value) || value <= 0)) return Response.json({ error: "Every goal must be greater than zero" }, { status: 400 });
    const db = getDb(); const owner = ownerFrom(request);
    const existing = await db.select({ id: nutritionGoals.id }).from(nutritionGoals).where(eq(nutritionGoals.owner, owner)).limit(1);
    if (existing[0]) await db.update(nutritionGoals).set({ ...goals, updatedAt: new Date().toISOString() }).where(eq(nutritionGoals.owner, owner));
    else await db.insert(nutritionGoals).values({ owner, ...goals });
    return Response.json({ goals });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to save goals" }, { status: 500 }); }
}
