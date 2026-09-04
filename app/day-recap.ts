/**
 * The text behind "Copy this day".
 *
 * Three sections, in this order: the selected day exactly as the diary screen
 * shows it, a rolling seven-day summary ending on that same day, and the
 * journal already saved for it.
 *
 * Every date here is the date chosen in the tracker, never today's clock date,
 * because a recap is often written the following morning. The rolling window is
 * the selected date plus the six calendar dates before it and never reaches
 * past the selected date.
 *
 * Missing information is never quietly turned into a zero. Each average says
 * how many of the seven days it was worked out from, subtype by subtype and
 * field by field, so a partial week reads as a partial week.
 *
 * Only `nutrition.ts`, `shared.ts`, and the export payload shape are imported,
 * so the whole recap can be built and checked without a browser.
 */
import type { ExportPayload } from "./export-shared";
import {
  type FatSubtype, type FatTotals, type NetCarbGoals,
  UNKNOWN_FAT_LABEL,
  emptyFatTotals, fatSubtypeKeys, fatSubtypeShortLabels, fatTotalsFrom,
  hasFatDetail, mergeFatTotals, netCarbGoalLabel, netCarbProgress, unclassifiedFat,
} from "./nutrition";
import { addDays, localDate, longDate, round, whole } from "./shared";

/** The selected day plus the six calendar days before it. */
export const ROLLING_DAYS = 7;

/** The daily average Chris aims to land in. Compared against, never enforced. */
export const PREFERRED_CALORIE_RANGE = { min: 2000, max: 2100 };

/** The sections of the export feed the rolling summary is built from. */
export const recapSections = [
  "dailySummaries", "waterEntries", "exerciseCalories", "steps", "goals",
] as const;

const roundTwo = (value: number) => Math.round(value * 100) / 100;

/** One activity as the diary screen holds it, comments included. */
export type RecapActivity = { activity: string; minutes: number; calories: number; comments: string };

/**
 * One calendar day of the rolling window.
 *
 * `items` is the day's food-entry count, and 0 means no food was recorded at
 * all rather than a day of zero calories. `steps` is null when no step count
 * was entered, and `calorieGoal` is null when that date carries no saved goal.
 */
export type RecapDay = {
  date: string;
  items: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  netCarbs: number;
  fatDetail: FatTotals;
  calorieGoal: number | null;
  exerciseMinutes: number;
  exerciseCalories: number;
  sessions: number;
  steps: number | null;
  waterOunces: number;
  waterGoal: number | null;
};

/** The goals the selected day is judged against, as the diary screen holds them. */
export type RecapGoals = { calories: number; protein: number; fat: number; fiber: number; waterOunces: number };

/** The first date of the rolling window that ends on `selected`. */
export function rollingStart(selected: string) {
  return addDays(selected, -(ROLLING_DAYS - 1));
}

/** Every date in the window, oldest first, ending on the selected date. */
export function rollingDates(selected: string) {
  const dates: string[] = [];
  for (let index = ROLLING_DAYS - 1; index >= 0; index -= 1) dates.push(addDays(selected, -index));
  return dates;
}

/** The six dates before the selected one, which are the days fetched from the server. */
export function priorRange(selected: string) {
  return { start: rollingStart(selected), end: addDays(selected, -1) };
}

/** "August 29 through September 4, 2026", dropping the repeated year. */
export function rangeLabel(start: string, end: string) {
  const from = new Date(`${start}T12:00:00`);
  const to = new Date(`${end}T12:00:00`);
  const sameYear = from.getFullYear() === to.getFullYear();
  const startText = from.toLocaleDateString(undefined, sameYear
    ? { month: "long", day: "numeric" }
    : { month: "long", day: "numeric", year: "numeric" });
  const endText = to.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  return `${startText} through ${endText}`;
}

/**
 * The export feed's rows turned into one `RecapDay` per requested date.
 *
 * A date the feed holds nothing for still produces a day, with `items` at 0 and
 * `steps` at null, so the summary can count it as a day without data rather
 * than as a day of zeroes. Only the calorie goal is saved per date; the water
 * goal falls back to the current setting, which is said plainly in the output.
 */
