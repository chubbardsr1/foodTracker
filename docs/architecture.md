# Implementation map

This is a small private application, not a generic SaaS platform. Retain its
existing structure until a concrete task benefits from a small extraction.

| Area | Starting points |
| --- | --- |
| Main diary, forms, navigation | `app/food-tracker.tsx`, `app/page.tsx` |
| Styling and shared types | `app/globals.css`, `app/shared.ts` |
| Nutrition, percentages, nullable fats | `app/nutrition.ts` |
| Diary date operations and copied recap | `app/diary-actions.ts`, `app/day-recap.ts` |
| Weight graph | `app/weight-chart.tsx` |
| Workouts UI and common behavior | `app/workouts.tsx`, `app/workout-shared.ts` |
| Workout persistence and routes | `app/api/workouts/` |
| Diary, goals, water, steps, weight, journal, reports | Corresponding folders under `app/api/` |
| Profile selection | `app/api/profile.ts` |
| Gemini meal/activity estimates | `app/api/gemini.ts`, `app/api/estimate/`, `app/api/estimate-activity/`, `app/api/activity.ts` |
| Barcode lookup | `app/api/barcode/route.ts` |
| Export data and browser PDF generation | `app/api/export/`, `app/export-*.ts`, `app/export-panel.tsx` |
| Schema and database binding | `db/schema.ts`, `db/index.ts` |
| Worker and build configuration | `worker/index.ts`, `vite.config.ts`, `wrangler.local.jsonc` |
| Regression checks | `tests/unit/`, `tests/support/`, `tests/rendered-html.test.mjs` |

Gemini meal and activity assistance, barcode entry, weight charts, journals,
reports, PDF/JSON exports, and structured workouts already have implementations.
Do not rebuild these merely because an old note calls them planned. `ToDo.md`
mixes feature history and future ideas; inspect code to establish current scope.

Cloudflare Access gates the deployed site. The app currently chooses an owner
from the `x-food-tracker-profile` header (chris/sarah, default chris). This is
profile selection, not verified per-person authorization. Keep owner scoping on
every personal query; do not claim that the header proves the logged-in identity.
A stronger identity model requires its own explicitly scoped change.

Use code and tests for implementation facts; use `Push to Production.md` for
recorded deployment state. Local migration files alone do not establish what
has run remotely. Historical patches, exports, generated output, and old findings
are not default context. Read them only when the task requires them.
