CREATE TABLE `food_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`eaten_on` text NOT NULL,
	`meal` text NOT NULL,
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
CREATE TABLE `nutrition_goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`calories` integer DEFAULT 1600 NOT NULL,
	`protein` real DEFAULT 110 NOT NULL,
	`fat` real DEFAULT 105 NOT NULL,
	`net_carbs` real DEFAULT 25 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_goals_owner_idx` ON `nutrition_goals` (`owner`);