export function recapDaysFromExport(
  payload: ExportPayload,
  dates: string[],
  current: { calories: number; waterOunces: number },
): RecapDay[] {
  const summaries = new Map((payload.dailySummaries ?? []).map(row => [row.date, row]));
  const water = new Map<string, number>();
  for (const row of payload.waterEntries ?? []) water.set(row.date, (water.get(row.date) ?? 0) + row.ounces);
  const movement = new Map((payload.exerciseCalories ?? []).map(row => [row.date, row]));
  const steps = new Map((payload.steps ?? []).map(row => [row.date, row.steps]));
  const savedCalorieGoals = new Map((payload.goals?.dailyCalorieGoals ?? []).map(row => [row.date, row.calories]));
  const waterGoal = payload.goals?.current?.waterOunces ?? current.waterOunces;

  return dates.map(date => {
    const food = summaries.get(date);
    const day = movement.get(date);
    const recorded = steps.get(date);
    return {
      date,
      items: Number(food?.foodItems ?? 0),
      calories: roundTwo(food?.calories ?? 0),
      protein: roundTwo(food?.protein ?? 0),
      fat: roundTwo(food?.fat ?? 0),
      carbs: roundTwo(food?.carbs ?? 0),
      fiber: roundTwo(food?.fiber ?? 0),
      netCarbs: roundTwo(food?.netCarbs ?? 0),
      // Rebuilt through the shared rollup, so a subtype nobody recorded stays
      // null here exactly as it is everywhere else.
      fatDetail: food
        ? fatTotalsFrom(food.fat, food.foodItems, food, food.fatSubtypeEntries)
        : emptyFatTotals(),
      calorieGoal: savedCalorieGoals.get(date) ?? null,
      exerciseMinutes: roundTwo(day?.minutes ?? 0),
      exerciseCalories: roundTwo(day?.caloriesBurned ?? 0),
      sessions: Number(day?.sessions ?? 0),
      steps: recorded === undefined ? null : Number(recorded),
      waterOunces: roundTwo(water.get(date) ?? 0),
      waterGoal,
    };
  });
}

/**
 * What the rolling window works out to.
 *
 * Two different divisors are kept apart on purpose and both are reported:
 * calories and nutrition are averaged over the days that recorded food, while
 * activity and hydration are averaged over the days that recorded anything at
 * all, because a logged day with no exercise really did have none. Steps use
 * the days a step count was entered on. An average with no days behind it is
 * null rather than zero.
 */
export type RollingSummary = {
  start: string;
  end: string;
  days: number;
  daysWithData: number;
  daysWithFood: number;
  daysWithSteps: number;
  calories: {
    total: number;
    /** The goal saved for each of the seven dates, added together. */
    goalTotal: number;
    /** Averaged over the days that recorded food. */
    average: number | null;
    /** The combined goal divided by all seven dates, recorded or not. */
    goalAverage: number;
    /** Dates carrying no saved goal, so the current setting stood in. */
    assumedGoalDays: number;
  };
  nutrition: {
    carbs: number | null; netCarbs: number | null; protein: number | null;
    fat: number | null; fiber: number | null;
  };
  fat: FatTotals;
  /** Per subtype: its daily average and how many food days supplied it. */
  fatSubtypes: Record<FatSubtype, { average: number | null; days: number }>;
  activity: { minutes: number; calories: number; minutesPerDay: number | null; caloriesPerDay: number | null };
  steps: { total: number; average: number | null };
  /** The hydration goal is never dated, so only what was drunk is summed here. */
  water: { total: number; average: number | null };
};

