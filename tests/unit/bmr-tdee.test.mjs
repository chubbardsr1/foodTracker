/**
 * BMR (Mifflin-St Jeor) and TDEE, the calculation the Weight tab's collapsed
 * panel shows. Known figures are checked against the published formula by
 * hand, in both imperial inputs the app actually stores.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITY_LEVELS, DEFAULT_ACTIVITY_LEVEL, activityFactor, bmrFrom, readBodyMetrics, tdeeFrom,
} from "../../app/nutrition.ts";

test("BMR for a man: 10*kg + 6.25*cm - 5*age + 5", () => {
  // 180 lbs = 81.64656 kg, 70 in = 177.8 cm, age 40.
  // 10*81.64656 + 6.25*177.8 - 5*40 + 5 = 816.4656 + 1111.25 - 200 + 5 = 1732.72 -> 1733
  const bmr = bmrFrom({ gender: "male", age: 40, heightInches: 70, pounds: 180 });
  assert.equal(bmr, 1733);
});

test("BMR for a woman: 10*kg + 6.25*cm - 5*age - 161", () => {
  // 150 lbs = 68.038855 kg, 65 in = 165.1 cm, age 30.
  // 10*68.038855 + 6.25*165.1 - 5*30 - 161 = 680.38855 + 1031.875 - 150 - 161 = 1401.26 -> 1401
  const bmr = bmrFrom({ gender: "female", age: 30, heightInches: 65, pounds: 150 });
  assert.equal(bmr, 1401);
});

test("BMR is null whenever gender, age, height, or weight is missing or unusable", () => {
  const complete = { gender: "male", age: 40, heightInches: 70, pounds: 180 };
  assert.equal(bmrFrom({ ...complete, gender: null }), null);
  assert.equal(bmrFrom({ ...complete, gender: "other" }), null);
  assert.equal(bmrFrom({ ...complete, age: null }), null);
  assert.equal(bmrFrom({ ...complete, age: 0 }), null);
  assert.equal(bmrFrom({ ...complete, heightInches: null }), null);
  assert.equal(bmrFrom({ ...complete, pounds: null }), null);
  assert.equal(bmrFrom({ ...complete, pounds: 0 }), null);
});

test("TDEE multiplies BMR by the selected activity factor, defaulting to Moderately active", () => {
  assert.equal(DEFAULT_ACTIVITY_LEVEL, "moderate");
  assert.equal(activityFactor("moderate"), 1.55);
  assert.equal(activityFactor("sedentary"), 1.2);
  assert.equal(activityFactor("light"), 1.375);
  assert.equal(activityFactor("very"), 1.725);
  assert.equal(activityFactor("extra"), 1.9);
  // An unknown id falls back to the default rather than throwing.
  assert.equal(activityFactor("nonsense"), 1.55);

  assert.equal(tdeeFrom(1733, "moderate"), Math.round(1733 * 1.55));
  assert.equal(tdeeFrom(null, "moderate"), null);
  assert.equal(ACTIVITY_LEVELS.length, 5);
});

test("readBodyMetrics: blank stays null, valid values round-trip", () => {
  const blank = readBodyMetrics({});
  assert.ok(blank.ok);
  assert.deepEqual(blank.value, { age: null, heightInches: null, gender: null });

  const filled = readBodyMetrics({ age: "40", heightInches: "70.5", gender: "Male" });
  assert.ok(filled.ok);
  assert.deepEqual(filled.value, { age: 40, heightInches: 70.5, gender: "male" });

  const clearedAgain = readBodyMetrics({ age: "", heightInches: "", gender: "" });
  assert.ok(clearedAgain.ok);
  assert.deepEqual(clearedAgain.value, { age: null, heightInches: null, gender: null });
});

test("readBodyMetrics rejects out-of-range or malformed values", () => {
  assert.equal(readBodyMetrics({ age: 0 }).ok, false);
  assert.equal(readBodyMetrics({ age: 121 }).ok, false);
  assert.equal(readBodyMetrics({ age: 40.5 }).ok, false);
  assert.equal(readBodyMetrics({ heightInches: 0 }).ok, false);
  assert.equal(readBodyMetrics({ heightInches: 109 }).ok, false);
  assert.equal(readBodyMetrics({ gender: "unicorn" }).ok, false);
});
