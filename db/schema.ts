import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const foodEntries = sqliteTable("food_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(), eatenOn: text("eaten_on").notNull(),
  meal: text("meal").notNull(), name: text("name").notNull(), serving: text("serving").notNull(),
  calories: real("calories").notNull(), protein: real("protein").notNull(),
  fat: real("fat").notNull(), carbs: real("carbs").notNull(),
  fiber: real("fiber").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const nutritionGoals = sqliteTable("nutrition_goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(), calories: integer("calories").notNull().default(1600),
  protein: real("protein").notNull().default(110), fat: real("fat").notNull().default(105),
  netCarbs: real("net_carbs").notNull().default(25),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("nutrition_goals_owner_idx").on(table.owner)]);