export function summarizeRolling(days: RecapDay[], current: { calories: number; waterOunces: number }): RollingSummary {
  const withFood = days.filter(day => day.items > 0);
  // A day counts as recorded when anything at all was entered for it.
  const withData = days.filter(day =>
    day.items > 0 || day.sessions > 0 || day.steps !== null || day.waterOunces > 0);
  const withSteps = days.filter(day => day.steps !== null);
  const foodDays = withFood.length;
  const dataDays = withData.length;

  const sum = (list: RecapDay[], pick: (day: RecapDay) => number) =>
    roundTwo(list.reduce((total, day) => total + pick(day), 0));
  const per = (total: number, divisor: number) => divisor > 0 ? roundTwo(total / divisor) : null;

  const caloriesTotal = sum(withFood, day => day.calories);
  // The combined allowance is the goal saved for each of the seven dates added
  // together, and the average goal is that combined figure divided by seven —
  // not by the days that happen to hold food. The current setting only stands
  // in where a date carries no saved goal, and the count of those dates travels
  // with the summary so the output can say so.
  const goalTotal = days.reduce((total, day) => total + (day.calorieGoal ?? current.calories), 0);
  const caloriesAverage = per(caloriesTotal, foodDays);
  const goalAverage = days.length > 0 ? roundTwo(goalTotal / days.length) : 0;

  const fat = withFood.reduce<FatTotals>((totals, day) => mergeFatTotals(totals, day.fatDetail), emptyFatTotals());
  const fatSubtypes = Object.fromEntries(fatSubtypeKeys.map(key => {
    const supplied = withFood.filter(day => day.fatDetail.known[key] > 0);
    const subtotal = fat.subtotals[key];
    return [key, {
      // Averaged over the days that actually supplied the subtype, never over
      // the days that did not.
      average: subtotal === null || supplied.length === 0 ? null : roundTwo(subtotal / supplied.length),
      days: supplied.length,
    }];
  })) as RollingSummary["fatSubtypes"];

  const activityMinutes = sum(days, day => day.exerciseMinutes);
  const activityCalories = sum(days, day => day.exerciseCalories);
  const stepsTotal = withSteps.reduce((total, day) => total + (day.steps ?? 0), 0);
  const waterTotal = sum(withData, day => day.waterOunces);

  return {
    start: days[0]?.date ?? "",
    end: days[days.length - 1]?.date ?? "",
    days: days.length,
    daysWithData: dataDays,
    daysWithFood: foodDays,
    daysWithSteps: withSteps.length,
    calories: {
      total: caloriesTotal,
      goalTotal: Math.round(goalTotal),
      average: caloriesAverage,
      goalAverage,
      assumedGoalDays: days.filter(day => day.calorieGoal === null).length,
    },
    nutrition: {
      carbs: per(sum(withFood, day => day.carbs), foodDays),
      netCarbs: per(sum(withFood, day => day.netCarbs), foodDays),
      protein: per(sum(withFood, day => day.protein), foodDays),
      fat: per(sum(withFood, day => day.fat), foodDays),
      fiber: per(sum(withFood, day => day.fiber), foodDays),
    },
    fat,
    fatSubtypes,
    activity: {
      minutes: activityMinutes,
      calories: activityCalories,
      minutesPerDay: per(activityMinutes, dataDays),
      caloriesPerDay: per(activityCalories, dataDays),
    },
    steps: { total: stepsTotal, average: withSteps.length > 0 ? Math.round(stepsTotal / withSteps.length) : null },
    water: { total: waterTotal, average: per(waterTotal, dataDays) },
  };
}

/**
 * The fat subtypes as indented plain-text lines for one day.
 *
 * Nothing is produced when no food that day recorded a breakdown, so the
 * copied day stays as short as it was for anyone not tracking subtypes.
 */
export function fatBreakdownLines(totals: FatTotals) {
  if (!hasFatDetail(totals)) return [];
  const lines = fatSubtypeKeys.map(key => {
    const value = totals.subtotals[key];
    const partial = value !== null && totals.missing[key] > 0 ? ` (from ${totals.known[key]} of ${totals.records} foods)` : "";
    return `  ${fatSubtypeShortLabels[key]}: ${value === null ? UNKNOWN_FAT_LABEL : `${round(value)}g`}${partial}`;
  });
  const other = unclassifiedFat(totals);
  if (other !== null) lines.push(`  Unclassified: ${round(other)}g`);
  return lines;
}

