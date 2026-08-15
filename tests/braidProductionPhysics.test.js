import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateProductionFit,
  naturalCarrierWidthMm,
  requiredCarrierWidthMm
} from "../src/utils/braidProductionPhysics.js";

test("16 carrier default is calibrated to closed 34 degree coverage", () => {
  const fit = evaluateProductionFit({
    diameterMm: 16,
    carrierCount: 16,
    angleDeg: 34,
    filamentCount: 20,
    denier: 1000,
    strandWidthScale: 1
  });
  assert.equal(fit.status, "ideal");
  assert.ok(Math.abs(fit.fillRatio - 1) < 1e-12);
  assert.ok(Math.abs(fit.recommendedAngleDeg - 34) < 1e-12);
  assert.ok(Math.abs(fit.recommendedFilamentCount - 20) < 1e-12);
});

test("larger diameter with same yarn package becomes open", () => {
  const fit = evaluateProductionFit({
    diameterMm: 24,
    carrierCount: 16,
    angleDeg: 34,
    filamentCount: 20,
    denier: 1000,
    strandWidthScale: 1
  });
  assert.equal(fit.status, "open");
  assert.ok(fit.fillRatio < 0.84);
});

test("axis-referenced higher angle requires less circumferential carrier width", () => {
  const low = requiredCarrierWidthMm({ diameterMm: 16, carrierCount: 16, angleDeg: 30 });
  const high = requiredCarrierWidthMm({ diameterMm: 16, carrierCount: 16, angleDeg: 45 });
  assert.ok(high < low);
});

test("carrier width follows square root of loaded linear density", () => {
  const base = naturalCarrierWidthMm({ filamentCount: 20, denier: 1000 });
  const doubleMass = naturalCarrierWidthMm({ filamentCount: 40, denier: 1000 });
  assert.ok(Math.abs(doubleMass / base - Math.sqrt(2)) < 1e-12);
});
