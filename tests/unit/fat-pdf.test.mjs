/**
 * Both PDFs, actually rendered, with every piece of text jsPDF is asked to
 * draw recorded so the layout can be inspected rather than assumed.
 *
 * The checks are the ones a person would make by eye: nothing runs off the
 * page, nothing overlaps its neighbour on the same line, nothing sits below
 * the footer, units are present, totals are right, total carbohydrates are
 * still there, and no total-carbohydrate goal has appeared.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { startRecording } from "../support/jspdf-recorder.mjs";
import { buildExportPdf } from "../../app/export-pdf.ts";
import { buildSummaryPdf } from "../../app/export-summary-pdf.ts";
import { buildSummary } from "../../app/export-summary.ts";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

/**
 * Records every `text()` call with the page it landed on and the width it
 * actually occupies, so overflow and overlap can be measured.
 */
async function render(build, data) {
  const drawn = startRecording();
  const blob = await build(data);
  return { blob, drawn: drawn() };
}

const bounds = (item) => item.align === "right"
  ? { left: item.x - item.width, right: item.x }
  : { left: item.x, right: item.x + item.width };

function assertLayout(drawn, label) {
  for (const item of drawn) {
    const { left, right } = bounds(item);
    assert.ok(left >= 30 - 0.5, `${label}: "${item.text}" starts left of the margin at ${left}`);
    assert.ok(right <= PAGE_WIDTH - 30 + 0.5, `${label}: "${item.text}" runs past the right margin to ${right}`);
    assert.ok(item.y > 0 && item.y <= PAGE_HEIGHT - 20, `${label}: "${item.text}" sits at y ${item.y}, off the page`);
  }

  // Anything sharing a baseline on the same page must not overlap its neighbour.
  const rows = new Map();
  for (const item of drawn) {
    const key = `${item.page}:${Math.round(item.y * 2)}`;
    rows.set(key, [...(rows.get(key) ?? []), item]);
  }
  for (const [key, row] of rows) {
    const placed = row.map(bounds).map((box, index) => ({ ...box, text: row[index].text }))
      .sort((a, b) => a.left - b.left);
    for (let index = 1; index < placed.length; index += 1) {
      assert.ok(
        placed[index].left >= placed[index - 1].right - 0.5,
        `${label}: "${placed[index - 1].text}" and "${placed[index].text}" overlap on line ${key}`,
      );
    }
  }
}

const said = (drawn, needle) => drawn.some(item => item.text.includes(needle));
/**
 * Every drawn string as one line of prose. A paragraph is wrapped and drawn a
 * line at a time, so a sentence has to be matched against the whole page.
 */
const prose = (drawn) => drawn.map(item => item.text).join(" ").replace(/\s+/g, " ");

/** A range with a full breakdown, a partial one, and a day with none at all. */
function payload({ sections, days }) {
  return {
    exportMetadata: { application: "Daily Food Tracker", formatVersion: 1, generatedAt: "2026-08-25T12:00:00.000Z", sections },
    user: { profile: "chris", name: "Chris" },
    dateRange: { start: "2026-08-20", end: "2026-08-22", days: 3 },
    goals: {
      current: { calories: 2100, protein: 150, fat: 95, netCarbs: 125, fiber: 35, waterOunces: 100 },
      dailyCalorieGoals: [{ date: "2026-08-20", calories: 2100 }],
      defaultCalorieGoal: 1600,
    },
    ...days,
  };
}

const dailySummaries = [
  {
    date: "2026-08-20", calories: 2050, protein: 148, fat: 92, carbs: 160, fiber: 34, netCarbs: 126, foodItems: 5,
    // Polyunsaturated fat is never recorded anywhere in this range, so the
    // summary must report it as unavailable rather than as zero.
    saturatedFat: 28, transFat: 0, monounsaturatedFat: 33, polyunsaturatedFat: null,
    fatSubtypeEntries: { saturatedFat: 5, transFat: 5, monounsaturatedFat: 5, polyunsaturatedFat: 0 },
  },
  {
    date: "2026-08-21", calories: 1980, protein: 141, fat: 88, carbs: 155, fiber: 31, netCarbs: 124, foodItems: 4,
    saturatedFat: 19.5, transFat: 0.5, monounsaturatedFat: null, polyunsaturatedFat: null,
    fatSubtypeEntries: { saturatedFat: 2, transFat: 2, monounsaturatedFat: 0, polyunsaturatedFat: 0 },
  },
  {
    date: "2026-08-22", calories: 2120, protein: 152, fat: 99, carbs: 168, fiber: 36, netCarbs: 132, foodItems: 6,
    saturatedFat: null, transFat: null, monounsaturatedFat: null, polyunsaturatedFat: null,
    fatSubtypeEntries: { saturatedFat: 0, transFat: 0, monounsaturatedFat: 0, polyunsaturatedFat: 0 },
  },
];

