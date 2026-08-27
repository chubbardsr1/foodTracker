/**
 * The Describe Food flow end to end, with Gemini itself replaced by a canned
 * reply. The real route, prompt, schema, and parsing all run.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { scaleFatBreakdown } from "../../app/nutrition.ts";

const { env } = await import("cloudflare:workers");
env.GEMINI_API_KEY = "test-key";
const { POST } = await import("../../app/api/estimate/route.ts");

/** Captures what the route sent, and answers with one canned model reply. */
function withReply(answer, status = 200) {
  const sent = {};
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    sent.url = String(url);
    sent.body = JSON.parse(options.body);
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }],
    }), { status, headers: { "content-type": "application/json" } });
  };
  return { sent, restore: () => { globalThis.fetch = original; } };
}

const baseAnswer = {
  foodName: "Cheeseburger and green beans",
  serving: "entire described meal",
  calories: 720, protein: 42, fat: 38, carbs: 45, fiber: 6,
  assumptions: ["80/20 ground beef"], confidence: "medium", warnings: [], needsMoreInfo: false,
};

async function estimate(answer) {
  const { sent, restore } = withReply(answer);
  try {
    const response = await POST(new Request("http://x/api/estimate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "a cheeseburger and a serving of green beans" }),
    }));
    return { status: response.status, body: await response.json(), sent };
  } finally {
    restore();
  }
}

test("the prompt and response schema ask for the four subtypes", async () => {
  const { sent } = await estimate({ ...baseAnswer, saturatedFat: 14, transFat: 0.5, monounsaturatedFat: 15, polyunsaturatedFat: 3 });
  const instruction = sent.body.systemInstruction.parts[0].text;
  assert.match(instruction, /"saturatedFat", "transFat", "monounsaturatedFat" and "polyunsaturatedFat"/);
  assert.match(instruction, /Return null for any subtype you cannot/);
  assert.match(instruction, /Never invent, pad, or adjust a subtype so the four reach the total/);

  const schema = sent.body.generationConfig.responseSchema;
  for (const key of ["saturatedFat", "transFat", "monounsaturatedFat", "polyunsaturatedFat"]) {
    assert.deepEqual(schema.properties[key], { type: "NUMBER", nullable: true });
    assert.ok(schema.required.includes(key));
  }
});

test("all four subtypes survive parsing", async () => {
  const { body } = await estimate({ ...baseAnswer, saturatedFat: 14, transFat: 0.5, monounsaturatedFat: 15, polyunsaturatedFat: 3 });
  assert.equal(body.estimate.fat, 38);
  assert.deepEqual(
    [body.estimate.saturatedFat, body.estimate.transFat, body.estimate.monounsaturatedFat, body.estimate.polyunsaturatedFat],
    [14, 0.5, 15, 3],
  );
});

test("subtypes the model could not determine stay null", async () => {
  const { body } = await estimate({ ...baseAnswer, saturatedFat: 14, transFat: null, monounsaturatedFat: null, polyunsaturatedFat: null });
  assert.equal(body.estimate.saturatedFat, 14);
  assert.equal(body.estimate.transFat, null);
  assert.equal(body.estimate.monounsaturatedFat, null);
  assert.equal(body.estimate.polyunsaturatedFat, null);
});

test("a genuine zero for trans fat is kept as zero", async () => {
  const { body } = await estimate({ ...baseAnswer, saturatedFat: 2, transFat: 0, monounsaturatedFat: null, polyunsaturatedFat: null });
  assert.equal(body.estimate.transFat, 0);
  assert.notEqual(body.estimate.transFat, null);
});

test("an omitted field does not break the estimate", async () => {
  // An older model that answers without the new keys at all.
  const { status, body } = await estimate(baseAnswer);
  assert.equal(status, 200);
  assert.equal(body.estimate.calories, 720);
  assert.equal(body.estimate.saturatedFat, null);
});

test("malformed and negative subtypes fall back to unknown, never to zero", async () => {
  const { body } = await estimate({ ...baseAnswer, saturatedFat: "about fourteen", transFat: -2, monounsaturatedFat: 15, polyunsaturatedFat: 3 });
  assert.equal(body.estimate.saturatedFat, null);
  assert.equal(body.estimate.transFat, null);
  assert.equal(body.estimate.monounsaturatedFat, 15);
});

test("a subtype larger than total fat is blanked and called out", async () => {
  const { body } = await estimate({ ...baseAnswer, fat: 10, saturatedFat: 25, transFat: 0, monounsaturatedFat: null, polyunsaturatedFat: null });
  assert.equal(body.estimate.fat, 10);
  assert.equal(body.estimate.saturatedFat, null);
  assert.ok(body.estimate.warnings.some(line => /higher than the total fat/i.test(line)));
});

test("total fat is never rebuilt from the subtypes", async () => {
  // The four add up to 20 while the model reported 38. The total is left alone.
  const { body } = await estimate({ ...baseAnswer, saturatedFat: 14, transFat: 0, monounsaturatedFat: 5, polyunsaturatedFat: 1 });
  assert.equal(body.estimate.fat, 38);
});

test("an estimate scales to the servings actually eaten", async () => {
  const { body } = await estimate({ ...baseAnswer, saturatedFat: 14, transFat: 0.5, monounsaturatedFat: null, polyunsaturatedFat: 3 });
  const half = scaleFatBreakdown({
    saturatedFat: body.estimate.saturatedFat, transFat: body.estimate.transFat,
    monounsaturatedFat: body.estimate.monounsaturatedFat, polyunsaturatedFat: body.estimate.polyunsaturatedFat,
  }, 0.5);
  assert.deepEqual(half, { saturatedFat: 7, transFat: 0.25, monounsaturatedFat: null, polyunsaturatedFat: 1.5 });
});

test("a description the model cannot price still asks for more detail", async () => {
  const { body } = await estimate({ ...baseAnswer, needsMoreInfo: true, warnings: ["How much rice?"] });
  assert.equal(body.needsDetail, true);
  assert.equal(body.estimate, undefined);
});
