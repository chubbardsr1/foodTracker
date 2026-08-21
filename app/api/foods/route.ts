type UsdaNutrient = { nutrientName?: string; nutrientNumber?: string; value?: number; unitName?: string };
type UsdaFood = { fdcId: number; description: string; brandOwner?: string; householdServingFullText?: string; servingSize?: number; servingSizeUnit?: string; foodNutrients?: UsdaNutrient[] };

function nutrient(food: UsdaFood, names: string[]) {
  const item = food.foodNutrients?.find(n => names.some(name => n.nutrientName?.toLowerCase() === name));
  return Number(item?.value ?? 0);
}

const GRAMS_PER_OUNCE = 28.349523125;
function roundTwo(value: number) { return Math.round(value * 100) / 100; }

function servingGrams(food: UsdaFood) {
  const size = Number(food.servingSize);
  if (!Number.isFinite(size) || size <= 0) return 100;
  const unit = food.servingSizeUnit?.trim().toLowerCase();
  if (unit === "g" || unit === "gram" || unit === "grams") return size;
  if (unit === "oz" || unit === "ounce" || unit === "ounces") return size * GRAMS_PER_OUNCE;
  return 100;
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ foods: [] });
  try {
    const response = await fetch("https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, pageSize: 8, dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"] }),
    });
    if (!response.ok) throw new Error("USDA food search is temporarily unavailable");
    const data = await response.json() as { foods?: UsdaFood[] };
    const foods = (data.foods ?? []).map(food => {
      const grams = servingGrams(food);
      const factor = grams / 100;
      const ounces = roundTwo(grams / GRAMS_PER_OUNCE);
      const household = food.householdServingFullText?.trim();
      return {
        id: food.fdcId, name: food.brandOwner ? `${food.description} — ${food.brandOwner}` : food.description,
        serving: household ? `${household} (${ounces} oz)` : `${ounces} oz`,
        servingGrams: roundTwo(grams),
        calories: roundTwo(nutrient(food, ["energy"]) * factor),
        protein: roundTwo(nutrient(food, ["protein"]) * factor),
        fat: roundTwo(nutrient(food, ["total lipid (fat)"]) * factor),
        carbs: roundTwo(nutrient(food, ["carbohydrate, by difference"]) * factor),
        fiber: roundTwo(nutrient(food, ["fiber, total dietary"]) * factor),
      };
    });
    return Response.json({ foods });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to search foods" }, { status: 502 }); }
}
