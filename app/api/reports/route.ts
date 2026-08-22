import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { exerciseEntries, foodEntries, stepEntries } from "../../../db/schema";
import { profileFrom } from "../profile";

const MAX_DAYS = 366;
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const roundTwo = (value: number) => Math.round(Number(value ?? 0) * 100) / 100;

/** Every calendar date from `start` through `end`, so empty days still report zeros. */
function datesBetween(start: string, end: string) {
  const days: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last && days.length <= MAX_DAYS) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const start = params.get("start") ?? ""; const end = params.get("end") ?? "";
    if (!isDate(start) || !isDate(end)) return Response.json({ error: "A valid start and end date are required" }, { status: 400 });
    if (start > end) return Response.json({ error: "The start date must come before the end date" }, { status: 400 });
    const dates = datesBetween(start, end);
    if (dates.length > MAX_DAYS) return Response.json({ error: `Choose a range of ${MAX_DAYS} days or fewer` }, { status: 400 });

    const db = getDb(); const owner = profileFrom(request);
    const [foodRows, exerciseRows, stepRows] = await Promise.all([
      db.select({
        date: foodEntries.eatenOn,
        calories: sql<number>`sum(${foodEntries.calories})`,
        protein: sql<number>`sum(${foodEntries.protein})`,
        fat: sql<number>`sum(${foodEntries.fat})`,
        carbs: sql<number>`sum(${foodEntries.carbs})`,
        fiber: sql<number>`sum(${foodEntries.fiber})`,
        items: sql<number>`count(*)`,
      }).from(foodEntries)
        .where(and(eq(foodEntries.owner, owner), gte(foodEntries.eatenOn, start), lte(foodEntries.eatenOn, end)))
        .groupBy(foodEntries.eatenOn),
      db.select({
        date: exerciseEntries.exercisedOn,
        minutes: sql<number>`sum(${exerciseEntries.minutes})`,
        calories: sql<number>`sum(${exerciseEntries.calories})`,
        sessions: sql<number>`count(*)`,
        activities: sql<string>`group_concat(${exerciseEntries.activity}, ', ')`,
      }).from(exerciseEntries)
        .where(and(eq(exerciseEntries.owner, owner), gte(exerciseEntries.exercisedOn, start), lte(exerciseEntries.exercisedOn, end)))
        .groupBy(exerciseEntries.exercisedOn),
      db.select({ date: stepEntries.steppedOn, steps: stepEntries.steps }).from(stepEntries)
        .where(and(eq(stepEntries.owner, owner), gte(stepEntries.steppedOn, start), lte(stepEntries.steppedOn, end))),
    ]);

    const foodByDate = new Map(foodRows.map(row => [row.date, row]));
    const exerciseByDate = new Map(exerciseRows.map(row => [row.date, row]));
    // A day without a step entry reports null, so "not recorded" never reads as a zero-step day.
    const stepsByDate = new Map(stepRows.map(row => [row.date, row.steps]));
    const days = dates.map(date => {
      const food = foodByDate.get(date); const movement = exerciseByDate.get(date);
      const steps = stepsByDate.get(date);
      return {
        date,
        calories: roundTwo(food?.calories ?? 0), protein: roundTwo(food?.protein ?? 0), fat: roundTwo(food?.fat ?? 0),
        carbs: roundTwo(food?.carbs ?? 0), fiber: roundTwo(food?.fiber ?? 0),
        netCarbs: Math.max(0, roundTwo(Number(food?.carbs ?? 0) - Number(food?.fiber ?? 0))),
        items: Number(food?.items ?? 0),
        exerciseMinutes: roundTwo(movement?.minutes ?? 0), exerciseCalories: roundTwo(movement?.calories ?? 0),
        sessions: Number(movement?.sessions ?? 0), activities: movement?.activities ?? "",
        steps: steps === undefined ? null : Number(steps),
      };
    });

    const daysWithFood = days.filter(day => day.items > 0).length;
    const totals = {
      calories: roundTwo(days.reduce((sum, day) => sum + day.calories, 0)),
      exerciseMinutes: roundTwo(days.reduce((sum, day) => sum + day.exerciseMinutes, 0)),
      exerciseCalories: roundTwo(days.reduce((sum, day) => sum + day.exerciseCalories, 0)),
      sessions: days.reduce((sum, day) => sum + day.sessions, 0),
      steps: days.reduce((sum, day) => sum + (day.steps ?? 0), 0),
      daysInRange: days.length, daysWithFood, daysWithExercise: days.filter(day => day.sessions > 0).length,
      daysWithSteps: days.filter(day => day.steps !== null).length,
    };
    const averages = {
      caloriesPerDay: roundTwo(totals.calories / days.length),
      caloriesPerLoggedDay: daysWithFood > 0 ? roundTwo(totals.calories / daysWithFood) : 0,
      exerciseMinutesPerDay: roundTwo(totals.exerciseMinutes / days.length),
      // Averaged over the days that were actually recorded, so blank days do not drag it down.
      stepsPerRecordedDay: totals.daysWithSteps > 0 ? Math.round(totals.steps / totals.daysWithSteps) : 0,
    };
    return Response.json({ start, end, days, totals, averages });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to build the report" }, { status: 500 }); }
}
