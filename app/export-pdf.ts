/**
 * Turns an export payload into a printable PDF, entirely in the browser.
 *
 * jsPDF is loaded on demand so the library only reaches a phone that actually
 * asks for a PDF. Nothing is generated on the Worker, so this adds no server
 * cost and no paid service.
 */
import type { jsPDF } from "jspdf";
import type { ExportPayload, ExportSection } from "./export-shared";
import { type DailyNutrition, type NutritionSummary, buildSummary, dailyNutrition } from "./export-summary";
import {
  CALORIE_SHARE_NOTE, CURRENT_GOALS_NOTE, UNKNOWN_FAT_LABEL, fatSubtypeKeys, fatSubtypeShortLabels,
  goalRows, nutritionRows,
} from "./nutrition";
import { amount, mediumDate, whole } from "./shared";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
/** Space kept clear at the foot of every page for the page number. */
const FOOTER_SPACE = 44;
const BOTTOM = PAGE_HEIGHT - FOOTER_SPACE;
const ROW_HEIGHT = 15;
const HEADER_HEIGHT = 17;

const INK: [number, number, number] = [37, 51, 45];
const MUTED: [number, number, number] = [116, 128, 120];
const RULE: [number, number, number] = [214, 220, 214];
const HEADER_FILL: [number, number, number] = [237, 242, 237];
const ZEBRA_FILL: [number, number, number] = [248, 250, 247];

type Column = { header: string; width: number; align?: "left" | "right" };

/**
 * The core PDF fonts cover Latin-1 only. Curly punctuation is folded down to
 * its plain equivalent and anything further out is dropped, so a pasted emoji
 * never turns the rest of a line into rubble.
 */
function pdfSafe(value: string) {
  return String(value ?? "")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/[•·]/g, "-")
    .replace(/×/g, "x")
    .replace(/[^\n\r\t\x20-\x7E¡-ÿ]/g, "");
}

/** Section order in the printed document. */
const printOrder: ExportSection[] = [
  "goals", "weights", "dailySummaries", "foodEntries",
  "waterEntries", "exerciseEntries", "exerciseCalories", "steps", "journalEntries",
];

