import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const foodEntries = sqliteTable("food_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(), eatenOn: text("eaten_on").notNull(),
  meal: text("meal").notNull(), name: text("name").notNull(), serving: text("serving").notNull(),
  calories: real("calories").notNull(), protein: real("protein").notNull(),
  fat: real("fat").notNull(), carbs: real("carbs").notNull(),
  fiber: real("fiber").notNull().default(0),
  // Fat subtypes are deliberately nullable. Null means the label, product
  // record, or estimate never gave a figure; 0 means a source really did say
  // zero. Total fat above stays the primary value and is never derived from
  // these, because labels omit subtypes and round each line on its own.
  saturatedFat: real("saturated_fat"),
  transFat: real("trans_fat"),
  monounsaturatedFat: real("monounsaturated_fat"),
  polyunsaturatedFat: real("polyunsaturated_fat"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("food_entries_owner_date_idx").on(table.owner, table.eatenOn)]);

export const nutritionGoals = sqliteTable("nutrition_goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(), calories: integer("calories").notNull().default(1600),
  protein: real("protein").notNull().default(110), fat: real("fat").notNull().default(105),
  netCarbs: real("net_carbs").notNull().default(25),
  // Optional, unlike every other goal here. Null means no saturated-fat goal
  // has been set, so no percentage is worked out against it. There is
  // deliberately no total-carbohydrate goal.
  saturatedFat: real("saturated_fat"),
  fiber: real("fiber_goal").notNull().default(25),
  waterOunces: real("water_ounces").notNull().default(64),
  waterShortcutOne: real("water_shortcut_one").notNull().default(6),
  waterShortcutTwo: real("water_shortcut_two").notNull().default(8),
  waterShortcutThree: real("water_shortcut_three").notNull().default(12),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("nutrition_goals_owner_idx").on(table.owner)]);

/**
 * The calorie goal that was in force on a given day, frozen the first time
 * anything is recorded for that day. Lets the goal change over time without
 * rewriting how past days are judged.
 */
export const dailyGoals = sqliteTable("daily_goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  goalOn: text("goal_on").notNull(),
  calories: integer("calories").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("daily_goals_owner_day_idx").on(table.owner, table.goalOn)]);

export const waterEntries = sqliteTable("water_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  drankOn: text("drank_on").notNull(),
  ounces: real("ounces").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("water_entries_owner_date_idx").on(table.owner, table.drankOn)]);

export const exerciseEntries = sqliteTable("exercise_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  exercisedOn: text("exercised_on").notNull(),
  activity: text("activity").notNull(),
  minutes: real("minutes").notNull(),
  calories: real("calories").notNull().default(0),
  // Optional free-text detail about the session. Entries made before this
  // existed carry an empty string, exactly like `weightEntries.note`.
  comments: text("comments").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("exercise_entries_owner_date_idx").on(table.owner, table.exercisedOn)]);

export const customFoods = sqliteTable("custom_foods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  serving: text("serving").notNull(),
  calories: real("calories").notNull(),
  protein: real("protein").notNull(),
  fat: real("fat").notNull(),
  carbs: real("carbs").notNull(),
  fiber: real("fiber").notNull().default(0),
  // Nullable for the same reason as on `foodEntries`: a saved food from before
  // the breakdown existed holds unknown subtypes, not zeroes, until it is
  // edited. Values here are for one full serving.
  saturatedFat: real("saturated_fat"),
  transFat: real("trans_fat"),
  monounsaturatedFat: real("monounsaturated_fat"),
  polyunsaturatedFat: real("polyunsaturated_fat"),
  // Set when the food came from a scanned product. Older saved foods stay null.
  barcode: text("barcode"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  uniqueIndex("custom_foods_owner_name_serving_idx").on(table.owner, table.name, table.serving),
  uniqueIndex("custom_foods_owner_barcode_idx").on(table.owner, table.barcode).where(sql`${table.barcode} is not null`),
]);

/**
 * Weight log. One reading per owner per day so a corrected number replaces the
 * old one instead of stacking up beside it.
 */
export const weightEntries = sqliteTable("weight_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  weighedOn: text("weighed_on").notNull(),
  pounds: real("pounds").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("weight_entries_owner_day_idx").on(table.owner, table.weighedOn)]);

/**
 * One journal entry per owner per day.
 *
 * `source` records how the text was written. Everything is "manual" today;
 * the planned chat recap will write "assistant" without changing this shape.
 */
export const journalEntries = sqliteTable("journal_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  entryOn: text("entry_on").notNull(),
  body: text("body").notNull(),
  source: text("source").notNull().default("manual"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("journal_entries_owner_day_idx").on(table.owner, table.entryOn)]);

/**
 * Manually entered step count. One total per owner per day, so re-entering a
 * day's steps corrects it rather than stacking a second row beside it.
 */
