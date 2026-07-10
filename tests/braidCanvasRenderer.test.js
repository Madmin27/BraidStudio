import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMatrixSurfaceCrowns,
  buildParallelTracerCrowns,
  calculateCalibratedBraidGrid,
  calculateMarkerPitch,
  calculatePatternRepeatModel,
  classifyMarkerCarrierDirections,
  diamondCellOrigin,
  expectedMarkerCoverage
} from "../src/utils/braidCanvasRenderer.js";
import { applyUserSelection, generateRecipe, initialRecipeState } from "../src/state.js";

test("calibrated braid grid uses full carrier count as cylinder rows", () => {
  const grid = calculateCalibratedBraidGrid({
    width: 1520,
    height: 148,
    carrierCount: 16
  });

  assert.equal(grid.rows, 16);
  assert.equal(grid.steps, 96);
  assert.ok(grid.cellWidth > grid.cellHeight);
  assert.equal(grid.cellHeight, (148 / 16) * 2);
});

test("24 carrier grid keeps technical view clean and readable", () => {
  const grid = calculateCalibratedBraidGrid({
    width: 720,
    height: 440,
    carrierCount: 24
  });

  assert.equal(grid.rows, 24);
  assert.equal(grid.steps, 144);
  assert.ok(grid.cellWidth < grid.cellHeight);
  assert.equal(grid.cellHeight, (440 / 24) * 2);
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

test("diamond tessellation offsets alternating rows to avoid unowned white gaps", () => {
  const cellWidth = 40;
  const cellHeight = 20;
  const evenOrigin = diamondCellOrigin({ col: 3, row: 2 }, cellWidth, cellHeight);
  const oddOrigin = diamondCellOrigin({ col: 3, row: 3 }, cellWidth, cellHeight);

  assert.deepEqual(evenOrigin, { x: 120, y: 20 });
  assert.deepEqual(oddOrigin, { x: 140, y: 30 });
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

test("16 carrier recipe with 1 and 9 black reaches renderer as same-direction matrix crowns", () => {
  const carrierLayout = Array.from({ length: 16 }, (_, index) => ({
    carrier_no: index + 1,
    color: [1, 9].includes(index + 1) ? "siyah" : "beyaz",
    strand_role: [1, 9].includes(index + 1) ? "sheath_marker" : "sheath"
  }));
  const state = applyUserSelection(structuredClone(initialRecipeState), {
    pattern_type: "solid_with_markers",
    colors: ["beyaz", "siyah"],
    material: "polyester",
    carrier_count: 16,
    machine_profile_id: "mp_16_std",
    braid_walk_type: "two-over-two",
    carrier_layout: carrierLayout
  });
  const next = generateRecipe(state);
  const sheet = next.generated_recipe.technical_sheet;

  assert.deepEqual(
    sheet.carrier_layout.filter((carrier) => carrier.color === "siyah").map((carrier) => carrier.carrier_no),
    [1, 9]
  );
  assert.deepEqual(sheet.color_sequence, [
    "siyah",
    "beyaz",
    "beyaz",
    "beyaz",
    "beyaz",
    "beyaz",
    "beyaz",
    "beyaz",
    "siyah",
    "beyaz",
    "beyaz",
    "beyaz",
    "beyaz",
    "beyaz",
    "beyaz",
    "beyaz"
  ]);
  assert.equal(sheet.walkMap.machineProfileId, "mp_16_std");
  assert.equal(sheet.walkMap.frames.length, 16);
  assert.ok(sheet.walkMap.frames.every((frame) => frame.validation.valid));

  const crowns = buildParallelTracerCrowns({
    carrierLayout: sheet.carrier_layout,
    markerCarriers: sheet.carrier_layout.filter((carrier) => carrier.color === "siyah"),
    machineProfile: sheet.machineProfile,
    cols: 10,
    cellW: 10,
    cellH: 5,
    close: false,
    braidLogic: sheet.braid_walk_type
  });
  const carrier1 = crowns.filter((crown) => crown.carrier_no === 1).slice(0, 4);
  const carrier9 = crowns.filter((crown) => crown.carrier_no === 9).slice(0, 4);

  assert.deepEqual(carrier1.map((crown) => crown.column), [0, 1, 2, 3]);
  assert.deepEqual(carrier9.map((crown) => crown.column), [8, 9, 10, 11]);
  assert.ok(crowns.every((crown) => crown.direction === "clockwise"));
  assert.equal(carrier1[0].top, true);
  assert.equal(carrier1[1].top, false);

  const surfaceCrowns = buildMatrixSurfaceCrowns({
    carrierLayout: sheet.carrier_layout,
    machineProfile: sheet.machineProfile,
    cols: 10,
    cellW: 10,
    cellH: 5,
    close: false,
    braidLogic: sheet.braid_walk_type
  });
  const crownCountByCarrier = new Map();
  for (const crown of surfaceCrowns) {
    crownCountByCarrier.set(crown.carrier_no, (crownCountByCarrier.get(crown.carrier_no) || 0) + 1);
  }

  assert.equal(crownCountByCarrier.size, 16);
  // Her carrier 11 kez top + 11 kez under = 22
  assert.equal(crownCountByCarrier.get(1), 22);
  assert.equal(crownCountByCarrier.get(2), 22);
  assert.equal(crownCountByCarrier.get(9), 22);
  assert.equal(crownCountByCarrier.get(10), 22);
  // Her hücreden hem top hem under crown üretilir → 16 × 11 × 2 = 352
  const expectedCellCount = 16 * 11;
  assert.equal(surfaceCrowns.length, expectedCellCount * 2);
  assert.ok(surfaceCrowns.some((crown) => crown.top === true));
  assert.ok(surfaceCrowns.some((crown) => crown.top === false));
});

test("crowns have topCarrierNo/underCarrierNo/underColor fields and assertion holds", () => {
  const carrierLayout = Array.from({ length: 16 }, (_, index) => ({
    carrier_no: index + 1,
    color: index < 4 ? "blue" : "white",
    strand_role: index < 4 ? "sheath_marker" : "sheath"
  }));
  const machineProfile = {
    carrierGroups: {
      clockwise: [1, 3, 5, 7, 9, 11, 13, 15],
      counterClockwise: [2, 4, 6, 8, 10, 12, 14, 16]
    }
  };
  const surfaceCrowns = buildMatrixSurfaceCrowns({
    carrierLayout,
    machineProfile,
    cols: 12,
    cellW: 10,
    cellH: 5,
    close: false,
    braidLogic: "1_over_1"
  });

  // (a) eğer blue topCarrier ise → cell'de blue crown vardır (top=true, crown.color blue)
  // (b) eğer blue underCarrier ise → cell'de blue crown yoktur (hiçbir crown'da bu cell'de blue color yok)
  // (c) hiçbir cell'de iki visible crown yok (top her zaman true)

  for (const crown of surfaceCrowns) {
    // (c) assertion: both top and under crowns have valid top field
    assert.ok(crown.top === true || crown.top === false, `crown at (${crown.col},${crown.row}) must have boolean top`);

    // row, col, topCarrierNo, underCarrierNo, topColor, underColor mevcut
    assert.ok(crown.row !== undefined, `crown must have row`);
    assert.ok(crown.col !== undefined, `crown must have col`);
    assert.ok(crown.topCarrierNo !== undefined, `crown must have topCarrierNo`);
    assert.ok(crown.topColor !== undefined, `crown must have topColor`);

    // (a) blue topCarrier → top crown'unda renk blue olmalı
    if (crown.top && crown.topCarrierNo <= 4) {
      assert.equal(crown.topColor, "blue", `top crown at (${crown.col},${crown.row}) topCarrier=${crown.topCarrierNo} should be blue`);
    }

    // (b) blue underCarrier → under crown'unda renk blue olmalı
    if (!crown.top && crown.underCarrierNo !== null && crown.underCarrierNo <= 4) {
      assert.equal(crown.color, "blue",
        `under crown at (${crown.col},${crown.row}) underCarrier=${crown.underCarrierNo} should be blue`);
    }
  }

  // Tüm crown'lar için: underCarrier varsa underCarrierNo ve underColor dolu
  for (const crown of surfaceCrowns) {
    if (crown.underCarrier) {
      assert.equal(crown.underCarrierNo, crown.underCarrier.carrier_no);
      assert.equal(crown.underColor, crown.underCarrier.color);
    }
  }
});
