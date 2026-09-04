-- A minimum and a maximum daily net-carbohydrate goal, in grams.
--
-- Additive and forward-only. The tracker has always held one net-carb goal,
-- and a single goal has always been read as a ceiling: the diary shows how
-- many grams are left before it. That meaning is preserved here rather than
-- discarded — the existing `net_carbs` becomes the maximum, and the minimum
-- starts at 0, so every profile behaves exactly as it did until a real range
-- is saved.
--
-- `net_carbs` is deliberately kept and is written with the same value as
-- `net_carbs_max` from now on. It is the column every export, PDF, and older
-- read path already understands, so nothing that has not been taught about the
-- range can read a wrong number.
--
-- There is deliberately still no total-carbohydrate goal.
ALTER TABLE `nutrition_goals` ADD `net_carbs_min` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `nutrition_goals` ADD `net_carbs_max` real DEFAULT 25 NOT NULL;--> statement-breakpoint
UPDATE `nutrition_goals` SET `net_carbs_min` = 0, `net_carbs_max` = `net_carbs`;
