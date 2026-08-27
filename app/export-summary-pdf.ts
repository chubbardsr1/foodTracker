/**
 * The one-page summary PDF, built in the browser exactly like the detailed
 * export.
 *
 * This is a second, separate document. The detailed export in `export-pdf.ts`
 * is untouched: that one lists every row, this one lists none of them. It is
 * meant to be handed to a doctor or read on a phone, so it stays on one page
 * where it can and rolls onto a clean second page rather than shrinking the
 * type past reading size.
 *
 * jsPDF is imported on demand, so a phone that never asks for a summary never
 * downloads the library. Nothing is generated on the Worker and no external or
 * paid service is involved.
 */
import type { jsPDF } from "jspdf";
import type { ExportPayload } from "./export-shared";
import { type Summary, buildSummary, weightChangeWords } from "./export-summary";
import {
  UNKNOWN_FAT_LABEL, fatCoverageNote, fatDetailComplete, fatSubtypeKeys, fatSubtypeLabels, hasFatDetail,
} from "./nutrition";
import { amount, mediumDate, shortDate, whole } from "./shared";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
/** Space kept clear at the foot of every page for the page number. */
const FOOTER_SPACE = 32;
const BOTTOM = PAGE_HEIGHT - FOOTER_SPACE;

const INK: [number, number, number] = [37, 51, 45];
const MUTED: [number, number, number] = [116, 128, 120];
const RULE: [number, number, number] = [214, 220, 214];
const HEADER_FILL: [number, number, number] = [237, 242, 237];
const CARD_FILL: [number, number, number] = [248, 250, 247];
const LINE: [number, number, number] = [115, 150, 133];

type Column = { header: string; width: number; align?: "left" | "right" };

/**
 * The core PDF fonts cover Latin-1 only, so curly punctuation is folded down
 * and anything further out is dropped. Same treatment the detailed export
 * gives a pasted emoji.
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

/** Grams and ounces read best at one decimal; the maths above stays unrounded. */
const oneDecimal = (value: number) => (Math.round(value * 10) / 10).toFixed(1);

