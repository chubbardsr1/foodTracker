# BMR/TDEE panel on the Weight tab

Status: In progress

## Outcome and scope

Chris (and Sarah, per-profile) can enter age, height, and gender once in
Settings, and the Weight tab shows a collapsed-by-default panel with their
current BMR and an approximate TDEE. TDEE always shows all five standard
activity-level multipliers, defaulting the visible selection to "Moderately
active"; the selection is a display choice only and is not saved.

Out of scope: historical BMR/TDEE snapshots, a compound feet+inches height
input, and any change to the existing weight-logging flow itself.

## Evidence and decisions

- Per-profile settings already live in `nutrition_goals` (`db/schema.ts`),
  edited by `SettingsEditor` in `app/food-tracker.tsx` and saved through
  `PUT /api/goals`. Age, height, and gender are added as three new nullable
  columns on that same table rather than a new table, since they are
  per-profile settings like everything else edited from the gear icon.
- `app/api/entries/route.ts` already returns every `nutrition_goals` column as
  `goals`, so the new columns reach the browser with no route change beyond
  the schema.
- Height is stored in inches (a single number field), matching the app's
  existing all-imperial UI (`pounds` for weight, `oz` for water). The BMR
  formula (Mifflin-St Jeor) needs kilograms and centimeters, so the
  conversion happens once in `app/nutrition.ts`, next to the other shared
  calculations, and nowhere else.
- BMR uses the most recent entry in `weight_entries` for that profile. If no
  weight has been logged, or age/height/gender is unset, the panel says so
  instead of guessing.
- Gender is free-standing (not reused from anything else) because nothing
  else in the schema records it; the formula only defines a male and a female
  offset, so the field is a two-value enum.
- No material open questions: the activity-level factor table was supplied in
  full by Chris, and defaulting the visible TDEE selection to "Moderately
  active" without persisting it is a routine display choice.

## Implementation slices

1. **Schema**: add `age` (integer, nullable), `height_inches` (real,
   nullable), `gender` (text, nullable) to `nutrition_goals` in
   `db/schema.ts`, plus migration `drizzle/0013_body_metrics.sql`.
2. **Shared calculation**: `app/nutrition.ts` gains `ACTIVITY_LEVELS`,
   `DEFAULT_ACTIVITY_LEVEL`, `bmrFrom`, `tdeeFrom`, and `readBodyMetrics`
   (validates age/height/gender the same way `readOptionalGrams` validates a
   goal: blank stays null, an out-of-range or malformed value is refused).
3. **API**: `app/api/goals/route.ts` PUT reads and stores the three new
   fields with `readBodyMetrics`, alongside the existing goals.
4. **Settings UI**: `SettingsEditor` gets an "Age, height, and gender" field
   group (all optional) below the existing goal fields.
5. **Weight tab UI**: `WeightPage` receives the loaded `goals` as a prop, adds
   a collapsed `<details>` panel showing BMR and a TDEE table (all five
   activity levels, "Moderately active" open by default), using the most
   recent logged weight.
6. **Production migration script**: `drizzle/0013_body_metrics.sql` plus a
   ledger entry in `Push to Production.md`, to run only on Chris's explicit
   instruction.

## Data and risk

Additive and forward-only; no existing column is altered, dropped, or
renamed. All three new columns are nullable with no default, so every
existing profile's row keeps every current value and reads as "not set"
until Chris or Sarah enters it — the panel shows a prompt to finish Settings
rather than a computed zero. Nothing is derived from a stale weight reading
without saying which date it came from.

Migration:
1. `drizzle/0013_body_metrics.sql` — additive `ALTER TABLE` only, no data
   rewritten.

Local verification: apply the migration to the local D1 database and confirm
`PRAGMA table_info(nutrition_goals)` shows the three columns before relying on
the app to read them.

Production: Chris runs
`npx wrangler d1 execute food-tracker-db --remote --file=.\drizzle\0013_body_metrics.sql`
himself, then deploys, per `docs/standards/database-release.md`. Not run by
Claude Code.

## Verification

- Unit: a new BMR/TDEE calculation test (male and female, known inputs
  against the published formula) and an extension of
  `tests/unit/goal-settings.test.mjs` covering save/read/blank/invalid for
  age, height, and gender, plus the new migration's column shape.
- Manual (phone width): open Settings, set age/height/gender, save, open the
  Weight tab, expand the panel, confirm the BMR/TDEE numbers, collapse it,
  switch profile and confirm the panel reflects that profile's own settings
  and weight.

## Handoff

Completed: schema, shared BMR/TDEE calculation, goals API validation,
Settings fields, and the collapsed Weight-tab panel. Unit suite (216 tests)
and `tsc --noEmit` both pass.

Migration `0013_body_metrics.sql` is applied to the **local** D1 database
only (`PRAGMA table_info(nutrition_goals)` confirms `age`, `height_inches`,
and `gender`, all nullable, every existing column unchanged). Not applied to
production — that step, plus deploy, is still Chris's call per
`docs/standards/database-release.md`.

Migration `0013_body_metrics.sql` is applied to production (confirmed via
`PRAGMA table_info(nutrition_goals)`), the code is committed to `working`
(b025d8a) and pushed to GitHub, and `npm run deploy` has shipped it to
production (food-tracker, version d53fa24f-c59a-4379-ae1b-90b5334b3b0a).

While confirming production status, found migrations 0010, 0011, and 0012
already live on production even though `Push to Production.md` still listed
them as pending — ledger corrected to match observed reality; see the note
there.

Not yet done: a manual phone-width pass (Settings save, Weight tab expand,
switch profile) hasn't been run in a browser this session.
