/**
 * The minimum and maximum net-carbohydrate goals, against a real database with
 * every migration applied.
 *
 * The single net-carb goal has always been a ceiling — the diary reports how
 * many grams are left before it — so the migration maps it onto the maximum
 * and starts the minimum at 0. Nobody's stored goal is discarded, and a
 * profile that never sets a range behaves exactly as it did.
 *
 * There is still deliberately no total-carbohydrate goal.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { migrationFiles, openTestDatabase } from "../../tests/support/d1-sqlite.mjs";
import { goalContext, goalRows, netCarbGoalsFrom, nutritionRows } from "../../app/nutrition.ts";

/** The migrations directory, as a path `readFileSync` accepts on Windows too. */
const MIGRATIONS = new URL("../../drizzle/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const database = await openTestDatabase();
const goalsApi = await import("../../app/api/goals/route.ts");
const entriesApi = await import("../../app/api/entries/route.ts");
const reportsApi = await import("../../app/api/reports/route.ts");

const headers = { "content-type": "application/json", "x-food-tracker-profile": "chris" };
const shortcuts = { waterShortcutOne: 6, waterShortcutTwo: 8, waterShortcutThree: 12 };
const base = { calories: 2100, protein: 150, fat: 95, fiber: 35, waterOunces: 100, ...shortcuts };
const save = (body) => goalsApi.PUT(new Request("http://x/api/goals", { method: "PUT", headers, body: JSON.stringify(body) }));
const readGoals = async () => {
  const response = await entriesApi.GET(new Request("http://x/api/entries?date=2026-08-20", { headers }));
  return (await response.json()).goals;
};

test("the migration adds both ends of the range and keeps the original column", () => {
  assert.ok(migrationFiles().includes("0012_net_carb_goal_range.sql"));
  const byName = new Map(database.prepare("pragma table_info(nutrition_goals)").all().map(column => [column.name, column]));
  assert.ok(byName.has("net_carbs_min"));
  assert.ok(byName.has("net_carbs_max"));
  // Both are required with a default, like every non-optional goal here.
  assert.equal(byName.get("net_carbs_min").notnull, 1);
  assert.equal(byName.get("net_carbs_max").notnull, 1);
  // The original column stays, so nothing that reads it breaks.
  assert.ok(byName.has("net_carbs"));
  // And still no total-carbohydrate goal.
  assert.equal(byName.has("carbs"), false);
  assert.equal(byName.has("total_carbs"), false);
});

test("legacy goal data is migrated into the range rather than discarded", () => {
  // Built the way the production database was: every migration up to the one
  // before the range, a real goals row written by the old code, and only then
  // the new migration. That is what the remote D1 database will experience.
  const older = new DatabaseSync(":memory:");
  for (const name of migrationFiles()) {
    if (name.startsWith("0012")) break;
    older.exec(readFileSync(join(MIGRATIONS, name), "utf8"));
  }
  older.prepare(`
    insert into nutrition_goals (owner, calories, protein, fat, net_carbs, fiber_goal, water_ounces)
    values ('legacy', 1600, 110, 105, 40, 25, 64)
  `).run();
  const before = older.prepare("select * from nutrition_goals where owner = 'legacy'").get();
  assert.equal("net_carbs_min" in before, false, "the range does not exist yet");

  older.exec(readFileSync(join(MIGRATIONS, "0012_net_carb_goal_range.sql"), "utf8"));

  const row = older.prepare("select * from nutrition_goals where owner = 'legacy'").get();
  assert.equal(row.net_carbs, 40, "the original goal is never discarded");
  assert.equal(row.net_carbs_max, 40, "the single goal becomes the maximum");
  assert.equal(row.net_carbs_min, 0, "no minimum, exactly as the profile behaved before");
  // Every other goal is left exactly as it was.
  assert.equal(row.calories, 1600);
  assert.equal(row.fiber_goal, 25);
  // And it reads back through the shared helper as a usable range.
  assert.deepEqual(
    netCarbGoalsFrom({ netCarbs: row.net_carbs, netCarbsMin: row.net_carbs_min, netCarbsMax: row.net_carbs_max }),
    { min: 0, max: 40 },
  );
  older.close();
});

test("a valid range saves and reads back", async () => {
  const response = await save({ ...base, netCarbsMin: 100, netCarbsMax: 150 });
  assert.equal(response.status, 200);
  const saved = await readGoals();
  assert.equal(saved.netCarbsMin, 100);
  assert.equal(saved.netCarbsMax, 150);
  // The original column keeps the ceiling, so nothing reading it is misled.
  assert.equal(saved.netCarbs, 150);
});

test("a minimum greater than the maximum is rejected and nothing is written", async () => {
  await save({ ...base, netCarbsMin: 100, netCarbsMax: 150 });
  const response = await save({ ...base, netCarbsMin: 160, netCarbsMax: 150 });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /minimum .* cannot be more than the maximum/i);
  const saved = await readGoals();
  assert.equal(saved.netCarbsMin, 100, "the stored range is untouched by a refused save");
  assert.equal(saved.netCarbsMax, 150);
});

