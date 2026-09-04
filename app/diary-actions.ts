/**
 * The rules behind the diary's newer actions, kept out of the React screens so
 * they can be read and tested on their own.
 *
 * Everything here works on plain local calendar dates such as `2026-09-02`.
 * Nothing parses a date as UTC, for the reason given at the top of
 * `shared.ts`: doing so shifts the day backwards for anyone west of Greenwich
 * and would move an entry to the wrong day. Comparing two `YYYY-MM-DD` strings
 * lexicographically is exactly comparing the calendar dates, with no `Date`
 * object and therefore no timezone involved at all.
 */
import type { FatBreakdown } from "./nutrition";
import { longDate, mediumDate } from "./shared";

/** What is being added, which only changes the wording of the warning. */
export type AddKind = "food" | "exercise";

/**
 * True when `date` is an earlier calendar day than `today`.
 *
 * Today is never past, and a future date is deliberately not past either: the
 * warning is about quietly logging into history, and planning ahead is a
 * different thing that the tracker already allows.
 */
export function isPastDate(date: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  return date < today;
}

export type PastDateWarning = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
};

/**
 * The warning shown before an entry is started on a day that has already
 * passed. The selected date appears in the question and on the confirm button,
 * so neither answer can be given without seeing which day it applies to.
 */
export function pastDateWarning(kind: AddKind, date: string): PastDateWarning {
  return {
    title: kind === "food" ? "Add food to a past day?" : "Add exercise to a past day?",
    // The full day in the question, where there is room to read it.
    message: `You are viewing ${longDate(date)}, not today. Do you want to add ${kind} to this date?`,
    // The shorter form on the button, which is a phone-width control: the
    // whole weekday-and-year version wraps onto four lines there and stops
    // reading as a button at all.
    confirmLabel: `Yes, add to ${mediumDate(date)}`,
    cancelLabel: "No, go to today",
  };
}

/** The nutrition every diary food carries, whatever it was entered from. */
export type FoodValues = {
  name: string;
  serving: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
} & FatBreakdown;

/** A saved diary entry, as the API returns it. */
export type DiaryFood = { id: number; eatenOn: string; meal: string } & FoodValues;

/**
 * The prefill for a copy of one diary entry.
 *
 * Only what the food actually is travels: name, serving, meal, and every
 * nutrition value including the four fat subtypes, with unknown left unknown.
 * The identity, the day it was eaten, and the audit columns are deliberately
 * left behind, so the copy is a genuinely new entry and the original is never
 * touched.
 *
 * `servings` is 1 because a diary entry's nutrition is already the amount that
 * was eaten — an entry saved as half a serving stores half the nutrition and
 * reads "0.5 × 1 cup". Copying it at one serving reproduces the same food, and
 * the field stays editable before the copy is saved.
 */
export function copyOfEntry(entry: DiaryFood): FoodValues & { meal: string; servings: number } {
  return {
    meal: entry.meal,
    name: entry.name,
    serving: entry.serving,
    servings: 1,
    calories: entry.calories,
    protein: entry.protein,
    fat: entry.fat,
    carbs: entry.carbs,
    fiber: entry.fiber,
    saturatedFat: entry.saturatedFat,
    transFat: entry.transFat,
    monounsaturatedFat: entry.monounsaturatedFat,
    polyunsaturatedFat: entry.polyunsaturatedFat,
  };
}

/**
 * The My Foods payload for a diary entry, or for the values currently in the
 * edit form when they have been changed.
 *
 * A saved food holds one full serving, so nothing is scaled here: the diary
 * entry's serving text and nutrition are stored exactly as they read. The meal
 * and the date are not part of a reusable food and never travel with it.
 */
export function savedFoodFrom(values: FoodValues) {
  return {
    name: values.name,
    serving: values.serving,
    calories: values.calories,
    protein: values.protein,
    fat: values.fat,
    carbs: values.carbs,
    fiber: values.fiber,
    saturatedFat: values.saturatedFat,
    transFat: values.transFat,
    monounsaturatedFat: values.monounsaturatedFat,
    polyunsaturatedFat: values.polyunsaturatedFat,
  };
}
