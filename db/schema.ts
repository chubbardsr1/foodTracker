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
