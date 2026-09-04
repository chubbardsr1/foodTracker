/**
 * The seven-day nutrition trend on the Reports page.
 *
 * It is served by the existing reports feed rather than a new endpoint, so
 * what is checked here is that the feed really does supply the four columns
 * the trend prints, that every day in the range appears including the empty
 * ones, and that the grand total the screen adds up comes out right.
 *
 * The rule the whole application follows for a rolling range applies here too:
 * it ends on the last completed day and never includes today.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { openTestDatabase } from "../../tests/support/d1-sqlite.mjs";
import { addDays, lastCompleteDays, localDate } from "../../app/shared.ts";

const database = await openTestDatabase();
const reportsApi = await import("../../app/api/reports/route.ts");

const headers = { "content-type": "application/json", "x-food-tracker-profile": "chris" };
const range = lastCompleteDays(7);
const dates = [];
for (let cursor = range.start; cursor <= range.end; cursor = addDays(cursor, 1)) dates.push(cursor);

const insert = database.prepare(`
  insert into food_entries (owner, eaten_on, meal, name, serving, calories, protein, fat, carbs, fiber)
  values (?, ?, 'Lunch', ?, '1', ?, 20, ?, ?, ?)
`);
// Five of the seven days hold food; the second and the last stay deliberately
// empty so the zero rows can be checked.
const logged = [
  { date: dates[0], calories: 1800, fat: 90, carbs: 120, fiber: 25 },
  { date: dates[2], calories: 2000, fat: 100, carbs: 130, fiber: 30 },
  { date: dates[3], calories: 1750.5, fat: 88.25, carbs: 110.5, fiber: 22.75 },
  { date: dates[4], calories: 2100, fat: 105, carbs: 140, fiber: 35 },
  { date: dates[5], calories: 1900, fat: 95, carbs: 125, fiber: 28 },
];
for (const day of logged) insert.run("chris", day.date, `Meal ${day.date}`, day.calories, day.fat, day.carbs, day.fiber);
// One entry belonging to the other profile, on a day this profile also used.
insert.run("sarah", dates[0], "Hers", 999, 99, 99, 9);
// And one on today, which the trend must never pick up.
insert.run("chris", localDate(), "Today's lunch", 5000, 200, 400, 50);

const report = async () => {
  const response = await reportsApi.GET(new Request(
    `http://x/api/reports?start=${range.start}&end=${range.end}`, { headers },
  ));
  assert.equal(response.status, 200);
  return response.json();
};

/** The grand total exactly as the trend's footer builds it, column by column. */
const grandTotal = (days) => days.reduce((sum, day) => ({
  calories: Math.round((sum.calories + day.calories) * 100) / 100,
  fat: Math.round((sum.fat + day.fat) * 100) / 100,
  carbs: Math.round((sum.carbs + day.carbs) * 100) / 100,
  fiber: Math.round((sum.fiber + day.fiber) * 100) / 100,
}), { calories: 0, fat: 0, carbs: 0, fiber: 0 });

test("the trend covers seven completed days ending yesterday", async () => {
  const data = await report();
  assert.equal(data.days.length, 7);
  assert.equal(data.days[0].date, range.start);
  assert.equal(data.days[6].date, range.end);
  assert.equal(range.end, addDays(localDate(), -1));
  // Oldest to newest, as every table on this page reads.
  assert.deepEqual(data.days.map(day => day.date), [...dates].sort());
  // Today is still in progress and is deliberately absent, however much was
  // logged on it.
  assert.equal(data.days.some(day => day.date === localDate()), false);
});

test("every day carries the four columns the trend prints", async () => {
  const data = await report();
  for (const day of data.days) {
    for (const field of ["calories", "fat", "carbs", "fiber"]) {
      assert.equal(typeof day[field], "number", `${day.date} must report ${field}`);
    }
  }
  const first = data.days.find(day => day.date === dates[0]);
  assert.equal(first.calories, 1800);
  assert.equal(first.fat, 90);
  // Total carbohydrates, not net carbs: the trend's carbohydrate column.
  assert.equal(first.carbs, 120);
  assert.equal(first.fiber, 25);
  assert.equal(first.netCarbs, 95, "net carbs are still available, but are not what the column shows");
});

test("days with nothing logged still appear, showing zeros", async () => {
  const data = await report();
  const blank = data.days.find(day => day.date === dates[1]);
  assert.equal(blank.items, 0);
  assert.deepEqual(
    [blank.calories, blank.fat, blank.carbs, blank.fiber],
    [0, 0, 0, 0],
  );
  assert.equal(data.days.filter(day => day.items > 0).length, 5);
});

test("the grand total sums each column across the seven days", async () => {
  const data = await report();
  const total = grandTotal(data.days);
  assert.equal(total.calories, 9550.5);
  assert.equal(total.fat, 478.25);
  assert.equal(total.carbs, 625.5);
  assert.equal(total.fiber, 140.75);
  // It agrees with the feed's own calorie total, so the two cannot drift.
  assert.equal(total.calories, data.totals.calories);
  // Unlike units are never combined: there is no single number adding calories
  // to grams anywhere in the total.
  assert.notEqual(total.calories, total.calories + total.fat);
});

test("the other profile's food never appears in this profile's trend", async () => {
  const data = await report();
  const shared = data.days.find(day => day.date === dates[0]);
  assert.equal(shared.calories, 1800, "999 calories belonging to Sarah must not be counted");
  const theirs = await (await reportsApi.GET(new Request(
    `http://x/api/reports?start=${range.start}&end=${range.end}`,
    { headers: { "x-food-tracker-profile": "sarah" } },
  ))).json();
  assert.equal(theirs.days.find(day => day.date === dates[0]).calories, 999);
});
