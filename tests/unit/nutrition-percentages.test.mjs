/**
 * Calorie shares and goal percentages.
 *
 * The two ideas are deliberately different things and are checked as such: a
 * share of calories is never called a goal percentage, and a goal percentage
 * is never called a calorie share. Fiber only ever gets the second kind.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CALORIE_SHARE_NOTE, CURRENT_GOALS_NOTE, aggregateFat, caloriePercent, caloriesPerGram,
  emptyFatTotals, formatGrams, formatPercent, goalContext, goalRows, macroCalories,
  nutritionRows, percentOf,
} from "../../app/nutrition.ts";

/** Chris's configured goals, as the request describes them. */
const goals = { calories: 2100, netCarbs: 125, protein: 150, fat: 95, saturatedFat: 16, fiber: 35, waterOunces: 100 };

test("the standard macro calorie equivalents are used", () => {
  assert.deepEqual(caloriesPerGram, { protein: 4, carbs: 4, fat: 9 });
  assert.equal(macroCalories(150, caloriesPerGram.protein), 600);
  assert.equal(macroCalories(95, caloriesPerGram.fat), 855);
});

test("the 2,100 calorie goal produces the expected percentages", () => {
  const context = goalContext(goals);
  assert.equal(context.netCarbs, "23.8% calorie-equivalent");
  assert.equal(context.protein, "28.6% of calories");
  assert.equal(context.fat, "40.7% of calories");
  assert.equal(context.saturatedFat, "6.9% of calories · 16.8% of total fat");
});

test("fiber is a gram goal and never a calorie share", () => {
  const context = goalContext(goals);
  assert.equal(context.fiber, "gram goal");
  assert.equal(/%/.test(context.fiber), false);
  assert.equal(/of calories/.test(context.fiber), false);
});

test("percentages recalculate when a goal changes", () => {
  // Same protein target against a smaller calorie goal is a bigger share.
  assert.equal(goalContext({ ...goals, calories: 1600 }).protein, "37.5% of calories");
  // And changing the grams moves it without touching anything stored.
  assert.equal(goalContext({ ...goals, protein: 180 }).protein, "34.3% of calories");
  // Saturated fat tracks both the calorie goal and the total-fat goal.
  assert.equal(goalContext({ ...goals, fat: 80 }).saturatedFat, "6.9% of calories · 20.0% of total fat");
});

test("blank, zero, and invalid entries produce no percentage at all", () => {
  for (const calories of [null, undefined, 0, -1, Number.NaN, "abc"]) {
    const context = goalContext({ ...goals, calories });
    assert.equal(context.protein, "", `calories ${String(calories)} should give no protein share`);
    assert.equal(context.fat, "");
    assert.equal(context.netCarbs, "");
  }
  for (const protein of [null, undefined, Number.NaN, -5]) {
    assert.equal(goalContext({ ...goals, protein }).protein, "");
  }
  // Nothing ever renders as NaN or Infinity.
  const partial = Object.values(goalContext({ calories: 2100, protein: null, fat: undefined }));
  assert.equal(partial.some(value => /NaN|Infinity/.test(value)), false);
});

test("an unset saturated-fat goal shows nothing rather than zero", () => {
  const context = goalContext({ ...goals, saturatedFat: null });
  assert.equal(context.saturatedFat, "");
  const rows = goalRows({ ...goals, saturatedFat: null });
  const saturated = rows.find(row => row.key === "saturatedFat");
  assert.equal(saturated.target, "not set");
  assert.equal(saturated.context, "");
});

test("there is no total-carbohydrate goal anywhere in the goal rows", () => {
  const keys = goalRows(goals).map(row => row.key);
  assert.deepEqual(keys, ["calories", "netCarbs", "protein", "fat", "saturatedFat", "fiber", "waterOunces"]);
  assert.equal(keys.includes("carbs"), false);
  assert.equal(keys.includes("totalCarbs"), false);
});

test("percentOf and caloriePercent refuse impossible inputs", () => {
  assert.equal(percentOf(16, 95), 16.8);
  assert.equal(percentOf(16, 0), null);
  assert.equal(percentOf(null, 95), null);
  assert.equal(percentOf(-1, 95), null);
  assert.equal(caloriePercent(150, 0, 4), null);
  assert.equal(caloriePercent(150, null, 4), null);
  assert.equal(formatPercent(null), "—");
  assert.equal(formatPercent(23.75), "23.8%");
  assert.equal(formatGrams(null), "Not available");
});

/* ---- The nutrition averages table -------------------------------------- */

const averages = { calories: 2050, protein: 157.5, carbs: 85, fat: 110, fiber: 32.6, netCarbs: 52.4 };
const fat = aggregateFat([
  { fat: 110, saturatedFat: 30, transFat: 0.5, monounsaturatedFat: 40, polyunsaturatedFat: 12 },
  { fat: 110, saturatedFat: 30 },
]);
const rowsFor = (options = {}) => nutritionRows({
  averages, fat, recordedDays: 2, goals,
  subtypeDays: { saturatedFat: 2, transFat: 1, monounsaturatedFat: 1, polyunsaturatedFat: 1 },
  ...options,
});
const rowFor = (key, options) => rowsFor(options).find(row => row.key === key);

test("total carbohydrates carry the calorie share, and never a goal", () => {
  const carbs = rowFor("carbs");
  assert.equal(carbs.metric, "Total carbohydrates");
  assert.equal(carbs.average, "85.0 g");
  assert.equal(carbs.goal, "no goal");
  // 85 g x 4 / 2050 = 16.6%
  assert.equal(carbs.calorieShare, "16.6% of average calories");
  assert.equal(carbs.goalContext, "");
});

