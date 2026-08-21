ALTER TABLE `custom_foods` ADD `barcode` text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `custom_foods_owner_barcode_idx` ON `custom_foods` (`owner`, `barcode`) WHERE `barcode` IS NOT NULL;