test("the doctor summary keeps total carbs, net carbs, and no total-carb goal", async () => {
  const data = payload({ sections: ["dailySummaries", "goals"], days: { dailySummaries } });
  const { blob, drawn } = await render(buildSummaryPdf, data);
  assert.ok(blob.size > 1000);
  assertLayout(drawn, "summary PDF");

  assert.ok(said(drawn, "Total carbs"), "total carbohydrates must still be reported");
  assert.ok(said(drawn, "Net carbs"), "net carbohydrates must still be reported");
  // Total carbs has no goal and must not gain one; the cell says so outright.
  assert.ok(said(drawn, "no goal set"));
  const goalColumn = drawn.filter(item => item.align === "right" && /^\d+(\.\d+)? g$/.test(item.text));
  assert.ok(goalColumn.some(item => item.text === "125 g"), "the net-carb goal is still shown");
  // 160 + 155 + 168 over three days averages 161, which must appear as a
  // number and never as a goal.
  assert.ok(said(drawn, "161.0 g"), "total carbs still average correctly");
  assert.equal(drawn.filter(item => item.text === "168 g").length, 0);
});

test("the doctor summary prints the fat breakdown under total fat", async () => {
  const data = payload({ sections: ["dailySummaries", "goals"], days: { dailySummaries } });
  const { drawn } = await render(buildSummaryPdf, data);

  const order = drawn.filter(item => /^(Fat|- )/.test(item.text)).map(item => item.text);
  assert.deepEqual(order.slice(0, 5), [
    "Fat", "- Saturated fat", "- Trans fat", "- Monounsaturated fat", "- Polyunsaturated fat",
  ]);

  // 28 + 19.5 = 47.5 g of saturated fat across three recorded days is 15.8 g.
  assert.ok(said(drawn, "15.8 g"), "saturated fat averages over the recorded days");
  // Monounsaturated fat came from one day only, so the count says so.
  assert.ok(said(drawn, "11.0 g"));
  assert.ok(said(drawn, "1 of 3"));
  assert.ok(said(drawn, "2 of 3"), "the days each subtype covers are stated");
  // Nothing anywhere recorded polyunsaturated fat, which must not read 0.0 g.
  assert.ok(said(drawn, "Not available"));
  assert.match(prose(drawn), /Fat breakdown: Subtype sums cover only the food entries that recorded each value/i);
  assert.match(prose(drawn), /not expected to add up to total fat/i);
});

test("the doctor summary never shows an unrecorded subtype as zero", async () => {
  const none = dailySummaries.map(day => ({
    ...day,
    saturatedFat: null, transFat: null, monounsaturatedFat: null, polyunsaturatedFat: null,
    fatSubtypeEntries: { saturatedFat: 0, transFat: 0, monounsaturatedFat: 0, polyunsaturatedFat: 0 },
  }));
  const { drawn } = await render(buildSummaryPdf, payload({ sections: ["dailySummaries", "goals"], days: { dailySummaries: none } }));
  assertLayout(drawn, "summary PDF without any breakdown");
  assert.equal(drawn.filter(item => item.text === "0.0 g").length, 0);
  assert.equal(drawn.filter(item => item.text === "Not available").length, 4);
  assert.match(prose(drawn), /only total fat is available/i);
});

test("the doctor summary is unchanged when nothing new applies", async () => {
  // No fat breakdown at all and no goals section: the layout must still hold.
  const { drawn } = await render(buildSummaryPdf, payload({ sections: ["dailySummaries"], days: { dailySummaries } }));
  assertLayout(drawn, "summary PDF without goals");
  assert.ok(said(drawn, "Total carbs"));
  assert.ok(said(drawn, "Net carbs"));
});

