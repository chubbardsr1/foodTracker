/**
 * Gemini-backed nutrition estimate for a typed or dictated meal description.
 *
 * The API key is read only from the Worker environment (`.dev.vars` locally,
 * a Cloudflare secret in production) and never reaches the browser. The meal
 * description is not logged anywhere.
 */
import { coerceFatBreakdown, fatSubtypeLabels, fatSubtypesOverTotal } from "../../nutrition"
import {
  askGemini, clean, cleanList, failureStatus, geminiKey,
  safeNumber, type GeminiFailure,
} from "../gemini"

const MAX_DESCRIPTION = 1500

// Upper bounds for a single described meal. Anything past these is treated as
// a bad answer rather than shown to the user.
const CALORIE_CAP = 20000
const GRAM_CAP = 2000

const SYSTEM_INSTRUCTION = `You estimate nutrition for a meal a person describes. Your output is an estimate. It is never exact, never medically verified, and never medical advice.

Return ONE JSON object covering the ENTIRE described meal as a single serving. No Markdown, no code fences, no commentary outside the JSON.

Rules:
- Respect the exact quantities the user gives.
- When the user states both a per-item quantity and a combined total (for example "1.5 patties, each patty 4 oz, for 6 oz total"), that is one quantity expressed two ways. Count it once. Never add the per-item figure and the total together.
- Use commonly accepted nutrition values when exact product information is unavailable.
- Put every meaningful assumption in "assumptions": leanness of ground beef, cooked versus raw weight, the size of a cheese slice, the size of a standard vegetable serving, any cooking fat you assumed, and similar.
- "calories", "protein", "fat", "carbs" and "fiber" must be plain numbers for the whole meal as one serving: calories in kcal, the rest in grams. Never strings. Never negative. Never null.
- "fat" is total fat and remains the primary fat figure.
- "saturatedFat", "transFat", "monounsaturatedFat" and "polyunsaturatedFat" break that total fat down, in grams. Give a number only where you can reasonably determine it. Return null for any subtype you cannot. Never a string, never negative.
- These four are not required to add up to "fat". Real labels omit subtypes and round each line separately, and some fat is not reported as any subtype. Never invent, pad, or adjust a subtype so the four reach the total, and never lower the total to match them.
- Returning null is always better than guessing. A subtype you are confident is genuinely absent, such as trans fat in a plain vegetable, may be 0.
- For homemade or restaurant food you may give reasonable subtype estimates from the ingredients, but never present a guess as a label value.
- No single subtype may be larger than "fat".
- Do not include sodium, sugar, cholesterol, or any other nutrient.
- "foodName": a short useful name for the meal, at most 60 characters. Not a list of every ingredient.
- "serving": a short phrase describing what one serving covers, such as "entire described meal".
- "confidence": exactly one of "low", "medium", "high".
- "warnings": short cautions. Add one when the description is vague enough that the estimate could be well off.
- If the description does not carry enough information for a reasonable estimate, or is not food, set "needsMoreInfo" to true and put a specific question in "warnings" naming exactly which quantity or serving size you need. In that case return 0 for every numeric field.
- Otherwise set "needsMoreInfo" to false.`

const responseSchema = {
  type: "OBJECT",
  properties: {
    foodName: { type: "STRING" },
    serving: { type: "STRING" },
    calories: { type: "NUMBER" },
    protein: { type: "NUMBER" },
    fat: { type: "NUMBER" },
    // Nullable on purpose: the model is told to answer null rather than guess,
    // and null travels all the way through as "not available".
    saturatedFat: { type: "NUMBER", nullable: true },
    transFat: { type: "NUMBER", nullable: true },
    monounsaturatedFat: { type: "NUMBER", nullable: true },
    polyunsaturatedFat: { type: "NUMBER", nullable: true },
    carbs: { type: "NUMBER" },
    fiber: { type: "NUMBER" },
    assumptions: { type: "ARRAY", items: { type: "STRING" } },
    confidence: { type: "STRING", enum: ["low", "medium", "high"] },
    warnings: { type: "ARRAY", items: { type: "STRING" } },
    needsMoreInfo: { type: "BOOLEAN" },
  },
  required: [
    "foodName",
    "serving",
    "calories",
    "protein",
    "fat",
    "saturatedFat",
    "transFat",
    "monounsaturatedFat",
    "polyunsaturatedFat",
    "carbs",
    "fiber",
    "assumptions",
    "confidence",
    "warnings",
    "needsMoreInfo",
  ],
  propertyOrdering: [
    "foodName",
    "serving",
    "calories",
    "protein",
    "fat",
    "saturatedFat",
    "transFat",
    "monounsaturatedFat",
    "polyunsaturatedFat",
    "carbs",
    "fiber",
    "assumptions",
    "confidence",
    "warnings",
    "needsMoreInfo",
  ],
}