test("a negative minimum or a zero maximum is rejected", async () => {
  for (const range of [{ netCarbsMin: -5, netCarbsMax: 150 }, { netCarbsMin: 0, netCarbsMax: 0 }, { netCarbsMin: 0, netCarbsMax: -1 }]) {
    const response = await save({ ...base, ...range });
    assert.equal(response.status, 400, `${JSON.stringify(range)} should be refused`);
  }
});

test("a zero minimum is allowed and means no floor", async () => {
  const response = await save({ ...base, netCarbsMin: 0, netCarbsMax: 25 });
  assert.equal(response.status, 200);
  const saved = await readGoals();
  assert.equal(saved.netCarbsMin, 0);
  assert.equal(saved.netCarbsMax, 25);
});

test("an older payload carrying only the single goal still saves", async () => {
  // Nothing that has not been taught about the range starts failing.
  const response = await save({ ...base, netCarbs: 30 });
  assert.equal(response.status, 200);
  const saved = await readGoals();
  assert.equal(saved.netCarbs, 30);
  assert.equal(saved.netCarbsMax, 30);
  assert.equal(saved.netCarbsMin, 0);
});

test("the saturated-fat goal is still optional alongside the range", async () => {
  await save({ ...base, netCarbsMin: 100, netCarbsMax: 150, saturatedFat: 16 });
  assert.equal((await readGoals()).saturatedFat, 16);
  await save({ ...base, netCarbsMin: 100, netCarbsMax: 150, saturatedFat: "" });
  assert.equal((await readGoals()).saturatedFat, null);
});

test("the reports feed returns both ends of the range", async () => {
  await save({ ...base, netCarbsMin: 100, netCarbsMax: 150 });
  const response = await reportsApi.GET(new Request("http://x/api/reports?start=2026-08-20&end=2026-08-22", { headers }));
  const data = await response.json();
  assert.equal(data.goals.netCarbsMin, 100);
  assert.equal(data.goals.netCarbsMax, 150);
  assert.equal(data.goals.netCarbs, 150);
  assert.equal("carbs" in data.goals, false, "there must be no total-carbohydrate goal");
});

test("the printed goals table shows the range, and a maximum-only goal as one figure", () => {
  const ranged = goalRows({ calories: 2100, netCarbs: 150, netCarbsMin: 100, netCarbsMax: 150, protein: 150, fat: 95, saturatedFat: null, fiber: 35, waterOunces: 100 });
  assert.equal(ranged.find(row => row.key === "netCarbs").target, "100 to 150 g");
  const ceilingOnly = goalRows({ calories: 2100, netCarbs: 25, netCarbsMin: 0, netCarbsMax: 25, protein: 150, fat: 95, saturatedFat: null, fiber: 35, waterOunces: 100 });
  assert.equal(ceilingOnly.find(row => row.key === "netCarbs").target, "25 g");
  // Legacy data with neither end still prints the single goal it has.
  const legacy = goalRows({ calories: 2100, netCarbs: 40, protein: 150, fat: 95, saturatedFat: null, fiber: 35, waterOunces: 100 });
  assert.equal(legacy.find(row => row.key === "netCarbs").target, "40 g");
});

test("the calorie-equivalent note is worked out against the maximum", () => {
  const context = goalContext({ calories: 2100, netCarbs: 125, netCarbsMin: 100, netCarbsMax: 125 });
  // 125 x 4 / 2100 = 23.8%
  assert.equal(context.netCarbs, "23.8% calorie-equivalent");
});

test("the nutrition table reports the range and says when the average is under the minimum", () => {
  const averages = { calories: 2050, protein: 157.5, carbs: 85, fat: 110, fiber: 32.6, netCarbs: 52.4 };
  const fat = { total: 0, subtotals: { saturatedFat: null, transFat: null, monounsaturatedFat: null, polyunsaturatedFat: null }, known: { saturatedFat: 0, transFat: 0, monounsaturatedFat: 0, polyunsaturatedFat: 0 }, missing: { saturatedFat: 0, transFat: 0, monounsaturatedFat: 0, polyunsaturatedFat: 0 }, records: 0 };
  const goals = { calories: 2100, netCarbs: 150, netCarbsMin: 100, netCarbsMax: 150, protein: 150, fat: 95, saturatedFat: null, fiber: 35, waterOunces: 100 };
  const row = nutritionRows({ averages, fat, recordedDays: 3, goals }).find(item => item.key === "netCarbs");
  assert.equal(row.goal, "100 to 150 g");
  assert.match(row.goalContext, /of maximum/);
  // Under the minimum is stated, never left to read as being on track.
  assert.match(row.goalContext, /below the 100 g minimum/);

  // Total carbohydrates still have no goal of their own.
  const carbs = nutritionRows({ averages, fat, recordedDays: 3, goals }).find(item => item.key === "carbs");
  assert.equal(carbs.goal, "no goal");
});
