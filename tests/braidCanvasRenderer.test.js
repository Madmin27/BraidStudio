import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCalibratedBraidGrid,
  calculateMarkerPitch,
  calculatePatternRepeatModel,
  classifyMarkerCarrierDirections,
  expectedMarkerCoverage
} from "../src/utils/braidCanvasRenderer.js";

test("calibrated braid grid uses full carrier count as cylinder rows", () => {
  const grid = calculateCalibratedBraidGrid({
    width: 1520,
    height: 148,
    carrierCount: 16
  });

  assert.equal(grid.rows, 16);
  assert.equal(grid.steps, 135);
  assert.ok(grid.cellWidth > grid.cellHeight);
  assert.equal(grid.cellHeight, 148 / 16);
});

test("24 carrier grid keeps technical view clean and readable", () => {
  const grid = calculateCalibratedBraidGrid({
    width: 720,
    height: 440,
    carrierCount: 24
  });

  assert.equal(grid.rows, 24);
  assert.equal(grid.steps, 96);
  assert.ok(grid.cellWidth < grid.cellHeight);
  assert.equal(grid.cellHeight, 440 / 24);
});

test("close grid shows multiple carrier cycles without tiling", () => {
  const grid = calculateCalibratedBraidGrid({
    width: 720,
    height: 220,
    carrierCount: 16,
    close: true
  });

  assert.equal(grid.rows, 16);
  assert.equal(grid.steps, 48);
  assert.ok(grid.cellWidth > grid.cellHeight);
});

test("marker pitch scales with carrier count instead of using a fixed repeat", () => {
  assert.equal(calculateMarkerPitch(8), 8);
  assert.equal(calculateMarkerPitch(16), 16);
  assert.equal(calculateMarkerPitch(24), 24);
  assert.equal(calculateMarkerPitch(32), 32);
});

test("expected marker coverage follows marker carrier ratio", () => {
  assert.equal(expectedMarkerCoverage(8, 2), 0.25);
  assert.equal(expectedMarkerCoverage(16, 2), 0.125);
  assert.equal(expectedMarkerCoverage(24, 2), 2 / 24);
});

test("pattern repeat model separates physical lead from marker coverage", () => {
  const model = calculatePatternRepeatModel({
    carrierCount: 16,
    markerCount: 2,
    viewLengthMm: 300,
    ropeDiameterMm: 10,
    braidAngleDeg: 45,
    columns: 58
  });

  assert.equal(model.expectedMarkerCoverage, 0.125);
  assert.ok(model.helixLeadMm > 31);
  assert.ok(model.helixLeadMm < 32);
  assert.ok(model.geometricPitchColumns > 6);
  assert.ok(model.geometricPitchColumns < 7);
  assert.equal(model.coveragePitchColumns, 16);
  assert.equal(model.markerPitchColumns, 16);
});

test("close view uses a wider marker pitch to avoid over-rendered tracer repeats", () => {
  const model = calculatePatternRepeatModel({
    carrierCount: 16,
    markerCount: 2,
    viewLengthMm: 60,
    ropeDiameterMm: 10,
    braidAngleDeg: 45,
    columns: 22,
    densityScale: 2
  });

  assert.equal(model.expectedMarkerCoverage, 0.125);
  assert.equal(model.coveragePitchColumns, 32);
  assert.equal(model.markerPitchColumns, 32);
});

test("marker pattern classification follows machine carrier directions", () => {
  const machineProfile = {
    carrierGroups: {
      clockwise: [1, 3, 5, 7, 9, 11, 13, 15],
      counterClockwise: [2, 4, 6, 8, 10, 12, 14, 16]
    }
  };
  const layout = Array.from({ length: 16 }, (_, index) => ({
    carrier_no: index + 1,
    color: [1, 9].includes(index + 1) ? "siyah" : "beyaz"
  }));
  const spiral = classifyMarkerCarrierDirections(layout, machineProfile, "beyaz");

  assert.equal(spiral.expectedPatternType, "spiral");
  assert.equal(spiral.hasIntersectingActiveStrands, false);

  layout[1].color = "siyah";
  layout[8].color = "beyaz";
  const diamond = classifyMarkerCarrierDirections(layout, machineProfile, "beyaz");

  assert.equal(diamond.expectedPatternType, "diamond");
  assert.equal(diamond.hasIntersectingActiveStrands, true);
});
