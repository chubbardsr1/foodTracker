/**
 * The reports feed's fat rollup, against a real database.
 *
 * The report divides by its own recorded days, so a day with no food must not
 * pull a subtype total down, and a subtype nobody recorded must stay null all
 * the way out of the API.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { openTestDatabase } from "../../tests/support/d1-sqlite.mjs";

const database = await openTestDatabase();
const reports = await import("../../app/api/reports/route.ts");
const exportFeed = await import("../../app/api/export/route.ts");

const insert = database.prepare(`
  insert into food_entries (owner, eaten_on, meal, name, serving, calories, protein, fat, carbs, fiber,
    saturated_fat, trans_fat, monounsaturated_fat, polyunsaturated_fat)
  values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// 20th: one complete entry and one bare one. 22nd: a legacy entry only.
insert.run("chris", "2026-08-20", "Lunch", "Burger", "1", 600, 30, 33, 40, 2, 12, 0.5, 14, 4);
insert.run("chris", "2026-08-20", "Dinner", "Salad", "1", 220, 6, 14, 12, 4, null, null, null, null);
insert.run("chris", "2026-08-22", "Lunch", "Legacy", "1", 400, 20, 18, 30, 5, null, null, null, null);
insert.run("sarah", "2026-08-20", "Lunch", "Hers", "1", 500, 25, 40, 30, 3, 20, 0, 10, 5);

const headers = { "x-food-tracker-profile": "chris" };
const report = async () => (await reports.GET(new Request(
  "http://x/api/reports?start=2026-08-20&end=2026-08-22", { headers },
))).json();

test("each day reports its own fat rollup, gaps included", async () => {
  const { days } = await report();
  const twentieth = days.find(day => day.date === "2026-08-20");
  assert.equal(twentieth.fat, 47);
  assert.equal(twentieth.fatDetail.total, 47);
  assert.equal(twentieth.fatDetail.records, 2);
  assert.equal(twentieth.fatDetail.subtotals.saturatedFat, 12);
  assert.equal(twentieth.fatDetail.subtotals.transFat, 0.5);
  assert.deepEqual(twentieth.fatDetail.known.saturatedFat, 1);
  assert.deepEqual(twentieth.fatDetail.missing.saturatedFat, 1);
});

test("a day with no food contributes nothing rather than zeros", async () => {
  const { days } = await report();
  const empty = days.find(day => day.date === "2026-08-21");
  assert.equal(empty.items, 0);
  assert.equal(empty.fatDetail.records, 0);
  assert.equal(empty.fatDetail.subtotals.saturatedFat, null);
});

test("a day of legacy entries reports total fat and unknown subtypes", async () => {
  const { days } = await report();
  const legacy = days.find(day => day.date === "2026-08-22");
  assert.equal(legacy.fatDetail.total, 18);
  assert.equal(legacy.fatDetail.subtotals.saturatedFat, null);
  assert.equal(legacy.fatDetail.missing.saturatedFat, 1);
});

test("the range total is the merge of the days, scoped to one profile", async () => {
  const { totals } = await report();
  // Sarah's 40 g of fat on the same date is not in Chris's report.
  assert.equal(totals.fatDetail.total, 65);
  assert.equal(totals.fatDetail.records, 3);
  assert.equal(totals.fatDetail.subtotals.saturatedFat, 12);
  assert.equal(totals.fatDetail.subtotals.polyunsaturatedFat, 4);
  assert.equal(totals.fatDetail.known.saturatedFat, 1);
  assert.equal(totals.fatDetail.missing.saturatedFat, 2);
});

test("the export feed carries per-day sums and the counts behind them", async () => {
  const response = await exportFeed.GET(new Request(
    "http://x/api/export?start=2026-08-20&end=2026-08-22&sections=dailySummaries,foodEntries", { headers },
  ));
  const payload = await response.json();

  const twentieth = payload.dailySummaries.find(day => day.date === "2026-08-20");
  assert.equal(twentieth.fat, 47);
  assert.equal(twentieth.saturatedFat, 12);
  assert.equal(twentieth.transFat, 0.5);
  assert.deepEqual(twentieth.fatSubtypeEntries, {
    saturatedFat: 1, transFat: 1, monounsaturatedFat: 1, polyunsaturatedFat: 1,
  });

  const legacy = payload.dailySummaries.find(day => day.date === "2026-08-22");
  assert.equal(legacy.saturatedFat, null, "an unrecorded subtype must not serialise as zero");
  assert.equal(legacy.fatSubtypeEntries.saturatedFat, 0);

  // Total carbohydrates are still exported alongside net carbs.
  assert.equal(twentieth.carbs, 52);
  assert.equal(twentieth.netCarbs, 46);

  const salad = payload.foodEntries.find(entry => entry.name === "Salad");
  assert.equal(salad.fat, 14);
  assert.equal(salad.saturatedFat, null);
  const burger = payload.foodEntries.find(entry => entry.name === "Burger");
  assert.equal(burger.monounsaturatedFat, 14);
});

test("goals never gain a total-carb or fat-subtype target", async () => {
  const response = await exportFeed.GET(new Request(
    "http://x/api/export?start=2026-08-20&end=2026-08-22&sections=goals", { headers },
  ));
  const { goals } = await response.json();
  const fields = Object.keys(goals.current ?? {
    calories: 0, protein: 0, fat: 0, netCarbs: 0, fiber: 0, waterOunces: 0,
  });
  assert.deepEqual(fields.sort(), ["calories", "fat", "fiber", "netCarbs", "protein", "waterOunces"]);
});
