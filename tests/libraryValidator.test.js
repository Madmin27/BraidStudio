import test from "node:test";
import assert from "node:assert/strict";
import { loadLibrary } from "../server/lib/libraryLoader.js";
import { validateLibrary } from "../server/lib/libraryValidator.js";

test("library validator accepts current data with candidate warnings", async () => {
  const library = await loadLibrary(process.cwd());
  const result = validateLibrary(library);

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.ok(result.warnings.some((warning) => warning.includes("not_production_ready")));
});

test("invalid carrierColorMap count returns validation error", async () => {
  const library = await loadLibrary(process.cwd());
  const broken = structuredClone(library);
  broken.recipes[0].carrierColorMap = { "1": "white" };
  const result = validateLibrary(broken);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("carrierColorMap_count")));
});

test("recipe scenario library is loaded for renderer consistency checks", async () => {
  const library = await loadLibrary(process.cwd());
  const scenarioA = library.patternScenarios.find((scenario) => scenario.id === "recipe_senaryo_a");
  const twinDiamond = library.patternScenarios.find((scenario) => scenario.id === "recipe_twin_diamond");

  assert.equal(scenarioA.physicsValidation.expectedPatternType, "spiral");
  assert.equal(scenarioA.physicsValidation.hasIntersectingActiveStrands, false);
  assert.equal(twinDiamond.physicsValidation.expectedPatternType, "diamond");
  assert.equal(twinDiamond.physicsValidation.hasIntersectingActiveStrands, true);
});
