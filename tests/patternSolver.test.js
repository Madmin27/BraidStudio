import test from "node:test";
import assert from "node:assert/strict";
import { loadLibrary } from "../server/lib/libraryLoader.js";
import { solvePattern } from "../server/lib/patternSolver.js";

test("plain_weave matches rec_16_lvl1_diamond", async () => {
  const library = await loadLibrary(process.cwd());
  const result = solvePattern({ visualSignature: "plain_weave", colors: ["white", "black"], estimatedCarrierCount: 16 }, library);

  assert.equal(result.possibleRecipes[0].recipeId, "rec_16_lvl1_diamond");
});

test("diagonal_rib matches rec_16_lvl3_herringbone", async () => {
  const library = await loadLibrary(process.cwd());
  const result = solvePattern({ visualSignature: "diagonal_rib", colors: ["white", "black"], estimatedCarrierCount: 16 }, library);

  assert.equal(result.possibleRecipes[0].recipeId, "rec_16_lvl3_herringbone");
});

test("spiral_tracer matches rec_24_tracer_rope", async () => {
  const library = await loadLibrary(process.cwd());
  const result = solvePattern({ visualSignature: "spiral_tracer", colors: ["white", "red"], estimatedCarrierCount: 24 }, library);

  assert.ok(result.possibleRecipes.some((recipe) => recipe.recipeId === "rec_24_tracer_rope"));
});
