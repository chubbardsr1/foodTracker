/**
 * Rules shared by the activity log and the activity assistant.
 *
 * Both the manual form and the Gemini estimate have to agree on what a valid
 * activity looks like, and both need the same answer to "which weight applies
 * to this day", so those live here rather than in one route.
 */
import { and, desc, eq, lte } from "drizzle-orm"
import type { getDb } from "../../db"
import { weightEntries } from "../../db/schema"

export const MAX_ACTIVITY_NAME = 100
export const MAX_ACTIVITY_MINUTES = 1440
export const MAX_ACTIVITY_CALORIES = 10000
/** Long enough for a full gym write-up, short enough to stay a comment. */
export const MAX_ACTIVITY_COMMENTS = 2000

/** Pounds to kilograms, for the MET formula. */
export const POUNDS_TO_KG = 0.45359237

/**
 * Tidies a multiline comment without flattening it.
 *
 * Line breaks are what makes a dictated workout readable, so they survive;
 * only runs of spaces, stray carriage returns, and long blank stretches go.
 */
export function cleanComments(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_ACTIVITY_COMMENTS)
}

type Db = ReturnType<typeof getDb>

export type WeightForDate = {
  pounds: number
  weighedOn: string
  /** True when nothing was recorded on or before the activity date. */
  fallback: boolean
} | null

/**
 * The weight to calculate an activity against: the owner's most recent reading
 * on or before that date, falling back to their earliest later reading if the
 * log only started afterwards.
 *
 * Always scoped by owner, so Chris's weight can never be used for Sarah.
 */
export async function weightForDate(db: Db, owner: string, date: string): Promise<WeightForDate> {
  const [onOrBefore] = await db
    .select({ pounds: weightEntries.pounds, weighedOn: weightEntries.weighedOn })
    .from(weightEntries)
    .where(and(eq(weightEntries.owner, owner), lte(weightEntries.weighedOn, date)))
    .orderBy(desc(weightEntries.weighedOn))
    .limit(1)
  if (onOrBefore) {
    return { pounds: Number(onOrBefore.pounds), weighedOn: onOrBefore.weighedOn, fallback: false }
  }

  const [latest] = await db
    .select({ pounds: weightEntries.pounds, weighedOn: weightEntries.weighedOn })
    .from(weightEntries)
    .where(eq(weightEntries.owner, owner))
    .orderBy(desc(weightEntries.weighedOn))
    .limit(1)
  if (latest) {
    return { pounds: Number(latest.pounds), weighedOn: latest.weighedOn, fallback: true }
  }
  return null
}

/** The standard MET formula: calories = MET x 3.5 x kg / 200 x minutes. */
export function metCalories(met: number, weightPounds: number, minutes: number) {
  return (met * 3.5 * (weightPounds * POUNDS_TO_KG)) / 200 * minutes
}
