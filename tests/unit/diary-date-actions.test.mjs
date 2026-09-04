/**
 * The rules behind the past-day warning, the copy of a diary entry, and the
 * carbohydrate figures on the home screen.
 *
 * These are the decisions the diary screen makes before it touches the
 * network, so they are checked here rather than through a browser. Dates are
 * plain local calendar dates throughout: nothing may parse one as UTC, because
 * that shifts the day backwards west of Greenwich and would move an entry.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { copyOfEntry, isPastDate, pastDateWarning, savedFoodFrom } from "../../app/diary-actions.ts";
import {
  aggregateCarbs, netCarbGoalLabel, netCarbGoalsFrom, netCarbProgress, netCarbsFrom, readNetCarbGoals,
} from "../../app/nutrition.ts";
import { addDays, isoDate, lastCompleteDays, localDate } from "../../app/shared.ts";

const entry = {
  id: 41, eatenOn: "2026-08-20", meal: "Lunch", name: "Chicken salad", serving: "0.5 × 1 bowl",
  calories: 320.5, protein: 28, fat: 18.25, carbs: 12.4, fiber: 4.4,
  saturatedFat: 3.5, transFat: 0, monounsaturatedFat: null, polyunsaturatedFat: 2,
};

/* ---------------------------------------------------------------- warning */

test("adding on today opens the form without a warning", () => {
  assert.equal(isPastDate("2026-09-02", "2026-09-02"), false);
});

test("adding on a past day is warned about", () => {
  assert.equal(isPastDate("2026-09-01", "2026-09-02"), true);
  assert.equal(isPastDate("2025-12-31", "2026-01-01"), true);
});

test("a future day is deliberately not warned about", () => {
  // Planning ahead is a different thing, and the existing rules already allow
  // it. Only quietly logging into history is warned about.
  assert.equal(isPastDate("2026-09-03", "2026-09-02"), false);
});

test("a malformed date never produces a warning", () => {
  assert.equal(isPastDate("", "2026-09-02"), false);
  assert.equal(isPastDate("2026-9-2", "2026-09-02"), false);
  assert.equal(isPastDate("2026-09-01", "nonsense"), false);
});

test("both warnings name the selected day, in the message and on the button", () => {
  const food = pastDateWarning("food", "2026-09-01");
  assert.match(food.message, /^You are viewing .+, not today\. Do you want to add food to this date\?$/);
  assert.match(food.confirmLabel, /^Yes, add to /);
  assert.equal(food.cancelLabel, "No, go to today");

  const exercise = pastDateWarning("exercise", "2026-09-01");
  assert.match(exercise.message, /Do you want to add exercise to this date\?$/);
  // Same shape for both, so the two flows cannot drift apart.
  assert.equal(exercise.cancelLabel, food.cancelLabel);
  assert.notEqual(exercise.message, food.message);
});

/* ------------------------------------------------------------------- copy */

test("a copy carries the food and drops the identity and the day", () => {
  const copy = copyOfEntry(entry);
  assert.equal("id" in copy, false, "a copy must not carry the original's id");
  assert.equal("eatenOn" in copy, false, "a copy must not carry the day it was eaten");
  assert.equal("createdAt" in copy, false);
  assert.equal(copy.name, "Chicken salad");
  assert.equal(copy.serving, "0.5 × 1 bowl");
  assert.equal(copy.meal, "Lunch");
  assert.equal(copy.calories, 320.5);
  assert.equal(copy.carbs, 12.4);
  assert.equal(copy.fiber, 4.4);
  // The entry already holds the nutrition that was eaten, so the copy starts
  // at one serving rather than scaling anything a second time.
  assert.equal(copy.servings, 1);
});

test("a copy keeps an unknown fat subtype unknown", () => {
  const copy = copyOfEntry(entry);
  assert.equal(copy.monounsaturatedFat, null, "unknown must never become zero");
  assert.equal(copy.transFat, 0, "a recorded zero must stay a recorded zero");
  assert.equal(copy.saturatedFat, 3.5);
});

test("copying leaves the original entry untouched", () => {
  const before = JSON.stringify(entry);
  copyOfEntry(entry);
  assert.equal(JSON.stringify(entry), before);
});

test("a saved food takes the nutrition but never the meal or the date", () => {
  const food = savedFoodFrom(copyOfEntry(entry));
  assert.equal("meal" in food, false);
  assert.equal("eatenOn" in food, false);
  assert.equal("id" in food, false);
  assert.equal(food.name, "Chicken salad");
  assert.equal(food.polyunsaturatedFat, 2);
  assert.equal(food.monounsaturatedFat, null);
});

/* ------------------------------------------------------------ carbohydrate */

test("net carbs are total carbohydrates minus fiber, never negative", () => {
  assert.equal(netCarbsFrom(30, 8), 22);
  assert.equal(netCarbsFrom(4, 9), 0, "a rounding artefact is zero, not a negative");
  assert.equal(netCarbsFrom(12.44, 4.4), 8.04);
  assert.equal(netCarbsFrom(0, 0), 0);
});

test("the day's carbohydrates total food by food", () => {
  const totals = aggregateCarbs([
    { carbs: 30, fiber: 8 },
    { carbs: 2, fiber: 9 },
  ]);
  assert.equal(totals.carbs, 32);
  assert.equal(totals.fiber, 17);
  // 22 + 0, not 32 - 17: one food's fiber may not cancel another food's carbs.
  assert.equal(totals.netCarbs, 22);
  assert.equal(totals.records, 2);
  // Nothing is subtracted for sugar alcohols, because none are recorded.
  assert.equal(totals.sugarAlcohols, null);
});

