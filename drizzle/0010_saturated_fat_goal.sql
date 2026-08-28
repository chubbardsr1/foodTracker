-- An optional daily saturated-fat goal, in grams.
--
-- Additive and forward-only. Nullable with no default on purpose: every other
-- goal column is NOT NULL because every profile has always had one, but this
-- goal is new and nobody has set it yet. Null means "no saturated-fat goal",
-- which shows no percentage rather than a zero, and neither profile's existing
-- goals are altered by this migration.
--
-- There is deliberately still no total-carbohydrate goal.
ALTER TABLE `nutrition_goals` ADD `saturated_fat` real;
