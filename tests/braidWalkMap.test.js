import test from "node:test";
import assert from "node:assert/strict";
import { findMachineProfile } from "../src/machineProfiles.js";
import { buildBraidWalkMap, validateWalkMap } from "../src/engine/braidWalkMap.js";

test("provisional Tres 16x2 walk map keeps every head slot uniquely occupied", () => {
  const profile = findMachineProfile("tres_16x2_calibrated", 16);
  const walkMap = buildBraidWalkMap({ machineProfile: profile, head: 1, ticks: 16 });

  assert.equal(walkMap.status, "provisional");
  assert.equal(walkMap.provisional, true);
  assert.equal(walkMap.carrierCount, 16);
  assert.equal(walkMap.frames.length, 16);
  assert.deepEqual(validateWalkMap(walkMap), { valid: true, errors: [] });

  for (const frame of walkMap.frames) {
    assert.equal(frame.transitions.length, 16);
    assert.equal(new Set(frame.transitions.map((transition) => transition.toSlot)).size, 16);
    assert.equal(new Set(frame.transitions.map((transition) => transition.carrierNo)).size, 16);
  }
});

test("each provisional Tres crossing has symmetric partners and one top carrier", () => {
  const profile = findMachineProfile("tres_16x2_calibrated", 16);
  const walkMap = buildBraidWalkMap({ machineProfile: profile, head: 2, ticks: 2 });
  const firstFrame = walkMap.frames[0];
  const firstCrossing = firstFrame.transitions.filter((transition) => transition.crossingId === "2:0:0-1");

  assert.equal(firstCrossing.length, 2);
  assert.deepEqual(firstCrossing.map((transition) => transition.layer).sort(), ["top", "under"]);
  assert.equal(firstCrossing[0].partnerCarrierNo, firstCrossing[1].carrierNo);
  assert.equal(firstCrossing[1].partnerCarrierNo, firstCrossing[0].carrierNo);
});

test("odd and even Tres carriers advance in opposite directions at every crossing", () => {
  const profile = findMachineProfile("tres_16x2_calibrated", 16);
  const walkMap = buildBraidWalkMap({ machineProfile: profile, head: 1, ticks: 16 });

  for (const frame of walkMap.frames) {
    assert.equal(frame.validation.valid, true);
    for (const transition of frame.transitions) {
      const moduloMove = (transition.toSlot - transition.fromSlot + 16) % 16;
      assert.equal(transition.direction, transition.carrierNo % 2 === 1 ? "clockwise" : "counterClockwise");
      assert.equal(moduloMove, transition.direction === "clockwise" ? 1 : 15);
    }
    for (let index = 0; index < frame.transitions.length; index += 2) {
      const first = frame.transitions[index];
      const second = frame.transitions[index + 1];
      assert.notEqual(first.direction, second.direction);
      assert.deepEqual([first.layer, second.layer].sort(), ["top", "under"]);
    }
  }
});