import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { customFoods } from "../../../db/schema";
import { profileFrom } from "../profile";

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
