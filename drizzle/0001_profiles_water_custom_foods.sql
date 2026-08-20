ALTER TABLE `nutrition_goals` ADD `water_ounces` real DEFAULT 64 NOT NULL;
--> statement-breakpoint
UPDATE `food_entries` SET `owner` = 'chris' WHERE `owner` NOT IN ('chris', 'sarah');
--> statement-breakpoint
UPDATE `nutrition_goals` SET `owner` = 'chris' WHERE `owner` NOT IN ('chris', 'sarah');
--> statement-breakpoint
CREATE TABLE `water_entries` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner` text NOT NULL,
  `drank_on` text NOT NULL,
  `ounces` real NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `custom_foods` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner` text NOT NULL,
  `name` text NOT NULL,
  `serving` text NOT NULL,
  `calories` real NOT NULL,
  `protein` real NOT NULL,
  `fat` real NOT NULL,
  `carbs` real NOT NULL,
  `fiber` real DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_foods_owner_name_serving_idx` ON `custom_foods` (`owner`, `name`, `serving`);
