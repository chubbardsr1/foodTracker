/**
 * Barcode mapping, against Open Food Facts records shaped like the real ones.
 *
 * Most products carry saturated and trans fat and nothing else, which is the
 * case that matters: the two that are missing must stay missing rather than
 * arriving in the diary as a confirmed zero.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBarcode, normalizeProduct } from "../../app/api/barcode/route.ts";
import { scaleFatBreakdown } from "../../app/nutrition.ts";

/** A typical branded product: per-serving figures, saturated and trans only. */
const peanutButter = {
  code: "0051500255162",
  product_name: "Creamy Peanut Butter",
  brands: "Skippy",
  quantity: "462 g",
  serving_size: "2 tbsp (32 g)",
  serving_quantity: 32,
  serving_quantity_unit: "g",
  nutriments: {
    "energy-kcal_serving": 190, "energy-kcal_100g": 594,
    proteins_serving: 7, fat_serving: 16, carbohydrates_serving: 7, fiber_serving: 2,
    "saturated-fat_serving": 3.5, "trans-fat_serving": 0,
    proteins_100g: 21.9, fat_100g: 50, carbohydrates_100g: 21.9, fiber_100g: 6.2,
    "saturated-fat_100g": 10.9, "trans-fat_100g": 0,
  },
};

test("saturated and trans fat come through; the other two stay unknown", () => {
  const product = normalizeProduct(peanutButter, "0051500255162");
  assert.equal(product.fat, 16);
  assert.equal(product.saturatedFat, 3.5);
  // A reported zero is a confirmed zero, not a gap.
  assert.equal(product.transFat, 0);
  assert.equal(product.monounsaturatedFat, null);
  assert.equal(product.polyunsaturatedFat, null);
  assert.deepEqual(product.missingFatDetail, ["monounsaturatedFat", "polyunsaturatedFat"]);
  // The core five were all present, so the existing missing list stays empty.
  assert.deepEqual(product.missing, []);
});

test("a full breakdown comes through complete", () => {
  const product = normalizeProduct({
    ...peanutButter,
    nutriments: {
      ...peanutButter.nutriments,
      "monounsaturated-fat_serving": 7.7,
      "polyunsaturated-fat_serving": 4.4,
    },
  }, "0051500255162");
  assert.deepEqual(
    [product.saturatedFat, product.transFat, product.monounsaturatedFat, product.polyunsaturatedFat],
    [3.5, 0, 7.7, 4.4],
  );
  assert.deepEqual(product.missingFatDetail, []);
});

test("a product with no fat breakdown at all reports every subtype unknown", () => {
  const product = normalizeProduct({
    code: "1234567890128",
    product_name: "Store Brand Rice",
    serving_size: "45 g",
    serving_quantity: 45,
    nutriments: {
      "energy-kcal_serving": 160, proteins_serving: 3, fat_serving: 0.5,
      carbohydrates_serving: 36, fiber_serving: 0.6,
    },
  }, "1234567890128");
  assert.equal(product.fat, 0.5);
  assert.deepEqual(
    [product.saturatedFat, product.transFat, product.monounsaturatedFat, product.polyunsaturatedFat],
    [null, null, null, null],
  );
  assert.equal(product.missingFatDetail.length, 4);
});

test("a per-100 g product reads its subtypes on the same basis", () => {
  // No per-serving energy, so the whole record falls back to per 100 g. The
  // subtypes must not be mixed across bases.
  const product = normalizeProduct({
    code: "3017620422003",
    product_name: "Hazelnut Spread",
    nutriments: {
      "energy-kcal_100g": 539, proteins_100g: 6.3, fat_100g: 30.9,
      carbohydrates_100g: 57.5, fiber_100g: 0,
      "saturated-fat_100g": 10.6, "trans-fat_100g": 0.2,
      "saturated-fat_serving": 999,
    },
  }, "3017620422003");
  assert.equal(product.servingBasis, "100g");
  assert.equal(product.serving, "100 g");
  assert.equal(product.saturatedFat, 10.6);
  assert.equal(product.transFat, 0.2);
});

test("a negative figure from the provider is dropped rather than stored", () => {
  const product = normalizeProduct({
    ...peanutButter,
    nutriments: { ...peanutButter.nutriments, "saturated-fat_serving": -2 },
  }, "0051500255162");
  assert.equal(product.saturatedFat, null);
});

test("scanned values scale with the servings eaten", () => {
  const product = normalizeProduct(peanutButter, "0051500255162");
  const twoServings = scaleFatBreakdown({
    saturatedFat: product.saturatedFat, transFat: product.transFat,
    monounsaturatedFat: product.monounsaturatedFat, polyunsaturatedFat: product.polyunsaturatedFat,
  }, 2);
  assert.deepEqual(twoServings, {
    saturatedFat: 7, transFat: 0, monounsaturatedFat: null, polyunsaturatedFat: null,
  });
});

test("barcode normalisation is unchanged by the fat work", () => {
  assert.equal(normalizeBarcode("0051500255162"), "0051500255162");
  assert.equal(normalizeBarcode("737628064502"), "737628064502");
  assert.equal(normalizeBarcode("12345"), null);
});
