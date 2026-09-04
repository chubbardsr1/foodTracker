/**
 * Dietary fat, in one place.
 *
 * Total fat is the primary figure and is never derived from the subtypes. The
 * four subtypes — saturated, trans, monounsaturated, polyunsaturated — are
 * nullable everywhere, because a label that omits a subtype is not a label
 * that reports zero. `null` means "not available"; `0` means a source really
 * did say zero, and both survive the database, the API, the PDFs, and every
 * serving multiplication unchanged.
 *
 * Subtypes are never forced to add up to total fat: labels round, some sources
 * report only saturated and trans, and minor fat components go unreported.
 *
 * Only `shared.ts` is imported, so the Worker routes, the browser screens, and
 * the tests all share exactly this code.
 */
import { amount } from "./shared";

export const fatSubtypeKeys = [
  "saturatedFat", "transFat", "monounsaturatedFat", "polyunsaturatedFat",
] as const;
export type FatSubtype = typeof fatSubtypeKeys[number];

/** Every subtype, each either a known number of grams or `null` for unknown. */
export type FatBreakdown = Record<FatSubtype, number | null>;

/** One record that can be totalled: total fat plus whatever subtypes it holds. */
export type FatRecord = { fat: number } & Partial<Record<FatSubtype, number | null | undefined>>;

export const fatSubtypeLabels: Record<FatSubtype, string> = {
  saturatedFat: "Saturated fat",
  transFat: "Trans fat",
  monounsaturatedFat: "Monounsaturated fat",
  polyunsaturatedFat: "Polyunsaturated fat",
};

/** Short forms, for table headers and other tight spaces. */
export const fatSubtypeShortLabels: Record<FatSubtype, string> = {
  saturatedFat: "Saturated",
  transFat: "Trans",
  monounsaturatedFat: "Monounsaturated",
  polyunsaturatedFat: "Polyunsaturated",
};

/** Shown wherever a subtype was never supplied. Never "0 g". */
export const UNKNOWN_FAT_LABEL = "Not available";

/** The same ceiling the meal assistant uses for a single gram figure. */
export const FAT_GRAM_CAP = 2000;

/**
 * How far a single subtype may exceed total fat before the data is treated as
 * wrong rather than rounded. Labels round each line independently, so half a
 * gram of slack is ordinary; a subtype well above the total is not.
 */
export const FAT_ROUNDING_TOLERANCE = 0.5;

const roundTwo = (value: number) => Math.round(value * 100) / 100;

/** "a", "a and b", "a, b and c" — used in the plain-English notes below. */
function listWords(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function emptyFatBreakdown(): FatBreakdown {
  return { saturatedFat: null, transFat: null, monounsaturatedFat: null, polyunsaturatedFat: null };
}

export type OptionalGrams =
  | { ok: true; value: number | null }
  | { ok: false; reason: "negative" | "invalid" };

/**
 * Reads one optional gram figure.
 *
 * An absent field, an empty string, and an explicit `null` all mean unknown.
 * `0` and `"0"` mean a real, recorded zero and are kept as such. Anything that
 * is not a number, is negative, or is past the cap is refused rather than
 * quietly rewritten.
 */
export function readOptionalGrams(value: unknown, cap = FAT_GRAM_CAP): OptionalGrams {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value === "string" && value.trim() === "") return { ok: true, value: null };
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return { ok: false, reason: "invalid" };
  if (parsed < 0) return { ok: false, reason: "negative" };
  if (parsed > cap) return { ok: false, reason: "invalid" };
  return { ok: true, value: roundTwo(parsed) };
}

export type FatBreakdownRead =
  | { ok: true; value: FatBreakdown }
  | { ok: false; field: FatSubtype; reason: "negative" | "invalid" };

/** Reads all four subtypes off a request body, form payload, or parsed JSON. */
export function readFatBreakdown(source: Record<string, unknown>, cap = FAT_GRAM_CAP): FatBreakdownRead {
  const value = emptyFatBreakdown();
  for (const key of fatSubtypeKeys) {
    const read = readOptionalGrams(source[key], cap);
    if (!read.ok) return { ok: false, field: key, reason: read.reason };
    value[key] = read.value;
  }
  return { ok: true, value };
}

/** Same shape, but a bad value simply stays unknown. Used for third-party data. */
export function coerceFatBreakdown(source: Record<string, unknown>, cap = FAT_GRAM_CAP): FatBreakdown {
  const value = emptyFatBreakdown();
  for (const key of fatSubtypeKeys) {
    const read = readOptionalGrams(source[key], cap);
    value[key] = read.ok ? read.value : null;
  }
  return value;
}

