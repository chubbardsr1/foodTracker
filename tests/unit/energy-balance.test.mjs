/**
 * The Energy balance table's wording and the Energy Balance PDF, actually
 * rendered with every drawn string recorded so the layout is measured rather
 * than assumed. Synthetic days only.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { startRecording } from "../support/jspdf-recorder.mjs";
import { buildEnergyPdf } from "../../app/export-energy-pdf.ts";
import { energyComparison, energyDayCells, energyHeaders, energySummaryCells, energyWeightNote } from "../../app/energy-balance.ts";

const PAGE_WIDTH = 612;
const logged = {
  date: "2026-08-02", items: 3, calories: 1800, exerciseCalories: 200, sessions: 1, steps: 8000,
  weightPounds: 180, weightDate: "2026-07-30", goalDifference: 200, stepCalories: 374,
  activityOffset: 574, adjustedIntake: 1226, tdee: 2700, energyBalance: -900,
};
const blank = {
  date: "2026-08-03", items: 0, calories: 0, exerciseCalories: 0, sessions: 0, steps: null,
  weightPounds: null, weightDate: null, goalDifference: null, stepCalories: null,
  activityOffset: 0, adjustedIntake: null, tdee: null, energyBalance: null,
};

test("headers use the short labels", () => {
  assert.deepEqual([...energyHeaders], [
    "Day", "Eaten", "Goal +/-", "Exercise", "Step Cal", "Act. Off.", "Adj Intake", "TDEE", "Est Tll +/-",
  ]);
});

test("a logged day prints signed differences; unknown figures are dashes, not zeros", () => {
  assert.deepEqual(energyDayCells(logged), ["1,800", "+200", "200", "374", "574", "1,226", "2,700", "-900"]);
  assert.deepEqual(energyDayCells(blank), ["0", "—", "0", "—", "0", "—", "—", "—"]);
  assert.deepEqual(energySummaryCells(undefined), Array(8).fill("—"));
});

test("the comparison sets weight change beside the deficit total in pounds at 3,500 cal/lb", () => {
  const base = { loggedDays: 2, daysWithTdee: 2, averages: {}, bodyMetricsSet: true };
  const deficit = energyComparison({ ...base, totals: { energyBalance: -7000 },
    weightChange: { startDate: "2026-08-01", startPounds: 182.4, endDate: "2026-08-30", endPounds: 180, pounds: -2.4 } });
  assert.deepEqual(deficit.map(item => [item.label, item.value]), [
    ["Weight change", "-2.4 lb"], ["Estimated deficit total", "7,000 cal"], ["Approximate pounds", "2 lb"],
  ]);
  const overage = energyComparison({ ...base, totals: { energyBalance: 1750 }, weightChange: null });
  assert.deepEqual(overage.map(item => [item.label, item.value]), [
    ["Weight change", "—"], ["Estimated overage total", "1,750 cal"], ["Approximate pounds over", "0.5 lb"],
  ]);
  assert.deepEqual(energyComparison(null).map(item => item.value), ["—", "—", "—"]);
});

test("the weight note shows the weigh-in date only when it was carried forward", () => {
  assert.match(energyWeightNote(logged), /^180 lb \(/);
  assert.equal(energyWeightNote({ ...logged, weightDate: logged.date }), "180 lb");
  assert.equal(energyWeightNote(blank), "");
});

test("the Energy Balance PDF renders inside the margins with no overlap or clipped cells", async () => {
  const days = Array.from({ length: 31 }, (_, index) => ({
    ...(index % 3 === 2 ? blank : logged), date: `2026-08-${String(index + 1).padStart(2, "0")}`,
  }));
  const figures = { eaten: 1800, goalDifference: 200, exercise: 200, stepCalories: 374, activityOffset: 574, adjustedIntake: 1226, tdee: 2700, energyBalance: -900 };
  const energy = { loggedDays: 21, daysWithTdee: 21, averages: figures, totals: { ...figures, eaten: 37800, adjustedIntake: 25746, energyBalance: -18900 }, bodyMetricsSet: true,
    weightChange: { startDate: "2026-08-01", startPounds: 182.4, endDate: "2026-08-30", endPounds: 180, pounds: -2.4 } };
  const drawn = startRecording();
  const blob = await buildEnergyPdf({ name: "Chris", start: "2026-08-01", end: "2026-08-31", days, energy });
  const items = drawn();
  assert.ok(blob.size > 1000);
  assert.ok(items.some(item => item.page > 1), "31 days should roll onto a second page");

  const bounds = item => item.align === "right" ? { left: item.x - item.width, right: item.x } : { left: item.x, right: item.x + item.width };
  for (const item of items) {
    const { left, right } = bounds(item);
    assert.ok(left >= 39.5, `"${item.text}" starts left of the margin`);
    assert.ok(right <= PAGE_WIDTH - 39.5, `"${item.text}" runs past the right margin`);
  }
  const lines = new Map();
  for (const item of items) lines.set(`${item.page}:${Math.round(item.y * 2)}`, [...(lines.get(`${item.page}:${Math.round(item.y * 2)}`) ?? []), item]);
  for (const [key, line] of lines) {
    const placed = line.map(item => ({ ...bounds(item), text: item.text })).sort((a, b) => a.left - b.left);
    for (let index = 1; index < placed.length; index += 1)
      assert.ok(placed[index].left >= placed[index - 1].right - 0.5, `"${placed[index - 1].text}" and "${placed[index].text}" overlap on ${key}`);
  }
  assert.deepEqual(items.filter(item => item.text.endsWith("...")).map(item => item.text), []);
  for (const header of ["EST TLL +/-", "ADJ INTAKE", "ACT. OFF.", "STEP CAL", "GOAL +/-"])
    assert.ok(items.some(item => item.text === header), `missing header ${header}`);
});
