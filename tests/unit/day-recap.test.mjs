/**
 * "Copy this day": the selected day, a rolling seven-day summary ending on it,
 * and that day's journal.
 *
 * The rules being protected here are the ones that make a recap written the
 * next morning still describe the right day:
 *  - The window ends on the date chosen in the tracker and reaches back six
 *    days. A later date is never included, whatever today happens to be.
 *  - Each day is measured against the calorie goal saved for that date, never
 *    against the selected day's goal applied backwards.
 *  - Missing days are never counted as zeroes. Averages say how many days they
 *    were worked out from, and a fat subtype nothing recorded reads
 *    "Not available" rather than 0g.
 *  - The selected day counts even while it is still in progress.
 *  - The journal is copied exactly as it was saved, for the selected date only.
 *
 * The earlier days travel through the real export feed against a migrated
 * database, so the profile scoping and the date filtering are the ones the
 * application actually runs.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { openTestDatabase } from "../../tests/support/d1-sqlite.mjs";
import {
  dayRecapText, priorRange, rangeLabel, recapDaysFromExport, recapSections,
  rollingDates, rollingStart, summarizeRolling,
} from "../../app/day-recap.ts";
import { aggregateFat } from "../../app/nutrition.ts";
import { addDays, longDate } from "../../app/shared.ts";

const database = await openTestDatabase();
const exportApi = await import("../../app/api/export/route.ts");

const headers = { "x-food-tracker-profile": "chris" };
/** The date chosen in the tracker. Deliberately not today's date. */
const SELECTED = "2026-09-04";
const NEXT_DAY = addDays(SELECTED, 1);

const food = database.prepare(`
  insert into food_entries
    (owner, eaten_on, meal, name, serving, calories, protein, fat, carbs, fiber,
     saturated_fat, trans_fat, monounsaturated_fat, polyunsaturated_fat)
  values (?, ?, 'Lunch', ?, '1 serving', ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const water = database.prepare("insert into water_entries (owner, drank_on, ounces) values (?, ?, ?)");
const movement = database.prepare(
  "insert into exercise_entries (owner, exercised_on, activity, minutes, calories, comments) values (?, ?, ?, ?, ?, '')");
const stepCount = database.prepare("insert into step_entries (owner, stepped_on, steps) values (?, ?, ?)");
const dailyGoal = database.prepare("insert into daily_goals (owner, goal_on, calories) values (?, ?, ?)");

database.prepare(
  "insert into nutrition_goals (owner, calories, protein, fat, net_carbs, net_carbs_min, net_carbs_max, fiber_goal, water_ounces) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
).run("chris", 2100, 150, 90, 150, 100, 150, 35, 100);
database.prepare("insert into journal_entries (owner, entry_on, body, source) values (?, ?, ?, 'manual')")
  .run("chris", SELECTED, "Slow morning.\n\nWalked the long way home, and the knee held up.\n  Bed early.");
// The journal for the day after, which must never be pulled in instead.
database.prepare("insert into journal_entries (owner, entry_on, body, source) values (?, ?, ?, 'manual')")
  .run("chris", NEXT_DAY, "Tomorrow's page.");

/*
 * Five of the seven days hold food: four earlier days and the selected day.
 * August 30 holds nothing at all, and September 3 holds steps but no food.
 */
food.run("chris", "2026-08-29", "Aug 29", 1800, 100, 70, 150, 30, 20, 1, null, null);
food.run("chris", "2026-08-31", "Aug 31", 2000, 120, 80, 160, 40, 25, 2, 10, null);
food.run("chris", "2026-09-01", "Sep 1", 2200, 130, 90, 170, 35, 30, null, null, null);
food.run("chris", "2026-09-02", "Sep 2", 1500, 90, 60, 120, 20, 15, null, null, null);
// The calorie goal changed during the window, and the earlier day keeps its own.
dailyGoal.run("chris", "2026-08-29", 1800);
for (const date of ["2026-08-31", "2026-09-01", "2026-09-02"]) dailyGoal.run("chris", date, 2100);
water.run("chris", "2026-09-01", 60);
water.run("chris", "2026-09-02", 80);
movement.run("chris", "2026-09-01", "Walk", 30, 200);
movement.run("chris", "2026-09-02", "Bike", 45, 300);
stepCount.run("chris", "2026-09-01", 8000);
stepCount.run("chris", "2026-09-02", 12000);
stepCount.run("chris", "2026-09-03", 5000);
// The day after the selected one, which the window must never reach.
food.run("chris", NEXT_DAY, "Not this day", 9999, 999, 999, 999, 9, 9, 9, 9, 9);
stepCount.run("chris", NEXT_DAY, 99999);
// And the other profile, on the same dates.
food.run("sarah", "2026-08-29", "Hers", 4444, 44, 44, 44, 4, 4, 4, 4, 4);
stepCount.run("sarah", "2026-09-03", 44444);

/** The six days before the selected date, exactly as the tracker fetches them. */
async function earlierDays() {
  const { start, end } = priorRange(SELECTED);
  const response = await exportApi.GET(new Request(
    `http://x/api/export?start=${start}&end=${end}&sections=${recapSections.join(",")}`, { headers },
  ));
  assert.equal(response.status, 200);
  return recapDaysFromExport(await response.json(), rollingDates(SELECTED).slice(0, -1), {
    calories: 2100, waterOunces: 100,
  });
}