export async function buildSummaryPdf(data: ExportPayload): Promise<Blob> {
  const summary = buildSummary(data);
  const { jsPDF: JsPdf } = await import("jspdf");
  const doc = new JsPdf({ unit: "pt", format: "letter", compress: true }) as jsPDF;
  let y = MARGIN;

  function font(size: number, style: "normal" | "bold" | "italic" = "normal", colour: [number, number, number] = INK) {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(colour[0], colour[1], colour[2]);
  }
  function newPage() { doc.addPage(); y = MARGIN; }
  /** Starts a second page when the next block would not fit above the footer. */
  function ensure(height: number) { if (y + height > BOTTOM) newPage(); }

  /** Shortens a cell so a long name or a huge number never spills sideways. */
  function fit(value: string, width: number) {
    const text = pdfSafe(value).replace(/\s+/g, " ").trim();
    if (doc.getTextWidth(text) <= width) return text;
    let trimmed = text;
    while (trimmed.length > 1 && doc.getTextWidth(`${trimmed}...`) > width) trimmed = trimmed.slice(0, -1);
    return `${trimmed}...`;
  }

  function heading(title: string) {
    // Keep a heading with the first rows of whatever follows it.
    ensure(50);
    y += 5;
    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
    y += 13;
    font(11, "bold");
    doc.text(pdfSafe(title), MARGIN, y);
    y += 11.5;
  }

  function paragraph(value: string, size = 8.5, colour: [number, number, number] = MUTED, style: "normal" | "bold" | "italic" = "normal") {
    font(size, style, colour);
    const leading = size + 3;
    for (const line of doc.splitTextToSize(pdfSafe(value), CONTENT_WIDTH) as string[]) {
      ensure(leading);
      doc.text(line, MARGIN, y);
      y += leading;
    }
    y += 3;
  }

  /**
   * Label and value pairs laid side by side, which is how a page of stats stays
   * short enough to read at a glance instead of running to a second page.
   */
  function facts(pairs: [string, string][], perRow = 2) {
    const gap = 14;
    const columnWidth = (CONTENT_WIDTH - gap * (perRow - 1)) / perRow;
    const rowHeight = 13;
    for (let index = 0; index < pairs.length; index += perRow) {
      ensure(rowHeight);
      pairs.slice(index, index + perRow).forEach((pair, column) => {
        const x = MARGIN + column * (columnWidth + gap);
        font(8, "normal", MUTED);
        const label = fit(pair[0], columnWidth * 0.56);
        doc.text(label, x, y + 9);
        const labelWidth = doc.getTextWidth(label);
        font(9, "bold", INK);
        // The value takes whatever the label left behind, so a long label and a
        // long value never overlap in the middle of the column.
        doc.text(fit(pair[1], columnWidth - labelWidth - 8), x + columnWidth, y + 9, { align: "right" });
      });
      doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, y + rowHeight - 1, MARGIN + CONTENT_WIDTH, y + rowHeight - 1);
      y += rowHeight;
    }
    y += 4;
  }

  function table(columns: Column[], rows: string[][]) {
    const headerHeight = 14;
    const rowHeight = 13;
    ensure(headerHeight + rowHeight * 2);
    doc.setFillColor(HEADER_FILL[0], HEADER_FILL[1], HEADER_FILL[2]);
    doc.rect(MARGIN, y, CONTENT_WIDTH, headerHeight, "F");
    font(7, "bold", MUTED);
    let headerX = MARGIN;
    for (const column of columns) {
      const right = column.align === "right";
      doc.text(fit(column.header.toUpperCase(), column.width - 12), right ? headerX + column.width - 6 : headerX + 6, y + 9.5, right ? { align: "right" } : undefined);
      headerX += column.width;
    }
    y += headerHeight;
    let zebra = false;
    for (const row of rows) {
      ensure(rowHeight);
      if (zebra) {
        doc.setFillColor(CARD_FILL[0], CARD_FILL[1], CARD_FILL[2]);
        doc.rect(MARGIN, y, CONTENT_WIDTH, rowHeight, "F");
      }
      zebra = !zebra;
      font(8.5, "normal", INK);
      let x = MARGIN;
      columns.forEach((column, index) => {
        const right = column.align === "right";
        doc.text(fit(row[index] ?? "", column.width - 12), right ? x + column.width - 6 : x + 6, y + 9, right ? { align: "right" } : undefined);
        x += column.width;
      });
      y += rowHeight;
    }
    y += 5;
  }

  /** Three headline boxes, used for the weight story at the top of its section. */
  function cards(items: { label: string; value: string; note: string }[]) {
    const gap = 8;
    const width = (CONTENT_WIDTH - gap * (items.length - 1)) / items.length;
    const height = 38;
    ensure(height + 4);
    items.forEach((item, index) => {
      const x = MARGIN + index * (width + gap);
      doc.setFillColor(CARD_FILL[0], CARD_FILL[1], CARD_FILL[2]);
      doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
      doc.setLineWidth(0.6);
      doc.roundedRect(x, y, width, height, 5, 5, "FD");
      font(6.5, "bold", MUTED);
      doc.text(fit(item.label.toUpperCase(), width - 16), x + 8, y + 11);
      font(12.5, "bold", INK);
      doc.text(fit(item.value, width - 16), x + 8, y + 25.5);
      font(6.5, "normal", MUTED);
      doc.text(fit(item.note, width - 16), x + 8, y + 34);
    });
    y += height + 6;
  }

  /**
   * The weight readings drawn as a plain line, placed by their real date so a
   * gap between weigh-ins shows as a gap. Nothing is interpolated.
   */
  function weightChart(points: { date: string; pounds: number }[]) {
    if (points.length < 2) return;
    const height = 50;
    ensure(height + 6);
    const left = MARGIN + 34;
    const right = MARGIN + CONTENT_WIDTH - 6;
    const top = y + 5;
    const foot = y + height - 12;
    const day = (date: string) => Math.round(new Date(`${date}T12:00:00`).getTime() / 86400000);
    const first = day(points[0].date);
    const span = day(points[points.length - 1].date) - first;
    let low = Math.min(...points.map(point => point.pounds));
    let high = Math.max(...points.map(point => point.pounds));
    // A flat run still needs a band to sit in.
    if (high - low < 1) { const middle = (high + low) / 2; low = middle - 1; high = middle + 1; }
    else { const margin = (high - low) * 0.12; low -= margin; high += margin; }
    const plotX = (date: string) => span === 0 ? (left + right) / 2 : left + (day(date) - first) / span * (right - left);
    const plotY = (pounds: number) => top + (high - pounds) / (high - low) * (foot - top);

    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setLineWidth(0.5);
    for (const value of [high, (high + low) / 2, low]) {
      const lineY = plotY(value);
      doc.line(left, lineY, right, lineY);
      font(6.5, "normal", MUTED);
      doc.text(amount(Math.round(value * 10) / 10), left - 5, lineY + 2.5, { align: "right" });
    }
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(1.2);
    for (let index = 1; index < points.length; index += 1) {
      doc.line(plotX(points[index - 1].date), plotY(points[index - 1].pounds), plotX(points[index].date), plotY(points[index].pounds));
    }
    doc.setFillColor(LINE[0], LINE[1], LINE[2]);
    const dot = points.length > 40 ? 1.1 : 1.9;
    for (const point of points) doc.circle(plotX(point.date), plotY(point.pounds), dot, "F");
    font(6.5, "normal", MUTED);
    doc.text(pdfSafe(shortDate(points[0].date)), left, y + height - 3);
    doc.text(pdfSafe(shortDate(points[points.length - 1].date)), right, y + height - 3, { align: "right" });
    y += height + 2;
  }

  // ---- Report information ------------------------------------------------
  font(18, "bold");
  doc.text("Health Progress Summary", MARGIN, y + 8);
  y += 25;
  font(11, "bold", INK);
  doc.text(fit(summary.user.name, CONTENT_WIDTH), MARGIN, y);
  y += 13;
  font(8.5, "normal", MUTED);
  // Range, length, and timestamp share one line so the summary itself starts higher.
  for (const line of doc.splitTextToSize(
    pdfSafe(`${mediumDate(summary.range.start)} through ${mediumDate(summary.range.end)}`
      + `  -  ${summary.range.days} calendar ${summary.range.days === 1 ? "day" : "days"} in range`
      + `  -  generated ${new Date(summary.generatedAt).toLocaleString()}`),
    CONTENT_WIDTH,
  ) as string[]) {
    doc.text(line, MARGIN, y);
    y += 11.5;
  }
  y += 1;

  writeSummary(summary, { heading, paragraph, facts, table, cards, weightChart });

  // ---- Page numbers ------------------------------------------------------
  const pages = doc.getNumberOfPages();
  const footerLeft = pdfSafe(`${summary.user.name} - health summary - ${summary.range.start} to ${summary.range.end}`);
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    font(7.5, "normal", MUTED);
    doc.text(footerLeft, MARGIN, PAGE_HEIGHT - 22);
    doc.text(`Page ${page} of ${pages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 22, { align: "right" });
  }

  return doc.output("blob");
}

type Painter = {
  heading: (title: string) => void;
  paragraph: (value: string, size?: number, colour?: [number, number, number], style?: "normal" | "bold" | "italic") => void;
  facts: (pairs: [string, string][], perRow?: number) => void;
  table: (columns: Column[], rows: string[][]) => void;
  cards: (items: { label: string; value: string; note: string }[]) => void;
  weightChart: (points: { date: string; pounds: number }[]) => void;
};

/**
 * Lays the summary out. Kept apart from the drawing helpers so the wording and
 * the order of the sections are readable in one place.
 */
function writeSummary(summary: Summary, paint: Painter) {
  const { heading, paragraph, facts, table, cards, weightChart } = paint;

  // ---- Weight progress ---------------------------------------------------
  if (summary.show.weight && summary.weight) {
    const weight = summary.weight;
    heading("Weight progress");
    if (weight.entries === 0 || !weight.first || !weight.last) {
      paragraph("No weight was recorded in this range.", 9, MUTED, "italic");
    } else if (weight.entries === 1) {
      cards([
        { label: "Only reading", value: `${amount(weight.first.pounds)} lb`, note: mediumDate(weight.first.date) },
        { label: "Change", value: "Not available", note: "one reading in range" },
        { label: "Weight entries", value: "1", note: "in this range" },
      ]);
      paragraph("Only one weight was recorded in this range, so no change or weekly rate can be worked out.");
    } else {
      cards([
        { label: "Starting weight", value: `${amount(weight.first.pounds)} lb`, note: mediumDate(weight.first.date) },
        { label: "Latest weight", value: `${amount(weight.last.pounds)} lb`, note: mediumDate(weight.last.date) },
        { label: "Change", value: weightChangeWords(weight.change), note: `over ${weight.daysApart} ${weight.daysApart === 1 ? "day" : "days"}` },
      ]);
      weightChart(weight.points);
      const rate = weight.perWeek === null
        ? "Average weekly change: not shown, because the first and last readings are less than a week apart."
        : `Average weekly change: ${weightChangeWords(Math.round(weight.perWeek * 100) / 100)} per week.`;
      paragraph(`${weight.entries} weight entries recorded in this range. ${rate}`);
    }
  }

  // ---- Nutrition averages ------------------------------------------------
  if (summary.show.nutrition && summary.nutrition) {
    const nutrition = summary.nutrition;
    heading("Nutrition averages");
    if (nutrition.recordedDays === 0) {
      paragraph("No food was recorded in this range, so there is nothing to average.", 9, MUTED, "italic");
    } else {
      const goals = summary.goals;
      const days = String(nutrition.recordedDays);
      const rows: string[][] = [
        ["Calories", whole(nutrition.averages.calories), goals ? whole(goals.calories) : "", days],
        ["Protein", `${oneDecimal(nutrition.averages.protein)} g`, goals ? `${amount(goals.protein)} g` : "", days],
        // The tracker sets a net-carb goal, never a total-carb one, so that cell
        // says so outright rather than looking like a missing number.
        ["Total carbs", `${oneDecimal(nutrition.averages.carbs)} g`, goals ? "no goal set" : "", days],
        ["Fiber", `${oneDecimal(nutrition.averages.fiber)} g`, goals ? `${amount(goals.fiber)} g` : "", days],
        ["Net carbs", `${oneDecimal(nutrition.averages.netCarbs)} g`, goals ? `${amount(goals.netCarbs)} g` : "", days],
        ["Fat", `${oneDecimal(nutrition.averages.fat)} g`, goals ? `${amount(goals.fat)} g` : "", days],
      ];
      // The fat breakdown sits directly under total fat. Total fat stays the
      // primary figure; these four are never added up to replace it, and a
      // subtype nothing recorded reads "Not available" rather than 0.0 g. The
      // days cell shows how many of the recorded days actually carried it.
      for (const key of fatSubtypeKeys) {
        const average = nutrition.fatAverages[key];
        rows.push([
          `- ${fatSubtypeLabels[key]}`,
          average === null ? UNKNOWN_FAT_LABEL : `${oneDecimal(average)} g`,
          // No subtype has a goal, exactly as total carbs has none.
          goals ? "no goal set" : "",
          average === null ? "-" : `${nutrition.fatSubtypeDays[key]} of ${days}`,
        ]);
      }
      if (summary.show.goals) {
        // The goal column says whose target it is in its own header, so the
        // reader never has to guess whether it is current or historic.
        table(
          [
            { header: "Metric", width: 164 },
            { header: "Average per recorded day", width: 152, align: "right" },
            { header: "Current daily goal", width: 110, align: "right" },
            { header: "Recorded days", width: 106, align: "right" },
          ],
          rows.map(row => [row[0], row[1], row[2] === "" ? "-" : row[2], row[3]]),
        );
      } else {
        // The goal column is dropped entirely rather than left blank.
        table(
          [
            { header: "Metric", width: 212 },
            { header: "Average per recorded day", width: 180, align: "right" },
            { header: "Recorded days", width: 140, align: "right" },
          ],
          rows.map(row => [row[0], row[1], row[3]]),
        );
      }
      const stamped = summary.stampedCalorieGoals;
      const goalNote = !summary.show.goals ? ""
        : !summary.goals ? " No goals have been saved for this profile."
        : stamped && (stamped.low !== summary.goals.calories || stamped.high !== summary.goals.calories)
          ? ` The calorie goal in force on days in this range ran from ${whole(stamped.low)} to ${whole(stamped.high)}.`
          : "";
      paragraph(
        `Averages cover the ${nutrition.recordedDays} ${nutrition.recordedDays === 1 ? "day" : "days"} holding at least one food entry, `
        + `not all ${summary.range.days} calendar days. Net carbs are total carbs less fiber.${goalNote}`,
      );
      // Said plainly, because a partial subtype sum divided by every recorded
      // day is a floor, not the patient's real intake.
      const fatDetail = nutrition.fat;
      if (!hasFatDetail(fatDetail)) {
        paragraph(
          "Fat breakdown: none of the food recorded in this range carries saturated, trans, monounsaturated, or "
          + "polyunsaturated fat, so only total fat is available. These entries predate the breakdown rather than "
          + "containing none.",
        );
      } else if (!fatDetailComplete(fatDetail)) {
        paragraph(
          `Fat breakdown: ${fatCoverageNote(fatDetail)} Each subtype average is divided by the same `
          + `${nutrition.recordedDays} recorded ${nutrition.recordedDays === 1 ? "day" : "days"}, so where the record is `
          + "incomplete it is a minimum rather than the full amount. Subtypes are not expected to add up to total fat.",
        );
      } else {
        paragraph(
          "Fat breakdown: every food entry in this range recorded all four subtypes. They are still not expected to add "
          + "up to total fat, because labels round each line separately and some fat is not reported as any subtype.",
        );
      }
    }
  }

  // ---- Hydration ---------------------------------------------------------
  if (summary.show.hydration && summary.hydration) {
    const hydration = summary.hydration;
    heading("Hydration");
    if (hydration.recordedDays === 0) {
      paragraph("No water was recorded in this range.", 9, MUTED, "italic");
    } else {
      const pairs: [string, string][] = [
        ["Average per recorded day", `${oneDecimal(hydration.averageOunces)} oz`],
        ["Recorded hydration days", String(hydration.recordedDays)],
      ];
      if (summary.show.goals) pairs.push(["Daily hydration goal", summary.goals ? `${amount(summary.goals.waterOunces)} oz` : "no goal set"]);
      pairs.push(["Total recorded", `${oneDecimal(hydration.totalOunces)} oz`]);
      // Why the missing dates are left out is said once, under Data coverage.
      facts(pairs);
    }
  }

  // ---- Exercise and movement --------------------------------------------
  if (summary.show.exercise && summary.exercise) {
    const exercise = summary.exercise;
    heading("Exercise and movement");
    if (exercise.recordedDays === 0) {
      paragraph("No exercise was recorded in this range.", 9, MUTED, "italic");
    } else {
      const pairs: [string, string][] = [["Recorded exercise days", String(exercise.recordedDays)]];
      if (exercise.showMovement) {
        pairs.push(["Activities recorded", String(exercise.activities)]);
        pairs.push(["Total minutes", oneDecimal(exercise.totalMinutes)]);
        pairs.push(["Average minutes per recorded day", oneDecimal(exercise.averageMinutes)]);
      }
      if (exercise.showCalories) {
        pairs.push(["Total estimated calories burned", whole(exercise.totalCalories)]);
        pairs.push(["Average calories per recorded day", whole(exercise.averageCalories)]);
      }
      facts(pairs);
      if (exercise.showCalories) {
        paragraph("Calories burned are an estimate, reported on their own. They are never added to, or taken off, the calories eaten above.");
      }
    }
  }

  // ---- Steps -------------------------------------------------------------
  if (summary.show.steps && summary.steps) {
    const steps = summary.steps;
    heading("Steps");
    if (steps.recordedDays === 0) {
      paragraph("No step counts were recorded in this range.", 9, MUTED, "italic");
    } else {
      const day = (entry: { date: string; steps: number } | null) =>
        entry ? `${whole(entry.steps)} on ${mediumDate(entry.date)}` : "-";
      facts([
        ["Average per recorded day", whole(steps.averageSteps)],
        ["Recorded step days", String(steps.recordedDays)],
        // With a single recorded day the highest and lowest are the same row,
        // so it is named once instead of printed twice.
        ...(steps.recordedDays === 1
          ? [["Only recorded day", day(steps.highest)] as [string, string]]
          : [
              ["Highest recorded day", day(steps.highest)] as [string, string],
              ["Lowest recorded day", day(steps.lowest)] as [string, string],
            ]),
      ]);
      // The tracker has no step goal to quote, so none is invented here. A count
      // saved as 0 is a recorded day; that rule is stated under Data coverage.
    }
  }

  // ---- Journal participation --------------------------------------------
  if (summary.show.journal && summary.journal) {
    const journal = summary.journal;
    heading("Journal participation");
    if (journal.entries === 0) {
      paragraph("No journal entries were written in this range.", 9, MUTED, "italic");
    } else {
      // The written entries themselves stay in the detailed export.
      facts([
        ["Journal entries", String(journal.entries)],
        ["Dates with an entry", String(journal.dates)],
      ]);
    }
  }

  // ---- Data coverage -----------------------------------------------------
  heading("Data coverage");
  const days = (count: number) => `${count} recorded ${count === 1 ? "day" : "days"}`;
  const coverage: [string, string][] = [["Calendar days", String(summary.range.days)]];
  if (summary.show.nutrition && summary.nutrition) coverage.push(["Nutrition", days(summary.nutrition.recordedDays)]);
  if (summary.show.hydration && summary.hydration) coverage.push(["Hydration", days(summary.hydration.recordedDays)]);
  if (summary.show.exercise && summary.exercise) coverage.push(["Exercise", days(summary.exercise.recordedDays)]);
  if (summary.show.steps && summary.steps) coverage.push(["Steps", days(summary.steps.recordedDays)]);
  if (summary.show.weight && summary.weight) coverage.push(["Weight", `${summary.weight.entries} ${summary.weight.entries === 1 ? "entry" : "entries"}`]);
  if (summary.show.journal && summary.journal) coverage.push(["Journal", `${summary.journal.entries} ${summary.journal.entries === 1 ? "entry" : "entries"}`]);
  facts(coverage, 3);

  const lead = summary.show.nutrition && summary.nutrition
    ? `This ${summary.range.days}-day range contains ${summary.nutrition.recordedDays} recorded nutrition ${summary.nutrition.recordedDays === 1 ? "day" : "days"}. `
    : `This range covers ${summary.range.days} calendar ${summary.range.days === 1 ? "day" : "days"}. `;
  paragraph(
    `${lead}Averages represent recorded days only; missing dates were not treated as zero. Each category counts its own `
    + "recorded days, so these counts differ. A step count saved as 0 is a recorded day, not a missing one.",
    8.5, INK, "italic",
  );
}
