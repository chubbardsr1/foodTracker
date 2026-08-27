/**
 * Server-side product lookup for scanned barcodes.
 *
 * Open Food Facts is a free, open database. It asks callers to identify
 * themselves with a User-Agent and to attribute the data (ODbL 1.0). No key,
 * account, or payment is involved. The upstream URL and request shape stay on
 * the server so the browser only ever sees the normalized product.
 */

import { type FatSubtype, fatSubtypeKeys } from "../../nutrition";

const OFF_ENDPOINT = "https://world.openfoodfacts.org/api/v2/product";
const USER_AGENT = "DailyFoodTracker/1.0 (private household food tracker; https://food-tracker.hubbard-foodtracker.workers.dev)";
const ATTRIBUTION = "Product data from Open Food Facts, made available under the Open Database License (ODbL) 1.0.";
const SOURCE = "Open Food Facts";
const TIMEOUT_MS = 6000;

// Only the fields this application actually uses.
const FIELDS = [
  "code", "product_name", "product_name_en", "generic_name", "brands",
  "quantity", "serving_size", "serving_quantity", "serving_quantity_unit",
  "nutrition_data_per", "nutriments",
].join(",");

type Nutriments = Record<string, unknown>;
type OffProduct = {
  code?: string; product_name?: string; product_name_en?: string; generic_name?: string;
  brands?: string; quantity?: string; serving_size?: string;
  serving_quantity?: number | string; serving_quantity_unit?: string;
  nutriments?: Nutriments;
};

/**
 * Accepts EAN-8, UPC-A (12), EAN-13, and GTIN-14. The check digit is not
 * verified: a mistyped digit simply produces a lookup that finds nothing, and
 * rejecting on checksum risks refusing legitimate codes that scan correctly.
 */
export function normalizeBarcode(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  return digits;
}

function numberOrNull(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

function firstBrand(brands: unknown) {
  const text = String(brands ?? "").split(",")[0]?.trim() ?? "";
  return text.slice(0, 80);
}

/** Reads one nutrient on a single basis. Bases are never mixed together. */
function nutrient(nutriments: Nutriments, key: string, basis: "serving" | "100g") {
  return numberOrNull(nutriments[`${key}_${basis}`]);
}

function calories(nutriments: Nutriments, basis: "serving" | "100g") {
  const kcal = nutrient(nutriments, "energy-kcal", basis);
  if (kcal !== null) return kcal;
  const kj = nutrient(nutriments, "energy-kj", basis) ?? nutrient(nutriments, "energy", basis);
  return kj === null ? null : Math.round(kj / 4.184 * 100) / 100;
}

/**
 * Open Food Facts' nutriment key for each fat subtype.
 *
 * A product that never reported a subtype simply has no key, which stays null
 * all the way to the diary. A product that reports `0` keeps its confirmed
 * zero. Nothing here fills a gap with a guess.
 */
const fatSubtypeSources: Record<FatSubtype, string> = {
  saturatedFat: "saturated-fat",
  transFat: "trans-fat",
  monounsaturatedFat: "monounsaturated-fat",
  polyunsaturatedFat: "polyunsaturated-fat",
};

export function normalizeProduct(product: OffProduct, barcode: string) {
  const nutriments = (product.nutriments ?? {}) as Nutriments;
  const servingAmount = numberOrNull(product.serving_quantity);
  const servingLabel = String(product.serving_size ?? "").trim();

  // Prefer the labeled serving. Fall back to per-100 g only when the product
  // carries no per-serving figures, and say so rather than passing 100 g off
  // as one serving.
  const hasServingBasis = servingAmount !== null && calories(nutriments, "serving") !== null;
  const basis: "serving" | "100g" = hasServingBasis ? "serving" : "100g";

  const values = {
    calories: calories(nutriments, basis),
    protein: nutrient(nutriments, "proteins", basis),
    fat: nutrient(nutriments, "fat", basis),
    carbs: nutrient(nutriments, "carbohydrates", basis),
    fiber: nutrient(nutriments, "fiber", basis),
  };
  const missing = Object.entries(values).filter(([, value]) => value === null).map(([key]) => key);

  // Read on the same basis as everything above, so a per-serving product never
  // mixes a per-100 g subtype into its serving. Most products carry saturated
  // and trans fat only, so the rest are usually left unknown for the user to
  // fill in by hand if they want them.
  const fatDetail = Object.fromEntries(fatSubtypeKeys.map(key =>
    [key, nutrient(nutriments, fatSubtypeSources[key], basis)])) as Record<FatSubtype, number | null>;
  const missingFatDetail = fatSubtypeKeys.filter(key => fatDetail[key] === null);

  const name = String(product.product_name || product.product_name_en || product.generic_name || "").trim().slice(0, 150);
  const unit = String(product.serving_quantity_unit ?? "g").trim() || "g";
  const serving = basis === "serving"
    ? (servingLabel || `${servingAmount} ${unit}`)
    : "100 g";

  return {
    barcode,
    name,
    brand: firstBrand(product.brands),
    serving,
    servingDescription: basis === "serving"
      ? `Label serving: ${serving}`
      : "Per 100 g — this product has no label serving on file",
    servingAmount: basis === "serving" ? servingAmount : 100,
    servingUnit: basis === "serving" ? unit : "g",
    servingBasis: basis,
    packageSize: String(product.quantity ?? "").trim().slice(0, 60),
    ...values,
    ...fatDetail,
    missing,
    missingFatDetail,
    source: SOURCE,
    attribution: ATTRIBUTION,
  };
}

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("code") ?? "";
  const barcode = normalizeBarcode(requested);
  if (!barcode) {
    return Response.json({ error: "That barcode does not look right. Enter 8, 12, 13, or 14 digits.", found: false, barcode: requested.replace(/\D/g, "").slice(0, 14) }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${OFF_ENDPOINT}/${barcode}.json?fields=${FIELDS}`, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: controller.signal,
    });

    if (response.status === 404) {
      return Response.json({ found: false, barcode, message: "That product is not in the Open Food Facts database yet." });
    }
    if (!response.ok) {
      return Response.json({ found: false, barcode, error: "Open Food Facts is not responding right now. Enter the nutrition yourself and it will still save." }, { status: 502 });
    }

    const data = await response.json() as { status?: number; product?: OffProduct };
    if (data.status !== 1 || !data.product) {
      return Response.json({ found: false, barcode, message: "That product is not in the Open Food Facts database yet." });
    }

    const product = normalizeProduct(data.product, barcode);
    if (!product.name) {
      return Response.json({ found: false, barcode, message: "Open Food Facts has this barcode but no product name yet." });
    }
    return Response.json({ found: true, product });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return Response.json({
      found: false, barcode,
      error: timedOut
        ? "Open Food Facts took too long to answer. Enter the nutrition yourself and it will still save."
        : "Open Food Facts could not be reached. Enter the nutrition yourself and it will still save.",
    }, { status: timedOut ? 504 : 502 });
  } finally {
    clearTimeout(timer);
  }
}
