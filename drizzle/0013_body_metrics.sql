-- Age, height, and gender, for the BMR/TDEE panel on the Weight tab.
--
-- Additive and forward-only. Nullable with no default on purpose, the same
-- way saturated_fat is: every profile already has a goals row, but nobody
-- has entered these yet, and "not set" must stay distinct from an age or
-- height of zero. Height is stored in inches, matching every other imperial
-- unit this tracker uses (pounds, ounces); the BMR formula's kilograms and
-- centimeters are converted from it in application code, not stored here.
ALTER TABLE `nutrition_goals` ADD `age` integer;--> statement-breakpoint
ALTER TABLE `nutrition_goals` ADD `height_inches` real;--> statement-breakpoint
ALTER TABLE `nutrition_goals` ADD `gender` text;