export const stepEntries = sqliteTable("step_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  steppedOn: text("stepped_on").notNull(),
  steps: integer("steps").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("step_entries_owner_day_idx").on(table.owner, table.steppedOn)]);

/*
 * Workout programs and strength training.
 *
 * Five layers stay deliberately separate: reusable exercise definitions, the
 * reusable program (weeks, workout templates, prescribed exercises), one
 * profile's scheduled cycle of that program, the workouts actually performed,
 * and the individual sets. `owner` follows the rest of this file: null on a
 * shared definition, the profile on anything personal.
 *
 * Everything a session displays is snapshotted onto the session when it starts,
 * so editing a program, a description, or a video later never rewrites history.
 */

/** Reusable exercise definitions. `owner` is null on the shared/system ones. */
export const exerciseLibrary = sqliteTable("exercise_library", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner"),
  /** Stable import key, so re-seeding matches on this rather than on the name. */
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  primaryMuscleGroup: text("primary_muscle_group"),
  equipmentType: text("equipment_type"),
  /** reps_weight | reps_bodyweight | duration | distance_duration | class */
  measurementType: text("measurement_type").notNull().default("reps_weight"),
  description: text("description"),
  videoUrl: text("video_url"),
  sourceUrl: text("source_url"),
  isSystem: integer("is_system").notNull().default(0),
  isActive: integer("is_active").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  uniqueIndex("exercise_library_slug_idx").on(table.slug),
  index("exercise_library_owner_idx").on(table.owner),
]);

/** A reusable program definition. VASA has four weeks and no fifth. */
export const workoutPrograms = sqliteTable("workout_programs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner"),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  sourceUrl: text("source_url"),
  totalWeeks: integer("total_weeks").notNull().default(4),
  isSystem: integer("is_system").notNull().default(0),
  isActive: integer("is_active").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("workout_programs_slug_idx").on(table.slug)]);

export const workoutProgramWeeks = sqliteTable("workout_program_weeks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  programId: integer("program_id").notNull(),
  weekNumber: integer("week_number").notNull(),
  name: text("name"),
  description: text("description"),
  displayOrder: integer("display_order").notNull().default(0),
}, table => [uniqueIndex("workout_program_weeks_program_week_idx").on(table.programId, table.weekNumber)]);

/** One planned workout within a program week. */
export const workoutTemplates = sqliteTable("workout_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  programId: integer("program_id").notNull(),
  programWeekId: integer("program_week_id").notNull(),
  /** Denormalized from the week so a week's workouts read without a join. */
  weekNumber: integer("week_number").notNull(),
  workoutNumber: integer("workout_number").notNull(),
  name: text("name").notNull(),
  /** strength | machines | class | cardio | mixed */
  workoutType: text("workout_type").notNull().default("strength"),
  expectedDurationMinutes: integer("expected_duration_minutes"),
  instructions: text("instructions"),
  displayOrder: integer("display_order").notNull().default(0),
  isOptional: integer("is_optional").notNull().default(0),
  isActive: integer("is_active").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("workout_templates_program_week_number_idx").on(table.programId, table.weekNumber, table.workoutNumber)]);

/**
 * One prescribed exercise inside one workout.
 *
 * Every target is nullable. Cardio has no reps, a class has neither sets nor
 * reps, and the VASA source leaves some cells genuinely blank — those stay null
 * rather than becoming zeros or invented values.
 */
export const workoutTemplateExercises = sqliteTable("workout_template_exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workoutTemplateId: integer("workout_template_id").notNull(),
  exerciseId: integer("exercise_id").notNull(),
  targetSets: integer("target_sets"),
  targetReps: integer("target_reps"),
  targetDurationMinutes: real("target_duration_minutes"),
  targetDurationSeconds: integer("target_duration_seconds"),
  targetDistance: real("target_distance"),
  targetDistanceUnit: text("target_distance_unit"),
  targetIncline: real("target_incline"),
  targetResistance: real("target_resistance"),
  suggestedStartingWeight: real("suggested_starting_weight"),
  weightUnit: text("weight_unit").default("lb"),
  restSeconds: integer("rest_seconds"),
  isPerSide: integer("is_per_side").notNull().default(0),
  isOptional: integer("is_optional").notNull().default(0),
  instructions: text("instructions"),
  descriptionOverride: text("description_override"),
  videoUrlOverride: text("video_url_override"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("workout_template_exercises_order_idx").on(table.workoutTemplateId, table.displayOrder)]);

/**
 * One profile's scheduled run of a program.
 *
 * The start date is always chosen by the user; the seed, import, or selection
 * date is never used. A cycle is never moved to completed merely because its
 * scheduled end date has passed.
 */
