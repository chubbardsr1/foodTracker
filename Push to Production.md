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

Not yet applied to production - run these in order, oldest first:

- 0010_saturated_fat_goal.sql (optional saturated_fat column on
  nutrition_goals; additive and nullable with no default, so neither profile's
  existing goals change and "no saturated-fat goal" stays distinct from a goal
  of zero. There is still no total-carbohydrate goal.)

- 0011_workout_programs.sql (nine new tables for workout programs and strength
  training: exercise_library, workout_programs, workout_program_weeks,
  workout_templates, workout_template_exercises, workout_program_cycles,
  workout_sessions, workout_session_exercises, and workout_sets. Purely
  additive - no existing table is altered, and the food diary, activity diary,
  water, steps, weight, and journal tables are untouched. The VASA program
  itself is not in this migration: it is imported by the application the first
  time the Workouts page is opened, and that import is idempotent, so nothing
  extra needs running for it. No cycle is created by the migration or the
  import.)

- 0012_net_carb_goal_range.sql (net_carbs_min and net_carbs_max columns on
  nutrition_goals for the minimum and maximum net-carbohydrate goal. Additive:
  no column is dropped or renamed. The original net_carbs column stays and is
  from now on written with the same value as net_carbs_max, because a single
  net-carb goal has always meant a ceiling and every export, PDF, and older
  read path understands that column. The migration's UPDATE maps each existing
  goal onto the maximum and starts the minimum at 0, so nobody's stored goal is
  discarded and both profiles behave exactly as they did until a real range is
  saved. There is still no total-carbohydrate goal.)

Verify a migration landed before deploying the code that needs it. These are
read-only:

npx wrangler d1 execute food-tracker-db --remote --command "PRAGMA table_info(nutrition_goals);"

npx wrangler d1 execute food-tracker-db --remote --command "PRAGMA table_info(food_entries);"

npx wrangler d1 execute food-tracker-db --remote --command "select name from sqlite_master where type='table' and (name like 'workout%' or name='exercise_library') order by name;"

After 0012, this must show net_carbs_min and net_carbs_max alongside the
original net_carbs, and every existing row's net_carbs_max must equal its
net_carbs:

npx wrangler d1 execute food-tracker-db --remote --command "select owner, net_carbs, net_carbs_min, net_carbs_max from nutrition_goals;"

# Starting the first VASA cycle in production - one time, from the app

The migration and the deploy leave the VASA program present but with no cycle,
which is deliberate: a cycle belongs to one profile and needs a start date that
was chosen rather than assumed. To start Chris's first cycle after deploying,
open the site as Chris, go to Workouts, press "Start Cycle 1", and confirm the
proposed start date of Monday, 31 August 2026. That gives Cycle 1 running
through Sunday, 27 September 2026. Sarah's profile stays without a cycle until
she starts her own. Nothing recorded before a cycle's start date counts toward
it.

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
