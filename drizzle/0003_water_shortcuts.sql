ALTER TABLE `nutrition_goals` ADD `water_shortcut_one` real DEFAULT 6 NOT NULL;
--> statement-breakpoint
ALTER TABLE `nutrition_goals` ADD `water_shortcut_two` real DEFAULT 8 NOT NULL;
--> statement-breakpoint
ALTER TABLE `nutrition_goals` ADD `water_shortcut_three` real DEFAULT 12 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `food_entries_owner_date_idx` ON `food_entries` (`owner`, `eaten_on`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `exercise_entries_owner_date_idx` ON `exercise_entries` (`owner`, `exercised_on`);
