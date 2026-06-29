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
  assert.equal(grid.steps, 160);
  assert.equal(grid.cellWidth, grid.cellHeight);
  assert.equal(grid.cellHeight, 148 / 16);
});

test("24 carrier grid uses a long seamless step count", () => {
  const grid = calculateCalibratedBraidGrid({
    width: 720,
    height: 440,
    carrierCount: 24
  });

  assert.equal(grid.rows, 24);
  assert.equal(grid.steps, 96);
  assert.equal(grid.cellWidth, grid.cellHeight);
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
  assert.equal(grid.steps, 91);
  assert.equal(grid.cellWidth, grid.cellHeight);
});
