-- Saturated, trans, monounsaturated, and polyunsaturated fat, in grams.
--
-- Additive and forward-only. No table is dropped or rebuilt, every existing
-- row keeps every value it already had, and no saved food is removed. The new
-- columns are nullable with no default on purpose: a diary entry or saved food
-- written before this migration has an unknown breakdown, which is not the
-- same as a label reporting 0 g. Total fat is untouched and stays the primary
-- fat value.
--
-- SQLite runs each ALTER TABLE ... ADD COLUMN as a metadata-only change, so
-- this is identical locally and on remote D1.
ALTER TABLE `food_entries` ADD `saturated_fat` real;
--> statement-breakpoint
ALTER TABLE `food_entries` ADD `trans_fat` real;
--> statement-breakpoint
ALTER TABLE `food_entries` ADD `monounsaturated_fat` real;
--> statement-breakpoint
ALTER TABLE `food_entries` ADD `polyunsaturated_fat` real;
--> statement-breakpoint
ALTER TABLE `custom_foods` ADD `saturated_fat` real;
--> statement-breakpoint
ALTER TABLE `custom_foods` ADD `trans_fat` real;
--> statement-breakpoint
ALTER TABLE `custom_foods` ADD `monounsaturated_fat` real;
--> statement-breakpoint
ALTER TABLE `custom_foods` ADD `polyunsaturated_fat` real;