/** The selected day as the diary screen holds it, still in progress. */
const selectedEntries = [
  { fat: 20, saturatedFat: 5, transFat: 0, monounsaturatedFat: null, polyunsaturatedFat: null },
];
const selectedDay = {
  date: SELECTED,
  items: 1,
  calories: 500, protein: 30, fat: 20, carbs: 60, fiber: 10, netCarbs: 50,
  fatDetail: aggregateFat(selectedEntries),
  calorieGoal: 2100,
  exerciseMinutes: 0, exerciseCalories: 0, sessions: 0,
  steps: null,
  waterOunces: 32, waterGoal: 100,
};
const goals = { calories: 2100, protein: 150, fat: 90, fiber: 35, waterOunces: 100 };
const netCarbGoals = { min: 100, max: 150 };
const journal = "Slow morning.\n\nWalked the long way home, and the knee held up.\n  Bed early.";

const recap = async (overrides = {}) => dayRecapText({
  day: selectedDay,
  activities: [],
  goals,
  netCarbGoals,
  priorDays: await earlierDays(),
  journal,
  // The fixture is a recap written the next morning, which is the case the
  // whole feature exists for. Tests that need today pass their own.
  today: NEXT_DAY,
  ...overrides,
});

/* ----------------------------------------------------------- the window */

test("the rolling window ends on the selected date and reaches back six days", () => {
  assert.deepEqual(rollingDates(SELECTED), [
    "2026-08-29", "2026-08-30", "2026-08-31",
    "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04",
  ]);
  assert.equal(rollingStart(SELECTED), "2026-08-29");
  // The days fetched from the server stop the day before the selected one; the
  // selected day itself comes from the screen.
  assert.deepEqual(priorRange(SELECTED), { start: "2026-08-29", end: "2026-09-03" });
});

test("the summary is headed with the window it covers", async () => {
  const text = await recap();
  assert.ok(text.includes(`Rolling 7 Days: ${rangeLabel("2026-08-29", SELECTED)}`), text);
});

test("nothing after the selected date, and nothing from the other profile, is included", async () => {
  const text = await recap();
  for (const stranger of ["9999", "99,999", "4444", "44,444", "Tomorrow's page"]) {
    assert.ok(!text.includes(stranger), `${stranger} leaked into the recap:\n${text}`);
  }
});

/* ---------------------------------------------------------------- day */

test("the selected day is still reported in full, and first", async () => {
  const text = await recap();
  const lines = text.split("\n");
  assert.equal(lines[0], longDate(SELECTED));
  assert.ok(text.includes("Calories: 500 of 2100 (1600 remaining)"), text);
  assert.ok(text.includes("Net carbs: 50g of 100 to 150 g — 50g to reach the 100g minimum"), text);
  assert.ok(text.includes("Fat: 20g of 90g"), text);
  assert.ok(text.includes("  Saturated: 5g"), text);
  assert.ok(text.includes("  Trans: 0g"), text);
  // Never recorded is never a zero, on the day or in the summary.
  assert.ok(text.includes("  Monounsaturated: Not available"), text);
  assert.ok(text.includes("Steps: Not recorded"), text);
  assert.ok(text.includes("Hydration: 32 of 100 oz"), text);
  // The day comes before the rolling summary, which comes before the journal.
  assert.ok(text.indexOf("Calories: 500 of 2100") < text.indexOf("Rolling 7 Days:"), text);
  assert.ok(text.indexOf("Rolling 7 Days:") < text.indexOf("Journal:"), text);
});

