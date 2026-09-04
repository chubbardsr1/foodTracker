/**
 * Boils an export payload down to the handful of numbers a doctor reads in a
 * minute, without ever inventing a day that was not recorded.
 *
 * The rule that drives everything here: an average is taken across the days
 * that actually hold a record for that category, and every category counts its
 * own recorded days. A range of thirty calendar days holding four days of food
 * has four recorded nutrition days, so calories are divided by four. A date
 * with no water entry is unknown, not zero. A step row saved as 0 is a real
 * recorded zero and does count.
 *
 * Nothing in here touches the detailed export. It only reads the payload the
 * export feed already returns, so no new API, table, or migration is involved.
 */
import type { ExportPayload, ExportSection } from "./export-shared";
import {
  type FatBreakdown, type FatSubtype, type FatTotals,
  aggregateFat, emptyFatBreakdown, emptyFatTotals, fatSubtypeKeys, fatTotalsFrom, mergeFatTotals,
} from "./nutrition";

/** Calendar days since the epoch, read at local midday so no date shifts back. */
function dayNumber(date: string) {
  return Math.round(new Date(`${date}T12:00:00`).getTime() / 86400000);
}

const roundTwo = (value: number) => Math.round(value * 100) / 100;

/**
 * The sections the summary can actually say something about. `goals` is only a
 * comparison column, so choosing it on its own leaves nothing to summarise.
 */
export const summarySections: ExportSection[] = [
  "weights", "journalEntries", "dailySummaries", "foodEntries",
  "waterEntries", "exerciseEntries", "exerciseCalories", "steps",
];

export function hasSummarySection(sections: ExportSection[]) {
  return sections.some(section => summarySections.includes(section));
}

export type DailyNutrition = {
  date: string; calories: number; protein: number; fat: number;
  carbs: number; fiber: number; netCarbs: number; foodItems: number;
  /**
   * The day's fat rollup: total fat, the sum of each subtype that was actually
   * recorded, and how many of the day's entries recorded it. Built by the one
   * shared aggregation, so the dashboard, the reports, and both PDFs agree.
   */
  fatDetail: FatTotals;
};

export type NutritionSummary = {
  /** Dates holding at least one food diary entry. The only divisor used below. */
  recordedDays: number;
  foodItems: number;
  totals: { calories: number; protein: number; fat: number; carbs: number; fiber: number; netCarbs: number };
  averages: { calories: number; protein: number; fat: number; carbs: number; fiber: number; netCarbs: number };
  /** Fat subtype sums and coverage across the whole range. */
  fat: FatTotals;
  /**
   * Each subtype per recorded day, on the same divisor as every other average
   * here, or null where nothing recorded it. Where only some entries carried a
   * subtype this is a floor, not the whole intake, which the PDFs say plainly.
   */
  fatAverages: FatBreakdown;
  /** Recorded days holding at least one entry that carried each subtype. */
  fatSubtypeDays: Record<FatSubtype, number>;
};

export type HydrationSummary = {
  recordedDays: number; entries: number; totalOunces: number; averageOunces: number;
};

export type ExerciseSummary = {
  recordedDays: number;
  /** Individual activities recorded across those days. */
  activities: number;
  totalMinutes: number; averageMinutes: number;
  totalCalories: number; averageCalories: number;
  showMovement: boolean; showCalories: boolean;
};

export type StepSummary = {
  recordedDays: number; totalSteps: number; averageSteps: number;
  highest: { date: string; steps: number } | null;
  lowest: { date: string; steps: number } | null;
};

export type WeightSummary = {
  entries: number;
  first: { date: string; pounds: number } | null;
  last: { date: string; pounds: number } | null;
  /** Signed pounds. Positive is a gain, negative is a loss. Null under two readings. */
  change: number | null;
  /** Signed pounds per week, only once the readings are a week or more apart. */
  perWeek: number | null;
  daysApart: number;
  points: { date: string; pounds: number }[];
};

export type JournalSummary = { entries: number; dates: number };

export type GoalSummary = {
  calories: number; protein: number; fat: number;
  /** The maximum of the net-carb range; `netCarbsMin` is 0 when there is no minimum. */
  netCarbs: number; netCarbsMin?: number; netCarbsMax?: number;
  fiber: number; waterOunces: number;
  /** Optional and nullable: null means no saturated-fat goal has been set. */
  saturatedFat?: number | null;
} | null;

