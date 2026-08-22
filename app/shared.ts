/**
 * Small helpers shared by the tracker screens and the export panel.
 *
 * Every date in this app is a plain local calendar date such as `2026-08-22`.
 * Nothing here ever parses one as UTC, because doing that shifts the day back
 * for anyone west of Greenwich. Dates are read at midday local time when a
 * `Date` object is genuinely needed, which is safely clear of both ends.
 */

export type Profile = "chris" | "sarah";

export const profileNames: Record<Profile, string> = { chris: "Chris", sarah: "Sarah" };

export function isoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export function localDate() { return isoDate(new Date()); }
export function addDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return isoDate(next);
}
/** The same calendar date a whole number of months earlier, clamped to a real day. */
export function addMonths(date: string, months: number) {
  const from = new Date(`${date}T12:00:00`);
  const target = new Date(from);
  target.setMonth(target.getMonth() + months);
  // Stepping back from the 31st into a shorter month rolls forward in
  // JavaScript, so pull it back to the last day of the month that was meant.
  if (target.getDate() !== from.getDate()) target.setDate(0);
  return isoDate(target);
}
export function round(value: number) { return Math.round(value * 10) / 10; }
/** Trims trailing zeros so 6 shows as "6" and 7.50 shows as "7.5". */
export function amount(value: number) { return String(Math.round(value * 100) / 100); }
export function longDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
export function shortDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export function weekdayLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
}
/** "Aug 22, 2026" — used where an export has to stand on its own without a heading. */
export function mediumDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
/** Thousands separators for step counts, which run to five digits. */
export function whole(value: number) { return Math.round(value).toLocaleString("en-US"); }