/* ------------------------------------------------------------ calories */

test("the combined calorie goal adds up the goal saved for each of the seven dates", async () => {
  const text = await recap();
  // Consumed: 1800 + 2000 + 2200 + 1500 + 500 over the five days holding food.
  assert.ok(text.includes("- Total consumed: 8,000"), text);
  // Goals: August 29 keeps its own 1,800 and the six other dates carry 2,100.
  // Every date counts, recorded or not, so the combined goal is 14,400.
  assert.ok(text.includes("- Combined calorie goal: 14,400 (the goal saved for each of the 7 dates)"), text);
  // The goal average divides that by all seven dates; the consumed average
  // divides by the days that recorded food, and each says which it used.
  assert.ok(text.includes("- Daily average consumed: 1,600 (average across 5 recorded days)"), text);
  assert.ok(text.includes("- Average daily calorie goal: 2,057 (combined goal divided by 7)"), text);
  // Exactly the two printed averages subtracted.
  assert.ok(text.includes("- Average daily difference: 457 under goal"), text);
  assert.ok(text.includes("- 2 of 7 dates had no saved calorie goal, so the current goal was used for them."), text);
});

test("the daily average is compared with the preferred 2,000–2,100 range", async () => {
  const text = await recap();
  assert.ok(text.includes("Preferred average range: 2,000–2,100 calories — 400 below the 2,000 minimum"), text);
});

/* --------------------------------------------------------- missing days */

test("every average names the days it was worked out from", async () => {
  const text = await recap();
  assert.ok(text.includes("- Food recorded on 5 of 7 dates."), text);
  assert.ok(text.includes("Daily nutrition averages (average across 5 recorded days):"), text);
  // No average is left labelled only "daily", which would read as the total
  // divided by all seven calendar dates.
  const averages = text.split("\n").filter(line => line.startsWith("- Daily average"));
  assert.ok(averages.length >= 4, text);
  for (const line of averages) {
    assert.match(line, /\(average across \d+ recorded days?\)$/);
  }
});

test("nutrition averages are compared with the current goals", async () => {
  const text = await recap();
  // Total carbohydrates have no goal in this tracker, so none is invented.
  assert.ok(text.includes("- Total carbs: 132g\n"), text);
  assert.ok(text.includes("- Net carbs: 105g — within the current 100 to 150g range"), text);
  assert.ok(text.includes("- Protein: 94g of 150g — 56g below goal"), text);
  // Fat is a comparison with the goal, never a minimum to reach.
  assert.ok(text.includes("- Fat: 64g compared with the current 90g goal"), text);
  assert.ok(!text.includes("- Fat: 64g of 90g"), text);
  assert.ok(text.includes("- Fiber: 27g of 35g — 8g below goal"), text);
  assert.ok(text.includes(
    "Net carb, protein, fat, fiber, and hydration goals are the tracker's current settings; only the calorie goal is saved per date.",
  ), text);
});

test("each fat subtype reports the days that actually supplied it", async () => {
  const text = await recap();
  assert.ok(text.includes("  - Saturated: 19g (average across 5 recorded days)"), text);
  // A recorded 0 counts as supplied; a null does not.
  assert.ok(text.includes("  - Trans: 1g (average across 3 recorded days)"), text);
  assert.ok(text.includes("  - Monounsaturated: 10g (average across 1 recorded day)"), text);
  assert.ok(text.includes("  - Polyunsaturated: Not available"), text);
});

test("steps average over the days a count was entered on", async () => {
  const text = await recap();
  assert.ok(text.includes("- Total: 25,000 (from 3 recorded days)"), text);
  assert.ok(text.includes("- Daily average: 8,333 (average across 3 recorded days)"), text);
});

test("activity and hydration average over the days that recorded anything", async () => {
  const text = await recap();
  // Minutes are whole numbers; hydration keeps one decimal place at most.
  assert.ok(text.includes("- Total: 75 minutes · 500 calories burned"), text);
  assert.ok(text.includes("- Daily average: 13 minutes · 83 calories burned (average across 6 recorded days)"), text);
  assert.ok(text.includes("- Daily average: 28.7 oz (average across 6 recorded days)"), text);
  assert.ok(text.includes("- Average goal: 100 oz (current setting)"), text);
});

