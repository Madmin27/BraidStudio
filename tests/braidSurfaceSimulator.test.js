import test from "node:test";
import assert from "node:assert/strict";
import { loadLibrary } from "../server/lib/libraryLoader.js";
import { resolveCarrierGroups, simulateBraidSurface } from "../src/engine/braidSurfaceSimulator.js";

test("rec_12_medical_dual_trace is same-direction parallel tracer, not counter spiral", async () => {
  const library = await loadLibrary(process.cwd());
  const recipe = library.recipes.find((item) => item.recipeId === "rec_12_medical_dual_trace");
  const machineProfile = library.machines.find((item) => item.machineProfileId === recipe.machineProfileId);
  const result = simulateBraidSurface({ recipe, machineProfile, steps: 12 });

  assert.equal(result.expectedVisualSignature, "parallel_spiral_tracer");
  assert.equal(result.analysis.accentDirections.length, 1);
  assert.deepEqual(result.analysis.accentDirections, ["clockwise"]);
  assert.ok(result.warnings.includes("Tracer carriers are in same direction group; counter spiral unlikely."));
  assert.equal(result.surfaceGrid.length, 12);
});

test("simulator warns when machine profile needs odd/even direction fallback", () => {
  const warnings = [];
  const groups = resolveCarrierGroups({ carrierCount: 8 }, 8, warnings);

  assert.deepEqual(groups.clockwise, [1, 3, 5, 7]);
  assert.deepEqual(groups.counterClockwise, [2, 4, 6, 8]);
  assert.ok(warnings.some((warning) => warning.includes("odd/even fallback")));
});

test("alternating 1_over_1 color map resolves to plain weave", () => {
  const recipe = {
    braidLogic: "1_over_1",
    carrierColorMap: {
      "1": "white",
      "2": "black",
      "3": "white",
      "4": "black"
    }
  };
  const machineProfile = {
    carrierCount: 4,
    carrierGroups: {
      clockwise: [1, 3],
      counterClockwise: [2, 4]
    }
  };
  const result = simulateBraidSurface({ recipe, machineProfile, steps: 4 });

  assert.equal(result.expectedVisualSignature, "plain_weave");
});

test("2_over_2 repeated two-color blocks resolve to diagonal rib", () => {
  const recipe = {
    braidLogic: "2_over_2",
    carrierColorMap: {
      "1": "white",
      "2": "white",
      "3": "black",
      "4": "black",
      "5": "white",
      "6": "white",
      "7": "black",
      "8": "black"
    }
  };
  const machineProfile = {
    carrierCount: 8,
    carrierGroups: {
      clockwise: [1, 3, 5, 7],
      counterClockwise: [2, 4, 6, 8]
    }
  };
  const result = simulateBraidSurface({ recipe, machineProfile, steps: 4 });

  assert.equal(result.expectedVisualSignature, "diagonal_rib");
});
