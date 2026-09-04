import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { customFoods, foodEntries, nutritionGoals } from "../../../db/schema";
import {
  type FatSubtype, fatBreakdownProblem, fatSubtypeLabels, readFatBreakdown, scaleFatBreakdown,
} from "../../nutrition";
import { normalizeBarcode } from "../barcode/route";
import { stampDailyGoal } from "../daily-goal";
import { profileFrom } from "../profile";

const validMeals = new Set(["Breakfast", "Lunch", "Dinner", "Snacks"]);
const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : NaN;
const roundTwo = (value: number) => Math.round(value * 100) / 100;
/** A blank subtype is allowed and means unknown; a bad one is refused outright. */
const fatFieldError = (field: FatSubtype) =>
  `${fatSubtypeLabels[field]} must be grams, zero or more. Leave it blank when the label does not give it.`;

export async function GET(request: Request) {
  try {
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "A valid date is required" }, { status: 400 });
    const db = getDb(); const owner = profileFrom(request);
    const [entries, goalRows] = await Promise.all([
      db.select().from(foodEntries).where(and(eq(foodEntries.owner, owner), eq(foodEntries.eatenOn, date))).orderBy(asc(foodEntries.id)),
      db.select().from(nutritionGoals).where(eq(nutritionGoals.owner, owner)).limit(1),
    ]);
    return Response.json({ entries, goals: goalRows[0] ?? null });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to load entries" }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const name = String(payload.name ?? "").trim(); const serving = String(payload.serving ?? "").trim(); const meal = String(payload.meal ?? ""); const eatenOn = String(payload.eatenOn ?? "");
    const servings = numberValue(payload.servings ?? 1);
    const baseNutrition = { calories: numberValue(payload.calories), protein: numberValue(payload.protein), fat: numberValue(payload.fat), carbs: numberValue(payload.carbs), fiber: numberValue(payload.fiber) };
    if (!name || !serving || !validMeals.has(meal) || !/^\d{4}-\d{2}-\d{2}$/.test(eatenOn) || !Number.isFinite(servings) || servings <= 0 || servings > 100 || Object.values(baseNutrition).some(value => !Number.isFinite(value) || value < 0)) return Response.json({ error: "Please complete every nutrition field with a valid value" }, { status: 400 });
    // The four fat subtypes are optional. Blank stays null rather than becoming
    // a zero, so an unrecorded value never reads as a label that said none.
    const fatDetail = readFatBreakdown(payload);
    if (!fatDetail.ok) return Response.json({ error: fatFieldError(fatDetail.field) }, { status: 400 });
    const fatProblem = fatBreakdownProblem(baseNutrition.fat, fatDetail.value);
    if (fatProblem) return Response.json({ error: fatProblem }, { status: 400 });
    const nutrition = Object.fromEntries(Object.entries(baseNutrition).map(([key, value]) => [key, roundTwo(value * servings)])) as typeof baseNutrition;
    // Known subtypes scale with the servings exactly like calories and total fat.
    const scaledFat = scaleFatBreakdown(fatDetail.value, servings);
    const entryServing = servings === 1 ? serving : `${roundTwo(servings)} × ${serving}`;
    const db = getDb();
    const owner = profileFrom(request);
    const [entry] = await db.insert(foodEntries).values({ owner, eatenOn, meal, name, serving: entryServing, ...nutrition, ...scaledFat }).returning();
    await stampDailyGoal(db, owner, eatenOn);
    if (payload.saveCustom === true) {
      const barcode = payload.barcode ? normalizeBarcode(String(payload.barcode)) : null;
      const existing = barcode
        ? await db.select({ id: customFoods.id }).from(customFoods)
            .where(and(eq(customFoods.owner, owner), eq(customFoods.barcode, barcode))).limit(1)
        : [];
      // The saved food keeps one full serving, so it takes the unscaled
      // breakdown the form was reviewed with.
      if (existing[0]) {
        await db.update(customFoods).set({ name, serving, ...baseNutrition, ...fatDetail.value })
          .where(and(eq(customFoods.id, existing[0].id), eq(customFoods.owner, owner)));
      } else {
        await db.insert(customFoods).values({ owner, name, serving, ...baseNutrition, ...fatDetail.value, barcode }).onConflictDoUpdate({
          target: [customFoods.owner, customFoods.name, customFoods.serving],
          set: { ...baseNutrition, ...fatDetail.value, ...(barcode ? { barcode } : {}) },
        });
      }
    }
    return Response.json({ entry }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to save food" }, { status: 500 }); }
}

