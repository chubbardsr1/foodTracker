/**
 * The diary and saved-food routes against a real SQLite database with every
 * migration in `drizzle/` applied, in order, exactly as Wrangler applies them.
 *
 * This covers persistence, request and response mapping, serving multipliers,
 * fractional servings, null against zero, and rows written before the fat
 * breakdown existed.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { migrationFiles, openTestDatabase } from "../../tests/support/d1-sqlite.mjs";

const database = await openTestDatabase();
const entries = await import("../../app/api/entries/route.ts");
const customFoods = await import("../../app/api/custom-foods/route.ts");

const headers = { "content-type": "application/json", "x-food-tracker-profile": "chris" };
const post = (body) => entries.POST(new Request("http://x/api/entries", { method: "POST", headers, body: JSON.stringify(body) }));
const put = (body) => entries.PUT(new Request("http://x/api/entries", { method: "PUT", headers, body: JSON.stringify(body) }));
const listEntries = (date) => entries.GET(new Request(`http://x/api/entries?date=${date}`, { headers }));
const listFoods = () => customFoods.GET(new Request("http://x/api/custom-foods", { headers }));
const putFood = (body) => customFoods.PUT(new Request("http://x/api/custom-foods", { method: "PUT", headers, body: JSON.stringify(body) }));

const meal = { meal: "Lunch", eatenOn: "2026-08-20", servings: 1, calories: 200, protein: 10, fat: 20, carbs: 12, fiber: 3 };

test("the migration adds nullable fat columns without touching the rest", () => {
  assert.ok(migrationFiles().includes("0009_fat_breakdown.sql"));
  for (const table of ["food_entries", "custom_foods"]) {
    const columns = database.prepare(`pragma table_info(${table})`).all();
    const byName = new Map(columns.map(column => [column.name, column]));
    for (const column of ["saturated_fat", "trans_fat", "monounsaturated_fat", "polyunsaturated_fat"]) {
      assert.ok(byName.has(column), `${table} is missing ${column}`);
      // Nullable, with no default, so an unrecorded value can never be a zero.
      assert.equal(byName.get(column).notnull, 0);
      assert.equal(byName.get(column).dflt_value, null);
    }
    // Total fat is untouched and still required.
    assert.equal(byName.get("fat").notnull, 1);
  }
});

test("a manual entry stores known, zero, and unknown subtypes as given", async () => {
  const response = await post({
    ...meal, name: "Manual entry", serving: "1 bowl",
    saturatedFat: 6, transFat: 0, monounsaturatedFat: "", polyunsaturatedFat: null,
  });
  assert.equal(response.status, 201);
  const { entry } = await response.json();
  assert.equal(entry.fat, 20);
  assert.equal(entry.saturatedFat, 6);
  assert.equal(entry.transFat, 0);
  assert.equal(entry.monounsaturatedFat, null);
  assert.equal(entry.polyunsaturatedFat, null);

  const row = database.prepare("select saturated_fat, trans_fat, monounsaturated_fat from food_entries where id = ?").get(entry.id);
  assert.equal(row.saturated_fat, 6);
  assert.equal(row.trans_fat, 0);
  assert.equal(row.monounsaturated_fat, null);
});

test("servings multiply every known subtype and leave unknown alone", async () => {
  const { entry } = await (await post({
    ...meal, name: "Double portion", serving: "1 bowl", servings: 2,
    saturatedFat: 6, transFat: 0.5, polyunsaturatedFat: 2,
  })).json();
  assert.equal(entry.fat, 40);
  assert.equal(entry.saturatedFat, 12);
  assert.equal(entry.transFat, 1);
  assert.equal(entry.polyunsaturatedFat, 4);
  assert.equal(entry.monounsaturatedFat, null);
  assert.equal(entry.serving, "2 × 1 bowl");
});

test("a fractional serving scales the same way", async () => {
  const { entry } = await (await post({
    ...meal, name: "Half portion", serving: "1 bowl", servings: 0.5,
    saturatedFat: 6.5, transFat: 0,
  })).json();
  assert.equal(entry.fat, 10);
  assert.equal(entry.saturatedFat, 3.25);
  assert.equal(entry.transFat, 0);
});

test("a negative subtype is refused with a message naming the field", async () => {
  const response = await post({ ...meal, name: "Bad", serving: "1", saturatedFat: -1 });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Saturated fat must be grams, zero or more/);
});

test("a subtype above total fat is refused", async () => {
  const response = await post({ ...meal, name: "Impossible", serving: "1", fat: 5, saturatedFat: 9 });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /cannot be more than the 5 g of total fat/);
});

test("ordinary label rounding is accepted", async () => {
  const response = await post({ ...meal, name: "Rounded", serving: "1", fat: 5, saturatedFat: 5.4 });
  assert.equal(response.status, 201);
});

test("the four are never required to add up to total fat", async () => {
  const response = await post({
    ...meal, name: "Partial breakdown", serving: "1", fat: 30, saturatedFat: 2, transFat: 0,
  });
  assert.equal(response.status, 201);
  const { entry } = await response.json();
  assert.equal(entry.fat, 30);
});

test("editing one entry changes only that entry, subtypes included", async () => {
  const first = (await (await post({ ...meal, name: "Edit me", serving: "1", saturatedFat: 4 })).json()).entry;
  const second = (await (await post({ ...meal, name: "Leave me", serving: "1", saturatedFat: 9 })).json()).entry;

  const updated = (await (await put({
    id: first.id, meal: "Dinner", name: "Edited", serving: "1",
    calories: 210, protein: 11, fat: 22, carbs: 13, fiber: 4,
    saturatedFat: 7, transFat: 0, monounsaturatedFat: "", polyunsaturatedFat: 1.5,
  })).json()).entry;
  assert.equal(updated.saturatedFat, 7);
  assert.equal(updated.transFat, 0);
  assert.equal(updated.monounsaturatedFat, null);
  assert.equal(updated.polyunsaturatedFat, 1.5);

  const untouched = database.prepare("select saturated_fat from food_entries where id = ?").get(second.id);
  assert.equal(untouched.saturated_fat, 9);
});

test("saving to My Foods keeps one full serving, not the multiplied amount", async () => {
  await post({
    ...meal, name: "Saved with fat", serving: "1 bowl", servings: 3,
    saturatedFat: 6, transFat: 0, saveCustom: true,
  });
  const { foods } = await (await listFoods()).json();
  const saved = foods.find(food => food.name === "Saved with fat");
  assert.ok(saved);
  assert.equal(saved.fat, 20);
  assert.equal(saved.saturatedFat, 6);
  assert.equal(saved.transFat, 0);
  assert.equal(saved.monounsaturatedFat, null);
});

test("a legacy saved food can be given a breakdown later, and is never deleted", async () => {
  // Written straight to the table the way a pre-migration row looks.
  database.prepare(
    "insert into custom_foods (owner, name, serving, calories, protein, fat, carbs, fiber) values (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run("chris", "Legacy food", "1 slice", 90, 4, 7, 2, 0);
  const before = (await (await listFoods()).json()).foods.find(food => food.name === "Legacy food");
  assert.ok(before, "the legacy saved food must survive the migration");
  assert.equal(before.saturatedFat, null);

  const response = await putFood({
    id: before.id, name: "Legacy food", serving: "1 slice",
    calories: 90, protein: 4, fat: 7, carbs: 2, fiber: 0,
    saturatedFat: 4.5, transFat: 0,
  });
  assert.equal(response.status, 200);
  const { food } = await response.json();
  assert.equal(food.saturatedFat, 4.5);
  assert.equal(food.transFat, 0);
  assert.equal(food.monounsaturatedFat, null);
});

test("a saved food refuses a subtype larger than its total fat", async () => {
  const existing = (await (await listFoods()).json()).foods.find(food => food.name === "Legacy food");
  const response = await putFood({
    id: existing.id, name: "Legacy food", serving: "1 slice",
    calories: 90, protein: 4, fat: 7, carbs: 2, fiber: 0, saturatedFat: 20,
  });
  assert.equal(response.status, 400);
});

test("a legacy diary entry loads and reads as unknown, not zero", async () => {
  database.prepare(
    "insert into food_entries (owner, eaten_on, meal, name, serving, calories, protein, fat, carbs, fiber) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run("chris", "2026-01-05", "Breakfast", "Old entry", "1 cup", 150, 5, 9, 20, 2);
  const { entries: rows } = await (await listEntries("2026-01-05")).json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fat, 9);
  assert.equal(rows[0].saturatedFat, null);
  assert.equal(rows[0].transFat, null);
});

test("one profile never sees the other's fat data", async () => {
  await entries.POST(new Request("http://x/api/entries", {
    method: "POST",
    headers: { "content-type": "application/json", "x-food-tracker-profile": "sarah" },
    body: JSON.stringify({ ...meal, eatenOn: "2026-08-21", name: "Sarah's lunch", serving: "1", saturatedFat: 3 }),
  }));
  const mine = await (await listEntries("2026-08-21")).json();
  assert.equal(mine.entries.length, 0);
  const hers = await (await entries.GET(new Request("http://x/api/entries?date=2026-08-21", {
    headers: { "x-food-tracker-profile": "sarah" },
  }))).json();
  assert.equal(hers.entries.length, 1);
  assert.equal(hers.entries[0].saturatedFat, 3);
});
