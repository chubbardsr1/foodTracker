/**
 * Gemini-backed estimate for a typed or dictated workout description.
 *
 * Gemini only reads the description: it names the activity, splits it into
 * segments, and proposes a MET and a duration for each one. Every calorie
 * number is calculated here from the standard MET formula against the owner's
 * own recorded weight, so a hallucinated total can never reach the diary.
 *
 * Nothing is saved. The answer is handed back for the user to review, edit,
 * and then save through the normal activity form.
 *
 * The API key is read only from the Worker environment and never reaches the
 * browser, the logs, or an error message. The description is not logged.
 */
import { getDb } from "../../../db"
import {
  MAX_ACTIVITY_CALORIES, MAX_ACTIVITY_COMMENTS, MAX_ACTIVITY_MINUTES,
  cleanComments, metCalories, weightForDate,
} from "../activity"
import {
  askGemini, clean, cleanList, cleanMultiline, failureStatus, geminiKey,
  type GeminiFailure,
} from "../gemini"
import { profileFrom } from "../profile"

const MAX_DESCRIPTION = 2000
const MAX_SEGMENTS = 12
/** Sleeping is about 0.9; a hard sprint tops out near 23. Outside this is a bad answer. */
const MIN_MET = 0.9
const MAX_MET = 25
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

const SYSTEM_INSTRUCTION = `You read a description of a workout or activity and break it into the segments that were actually performed. Your output is an estimate, never exact and never medical advice.

Return ONE JSON object. No Markdown, no code fences, no commentary outside the JSON.

Time rules, which matter more than anything else:
- Distinguish total elapsed time (for example "at the gym from 6:03 to 6:38") from active exercise time. Elapsed time includes rest between sets, changing machines, and standing around.
- Never count the same minutes twice. If the user gives both an elapsed window and the individual pieces, the segments describe the pieces, not the window.
- Rest between sets is not an exercise segment. Either leave it out or give it its own low-MET segment; never fold it into a working segment at working intensity.
- Warmup and cooldown are their own segments, at their own intensity.
- "totalMinutes" must equal the sum of the "minutes" of every segment you return. Check this before answering.
- If a duration is not stated, estimate a reasonable one from what was described and say so in "assumptions". Do not invent precision that is not there.
- If there is no way to judge how long anything lasted, set "needsMoreInfo" to true and ask for the missing duration in "warnings".

Segment rules:
- "name": short, such as "Treadmill warmup" or "Barbell squats".
- "minutes": active minutes for that segment, a plain positive number.
- "met": the standard metabolic equivalent for that activity at that intensity, a plain number. Use the published compendium values you know: slow flat treadmill walking is near 3, brisk walking near 4.3, light resistance training near 3.5, vigorous free-weight training near 6, running 6 mph near 9.8.
- "intensity": exactly one of "light", "moderate", "vigorous".
- "assumptions": short notes specific to that segment, such as an assumed pace or an assumed rest ratio.
- Do NOT return calories anywhere. Calories are calculated from your MET values, not by you.

Other fields:
- "activityName": a short name for the whole session, at most 60 characters, such as "Gym: treadmill and weights".
- "cleanedComments": the user's own description tidied into readable plain text, keeping every concrete detail they gave (times, distances, weights, sets, reps, inclines). Do not add facts they did not state. Line breaks are fine. At most 1500 characters.
- "confidence": exactly one of "low", "medium", "high".
- "warnings": short cautions, such as when the intensity had to be guessed.
- "needsMoreInfo": true only when the description cannot support any reasonable duration estimate. When true, return an empty "segments" array and 0 for "totalMinutes".`

const responseSchema = {
  type: "OBJECT",
  properties: {
    activityName: { type: "STRING" },
    totalMinutes: { type: "NUMBER" },
    segments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          minutes: { type: "NUMBER" },
          met: { type: "NUMBER" },
          intensity: { type: "STRING", enum: ["light", "moderate", "vigorous"] },
          assumptions: { type: "STRING" },
        },
        required: ["name", "minutes", "met", "intensity", "assumptions"],
        propertyOrdering: ["name", "minutes", "met", "intensity", "assumptions"],
      },
    },
    cleanedComments: { type: "STRING" },
    assumptions: { type: "ARRAY", items: { type: "STRING" } },
    confidence: { type: "STRING", enum: ["low", "medium", "high"] },
    warnings: { type: "ARRAY", items: { type: "STRING" } },
    needsMoreInfo: { type: "BOOLEAN" },
  },
  required: [
    "activityName", "totalMinutes", "segments", "cleanedComments",
    "assumptions", "confidence", "warnings", "needsMoreInfo",
  ],
  propertyOrdering: [
    "activityName", "totalMinutes", "segments", "cleanedComments",
    "assumptions", "confidence", "warnings", "needsMoreInfo",
  ],
}

const failureMessages: Record<GeminiFailure, string> = {
  "rate-limit":
    "The activity assistant is busy right now. Wait a moment and try again, or fill the activity in yourself.",
  auth: "The activity assistant could not authenticate with Google. Check the server configuration.",
  unavailable:
    "Google's activity assistant is unavailable right now. Fill the activity in yourself and it will still save.",
  blocked:
    "The assistant would not answer that description. Try rewording it, or fill the activity in yourself.",
  empty: "The assistant returned an empty answer. Try again, or fill the activity in yourself.",
  malformed:
    "The assistant returned an answer this app could not read. Try rewording your description.",
  timeout:
    "The activity assistant took too long to answer. Try again, or fill the activity in yourself.",
}

/** Minutes: positive, believable, and no more than two decimal places. */
function validMinutes(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_ACTIVITY_MINUTES) return null
  return Math.round(parsed * 100) / 100
}

