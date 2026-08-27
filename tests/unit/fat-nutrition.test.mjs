/**
 * The shared fat helpers: unknown against zero, scaling, validation, and the
 * one aggregation the dashboard, the reports, and both PDFs all use.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  UNKNOWN_FAT_LABEL, aggregateFat, coerceFatBreakdown, emptyFatBreakdown, fatBreakdownProblem,
  fatCoverageNote, fatDetailComplete, fatSubtypeKeys, fatSubtypesOverTotal, fatTotalsFrom,
  gramsOrUnknown, hasFatDetail, mergeFatTotals, readFatBreakdown, readOptionalGrams,
  scaleFatBreakdown, unclassifiedFat,
} from "../../app/nutrition.ts";

test("a blank, absent, or null subtype reads as unknown, not zero", () => {
  for (const value of [undefined, null, "", "   "]) {
    assert.deepEqual(readOptionalGrams(value), { ok: true, value: null });
  }
});

test("a real zero survives as a real zero", () => {
  assert.deepEqual(readOptionalGrams(0), { ok: true, value: 0 });
  assert.deepEqual(readOptionalGrams("0"), { ok: true, value: 0 });
  assert.deepEqual(readOptionalGrams("0.00"), { ok: true, value: 0 });
});

test("negative and malformed values are refused rather than rewritten", () => {
  assert.deepEqual(readOptionalGrams(-1), { ok: false, reason: "negative" });
  assert.deepEqual(readOptionalGrams("-0.5"), { ok: false, reason: "negative" });
  assert.deepEqual(readOptionalGrams("about two"), { ok: false, reason: "invalid" });
  assert.deepEqual(readOptionalGrams(Number.POSITIVE_INFINITY), { ok: false, reason: "invalid" });
  assert.deepEqual(readOptionalGrams(99999), { ok: false, reason: "invalid" });
});

test("values are kept to two decimal places", () => {
  assert.deepEqual(readOptionalGrams("2.345"), { ok: true, value: 2.35 });
});

test("readFatBreakdown names the field that was wrong", () => {
  const read = readFatBreakdown({ saturatedFat: 3, transFat: -2 });
  assert.deepEqual(read, { ok: false, field: "transFat", reason: "negative" });
});

test("readFatBreakdown mixes known, zero, and unknown in one payload", () => {
  const read = readFatBreakdown({ saturatedFat: "4.5", transFat: "0", monounsaturatedFat: "" });
  assert.equal(read.ok, true);
  assert.deepEqual(read.value, {
    saturatedFat: 4.5, transFat: 0, monounsaturatedFat: null, polyunsaturatedFat: null,
  });
});

test("coerceFatBreakdown leaves a bad third-party value unknown", () => {
  assert.deepEqual(coerceFatBreakdown({ saturatedFat: 3, transFat: -1, monounsaturatedFat: "n/a" }), {
    saturatedFat: 3, transFat: null, monounsaturatedFat: null, polyunsaturatedFat: null,
  });
});

test("scaling a serving scales every known subtype and leaves unknown unknown", () => {
  const breakdown = { saturatedFat: 4, transFat: 0, monounsaturatedFat: null, polyunsaturatedFat: 2.5 };
  assert.deepEqual(scaleFatBreakdown(breakdown, 2), {
    saturatedFat: 8, transFat: 0, monounsaturatedFat: null, polyunsaturatedFat: 5,
  });
});

test("a fractional serving scales the subtypes the same way", () => {
  const breakdown = { saturatedFat: 4.5, transFat: 0, monounsaturatedFat: null, polyunsaturatedFat: 1.25 };
  assert.deepEqual(scaleFatBreakdown(breakdown, 0.5), {
    saturatedFat: 2.25, transFat: 0, monounsaturatedFat: null, polyunsaturatedFat: 0.63,
  });
  assert.deepEqual(scaleFatBreakdown(breakdown, 0), {
    saturatedFat: 0, transFat: 0, monounsaturatedFat: null, polyunsaturatedFat: 0,
  });
});

test("a subtype above total fat is refused, with label rounding allowed", () => {
  const total = 10;
  assert.equal(fatBreakdownProblem(total, { ...emptyFatBreakdown(), saturatedFat: 10.4 }), null);
  assert.deepEqual(fatSubtypesOverTotal(total, { ...emptyFatBreakdown(), saturatedFat: 10.5 }), []);
  const problem = fatBreakdownProblem(total, { ...emptyFatBreakdown(), saturatedFat: 12 });
  assert.match(problem, /saturated fat cannot be more than the 10 g of total fat/i);
});

test("subtypes are never required to add up to total fat", () => {
  // Saturated plus trans is well under the total, which is normal on a label.
  assert.equal(fatBreakdownProblem(20, { saturatedFat: 3, transFat: 0, monounsaturatedFat: null, polyunsaturatedFat: null }), null);
});

test("aggregation totals each subtype independently and counts the gaps", () => {
  const totals = aggregateFat([
    { fat: 10, saturatedFat: 3, transFat: 0, monounsaturatedFat: 4, polyunsaturatedFat: 2 },
    { fat: 6, saturatedFat: 1.5, transFat: 0 },
    { fat: 4 },
  ]);
  assert.equal(totals.total, 20);
  assert.equal(totals.records, 3);
  assert.deepEqual(totals.subtotals, {
    saturatedFat: 4.5, transFat: 0, monounsaturatedFat: 4, polyunsaturatedFat: 2,
  });
  assert.deepEqual(totals.known, { saturatedFat: 2, transFat: 2, monounsaturatedFat: 1, polyunsaturatedFat: 1 });
  assert.deepEqual(totals.missing, { saturatedFat: 1, transFat: 1, monounsaturatedFat: 2, polyunsaturatedFat: 2 });
});

test("a subtype nobody recorded stays null instead of summing to zero", () => {
  const totals = aggregateFat([{ fat: 9 }, { fat: 3 }]);
  assert.equal(totals.subtotals.saturatedFat, null);
  assert.equal(gramsOrUnknown(totals.subtotals.saturatedFat), UNKNOWN_FAT_LABEL);
  assert.equal(hasFatDetail(totals), false);
});

test("a day of genuine zeroes is not the same as a day of unknowns", () => {
  const zeroes = aggregateFat([{ fat: 9, transFat: 0 }]);
  assert.equal(zeroes.subtotals.transFat, 0);
  assert.equal(gramsOrUnknown(zeroes.subtotals.transFat), "0 g");
  assert.equal(hasFatDetail(zeroes), true);
});

test("unclassified fat is only worked out when every record is complete", () => {
  const complete = aggregateFat([
    { fat: 12, saturatedFat: 4, transFat: 0, monounsaturatedFat: 5, polyunsaturatedFat: 2 },
  ]);
  assert.equal(fatDetailComplete(complete), true);
  assert.equal(unclassifiedFat(complete), 1);

  const partial = aggregateFat([
    { fat: 12, saturatedFat: 4, transFat: 0, monounsaturatedFat: 5, polyunsaturatedFat: 2 },
    { fat: 8, saturatedFat: 2 },
  ]);
  assert.equal(unclassifiedFat(partial), null);
});

test("unclassified fat is never negative", () => {
  const overfull = aggregateFat([
    { fat: 10, saturatedFat: 6, transFat: 0, monounsaturatedFat: 5, polyunsaturatedFat: 4 },
  ]);
  assert.equal(unclassifiedFat(overfull), null);

  // Inside the rounding tolerance it settles at zero rather than going below.
  const rounded = aggregateFat([
    { fat: 10, saturatedFat: 4, transFat: 0, monounsaturatedFat: 4, polyunsaturatedFat: 2.3 },
  ]);
  assert.equal(unclassifiedFat(rounded), 0);
});

test("grouped database figures rebuild the same rollup", () => {
  const totals = fatTotalsFrom(20, 3, { saturatedFat: 4.5, transFat: 0, monounsaturatedFat: 4 }, {
    saturatedFat: 2, transFat: 2, monounsaturatedFat: 1,
  });
  assert.equal(totals.total, 20);
  assert.deepEqual(totals.subtotals, { saturatedFat: 4.5, transFat: 0, monounsaturatedFat: 4, polyunsaturatedFat: null });
  assert.deepEqual(totals.missing, { saturatedFat: 1, transFat: 1, monounsaturatedFat: 2, polyunsaturatedFat: 3 });
});

test("an old grouped row with no counts reads as entirely unknown", () => {
  const totals = fatTotalsFrom(20, 3, {}, {});
  for (const key of fatSubtypeKeys) assert.equal(totals.subtotals[key], null);
  assert.equal(hasFatDetail(totals), false);
});

test("merging day rollups keeps totals and coverage in step", () => {
  const monday = aggregateFat([{ fat: 10, saturatedFat: 3 }]);
  const tuesday = aggregateFat([{ fat: 5, saturatedFat: 1, transFat: 0 }, { fat: 2 }]);
  const range = mergeFatTotals(monday, tuesday);
  assert.equal(range.total, 17);
  assert.equal(range.records, 3);
  assert.equal(range.subtotals.saturatedFat, 4);
  assert.equal(range.subtotals.transFat, 0);
  assert.equal(range.known.transFat, 1);
  assert.equal(range.missing.transFat, 2);
  assert.equal(range.subtotals.polyunsaturatedFat, null);
});

test("the coverage note says what a partial sum leaves out", () => {
  const nothing = aggregateFat([{ fat: 10 }]);
  assert.match(fatCoverageNote(nothing), /only total fat is available/i);

  const partial = aggregateFat([{ fat: 10, saturatedFat: 3 }, { fat: 4 }]);
  const note = fatCoverageNote(partial);
  assert.match(note, /understate/i);
  assert.match(note, /saturated fat on 1 of 2/i);

  const complete = aggregateFat([
    { fat: 10, saturatedFat: 3, transFat: 0, monounsaturatedFat: 4, polyunsaturatedFat: 2 },
  ]);
  assert.equal(fatCoverageNote(complete), "");
});
