CREATE TABLE `step_entries` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner` text NOT NULL,
  `stepped_on` text NOT NULL,
  `steps` integer NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `step_entries_owner_day_idx` ON `step_entries` (`owner`, `stepped_on`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `water_entries_owner_date_idx` ON `water_entries` (`owner`, `drank_on`);
