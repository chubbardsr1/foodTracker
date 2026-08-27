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
