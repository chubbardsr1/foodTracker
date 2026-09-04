/**
 * Moving, copying, and saving a diary entry, against a real database with
 * every migration applied.
 *
 * The three things being protected here:
 *  - A move updates the one existing row. It never leaves a copy behind and
 *    never produces two rows for one entry.
 *  - A copy creates a new row and does not touch the entry it came from.
 *  - Saving to My Foods writes a reusable food and changes nothing in the
 *    diary.
 *
 * Every one of them is scoped by profile, so one profile can never move,
 * copy from, or read the other's records.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { openTestDatabase } from "../../tests/support/d1-sqlite.mjs";

const database = await openTestDatabase();
const entriesApi = await import("../../app/api/entries/route.ts");
const exerciseApi = await import("../../app/api/exercise/route.ts");
const foodsApi = await import("../../app/api/custom-foods/route.ts");

const headers = { "content-type": "application/json", "x-food-tracker-profile": "chris" };
const hers = { "content-type": "application/json", "x-food-tracker-profile": "sarah" };

const json = (response) => response.json();
const post = (body, who = headers) =>
  entriesApi.POST(new Request("http://x/api/entries", { method: "POST", headers: who, body: JSON.stringify(body) }));
const put = (body, who = headers) =>
  entriesApi.PUT(new Request("http://x/api/entries", { method: "PUT", headers: who, body: JSON.stringify(body) }));
const dayEntries = async (date, who = headers) =>
  (await json(await entriesApi.GET(new Request(`http://x/api/entries?date=${date}`, { headers: who })))).entries;

const meal = {
  meal: "Lunch", name: "Chicken salad", serving: "1 bowl", servings: 1,
  calories: 320, protein: 28, fat: 18, carbs: 12, fiber: 4,
  saturatedFat: 3.5, transFat: 0, polyunsaturatedFat: 2,
};
/** The whole entry, ready to send back as an edit. */
const asEdit = (entry, changes) => ({
  id: entry.id, meal: entry.meal, name: entry.name, serving: entry.serving,
  calories: entry.calories, protein: entry.protein, fat: entry.fat, carbs: entry.carbs, fiber: entry.fiber,
  saturatedFat: entry.saturatedFat, transFat: entry.transFat,
  monounsaturatedFat: entry.monounsaturatedFat, polyunsaturatedFat: entry.polyunsaturatedFat,
  ...changes,
});

const countFood = (name) =>
  database.prepare("select count(*) as total from food_entries where name = ?").get(name).total;

/* ------------------------------------------------------- moving a food */

test("changing a food's date moves the entry without duplicating it", async () => {
  const created = (await json(await post({ ...meal, name: "Moved lunch", eatenOn: "2026-08-20" }))).entry;
  assert.equal(created.eatenOn, "2026-08-20");

  const response = await put(asEdit(created, { eatenOn: "2026-08-18" }));
  assert.equal(response.status, 200);
  const result = await json(response);
  assert.equal(result.entry.id, created.id, "a move keeps the same row");
  assert.equal(result.entry.eatenOn, "2026-08-18");
  assert.equal(result.moved, true);
  assert.equal(result.movedFrom, "2026-08-20");

  assert.equal(countFood("Moved lunch"), 1, "a move must not create a second row");
  assert.equal((await dayEntries("2026-08-20")).length, 0, "it has left the day it was on");
  const arrived = await dayEntries("2026-08-18");
  assert.equal(arrived.length, 1);
  // Every other field survives the move untouched.
  assert.equal(arrived[0].calories, 320);
  assert.equal(arrived[0].saturatedFat, 3.5);
  assert.equal(arrived[0].transFat, 0);
  assert.equal(arrived[0].monounsaturatedFat, null, "unknown must stay unknown");
});

test("a move stores the exact calendar date, with no day shift", async () => {
  const created = (await json(await post({ ...meal, name: "DST lunch", eatenOn: "2026-03-07" }))).entry;
  // Either side of the US spring-forward date, where a UTC round trip slips.
  for (const date of ["2026-03-08", "2026-03-09", "2026-11-01", "2026-01-01", "2026-12-31"]) {
    const moved = (await json(await put(asEdit(created, { eatenOn: date })))).entry;
    assert.equal(moved.eatenOn, date);
    assert.equal((await dayEntries(date)).length, 1, `${date} holds the entry`);
  }
  assert.equal(countFood("DST lunch"), 1);
});

test("an edit that sends no date leaves the entry on its own day", async () => {
  const created = (await json(await post({ ...meal, name: "Stays put", eatenOn: "2026-08-11" }))).entry;
  const result = await json(await put(asEdit(created, { calories: 400 })));
  assert.equal(result.entry.eatenOn, "2026-08-11");
  assert.equal(result.moved, false);
  assert.equal(result.entry.calories, 400);
});

