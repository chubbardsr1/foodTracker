/**
 * Month view of calories eaten against the calorie goal that applied on each
 * day, plus whether any movement was recorded.
 *
 * The goal comes from the stamp frozen onto that day. Days recorded before
 * stamping existed fall back to the owner's current goal and say so.
 */
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { dailyGoals, exerciseEntries, foodEntries, nutritionGoals } from "../../../db/schema";
import { DEFAULT_CALORIE_GOAL, OVER_BUDGET_LIMIT } from "../daily-goal";
import { profileFrom } from "../profile";

const roundTwo = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;

function monthRange(month: string) {
  const [year, index] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return {
    first: `${month}-01`,
    last: `${month}-${String(days).padStart(2, "0")}`,
    days,
  };
}

/** green when under, yellow when over, red when over by more than the limit. */
function statusFor(calories: number, goal: number, hasFood: boolean) {
  if (!hasFood) return "none";
  if (calories <= goal) return "under";
  return calories - goal > OVER_BUDGET_LIMIT ? "way-over" : "over";
}

export async function GET(request: Request) {
  try {
    const month = new URL(request.url).searchParams.get("month") ?? "";
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return Response.json({ error: "A valid month is required" }, { status: 400 });
    }
    const { first, last, days: dayCount } = monthRange(month);
    const db = getDb(); const owner = profileFrom(request);

    const [foodRows, exerciseRows, stamps, currentRows] = await Promise.all([
      db.select({
        date: foodEntries.eatenOn,
        calories: sql<number>`sum(${foodEntries.calories})`,
        items: sql<number>`count(*)`,
      }).from(foodEntries)
        .where(and(eq(foodEntries.owner, owner), gte(foodEntries.eatenOn, first), lte(foodEntries.eatenOn, last)))
        .groupBy(foodEntries.eatenOn),
      db.select({
        date: exerciseEntries.exercisedOn,
        minutes: sql<number>`sum(${exerciseEntries.minutes})`,
        calories: sql<number>`sum(${exerciseEntries.calories})`,
        sessions: sql<number>`count(*)`,
        activities: sql<string>`group_concat(${exerciseEntries.activity}, ', ')`,
      }).from(exerciseEntries)
        .where(and(eq(exerciseEntries.owner, owner), gte(exerciseEntries.exercisedOn, first), lte(exerciseEntries.exercisedOn, last)))
        .groupBy(exerciseEntries.exercisedOn),
      db.select({ date: dailyGoals.goalOn, calories: dailyGoals.calories }).from(dailyGoals)
        .where(and(eq(dailyGoals.owner, owner), gte(dailyGoals.goalOn, first), lte(dailyGoals.goalOn, last))),
      db.select({ calories: nutritionGoals.calories }).from(nutritionGoals).where(eq(nutritionGoals.owner, owner)).limit(1),
    ]);

    const currentGoal = currentRows[0]?.calories ?? DEFAULT_CALORIE_GOAL;
    const foodByDate = new Map(foodRows.map(row => [row.date, row]));
    const exerciseByDate = new Map(exerciseRows.map(row => [row.date, row]));
    const stampByDate = new Map(stamps.map(row => [row.date, row.calories]));

    const days = Array.from({ length: dayCount }, (_, index) => {
      const date = `${month}-${String(index + 1).padStart(2, "0")}`;
      const food = foodByDate.get(date); const movement = exerciseByDate.get(date);
      const calories = roundTwo(food?.calories ?? 0);
      const items = Number(food?.items ?? 0);
      const stamped = stampByDate.get(date);
      const goalCalories = stamped ?? currentGoal;
      const sessions = Number(movement?.sessions ?? 0);
      return {
        date,
        calories, items,
        goalCalories,
        goalSource: stamped === undefined ? "current" : "saved",
        remaining: roundTwo(goalCalories - calories),
        status: statusFor(calories, goalCalories, items > 0),
        exerciseMinutes: roundTwo(movement?.minutes ?? 0),
        exerciseCalories: roundTwo(movement?.calories ?? 0),
        sessions,
        activities: movement?.activities ?? "",
        hasMovement: sessions > 0,
        hasData: items > 0 || sessions > 0,
      };
    });

    return Response.json({ month, currentGoal, days });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load the calendar" }, { status: 500 });
  }
}

/** Corrects the stored goal for one day, for when a value was recorded wrong. */
export async function PUT(request: Request) {
  try {
    const payload = await request.json() as { date?: unknown; calories?: unknown };
    const date = String(payload.date ?? "");
    const calories = Number(payload.calories);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "A valid date is required" }, { status: 400 });
    if (!Number.isFinite(calories) || calories <= 0 || calories > 20000) {
      return Response.json({ error: "Enter a calorie goal between 1 and 20000" }, { status: 400 });
    }
    const rounded = Math.round(calories);
    const db = getDb(); const owner = profileFrom(request);
    const existing = await db.select({ id: dailyGoals.id }).from(dailyGoals)
      .where(and(eq(dailyGoals.owner, owner), eq(dailyGoals.goalOn, date))).limit(1);
    if (existing[0]) {
      await db.update(dailyGoals).set({ calories: rounded, updatedAt: new Date().toISOString() })
        .where(and(eq(dailyGoals.id, existing[0].id), eq(dailyGoals.owner, owner)));
    } else {
      await db.insert(dailyGoals).values({ owner, goalOn: date, calories: rounded });
    }
    return Response.json({ date, calories: rounded });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save that day's goal" }, { status: 500 });
  }
}
