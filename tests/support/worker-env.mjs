/**
 * Stand-in for Cloudflare's `cloudflare:workers` module.
 *
 * The resolver hook in `tests/ts-resolver.mjs` points that specifier here, so a
 * route handler can be exercised under `node --test`. A test puts its own D1
 * stand-in on `env.DB` before importing the route; nothing else is provided,
 * because nothing else is read outside the Worker.
 */
export const env = {};