test("an invalid diary date is refused and the entry does not move", async () => {
  const created = (await json(await post({ ...meal, name: "Bad date", eatenOn: "2026-08-12" }))).entry;
  for (const bad of ["not-a-date", "2026-8-1", "20260801"]) {
    const response = await put(asEdit(created, { eatenOn: bad }));
    assert.equal(response.status, 400, `${bad} should be refused`);
  }
  assert.equal((await dayEntries("2026-08-12")).length, 1);
});

test("one profile cannot move the other's entry", async () => {
  const created = (await json(await post({ ...meal, name: "Hers only", eatenOn: "2026-08-13" }, hers))).entry;
  const response = await put(asEdit(created, { eatenOn: "2026-08-01" }));
  assert.equal(response.status, 404);
  assert.equal((await dayEntries("2026-08-13", hers))[0].eatenOn, "2026-08-13");
});

/* ------------------------------------------------------ copying a food */

test("copying to today creates a new entry and leaves the original alone", async () => {
  const original = (await json(await post({ ...meal, name: "Copied salad", eatenOn: "2026-08-14" }))).entry;

  // The copy is an ordinary create on another day, which is exactly what the
  // Add Food form does with the prefilled values.
  const copy = (await json(await post({
    ...meal, name: original.name, serving: original.serving, eatenOn: "2026-08-25",
    calories: original.calories, protein: original.protein, fat: original.fat,
    carbs: original.carbs, fiber: original.fiber,
    saturatedFat: original.saturatedFat, transFat: original.transFat,
    monounsaturatedFat: original.monounsaturatedFat, polyunsaturatedFat: original.polyunsaturatedFat,
  }))).entry;

  assert.notEqual(copy.id, original.id, "a copy is a new entry");
  assert.equal(copy.eatenOn, "2026-08-25");
  assert.equal(copy.calories, original.calories);
  assert.equal(copy.monounsaturatedFat, null, "unknown stays unknown through a copy");

  const before = await dayEntries("2026-08-14");
  assert.equal(before.length, 1, "the original day still holds exactly one entry");
  assert.equal(before[0].id, original.id);
  assert.equal(before[0].calories, original.calories);
  assert.equal(before[0].eatenOn, "2026-08-14");
});

test("a copy does not add anything to My Foods on its own", async () => {
  const saved = await json(await foodsApi.GET(new Request("http://x/api/custom-foods", { headers })));
  const before = saved.foods.length;
  await post({ ...meal, name: "Not saved by copying", eatenOn: "2026-08-26" });
  const after = await json(await foodsApi.GET(new Request("http://x/api/custom-foods", { headers })));
  assert.equal(after.foods.length, before, "adding a diary entry must not save a reusable food");
});

/* --------------------------------------------------- adding to My Foods */

test("a diary entry can be saved to My Foods without changing the diary", async () => {
  const entry = (await json(await post({ ...meal, name: "Keeper", eatenOn: "2026-08-15" }))).entry;
  const response = await foodsApi.POST(new Request("http://x/api/custom-foods", {
    method: "POST", headers,
    body: JSON.stringify({
      name: entry.name, serving: entry.serving,
      calories: entry.calories, protein: entry.protein, fat: entry.fat, carbs: entry.carbs, fiber: entry.fiber,
      saturatedFat: entry.saturatedFat, transFat: entry.transFat,
      monounsaturatedFat: entry.monounsaturatedFat, polyunsaturatedFat: entry.polyunsaturatedFat,
    }),
  }));
  assert.equal(response.status, 201);
  const result = await json(response);
  assert.equal(result.created, true);
  assert.equal(result.food.name, "Keeper");
  assert.equal(result.food.calories, 320);
  assert.equal(result.food.monounsaturatedFat, null);

  // The diary entry is exactly where it was, unchanged and not duplicated.
  const day = await dayEntries("2026-08-15");
  assert.equal(day.length, 1);
  assert.equal(day[0].id, entry.id);
  assert.equal(day[0].eatenOn, "2026-08-15");
  assert.equal(day[0].calories, 320);
});

test("saving the same name and serving again updates rather than duplicating", async () => {
  const body = { name: "Twice over", serving: "1 cup", calories: 100, protein: 5, fat: 2, carbs: 10, fiber: 1 };
  const first = await foodsApi.POST(new Request("http://x/api/custom-foods", { method: "POST", headers, body: JSON.stringify(body) }));
  assert.equal(first.status, 201);
  const second = await foodsApi.POST(new Request("http://x/api/custom-foods", {
    method: "POST", headers, body: JSON.stringify({ ...body, calories: 140 }),
  }));
  // The same duplicate rule the Add Food form's "Save to My Foods" already uses.
  assert.equal(second.status, 200);
  assert.equal((await json(second)).created, false);
  const rows = database.prepare("select * from custom_foods where name = ?").all("Twice over");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].calories, 140);
});