export async function buildExportPdf(data: ExportPayload): Promise<Blob> {
  const { jsPDF: JsPdf } = await import("jspdf");
  const doc = new JsPdf({ unit: "pt", format: "letter", compress: true }) as jsPDF;
  const chosen = new Set(data.exportMetadata.sections);
  // The same rollup the doctor summary is built from, so the two documents
  // report identical averages and calorie shares for the same range.
  const summary = buildSummary(data);
  let y = MARGIN;

  function font(size: number, style: "normal" | "bold" | "italic" = "normal", colour: [number, number, number] = INK) {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(colour[0], colour[1], colour[2]);
  }
  function newPage() { doc.addPage(); y = MARGIN; }
  /** Starts a new page when the next block would not fit above the footer. */
  function ensure(height: number) { if (y + height > BOTTOM) newPage(); }

  /** Shortens a cell so it never spills into the next column. */
  function fit(value: string, width: number) {
    const text = pdfSafe(value).replace(/\s+/g, " ").trim();
    if (doc.getTextWidth(text) <= width) return text;
    let trimmed = text;
    while (trimmed.length > 1 && doc.getTextWidth(`${trimmed}...`) > width) trimmed = trimmed.slice(0, -1);
    return `${trimmed}...`;
  }

  function sectionHeading(title: string) {
    // Keep a heading with at least the first couple of lines beneath it.
    ensure(64);
    y += 10;
    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
    y += 18;
    font(13, "bold");
    doc.text(pdfSafe(title), MARGIN, y);
    y += 16;
  }

  function paragraph(value: string, size = 9, colour: [number, number, number] = MUTED, style: "normal" | "bold" | "italic" = "normal") {
    font(size, style, colour);
    const leading = size + 4;
    for (const line of doc.splitTextToSize(pdfSafe(value), CONTENT_WIDTH) as string[]) {
      ensure(leading);
      doc.text(line, MARGIN, y);
      y += leading;
    }
    y += 3;
  }

  function table(columns: Column[], rows: string[][]) {
    let zebra = false;
    function drawHeader() {
      doc.setFillColor(HEADER_FILL[0], HEADER_FILL[1], HEADER_FILL[2]);
      doc.rect(MARGIN, y, CONTENT_WIDTH, HEADER_HEIGHT, "F");
      font(7.5, "bold", MUTED);
      let x = MARGIN;
      for (const column of columns) {
        const right = column.align === "right";
        doc.text(fit(column.header.toUpperCase(), column.width - 12), right ? x + column.width - 6 : x + 6, y + 11.5, right ? { align: "right" } : undefined);
        x += column.width;
      }
      y += HEADER_HEIGHT;
    }

    ensure(HEADER_HEIGHT + ROW_HEIGHT * 2);
    drawHeader();
    for (const row of rows) {
      if (y + ROW_HEIGHT > BOTTOM) { newPage(); drawHeader(); zebra = false; }
      if (zebra) {
        doc.setFillColor(ZEBRA_FILL[0], ZEBRA_FILL[1], ZEBRA_FILL[2]);
        doc.rect(MARGIN, y, CONTENT_WIDTH, ROW_HEIGHT, "F");
      }
      zebra = !zebra;
      font(8.5, "normal", INK);
      let x = MARGIN;
      columns.forEach((column, index) => {
        const right = column.align === "right";
        doc.text(fit(row[index] ?? "", column.width - 12), right ? x + column.width - 6 : x + 6, y + 10.5, right ? { align: "right" } : undefined);
        x += column.width;
      });
      y += ROW_HEIGHT;
    }
    y += 8;
  }

  function emptySection() { paragraph("No entries recorded in this date range.", 9, MUTED, "italic"); }

  /**
   * Total fat with its four subtypes, one row per day, printed beneath the
   * daily totals rather than squeezed into them: eleven columns on a letter
   * page would leave every heading truncated.
   *
   * A subtype nothing recorded prints "Not available", never 0 g. A sum that
   * covers only some of the day's entries is starred, so a partial figure is
   * never read as the whole day.
   */
  function fatBreakdownTable(days: DailyNutrition[]) {
    if (days.length === 0) return;
    ensure(60);
    y += 4;
    font(10, "bold", INK);
    doc.text("Fat breakdown", MARGIN, y);
    y += 14;
    paragraph(
      "Grams per day. Subtypes are not expected to add up to total fat: labels omit some subtypes, round each line "
      + "separately, and leave other fat components unreported. A starred figure covers only the entries for that day "
      + "that recorded it.",
      8.5,
    );
    let partial = false;
    const rows = days.map(day => {
      const detail = day.fatDetail;
      return [
        mediumDate(day.date),
        amount(detail.total),
        ...fatSubtypeKeys.map(key => {
          const value = detail.subtotals[key];
          if (value === null) return UNKNOWN_FAT_LABEL;
          const incomplete = detail.missing[key] > 0;
          if (incomplete) partial = true;
          return `${amount(value)}${incomplete ? " *" : ""}`;
        }),
      ];
    });
    table(
      [
        { header: "Date", width: 84 },
        { header: "Total fat", width: 66, align: "right" },
        { header: fatSubtypeShortLabels.saturatedFat, width: 90, align: "right" },
        { header: fatSubtypeShortLabels.transFat, width: 90, align: "right" },
        { header: "Monounsat.", width: 93, align: "right" },
        { header: "Polyunsat.", width: 93, align: "right" },
      ],
      rows,
    );
    if (partial) paragraph("* Covers only some of that day's food entries, so the real total is higher.", 8.5);
  }

  /**
   * Averages per recorded day with a percentage beside each metric.
   *
   * Two different percentages appear and are always labelled: a share of the
   * average calories, and how much of a configured goal was reached. Fiber
   * only ever shows the second. Total carbohydrates are always listed and
   * never carry a goal.
   */
  function averagesTable(nutrition: NutritionSummary) {
    if (nutrition.recordedDays === 0) return;
    const withGoals = chosen.has("goals") && Boolean(summary.goals);
    ensure(60);
    y += 4;
    font(10, "bold", INK);
    doc.text("Averages and calorie shares", MARGIN, y);
    y += 14;
    const rows = nutritionRows({
      averages: nutrition.averages,
      fat: nutrition.fat,
      recordedDays: nutrition.recordedDays,
      goals: withGoals ? summary.goals : null,
      subtypeDays: nutrition.fatSubtypeDays,
    });
    const metric = (row: { metric: string; nested?: boolean }) => row.nested ? `- ${row.metric}` : row.metric;
    // Coverage is left to the fat breakdown table's own note above, so nothing
    // here has to be shortened to fit.
    const printed = (row: { calorieShare: string; goalContext: string }) =>
      [row.calorieShare, row.goalContext].filter(Boolean).join(" · ") || "-";
    if (withGoals) {
      table(
        [
          { header: "Metric", width: 96 },
          { header: "Avg / recorded day", width: 88, align: "right" },
          { header: "Goal", width: 56, align: "right" },
          { header: "Percentage or context", width: 276 },
        ],
        rows.map(row => [metric(row), row.average, row.goal, printed(row)]),
      );
    } else {
      table(
        [
          { header: "Metric", width: 110 },
          { header: "Avg / recorded day", width: 100, align: "right" },
          { header: "Calorie share", width: 306 },
        ],
        rows.map(row => [metric(row), row.average, printed(row)]),
      );
    }
    paragraph(
      `Averages cover the ${nutrition.recordedDays} ${nutrition.recordedDays === 1 ? "day" : "days"} holding at least `
      + "one food entry, not every calendar day in the range.",
      8.5,
    );
    paragraph(CALORIE_SHARE_NOTE, 8.5);
    if (withGoals) paragraph(CURRENT_GOALS_NOTE, 8.5);
  }

  // ---- Cover block -------------------------------------------------------
  font(20, "bold");
  doc.text("Health export", MARGIN, y + 6);
  y += 28;
  font(11, "normal", INK);
  doc.text(pdfSafe(data.user.name), MARGIN, y);
  y += 16;
  font(9.5, "normal", MUTED);
  doc.text(`${mediumDate(data.dateRange.start)} through ${mediumDate(data.dateRange.end)}  (${data.dateRange.days} ${data.dateRange.days === 1 ? "day" : "days"})`, MARGIN, y);
  y += 14;
  doc.text(`Created ${new Date(data.exportMetadata.generatedAt).toLocaleString()}`, MARGIN, y);
  y += 14;
  const included = printOrder.filter(section => chosen.has(section)).map(section => sectionTitles[section]);
  font(9, "normal", MUTED);
  for (const line of doc.splitTextToSize(`Sections: ${included.join(", ")}`, CONTENT_WIDTH) as string[]) {
    doc.text(line, MARGIN, y);
    y += 12;
  }
  y += 2;

  // ---- Sections ----------------------------------------------------------
  for (const section of printOrder) {
    if (!chosen.has(section)) continue;
    sectionHeading(sectionTitles[section]);
    switch (section) {
      case "goals": {
        const current = data.goals?.current;
        if (!current) paragraph("No goals have been saved for this profile.", 9, MUTED, "italic");
        else {
          table(
            [
              { header: "Goal", width: 160 },
              { header: "Target", width: 120, align: "right" },
              { header: "Calorie context", width: 236 },
            ],
            goalRows(current).map(row => [row.label, row.target, row.context || "-"]),
          );
          paragraph(
            "Fiber is a gram goal and has no calorie share. Net carbs are shown as a calorie-equivalent because they "
            + "exclude fiber, and there is no total-carbohydrate goal. The saturated fat goal is optional.",
          );
        }
        const stamped = data.goals?.dailyCalorieGoals ?? [];
        if (stamped.length > 0) {
          ensure(40);
          paragraph("Calorie goal saved against each day in this range:", 9);
          table(
            [{ header: "Date", width: 258 }, { header: "Calorie goal", width: 258, align: "right" }],
            stamped.map(row => [mediumDate(row.date), whole(row.calories)]),
          );
        }
        break;
      }
      case "weights": {
        const rows = data.weights ?? [];
        if (rows.length === 0) { emptySection(); break; }
        const first = rows[0]; const last = rows[rows.length - 1];
        const change = Math.round((last.pounds - first.pounds) * 100) / 100;
        paragraph(
          `Starting weight ${amount(first.pounds)} lbs on ${mediumDate(first.date)}. `
          + `Latest weight ${amount(last.pounds)} lbs on ${mediumDate(last.date)}. `
          + (rows.length < 2 ? "Only one reading in this range." : `Change ${change > 0 ? "+" : change < 0 ? "-" : ""}${amount(Math.abs(change))} lbs.`),
          9.5, INK,
        );
        table(
          [
            { header: "Date", width: 130 },
            { header: "Weight (lbs)", width: 90, align: "right" },
            { header: "Change", width: 96, align: "right" },
            { header: "Note", width: 200 },
          ],
          rows.map((row, index) => {
            const previous = rows[index - 1];
            const step = previous ? Math.round((row.pounds - previous.pounds) * 100) / 100 : null;
            return [
              mediumDate(row.date),
              amount(row.pounds),
              step === null ? "first" : step === 0 ? "0" : `${step > 0 ? "+" : "-"}${amount(Math.abs(step))}`,
              row.note ?? "",
            ];
          }),
        );
        break;
      }
      case "dailySummaries": {
        const rows = data.dailySummaries ?? [];
        if (rows.length === 0) { emptySection(); break; }
        table(
          [
            { header: "Date", width: 96 },
            { header: "Calories", width: 60, align: "right" },
            { header: "Protein", width: 60, align: "right" },
            { header: "Fat", width: 54, align: "right" },
            { header: "Carbs", width: 60, align: "right" },
            { header: "Fiber", width: 54, align: "right" },
            { header: "Net carbs", width: 66, align: "right" },
            { header: "Items", width: 66, align: "right" },
          ],
          rows.map(row => [
            mediumDate(row.date), amount(row.calories), amount(row.protein), amount(row.fat),
            amount(row.carbs), amount(row.fiber), amount(row.netCarbs), String(row.foodItems),
          ]),
        );
        fatBreakdownTable(dailyNutrition(data));
        if (summary.nutrition) averagesTable(summary.nutrition);
        break;
      }
      case "foodEntries": {
        const rows = data.foodEntries ?? [];
        if (rows.length === 0) { emptySection(); break; }
        table(
          [
            { header: "Date", width: 66 },
            { header: "Meal", width: 50 },
            { header: "Food", width: 132 },
            { header: "Serving", width: 74 },
            { header: "Cal", width: 40, align: "right" },
            { header: "Protein", width: 52, align: "right" },
            { header: "Fat", width: 40, align: "right" },
            { header: "Net carbs", width: 62, align: "right" },
          ],
          rows.map(row => [
            mediumDate(row.date), row.meal, row.name, row.serving,
            amount(row.calories), amount(row.protein), amount(row.fat), amount(row.netCarbs),
          ]),
        );
        // The daily totals section already prints this when it travelled, so it
        // is only added here when the individual entries came on their own.
        if (!chosen.has("dailySummaries")) {
          fatBreakdownTable(dailyNutrition(data));
          if (summary.nutrition) averagesTable(summary.nutrition);
        }
        break;
      }
      case "waterEntries": {
        const rows = data.waterEntries ?? [];
        if (rows.length === 0) { emptySection(); break; }
        const byDate = new Map<string, { ounces: number; count: number }>();
        for (const row of rows) {
          const day = byDate.get(row.date) ?? { ounces: 0, count: 0 };
          day.ounces += row.ounces; day.count += 1;
          byDate.set(row.date, day);
        }
        table(
          [
            { header: "Date", width: 200 },
            { header: "Entries", width: 116, align: "right" },
            { header: "Total ounces", width: 200, align: "right" },
          ],
          [...byDate.entries()].map(([date, day]) => [mediumDate(date), String(day.count), amount(Math.round(day.ounces * 100) / 100)]),
        );
        break;
      }
      case "exerciseEntries": {
        const rows = data.exerciseEntries ?? [];
        if (rows.length === 0) { emptySection(); break; }
        const withCalories = chosen.has("exerciseCalories");
        table(
          withCalories
            ? [{ header: "Date", width: 96 }, { header: "Activity", width: 210 }, { header: "Minutes", width: 90, align: "right" }, { header: "Calories burned", width: 120, align: "right" }]
            : [{ header: "Date", width: 116 }, { header: "Activity", width: 280 }, { header: "Minutes", width: 120, align: "right" }],
          rows.map(row => withCalories
            ? [mediumDate(row.date), row.activity, amount(row.minutes), amount(row.caloriesBurned ?? 0)]
            : [mediumDate(row.date), row.activity, amount(row.minutes)]),
        );
        // Comments are too long for a table cell, so they follow the table as
        // wrapped paragraphs that break across pages on their own.
        const noted = rows.filter(row => (row.comments ?? "").trim().length > 0);
        if (noted.length > 0) {
          ensure(46);
          y += 4;
          font(10, "bold", INK);
          doc.text("Activity notes", MARGIN, y);
          y += 15;
          for (const row of noted) {
            const heading = `${mediumDate(row.date)} - ${row.activity} - ${amount(row.minutes)} min`
              + (withCalories ? ` - ${amount(row.caloriesBurned ?? 0)} cal` : "");
            font(9, "normal", INK);
            const lines = doc.splitTextToSize(pdfSafe(row.comments ?? ""), CONTENT_WIDTH - 10) as string[];
            // Keep the heading with at least the first two lines of its note.
            ensure(14 + Math.min(lines.length, 2) * 12.5 + 4);
            font(9, "bold", INK);
            doc.text(pdfSafe(heading), MARGIN, y);
            y += 13;
            font(9, "normal", MUTED);
            for (const line of lines) {
              if (y + 12.5 > BOTTOM) newPage();
              doc.text(line, MARGIN + 10, y);
              y += 12.5;
            }
            y += 7;
          }
        }
        break;
      }
      case "exerciseCalories": {
        const rows = data.exerciseCalories ?? [];
        if (rows.length === 0) { emptySection(); break; }
        const burned = rows.reduce((sum, row) => sum + row.caloriesBurned, 0);
        paragraph(`${whole(burned)} calories burned across ${rows.length} ${rows.length === 1 ? "day" : "days"} of recorded movement.`, 9.5, INK);
        table(
          [
            { header: "Date", width: 129 },
            { header: "Sessions", width: 129, align: "right" },
            { header: "Minutes", width: 129, align: "right" },
            { header: "Calories burned", width: 129, align: "right" },
          ],
          rows.map(row => [mediumDate(row.date), String(row.sessions), amount(row.minutes), amount(row.caloriesBurned)]),
        );
        break;
      }
      case "steps": {
        const rows = data.steps ?? [];
        if (rows.length === 0) { emptySection(); break; }
        const total = rows.reduce((sum, row) => sum + row.steps, 0);
        paragraph(`${whole(total)} steps across ${rows.length} recorded ${rows.length === 1 ? "day" : "days"}, averaging ${whole(total / rows.length)} per recorded day.`, 9.5, INK);
        table(
          [{ header: "Date", width: 258 }, { header: "Steps", width: 258, align: "right" }],
          rows.map(row => [mediumDate(row.date), whole(row.steps)]),
        );
        break;
      }
      case "journalEntries": {
        const rows = data.journalEntries ?? [];
        if (rows.length === 0) { emptySection(); break; }
        for (const entry of rows) {
          font(9.5, "normal", INK);
          const lines = doc.splitTextToSize(pdfSafe(entry.body), CONTENT_WIDTH) as string[];
          // Keep the date with at least the first two lines of its entry.
          ensure(18 + Math.min(lines.length, 2) * 13 + 6);
          font(10.5, "bold", INK);
          doc.text(pdfSafe(mediumDate(entry.date)), MARGIN, y);
          y += 15;
          font(9.5, "normal", INK);
          for (const line of lines) {
            if (y + 13 > BOTTOM) newPage();
            doc.text(line, MARGIN, y);
            y += 13;
          }
          y += 10;
        }
        break;
      }
    }
  }

  // ---- Page numbers ------------------------------------------------------
  const pages = doc.getNumberOfPages();
  const footerLeft = pdfSafe(`${data.user.name} - ${data.dateRange.start} to ${data.dateRange.end}`);
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    font(8, "normal", MUTED);
    doc.text(footerLeft, MARGIN, PAGE_HEIGHT - 26);
    doc.text(`Page ${page} of ${pages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 26, { align: "right" });
  }

  return doc.output("blob");
}

const sectionTitles: Record<ExportSection, string> = {
  goals: "Nutrition goals",
  weights: "Weight history",
  dailySummaries: "Daily nutrition totals",
  foodEntries: "Food diary entries",
  waterEntries: "Water and hydration",
  exerciseEntries: "Exercise and movement",
  exerciseCalories: "Exercise calories",
  steps: "Steps",
  journalEntries: "Journal entries",
};
