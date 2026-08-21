CREATE TABLE `daily_goals` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner` text NOT NULL,
  `goal_on` text NOT NULL,
  `calories` integer NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_goals_owner_day_idx` ON `daily_goals` (`owner`, `goal_on`);
