import { and, asc, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { dailyGoals, exerciseEntries, foodEntries, nutritionGoals, stepEntries, weightEntries } from "../../../db/schema";
import {
  type FatSubtype, type FatTotals, DEFAULT_ACTIVITY_LEVEL,
  bmrFrom, emptyFatTotals, fatSubtypeKeys, fatTotalsFrom, mergeFatTotals, netCarbGoalsFrom, netCarbsFrom,
  stepCaloriesFrom, tdeeFrom,
} from "../../nutrition";
import { DEFAULT_CALORIE_GOAL } from "../daily-goal";
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
    const [foodRows, exerciseRows, sessionRows, stepRows, goalRows, weightRows, priorWeightRows, dailyGoalRows] = await Promise.all([
      db.select({
        date: foodEntries.eatenOn,
        calories: sql<number>`sum(${foodEntries.calories})`,
        protein: sql<number>`sum(${foodEntries.protein})`,
        fat: sql<number>`sum(${foodEntries.fat})`,
        carbs: sql<number>`sum(${foodEntries.carbs})`,
        fiber: sql<number>`sum(${foodEntries.fiber})`,
        // Fat subtypes total their known values, with a count of the entries
        // that supplied each one. sum() ignores nulls, so without the counts a
        // day where nobody recorded a subtype would look like a day of zeroes.
        saturatedFat: sql<number | null>`sum(${foodEntries.saturatedFat})`,
        saturatedFatKnown: sql<number>`sum(case when ${foodEntries.saturatedFat} is null then 0 else 1 end)`,
        transFat: sql<number | null>`sum(${foodEntries.transFat})`,
        transFatKnown: sql<number>`sum(case when ${foodEntries.transFat} is null then 0 else 1 end)`,
        monounsaturatedFat: sql<number | null>`sum(${foodEntries.monounsaturatedFat})`,
        monounsaturatedFatKnown: sql<number>`sum(case when ${foodEntries.monounsaturatedFat} is null then 0 else 1 end)`,
        polyunsaturatedFat: sql<number | null>`sum(${foodEntries.polyunsaturatedFat})`,
        polyunsaturatedFatKnown: sql<number>`sum(case when ${foodEntries.polyunsaturatedFat} is null then 0 else 1 end)`,
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
      // The individual sessions travel alongside the per-day rollup so the
      // report can show what was actually done, comments included.
      db.select({
        id: exerciseEntries.id, date: exerciseEntries.exercisedOn, activity: exerciseEntries.activity,
        minutes: exerciseEntries.minutes, calories: exerciseEntries.calories, comments: exerciseEntries.comments,
      }).from(exerciseEntries)
        .where(and(eq(exerciseEntries.owner, owner), gte(exerciseEntries.exercisedOn, start), lte(exerciseEntries.exercisedOn, end)))
        .orderBy(asc(exerciseEntries.exercisedOn), asc(exerciseEntries.id)),
      db.select({ date: stepEntries.steppedOn, steps: stepEntries.steps }).from(stepEntries)
        .where(and(eq(stepEntries.owner, owner), gte(stepEntries.steppedOn, start), lte(stepEntries.steppedOn, end))),
      // The goals in force right now. The tracker keeps dated history for the
      // calorie goal only, so the report says these are the current settings
      // rather than implying they applied on every date in the range.
      db.select().from(nutritionGoals).where(eq(nutritionGoals.owner, owner)).limit(1),
      db.select({ date: weightEntries.weighedOn, pounds: weightEntries.pounds }).from(weightEntries)
        .where(and(eq(weightEntries.owner, owner), gte(weightEntries.weighedOn, start), lte(weightEntries.weighedOn, end))),
      // The closest weigh-in before the range, so the first days of a range
      // that starts between weigh-ins still have a weight to work from.
      db.select({ date: weightEntries.weighedOn, pounds: weightEntries.pounds }).from(weightEntries)
        .where(and(eq(weightEntries.owner, owner), lt(weightEntries.weighedOn, start)))
        .orderBy(desc(weightEntries.weighedOn)).limit(1),
      // The calorie goal frozen onto each day, as the calendar reads it.
      db.select({ date: dailyGoals.goalOn, calories: dailyGoals.calories }).from(dailyGoals)
        .where(and(eq(dailyGoals.owner, owner), gte(dailyGoals.goalOn, start), lte(dailyGoals.goalOn, end))),
    ]);

    const foodByDate = new Map(foodRows.map(row => [row.date, row]));
    const exerciseByDate = new Map(exerciseRows.map(row => [row.date, row]));
    const sessionsByDate = new Map<string, { activity: string; minutes: number; calories: number; comments: string }[]>();
    for (const row of sessionRows) {
      const list = sessionsByDate.get(row.date) ?? [];
      list.push({ activity: row.activity, minutes: roundTwo(row.minutes), calories: roundTwo(row.calories), comments: row.comments ?? "" });
      sessionsByDate.set(row.date, list);
    }
    // A day without a step entry reports null, so "not recorded" never reads as a zero-step day.
    const stepsByDate = new Map(stepRows.map(row => [row.date, row.steps]));
    // Each day uses its own weigh-in, or else the closest earlier one. Dates run
    // oldest to newest, so carrying the last weight forward finds it.
    const weighIns = new Map(weightRows.map(row => [row.date, row.pounds]));
    let carried: { date: string; pounds: number } | null = priorWeightRows[0] ?? null;
    const body = goalRows[0];
    const stampedGoals = new Map(dailyGoalRows.map(row => [row.date, row.calories]));
    const days = dates.map(date => {
      const food = foodByDate.get(date); const movement = exerciseByDate.get(date);
      const steps = stepsByDate.get(date);
      const weighed = weighIns.get(date);
      if (weighed !== undefined) carried = { date, pounds: weighed };
      const pounds = carried?.pounds ?? null;
      const bmr = bmrFrom({ gender: body?.gender as "male" | "female" | null | undefined, age: body?.age, heightInches: body?.heightInches, pounds });
      const stepCalories = steps === undefined ? null : stepCaloriesFrom({ steps, pounds, heightInches: body?.heightInches });
      const eaten = roundTwo(food?.calories ?? 0); const burned = roundTwo(movement?.calories ?? 0);
      const logged = Number(food?.items ?? 0) > 0;
      // Days recorded before goals were stamped fall back to the current goal.
      const goalCalories = stampedGoals.get(date) ?? body?.calories ?? DEFAULT_CALORIE_GOAL;
      const activityOffset = burned + (stepCalories ?? 0);
      const adjustedIntake = logged ? roundTwo(eaten - activityOffset) : null;
      const tdee = tdeeFrom(bmr, DEFAULT_ACTIVITY_LEVEL);
      return {
        date,
        // Energy balance. Unknown stays null: no weight means no TDEE or step
        // calories, and a day with no food logged has nothing to compare.
        weightPounds: pounds, weightDate: carried?.date ?? null,
        goalCalories, goalDifference: logged ? roundTwo(eaten - goalCalories) : null,
        tdee, stepCalories, activityOffset: roundTwo(activityOffset), adjustedIntake,
        // Calories eaten against TDEE: below zero is a deficit, above is an overage.
        // TDEE already includes everyday activity, so exercise and steps are not
        // subtracted again; the activity offset and adjusted intake are informational.
        energyBalance: logged && tdee !== null ? roundTwo(eaten - tdee) : null,
        calories: roundTwo(food?.calories ?? 0), protein: roundTwo(food?.protein ?? 0), fat: roundTwo(food?.fat ?? 0),
        carbs: roundTwo(food?.carbs ?? 0), fiber: roundTwo(food?.fiber ?? 0),
        netCarbs: netCarbsFrom(food?.carbs ?? 0, food?.fiber ?? 0),
        items: Number(food?.items ?? 0),
        // The same rollup shape the diary screen and both PDFs use, so a day's
        // fat breakdown is never worked out two different ways.
        fatDetail: food
          ? fatTotalsFrom(food.fat, food.items, food, {
              saturatedFat: food.saturatedFatKnown, transFat: food.transFatKnown,
              monounsaturatedFat: food.monounsaturatedFatKnown, polyunsaturatedFat: food.polyunsaturatedFatKnown,
            })
          : emptyFatTotals(),
        exerciseMinutes: roundTwo(movement?.minutes ?? 0), exerciseCalories: roundTwo(movement?.calories ?? 0),
        sessions: Number(movement?.sessions ?? 0), activities: movement?.activities ?? "",
        movement: sessionsByDate.get(date) ?? [],
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
      // Range-wide fat, built by merging the per-day rollups rather than by
      // running a second, separate query that could disagree with them.
      fatDetail: days.reduce<FatTotals>((sum, day) => mergeFatTotals(sum, day.fatDetail), emptyFatTotals()),
    };
    // Energy balance rows follow the recorded-day rule: a day counts only when
    // food was logged for it, and each column covers the days where that figure
    // is known (a day with no weight has no TDEE to include).
    const known = (values: (number | null)[]) => values.filter((value): value is number => value !== null);
    const average = (values: (number | null)[]) => {
      const present = known(values);
      return present.length === 0 ? null : Math.round(present.reduce((sum, value) => sum + value, 0) / present.length);
    };
    const total = (values: (number | null)[]) => {
      const present = known(values);
      return present.length === 0 ? null : Math.round(present.reduce((sum, value) => sum + value, 0));
    };
    const loggedDays = days.filter(day => day.items > 0);
    const columns = {
      eaten: loggedDays.map(day => day.calories),
      goalDifference: loggedDays.map(day => day.goalDifference),
      exercise: loggedDays.map(day => day.exerciseCalories),
      stepCalories: loggedDays.map(day => day.stepCalories),
      activityOffset: loggedDays.map(day => day.activityOffset),
      adjustedIntake: loggedDays.map(day => day.adjustedIntake),
      tdee: loggedDays.map(day => day.tdee),
      energyBalance: loggedDays.map(day => day.energyBalance),
    };
    // Weight change over the range, from the first and last weigh-ins inside it.
    const weighed = [...weightRows].sort((a, b) => a.date.localeCompare(b.date));
    const firstWeighIn = weighed[0]; const lastWeighIn = weighed[weighed.length - 1];
    const weightChange = weighed.length >= 2
      ? {
          startDate: firstWeighIn.date, startPounds: firstWeighIn.pounds,
          endDate: lastWeighIn.date, endPounds: lastWeighIn.pounds,
          pounds: roundTwo(lastWeighIn.pounds - firstWeighIn.pounds),
        }
      : null;
    const energy = {
      weightChange,
      loggedDays: loggedDays.length,
      daysWithTdee: loggedDays.filter(day => day.tdee !== null).length,
      averages: Object.fromEntries(Object.entries(columns).map(([key, values]) => [key, average(values)])),
      totals: Object.fromEntries(Object.entries(columns).map(([key, values]) => [key, total(values)])),
      // What the report assumed, so the screen can say so rather than guess.
      activityLevel: DEFAULT_ACTIVITY_LEVEL,
      bodyMetricsSet: Boolean(body && body.gender && body.age && body.heightInches),
    };
    const averages = {
      caloriesPerDay: roundTwo(totals.calories / days.length),
      caloriesPerLoggedDay: daysWithFood > 0 ? roundTwo(totals.calories / daysWithFood) : 0,
      exerciseMinutesPerDay: roundTwo(totals.exerciseMinutes / days.length),
      // Averaged over the days that were actually recorded, so blank days do not drag it down.
      stepsPerRecordedDay: totals.daysWithSteps > 0 ? Math.round(totals.steps / totals.daysWithSteps) : 0,
    };
    // Nutrition averages follow the same recorded-day rule the rest of the
    // report and the summary PDF use: days holding at least one food entry,
    // never every calendar day in the range.
    const recorded = days.filter(day => day.items > 0);
    const recordedDays = recorded.length;
    const per = (pick: (day: typeof days[number]) => number) =>
      recordedDays === 0 ? 0 : roundTwo(recorded.reduce((sum, day) => sum + pick(day), 0) / recordedDays);
    const nutrition = {
      recordedDays,
      averages: {
        calories: per(day => day.calories), protein: per(day => day.protein), carbs: per(day => day.carbs),
        fat: per(day => day.fat), fiber: per(day => day.fiber), netCarbs: per(day => day.netCarbs),
      },
      // Days that recorded each subtype at least once, so a partial average is
      // shown as partial rather than as the whole range.
      subtypeDays: Object.fromEntries(fatSubtypeKeys.map(key =>
        [key, recorded.filter(day => day.fatDetail.known[key] > 0).length])) as Record<FatSubtype, number>,
    };
    const goal = goalRows[0];
    // Read through the shared helper so a row written before the net-carb
    // range existed still reports a usable maximum instead of a zero.
    const netCarbs = netCarbGoalsFrom(goal);
    const goals = goal
      ? {
          calories: goal.calories, protein: goal.protein, fat: goal.fat,
          // The maximum, which is what the single `netCarbs` goal always meant.
          netCarbs: netCarbs.max, netCarbsMin: netCarbs.min, netCarbsMax: netCarbs.max,
          // Null when no saturated-fat goal has been set. Never a zero.
          saturatedFat: goal.saturatedFat ?? null, fiber: goal.fiber, waterOunces: goal.waterOunces,
        }
      : null;
    return Response.json({ start, end, days, totals, averages, nutrition, energy, goals });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to build the report" }, { status: 500 }); }
}