test("My Foods refuses values it cannot store, and saves nothing", async () => {
  const response = await foodsApi.POST(new Request("http://x/api/custom-foods", {
    method: "POST", headers,
    body: JSON.stringify({ name: "Impossible", serving: "1", calories: 100, protein: 5, fat: 2, carbs: 10, fiber: 1, saturatedFat: 40 }),
  }));
  assert.equal(response.status, 400);
  assert.match((await json(response)).error, /cannot be more than/i);
  assert.equal(database.prepare("select count(*) as total from custom_foods where name = ?").get("Impossible").total, 0);
});

test("a food saved by one profile never reaches the other", async () => {
  await foodsApi.POST(new Request("http://x/api/custom-foods", {
    method: "POST", headers: hers,
    body: JSON.stringify({ name: "Sarah's yoghurt", serving: "1 pot", calories: 90, protein: 9, fat: 1, carbs: 8, fiber: 0 }),
  }));
  const mine = await json(await foodsApi.GET(new Request("http://x/api/custom-foods", { headers })));
  assert.equal(mine.foods.some(food => food.name === "Sarah's yoghurt"), false);
});

/* --------------------------------------------------- moving an activity */

const addActivity = (body, who = headers) =>
  exerciseApi.POST(new Request("http://x/api/exercise", { method: "POST", headers: who, body: JSON.stringify(body) }));
const editActivity = (body, who = headers) =>
  exerciseApi.PUT(new Request("http://x/api/exercise", { method: "PUT", headers: who, body: JSON.stringify(body) }));
const dayActivities = async (date, who = headers) =>
  (await json(await exerciseApi.GET(new Request(`http://x/api/exercise?date=${date}`, { headers: who })))).entries;

test("changing an activity's date moves it without duplicating it", async () => {
  const created = (await json(await addActivity({
    exercisedOn: "2026-08-20", activity: "Walking", minutes: 45, calories: 210, comments: "River loop",
  }))).entry;

  const result = await json(await editActivity({
    id: created.id, exercisedOn: "2026-08-17", activity: "Walking", minutes: 45, calories: 210, comments: "River loop",
  }));
  assert.equal(result.entry.id, created.id, "a move keeps the same row");
  assert.equal(result.entry.exercisedOn, "2026-08-17");
  assert.equal(result.moved, true);
  assert.equal(result.movedFrom, "2026-08-20");

  assert.equal(database.prepare("select count(*) as total from exercise_entries where activity = ?").get("Walking").total, 1);
  assert.equal((await dayActivities("2026-08-20")).length, 0);
  const arrived = await dayActivities("2026-08-17");
  assert.equal(arrived.length, 1);
  // Minutes, calories, and the comments all survive the move.
  assert.equal(arrived[0].minutes, 45);
  assert.equal(arrived[0].calories, 210);
  assert.equal(arrived[0].comments, "River loop");
});

test("an activity edit that sends no date leaves it on its own day", async () => {
  const created = (await json(await addActivity({
    exercisedOn: "2026-08-19", activity: "Rowing", minutes: 20, calories: 150, comments: "Steady",
  }))).entry;
  const result = await json(await editActivity({ id: created.id, activity: "Rowing", minutes: 25, calories: 150 }));
  assert.equal(result.entry.exercisedOn, "2026-08-19");
  assert.equal(result.moved, false);
  assert.equal(result.entry.minutes, 25);
  assert.equal(result.entry.comments, "Steady", "comments survive an edit that never sent them");
});

test("an invalid activity date is refused and nothing moves", async () => {
  const created = (await json(await addActivity({
    exercisedOn: "2026-08-16", activity: "Cycling", minutes: 30, calories: 240, comments: "",
  }))).entry;
  const response = await editActivity({ id: created.id, exercisedOn: "16/08/2026", activity: "Cycling", minutes: 30, calories: 240 });
  assert.equal(response.status, 400);
  assert.equal((await dayActivities("2026-08-16")).length, 1);
});

test("one profile cannot move the other's activity", async () => {
  const created = (await json(await addActivity({
    exercisedOn: "2026-08-21", activity: "Her yoga", minutes: 60, calories: 180, comments: "",
  }, hers))).entry;
  const response = await editActivity({ id: created.id, exercisedOn: "2026-08-01", activity: "Her yoga", minutes: 60, calories: 180 });
  assert.equal(response.status, 404);
  assert.equal((await dayActivities("2026-08-21", hers))[0].exercisedOn, "2026-08-21");
});
