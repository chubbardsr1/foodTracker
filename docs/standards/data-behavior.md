# Data behavior to preserve

## Profiles and history

- Scope personal reads, updates, and deletes by current owner, including exports
  and records reached through joins. Shared workout definitions are the intentional
  exception; do not confuse them with personal sessions and cycles.
- Diary entries snapshot nutrition. Editing/deleting a saved food must not rewrite
  historical entries. Editing a diary entry changes only that entry.
- Saved foods hold one full serving; fractional servings scale diary values.
  Preserve two-decimal nutrition precision and existing rounding behavior.
- A day's calorie goal is snapshotted when first recorded. Later settings changes
  do not rescore history; explicit correction of that day's goal remains possible.

## Nutrition and reports

- Net carbs are total carbs minus fiber. Reuse the implemented helpers and tests.
- Total fat is primary, never derived from its subtypes. Nullable fat subtypes
  distinguish unknown from recorded zero. Never fill unknowns with zero or force
  subtypes to sum to total fat.
- Distinguish percentage of calories from percentage of a goal. Calorie shares
  use 4/4/9 and are not normalized to 100%. Use total carbs for carbohydrate calorie
  share; label net-carb figures calorie-equivalent. Fiber uses its gram goal.
- Preserve the net-carb minimum/maximum range and legacy `net_carbs` compatibility:
  legacy `net_carbs` remains equal to `net_carbs_max` on writes.
- Average each report metric over its appropriate recorded days. Missing values
  are not zeros; a recorded step count of zero is still recorded. Preserve date
  range semantics and reuse shared calculations across UI, copy, and exports.
- Exercise calories are informational; do not increase the food-calorie allowance.
- Exports contain only the selected profile and omit internal IDs and secrets.

## Workouts

- Sessions snapshot their prescribed exercises, descriptions, videos, and targets.
  Editing/deleting a program or exercise must not rewrite a recorded workout.
- Create cycles only after the user explicitly starts one with a chosen start
  date. Never create cycles from migrations, seeds, or merely opening a page.
- Dates can recommend a week, never automatically complete a workout/week/cycle.
  Late or early workouts retain their original cycle and week.
- Repeated Start resumes an existing in-progress session. Finishing writes one
  linked `exercise_entries` record; re-finishing updates it rather than duplicating
  activity. Abandonment removes the linked entry according to existing behavior.
- Program imports remain idempotent; preserve prior performance across cycles.

Before changing these behaviors, identify the user-requested change explicitly
and update the relevant tests and documentation together.
