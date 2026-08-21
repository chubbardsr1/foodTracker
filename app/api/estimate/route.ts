/**
 * Gemini-backed nutrition estimate for a typed or dictated meal description.
 *
 * The API key is read only from the Worker environment (`.dev.vars` locally,
 * a Cloudflare secret in production) and never reaches the browser. The meal
 * description is not logged anywhere.
 */
import { env } from "cloudflare:workers";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
// Used only if the primary model name is rejected, so a model rename upstream
// degrades to a working estimate instead of a dead feature.
const FALLBACK_MODEL = "gemini-2.5-flash-lite";
const MAX_DESCRIPTION = 1500;
const TIMEOUT_MS = 20000;

// Upper bounds for a single described meal. Anything past these is treated as
// a bad answer rather than shown to the user.
const CALORIE_CAP = 20000;
const GRAM_CAP = 2000;

const SYSTEM_INSTRUCTION = `You estimate nutrition for a meal a person describes. Your output is an estimate. It is never exact, never medically verified, and never medical advice.

Return ONE JSON object covering the ENTIRE described meal as a single serving. No Markdown, no code fences, no commentary outside the JSON.

Rules:
- Respect the exact quantities the user gives.
- When the user states both a per-item quantity and a combined total (for example "1.5 patties, each patty 4 oz, for 6 oz total"), that is one quantity expressed two ways. Count it once. Never add the per-item figure and the total together.
- Use commonly accepted nutrition values when exact product information is unavailable.
- Put every meaningful assumption in "assumptions": leanness of ground beef, cooked versus raw weight, the size of a cheese slice, the size of a standard vegetable serving, any cooking fat you assumed, and similar.
- "calories", "protein", "fat", "carbs" and "fiber" must be plain numbers for the whole meal as one serving: calories in kcal, the rest in grams. Never strings. Never negative. Never null.
- Do not include sodium, sugar, cholesterol, or any other nutrient.
- "foodName": a short useful name for the meal, at most 60 characters. Not a list of every ingredient.
- "serving": a short phrase describing what one serving covers, such as "entire described meal".
- "confidence": exactly one of "low", "medium", "high".
- "warnings": short cautions. Add one when the description is vague enough that the estimate could be well off.
- If the description does not carry enough information for a reasonable estimate, or is not food, set "needsMoreInfo" to true and put a specific question in "warnings" naming exactly which quantity or serving size you need. In that case return 0 for every numeric field.
- Otherwise set "needsMoreInfo" to false.`;

const responseSchema = {
  type: "OBJECT",
  properties: {
    foodName: { type: "STRING" },
    serving: { type: "STRING" },
    calories: { type: "NUMBER" },
    protein: { type: "NUMBER" },
    fat: { type: "NUMBER" },
    carbs: { type: "NUMBER" },
    fiber: { type: "NUMBER" },
    assumptions: { type: "ARRAY", items: { type: "STRING" } },
    confidence: { type: "STRING", enum: ["low", "medium", "high"] },
    warnings: { type: "ARRAY", items: { type: "STRING" } },
    needsMoreInfo: { type: "BOOLEAN" },
  },
  required: ["foodName", "serving", "calories", "protein", "fat", "carbs", "fiber", "assumptions", "confidence", "warnings", "needsMoreInfo"],
  propertyOrdering: ["foodName", "serving", "calories", "protein", "fat", "carbs", "fiber", "assumptions", "confidence", "warnings", "needsMoreInfo"],
};

type GeminiReply = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

const clean = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function cleanList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  return value.map(item => clean(item, 240)).filter(Boolean).slice(0, maxItems);
}

/** Numbers must be finite, non-negative, and within a believable range for one meal. */
function safeNumber(value: unknown, cap: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > cap) return null;
  return Math.round(parsed * 100) / 100;
}

async function askGemini(model: string, key: string, description: string, signal: AbortSignal) {
  return fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: "user", parts: [{ text: description }] }],
      generationConfig: {
        temperature: 0.1,
        topP: 0.9,
        maxOutputTokens: 1400,
        responseMimeType: "application/json",
        responseSchema,
      },
    }),
  });
}

