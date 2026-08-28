/**
 * Rules the workout screens and the workout API both depend on.
 *
 * Dates here follow the rest of the tracker: a plain local calendar date such
 * as `2026-08-31`, never parsed as UTC. Every `Date` object is read at midday
 * local time, which is safely clear of both ends of the day, so a
 * Monday-to-Sunday week range can never slide by one.
 */
import { addDays, isoDate, longDate, mediumDate } from "./shared";

export const WORKOUT_DAYS_PER_WEEK = 7;
/** Long enough for a full gym write-up, matching the activity comments cap. */
export const MAX_WORKOUT_NOTES = 2000;
export const MAX_MACHINE_SETTINGS = 500;
export const MAX_WORKOUT_MINUTES = 1440;
export const MAX_WORKOUT_CALORIES = 10000;
export const MAX_SET_REPS = 1000;
export const MAX_SET_WEIGHT = 2000;
export const MAX_SETS_PER_EXERCISE = 30;
export const MAX_DISTANCE = 1000;
export const MAX_INCLINE = 60;
export const MAX_RESISTANCE = 100;

export type CycleStatus = "upcoming" | "active" | "completed" | "archived";
export type SessionStatus = "in_progress" | "completed" | "partial" | "abandoned";
export type SessionExerciseStatus = "pending" | "completed" | "partial" | "skipped";
export type SetType = "warmup" | "working" | "drop";
export type MeasurementType =
  | "reps_weight" | "reps_bodyweight" | "duration" | "distance_duration" | "class";
export type WorkoutStatus = "not_started" | "in_progress" | "partial" | "completed";

export const cycleStatuses: CycleStatus[] = ["upcoming", "active", "completed", "archived"];
export const sessionStatuses: SessionStatus[] = ["in_progress", "completed", "partial", "abandoned"];
export const sessionExerciseStatuses: SessionExerciseStatus[] = ["pending", "completed", "partial", "skipped"];
export const setTypes: SetType[] = ["warmup", "working", "drop"];

export const workoutStatusLabels: Record<WorkoutStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  partial: "Partially completed",
  completed: "Completed",
};

export const sessionStatusLabels: Record<SessionStatus, string> = {
  in_progress: "In progress",
  completed: "Completed",
  partial: "Partial",
  abandoned: "Abandoned",
};

/** Whether an exercise is measured in reps, in time, or not at all. */
export function usesReps(measurement: string) {
  return measurement === "reps_weight" || measurement === "reps_bodyweight";
}
export function usesWeight(measurement: string) {
  return measurement === "reps_weight";
}
export function usesCardio(measurement: string) {
  return measurement === "duration" || measurement === "distance_duration";
}
export function usesDistance(measurement: string) {
  return measurement === "distance_duration";
}

/** The last day of a cycle: whole weeks from the start, both ends included. */
export function scheduledEndFor(startDate: string, totalWeeks: number) {
  return addDays(startDate, totalWeeks * WORKOUT_DAYS_PER_WEEK - 1);
}

/** The Monday-to-Sunday range a program week covers. */
export function weekRange(startDate: string, weekNumber: number) {
  const start = addDays(startDate, (weekNumber - 1) * WORKOUT_DAYS_PER_WEEK);
  return { start, end: addDays(start, WORKOUT_DAYS_PER_WEEK - 1) };
}

/** "Aug 31 – Sep 6, 2026", for a week heading. */
export function weekRangeLabel(startDate: string, weekNumber: number) {
  const { start, end } = weekRange(startDate, weekNumber);
  return `${mediumDate(start).replace(/, \d{4}$/, "")} – ${mediumDate(end)}`;
}

/** "Starts August 31, 2026", shown while a cycle is still upcoming. */
export function startsOnLabel(startDate: string) {
  return `Starts ${longDate(startDate)}`;
}

/**
 * The week the calendar suggests, which is only ever a suggestion.
 *
 * Null before the cycle starts. After the last week it stays on the final
 * week rather than inventing a Week 5, because the program is four weeks and
 * the user starts a new cycle deliberately.
 */
