import test from "node:test";
import assert from "node:assert/strict";
import { calculateCalibratedBraidGrid } from "../src/utils/braidCanvasRenderer.js";

test("calibrated braid grid uses full carrier count as cylinder rows", () => {
  const grid = calculateCalibratedBraidGrid({
    width: 1520,
    height: 148,
    carrierCount: 16
  });

  assert.equal(grid.rows, 16);
  assert.equal(grid.cellWidth, grid.cellHeight);
  assert.equal(grid.steps, Math.floor(1520 / (148 / 16)));
});

test("24 carrier grid uses 24 rows and lowers marker over-rendering", () => {
  const grid = calculateCalibratedBraidGrid({
    width: 720,
    height: 440,
    carrierCount: 24
  });

  assert.equal(grid.rows, 24);
  assert.equal(grid.cellWidth, 440 / 24);
  assert.equal(grid.steps, Math.floor(720 / grid.cellWidth));
});

test("close grid shows at least one full carrier cycle", () => {
  const grid = calculateCalibratedBraidGrid({
    width: 720,
    height: 220,
    carrierCount: 16,
    close: true
  });

  assert.equal(grid.rows, 16);
  assert.equal(grid.steps, 24);
  assert.equal(grid.cellWidth, 720 / 24);
});
