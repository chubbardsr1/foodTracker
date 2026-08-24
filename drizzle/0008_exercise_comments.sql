-- Optional free-text notes on an exercise entry.
--
-- Additive only: existing rows keep every value they already had and pick up
-- an empty comment, matching how `weight_entries.note` behaves.
ALTER TABLE `exercise_entries` ADD `comments` text DEFAULT '' NOT NULL;