/**
 * Corrects one diary entry, and moves it to another day when a date is sent.
 *
 * `eatenOn` is only touched when the field is actually present, so a client
 * that never sends one cannot move an entry by accident. Moving updates the
 * one existing row — the entry keeps its id and is never copied to the new day
 * and left behind on the old one.
 */
export async function PUT(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = numberValue(payload.id);
    const name = String(payload.name ?? "").trim(); const serving = String(payload.serving ?? "").trim(); const meal = String(payload.meal ?? "");
    const nutrition = { calories: numberValue(payload.calories), protein: numberValue(payload.protein), fat: numberValue(payload.fat), carbs: numberValue(payload.carbs), fiber: numberValue(payload.fiber) };
    if (!Number.isInteger(id) || !name || !serving || !validMeals.has(meal) || Object.values(nutrition).some(value => !Number.isFinite(value) || value < 0)) return Response.json({ error: "Please complete every field with a valid value" }, { status: 400 });
    // A plain local calendar date, exactly as it is stored. Nothing is parsed
    // into a Date here, so no timezone can shift the entry a day either way.
    const eatenOn = payload.eatenOn === undefined || payload.eatenOn === null ? null : String(payload.eatenOn).trim();
    if (eatenOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(eatenOn)) {
      return Response.json({ error: "Choose a valid diary date for this entry" }, { status: 400 });
    }
    // Editing one entry edits only that entry, subtypes included. A field left
    // blank clears back to unknown rather than to zero.
    const fatDetail = readFatBreakdown(payload);
    if (!fatDetail.ok) return Response.json({ error: fatFieldError(fatDetail.field) }, { status: 400 });
    const fatProblem = fatBreakdownProblem(nutrition.fat, fatDetail.value);
    if (fatProblem) return Response.json({ error: fatProblem }, { status: 400 });
    const db = getDb();
    const owner = profileFrom(request);
    // Read first, so the response can say which day the entry came from and
    // the diary can take it off the day it is no longer on.
    const [before] = await db.select({ eatenOn: foodEntries.eatenOn }).from(foodEntries)
      .where(and(eq(foodEntries.id, id), eq(foodEntries.owner, owner))).limit(1);
    if (!before) return Response.json({ error: "Diary entry was not found" }, { status: 404 });
    const [entry] = await db.update(foodEntries)
      .set({ meal, name, serving, ...nutrition, ...fatDetail.value, ...(eatenOn ? { eatenOn } : {}) })
      .where(and(eq(foodEntries.id, id), eq(foodEntries.owner, owner)))
      .returning();
    if (!entry) return Response.json({ error: "Diary entry was not found" }, { status: 404 });
    // The day it moved to needs a calorie goal stamped on it just as much as a
    // day something was added to. The day it left keeps the stamp it had.
    if (eatenOn && eatenOn !== before.eatenOn) await stampDailyGoal(db, owner, eatenOn);
    return Response.json({ entry, movedFrom: before.eatenOn, moved: Boolean(eatenOn) && eatenOn !== before.eatenOn });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to update food" }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) return Response.json({ error: "A valid entry is required" }, { status: 400 });
    await getDb().delete(foodEntries).where(and(eq(foodEntries.id, id), eq(foodEntries.owner, profileFrom(request))));
    return Response.json({ deleted: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to remove food" }, { status: 500 }); }
}