/**
 * Scales every known subtype by the same factor used for calories, protein,
 * total fat, carbs, and fiber. Unknown stays unknown: a fraction of an unknown
 * value is still unknown, never zero.
 */
export function scaleFatBreakdown(breakdown: FatBreakdown, factor: number): FatBreakdown {
  const scaled = emptyFatBreakdown();
  for (const key of fatSubtypeKeys) {
    const value = breakdown[key];
    scaled[key] = value === null ? null : roundTwo(value * factor);
  }
  return scaled;
}

/** Subtypes that sit materially above total fat, allowing for label rounding. */
export function fatSubtypesOverTotal(total: number, breakdown: FatBreakdown, tolerance = FAT_ROUNDING_TOLERANCE) {
  if (!Number.isFinite(total)) return [];
  return fatSubtypeKeys.filter(key => {
    const value = breakdown[key];
    return value !== null && value > total + tolerance;
  });
}

/**
 * A refusal message when a subtype cannot be true, or null when the numbers
 * are usable. Subtypes are never required to add up to total fat, so only a
 * single subtype exceeding the total is treated as an error.
 */
export function fatBreakdownProblem(total: number, breakdown: FatBreakdown, tolerance = FAT_ROUNDING_TOLERANCE) {
  const over = fatSubtypesOverTotal(total, breakdown, tolerance);
  if (over.length === 0) return null;
  const list = listWords(over.map(key => fatSubtypeLabels[key].toLowerCase()));
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} cannot be more than the ${amount(total)} g of total fat.`;
}

/** A running total of fat across any number of records, subtype coverage included. */
export type FatTotals = {
  /** Total fat, always known, because every record carries one. */
  total: number;
  /** Sum of the known values for each subtype, or null when none were supplied. */
  subtotals: FatBreakdown;
  /** How many records supplied each subtype. */
  known: Record<FatSubtype, number>;
  /** How many records did not. */
  missing: Record<FatSubtype, number>;
  /** Records counted. */
  records: number;
};

export function emptyFatTotals(): FatTotals {
  return {
    total: 0,
    subtotals: emptyFatBreakdown(),
    known: { saturatedFat: 0, transFat: 0, monounsaturatedFat: 0, polyunsaturatedFat: 0 },
    missing: { saturatedFat: 0, transFat: 0, monounsaturatedFat: 0, polyunsaturatedFat: 0 },
    records: 0,
  };
}

/**
 * The single aggregation used by the diary screen, the reports, and both PDFs,
 * so none of them can ever disagree about a day.
 */
export function aggregateFat(records: Iterable<FatRecord>): FatTotals {
  const totals = emptyFatTotals();
  for (const record of records) {
    totals.records += 1;
    const fat = Number(record.fat);
    if (Number.isFinite(fat)) totals.total += fat;
    for (const key of fatSubtypeKeys) {
      const raw = record[key];
      const value = raw === null || raw === undefined ? null : Number(raw);
      if (value === null || !Number.isFinite(value)) { totals.missing[key] += 1; continue; }
      totals.known[key] += 1;
      totals.subtotals[key] = (totals.subtotals[key] ?? 0) + value;
    }
  }
  totals.total = roundTwo(totals.total);
  for (const key of fatSubtypeKeys) {
    const value = totals.subtotals[key];
    if (value !== null) totals.subtotals[key] = roundTwo(value);
  }
  return totals;
}

/**
 * Builds a rollup from figures a database already grouped.
 *
 * `sums` holds SQL `sum()` results, which are null when no row in the group
 * carried a value, and `known` holds the matching count of rows that did. That
 * keeps "nobody recorded it" apart from "everybody recorded zero" even when
 * the totalling happened in SQLite rather than here.
 */
export function fatTotalsFrom(
  total: unknown,
  records: unknown,
  sums: Partial<Record<FatSubtype, unknown>>,
  known: Partial<Record<FatSubtype, unknown>>,
): FatTotals {
  const totals = emptyFatTotals();
  const totalFat = Number(total ?? 0);
  totals.total = Number.isFinite(totalFat) ? roundTwo(totalFat) : 0;
  const count = Number(records ?? 0);
  totals.records = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  for (const key of fatSubtypeKeys) {
    const supplied = Number(known[key] ?? 0);
    const recorded = Number.isFinite(supplied) ? Math.max(0, Math.round(supplied)) : 0;
    totals.known[key] = Math.min(recorded, totals.records);
    totals.missing[key] = totals.records - totals.known[key];
    const sum = sums[key];
    const value = sum === null || sum === undefined ? null : Number(sum);
    totals.subtotals[key] = totals.known[key] === 0 || value === null || !Number.isFinite(value)
      ? null
      : roundTwo(value);
  }
  return totals;
}

/** Adds two rollups together, for building a range out of per-day figures. */
export function mergeFatTotals(a: FatTotals, b: FatTotals): FatTotals {
  const merged = emptyFatTotals();
  merged.total = roundTwo(a.total + b.total);
  merged.records = a.records + b.records;
  for (const key of fatSubtypeKeys) {
    const left = a.subtotals[key];
    const right = b.subtotals[key];
    merged.subtotals[key] = left === null && right === null ? null : roundTwo((left ?? 0) + (right ?? 0));
    merged.known[key] = a.known[key] + b.known[key];
    merged.missing[key] = a.missing[key] + b.missing[key];
  }
  return merged;
}

/** True when at least one record anywhere supplied at least one subtype. */
export function hasFatDetail(totals: FatTotals) {
  return fatSubtypeKeys.some(key => totals.known[key] > 0);
}

/** True when every record supplied every subtype, so the sums are complete. */
export function fatDetailComplete(totals: FatTotals) {
  return totals.records > 0 && fatSubtypeKeys.every(key => totals.missing[key] === 0);
}

/** How many records supplied no part of the breakdown at all. */
export function fatRecordsMissingEverything(totals: FatTotals) {
  return Math.min(...fatSubtypeKeys.map(key => totals.missing[key]));
}

/**
 * Total fat that no subtype accounted for.
 *
 * Only worked out when every record supplied every subtype; otherwise the
 * shortfall could just as easily be a subtype nobody reported, and calling
 * that "unclassified" would be a guess. A result below zero means the source
 * numbers disagree with each other, so nothing is shown rather than a
 * misleading negative.
 */
export function unclassifiedFat(totals: FatTotals, tolerance = FAT_ROUNDING_TOLERANCE): number | null {
  if (!fatDetailComplete(totals)) return null;
  const accounted = fatSubtypeKeys.reduce((sum, key) => sum + (totals.subtotals[key] ?? 0), 0);
  const difference = roundTwo(totals.total - accounted);
  if (difference < -tolerance) return null;
  return Math.max(0, difference);
}

/** "12.5 g", or "Not available" when nothing supplied the value. */
export function gramsOrUnknown(value: number | null) {
  return value === null ? UNKNOWN_FAT_LABEL : `${amount(value)} g`;
}

/**
 * One plain sentence about how complete a breakdown is, or an empty string
 * when there is nothing worth saying. Used wherever a partial sum is shown, so
 * a part-day total is never read as the whole day.
 */
export function fatCoverageNote(totals: FatTotals, noun = "food entries") {
  if (totals.records === 0) return "";
  if (!hasFatDetail(totals)) return `No ${noun} here record a fat breakdown, so only total fat is available.`;
  if (fatDetailComplete(totals)) return "";
  const partial = fatSubtypeKeys
    .filter(key => totals.known[key] > 0 && totals.missing[key] > 0)
    .map(key => `${fatSubtypeLabels[key].toLowerCase()} on ${totals.known[key]} of ${totals.records}`);
  const absent = fatSubtypeKeys
    .filter(key => totals.known[key] === 0)
    .map(key => fatSubtypeLabels[key].toLowerCase());
  const parts: string[] = [];
  if (partial.length > 0) parts.push(`recorded ${listWords(partial)}`);
  if (absent.length > 0) parts.push(`no ${listWords(absent)} recorded at all`);
  return `Subtype sums cover only the ${noun} that recorded each value, so they understate the true amount: ${parts.join("; ")}.`;
}

/* -------------------------------------------------------------------------
 * Carbohydrates
 *
 * Total carbohydrates are the primary figure, exactly as total fat is above.
 * Net carbohydrates are derived from them, never stored, and never go below
 * zero: a food whose fiber is recorded as higher than its total carbohydrate
 * is a rounding artefact, not a negative amount of carbohydrate.
 *
 * The tracker records no sugar alcohols, so nothing is subtracted for them.
 * If a sugar-alcohol column is ever added, this one function is the only place
 * the calculation has to change.
 * ---------------------------------------------------------------------- */

/** The one net-carbohydrate calculation used everywhere: total carbs − fiber. */
export function netCarbsFrom(carbs: unknown, fiber: unknown) {
  const total = Number(carbs ?? 0);
  const fibre = Number(fiber ?? 0);
  if (!Number.isFinite(total)) return 0;
  return Math.max(0, roundTwo(total - (Number.isFinite(fibre) ? fibre : 0)));
}

/** One record's carbohydrate figures, as the diary card and its dialog show them. */
export type CarbRecord = { carbs: number; fiber: number };
export type CarbTotals = {
  carbs: number;
  fiber: number;
  netCarbs: number;
  /** Records counted, so an empty day can say so rather than showing zeroes. */
  records: number;
  /**
   * Grams of sugar alcohol subtracted from net carbs. Always null: the tracker
   * has no field for them, so nothing is claimed either way.
   */
  sugarAlcohols: null;
};

/** Totals the day's carbohydrates once, for the card and the breakdown alike. */
export function aggregateCarbs(records: Iterable<CarbRecord>): CarbTotals {
  let carbs = 0;
  let fiber = 0;
  let netCarbs = 0;
  let count = 0;
  for (const record of records) {
    count += 1;
    const total = Number(record.carbs);
    const fibre = Number(record.fiber);
    if (Number.isFinite(total)) carbs += total;
    if (Number.isFinite(fibre)) fiber += fibre;
    // Summed entry by entry, so one food's fiber can never cancel out another
    // food's carbohydrate.
    netCarbs += netCarbsFrom(total, fibre);
  }
  return {
    carbs: roundTwo(carbs), fiber: roundTwo(fiber), netCarbs: roundTwo(netCarbs),
    records: count, sugarAlcohols: null,
  };
}

/* -------------------------------------------------------------------------
 * The net-carbohydrate goal range
 *
 * A minimum and a maximum, both in grams. A minimum of 0 means there is no
 * floor, which is how the tracker behaved when there was one goal, and is what
 * legacy rows are migrated to. Being under the minimum is never reported as
 * success: it is reported as being under the minimum.
 * ---------------------------------------------------------------------- */

export type NetCarbGoals = { min: number; max: number };
export const DEFAULT_NET_CARB_MAX = 25;

export type NetCarbGoalsRead =
  | { ok: true; value: NetCarbGoals }
  | { ok: false; error: string };

export const NET_CARB_RANGE_ERROR =
  "The minimum net-carb goal cannot be more than the maximum.";
export const NET_CARB_VALUE_ERROR =
  "Net-carb goals must be grams, zero or more, and the maximum must be more than zero.";

/**
 * Reads a net-carb range off a request body or a settings form.
 *
 * A payload that only carries the old single `netCarbs` goal is accepted and
 * read as a maximum with no minimum, so an older client, a saved shortcut, or
 * a replayed request keeps working rather than failing validation.
 */
export function readNetCarbGoals(source: Record<string, unknown>): NetCarbGoalsRead {
  const legacy = source.netCarbs;
  const rawMin = source.netCarbsMin ?? source.netCarbMin;
  const rawMax = source.netCarbsMax ?? source.netCarbMax ?? legacy;
  const min = rawMin === undefined || rawMin === null || String(rawMin).trim() === "" ? 0 : Number(rawMin);
  const max = Number(rawMax);
  if (!Number.isFinite(min) || min < 0 || !Number.isFinite(max) || max <= 0) {
    return { ok: false, error: NET_CARB_VALUE_ERROR };
  }
  if (min > max) return { ok: false, error: NET_CARB_RANGE_ERROR };
  return { ok: true, value: { min: roundTwo(min), max: roundTwo(max) } };
}

/**
 * The stored range for one profile, tolerating rows written before the range
 * existed. A missing, null, or nonsense minimum reads as no floor, and a
 * missing maximum falls back to the single goal that column replaced.
 */
export function netCarbGoalsFrom(goals: Record<string, unknown> | null | undefined): NetCarbGoals {
  const legacy = Number(goals?.netCarbs ?? NaN);
  const rawMax = Number(goals?.netCarbsMax ?? NaN);
  const rawMin = Number(goals?.netCarbsMin ?? NaN);
  const max = Number.isFinite(rawMax) && rawMax > 0
    ? roundTwo(rawMax)
    : Number.isFinite(legacy) && legacy > 0 ? roundTwo(legacy) : DEFAULT_NET_CARB_MAX;
  const min = Number.isFinite(rawMin) && rawMin > 0 ? roundTwo(rawMin) : 0;
  // A legacy row can hold a minimum above a maximum only if it was written
  // outside this application. Clamping keeps the screen readable either way.
  return { min: Math.min(min, max), max };
}

/** "100 to 150 g", or just "150 g" when no minimum is configured. */
export function netCarbGoalLabel(goals: NetCarbGoals) {
  return goals.min > 0 ? `${amount(goals.min)} to ${amount(goals.max)} g` : `${amount(goals.max)} g`;
}

export type NetCarbProgress = {
  state: "below" | "within" | "above";
  /** Grams still needed to reach the minimum, or grams past the maximum. */
  grams: number;
  /** One short phrase for the diary card. */
  summary: string;
};

/**
 * Where an amount of net carbs sits against the configured range.
 *
 * Under the minimum is reported as under the minimum, never as being "on
 * track" merely because the number is small.
 */
export function netCarbProgress(value: number, goals: NetCarbGoals): NetCarbProgress {
  const eaten = Number.isFinite(value) ? value : 0;
  if (goals.min > 0 && eaten < goals.min) {
    const grams = roundTwo(goals.min - eaten);
    return { state: "below", grams, summary: `${amount(grams)}g to reach the ${amount(goals.min)}g minimum` };
  }
  if (eaten > goals.max) {
    const grams = roundTwo(eaten - goals.max);
    return { state: "above", grams, summary: `${amount(grams)}g over the ${amount(goals.max)}g maximum` };
  }
  const grams = roundTwo(goals.max - eaten);
  return {
    state: "within",
    grams,
    summary: goals.min > 0 ? `Within your ${netCarbGoalLabel(goals)} range` : `${amount(grams)}g left`,
  };
}

/* -------------------------------------------------------------------------
 * Calorie shares and goal percentages
 *
 * Two different ideas live here and are never mixed:
 *
 *   1. Percentage OF CALORIES - what share of an amount of energy a macro
 *      accounts for, using the standard 4/4/9 factors.
 *   2. Percentage OF A GOAL - how much of a configured target has been
 *      reached. This has nothing to do with calories.
 *
 * Settings, the reports screen, and both PDFs all call the helpers below
 * rather than repeating the arithmetic, so their wording cannot drift apart.
 *
 * Percentages are not expected to add up to 100. Label calories are rounded,
 * fiber, sugar alcohols, and organic acids carry energy the 4/4/9 factors do
 * not model, and estimated foods are approximate. Nothing here ever adjusts a
 * stored calorie or gram value to force the total to balance.
 * ---------------------------------------------------------------------- */

/** The standard macro calorie equivalents this application uses. */
export const caloriesPerGram = { protein: 4, carbs: 4, fat: 9 } as const;

/** The calories a number of grams of a macro accounts for. Null in, null out. */
export function macroCalories(grams: number | null | undefined, perGram: number): number | null {
  const value = grams === null || grams === undefined ? null : Number(grams);
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  if (!Number.isFinite(perGram) || perGram <= 0) return null;
  return value * perGram;
}

/**
 * The share of `calories` that `grams` of a macro accounts for.
 *
 * Returns null rather than a number whenever the answer would be meaningless:
 * a blank or invalid gram figure, or zero, missing, or invalid calories. That
 * is what keeps `NaN` and `Infinity` off the screen.
 */
export function caloriePercent(
  grams: number | null | undefined,
  calories: number | null | undefined,
  perGram: number,
): number | null {
  const fromMacro = macroCalories(grams, perGram);
  const total = calories === null || calories === undefined ? null : Number(calories);
  if (fromMacro === null || total === null || !Number.isFinite(total) || total <= 0) return null;
  return Math.round(fromMacro / total * 1000) / 10;
}

/**
 * One value as a percentage of another: saturated fat within total fat, or an
 * amount against the goal configured for it. Never a calorie calculation.
 */
export function percentOf(part: number | null | undefined, whole: number | null | undefined): number | null {
  const value = part === null || part === undefined ? null : Number(part);
  const total = whole === null || whole === undefined ? null : Number(whole);
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  if (total === null || !Number.isFinite(total) || total <= 0) return null;
  return Math.round(value / total * 1000) / 10;
}

/** "23.8%", always to one decimal place, or the fallback when unavailable. */
export function formatPercent(value: number | null, fallback = "—") {
  return value === null ? fallback : `${value.toFixed(1)}%`;
}

/** Grams to one decimal place, or "Not available" when nothing recorded it. */
export function formatGrams(value: number | null, fallback = UNKNOWN_FAT_LABEL) {
  return value === null ? fallback : `${(Math.round(value * 10) / 10).toFixed(1)} g`;
}

/**
 * The configured daily goals a percentage can be worked out against.
 *
 * `saturatedFat` is optional and nullable: it is the one goal that may simply
 * not be set, and an unset goal produces no percentage rather than a zero.
 * There is deliberately no total-carbohydrate goal.
 */
export type GoalValues = {
  calories: number | null;
  protein: number | null;
  fat: number | null;
  /** The maximum of the net-carb range, kept for every existing read path. */
  netCarbs: number | null;
  /** The range itself. Absent on data written before the range existed. */
  netCarbsMin?: number | null;
  netCarbsMax?: number | null;
  fiber: number | null;
  saturatedFat: number | null;
  waterOunces?: number | null;
};

/** The maximum of the range, falling back to the single goal it replaced. */
function netCarbCeiling(goals: Partial<GoalValues>): number | null {
  const max = goals.netCarbsMax ?? null;
  if (max !== null && Number.isFinite(Number(max)) && Number(max) > 0) return Number(max);
  const legacy = goals.netCarbs ?? null;
  return legacy !== null && Number.isFinite(Number(legacy)) ? Number(legacy) : null;
}

export const goalKeys = ["calories", "netCarbs", "protein", "fat", "saturatedFat", "fiber", "waterOunces"] as const;
export type GoalKey = typeof goalKeys[number];

export const goalLabels: Record<GoalKey, string> = {
  calories: "Calories",
  netCarbs: "Net carbs (g)",
  protein: "Protein (g)",
  fat: "Total fat (g)",
  saturatedFat: "Saturated fat (g)",
  fiber: "Fiber (g)",
  waterOunces: "Water (oz)",
};

/**
 * The percentage note shown beside each configured goal, worded once here.
 *
 * Net carbs are called a calorie-equivalent rather than "the carbohydrate
 * share of calories": net carbs exclude fiber, so they are not the whole
 * carbohydrate story, and the application has no total-carbohydrate goal to
 * compare against. Fiber gets no calorie percentage at all - it is tracked as
 * a gram goal and reported as a percentage of that goal.
 *
 * A blank, zero, or invalid entry produces an empty string, so a half-typed
 * number never shows as NaN.
 */
export function goalContext(goals: Partial<GoalValues>): Record<GoalKey, string> {
  const calories = goals.calories ?? null;
  const protein = caloriePercent(goals.protein, calories, caloriesPerGram.protein);
  // Worked out against the maximum of the range: that is the figure a day is
  // judged against, and the one the single goal always meant.
  const netCarbs = caloriePercent(netCarbCeiling(goals), calories, caloriesPerGram.carbs);
  const fat = caloriePercent(goals.fat, calories, caloriesPerGram.fat);
  const saturated = caloriePercent(goals.saturatedFat, calories, caloriesPerGram.fat);
  const saturatedShare = percentOf(goals.saturatedFat ?? null, goals.fat ?? null);
  const saturatedParts = [
    saturated === null ? "" : `${formatPercent(saturated)} of calories`,
    saturatedShare === null ? "" : `${formatPercent(saturatedShare)} of total fat`,
  ].filter(Boolean);
  return {
    calories: "",
    netCarbs: netCarbs === null ? "" : `${formatPercent(netCarbs)} calorie-equivalent`,
    protein: protein === null ? "" : `${formatPercent(protein)} of calories`,
    fat: fat === null ? "" : `${formatPercent(fat)} of calories`,
    saturatedFat: saturatedParts.join(" · "),
    fiber: "gram goal",
    waterOunces: "",
  };
}

/** One printable row of the current goals and what they work out to. */
export type GoalRow = { key: GoalKey; label: string; target: string; context: string };

/**
 * The configured goals as rows, for the goals tables in both PDFs. An unset
 * goal says so instead of printing a zero.
 */
export function goalRows(goals: Partial<GoalValues>): GoalRow[] {
  const context = goalContext(goals);
  const target = (key: GoalKey) => {
    // Net carbs are a range, so the target column prints both ends of it. A
    // profile with no minimum still prints the single figure it always did.
    if (key === "netCarbs") {
      const ceiling = netCarbCeiling(goals);
      if (ceiling === null) return "not set";
      const floor = Number(goals.netCarbsMin ?? 0);
      return netCarbGoalLabel({ min: Number.isFinite(floor) && floor > 0 ? floor : 0, max: ceiling });
    }
    const value = goals[key];
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "not set";
    if (key === "calories") return `${Math.round(Number(value)).toLocaleString("en-US")} per day`;
    if (key === "waterOunces") return `${Math.round(Number(value) * 100) / 100} oz`;
    return `${Math.round(Number(value) * 100) / 100} g`;
  };
  return goalKeys.map(key => ({ key, label: goalLabels[key], target: target(key), context: context[key] }));
}

/** Average grams per recorded day, as the reports and PDFs work them out. */
export type NutritionAverages = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  netCarbs: number;
};

/**
 * One row of the nutrition averages table.
 *
 * The three pieces of context are kept apart as well as joined, because a
 * printed table column has far less room than the screen. A PDF prints the
 * calorie share and the goal context and leaves the coverage note to the
 * paragraph beneath; the screen shows all three.
 */
export type NutritionRow = {
  key: string;
  metric: string;
  /** True for the fat subtypes, which are shown indented under total fat. */
  nested?: boolean;
  average: string;
  goal: string;
  /** "28.7% of average calories", or "" when it cannot be worked out. */
  calorieShare: string;
  /** "98.0% of goal", or the saturated-fat row's two goal comparisons. */
  goalContext: string;
  /** "from 2 of 3 days" when a subtype average covers only part of the range. */
  coverage: string;
  /** All three joined, for a surface with room for one column. */
  context: string;
};

/**
 * The nutrition averages table, built once for the reports screen, the
 * detailed export PDF, and the doctor summary PDF.
 *
 * The rules live here rather than in three places:
 *  - Calorie shares use TOTAL carbohydrates, never net carbohydrates.
 *  - Net carbohydrates keep their own row, labelled a calorie-equivalent.
 *  - Total carbohydrates are always shown, and never gain a goal.
 *  - Fiber is a percentage of its gram goal, never a percentage of calories.
 *  - Saturated fat reports its calorie share and its share of the total fat
 *    actually eaten, each labelled for exactly what it is.
 *  - A fat subtype nothing recorded reads "Not available", never 0 g, and says
 *    how many days it covers when the record is partial.
 */
export function nutritionRows(input: {
  averages: NutritionAverages;
  /** The range's fat rollup, for the subtype sums and their coverage. */
  fat: FatTotals;
  /** Days holding at least one food entry: the only divisor used. */
  recordedDays: number;
  goals: Partial<GoalValues> | null;
  /** Days each subtype was actually recorded on, for the coverage note. */
  subtypeDays?: Partial<Record<FatSubtype, number>>;
}): NutritionRow[] {
  const { averages, fat, recordedDays, goals } = input;
  const calories = averages.calories;
  const share = (grams: number | null, perGram: number, wording = "of average calories") => {
    const percent = caloriePercent(grams, calories, perGram);
    return percent === null ? "" : `${formatPercent(percent)} ${wording}`;
  };
  const against = (value: number | null, goal: number | null | undefined, wording = "of goal") => {
    const percent = percentOf(value, goal ?? null);
    return percent === null ? "" : `${formatPercent(percent)} ${wording}`;
  };
  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");
  const goalGrams = (value: number | null | undefined) =>
    value === null || value === undefined || !Number.isFinite(Number(value))
      ? "no goal"
      : `${Math.round(Number(value) * 100) / 100} g`;
  const perDay = (subtotal: number | null) =>
    subtotal === null || recordedDays <= 0 ? null : subtotal / recordedDays;
  // The net-carb goal is a range. Both ends are read once here so the row
  // below and its context cannot disagree about which figure they mean.
  const netCarbCeilingValue = netCarbCeiling(goals ?? {});
  const rawFloor = Number(goals?.netCarbsMin ?? 0);
  const netCarbFloor = Number.isFinite(rawFloor) && rawFloor > 0 ? rawFloor : 0;
  const goalRange = netCarbCeilingValue === null
    ? "no goal"
    : netCarbGoalLabel({ min: netCarbFloor, max: netCarbCeilingValue });

  /** Assembles one row, joining the pieces for the single-column surfaces. */
  const build = (row: Omit<NutritionRow, "context" | "calorieShare" | "goalContext" | "coverage">
    & { calorieShare?: string; goalContext?: string; coverage?: string }): NutritionRow => {
    const calorieShare = row.calorieShare ?? "";
    const goalContext = row.goalContext ?? "";
    const coverage = row.coverage ?? "";
    return { ...row, calorieShare, goalContext, coverage, context: join(calorieShare, goalContext, coverage) };
  };

  const rows: NutritionRow[] = [
    build({
      key: "calories",
      metric: "Calories",
      average: Math.round(calories).toLocaleString("en-US"),
      goal: goals?.calories ? Math.round(goals.calories).toLocaleString("en-US") : "no goal",
      goalContext: against(calories, goals?.calories),
    }),
    build({
      key: "protein",
      metric: "Protein",
      average: formatGrams(averages.protein),
      goal: goalGrams(goals?.protein),
      calorieShare: share(averages.protein, caloriesPerGram.protein),
      goalContext: against(averages.protein, goals?.protein),
    }),
    build({
      key: "carbs",
      metric: "Total carbohydrates",
      average: formatGrams(averages.carbs),
      // Deliberately no goal: the tracker sets a net-carb target only.
      goal: "no goal",
      calorieShare: share(averages.carbs, caloriesPerGram.carbs),
    }),
    build({
      key: "netCarbs",
      metric: "Net carbohydrates",
      average: formatGrams(averages.netCarbs),
      // A range when one is configured, otherwise the single ceiling it
      // always was. Never "no goal" while a maximum exists.
      goal: netCarbCeiling(goals ?? {}) === null ? "no goal" : goalRange,
      // Labelled a calorie-equivalent, never the carbohydrate share of calories.
      calorieShare: share(averages.netCarbs, caloriesPerGram.carbs, "calorie-equivalent"),
      goalContext: join(
        against(averages.netCarbs, netCarbCeiling(goals ?? {}), netCarbFloor > 0 ? "of maximum" : "of goal"),
        // Being under a configured minimum is said plainly rather than left to
        // read as success.
        netCarbFloor > 0 && averages.netCarbs < netCarbFloor
          ? `below the ${amount(netCarbFloor)} g minimum`
          : "",
      ),
    }),
    build({
      key: "fiber",
      metric: "Fiber",
      average: formatGrams(averages.fiber),
      goal: goalGrams(goals?.fiber),
      // A gram goal, never a share of calories.
      goalContext: against(averages.fiber, goals?.fiber),
    }),
    build({
      key: "fat",
      metric: "Total fat",
      average: formatGrams(averages.fat),
      goal: goalGrams(goals?.fat),
      calorieShare: share(averages.fat, caloriesPerGram.fat),
      goalContext: against(averages.fat, goals?.fat),
    }),
  ];

  for (const key of fatSubtypeKeys) {
    const average = perDay(fat.subtotals[key]);
    const days = input.subtypeDays?.[key];
    const coverage = average === null || days === undefined || days >= recordedDays || recordedDays <= 0
      ? ""
      : `from ${days} of ${recordedDays} days`;
    rows.push(build({
      key,
      metric: fatSubtypeLabels[key],
      nested: true,
      average: formatGrams(average),
      goal: key === "saturatedFat" ? goalGrams(goals?.saturatedFat) : "no goal",
      calorieShare: share(average, caloriesPerGram.fat),
      goalContext: key === "saturatedFat"
        ? join(
            // Against the fat actually eaten, which is what this label says.
            against(average, averages.fat > 0 ? averages.fat : null, "of total fat eaten"),
            against(average, goals?.saturatedFat, "of goal"),
          )
        : "",
      coverage,
    }));
  }

  return rows;
}

/**
 * The caveat printed under any table of calorie shares. Said once, in one
 * place, because the shares genuinely will not add to 100 and the honest
 * explanation is the same everywhere.
 */
export const CALORIE_SHARE_NOTE =
  "Calorie shares use 4 kcal per gram of protein and carbohydrate and 9 kcal per gram of fat. They are not "
  + "expected to add up to 100%: labels round each line, fiber and sugar alcohols carry energy these factors do "
  + "not model, and estimated foods are approximate. No stored calorie or gram value is adjusted to make them balance.";

/** Said wherever goal percentages appear, because goal history is not kept. */
export const CURRENT_GOALS_NOTE =
  "Goal percentages are based on the currently configured calorie and nutrition goals, not on what the goals may "
  + "have been on each date in this range.";
