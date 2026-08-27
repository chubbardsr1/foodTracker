# Push Code to Production

Run from `D:\webserver\foodTracker`.

Apply any new migration to the remote D1 database first, then deploy the code.

# Push new SQL

npx wrangler d1 execute food-tracker-db --remote --file=.\drizzle\<migration-file>.sql

Migrations already applied to production - never rerun these:

- 0000_short_centennial.sql
- 0001_profiles_water_custom_foods.sql
- 0002_fiber_exercise.sql
- 0003_water_shortcuts.sql (per-profile water shortcut buttons, plus report
  indexes on food_entries and exercise_entries)
- 0004_custom_food_barcodes.sql (barcode column on custom_foods, plus a
  unique index per owner and barcode)
- 0005_daily_calorie_goals.sql (daily_goals table holding the calorie goal
  that applied on each day, for the Calendar)
- 0006_weight_journal.sql (weight_entries table for the Weight log and
  journal_entries table for the daily Journal, each with a unique index on
  the owner and the date)
- 0007_steps.sql (step_entries table for the manually entered daily step
  count, with a unique index on the owner and the date so a day can only
  ever hold one total, plus an owner-and-date index on water_entries for the
  export range queries)
- 0008_exercise_comments.sql (comments column on exercise_entries for the
  optional detailed activity notes; additive, existing rows pick up an empty
  comment and keep every other value)
- 0009_fat_breakdown.sql (saturated_fat, trans_fat, monounsaturated_fat, and
  polyunsaturated_fat columns on food_entries and custom_foods; additive and
  nullable with no default, so every existing diary entry and saved food keeps
  all of its values and carries an unknown breakdown until it is edited)

Not yet applied to production:

- None. The next new migration starts at 0010_ and goes in the list above once
  it has been run against the remote database.

# One-time secret setup - NOT part of a routine code push

The meal assistant and the activity assistant share one Google Gemini API key
stored as a Cloudflare secret. Run this once, and again only if the key is ever rotated. Wrangler
prompts for the value, so the key never appears in a command line or a file:

npx wrangler secret put GEMINI_API_KEY --name food-tracker

For local development the same key goes in `.dev.vars`, which Git ignores.
Copy `.dev.vars.example` to `.dev.vars` and fill it in.

# Dependencies

The barcode scanner and the PDF export need their npm packages present
before a build or deploy. Run this once after pulling these changes:

npm install

`jspdf` is the new dependency. It builds the export PDF in the browser and is
loaded on demand, so it never runs on the Worker and costs nothing.

# Push Code

npm run deploy