test("net carbohydrates are a calorie-equivalent, kept apart from total carbs", () => {
  const net = rowFor("netCarbs");
  assert.equal(net.metric, "Net carbohydrates");
  assert.equal(net.average, "52.4 g");
  assert.equal(net.goal, "125 g");
  assert.match(net.calorieShare, /calorie-equivalent$/);
  assert.equal(/of average calories/.test(net.calorieShare), false);
  assert.equal(net.goalContext, "41.9% of goal");
  // Both carbohydrate rows are present, and they are different numbers.
  const keys = rowsFor().map(row => row.key);
  assert.ok(keys.includes("carbs") && keys.includes("netCarbs"));
});

test("protein and fat show a calorie share and a goal percentage, each labelled", () => {
  const protein = rowFor("protein");
  // 157.5 x 4 / 2050 = 30.7%, and 157.5 / 150 = 105.0%
  assert.equal(protein.calorieShare, "30.7% of average calories");
  assert.equal(protein.goalContext, "105.0% of goal");
  const total = rowFor("fat");
  // 110 x 9 / 2050 = 48.3%, and 110 / 95 = 115.8%
  assert.equal(total.calorieShare, "48.3% of average calories");
  assert.equal(total.goalContext, "115.8% of goal");
});

test("fiber shows only its goal percentage, never a calorie share", () => {
  const fiber = rowFor("fiber");
  assert.equal(fiber.average, "32.6 g");
  assert.equal(fiber.goal, "35 g");
  assert.equal(fiber.calorieShare, "");
  // 32.6 / 35 = 93.1%
  assert.equal(fiber.goalContext, "93.1% of goal");
  assert.equal(/of calories/.test(fiber.context), false);
});

test("saturated fat reports its calorie share, its share of fat eaten, and its goal", () => {
  const saturated = rowFor("saturatedFat");
  // 60 g over 2 recorded days is 30 g; 30 x 9 / 2050 = 13.2%
  assert.equal(saturated.average, "30.0 g");
  assert.equal(saturated.calorieShare, "13.2% of average calories");
  // 30 / 110 of the fat actually eaten, and 30 / 16 of the goal.
  assert.equal(saturated.goalContext, "27.3% of total fat eaten · 187.5% of goal");
  assert.equal(saturated.goal, "16 g");
});

test("a subtype recorded on only some days says so", () => {
  assert.equal(rowFor("monounsaturatedFat").coverage, "from 1 of 2 days");
  assert.equal(rowFor("saturatedFat").coverage, "", "a subtype recorded every day needs no note");
});

test("a subtype nothing recorded reads Not available, not zero", () => {
  const bare = nutritionRows({
    averages, fat: aggregateFat([{ fat: 110 }]), recordedDays: 1, goals,
  });
  const saturated = bare.find(row => row.key === "saturatedFat");
  assert.equal(saturated.average, "Not available");
  assert.equal(saturated.calorieShare, "");
  assert.equal(saturated.context, "");
});

test("no goals configured leaves goal percentages out but keeps calorie shares", () => {
  const rows = rowsFor({ goals: null });
  const protein = rows.find(row => row.key === "protein");
  assert.equal(protein.calorieShare, "30.7% of average calories");
  assert.equal(protein.goalContext, "");
  assert.equal(protein.goal, "no goal");
  assert.equal(rows.find(row => row.key === "fiber").context, "");
});

test("a range with no recorded days produces no percentages", () => {
  const rows = nutritionRows({
    averages: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, netCarbs: 0 },
    fat: emptyFatTotals(), recordedDays: 0, goals,
  });
  for (const row of rows) {
    assert.equal(/NaN|Infinity/.test(row.context), false);
    assert.equal(row.calorieShare, "");
  }
});

test("calorie shares are not made to add up to 100", () => {
  // Protein 30.7 + total carbs 16.6 + fat 48.3 = 95.6, which is left alone.
  const share = key => Number.parseFloat(rowFor(key).calorieShare);
  const total = share("protein") + share("carbs") + share("fat");
  assert.ok(total > 90 && total < 100, `unexpected total ${total}`);
  assert.match(CALORIE_SHARE_NOTE, /not[\s\S]*expected to add up to 100%/i);
  assert.match(CALORIE_SHARE_NOTE, /No stored calorie or gram value is adjusted/i);
});

test("label rounding that overshoots 100% is reported, not corrected", () => {
  // A label-rounded day whose macros imply more energy than its stated calories.
  const rounded = nutritionRows({
    averages: { calories: 500, protein: 30, carbs: 30, fat: 30, fiber: 3, netCarbs: 27 },
    fat: emptyFatTotals(), recordedDays: 1, goals: null,
  });
  const share = key => Number.parseFloat(rounded.find(row => row.key === key).calorieShare);
  // 24 + 24 + 54 = 102% of the stated calories, and it stays that way.
  assert.ok(share("protein") + share("carbs") + share("fat") > 100);
  assert.equal(rounded.find(row => row.key === "fat").average, "30.0 g");
});

test("the current-goals note does not claim goals were historic", () => {
  assert.match(CURRENT_GOALS_NOTE, /currently configured/i);
  assert.match(CURRENT_GOALS_NOTE, /not on what the goals may have been/i);
});
