import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const foodEntries = sqliteTable("food_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(), eatenOn: text("eaten_on").notNull(),
  meal: text("meal").notNull(), name: text("name").notNull(), serving: text("serving").notNull(),
  calories: real("calories").notNull(), protein: real("protein").notNull(),
  fat: real("fat").notNull(), carbs: real("carbs").notNull(),
  fiber: real("fiber").notNull().default(0),
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

export const waterEntries = sqliteTable("water_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  drankOn: text("drank_on").notNull(),
  ounces: real("ounces").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const exerciseEntries = sqliteTable("exercise_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  exercisedOn: text("exercised_on").notNull(),
  activity: text("activity").notNull(),
  minutes: real("minutes").notNull(),
  calories: real("calories").notNull().default(0),
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
  // Set when the food came from a scanned product. Older saved foods stay null.
  barcode: text("barcode"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  uniqueIndex("custom_foods_owner_name_serving_idx").on(table.owner, table.name, table.serving),
  uniqueIndex("custom_foods_owner_barcode_idx").on(table.owner, table.barcode).where(sql`${table.barcode} is not null`),
]);
