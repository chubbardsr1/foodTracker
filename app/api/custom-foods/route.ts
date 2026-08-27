import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { customFoods } from "../../../db/schema";
import {
  type FatSubtype, fatBreakdownProblem, fatSubtypeLabels, readFatBreakdown,
} from "../../nutrition";
import { normalizeBarcode } from "../barcode/route";
import { profileFrom } from "../profile";

const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : NaN;
const fatFieldError = (field: FatSubtype) =>
  `${fatSubtypeLabels[field]} must be grams, zero or more. Leave it blank when the label does not give it.`;

export async function GET(request: Request) {
  try {
    const foods = await getDb().select().from(customFoods)
      .where(eq(customFoods.owner, profileFrom(request)))
      .orderBy(asc(customFoods.name))
      .limit(100);
    return Response.json({ foods });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load custom foods" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = numberValue(payload.id);
    const name = String(payload.name ?? "").trim();
    const serving = String(payload.serving ?? "").trim();
    const nutrition = { calories: numberValue(payload.calories), protein: numberValue(payload.protein), fat: numberValue(payload.fat), carbs: numberValue(payload.carbs), fiber: numberValue(payload.fiber) };
    if (!Number.isInteger(id) || !name || !serving || Object.values(nutrition).some(value => !Number.isFinite(value) || value < 0)) return Response.json({ error: "Please complete every field with a valid value" }, { status: 400 });
    // A saved food from before the fat breakdown existed can be given one here,
    // and a blank field leaves the subtype unknown rather than setting it to 0.
    const fatDetail = readFatBreakdown(payload);
    if (!fatDetail.ok) return Response.json({ error: fatFieldError(fatDetail.field) }, { status: 400 });
    const fatProblem = fatBreakdownProblem(nutrition.fat, fatDetail.value);
    if (fatProblem) return Response.json({ error: fatProblem }, { status: 400 });
    const rawBarcode = payload.barcode === undefined || payload.barcode === null ? "" : String(payload.barcode).trim();
    const barcode = rawBarcode ? normalizeBarcode(rawBarcode) : null;
    if (rawBarcode && !barcode) return Response.json({ error: "That barcode does not look right. Enter 8, 12, 13, or 14 digits." }, { status: 400 });
    const owner = profileFrom(request);
    if (barcode) {
      const clash = await getDb().select({ id: customFoods.id }).from(customFoods)
        .where(and(eq(customFoods.owner, owner), eq(customFoods.barcode, barcode))).limit(1);
      if (clash[0] && clash[0].id !== id) return Response.json({ error: "Another saved food already uses that barcode." }, { status: 409 });
    }
    const [food] = await getDb().update(customFoods).set({ name, serving, ...nutrition, ...fatDetail.value, ...(rawBarcode ? { barcode } : {}) })
      .where(and(eq(customFoods.id, id), eq(customFoods.owner, owner)))
      .returning();
    if (!food) return Response.json({ error: "Saved food was not found" }, { status: 404 });
    return Response.json({ food });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update saved food" }, { status: 500 });
  }
}

/**
 * Removes one saved food.
 *
 * Only the saved food is touched. Diary entries keep their own nutrition
 * snapshot, so history taken from this food is unaffected, and the barcode it
 * held becomes free for a new saved food straight away.
 *
 * The owner comes from the request's profile, never from the body, so one
 * profile can never delete the other's food. A second delete of the same id
 * finds nothing and answers 404 without touching any other row.
 */
export async function DELETE(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get("id") ?? "";
    const id = numberValue(raw);
    if (!raw || !Number.isInteger(id) || id <= 0) {
      return Response.json({ error: "A valid saved food is required" }, { status: 400 });
    }
    const [deleted] = await getDb().delete(customFoods)
      .where(and(eq(customFoods.id, id), eq(customFoods.owner, profileFrom(request))))
      .returning({ id: customFoods.id, name: customFoods.name });
    if (!deleted) return Response.json({ error: "Saved food was not found" }, { status: 404 });
    return Response.json({ deleted: true, id: deleted.id, name: deleted.name });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete saved food" }, { status: 500 });
  }
}