function validMet(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < MIN_MET || parsed > MAX_MET) return null
  return Math.round(parsed * 100) / 100
}

const roundTwo = (value: number) => Math.round(value * 100) / 100

export async function POST(request: Request) {
  const key = geminiKey()
  if (!key) {
    return Response.json(
      {
        error:
          "The activity assistant is not set up on this server yet. You can still enter the activity yourself.",
      },
      { status: 503 },
    )
  }

  let description = ""
  let exercisedOn = ""
  try {
    const payload = (await request.json()) as { description?: unknown; exercisedOn?: unknown }
    description = String(payload.description ?? "").trim()
    exercisedOn = String(payload.exercisedOn ?? "")
  } catch {
    return Response.json({ error: "That request could not be read. Try again." }, { status: 400 })
  }
  if (!isDate(exercisedOn)) {
    return Response.json({ error: "A valid activity date is required" }, { status: 400 })
  }
  if (!description) {
    return Response.json(
      { error: "Describe your activity first, then tap Estimate Activity." },
      { status: 400 },
    )
  }
  if (description.length > MAX_DESCRIPTION) {
    return Response.json(
      { error: `That description is too long. Keep it under ${MAX_DESCRIPTION} characters.` },
      { status: 400 },
    )
  }

  // The weight is looked up before Gemini is called, so a profile with no
  // weight logged is told what to do instead of burning a request.
  let weight
  try {
    weight = await weightForDate(getDb(), profileFrom(request), exercisedOn)
  } catch {
    return Response.json(
      { error: "Your weight log could not be read just now. Try again in a moment." },
      { status: 500 },
    )
  }
  if (!weight) {
    return Response.json({
      needsWeight: true,
      message:
        "Calories burned are worked out from your body weight, and you have not recorded one yet. Add a weight on the Weight page, then estimate this activity again.",
    })
  }

  const result = await askGemini(key, {
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt: description,
    responseSchema,
    maxOutputTokens: 2200,
  })
  if (!result.ok) {
    return Response.json(
      { error: failureMessages[result.failure] },
      { status: failureStatus[result.failure] },
    )
  }

  const parsed = result.data
  const warnings = cleanList(parsed.warnings, 6)
  const needMore = (message: string) =>
    Response.json({ needsDetail: true, message, warnings })

  if (parsed.needsMoreInfo === true) {
    return needMore(
      warnings[0] ??
        "There is not enough detail to estimate this. Say roughly how long each part lasted and try again.",
    )
  }

  const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : []
  if (rawSegments.length === 0 || rawSegments.length > MAX_SEGMENTS) {
    return needMore(
      "The assistant could not break that into activity segments. Say roughly how long each part lasted and try again.",
    )
  }

  const segments: {
    name: string; minutes: number; met: number; intensity: string
    assumptions: string; calories: number
  }[] = []
  for (const raw of rawSegments) {
    const item = (raw ?? {}) as Record<string, unknown>
    const minutes = validMinutes(item.minutes)
    const met = validMet(item.met)
    const name = clean(item.name, 60)
    if (!name || minutes === null || met === null) {
      return needMore(
        "The assistant returned an activity segment this app could not use. Try describing the workout again.",
      )
    }
    const intensity = ["light", "moderate", "vigorous"].includes(String(item.intensity))
      ? String(item.intensity)
      : "moderate"
    segments.push({
      name, minutes, met, intensity,
      assumptions: clean(item.assumptions, 200),
      calories: roundTwo(metCalories(met, weight.pounds, minutes)),
    })
  }

  // The segments are the source of truth for time, so the saved minutes always
  // equal what the calories were actually calculated from.
  const summedMinutes = roundTwo(segments.reduce((sum, item) => sum + item.minutes, 0))
  const claimedMinutes = validMinutes(parsed.totalMinutes)
  if (summedMinutes <= 0 || summedMinutes > MAX_ACTIVITY_MINUTES) {
    return needMore(
      "The assistant returned an unusable total time. Say roughly how long the activity lasted and try again.",
    )
  }
  // A small rounding gap is fine; a real disagreement means the answer was not
  // internally consistent and is refused rather than quietly corrected.
  if (
    claimedMinutes !== null &&
    Math.abs(claimedMinutes - summedMinutes) > Math.max(1, summedMinutes * 0.02)
  ) {
    return needMore(
      "The assistant's segments did not add up to the total time it reported. Try describing the workout again.",
    )
  }

  const totalCalories = roundTwo(segments.reduce((sum, item) => sum + item.calories, 0))
  if (!Number.isFinite(totalCalories) || totalCalories < 0 || totalCalories > MAX_ACTIVITY_CALORIES) {
    return needMore(
      "The calories worked out to something unbelievable for that description. Check the description and try again.",
    )
  }

  const activityName = clean(parsed.activityName, 60)
  if (!activityName) {
    return needMore(
      "The assistant could not name that activity. Try describing the workout again.",
    )
  }

  const confidence = ["low", "medium", "high"].includes(String(parsed.confidence))
    ? String(parsed.confidence)
    : "low"
  // Falls back to the user's own words if the tidy-up came back empty, so the
  // detail they dictated is never lost.
  const comments =
    cleanComments(cleanMultiline(parsed.cleanedComments, MAX_ACTIVITY_COMMENTS)) ||
    cleanComments(description)

  return Response.json({
    estimate: {
      activityName,
      totalMinutes: summedMinutes,
      totalCalories,
      comments,
      segments,
      assumptions: cleanList(parsed.assumptions, 8),
      confidence,
      warnings,
      weight: {
        pounds: roundTwo(weight.pounds),
        weighedOn: weight.weighedOn,
        fallback: weight.fallback,
      },
      formula: "calories = MET x 3.5 x weight in kg / 200 x minutes",
    },
    model: result.model,
  })
}