/** The selected day, exactly as the diary screen reports it. */
export function daySectionLines(input: {
  day: RecapDay;
  activities: RecapActivity[];
  goals: RecapGoals;
  netCarbGoals: NetCarbGoals;
}) {
  const { day, activities, goals, netCarbGoals } = input;
  const over = day.calories - goals.calories;
  // Worked out from the net carbs as they are printed, so the shortfall and the
  // amount above it always add up: 27.3g against a 100g minimum reads 72.7g to
  // reach it, never 72.75g.
  const standing = netCarbProgress(round(day.netCarbs), netCarbGoals);
  const lines = [
    longDate(day.date),
    "",
    `Calories: ${Math.round(day.calories)} of ${goals.calories} (${over > 0 ? `${Math.round(over)} over` : `${Math.round(-over)} remaining`})`,
    `Total carbs: ${round(day.carbs)}g`,
    `Net carbs: ${round(day.netCarbs)}g of ${netCarbGoalLabel(netCarbGoals)} — ${standing.summary}`,
    `Protein: ${round(day.protein)}g of ${goals.protein}g`,
    `Fat: ${round(day.fat)}g of ${goals.fat}g`,
    // Indented under Fat, and only when something actually recorded a breakdown.
    ...fatBreakdownLines(day.fatDetail),
    `Fiber: ${round(day.fiber)}g of ${goals.fiber}g`,
    "",
    `Activity: ${round(day.exerciseMinutes)} minutes${day.exerciseCalories > 0 ? ` · ${Math.round(day.exerciseCalories)} calories burned` : ""}`,
  ];
  if (activities.length === 0) lines.push("- Nothing logged");
  else for (const item of activities) {
    lines.push(`- ${item.activity}: ${round(item.minutes)} min${item.calories > 0 ? `, ${Math.round(item.calories)} cal` : ""}`);
    // Comments are indented under their activity so a long gym note stays
    // readable when the whole day is pasted somewhere else.
    if (item.comments.trim()) for (const line of item.comments.split("\n")) lines.push(`  ${line}`);
  }
  lines.push("", `Steps: ${day.steps === null ? "Not recorded" : whole(day.steps)}`);
  lines.push("", `Hydration: ${round(day.waterOunces)} of ${round(goals.waterOunces)} oz`);
  return lines;
}

/** "1 day", "5 days" — so a one-day week never reads as "1 days". */
const dayWord = (count: number) => count === 1 ? "day" : "days";

/**
 * The divisor an average was worked out from, said in full.
 *
 * Written on every average outside the nutrition block, because "daily average"
 * on its own would read as the total divided by all seven calendar dates.
 */
const acrossDays = (count: number) => `(average across ${count} recorded ${dayWord(count)})`;

/** "1,882 of 2,100", with the thousands separators calories always carry. */
const calorieText = (value: number | null) => value === null ? "—" : whole(value);
/**
 * Grams as they are shown: one decimal place at most.
 *
 * Every comparison below is worked out from this rounded figure rather than
 * from the stored one, so a displayed difference always agrees with the
 * displayed intake: 51g against a 125g minimum reads as 74g to reach it, never
 * as 73.97g.
 */
const grams = (value: number) => round(value);
const gramsText = (value: number | null) => value === null ? UNKNOWN_FAT_LABEL : `${grams(value)}g`;

/** "126.7g of 150g — 23.3g below goal", from the displayed figures. */
function againstGoal(average: number | null, goal: number | null | undefined) {
  if (average === null) return UNKNOWN_FAT_LABEL;
  const shown = grams(average);
  const target = goal === null || goal === undefined || !Number.isFinite(Number(goal)) || Number(goal) <= 0
    ? null
    : grams(Number(goal));
  if (target === null) return `${shown}g`;
  const difference = round(target - shown);
  if (difference > 0) return `${shown}g of ${target}g — ${difference}g below goal`;
  if (difference < 0) return `${shown}g of ${target}g — ${-difference}g above goal`;
  return `${shown}g of ${target}g — at goal`;
}

/**
 * Net carbs against the current range.
 *
 * The range is a minimum and a maximum, so being under the minimum is said
 * plainly rather than left to read as success. The goal is never described as
 * historical: it is always the tracker's current setting.
 */
function netCarbComparison(average: number | null, goals: NetCarbGoals) {
  if (average === null) return UNKNOWN_FAT_LABEL;
  const shown = grams(average);
  if (goals.min > 0 && shown < goals.min) {
    return `${shown}g — ${round(grams(goals.min) - shown)}g below the current ${grams(goals.min)}g minimum`;
  }
  if (shown > goals.max) {
    return `${shown}g — ${round(shown - grams(goals.max))}g above the current ${grams(goals.max)}g maximum`;
  }
  if (goals.min > 0) {
    return `${shown}g — within the current ${grams(goals.min)} to ${grams(goals.max)}g range`;
  }
  return `${shown}g — ${round(grams(goals.max) - shown)}g below the current ${grams(goals.max)}g maximum`;
}

