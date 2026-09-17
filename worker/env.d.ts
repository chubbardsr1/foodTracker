/**
 * Types the `cloudflare:workers` module's `env` export against this Worker's
 * actual bindings, so API route handlers get real typing instead of casting
 * through `unknown`. Kept separate from the full Cloudflare runtime type
 * bundle (`wrangler types`), which redeclares `Request`/`Response` globally
 * and breaks `dom`-lib typing for client-side `fetch().json()` calls used
 * throughout the React components in this codebase.
 */
interface Env {
  DB: import("@cloudflare/workers-types").D1Database
  GEMINI_API_KEY: string
  GEMINI_MODEL?: string
}

declare module "cloudflare:workers" {
  export const env: Env
}
