/**
 * One export feed for the whole tracker.
 *
 * The Weight, Journal, and Reports screens all call this with a date range and
 * the sections they want, so PDF and JSON exports are built from exactly the
 * same numbers. Everything is scoped to the requesting profile, and internal
 * row ids are never returned.
 */
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  dailyGoals, exerciseEntries, foodEntries, journalEntries,
  nutritionGoals, stepEntries, waterEntries, weightEntries,
} from "../../../db/schema";
import { type FatSubtype, fatSubtypeKeys, fatTotalsFrom, netCarbGoalsFrom, netCarbsFrom } from "../../nutrition";
import { DEFAULT_CALORIE_GOAL } from "../daily-goal";
import { profileFrom } from "../profile";

/** Every section the export offers. The client builds its checkboxes from this order. */
export const exportSections = [
  "weights", "journalEntries", "dailySummaries", "foodEntries",
  "waterEntries", "exerciseEntries", "exerciseCalories", "steps", "goals",
] as const;
export type ExportSection = typeof exportSections[number];

/** Roughly four years, which is far more history than either profile holds. */
const MAX_DAYS = 1500;
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
/** Nutrition is exported as a number with at most two decimals, never a formatted string. */
const roundTwo = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;
/** Same rounding, but an absent value stays absent instead of becoming zero. */
const optionalTwo = (value: unknown) =>
  value === null || value === undefined || !Number.isFinite(Number(value)) ? null : roundTwo(value);