const failureMessages: Record<GeminiFailure, string> = {
  "rate-limit":
    "The meal assistant is busy right now. Wait a moment and try again, or enter the nutrition yourself.",
  auth: "The meal assistant could not authenticate with Google. Check the server configuration.",
  unavailable:
    "Google's meal assistant is unavailable right now. Enter the nutrition yourself and it will still save.",
  blocked:
    "The assistant would not answer that description. Try rewording it, or enter the nutrition yourself.",
  empty: "The assistant returned an empty answer. Try again, or enter the nutrition yourself.",
  malformed:
    "The assistant returned an answer this app could not read. Try rewording your description.",
  timeout:
    "The meal assistant took too long to answer. Try again, or enter the nutrition yourself.",
}

export async function POST(request: Request) {
  const key = geminiKey()
  if (!key) {
    return Response.json(
      {
        error:
          "The meal assistant is not set up on this server yet. The other ways to add food still work.",
      },
      { status: 503 },
    )
  }

  let description = ""
  try {
    const payload = (await request.json()) as { description?: unknown }
    description = String(payload.description ?? "").trim()
  } catch {
    return Response.json(
      { error: "That request could not be read. Try again." },
      { status: 400 },
    )
  }
  if (!description) {
    return Response.json(
      { error: "Describe your meal first, then tap Estimate Nutrition." },
      { status: 400 },
    )
  }
  if (description.length > MAX_DESCRIPTION) {
    return Response.json(
      {
        error: `That description is too long. Keep it under ${MAX_DESCRIPTION} characters.`,
      },
      { status: 400 },
    )
  }

  const result = await askGemini(key, {
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt: description,
    responseSchema,
    maxOutputTokens: 1400,
  })
  if (!result.ok) {
    return Response.json(
      { error: failureMessages[result.failure] },
      { status: failureStatus[result.failure] },
    )
  }

  const parsed = result.data
  const warnings = cleanList(parsed.warnings, 6)
  if (parsed.needsMoreInfo === true) {
    return Response.json({
      needsDetail: true,
      message:
        warnings[0] ??
        "There is not enough detail to estimate this. Add the amounts or serving sizes and try again.",
      warnings,
    })
  }

  const numbers = {
    calories: safeNumber(parsed.calories, CALORIE_CAP),
    protein: safeNumber(parsed.protein, GRAM_CAP),
    fat: safeNumber(parsed.fat, GRAM_CAP),
    carbs: safeNumber(parsed.carbs, GRAM_CAP),
    fiber: safeNumber(parsed.fiber, GRAM_CAP),
  }
  const foodName = clean(parsed.foodName, 80)
  // A missing or out-of-range value is never quietly turned into a zero.
  if (
    !foodName
    || numbers.calories === null || numbers.protein === null || numbers.fat === null
    || numbers.carbs === null || numbers.fiber === null
  ) {
    return Response.json({
      needsDetail: true,
      message:
        "The assistant could not produce a complete estimate for that description. Add the amounts or serving sizes and try again.",
      warnings,
    })
  }

  // The four fat subtypes are optional. A field the model omitted, answered as
  // null, or answered badly is left unknown rather than turned into a zero, so
  // an answer without them is still a complete estimate.
  const fatDetail = coerceFatBreakdown(parsed, GRAM_CAP)
  // A subtype larger than total fat cannot be right. It is dropped back to
  // unknown and called out, rather than refusing the whole estimate. The four
  // are never adjusted to add up to the total.
  const impossible = fatSubtypesOverTotal(numbers.fat, fatDetail)
  for (const key of impossible) fatDetail[key] = null
  const fatNotes = impossible.length === 0 ? [] : [
    `${impossible.map((key) => fatSubtypeLabels[key]).join(", ")} came back higher than the total fat, so `
    + `${impossible.length === 1 ? "it was" : "they were"} left blank. Fill in the real value if you have it.`,
  ]

  const confidence = ["low", "medium", "high"].includes(String(parsed.confidence))
    ? String(parsed.confidence)
    : "low"
  return Response.json({
    estimate: {
      foodName,
      serving: clean(parsed.serving, 80) || "entire described meal",
      calories: numbers.calories,
      protein: numbers.protein,
      fat: numbers.fat,
      ...fatDetail,
      carbs: numbers.carbs,
      fiber: numbers.fiber,
      assumptions: cleanList(parsed.assumptions, 8),
      confidence,
      warnings: [...warnings, ...fatNotes],
    },
    model: result.model,
  })
}
