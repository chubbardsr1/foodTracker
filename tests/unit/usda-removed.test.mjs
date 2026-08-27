/**
 * USDA food search is gone, and nothing left behind still points at it.
 *
 * The other four ways to add food — saved foods, the meal assistant, barcode
 * scanning, and manual entry — must all still be wired up.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const skip = new Set(["node_modules", ".git", "dist", ".wrangler", ".local-data", ".next", "tests"]);

function sourceFiles(directory = root) {
  const found = [];
  for (const name of readdirSync(directory)) {
    if (skip.has(name)) continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.(ts|tsx|css)$/.test(name)) found.push(path);
  }
  return found;
}

test("the USDA route is deleted", () => {
  assert.equal(existsSync(join(root, "app", "api", "foods")), false);
});

test("no source file mentions USDA or calls its endpoint", () => {
  const offenders = sourceFiles()
    .map(path => ({ path, text: readFileSync(path, "utf8") }))
    .filter(file => /usda|api\/foods|nal\.usda\.gov|servingGrams/i.test(file.text))
    .map(file => file.path.slice(root.length));
  assert.deepEqual(offenders, []);
});

test("no dead USDA styling is left in the stylesheet", () => {
  const css = readFileSync(join(root, "app", "globals.css"), "utf8");
  assert.equal(/\.food-search|\.search-results/.test(css), false);
});

test("the Add Food form still offers the four remaining methods", () => {
  const source = readFileSync(join(root, "app", "food-tracker.tsx"), "utf8");
  const block = source.slice(source.indexOf("const methods:"), source.indexOf("const sourceSummaries"));
  for (const method of ["saved", "describe", "scan", "manual"]) {
    assert.ok(block.includes(`id: "${method}"`), `the ${method} method is missing`);
  }
  assert.equal(block.includes('id: "search"'), false);

  // The flows those tabs drive are all still present.
  assert.ok(source.includes("/api/estimate"));
  assert.ok(source.includes("/api/barcode"));
  assert.ok(source.includes("/api/custom-foods"));
  assert.ok(source.includes("/api/entries"));
});