test("an empty day reports zeros and no records", () => {
  const totals = aggregateCarbs([]);
  assert.deepEqual([totals.carbs, totals.fiber, totals.netCarbs, totals.records], [0, 0, 0, 0]);
});

/* -------------------------------------------------------- net-carb goals */

test("a valid minimum and maximum are read back as a range", () => {
  const read = readNetCarbGoals({ netCarbsMin: 100, netCarbsMax: 150 });
  assert.ok(read.ok);
  assert.deepEqual(read.value, { min: 100, max: 150 });
  assert.equal(netCarbGoalLabel(read.value), "100 to 150 g");
});

test("a minimum above the maximum is rejected", () => {
  const read = readNetCarbGoals({ netCarbsMin: 150, netCarbsMax: 100 });
  assert.equal(read.ok, false);
  assert.match(read.error, /minimum .* cannot be more than the maximum/i);
});

test("a negative minimum or a zero maximum is rejected", () => {
  assert.equal(readNetCarbGoals({ netCarbsMin: -1, netCarbsMax: 100 }).ok, false);
  assert.equal(readNetCarbGoals({ netCarbsMin: 0, netCarbsMax: 0 }).ok, false);
  assert.equal(readNetCarbGoals({ netCarbsMin: 0, netCarbsMax: "abc" }).ok, false);
});

test("equal minimum and maximum are allowed", () => {
  const read = readNetCarbGoals({ netCarbsMin: 120, netCarbsMax: 120 });
  assert.ok(read.ok);
  assert.deepEqual(read.value, { min: 120, max: 120 });
});

test("a payload carrying only the old single goal still reads as a maximum", () => {
  const read = readNetCarbGoals({ netCarbs: 25 });
  assert.ok(read.ok);
  assert.deepEqual(read.value, { min: 0, max: 25 });
  assert.equal(netCarbGoalLabel(read.value), "25 g");
});

test("legacy stored goals load safely as a maximum with no minimum", () => {
  assert.deepEqual(netCarbGoalsFrom({ netCarbs: 25 }), { min: 0, max: 25 });
  assert.deepEqual(netCarbGoalsFrom({ netCarbs: 25, netCarbsMin: null, netCarbsMax: null }), { min: 0, max: 25 });
  // Nothing stored at all still gives a usable ceiling rather than zero.
  assert.deepEqual(netCarbGoalsFrom(null), { min: 0, max: 25 });
  assert.deepEqual(netCarbGoalsFrom({}), { min: 0, max: 25 });
  // A row written outside this application is clamped rather than shown broken.
  assert.deepEqual(netCarbGoalsFrom({ netCarbsMin: 200, netCarbsMax: 150 }), { min: 150, max: 150 });
});

test("progress below the minimum is reported as below it, never as success", () => {
  const progress = netCarbProgress(80, { min: 100, max: 150 });
  assert.equal(progress.state, "below");
  assert.equal(progress.grams, 20);
  assert.match(progress.summary, /20g to reach the 100g minimum/);
  assert.doesNotMatch(progress.summary, /on track|left/i);
});

test("progress inside the range says so", () => {
  const progress = netCarbProgress(120, { min: 100, max: 150 });
  assert.equal(progress.state, "within");
  assert.equal(progress.grams, 30);
  assert.match(progress.summary, /Within your 100 to 150 g range/);
});

test("progress above the maximum reports how far over", () => {
  const progress = netCarbProgress(165.5, { min: 100, max: 150 });
  assert.equal(progress.state, "above");
  assert.equal(progress.grams, 15.5);
  assert.match(progress.summary, /15.5g over the 150g maximum/);
});

test("with no minimum configured the card reads as it always did", () => {
  const progress = netCarbProgress(10, { min: 0, max: 25 });
  assert.equal(progress.state, "within");
  assert.equal(progress.summary, "15g left");
});

/* ------------------------------------------------------------------ dates */

test("dates never shift by a day, including across a daylight-saving change", () => {
  // 8 March 2026 is the US spring-forward date and 1 November 2026 the autumn
  // one. A date helper that built a UTC Date would slip a day at one of them.
  for (const [from, expected] of [
    ["2026-03-07", "2026-03-08"], ["2026-03-08", "2026-03-09"],
    ["2026-10-31", "2026-11-01"], ["2026-11-01", "2026-11-02"],
    ["2026-12-31", "2027-01-01"], ["2026-02-28", "2026-03-01"],
  ]) {
    assert.equal(addDays(from, 1), expected, `${from} + 1 day`);
    assert.equal(addDays(expected, -1), from, `${expected} - 1 day`);
  }
});

test("a local date is the calendar day, not the UTC day", () => {
  // Just before local midnight, which is already tomorrow in UTC anywhere west
  // of Greenwich. The calendar date must still be the local one.
  const lateTonight = new Date(2026, 8, 2, 23, 59, 30);
  assert.equal(isoDate(lateTonight), "2026-09-02");
  // And just after local midnight, which is still yesterday in UTC to the east.
  assert.equal(isoDate(new Date(2026, 8, 3, 0, 0, 30)), "2026-09-03");
});

test("a rolling seven-day range ends on yesterday and excludes today", () => {
  const range = lastCompleteDays(7);
  const today = localDate();
  assert.equal(range.end, addDays(today, -1));
  assert.equal(range.start, addDays(today, -7));
  assert.ok(range.end < today, "today is still in progress and must be excluded");
  // Both ends included, so the range really is seven days.
  let days = 0;
  for (let cursor = range.start; cursor <= range.end; cursor = addDays(cursor, 1)) days += 1;
  assert.equal(days, 7);
});