/** Where a daily average sits against the preferred 2,000–2,100 range. */
export function preferredRangeNote(average: number | null) {
  const label = `Preferred average range: ${whole(PREFERRED_CALORIE_RANGE.min)}–${whole(PREFERRED_CALORIE_RANGE.max)} calories`;
  if (average === null) return `${label} — no days with food logged`;
  if (average < PREFERRED_CALORIE_RANGE.min) {
    return `${label} — ${whole(PREFERRED_CALORIE_RANGE.min - average)} below the ${whole(PREFERRED_CALORIE_RANGE.min)} minimum`;
  }
  if (average > PREFERRED_CALORIE_RANGE.max) {
    return `${label} — ${whole(average - PREFERRED_CALORIE_RANGE.max)} above the ${whole(PREFERRED_CALORIE_RANGE.max)} maximum`;
  }
  return `${label} — within the range`;
}

/** The rolling seven-day section, coverage stated wherever a day is missing. */
export function rollingSectionLines(summary: RollingSummary, input: {
  /** The tracker's current goals. Nothing but calories is kept per date. */
  goals: RecapGoals;
  netCarbGoals: NetCarbGoals;
  /** True when the selected date is today, so the week is still filling up. */
  includesToday: boolean;
}) {
  const { goals, netCarbGoals } = input;
  const lines = [`Rolling ${summary.days} Days: ${rangeLabel(summary.start, summary.end)}`];
  // Said only when the selected day is today, because only then is the last
  // day of the window still being written.
  if (input.includesToday) {
    lines.push("- Includes the selected day's totals as currently recorded; today may still be in progress.");
  }
  if (summary.daysWithData === 0) {
    lines.push("", `Nothing was recorded on any of these ${summary.days} days.`);
    return lines;
  }

  const calories = summary.calories;
  // Rounded once, here, so the difference printed below is exactly the
  // difference between the two figures printed above it.
  const shownAverage = calories.average === null ? null : Math.round(calories.average);
  const shownGoalAverage = Math.round(calories.goalAverage);
  lines.push("", "Calories:");
  if (summary.daysWithFood < summary.days) {
    lines.push(`- Food recorded on ${summary.daysWithFood} of ${summary.days} dates.`);
  }
  lines.push(`- Total consumed: ${calorieText(calories.total)}`);
  lines.push(`- Combined calorie goal: ${calorieText(calories.goalTotal)} (the goal saved for each of the ${summary.days} dates)`);
  lines.push(`- Daily average consumed: ${shownAverage === null ? "Not recorded" : whole(shownAverage)}${shownAverage === null ? "" : ` ${acrossDays(summary.daysWithFood)}`}`);
  lines.push(`- Average daily calorie goal: ${whole(shownGoalAverage)} (combined goal divided by ${summary.days})`);
  const difference = shownAverage === null ? null : shownAverage - shownGoalAverage;
  lines.push(`- Average daily difference: ${difference === null
    ? "Not recorded"
    : difference > 0
      ? `${whole(difference)} over goal`
      : difference < 0
        ? `${whole(-difference)} under goal`
        : "at goal"}`);
  lines.push(`- ${preferredRangeNote(shownAverage)}`);
  // The calorie goal is the one goal saved per date, so a date without a saved
  // one is named rather than quietly judged against the current setting.
  if (calories.assumedGoalDays > 0) {
    lines.push(`- ${calories.assumedGoalDays} of ${summary.days} dates had no saved calorie goal, so the current goal was used for ${calories.assumedGoalDays === 1 ? "it" : "them"}.`);
  }

  // Every nutrition goal below is the tracker's current setting: only calories
  // are kept per date, and no historical value is looked up for the rest.
  lines.push("", summary.daysWithFood === summary.days
    ? "Daily nutrition averages:"
    : `Daily nutrition averages ${acrossDays(summary.daysWithFood)}:`);
  lines.push(`- Total carbs: ${gramsText(summary.nutrition.carbs)}`);
  lines.push(`- Net carbs: ${netCarbComparison(summary.nutrition.netCarbs, netCarbGoals)}`);
  lines.push(`- Protein: ${againstGoal(summary.nutrition.protein, goals.protein)}`);
  // Total fat is a comparison, never a target to reach: it is not a minimum.
  lines.push(`- Fat: ${summary.nutrition.fat === null
    ? UNKNOWN_FAT_LABEL
    : `${grams(summary.nutrition.fat)}g compared with the current ${grams(goals.fat)}g goal`}`);
  for (const key of fatSubtypeKeys) {
    const subtype = summary.fatSubtypes[key];
    // An average covering fewer than the seven dates names its divisor; one no
    // date supplied reads "Not available" and never "0g".
    const note = subtype.average !== null && subtype.days < summary.days ? ` ${acrossDays(subtype.days)}` : "";
    lines.push(`  - ${fatSubtypeShortLabels[key]}: ${gramsText(subtype.average)}${note}`);
  }
  lines.push(`- Fiber: ${againstGoal(summary.nutrition.fiber, goals.fiber)}`);

  lines.push("", "Activity:");
  lines.push(`- Total: ${Math.round(summary.activity.minutes)} minutes · ${Math.round(summary.activity.calories)} calories burned`);
  lines.push(`- Daily average: ${Math.round(summary.activity.minutesPerDay ?? 0)} minutes · ${Math.round(summary.activity.caloriesPerDay ?? 0)} calories burned ${acrossDays(summary.daysWithData)}`);

  lines.push("", "Steps:");
  if (summary.daysWithSteps === 0) {
    lines.push("- Total: Not recorded", "- Daily average: Not recorded");
  } else {
    lines.push(`- Total: ${whole(summary.steps.total)} (from ${summary.daysWithSteps} recorded ${dayWord(summary.daysWithSteps)})`);
    lines.push(`- Daily average: ${whole(summary.steps.average ?? 0)} ${acrossDays(summary.daysWithSteps)}`);
  }

  lines.push("", "Hydration:");
  lines.push(`- Daily average: ${summary.water.average === null ? "Not recorded" : round(summary.water.average)} oz ${acrossDays(summary.daysWithData)}`);
  lines.push(`- Average goal: ${round(goals.waterOunces)} oz (current setting)`);
  // Only the calorie goal carries dated history, so the rest are named for what
  // they are rather than implied to have applied on every date.
  lines.push("", "Net carb, protein, fat, fiber, and hydration goals are the tracker's current settings; only the calorie goal is saved per date.");
  return lines;
}

