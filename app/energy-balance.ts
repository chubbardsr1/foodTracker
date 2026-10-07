/**
 * Wording and formatting for the Reports tab's Energy balance table, shared by
 * the on-screen table and the Energy Balance PDF so the two can never disagree.
 *
 * The figures themselves are worked out once, in `/api/reports`; this module
 * only decides how they are labelled and printed. A figure that could not be
 * worked out is a dash, never a zero.
 */
import { ACTIVITY_LEVELS, DEFAULT_ACTIVITY_LEVEL } from "./nutrition";
import { amount, shortDate, whole } from "./shared";

export type EnergyColumns = Record<
  "eaten" | "goalDifference" | "exercise" | "stepCalories" | "activityOffset" | "adjustedIntake" | "tdee" | "energyBalance",
  number | null
>;

export type WeightChange = {
  startDate: string; startPounds: number; endDate: string; endPounds: number; pounds: number;
};

export type EnergySummary = {
  weightChange?: WeightChange | null;
  loggedDays: number;
  daysWithTdee: number;
  averages: EnergyColumns;
  totals: EnergyColumns;
  bodyMetricsSet: boolean;
};

export type EnergyDay = {
  date: string; items: number; calories: number; exerciseCalories: number; sessions: number; steps: number | null;
  weightPounds?: number | null; weightDate?: string | null; goalDifference?: number | null;
  stepCalories?: number | null; activityOffset?: number; adjustedIntake?: number | null;
  tdee?: number | null; energyBalance?: number | null;
};

/** Short on purpose, so all nine columns fit the width they are given. */
export const energyHeaders = [
  "Day", "Eaten", "Goal +/-", "Exercise", "Step Cal", "Act. Off.", "Adj Intake", "TDEE", "Est Tll +/-",
] as const;

const cell = (value: number | null | undefined) => value === null || value === undefined ? "—" : whole(value);
/** Over a goal or above TDEE reads as +, short of it or a deficit as -. A dash (the PDF folds it to a hyphen) means unknown. */
const signed = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${value > 0 ? "+" : ""}${whole(value)}`;

/** The eight figures after the day label, in column order. */
export function energyDayCells(day: EnergyDay): string[] {
  return [
    cell(day.calories), signed(day.goalDifference), cell(day.exerciseCalories), cell(day.stepCalories),
    cell(day.activityOffset), cell(day.adjustedIntake), cell(day.tdee), signed(day.energyBalance),
  ];
}

/** The eight figures of the average and total rows. */
export function energySummaryCells(values: EnergyColumns | undefined): string[] {
  return [
    cell(values?.eaten), signed(values?.goalDifference), cell(values?.exercise), cell(values?.stepCalories),
    cell(values?.activityOffset), cell(values?.adjustedIntake), cell(values?.tdee), signed(values?.energyBalance),
  ];
}

/** The weight a day's TDEE and step calories rest on, with the weigh-in date when it was carried forward. */
export function energyWeightNote(day: EnergyDay): string {
  if (day.weightPounds === null || day.weightPounds === undefined) return "";
  const carried = day.weightDate && day.weightDate !== day.date ? ` (${shortDate(day.weightDate)})` : "";
  return `${amount(day.weightPounds)} lb${carried}`;
}

const level = ACTIVITY_LEVELS.find(item => item.id === DEFAULT_ACTIVITY_LEVEL) ?? ACTIVITY_LEVELS[2];

export const ENERGY_DEFINITIONS =
  "For every day in the range. Goal +/- is calories eaten minus that day's calorie goal (a plus is over, a minus is "
  + "short). Act. Off. is the activity offset: exercise calories plus approximate step calories. Adj Intake is calories "
  + "eaten minus the activity offset. Act. Off. and Adj Intake are informational: they show how active you were on a "
  + "day, for example one you went over your goal, and are not used in the final column. Est Tll +/- is calories eaten "
  + `minus TDEE (${level.label.toLowerCase()}, x${level.factor}): a minus is an estimated deficit, a plus is an `
  + "estimated overage. Each day uses that day's weight, or the closest earlier weigh-in.";

export const ENERGY_ASSUMPTIONS =
  "Goal +/- uses the calorie goal saved for each day. Step calories use about 0.57 calories per pound per mile, with "
  + "stride length estimated from height (0.413 x height), and are an estimate. TDEE already assumes some everyday "
  + "activity, so exercise and step calories are not subtracted from intake a second time in Est Tll +/-. Exercise "
  + "calories are informational and do not change the calorie goal.";

export const CALORIES_PER_POUND = 3500;

export const ENERGY_COMPARISON_NOTE =
  "The summary compares the weight change between the first and last weigh-in in the range with the Est Tll +/- "
  + "total. It is a rough check: water, timing of weigh-ins, and estimate error all move the scale.";

export type EnergyComparison = { label: string; value: string; detail: string }[];

/**
 * Weight change set beside the estimated deficit for the same range. The deficit
 * is the Est Tll +/- total (calories eaten minus TDEE), turned into pounds at
 * 3,500 calories per pound. Anything that cannot be worked out is a dash.
 */
export function energyComparison(energy: EnergySummary | null): EnergyComparison {
  const change = energy?.weightChange ?? null;
  const balance = energy?.totals.energyBalance ?? null;
  const weight: EnergyComparison[number] = change
    ? {
        label: "Weight change",
        value: `${change.pounds > 0 ? "+" : ""}${amount(change.pounds)} lb`,
        detail: `${amount(change.startPounds)} lb on ${shortDate(change.startDate)} to ${amount(change.endPounds)} lb on ${shortDate(change.endDate)}`,
      }
    : { label: "Weight change", value: "—", detail: "Needs at least two weigh-ins in the range" };
  const deficit: EnergyComparison[number] = balance === null
    ? { label: "Estimated deficit total", value: "—", detail: "Needs food logged on a day with a TDEE" }
    : {
        label: balance > 0 ? "Estimated overage total" : "Estimated deficit total",
        value: `${whole(Math.abs(balance))} cal`,
        detail: balance > 0 ? "Calories eaten above TDEE" : "Calories eaten below TDEE",
      };
  const pounds: EnergyComparison[number] = balance === null
    ? { label: "Approximate pounds", value: "—", detail: `At ${whole(CALORIES_PER_POUND)} calories per pound` }
    : {
        label: balance > 0 ? "Approximate pounds over" : "Approximate pounds",
        value: `${amount(Math.round(Math.abs(balance) / CALORIES_PER_POUND * 10) / 10)} lb`,
        detail: `At ${whole(CALORIES_PER_POUND)} calories per pound`,
      };
  return [weight, deficit, pounds];
}

/** How many days actually fed the comparison, so a partial range is never read as a whole one. */
export function energyCoverageNote(totalDays: number, energy: EnergySummary | null) {
  const logged = energy?.loggedDays ?? 0;
  const noTdee = energy && energy.daysWithTdee < energy.loggedDays ? `, and ${energy.daysWithTdee} of them have a TDEE` : "";
  return `${logged} of ${totalDays} days have food logged; only those days are compared, averaged, or totalled${noTdee}.`;
}

/** Fetches the report the Energy balance table is built from. */
export async function fetchEnergyReport(profile: string, start: string, end: string) {
  const response = await fetch(`/api/reports?start=${start}&end=${end}`, { headers: { "x-food-tracker-profile": profile } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? "Unable to build the energy balance");
  return data as { days: EnergyDay[]; energy: EnergySummary | null };
}