export async function POST(request: Request) {
  const key = (env as unknown as { GEMINI_API_KEY?: string }).GEMINI_API_KEY;
  if (!key) {
    return Response.json({ error: "The meal assistant is not set up on this server yet. The other ways to add food still work." }, { status: 503 });
  }

  let description = "";
  try {
    const payload = await request.json() as { description?: unknown };
    description = String(payload.description ?? "").trim();
  } catch {
    return Response.json({ error: "That request could not be read. Try again." }, { status: 400 });
  }
  if (!description) {
    return Response.json({ error: "Describe your meal first, then tap Estimate Nutrition." }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION) {
    return Response.json({ error: `That description is too long. Keep it under ${MAX_DESCRIPTION} characters.` }, { status: 400 });
  }

  const configured = (env as unknown as { GEMINI_MODEL?: string }).GEMINI_MODEL;
  const primary = clean(configured, 60) || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let model = primary;
    let response = await askGemini(model, key, description, controller.signal);
    if ((response.status === 404 || response.status === 400) && primary !== FALLBACK_MODEL) {
      model = FALLBACK_MODEL;
      response = await askGemini(model, key, description, controller.signal);
    }

    if (response.status === 429) {
      return Response.json({ error: "The meal assistant is busy right now. Wait a moment and try again, or enter the nutrition yourself." }, { status: 429 });
    }
    if (response.status === 401 || response.status === 403) {
      return Response.json({ error: "The meal assistant could not authenticate with Google. Check the server configuration." }, { status: 502 });
    }
    if (!response.ok) {
      return Response.json({ error: "Google's meal assistant is unavailable right now. Enter the nutrition yourself and it will still save." }, { status: 502 });
    }

    const reply = await response.json() as GeminiReply;
    if (reply.promptFeedback?.blockReason) {
      return Response.json({ error: "The assistant would not answer that description. Try rewording it, or enter the nutrition yourself." }, { status: 422 });
    }

    const text = reply.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("") ?? "";
    if (!text.trim()) {
      return Response.json({ error: "The assistant returned an empty answer. Try again, or enter the nutrition yourself." }, { status: 502 });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "The assistant returned an answer this app could not read. Try rewording your description." }, { status: 502 });
    }

    const warnings = cleanList(parsed.warnings, 6);
    if (parsed.needsMoreInfo === true) {
      return Response.json({
        needsDetail: true,
        message: warnings[0] ?? "There is not enough detail to estimate this. Add the amounts or serving sizes and try again.",
        warnings,
      });
    }

    const numbers = {
      calories: safeNumber(parsed.calories, CALORIE_CAP),
      protein: safeNumber(parsed.protein, GRAM_CAP),
      fat: safeNumber(parsed.fat, GRAM_CAP),
      carbs: safeNumber(parsed.carbs, GRAM_CAP),
      fiber: safeNumber(parsed.fiber, GRAM_CAP),
    };
    const foodName = clean(parsed.foodName, 80);
    // A missing or out-of-range value is never quietly turned into a zero.
    if (!foodName || Object.values(numbers).some(value => value === null)) {
      return Response.json({
        needsDetail: true,
        message: "The assistant could not produce a complete estimate for that description. Add the amounts or serving sizes and try again.",
        warnings,
      });
    }

    const confidence = ["low", "medium", "high"].includes(String(parsed.confidence)) ? String(parsed.confidence) : "low";
    return Response.json({
      estimate: {
        foodName,
        serving: clean(parsed.serving, 80) || "entire described meal",
        calories: numbers.calories, protein: numbers.protein, fat: numbers.fat, carbs: numbers.carbs, fiber: numbers.fiber,
        assumptions: cleanList(parsed.assumptions, 8),
        confidence,
        warnings,
      },
      model,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return Response.json({
      error: timedOut
        ? "The meal assistant took too long to answer. Try again, or enter the nutrition yourself."
        : "The meal assistant could not be reached. Enter the nutrition yourself and it will still save.",
    }, { status: timedOut ? 504 : 502 });
  } finally {
    clearTimeout(timer);
  }
}
