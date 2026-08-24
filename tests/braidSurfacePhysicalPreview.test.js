import test from "node:test";
import assert from "node:assert/strict";
import { simulateBraidSurface } from "../src/engine/braidSurfaceSimulator.js";

const machineProfile = {
  machineProfileId: "test_16",
  status: "generic_candidate",
  carrierCount: 16,
  defaultWalk: "1_over_1",
  carrierGroups: {
    clockwise: [1, 3, 5, 7, 9, 11, 13, 15],
    counterClockwise: [2, 4, 6, 8, 10, 12, 14, 16]
  }
};

const carrierColorMap = Object.fromEntries(
  Array.from({ length: 16 }, (_, index) => [String(index + 1), index % 2 ? "black" : "white"])
);

test("surface simulator attaches physical preview when physical inputs exist", () => {
  const result = simulateBraidSurface({
    machineProfile,
    recipe: {
      carrierColorMap,
      metadata: { braidLogic: "1_over_1" },
      yarnConstruction: {
        material: "polyester",
        linearDensityDenier: 1000,
        denierBasis: "per_end",
        endsPerCarrier: 2,
        packingFactor: 0.75,
        baseAspectRatio: 2.2
      },
      braidGeometry: {
        coreDiameterMm: 8,
        braidAngleDegFromAxis: 45
      }
    }
  });

  assert.equal(result.analysis.physicalCarrierCount, 16);
  assert.equal(result.analysis.crossingsPerIdealTick, 8);
  assert.equal(result.analysis.physicalPreview.engine, "BraidStudioPhysicalPreview");
  assert.equal(result.analysis.physicalPreview.rendererContract.physicalCarrierCount, 16);
});

test("surface simulator remains backward compatible without physical inputs", () => {
  const result = simulateBraidSurface({
    machineProfile,
    recipe: {
      carrierColorMap,
      metadata: { braidLogic: "1_over_1" }
    }
  });

  assert.equal(result.analysis.physicalPreview, null);
  assert.equal(result.surfaceGrid.length > 0, true);
});