test("the selected day counts even though it is still in progress", async () => {
  const summary = summarizeRolling([...await earlierDays(), selectedDay], { calories: 2100, waterOunces: 100 });
  assert.equal(summary.daysWithFood, 5);
  assert.equal(summary.calories.total, 8000);
  assert.equal(summary.calories.average, 1600);
  // Without the part-day the average would be 1,875 over four days.
  assert.notEqual(summary.calories.average, 1875);
});

test("a day with food but no saved goal is named rather than judged silently", async () => {
  const days = await earlierDays();
  const summary = summarizeRolling([...days, { ...selectedDay, calorieGoal: null }], { calories: 2100, waterOunces: 100 });
  // August 30, September 3, and the selected day carry no saved goal.
  assert.equal(summary.calories.assumedGoalDays, 3);
  assert.equal(summary.calories.goalTotal, 14400);
});

test("a week with nothing in it says so instead of printing zeroes", () => {
  const empty = rollingDates(SELECTED).map(date => ({
    ...selectedDay, date, items: 0, calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, netCarbs: 0,
    fatDetail: aggregateFat([]), calorieGoal: null, steps: null, waterOunces: 0,
    exerciseMinutes: 0, exerciseCalories: 0, sessions: 0,
  }));
  const summary = summarizeRolling(empty, { calories: 2100, waterOunces: 100 });
  assert.equal(summary.daysWithData, 0);
  assert.equal(summary.calories.average, null);
});

const IN_PROGRESS = "- Includes the selected day's totals as currently recorded; today may still be in progress.";

test("copying today warns that the day is still being written", async () => {
  const text = await recap({ today: SELECTED });
  const lines = text.split("\n");
  // Directly beneath the heading, and nowhere else.
  assert.equal(lines[lines.indexOf(`Rolling 7 Days: ${rangeLabel("2026-08-29", SELECTED)}`) + 1], IN_PROGRESS);
});

test("copying an earlier date carries no in-progress warning", async () => {
  const text = await recap({ today: NEXT_DAY });
  assert.ok(!text.includes(IN_PROGRESS), text);
  // The day still counts in the week; only the warning is dropped.
  assert.ok(text.includes("- Daily average consumed: 1,600 (average across 5 recorded days)"), text);
});

/* ------------------------------------------------------------ rounding */

test("a displayed difference agrees with the displayed intake", async () => {
  // 50.996 g of net carbs displays as 51 g, so the shortfall against a 125 g
  // minimum must read 74 g, never 73.97 g.
  const day = { ...selectedDay, netCarbs: 50.996 };
  const text = dayRecapText({
    day, activities: [], goals, netCarbGoals: { min: 125, max: 150 },
    priorDays: await earlierDays(), journal: "", today: NEXT_DAY,
  });
  assert.ok(text.includes("Net carbs: 51g of 125 to 150 g — 74g to reach the 125g minimum"), text);
  assert.ok(!text.includes("73.97"), text);
  // The same rule in the rolling averages: the shortfall is worked out from
  // the 105.2 g printed, not from the unrounded 105.199 g behind it.
  assert.ok(text.includes("- Net carbs: 105.2g — 19.8g below the current 125g minimum"), text);
});

test("grams keep one decimal place, and minutes and steps stay whole", async () => {
  const text = await recap({ today: NEXT_DAY });
  const rolling = text.slice(text.indexOf("Rolling 7 Days:"));
  // No gram, ounce, minute, or step figure carries a second decimal place.
  assert.doesNotMatch(rolling, /\d+\.\d\d/);
  assert.doesNotMatch(rolling, /\d+\.\d+ minutes/);
});

/* ------------------------------------------------------------- journal */

test("the journal for the selected date is copied exactly as saved", async () => {
  const text = await recap();
  assert.ok(text.endsWith(`Journal:\n${journal}`), text);
});

test("a day with no journal says nothing was recorded", async () => {
  const text = await recap({ journal: "" });
  assert.ok(text.includes("Journal: Nothing recorded"), text);
  assert.ok(!text.includes("Slow morning"), text);
});

test("history that could not be loaded is admitted, not averaged", async () => {
  const text = await recap({ priorDays: null, journal: null });
  assert.ok(text.includes(`Rolling 7 Days: ${rangeLabel("2026-08-29", SELECTED)}`), text);
  assert.ok(text.includes("The earlier days could not be loaded, so no seven-day summary is available."), text);
  assert.ok(text.includes("Journal: Could not be loaded"), text);
  // The day itself is still there in full.
  assert.ok(text.includes("Calories: 500 of 2100 (1600 remaining)"), text);
});
