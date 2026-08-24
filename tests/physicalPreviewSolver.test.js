import test from "node:test";
import assert from "node:assert/strict";
import { solvePhysicalPreview } from "../src/physics/physicalPreviewSolver.js";

const baseInput = {
  yarnConstruction: {
    material: "polyester",
    linearDensityDenier: 1000,
    denierBasis: "per_end",
    endsPerCarrier: 4,
    pliesPerEnd: 1,
    filamentsPerEnd: 192,
    packingFactor: 0.75,
    baseAspectRatio: 2.2
  },
  braidGeometry: {
    coreDiameterMm: 8,
    braidAngleDegFromAxis: 45
  },
  carrierCount: 16
};

test("physical preview is deterministic for identical input", () => {
  const a = solvePhysicalPreview(baseInput);
  const b = solvePhysicalPreview(baseInput);
  assert.deepEqual(a, b);
});

test("physical carrier count is not confused with crossings per tick", () => {
  const result = solvePhysicalPreview(baseInput);
  assert.equal(result.inputs.physicalCarrierCount, 16);
  assert.equal(result.inputs.crossingsPerIdealTick, 8);
  assert.equal(result.rendererContract.physicalCarrierCount, 16);
  assert.equal(result.rendererContract.crossingsPerTick, 8);
});

test("more ends per carrier increases coverage and outer build", () => {
  const thin = solvePhysicalPreview({
    ...baseInput,
    yarnConstruction: { ...baseInput.yarnConstruction, endsPerCarrier: 2 }
  });
  const thick = solvePhysicalPreview({
    ...baseInput,
    yarnConstruction: { ...baseInput.yarnConstruction, endsPerCarrier: 8 }
  });

  assert.ok(thick.coverage.initial.crowdingRatio > thin.coverage.initial.crowdingRatio);
  assert.ok(thick.yarnProfile.crossSection.widthMm > thin.yarnProfile.crossSection.widthMm);
  assert.ok(thick.geometry.predictedOuterDiameterMm > thin.geometry.predictedOuterDiameterMm);
});

test("larger core reduces crowding for same yarn construction", () => {
  const smallCore = solvePhysicalPreview(baseInput);
  const largeCore = solvePhysicalPreview({
    ...baseInput,
    braidGeometry: { ...baseInput.braidGeometry, coreDiameterMm: 16 }
  });
  assert.ok(largeCore.coverage.initial.crowdingRatio < smallCore.coverage.initial.crowdingRatio);
});

test("coreless braid is supported and core bleed is not applicable", () => {
  const result = solvePhysicalPreview({
    ...baseInput,
    braidGeometry: {
      ...baseInput.braidGeometry,
      corePresent: false,
      coreDiameterMm: 0
    }
  });
  assert.equal(result.inputs.corePresent, false);
  assert.equal(result.rendererContract.corePresent, false);
  assert.equal(result.diagnostics.coreBleedRisk, "not_applicable");
  assert.ok(result.geometry.predictedOuterDiameterMm > 0);
});

test("corePresent true rejects a zero core diameter", () => {
  assert.throws(() => solvePhysicalPreview({
    ...baseInput,
    braidGeometry: {
      ...baseInput.braidGeometry,
      corePresent: true,
      coreDiameterMm: 0
    }
  }), /requires coreDiameterMm/);
});

test("crowded construction reports radial relief and estimated crown", () => {
  const crowded = solvePhysicalPreview({
    ...baseInput,
    yarnConstruction: {
      ...baseInput.yarnConstruction,
      linearDensityDenier: 3000,
      endsPerCarrier: 8,
      baseAspectRatio: 3.0
    },
    braidGeometry: {
      ...baseInput.braidGeometry,
      coreDiameterMm: 4,
      braidAngleDegFromAxis: 60
    }
  });

  assert.ok(crowded.coverage.initial.crowdingRatio > 1);
  assert.ok(crowded.deformation.requiredRadialReliefMm > 0);
  assert.ok(crowded.deformation.estimatedAdditionalCrownMm > 0);
  assert.equal(crowded.coverage.initial.opticalCoverageFraction, 1);
  assert.ok(crowded.warnings.some((warning) => warning.includes("saturated")));
});

test("default result never claims micron accuracy", () => {
  const result = solvePhysicalPreview(baseInput);
  assert.equal(result.confidence.dimensionalClaim, "engineering_preview_not_micron_accuracy");
  assert.notEqual(result.confidence.level, "calibrated");
});

test("shop calibration and measured yarn geometry improve confidence", () => {
  const result = solvePhysicalPreview({
    ...baseInput,
    yarnConstruction: {
      ...baseInput.yarnConstruction,
      measuredWidthMm: 1.4,
      measuredThicknessMm: 0.55
    },
    braidGeometry: {
      ...baseInput.braidGeometry,
      braidAngleMeasured: true
    },
    machineProfile: {
      machineProfileId: "shop_16",
      carrierCount: 16,
      status: "shop_measured"
    },
    deformationCalibration: {
      source: "shop_calibrated",
      baseCrossingCompressionRatio: 0.08,
      overfillCompressionGain: 0.3,
      maxCrossingCompressionRatio: 0.25,
      crownResponse: 0.7,
      targetCrowdingRatio: 1
    }
  });
  assert.equal(result.deformation.confidence.level, "calibrated");
  assert.equal(result.confidence.level, "calibrated");
});