/** The journal exactly as saved, or a plain line saying there is none. */
export function journalLines(journal: string | null) {
  if (journal === null) return ["Journal: Could not be loaded"];
  // Copied verbatim: paragraphs, line breaks, and punctuation are never touched.
  if (journal.trim() === "") return ["Journal: Nothing recorded"];
  return ["Journal:", journal];
}

/**
 * The whole copied recap: the selected day, the rolling seven days ending on
 * it, then that day's journal.
 *
 * `priorDays` holds the six days before the selected date. It is null when they
 * could not be loaded, and the summary then says so rather than averaging the
 * one day it has as though it were the week.
 */
export function dayRecapText(input: {
  day: RecapDay;
  activities: RecapActivity[];
  goals: RecapGoals;
  netCarbGoals: NetCarbGoals;
  priorDays: RecapDay[] | null;
  journal: string | null;
  /** Today's calendar date, read at the moment of the copy. */
  today?: string;
}) {
  const lines = daySectionLines(input);
  // The in-progress note belongs to today alone, so it never appears on a
  // recap written the next morning for the day before.
  const includesToday = input.day.date === (input.today ?? localDate());
  lines.push("");
  if (input.priorDays === null) {
    lines.push(`Rolling ${ROLLING_DAYS} Days: ${rangeLabel(rollingStart(input.day.date), input.day.date)}`);
    lines.push("", "The earlier days could not be loaded, so no seven-day summary is available.");
  } else {
    const window = [...input.priorDays, input.day].sort((a, b) => a.date.localeCompare(b.date));
    const summary = summarizeRolling(window, {
      calories: input.goals.calories, waterOunces: input.goals.waterOunces,
    });
    lines.push(...rollingSectionLines(summary, {
      goals: input.goals, netCarbGoals: input.netCarbGoals, includesToday,
    }));
  }
  lines.push("");
  lines.push(...journalLines(input.journal));
  return lines.join("\n");
}
