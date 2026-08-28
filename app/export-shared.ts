/**
 * Shared shape and helpers for the export centre.
 *
 * The Weight, Journal, and Reports screens all export through this module, so
 * a PDF and a JSON file taken from the same range hold exactly the same rows.
 */
import type { FatBreakdown, FatSubtype } from "./nutrition";
import type { Profile } from "./shared";

export const exportSections = [
  "weights", "journalEntries", "dailySummaries", "foodEntries",
  "waterEntries", "exerciseEntries", "exerciseCalories", "steps", "goals",
] as const;
export type ExportSection = typeof exportSections[number];

/** Checkbox wording, and the order the sections are offered and printed in. */
export const sectionLabels: Record<ExportSection, string> = {
  weights: "Weight entries",
  journalEntries: "Journal entries",
  dailySummaries: "Daily nutrition totals",
  foodEntries: "Individual food entries",
  waterEntries: "Water and hydration",
  exerciseEntries: "Exercise and movement",
  exerciseCalories: "Exercise calories",
  steps: "Steps",
  goals: "Nutrition goals",
};

export type ExportPayload = {
  exportMetadata: { application: string; formatVersion: number; generatedAt: string; sections: ExportSection[] };
  user: { profile: string; name: string };
  dateRange: { start: string; end: string; days: number };
  goals?: {
    /** `saturatedFat` is null when no saturated-fat goal is set; there is no total-carb goal. */
    current: { calories: number; protein: number; fat: number; netCarbs: number; fiber: number; waterOunces: number; saturatedFat?: number | null } | null;
    dailyCalorieGoals: { date: string; calories: number }[];
    defaultCalorieGoal: number;
  };
  weights?: { date: string; pounds: number; note: string }[];
  journalEntries?: { date: string; body: string; source: string; updatedAt: string }[];
  /**
   * `fat` is the day's total fat. The four subtypes sum only the entries that
   * recorded them and are null when none did, so `fatSubtypeEntries` reports
   * how many of the day's `foodItems` each sum actually covers.
   */
  dailySummaries?: ({ date: string; calories: number; protein: number; fat: number; carbs: number; fiber: number; netCarbs: number; foodItems: number; fatSubtypeEntries: Record<FatSubtype, number> } & FatBreakdown)[];
  /** Per-entry fat subtypes, null on anything logged before the breakdown existed. */
  foodEntries?: ({ date: string; meal: string; name: string; serving: string; calories: number; protein: number; fat: number; carbs: number; fiber: number; netCarbs: number } & FatBreakdown)[];
  waterEntries?: { date: string; ounces: number }[];
  exerciseEntries?: { date: string; activity: string; minutes: number; caloriesBurned?: number; comments?: string }[];
  exerciseCalories?: { date: string; caloriesBurned: number; minutes: number; sessions: number }[];
  steps?: { date: string; steps: number }[];
};

/** e.g. chris-health-export-2026-08-01-to-2026-08-31.pdf */
export function exportFileName(profile: Profile, start: string, end: string, extension: "pdf" | "json") {
  return `${profile}-health-export-${start}-to-${end}.${extension}`;
}

/**
 * e.g. chris-health-summary-2026-07-26-to-2026-08-24.pdf
 *
 * Deliberately a different stem from the detailed export, so the concise
 * summary and the full document never overwrite one another in Downloads.
 */
export function summaryFileName(profile: Profile, start: string, end: string) {
  return `${profile}-health-summary-${start}-to-${end}.pdf`;
}

/** How many rows each chosen section actually holds, used for the "nothing here" message. */
export function sectionCounts(data: ExportPayload) {
  const counts: Partial<Record<ExportSection, number>> = {};
  for (const section of data.exportMetadata.sections) {
    if (section === "goals") counts.goals = (data.goals?.current ? 1 : 0) + (data.goals?.dailyCalorieGoals.length ?? 0);
    else counts[section] = (data[section] as unknown[] | undefined)?.length ?? 0;
  }
  return counts;
}

export function isEmptyExport(data: ExportPayload) {
  return Object.values(sectionCounts(data)).every(count => (count ?? 0) === 0);
}

/** Fetches the selected sections for one profile and date range. */
export async function fetchExport(profile: Profile, start: string, end: string, sections: ExportSection[]) {
  const query = new URLSearchParams({ start, end, sections: sections.join(",") });
  const response = await fetch(`/api/export?${query.toString()}`, { headers: { "x-food-tracker-profile": profile } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? "Unable to build that export");
  return data as ExportPayload;
}

/** Hands the finished file to the browser. Revoked on the next tick so Safari has time to start the download. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Clipboard write with the same fallback the Copy this day button uses, because
 * iPhone Safari refuses the clipboard API in some in-app browsers.
 */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through to the older selection copy */
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let copied = false;
  try { copied = document.execCommand("copy"); } catch { copied = false; }
  document.body.removeChild(area);
  return copied;
}