export const workoutProgramCycles = sqliteTable("workout_program_cycles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  programId: integer("program_id").notNull(),
  cycleNumber: integer("cycle_number").notNull(),
  startDate: text("start_date").notNull(),
  scheduledEndDate: text("scheduled_end_date").notNull(),
  /** upcoming | active | completed | archived */
  status: text("status").notNull().default("upcoming"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  uniqueIndex("workout_program_cycles_owner_program_number_idx").on(table.owner, table.programId, table.cycleNumber),
  index("workout_program_cycles_owner_program_start_idx").on(table.owner, table.programId, table.startDate),
]);

/**
 * One workout actually performed.
 *
 * Created only when the user starts it, never to show a planned workout. The
 * `_snapshot` columns are what history displays, so a deleted program or
 * template cannot break a past session. `linkedActivityEntryId` holds the one
 * `exerciseEntries` row this workout wrote, so completing again updates that
 * row instead of adding a second and double-counting the day.
 */
export const workoutSessions = sqliteTable("workout_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  programId: integer("program_id"),
  programCycleId: integer("program_cycle_id"),
  workoutTemplateId: integer("workout_template_id"),
  programNameSnapshot: text("program_name_snapshot"),
  templateNameSnapshot: text("template_name_snapshot").notNull(),
  cycleNumberSnapshot: integer("cycle_number_snapshot"),
  weekNumberSnapshot: integer("week_number_snapshot"),
  workoutNumberSnapshot: integer("workout_number_snapshot"),
  workoutDate: text("workout_date").notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  durationMinutes: real("duration_minutes"),
  caloriesBurned: real("calories_burned"),
  /** in_progress | completed | partial | abandoned */
  status: text("status").notNull().default("in_progress"),
  perceivedDifficulty: integer("perceived_difficulty"),
  notes: text("notes"),
  linkedActivityEntryId: integer("linked_activity_entry_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  index("workout_sessions_owner_date_idx").on(table.owner, table.workoutDate),
  index("workout_sessions_owner_cycle_idx").on(table.owner, table.programCycleId),
  // One in-progress session per owner, cycle, and template: a second Start on
  // the same workout resumes rather than duplicating.
  uniqueIndex("workout_sessions_active_idx")
    .on(table.owner, table.programCycleId, table.workoutTemplateId)
    .where(sql`${table.status} = 'in_progress'`),
]);

/** What one session prescribed, frozen at the moment it started. */
export const workoutSessionExercises = sqliteTable("workout_session_exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workoutSessionId: integer("workout_session_id").notNull(),
  sourceTemplateExerciseId: integer("source_template_exercise_id"),
  /** Kept for previous-performance lookups; nulled if the definition is deleted. */
  exerciseId: integer("exercise_id"),
  exerciseNameSnapshot: text("exercise_name_snapshot").notNull(),
  measurementTypeSnapshot: text("measurement_type_snapshot").notNull().default("reps_weight"),
  descriptionSnapshot: text("description_snapshot"),
  videoUrlSnapshot: text("video_url_snapshot"),
  targetSetsSnapshot: integer("target_sets_snapshot"),
  targetRepsSnapshot: integer("target_reps_snapshot"),
  targetDurationSnapshot: real("target_duration_snapshot"),
  targetDistanceSnapshot: real("target_distance_snapshot"),
  targetInclineSnapshot: real("target_incline_snapshot"),
  targetResistanceSnapshot: real("target_resistance_snapshot"),
  isPerSideSnapshot: integer("is_per_side_snapshot").notNull().default(0),
  displayOrder: integer("display_order").notNull().default(0),
  /** pending | completed | partial | skipped */
  status: text("status").notNull().default("pending"),
  equipmentNotes: text("equipment_notes"),
  machineSettings: text("machine_settings"),
  exerciseNotes: text("exercise_notes"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  uniqueIndex("workout_session_exercises_order_idx").on(table.workoutSessionId, table.displayOrder),
  index("workout_session_exercises_exercise_idx").on(table.exerciseId),
]);

/** One set. Zero is a real answer for reps and weight; a negative never is. */
export const workoutSets = sqliteTable("workout_sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workoutSessionExerciseId: integer("workout_session_exercise_id").notNull(),
  setNumber: integer("set_number").notNull(),
  /** warmup | working | drop. Only working sets count toward volume. */
  setType: text("set_type").notNull().default("working"),
  targetReps: integer("target_reps"),
  actualReps: integer("actual_reps"),
  weight: real("weight"),
  weightUnit: text("weight_unit").notNull().default("lb"),
  durationSeconds: real("duration_seconds"),
  distance: real("distance"),
  distanceUnit: text("distance_unit"),
  incline: real("incline"),
  resistanceLevel: real("resistance_level"),
  completed: integer("completed").notNull().default(0),
  difficulty: integer("difficulty"),
  repsInReserve: integer("reps_in_reserve"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("workout_sets_exercise_number_idx").on(table.workoutSessionExerciseId, table.setNumber)]);
