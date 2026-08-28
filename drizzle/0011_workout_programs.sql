-- Structured workout programs, four-week cycles, and set-by-set tracking.
--
-- Additive and forward-only. Nothing existing is dropped, rebuilt, or altered:
-- every table here is new, and the daily activity diary (`exercise_entries`)
-- keeps its exact shape. A completed workout writes one ordinary row there and
-- remembers its id, so Reports, the Calendar, and the exports keep counting
-- movement exactly once.
--
-- Five layers, deliberately separate:
--   1. `exercise_library`            reusable exercise definitions
--   2. `workout_programs` + weeks + templates + template exercises
--                                    the reusable, editable plan
--   3. `workout_program_cycles`      one owner's scheduled run of a program
--   4. `workout_sessions`            one workout actually performed
--   5. `workout_session_exercises` + `workout_sets`
--                                    what was prescribed at the time, frozen,
--                                    and what was actually done
--
-- Layers 4 and 5 hold `_snapshot` columns on purpose. Editing a program, an
-- exercise description, or a video later must never rewrite history, so a
-- session carries its own copy of what it prescribed and survives the template
-- or the exercise being deleted outright.
--
-- `owner` matches every other table in this database: the profile the row
-- belongs to. Reusable definitions carry a NULL owner and `is_system = 1`,
-- which is what makes them shared; everything owner-specific is NOT NULL.
CREATE TABLE `exercise_library` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  -- NULL for shared/system exercises, a profile for one someone adds later.
  `owner` text,
  -- Stable import key. Re-running the seed matches on this rather than on the
  -- display name, so renaming an exercise never duplicates it.
  `slug` text NOT NULL,
  `name` text NOT NULL,
  `category` text,
  `primary_muscle_group` text,
  `equipment_type` text,
  -- reps_weight | reps_bodyweight | duration | distance_duration | class
  `measurement_type` text NOT NULL DEFAULT 'reps_weight',
  `description` text,
  `video_url` text,
  `source_url` text,
  `is_system` integer NOT NULL DEFAULT 0,
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CHECK (`measurement_type` IN ('reps_weight','reps_bodyweight','duration','distance_duration','class'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_library_slug_idx` ON `exercise_library` (`slug`);
--> statement-breakpoint
CREATE INDEX `exercise_library_owner_idx` ON `exercise_library` (`owner`);
--> statement-breakpoint

CREATE TABLE `workout_programs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner` text,
  `slug` text NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `source_url` text,
  `total_weeks` integer NOT NULL DEFAULT 4,
  `is_system` integer NOT NULL DEFAULT 0,
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CHECK (`total_weeks` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_programs_slug_idx` ON `workout_programs` (`slug`);
--> statement-breakpoint

CREATE TABLE `workout_program_weeks` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `program_id` integer NOT NULL REFERENCES `workout_programs`(`id`) ON DELETE CASCADE,
  `week_number` integer NOT NULL,
  `name` text,
  `description` text,
  `display_order` integer NOT NULL DEFAULT 0,
  CHECK (`week_number` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_program_weeks_program_week_idx` ON `workout_program_weeks` (`program_id`, `week_number`);
--> statement-breakpoint

CREATE TABLE `workout_templates` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `program_id` integer NOT NULL REFERENCES `workout_programs`(`id`) ON DELETE CASCADE,
  `program_week_id` integer NOT NULL REFERENCES `workout_program_weeks`(`id`) ON DELETE CASCADE,
  -- Denormalized from the week so a week's workouts can be read without a join.
  `week_number` integer NOT NULL,
  `workout_number` integer NOT NULL,
  `name` text NOT NULL,
  -- strength | machines | class | cardio | mixed
  `workout_type` text NOT NULL DEFAULT 'strength',
  `expected_duration_minutes` integer,
  `instructions` text,
  `display_order` integer NOT NULL DEFAULT 0,
  `is_optional` integer NOT NULL DEFAULT 0,
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CHECK (`workout_number` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_templates_program_week_number_idx` ON `workout_templates` (`program_id`, `week_number`, `workout_number`);
--> statement-breakpoint

-- One prescribed exercise inside one workout. Every target is nullable: a
-- cardio row has no reps, a class row has neither sets nor reps, and the VASA
-- source genuinely leaves some cells blank. A blank stays NULL rather than
-- becoming a zero, exactly like the nullable fat subtypes elsewhere here.
CREATE TABLE `workout_template_exercises` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `workout_template_id` integer NOT NULL REFERENCES `workout_templates`(`id`) ON DELETE CASCADE,
  `exercise_id` integer NOT NULL REFERENCES `exercise_library`(`id`) ON DELETE RESTRICT,
  `target_sets` integer,
  `target_reps` integer,
  `target_duration_minutes` real,
  `target_duration_seconds` integer,
  `target_distance` real,
  `target_distance_unit` text,
  `target_incline` real,
  `target_resistance` real,
  `suggested_starting_weight` real,
  `weight_unit` text DEFAULT 'lb',
  `rest_seconds` integer,
  `is_per_side` integer NOT NULL DEFAULT 0,
  `is_optional` integer NOT NULL DEFAULT 0,
  `instructions` text,
  -- Set only where this workout genuinely prescribes something different from
  -- the library entry. The VASA import leaves both NULL everywhere.
  `description_override` text,
  `video_url_override` text,
  `display_order` integer NOT NULL DEFAULT 0,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CHECK (`target_sets` IS NULL OR `target_sets` > 0),
  CHECK (`target_reps` IS NULL OR `target_reps` > 0),
  CHECK (`target_duration_minutes` IS NULL OR `target_duration_minutes` > 0),
  CHECK (`target_distance` IS NULL OR `target_distance` > 0),
  CHECK (`target_incline` IS NULL OR `target_incline` >= 0),
  CHECK (`target_resistance` IS NULL OR `target_resistance` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_template_exercises_order_idx` ON `workout_template_exercises` (`workout_template_id`, `display_order`);
--> statement-breakpoint

-- One profile's scheduled run of a program. VASA Cycle 2 is a fresh Weeks 1-4;
-- there is never a Week 5. The start date is always chosen by the user, never
-- the seed, import, or selection date.
CREATE TABLE `workout_program_cycles` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner` text NOT NULL,
  `program_id` integer NOT NULL REFERENCES `workout_programs`(`id`) ON DELETE CASCADE,
  `cycle_number` integer NOT NULL,
  `start_date` text NOT NULL,
  `scheduled_end_date` text NOT NULL,
  -- upcoming | active | completed | archived. A cycle is never moved to
  -- completed just because its scheduled end date has passed.
  `status` text NOT NULL DEFAULT 'upcoming',
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CHECK (`cycle_number` > 0),
  CHECK (`status` IN ('upcoming','active','completed','archived'))
);
--> statement-breakpoint
-- Stops one profile creating the same cycle number of the same program twice.
CREATE UNIQUE INDEX `workout_program_cycles_owner_program_number_idx`
  ON `workout_program_cycles` (`owner`, `program_id`, `cycle_number`);
--> statement-breakpoint
CREATE INDEX `workout_program_cycles_owner_program_start_idx`
  ON `workout_program_cycles` (`owner`, `program_id`, `start_date`);
--> statement-breakpoint

-- One workout actually performed. Created only when the user starts it, never
-- to represent a planned future workout.
CREATE TABLE `workout_sessions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner` text NOT NULL,
  -- The links are nullable and SET NULL on delete; the snapshots below are
  -- what the history actually displays, so a deleted program cannot break it.
  `program_id` integer REFERENCES `workout_programs`(`id`) ON DELETE SET NULL,
  `program_cycle_id` integer REFERENCES `workout_program_cycles`(`id`) ON DELETE SET NULL,
  `workout_template_id` integer REFERENCES `workout_templates`(`id`) ON DELETE SET NULL,
  `program_name_snapshot` text,
  `template_name_snapshot` text NOT NULL,
  `cycle_number_snapshot` integer,
  `week_number_snapshot` integer,
  `workout_number_snapshot` integer,
  `workout_date` text NOT NULL,
  `started_at` text NOT NULL,
  `completed_at` text,
  `duration_minutes` real,
  `calories_burned` real,
  -- in_progress | completed | partial | abandoned. Starting a workout never
  -- completes it.
  `status` text NOT NULL DEFAULT 'in_progress',
  `perceived_difficulty` integer,
  `notes` text,
  -- The one `exercise_entries` row this workout wrote into the daily diary.
  -- Held so completing again updates that row instead of adding a second.
  `linked_activity_entry_id` integer,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CHECK (`status` IN ('in_progress','completed','partial','abandoned')),
  CHECK (`duration_minutes` IS NULL OR `duration_minutes` >= 0),
  CHECK (`calories_burned` IS NULL OR `calories_burned` >= 0),
  CHECK (`perceived_difficulty` IS NULL OR (`perceived_difficulty` BETWEEN 1 AND 10))
);
--> statement-breakpoint
CREATE INDEX `workout_sessions_owner_date_idx` ON `workout_sessions` (`owner`, `workout_date`);
--> statement-breakpoint
CREATE INDEX `workout_sessions_owner_cycle_idx` ON `workout_sessions` (`owner`, `program_cycle_id`);
--> statement-breakpoint
-- One in-progress session per owner, cycle, and template. A second Start on the
-- same workout resumes rather than duplicating.
CREATE UNIQUE INDEX `workout_sessions_active_idx`
  ON `workout_sessions` (`owner`, `program_cycle_id`, `workout_template_id`)
  WHERE `status` = 'in_progress';
--> statement-breakpoint

-- What this session prescribed, frozen at the moment it started.
CREATE TABLE `workout_session_exercises` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `workout_session_id` integer NOT NULL REFERENCES `workout_sessions`(`id`) ON DELETE CASCADE,
  `source_template_exercise_id` integer REFERENCES `workout_template_exercises`(`id`) ON DELETE SET NULL,
  -- Kept for "how did this exercise go last time", which is why it survives a
  -- template being deleted. The snapshots below are what the screen displays.
  `exercise_id` integer REFERENCES `exercise_library`(`id`) ON DELETE SET NULL,
  `exercise_name_snapshot` text NOT NULL,
  `measurement_type_snapshot` text NOT NULL DEFAULT 'reps_weight',
  `description_snapshot` text,
  `video_url_snapshot` text,
  `target_sets_snapshot` integer,
  `target_reps_snapshot` integer,
  `target_duration_snapshot` real,
  `target_distance_snapshot` real,
  `target_incline_snapshot` real,
  `target_resistance_snapshot` real,
  `is_per_side_snapshot` integer NOT NULL DEFAULT 0,
  `display_order` integer NOT NULL DEFAULT 0,
  -- pending | completed | partial | skipped
  `status` text NOT NULL DEFAULT 'pending',
  `equipment_notes` text,
  `machine_settings` text,
  `exercise_notes` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CHECK (`status` IN ('pending','completed','partial','skipped'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_session_exercises_order_idx`
  ON `workout_session_exercises` (`workout_session_id`, `display_order`);
--> statement-breakpoint
CREATE INDEX `workout_session_exercises_exercise_idx` ON `workout_session_exercises` (`exercise_id`);
--> statement-breakpoint

CREATE TABLE `workout_sets` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `workout_session_exercise_id` integer NOT NULL REFERENCES `workout_session_exercises`(`id`) ON DELETE CASCADE,
  `set_number` integer NOT NULL,
  -- warmup | working | drop. Only working sets count toward volume.
  `set_type` text NOT NULL DEFAULT 'working',
  `target_reps` integer,
  `actual_reps` integer,
  `weight` real,
  `weight_unit` text NOT NULL DEFAULT 'lb',
  `duration_seconds` real,
  `distance` real,
  `distance_unit` text,
  `incline` real,
  `resistance_level` real,
  `completed` integer NOT NULL DEFAULT 0,
  `difficulty` integer,
  `reps_in_reserve` integer,
  `notes` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CHECK (`set_number` > 0),
  CHECK (`set_type` IN ('warmup','working','drop')),
  -- Zero is a real answer for reps, weight, distance, and incline; a negative
  -- never is.
  CHECK (`target_reps` IS NULL OR `target_reps` >= 0),
  CHECK (`actual_reps` IS NULL OR `actual_reps` >= 0),
  CHECK (`weight` IS NULL OR `weight` >= 0),
  CHECK (`duration_seconds` IS NULL OR `duration_seconds` >= 0),
  CHECK (`distance` IS NULL OR `distance` >= 0),
  CHECK (`incline` IS NULL OR `incline` >= 0),
  CHECK (`resistance_level` IS NULL OR `resistance_level` >= 0),
  CHECK (`difficulty` IS NULL OR (`difficulty` BETWEEN 1 AND 10)),
  CHECK (`reps_in_reserve` IS NULL OR `reps_in_reserve` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_sets_exercise_number_idx`
  ON `workout_sets` (`workout_session_exercise_id`, `set_number`);
