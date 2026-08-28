/**
 * The goals API and the reports feed's nutrition block, against a real
 * database with every migration applied.
 *
 * The saturated-fat goal is the only optional one: blank must stay null so no
 * percentage is worked out against it, and saving other goals must never
 * invent one. No total-carbohydrate goal exists or may be created.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { migrationFiles, openTestDatabase } from "../../tests/support/d1-sqlite.mjs";
import { goalContext, nutritionRows } from "../../app/nutrition.ts";

const database = await openTestDatabase();
const goalsApi = await import("../../app/api/goals/route.ts");
const entriesApi = await import("../../app/api/entries/route.ts");
const reportsApi = await import("../../app/api/reports/route.ts");

const headers = { "content-type": "application/json", "x-food-tracker-profile": "chris" };
const shortcuts = { waterShortcutOne: 6, waterShortcutTwo: 8, waterShortcutThree: 12 };
const base = { calories: 2100, netCarbs: 125, protein: 150, fat: 95, fiber: 35, waterOunces: 100, ...shortcuts };
const save = (body) => goalsApi.PUT(new Request("http://x/api/goals", { method: "PUT", headers, body: JSON.stringify(body) }));
const readGoals = async () => {
  const response = await entriesApi.GET(new Request("http://x/api/entries?date=2026-08-20", { headers }));
  return (await response.json()).goals;
};

test("the migration adds a nullable saturated-fat goal and no total-carb goal", () => {
  assert.ok(migrationFiles().includes("0010_saturated_fat_goal.sql"));
  const columns = database.prepare("pragma table_info(nutrition_goals)").all();
  const byName = new Map(columns.map(column => [column.name, column]));
  assert.ok(byName.has("saturated_fat"));
  // Optional, unlike every other goal, so "not set" stays distinct from zero.
  assert.equal(byName.get("saturated_fat").notnull, 0);
  assert.equal(byName.get("saturated_fat").dflt_value, null);
  // Every other goal keeps its NOT NULL default, and no carb goal appeared.
  assert.equal(byName.get("net_carbs").notnull, 1);
  assert.equal(byName.has("carbs"), false);
  assert.equal(byName.has("total_carbs"), false);
});

test("goals save without a saturated-fat goal, leaving it unset", () => {
  return save(base).then(async response => {
    assert.equal(response.status, 200);
    const saved = await readGoals();
    assert.equal(saved.calories, 2100);
    assert.equal(saved.netCarbs, 125);
    assert.equal(saved.fiber, 35);
    // Not zero: nothing has been configured.
    assert.equal(saved.saturatedFat, null);
  });
});

test("a saturated-fat goal can be added later and read back", async () => {
  await save({ ...base, saturatedFat: 16 });
  const saved = await readGoals();
  assert.equal(saved.saturatedFat, 16);
  assert.equal(goalContext(saved).saturatedFat, "6.9% of calories · 16.8% of total fat");
});

test("a blank saturated-fat goal clears it back to unset", async () => {
  await save({ ...base, saturatedFat: "" });
  assert.equal((await readGoals()).saturatedFat, null);
  await save({ ...base, saturatedFat: 16 });
  await save({ ...base, saturatedFat: null });
  assert.equal((await readGoals()).saturatedFat, null);
});

test("a zero or negative saturated-fat goal is refused", async () => {
  for (const value of [0, -3]) {
    const response = await save({ ...base, saturatedFat: value });
    assert.equal(response.status, 400, `saturatedFat ${value} should be refused`);
    assert.match((await response.json()).error, /more than zero, or left blank/);
  }
  // The stored goal is untouched by a refused save.
  assert.equal((await readGoals()).saturatedFat, null);
});

test("the reports feed returns the current goals and the nutrition averages", async () => {
  await save({ ...base, saturatedFat: 16 });
  const insert = database.prepare(`
    insert into food_entries (owner, eaten_on, meal, name, serving, calories, protein, fat, carbs, fiber,
      saturated_fat, trans_fat, monounsaturated_fat, polyunsaturated_fat)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // Two recorded days either side of one blank day.
  insert.run("chris", "2026-08-20", "Lunch", "A", "1", 2000, 150, 100, 160, 30, 30, 0, 40, 12);
  insert.run("chris", "2026-08-22", "Lunch", "B", "1", 2200, 160, 120, 180, 40, 40, null, null, null);

  const response = await reportsApi.GET(new Request(
    "http://x/api/reports?start=2026-08-20&end=2026-08-22", { headers },
  ));
  const data = await response.json();

  assert.equal(data.goals.calories, 2100);
  assert.equal(data.goals.saturatedFat, 16);
  assert.equal("carbs" in data.goals, false, "there must be no total-carbohydrate goal");

  // The blank middle day is excluded from the divisor, as everywhere else.
  assert.equal(data.nutrition.recordedDays, 2);
  assert.equal(data.nutrition.averages.calories, 2100);
  assert.equal(data.nutrition.averages.protein, 155);
  assert.equal(data.nutrition.averages.carbs, 170);
  assert.equal(data.nutrition.averages.fat, 110);
  assert.equal(data.nutrition.averages.fiber, 35);
  assert.equal(data.nutrition.averages.netCarbs, 135);
  assert.equal(data.nutrition.subtypeDays.saturatedFat, 2);
  assert.equal(data.nutrition.subtypeDays.transFat, 1);

  // And those figures feed the same shared table the PDFs print.
  const rows = nutritionRows({
    averages: data.nutrition.averages, fat: data.totals.fatDetail,
    recordedDays: data.nutrition.recordedDays, goals: data.goals,
    subtypeDays: data.nutrition.subtypeDays,
  });
  const carbs = rows.find(row => row.key === "carbs");
  assert.equal(carbs.average, "170.0 g");
  assert.equal(carbs.goal, "no goal");
  // 170 x 4 / 2100 = 32.4%
  assert.equal(carbs.calorieShare, "32.4% of average calories");
  const fiber = rows.find(row => row.key === "fiber");
  assert.equal(fiber.calorieShare, "");
  assert.equal(fiber.goalContext, "100.0% of goal");
});

test("one profile's goals never reach the other", async () => {
  await save({ ...base, saturatedFat: 16 });
  const hers = await entriesApi.GET(new Request("http://x/api/entries?date=2026-08-20", {
    headers: { "x-food-tracker-profile": "sarah" },
  }));
  assert.equal((await hers.json()).goals, null);
});
