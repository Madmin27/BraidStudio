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
  assert.equal(result.isReliable, false);
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

test("unknown surfaces do not default to plain weave", () => {
  const recipe = {
    braidLogic: "2_over_2",
    carrierColorMap: {
      "1": "white",
      "2": "white",
      "3": "white",
      "4": "white",
      "5": "white",
      "6": "white",
      "7": "white",
      "8": "white"
    }
  };
  const machineProfile = {
    carrierCount: 8,
    carrierGroups: {
      clockwise: [1, 3, 5, 7],
      counterClockwise: [2, 4, 6, 8]
    }
  };
  const result = simulateBraidSurface({ recipe, machineProfile, steps: 8 });

  assert.equal(result.expectedVisualSignature, "unknown");
  assert.equal(result.confidence, 0.3);
  assert.equal(result.isReliable, false);
});

test("missing carriers produce warnings and unreliable simulation", () => {
  const recipe = {
    braidLogic: "1_over_1",
    carrierColorMap: {
      "1": "white",
      "2": "black"
    }
  };
  const machineProfile = {
    carrierCount: 4,
    carrierGroups: {
      clockwise: [1, 3],
      counterClockwise: [2, 4]
    }
  };
  const result = simulateBraidSurface({ recipe, machineProfile, steps: 8 });

  assert.ok(result.warnings.some((warning) => warning.includes("Missing carrier color: carrier 3")));
  assert.ok(result.warnings.some((warning) => warning.includes("Missing carrier color: carrier 4")));
  assert.equal(result.isReliable, false);
});

test("steps are clamped to 256", () => {
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
  const result = simulateBraidSurface({ recipe, machineProfile, steps: 999 });

  assert.equal(result.surfaceGrid.length, 256);
  assert.equal(result.analysis.steps, 256);
  assert.ok(result.warnings.includes("steps clamped to 256"));
});

test("mp_24_standard carrierGroups drive same-direction tracer simulation", async () => {
  const library = await loadLibrary(process.cwd());
  const machineProfile = library.machines.find((item) => item.machineProfileId === "mp_24_standard");
  const recipe = {
    braidLogic: "2_over_2",
    carrierColorMap: Object.fromEntries(Array.from({ length: 24 }, (_, index) => [
      String(index + 1),
      [1, 9, 17].includes(index + 1) ? "black" : "white"
    ]))
  };
  const result = simulateBraidSurface({ recipe, machineProfile, steps: 24 });

  assert.equal(result.expectedVisualSignature, "parallel_spiral_tracer");
  assert.deepEqual(result.analysis.accentDirections, ["clockwise"]);
});
