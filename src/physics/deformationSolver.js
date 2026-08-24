import { requiredRadiusForCrowdingRatio } from "./braidCoverage.js";

export const DEFAULT_DEFORMATION_CALIBRATION = Object.freeze({
  baseCrossingCompressionRatio: 0.06,
  overfillCompressionGain: 0.35,
  maxCrossingCompressionRatio: 0.30,
  crownResponse: 0.65,
  targetCrowdingRatio: 1.0,
  source: "generic_estimate"
});

/**
 * Low-cost semi-empirical crossing deformation model.
 *
 * Deterministic part:
 * - requiredRadiusForNoInPlaneOverlapMm is the radius required to reduce the
 *   raw crowding ratio to targetCrowdingRatio while keeping yarn width fixed.
 * - requiredRadialReliefMm is therefore a geometry diagnostic, not an FEA result.
 *
 * Estimated part:
 * - crossing compression and how much required radial relief becomes visible
 *   crown are calibration coefficients. They must be replaced by shop-measured
 *   values before claiming production-level dimensional accuracy.
 */
export function solveCrossingDeformation({
  yarnProfile,
  coverage,
  calibration = {}
} = {}) {
  if (!yarnProfile?.crossSection) throw new Error("yarnProfile.crossSection is required");
  if (!coverage) throw new Error("coverage is required");

  const cfg = normalizeCalibration(calibration);
  const thicknessMm = positiveNumber(yarnProfile.crossSection.thicknessMm, "yarn thickness");
  const widthMm = positiveNumber(yarnProfile.crossSection.widthMm, "yarn width");
  const compressibility = finiteRange(yarnProfile.crossSection.compressibility ?? 0.25, 0, 1, "compressibility");
  const overfillRatio = Math.max(0, Number(coverage.overfillRatio || 0));

  const overfillCompression = overfillRatio * cfg.overfillCompressionGain * compressibility;
  const crossingCompressionRatio = clamp(
    cfg.baseCrossingCompressionRatio + overfillCompression,
    0,
    cfg.maxCrossingCompressionRatio
  );
  const crossingThicknessMm = thicknessMm * (1 - crossingCompressionRatio);

  const requiredRadiusMm = requiredRadiusForCrowdingRatio({
    carrierCount: coverage.carrierCount,
    yarnWidthMm: widthMm,
    braidAngleDegFromAxis: coverage.braidAngleDegFromAxis,
    targetCrowdingRatio: cfg.targetCrowdingRatio
  });
  const requiredRadialReliefMm = Math.max(0, requiredRadiusMm - coverage.evaluationRadiusMm);
  const estimatedAdditionalCrownMm = requiredRadialReliefMm * cfg.crownResponse;
  const underDepressionMm = thicknessMm * crossingCompressionRatio * 0.5;
  const topUpliftMm = crossingThicknessMm * 0.5 + estimatedAdditionalCrownMm;

  return {
    modelVersion: 1,
    modelClass: "semi_empirical",
    crossingCompressionRatio,
    freeThicknessMm: thicknessMm,
    crossingThicknessMm,
    requiredRadiusForNoInPlaneOverlapMm: requiredRadiusMm,
    requiredRadialReliefMm,
    estimatedAdditionalCrownMm,
    underDepressionMm,
    topUpliftMm,
    crownIndex: thicknessMm > 0 ? estimatedAdditionalCrownMm / thicknessMm : 0,
    calibration: cfg,
    confidence: {
      level: cfg.source === "shop_calibrated" ? "calibrated" : "estimated",
      reason: cfg.source === "shop_calibrated"
        ? "shop calibration coefficients supplied"
        : "generic deformation coefficients; tension and machine compaction are not measured"
    }
  };
}

function normalizeCalibration(input = {}) {
  return {
    baseCrossingCompressionRatio: finiteRange(
      input.baseCrossingCompressionRatio ?? DEFAULT_DEFORMATION_CALIBRATION.baseCrossingCompressionRatio,
      0,
      0.6,
      "baseCrossingCompressionRatio"
    ),
    overfillCompressionGain: finiteRange(
      input.overfillCompressionGain ?? DEFAULT_DEFORMATION_CALIBRATION.overfillCompressionGain,
      0,
      3,
      "overfillCompressionGain"
    ),
    maxCrossingCompressionRatio: finiteRange(
      input.maxCrossingCompressionRatio ?? DEFAULT_DEFORMATION_CALIBRATION.maxCrossingCompressionRatio,
      0,
      0.8,
      "maxCrossingCompressionRatio"
    ),
    crownResponse: finiteRange(
      input.crownResponse ?? DEFAULT_DEFORMATION_CALIBRATION.crownResponse,
      0,
      2,
      "crownResponse"
    ),
    targetCrowdingRatio: positiveNumber(
      input.targetCrowdingRatio ?? DEFAULT_DEFORMATION_CALIBRATION.targetCrowdingRatio,
      "targetCrowdingRatio"
    ),
    source: input.source === "shop_calibrated" ? "shop_calibrated" : "generic_estimate"
  };
}

function positiveNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${name} must be a positive number`);
  return number;
}

function finiteRange(value, min, max, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return number;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
