import test from "node:test";
import assert from "node:assert/strict";
import { calculateBraidCoverage, requiredRadiusForCrowdingRatio } from "../src/physics/braidCoverage.js";

function coverage(overrides = {}) {
  return calculateBraidCoverage({
    carrierCount: 16,
    yarnWidthMm: 1,
    radiusMm: 5,
    braidAngleDegFromAxis: 45,
    ...overrides
  });
}

test("coverage increases with carrier count and yarn width", () => {
  const base = coverage();
  const moreCarriers = coverage({ carrierCount: 24 });
  const widerYarn = coverage({ yarnWidthMm: 1.5 });
  assert.ok(moreCarriers.crowdingRatio > base.crowdingRatio);
  assert.ok(widerYarn.crowdingRatio > base.crowdingRatio);
});

test("coverage decreases on a larger core radius", () => {
  const small = coverage({ radiusMm: 4 });
  const large = coverage({ radiusMm: 8 });
  assert.ok(large.crowdingRatio < small.crowdingRatio);
  assert.ok(large.opticalCoverageFraction < small.opticalCoverageFraction);
});

test("angle from rope axis is explicit and steeper braid increases q", () => {
  const shallow = coverage({ braidAngleDegFromAxis: 30 });
  const steep = coverage({ braidAngleDegFromAxis: 60 });
  assert.ok(steep.crowdingRatio > shallow.crowdingRatio);
  assert.ok(steep.helixPitchMm < shallow.helixPitchMm);
});

test("ideal optical coverage saturates at one while raw crowding remains unclamped", () => {
  const crowded = coverage({ yarnWidthMm: 4 });
  assert.ok(crowded.crowdingRatio > 1);
  assert.equal(crowded.opticalCoverageFraction, 1);
  assert.equal(crowded.idealCoverEquationValid, false);
  assert.ok(crowded.overfillRatio > 0);
  assert.ok(crowded.overlapEquivalentMm > 0);
});

test("sparse braid reports a physical family gap", () => {
  const sparse = coverage({ yarnWidthMm: 0.5, radiusMm: 8 });
  assert.equal(sparse.geometricState, "sparse");
  assert.ok(sparse.gapWidthMm > 0);
  assert.equal(sparse.overlapEquivalentMm, 0);
});

test("required radius gives target crowding ratio", () => {
  const targetRadius = requiredRadiusForCrowdingRatio({
    carrierCount: 16,
    yarnWidthMm: 2,
    braidAngleDegFromAxis: 45,
    targetCrowdingRatio: 1
  });
  const solved = coverage({ yarnWidthMm: 2, radiusMm: targetRadius });
  assert.ok(Math.abs(solved.crowdingRatio - 1) < 1e-12);
});

test("odd carrier counts are rejected for symmetric biaxial solver", () => {
  assert.throws(() => coverage({ carrierCount: 15 }), /even integer/);
});