export type Summary = {
  user: { profile: string; name: string };
  range: { start: string; end: string; days: number };
  generatedAt: string;
  /** True when the matching checkbox was left ticked for this export. */
  show: {
    weight: boolean; nutrition: boolean; hydration: boolean;
    exercise: boolean; steps: boolean; journal: boolean; goals: boolean;
  };
  goals: GoalSummary;
  /** The calorie goals stamped onto days in this range, when any were stamped. */
  stampedCalorieGoals: { low: number; high: number; days: number } | null;
  nutrition: NutritionSummary | null;
  hydration: HydrationSummary | null;
  exercise: ExerciseSummary | null;
  steps: StepSummary | null;
  weight: WeightSummary | null;
  journal: JournalSummary | null;
};

/** Per-date nutrition, taken from whichever nutrition section travelled with the export. */
export function dailyNutrition(data: ExportPayload): DailyNutrition[] {
  // Daily totals are already grouped by the feed, so they are preferred and the
  // individual entries are ignored. Reading both would count every meal twice.
  const summaries = data.dailySummaries;
  if (summaries) {
    return summaries.map(row => ({
      ...row,
      // An export taken before the fat breakdown existed carries no counts, so
      // every subtype reads as unknown rather than as a recorded zero.
      fatDetail: fatTotalsFrom(row.fat, row.foodItems, row, row.fatSubtypeEntries ?? {}),
    }));
  }

  const byDate = new Map<string, DailyNutrition>();
  const entriesByDate = new Map<string, NonNullable<ExportPayload["foodEntries"]>>();
  for (const row of data.foodEntries ?? []) {
    const day = byDate.get(row.date)
      ?? { date: row.date, calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, netCarbs: 0, foodItems: 0, fatDetail: emptyFatTotals() };
    day.calories += row.calories; day.protein += row.protein; day.fat += row.fat;
    day.carbs += row.carbs; day.fiber += row.fiber; day.foodItems += 1;
    byDate.set(row.date, day);
    const rows = entriesByDate.get(row.date) ?? [];
    rows.push(row);
    entriesByDate.set(row.date, rows);
  }
  for (const day of byDate.values()) {
    // Net carbs follow the rest of the app: total carbs less fiber, never below
    // zero, worked out once per day rather than per mouthful.
    day.netCarbs = Math.max(0, roundTwo(day.carbs - day.fiber));
    day.fatDetail = aggregateFat(entriesByDate.get(day.date) ?? []);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildSummary(data: ExportPayload): Summary {
  const chosen = new Set(data.exportMetadata.sections);
  const show = {
    weight: chosen.has("weights"),
    // Either nutrition section carries the food record, so either one is enough.
    nutrition: chosen.has("dailySummaries") || chosen.has("foodEntries"),
    hydration: chosen.has("waterEntries"),
    exercise: chosen.has("exerciseEntries") || chosen.has("exerciseCalories"),
    steps: chosen.has("steps"),
    journal: chosen.has("journalEntries"),
    goals: chosen.has("goals"),
  };

  let nutrition: NutritionSummary | null = null;
  if (show.nutrition) {
    const days = dailyNutrition(data);
    const recordedDays = days.length;
    const totals = days.reduce((sum, day) => ({
      calories: sum.calories + day.calories, protein: sum.protein + day.protein,
      fat: sum.fat + day.fat, carbs: sum.carbs + day.carbs,
      fiber: sum.fiber + day.fiber, netCarbs: sum.netCarbs + day.netCarbs,
    }), { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, netCarbs: 0 });
    // Divided by recorded nutrition days only. A date with no food entry stays
    // out of both the total and the divisor rather than counting as a zero day.
    const per = (value: number) => recordedDays === 0 ? 0 : value / recordedDays;
    const fat = days.reduce<FatTotals>((sum, day) => mergeFatTotals(sum, day.fatDetail), emptyFatTotals());
    const fatAverages = emptyFatBreakdown();
    const fatSubtypeDays: Record<FatSubtype, number> = { saturatedFat: 0, transFat: 0, monounsaturatedFat: 0, polyunsaturatedFat: 0 };
    for (const key of fatSubtypeKeys) {
      const subtotal = fat.subtotals[key];
      // Divided by the same recorded days as every other average on the page.
      fatAverages[key] = subtotal === null ? null : per(subtotal);
      fatSubtypeDays[key] = days.filter(day => day.fatDetail.known[key] > 0).length;
    }
    nutrition = {
      recordedDays,
      foodItems: days.reduce((sum, day) => sum + day.foodItems, 0),
      totals,
      averages: {
        calories: per(totals.calories), protein: per(totals.protein), fat: per(totals.fat),
        carbs: per(totals.carbs), fiber: per(totals.fiber), netCarbs: per(totals.netCarbs),
      },
      fat, fatAverages, fatSubtypeDays,
    };
  }

  let hydration: HydrationSummary | null = null;
  if (show.hydration) {
    const rows = data.waterEntries ?? [];
    const byDate = new Map<string, number>();
    for (const row of rows) byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.ounces);
    const recordedDays = byDate.size;
    const totalOunces = [...byDate.values()].reduce((sum, ounces) => sum + ounces, 0);
    hydration = {
      recordedDays, entries: rows.length, totalOunces,
      averageOunces: recordedDays === 0 ? 0 : totalOunces / recordedDays,
    };
  }

  let exercise: ExerciseSummary | null = null;
  if (show.exercise) {
    const sessions = data.exerciseEntries ?? [];
    const perDay = data.exerciseCalories ?? [];
    const showMovement = chosen.has("exerciseEntries");
    const showCalories = chosen.has("exerciseCalories");
    // Both sections come from the same rows, so the recorded days agree whichever
    // one travelled and nothing is counted twice when both did.
    const dates = new Set<string>([...sessions.map(row => row.date), ...perDay.map(row => row.date)]);
    const recordedDays = dates.size;
    const totalMinutes = showMovement
      ? sessions.reduce((sum, row) => sum + row.minutes, 0)
      : perDay.reduce((sum, row) => sum + row.minutes, 0);
    const totalCalories = perDay.reduce((sum, row) => sum + row.caloriesBurned, 0);
    exercise = {
      recordedDays,
      activities: showMovement ? sessions.length : perDay.reduce((sum, row) => sum + row.sessions, 0),
      totalMinutes, averageMinutes: recordedDays === 0 ? 0 : totalMinutes / recordedDays,
      totalCalories, averageCalories: recordedDays === 0 ? 0 : totalCalories / recordedDays,
      showMovement, showCalories,
    };
  }

  let steps: StepSummary | null = null;
  if (show.steps) {
    const rows = data.steps ?? [];
    const recordedDays = rows.length;
    const totalSteps = rows.reduce((sum, row) => sum + row.steps, 0);
    // A saved 0 is a real recorded day and stays in the highest and lowest search.
    let highest: { date: string; steps: number } | null = null;
    let lowest: { date: string; steps: number } | null = null;
    for (const row of rows) {
      if (!highest || row.steps > highest.steps) highest = { date: row.date, steps: row.steps };
      if (!lowest || row.steps < lowest.steps) lowest = { date: row.date, steps: row.steps };
    }
    steps = { recordedDays, totalSteps, averageSteps: recordedDays === 0 ? 0 : totalSteps / recordedDays, highest, lowest };
  }

  let weight: WeightSummary | null = null;
  if (show.weight) {
    // Weight is event based, so this is the first and last reading inside the
    // range rather than an average over days.
    const rows = [...(data.weights ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    const first = rows[0] ?? null;
    const last = rows[rows.length - 1] ?? null;
    const change = first && last && rows.length > 1 ? roundTwo(last.pounds - first.pounds) : null;
    const daysApart = first && last ? dayNumber(last.date) - dayNumber(first.date) : 0;
    weight = {
      entries: rows.length,
      first: first ? { date: first.date, pounds: first.pounds } : null,
      last: last ? { date: last.date, pounds: last.pounds } : null,
      change,
      // A rate needs at least a week between the two readings to mean anything.
      perWeek: change !== null && daysApart >= 7 ? change / (daysApart / 7) : null,
      daysApart,
      points: rows.map(row => ({ date: row.date, pounds: row.pounds })),
    };
  }

  let journal: JournalSummary | null = null;
  if (show.journal) {
    const rows = data.journalEntries ?? [];
    journal = { entries: rows.length, dates: new Set(rows.map(row => row.date)).size };
  }

  const stamps = show.goals ? data.goals?.dailyCalorieGoals ?? [] : [];
  const stampedCalorieGoals = stamps.length > 0
    ? {
        low: Math.min(...stamps.map(row => row.calories)),
        high: Math.max(...stamps.map(row => row.calories)),
        days: stamps.length,
      }
    : null;

  return {
    user: data.user,
    range: data.dateRange,
    generatedAt: data.exportMetadata.generatedAt,
    show,
    goals: show.goals ? data.goals?.current ?? null : null,
    stampedCalorieGoals,
    nutrition, hydration, exercise, steps, weight, journal,
  };
}

/** "16 lb lost", "3.2 lb gained", or "no change", in plain words for a reader. */
export function weightChangeWords(change: number | null) {
  if (change === null) return "not enough readings to show a change";
  const size = Math.round(Math.abs(change) * 100) / 100;
  if (size === 0) return "no change";
  return `${size} lb ${change < 0 ? "lost" : "gained"}`;
}
