ALTER TABLE `nutrition_goals` ADD `fiber_goal` real DEFAULT 25 NOT NULL;
--> statement-breakpoint
CREATE TABLE `exercise_entries` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner` text NOT NULL,
  `exercised_on` text NOT NULL,
  `activity` text NOT NULL,
  `minutes` real NOT NULL,
  `calories` real DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