/** Whole days between two calendar dates, counting both ends. */
function daysBetween(start: string, end: string) {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  return Math.round((to - from) / 86400000) + 1;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const start = params.get("start") ?? ""; const end = params.get("end") ?? "";
    if (!isDate(start) || !isDate(end)) return Response.json({ error: "A valid start and end date are required" }, { status: 400 });
    if (start > end) return Response.json({ error: "The start date must not be after the end date" }, { status: 400 });
    const span = daysBetween(start, end);
    if (span > MAX_DAYS) return Response.json({ error: `Choose a range of ${MAX_DAYS} days or fewer` }, { status: 400 });

    const requested = new Set((params.get("sections") ?? "").split(",").map(name => name.trim()).filter(Boolean));
    const chosen = exportSections.filter(section => requested.has(section));
    if (chosen.length === 0) return Response.json({ error: "Choose at least one section to export" }, { status: 400 });
    const wants = (section: ExportSection) => chosen.includes(section);

    const db = getDb(); const owner = profileFrom(request);
    // The per-day burned-calorie rollup is derived from the same rows as the
    // movement log, so those rows are read once for either section.
    const needsExerciseRows = wants("exerciseEntries") || wants("exerciseCalories");

    const [weights, journal, summaries, foods, water, movement, steps, currentGoals, stampedGoals] = await Promise.all([
      wants("weights")
        ? db.select({ date: weightEntries.weighedOn, pounds: weightEntries.pounds, note: weightEntries.note })
            .from(weightEntries)
            .where(and(eq(weightEntries.owner, owner), gte(weightEntries.weighedOn, start), lte(weightEntries.weighedOn, end)))
            .orderBy(asc(weightEntries.weighedOn))
        : null,
      wants("journalEntries")
        ? db.select({ date: journalEntries.entryOn, body: journalEntries.body, source: journalEntries.source, updatedAt: journalEntries.updatedAt })
            .from(journalEntries)
            .where(and(eq(journalEntries.owner, owner), gte(journalEntries.entryOn, start), lte(journalEntries.entryOn, end)))
            .orderBy(asc(journalEntries.entryOn))
        : null,
      wants("dailySummaries")
        ? db.select({
            date: foodEntries.eatenOn,
            calories: sql<number>`sum(${foodEntries.calories})`, protein: sql<number>`sum(${foodEntries.protein})`,
            fat: sql<number>`sum(${foodEntries.fat})`, carbs: sql<number>`sum(${foodEntries.carbs})`,
            fiber: sql<number>`sum(${foodEntries.fiber})`, foodItems: sql<number>`count(*)`,
            // Each subtype totals only the entries that recorded it, alongside
            // a count of those entries. sum() ignores nulls, so the count is
            // what keeps an unrecorded subtype from reading as a zero.
            saturatedFat: sql<number | null>`sum(${foodEntries.saturatedFat})`,
            saturatedFatKnown: sql<number>`sum(case when ${foodEntries.saturatedFat} is null then 0 else 1 end)`,
            transFat: sql<number | null>`sum(${foodEntries.transFat})`,
            transFatKnown: sql<number>`sum(case when ${foodEntries.transFat} is null then 0 else 1 end)`,
            monounsaturatedFat: sql<number | null>`sum(${foodEntries.monounsaturatedFat})`,
            monounsaturatedFatKnown: sql<number>`sum(case when ${foodEntries.monounsaturatedFat} is null then 0 else 1 end)`,
            polyunsaturatedFat: sql<number | null>`sum(${foodEntries.polyunsaturatedFat})`,
            polyunsaturatedFatKnown: sql<number>`sum(case when ${foodEntries.polyunsaturatedFat} is null then 0 else 1 end)`,
          }).from(foodEntries)
            .where(and(eq(foodEntries.owner, owner), gte(foodEntries.eatenOn, start), lte(foodEntries.eatenOn, end)))
            .groupBy(foodEntries.eatenOn).orderBy(asc(foodEntries.eatenOn))
        : null,
      wants("foodEntries")
        ? db.select({
            date: foodEntries.eatenOn, meal: foodEntries.meal, name: foodEntries.name, serving: foodEntries.serving,
            calories: foodEntries.calories, protein: foodEntries.protein, fat: foodEntries.fat,
            carbs: foodEntries.carbs, fiber: foodEntries.fiber,
            saturatedFat: foodEntries.saturatedFat, transFat: foodEntries.transFat,
            monounsaturatedFat: foodEntries.monounsaturatedFat, polyunsaturatedFat: foodEntries.polyunsaturatedFat,
          }).from(foodEntries)
            .where(and(eq(foodEntries.owner, owner), gte(foodEntries.eatenOn, start), lte(foodEntries.eatenOn, end)))
            .orderBy(asc(foodEntries.eatenOn), asc(foodEntries.id))
        : null,
      wants("waterEntries")
        ? db.select({ date: waterEntries.drankOn, ounces: waterEntries.ounces })
            .from(waterEntries)
            .where(and(eq(waterEntries.owner, owner), gte(waterEntries.drankOn, start), lte(waterEntries.drankOn, end)))
            .orderBy(asc(waterEntries.drankOn), asc(waterEntries.id))
        : null,
      needsExerciseRows
        ? db.select({
            date: exerciseEntries.exercisedOn, activity: exerciseEntries.activity,
            minutes: exerciseEntries.minutes, caloriesBurned: exerciseEntries.calories,
            comments: exerciseEntries.comments,
          }).from(exerciseEntries)
            .where(and(eq(exerciseEntries.owner, owner), gte(exerciseEntries.exercisedOn, start), lte(exerciseEntries.exercisedOn, end)))
            .orderBy(asc(exerciseEntries.exercisedOn), asc(exerciseEntries.id))
        : null,
      wants("steps")
        ? db.select({ date: stepEntries.steppedOn, steps: stepEntries.steps })
            .from(stepEntries)
            .where(and(eq(stepEntries.owner, owner), gte(stepEntries.steppedOn, start), lte(stepEntries.steppedOn, end)))
            .orderBy(asc(stepEntries.steppedOn))
        : null,
      wants("goals")
        ? db.select().from(nutritionGoals).where(eq(nutritionGoals.owner, owner)).limit(1)
        : null,
      wants("goals")
        ? db.select({ date: dailyGoals.goalOn, calories: dailyGoals.calories })
            .from(dailyGoals)
            .where(and(eq(dailyGoals.owner, owner), gte(dailyGoals.goalOn, start), lte(dailyGoals.goalOn, end)))
            .orderBy(asc(dailyGoals.goalOn))
        : null,
    ]);

    const payload: Record<string, unknown> = {
      exportMetadata: {
        application: "Daily Food Tracker",
        formatVersion: 1,
        generatedAt: new Date().toISOString(),
        sections: chosen,
      },
      user: { profile: owner, name: owner.charAt(0).toUpperCase() + owner.slice(1) },
      dateRange: { start, end, days: span },
    };

    if (wants("goals")) {
      const saved = currentGoals?.[0];
      // Read once through the shared helper, so a row written before the
      // net-carb range existed still exports a usable maximum.
      const netCarbGoals = netCarbGoalsFrom(saved);
      payload.goals = {
        // The settings in force when the export was taken.
        current: saved
          ? {
              calories: saved.calories, protein: roundTwo(saved.protein), fat: roundTwo(saved.fat),
              // The maximum of the net-carb range, which is what the single
              // `netCarbs` goal has always meant. Both ends travel as well.
              netCarbs: netCarbGoals.max,
              netCarbsMin: netCarbGoals.min,
              netCarbsMax: netCarbGoals.max,
              fiber: roundTwo(saved.fiber), waterOunces: roundTwo(saved.waterOunces),
              // Null when no saturated-fat goal has been set. There is still
              // deliberately no total-carbohydrate goal.
              saturatedFat: optionalTwo(saved.saturatedFat),
            }
          : null,
        // The calorie goal frozen onto each day, so a past day keeps the target
        // it was actually judged against.
        dailyCalorieGoals: (stampedGoals ?? []).map(row => ({ date: row.date, calories: row.calories })),
        defaultCalorieGoal: DEFAULT_CALORIE_GOAL,
      };
    }
    if (weights) payload.weights = weights.map(row => ({ date: row.date, pounds: roundTwo(row.pounds), note: row.note }));
    if (journal) payload.journalEntries = journal.map(row => ({ date: row.date, body: row.body, source: row.source, updatedAt: row.updatedAt }));
    if (summaries) payload.dailySummaries = summaries.map(row => {
      // Null stays null through the JSON: a subtype nobody recorded is absent,
      // not zero. `fatSubtypeEntries` says how many of the day's entries
      // carried each value, so a partial sum can be read as partial.
      const fat = fatTotalsFrom(row.fat, row.foodItems, row, {
        saturatedFat: row.saturatedFatKnown, transFat: row.transFatKnown,
        monounsaturatedFat: row.monounsaturatedFatKnown, polyunsaturatedFat: row.polyunsaturatedFatKnown,
      });
      return {
        date: row.date,
        calories: roundTwo(row.calories), protein: roundTwo(row.protein), fat: roundTwo(row.fat),
        carbs: roundTwo(row.carbs), fiber: roundTwo(row.fiber),
        netCarbs: netCarbsFrom(row.carbs ?? 0, row.fiber ?? 0),
        foodItems: Number(row.foodItems ?? 0),
        ...fat.subtotals,
        fatSubtypeEntries: fat.known,
      };
    });
    if (foods) payload.foodEntries = foods.map(row => ({
      date: row.date, meal: row.meal, name: row.name, serving: row.serving,
      calories: roundTwo(row.calories), protein: roundTwo(row.protein), fat: roundTwo(row.fat),
      carbs: roundTwo(row.carbs), fiber: roundTwo(row.fiber),
      netCarbs: netCarbsFrom(row.carbs, row.fiber),
      // An entry saved before the fat breakdown existed exports these as null.
      ...Object.fromEntries(fatSubtypeKeys.map(key => [key, optionalTwo(row[key])])) as Record<FatSubtype, number | null>,
    }));
    if (water) payload.waterEntries = water.map(row => ({ date: row.date, ounces: roundTwo(row.ounces) }));
    if (movement && wants("exerciseEntries")) {
      // Calories burned only travel with the movement log when the calories
      // section was chosen as well, so turning that section off really drops it.
      // Comments are their own plain-text field and always travel with the
      // movement log, so a note is never folded into the activity name.
      payload.exerciseEntries = movement.map(row => wants("exerciseCalories")
        ? { date: row.date, activity: row.activity, minutes: roundTwo(row.minutes), caloriesBurned: roundTwo(row.caloriesBurned), comments: row.comments ?? "" }
        : { date: row.date, activity: row.activity, minutes: roundTwo(row.minutes), comments: row.comments ?? "" });
    }
    if (movement && wants("exerciseCalories")) {
      const byDate = new Map<string, { date: string; caloriesBurned: number; minutes: number; sessions: number }>();
      for (const row of movement) {
        const day = byDate.get(row.date) ?? { date: row.date, caloriesBurned: 0, minutes: 0, sessions: 0 };
        day.caloriesBurned += Number(row.caloriesBurned ?? 0);
        day.minutes += Number(row.minutes ?? 0);
        day.sessions += 1;
        byDate.set(row.date, day);
      }
      payload.exerciseCalories = [...byDate.values()].map(day => ({
        date: day.date, caloriesBurned: roundTwo(day.caloriesBurned), minutes: roundTwo(day.minutes), sessions: day.sessions,
      }));
    }
    if (steps) payload.steps = steps.map(row => ({ date: row.date, steps: row.steps }));

    return Response.json(payload);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to build that export" }, { status: 500 });
  }
}
