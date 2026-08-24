/**
 * Shared plumbing for the Gemini-backed assistants.
 *
 * The API key is read only from the Worker environment (`.dev.vars` locally, a
 * Cloudflare secret in production). It never reaches the browser, is never
 * logged, and is never repeated back in an error message. Only the free-tier
 * `generateContent` endpoint is used: no grounding, no tools, no billing.
 */
import { env } from "cloudflare:workers"

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"
const DEFAULT_MODEL = "gemini-3.5-flash-lite"
// Used only if the primary model name is rejected, so a model rename upstream
// degrades to a working estimate instead of a dead feature.
const FALLBACK_MODEL = "gemini-3.1-flash-lite"
const TIMEOUT_MS = 20000

/** Collapses whitespace onto one line and caps the length. */
export const clean = (value: unknown, max: number) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)

/**
 * Same cap, but paragraph breaks survive. Used for anything shown in a
 * textarea, where the user dictated real line breaks.
 */
export const cleanMultiline = (value: unknown, max: number) =>
  String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, max)

export function cleanList(value: unknown, maxItems: number, maxLength = 240) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => clean(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

/** Numbers must be finite and inside a believable range, or they are refused. */
export function safeNumber(value: unknown, cap: number, floor = 0) {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < floor || parsed > cap) return null
  return Math.round(parsed * 100) / 100
}

export const geminiKey = () =>
  (env as unknown as { GEMINI_API_KEY?: string }).GEMINI_API_KEY ?? ""

/** Everything that can go wrong, so each feature can word its own message. */
export type GeminiFailure =
  | "rate-limit"
  | "auth"
  | "unavailable"
  | "blocked"
  | "empty"
  | "malformed"
  | "timeout"

export type GeminiResult =
  | { ok: true; data: Record<string, unknown>; model: string }
  | { ok: false; failure: GeminiFailure }

type GeminiReply = {
  candidates?: {
    content?: { parts?: { text?: string }[] }
    finishReason?: string
  }[]
  promptFeedback?: { blockReason?: string }
}

type AskOptions = {
  systemInstruction: string
  prompt: string
  responseSchema: Record<string, unknown>
  maxOutputTokens: number
  temperature?: number
}

function post(model: string, key: string, options: AskOptions, signal: AbortSignal) {
  return fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: options.systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: options.prompt }] }],
      generationConfig: {
        // Low, so the same description gives the same answer twice running.
        temperature: options.temperature ?? 0.1,
        topP: 0.9,
        maxOutputTokens: options.maxOutputTokens,
        responseMimeType: "application/json",
        responseSchema: options.responseSchema,
      },
    }),
  })
}

/**
 * Asks Gemini for one structured JSON object.
 *
 * Returns the parsed object, or a failure kind. Nothing about the key or the
 * upstream error body is ever passed back to the caller.
 */
export async function askGemini(key: string, options: AskOptions): Promise<GeminiResult> {
  const configured = (env as unknown as { GEMINI_MODEL?: string }).GEMINI_MODEL
  const primary = clean(configured, 60) || DEFAULT_MODEL
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    let model = primary
    let response = await post(model, key, options, controller.signal)
    if ((response.status === 404 || response.status === 400) && primary !== FALLBACK_MODEL) {
      model = FALLBACK_MODEL
      response = await post(model, key, options, controller.signal)
    }

    if (response.status === 429) return { ok: false, failure: "rate-limit" }
    if (response.status === 401 || response.status === 403) return { ok: false, failure: "auth" }
    if (!response.ok) return { ok: false, failure: "unavailable" }

    const reply = (await response.json()) as GeminiReply
    if (reply.promptFeedback?.blockReason) return { ok: false, failure: "blocked" }

    const text =
      reply.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? ""
    if (!text.trim()) return { ok: false, failure: "empty" }

    try {
      const parsed = JSON.parse(text) as unknown
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, failure: "malformed" }
      }
      return { ok: true, data: parsed as Record<string, unknown>, model }
    } catch {
      return { ok: false, failure: "malformed" }
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError"
    return { ok: false, failure: timedOut ? "timeout" : "unavailable" }
  } finally {
    clearTimeout(timer)
  }
}

/** HTTP status for each failure, kept the same across both assistants. */
export const failureStatus: Record<GeminiFailure, number> = {
  "rate-limit": 429,
  auth: 502,
  unavailable: 502,
  blocked: 422,
  empty: 502,
  malformed: 502,
  timeout: 504,
}