test("the detailed export prints a fat breakdown table per day", async () => {
  const data = payload({ sections: ["dailySummaries", "goals"], days: { dailySummaries } });
  const { blob, drawn } = await render(buildExportPdf, data);
  assert.ok(blob.size > 1000);
  assertLayout(drawn, "detailed PDF");

  assert.ok(said(drawn, "Fat breakdown"));
  assert.ok(said(drawn, "SATURATED"));
  assert.ok(said(drawn, "MONOUNSAT."));
  assert.ok(said(drawn, "POLYUNSAT."));
  // The 21st recorded saturated fat on only two of its four entries.
  assert.ok(said(drawn, "19.5 *"));
  assert.match(prose(drawn), /Covers only some of that day/i);
  assert.ok(said(drawn, "Not available"));
  // The existing daily totals table is untouched.
  assert.ok(said(drawn, "NET CARBS"));
  assert.ok(said(drawn, "FIBER"));
});

test("the detailed export still prints the breakdown from individual entries alone", async () => {
  const foodEntries = [
    { date: "2026-08-20", meal: "Lunch", name: "Burger", serving: "1", calories: 600, protein: 30, fat: 33, carbs: 40, fiber: 2, netCarbs: 38, saturatedFat: 12, transFat: 0.5, monounsaturatedFat: 14, polyunsaturatedFat: 4 },
    { date: "2026-08-20", meal: "Dinner", name: "Salad", serving: "1", calories: 220, protein: 6, fat: 14, carbs: 12, fiber: 4, netCarbs: 8, saturatedFat: null, transFat: null, monounsaturatedFat: null, polyunsaturatedFat: null },
  ];
  const { drawn } = await render(buildExportPdf, payload({ sections: ["foodEntries"], days: { foodEntries } }));
  assertLayout(drawn, "detailed PDF from entries");
  assert.ok(said(drawn, "Fat breakdown"));
  assert.ok(said(drawn, "12 *"), "a sum covering one of two entries is starred");
});

test("a legacy export with no fat fields renders both PDFs unchanged", async () => {
  // Exactly the shape the feed produced before this change.
  const legacy = dailySummaries.map(({ date, calories, protein, fat, carbs, fiber, netCarbs, foodItems }) =>
    ({ date, calories, protein, fat, carbs, fiber, netCarbs, foodItems }));
  const data = payload({ sections: ["dailySummaries", "goals"], days: { dailySummaries: legacy } });

  const summary = buildSummary(data);
  assert.equal(summary.nutrition.fat.subtotals.saturatedFat, null);
  assert.equal(summary.nutrition.recordedDays, 3);

  const doctor = await render(buildSummaryPdf, data);
  assertLayout(doctor.drawn, "legacy summary PDF");
  assert.ok(said(doctor.drawn, "Total carbs"));
  assert.ok(said(doctor.drawn, "Not available"));

  const detailed = await render(buildExportPdf, data);
  assertLayout(detailed.drawn, "legacy detailed PDF");
});

test("a long range still breaks cleanly across pages", async () => {
  const many = Array.from({ length: 45 }, (_, index) => ({
    date: `2026-0${index < 11 ? 7 : 8}-${String(index < 11 ? index + 20 : index - 10).padStart(2, "0")}`,
    calories: 2000 + index, protein: 140, fat: 90, carbs: 160, fiber: 30, netCarbs: 130, foodItems: 5,
    saturatedFat: 28.25, transFat: 0, monounsaturatedFat: index % 2 === 0 ? 33.75 : null, polyunsaturatedFat: null,
    fatSubtypeEntries: { saturatedFat: 5, transFat: 5, monounsaturatedFat: index % 2 === 0 ? 3 : 0, polyunsaturatedFat: 0 },
  }));
  const data = payload({ sections: ["dailySummaries", "goals"], days: { dailySummaries: many } });
  const detailed = await render(buildExportPdf, data);
  assertLayout(detailed.drawn, "long detailed PDF");
  assert.ok(Math.max(...detailed.drawn.map(item => item.page)) > 1, "a long range runs to more than one page");
  const doctor = await render(buildSummaryPdf, data);
  assertLayout(doctor.drawn, "long summary PDF");
});
