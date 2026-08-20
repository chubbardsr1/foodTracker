type UsdaNutrient = { nutrientName?: string; nutrientNumber?: string; value?: number; unitName?: string };
type UsdaFood = { fdcId: number; description: string; brandOwner?: string; householdServingFullText?: string; servingSize?: number; servingSizeUnit?: string; foodNutrients?: UsdaNutrient[] };

function nutrient(food: UsdaFood, names: string[]) {
  const item = food.foodNutrients?.find(n => names.some(name => n.nutrientName?.toLowerCase() === name));
  return Number(item?.value ?? 0);
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
    const foods = (data.foods ?? []).map(food => ({
      id: food.fdcId, name: food.brandOwner ? `${food.description} — ${food.brandOwner}` : food.description,
      serving: "100 g",
      calories: nutrient(food, ["energy"]), protein: nutrient(food, ["protein"]), fat: nutrient(food, ["total lipid (fat)"]),
      carbs: nutrient(food, ["carbohydrate, by difference"]), fiber: nutrient(food, ["fiber, total dietary"]),
    }));
    return Response.json({ foods });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to search foods" }, { status: 502 }); }
}
