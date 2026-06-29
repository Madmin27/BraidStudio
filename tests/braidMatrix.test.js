import test from "node:test";
import assert from "node:assert/strict";
import { buildBraidMatrix, getCarrierDirection, topDirectionAt } from "../src/utils/braidMatrix.js";

const mp16 = {
  machineProfileId: "mp_16_std",
  carrierCount: 16,
  carrierGroups: {
    clockwise: [1, 3, 5, 7, 9, 11, 13, 15],
    counterClockwise: [2, 4, 6, 8, 10, 12, 14, 16]
  }
};

function layoutWithBlue(carriers) {
  return Array.from({ length: 16 }, (_, index) => ({
    carrier_no: index + 1,
    color: carriers.includes(index + 1) ? "blue" : "white",
    strand_role: carriers.includes(index + 1) ? "sheath_marker" : "sheath"
  }));
}

test("same odd marker carriers stay in clockwise parallel paths", () => {
  const matrix = buildBraidMatrix({
    carrierLayout: layoutWithBlue([1, 9]),
    machineProfile: mp16,
    braidLogic: "2_over_2",
    steps: 4
  });
  const carrier1 = matrix.carrierPaths.find((path) => path.carrier.carrier_no === 1);
  const carrier9 = matrix.carrierPaths.find((path) => path.carrier.carrier_no === 9);

  assert.equal(getCarrierDirection(1, mp16), "clockwise");
  assert.equal(getCarrierDirection(9, mp16), "clockwise");
  assert.deepEqual(carrier1.points.map((point) => point.column), [0, 1, 2, 3]);
  assert.deepEqual(carrier9.points.map((point) => point.column), [8, 9, 10, 11]);
});

test("odd/even marker carriers move in opposite directions", () => {
  const matrix = buildBraidMatrix({
    carrierLayout: layoutWithBlue([1, 8]),
    machineProfile: mp16,
    braidLogic: "2_over_2",
    steps: 4
  });
  const carrier1 = matrix.carrierPaths.find((path) => path.carrier.carrier_no === 1);
  const carrier8 = matrix.carrierPaths.find((path) => path.carrier.carrier_no === 8);

  assert.equal(getCarrierDirection(1, mp16), "clockwise");
  assert.equal(getCarrierDirection(8, mp16), "counterClockwise");
  assert.deepEqual(carrier1.points.map((point) => point.column), [0, 1, 2, 3]);
  assert.deepEqual(carrier8.points.map((point) => point.column), [7, 6, 5, 4]);
});

test("adjacent marker carriers 1 and 2 create opposing maypole paths", () => {
  const matrix = buildBraidMatrix({
    carrierLayout: layoutWithBlue([1, 2]),
    machineProfile: mp16,
    braidLogic: "two-over-two",
    steps: 5
  });
  const carrier1 = matrix.carrierPaths.find((path) => path.carrier.carrier_no === 1);
  const carrier2 = matrix.carrierPaths.find((path) => path.carrier.carrier_no === 2);

  assert.equal(carrier1.carrier.direction, "clockwise");
  assert.equal(carrier2.carrier.direction, "counterClockwise");
  assert.deepEqual(carrier1.points.map((point) => point.column), [0, 1, 2, 3, 4]);
  assert.deepEqual(carrier2.points.map((point) => point.column), [1, 0, 15, 14, 13]);
});

test("two over two top direction changes every two cells", () => {
  assert.equal(topDirectionAt({ time: 0, column: 0, braidLogic: "2_over_2" }), "clockwise");
  assert.equal(topDirectionAt({ time: 0, column: 1, braidLogic: "2_over_2" }), "clockwise");
  assert.equal(topDirectionAt({ time: 0, column: 2, braidLogic: "2_over_2" }), "counterClockwise");
  assert.equal(topDirectionAt({ time: 0, column: 3, braidLogic: "2_over_2" }), "counterClockwise");
});

test("standard walk is one-over-one top alternation", () => {
  assert.equal(topDirectionAt({ time: 0, column: 0, braidLogic: "standard" }), "clockwise");
  assert.equal(topDirectionAt({ time: 0, column: 1, braidLogic: "standard" }), "counterClockwise");
  assert.equal(topDirectionAt({ time: 0, column: 2, braidLogic: "standard" }), "clockwise");
});

test("counter rotating walk mirrors the standard top phase", () => {
  assert.equal(topDirectionAt({ time: 0, column: 0, braidLogic: "counter-rotating" }), "counterClockwise");
  assert.equal(topDirectionAt({ time: 0, column: 1, braidLogic: "counter-rotating" }), "clockwise");
  assert.equal(topDirectionAt({ time: 0, column: 2, braidLogic: "counter-rotating" }), "counterClockwise");
});
