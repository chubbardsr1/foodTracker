CREATE TABLE `weight_entries` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner` text NOT NULL,
  `weighed_on` text NOT NULL,
  `pounds` real NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weight_entries_owner_day_idx` ON `weight_entries` (`owner`, `weighed_on`);
--> statement-breakpoint
CREATE TABLE `journal_entries` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner` text NOT NULL,
  `entry_on` text NOT NULL,
  `body` text NOT NULL,
  `source` text DEFAULT 'manual' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_entries_owner_day_idx` ON `journal_entries` (`owner`, `entry_on`);