export function recommendedWeek(startDate: string, totalWeeks: number, today: string) {
  if (today < startDate) return null;
  const daysIn = Math.round(
    (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86400000,
  );
  const week = Math.floor(daysIn / WORKOUT_DAYS_PER_WEEK) + 1;
  return Math.min(Math.max(week, 1), totalWeeks);
}

/** The next Monday strictly after `date`, which is what a new cycle proposes. */
export function nextMonday(date: string) {
  const cursor = new Date(`${date}T12:00:00`);
  do {
    cursor.setDate(cursor.getDate() + 1);
  } while (cursor.getDay() !== 1);
  return isoDate(cursor);
}

/**
 * One workout's status, from every session recorded against it in one cycle.
 *
 * An in-progress session wins, so Resume is always offered. An abandoned
 * session leaves the workout not started; the session itself is kept in
 * history either way.
 */
export function workoutStatusFrom(statuses: readonly string[]): WorkoutStatus {
  if (statuses.includes("in_progress")) return "in_progress";
  if (statuses.includes("completed")) return "completed";
  if (statuses.includes("partial")) return "partial";
  return "not_started";
}

/**
 * A week's status, worked out from its workouts and never from the calendar.
 *
 * A week is never completed merely because its dates have passed, and never
 * reopened because they have not arrived. Version 1 has no "skip this whole
 * workout" action, so only these four states can occur; a skipped *exercise*
 * inside a session is handled at the session level instead.
 */
export function weekStatusFrom(workouts: readonly WorkoutStatus[]): WorkoutStatus {
  if (workouts.length === 0) return "not_started";
  if (workouts.every(status => status === "completed")) return "completed";
  const touched = workouts.some(status => status === "completed" || status === "partial");
  if (touched) return "partial";
  return workouts.some(status => status === "in_progress") ? "in_progress" : "not_started";
}

/**
 * "2 of 3 workouts completed", or the honest alternative when none are.
 *
 * A week holding only a part-finished workout says so rather than reading as
 * untouched, which is what its status says too.
 */
export function weekProgressLabel(workouts: readonly WorkoutStatus[]) {
  const completed = workouts.filter(status => status === "completed").length;
  const inProgress = workouts.filter(status => status === "in_progress").length;
  const partial = workouts.filter(status => status === "partial").length;
  const extras: string[] = [];
  if (inProgress > 0) extras.push(`${inProgress} in progress`);
  if (partial > 0) extras.push(`${partial} partly done`);
  if (completed === 0) {
    if (extras.length === 0) return "Not started";
    const bits: string[] = [];
    if (inProgress > 0) bits.push(`${inProgress} workout${inProgress === 1 ? "" : "s"} in progress`);
    if (partial > 0) bits.push(inProgress > 0 ? `${partial} partly done` : `${partial} workout${partial === 1 ? "" : "s"} partly done`);
    return bits.join(", ");
  }
  return `${completed} of ${workouts.length} workouts completed${extras.length > 0 ? `, ${extras.join(", ")}` : ""}`;
}

export type VolumeSet = {
  setType: string;
  completed: number | boolean;
  actualReps: number | null;
  weight: number | null;
};

/**
 * Workout volume: reps × weight, over completed working sets that recorded
 * both. A warmup, a skipped set, or a bodyweight set with no weight adds
 * nothing rather than adding a zero-weight guess.
 */
export function workingVolume(sets: readonly VolumeSet[]) {
  return sets.reduce((total, set) => {
    if (set.setType !== "working" || !set.completed) return total;
    if (set.actualReps === null || set.weight === null) return total;
    if (!Number.isFinite(set.actualReps) || !Number.isFinite(set.weight)) return total;
    return total + set.actualReps * set.weight;
  }, 0);
}

/** The heaviest completed working set, or null when nothing was weighted. */
export function topWorkingWeight(sets: readonly VolumeSet[]) {
  const weights = sets
    .filter(set => set.setType === "working" && set.completed && set.weight !== null)
    .map(set => Number(set.weight));
  return weights.length > 0 ? Math.max(...weights) : null;
}

/** The diary line one finished workout writes: "VASA Cycle 1, Week 1, Workout 1". */
export function sessionTitle(session: {
  programNameSnapshot?: string | null;
  templateNameSnapshot: string;
  cycleNumberSnapshot?: number | null;
  weekNumberSnapshot?: number | null;
  workoutNumberSnapshot?: number | null;
}) {
  const parts: string[] = [];
  if (session.cycleNumberSnapshot) parts.push(`Cycle ${session.cycleNumberSnapshot}`);
  if (session.weekNumberSnapshot) parts.push(`Week ${session.weekNumberSnapshot}`);
  if (session.workoutNumberSnapshot) parts.push(`Workout ${session.workoutNumberSnapshot}`);
  const program = session.programNameSnapshot ?? "";
  const position = parts.join(", ");
  if (program && position) return `${program} — ${position}`;
  return program || position || session.templateNameSnapshot;
}

/**
 * The short program name used in the activity diary, so a diary line reads
 * "Strength Training – VASA Cycle 1, Week 1, Workout 1" rather than carrying
 * the program's full title twice.
 */
export function diaryActivityName(session: {
  programNameSnapshot?: string | null;
  templateNameSnapshot: string;
  cycleNumberSnapshot?: number | null;
  weekNumberSnapshot?: number | null;
  workoutNumberSnapshot?: number | null;
}) {
  const program = (session.programNameSnapshot ?? "").replace(/\s+Four-Week Fitness Program$/i, "");
  const parts: string[] = [];
  if (program) parts.push(program);
  if (session.cycleNumberSnapshot) parts.push(`Cycle ${session.cycleNumberSnapshot}`);
  if (session.weekNumberSnapshot) parts.push(`Week ${session.weekNumberSnapshot}`);
  if (session.workoutNumberSnapshot) parts.push(`Workout ${session.workoutNumberSnapshot}`);
  const position = parts.join(", ");
  return position ? `Strength Training – ${position}` : `Strength Training – ${session.templateNameSnapshot}`;
}

/** Target line for one prescribed exercise: "3 × 12" or "20 min". */
export function targetLabel(exercise: {
  measurementTypeSnapshot?: string;
  measurementType?: string;
  targetSetsSnapshot?: number | null;
  targetSets?: number | null;
  targetRepsSnapshot?: number | null;
  targetReps?: number | null;
  targetDurationSnapshot?: number | null;
  targetDurationMinutes?: number | null;
  targetInclineSnapshot?: number | null;
  targetIncline?: number | null;
  isPerSideSnapshot?: number | boolean;
  isPerSide?: number | boolean;
}) {
  const measurement = exercise.measurementTypeSnapshot ?? exercise.measurementType ?? "reps_weight";
  const sets = exercise.targetSetsSnapshot ?? exercise.targetSets ?? null;
  const reps = exercise.targetRepsSnapshot ?? exercise.targetReps ?? null;
  const duration = exercise.targetDurationSnapshot ?? exercise.targetDurationMinutes ?? null;
  const incline = exercise.targetInclineSnapshot ?? exercise.targetIncline ?? null;
  const perSide = Boolean(exercise.isPerSideSnapshot ?? exercise.isPerSide ?? false);
  const bits: string[] = [];
  if (usesReps(measurement)) {
    if (sets !== null && reps !== null) bits.push(`${sets} × ${reps}${perSide ? " each side" : ""}`);
    else if (sets !== null) bits.push(`${sets} sets`);
    else if (reps !== null) bits.push(`${reps} reps${perSide ? " each side" : ""}`);
  } else if (usesCardio(measurement)) {
    if (duration !== null) bits.push(`${duration} min`);
    if (incline !== null) bits.push(`${incline}% incline`);
  }
  // A blank source cell stays blank rather than being shown as a zero target.
  return bits.length > 0 ? bits.join(" · ") : "No target given";
}
