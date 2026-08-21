import { and, eq } from "drizzle-orm";
import type { getDb } from "../../db";
import { dailyGoals, nutritionGoals } from "../../db/schema";

export const DEFAULT_CALORIE_GOAL = 1600;
/** Going over by more than this many calories is the worst band on the calendar. */
export const OVER_BUDGET_LIMIT = 500;

type Db = ReturnType<typeof getDb>;

/**
 * Freezes the owner's current calorie goal onto `day` the first time anything
 * is recorded for that day.
 *
 * Days that already carry a stamp are left untouched, so lowering the goal
 * later never changes how earlier days are judged. Stamping is best effort:
 * it must never stop the diary entry itself from being saved.
 */
export async function stampDailyGoal(db: Db, owner: string, day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  try {
    const [current] = await db.select({ calories: nutritionGoals.calories })
      .from(nutritionGoals).where(eq(nutritionGoals.owner, owner)).limit(1);
    await db.insert(dailyGoals)
      .values({ owner, goalOn: day, calories: current?.calories ?? DEFAULT_CALORIE_GOAL })
      .onConflictDoNothing();
  } catch { /* a missing stamp is recoverable; a failed entry is not */ }
}

/**
 * Keeps today's stamp in step with the live setting.
 *
 * Today is still in progress, so the Diary ring and the calendar should agree
 * on it. Earlier days are never touched here.
 */
export async function refreshTodayGoal(db: Db, owner: string, day: string, calories: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(calories) || calories <= 0) return;
  try {
    await db.update(dailyGoals).set({ calories: Math.round(calories), updatedAt: new Date().toISOString() })
      .where(and(eq(dailyGoals.owner, owner), eq(dailyGoals.goalOn, day)));
  } catch { /* best effort, same as stamping */ }
}
