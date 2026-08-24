const DEG_TO_RAD = Math.PI / 180;

export const DEFAULT_COVERAGE_THRESHOLDS = Object.freeze({
  sparseBelow: 0.90,
  crowdedAbove: 1.00
});

/**
 * Ideal symmetric biaxial tubular braid coverage model.
 *
 * q = Nc * Wy / (4 * pi * R * cos(alpha))
 * CF = 1 - (1 - q)^2, valid for ideal non-overcovered geometry q <= 1.
 *
 * alpha is defined from the braid/rope longitudinal axis.
 * BraidStudio keeps q unclamped as a geometric crowding indicator, but the
 * optical coverage equation is saturated at 1 when q > 1 because the ideal
 * cover-factor equation is outside its valid non-overlap range there.
 */
export function calculateBraidCoverage({
  carrierCount,
  yarnWidthMm,
  radiusMm,
  braidAngleDegFromAxis,
  thresholds = DEFAULT_COVERAGE_THRESHOLDS
} = {}) {
  const Nc = positiveEvenInteger(carrierCount, "carrierCount");
  const width = positiveNumber(yarnWidthMm, "yarnWidthMm");
  const radius = positiveNumber(radiusMm, "radiusMm");
  const angle = braidAngle(braidAngleDegFromAxis);
  const cosAlpha = Math.cos(angle * DEG_TO_RAD);
  const tanAlpha = Math.tan(angle * DEG_TO_RAD);
  const sparseBelow = finiteRange(thresholds?.sparseBelow ?? 0.90, 0, 1, "sparseBelow");
  const crowdedAbove = finiteRange(thresholds?.crowdedAbove ?? 1.00, 0.5, 2, "crowdedAbove");
  if (crowdedAbove < sparseBelow) throw new Error("crowdedAbove must be >= sparseBelow");

  const familySpacingMm = (4 * Math.PI * radius * cosAlpha) / Nc;
  const crowdingRatio = width / familySpacingMm;
  const clampedForOpticalCoverage = Math.min(1, Math.max(0, crowdingRatio));
  const opticalCoverageFraction = 1 - Math.pow(1 - clampedForOpticalCoverage, 2);
  const overfillRatio = Math.max(0, crowdingRatio - 1);
  const gapWidthMm = Math.max(0, familySpacingMm - width);
  const overlapEquivalentMm = Math.max(0, width - familySpacingMm);
  const helixPitchMm = tanAlpha > 0 ? (2 * Math.PI * radius) / tanAlpha : Number.POSITIVE_INFINITY;

  return {
    modelVersion: 1,
    carrierCount: Nc,
    braidAngleDegFromAxis: angle,
    evaluationRadiusMm: radius,
    yarnWidthMm: width,
    familySpacingMm,
    // "crowdingRatio" is BraidStudio's engineering name for q. It is kept
    // raw/unclamped so q > 1 can signal geometric overfill.
    crowdingRatio,
    singleFamilyCoverageRatioRaw: crowdingRatio,
    opticalCoverageFraction,
    opticalCoveragePercent: opticalCoverageFraction * 100,
    voidFraction: 1 - opticalCoverageFraction,
    overfillRatio,
    gapWidthMm,
    overlapEquivalentMm,
    helixPitchMm,
    geometricState: coverageState(crowdingRatio, sparseBelow, crowdedAbove),
    idealCoverEquationValid: crowdingRatio <= 1,
    opticalCoverageSaturated: crowdingRatio > 1,
    thresholds: { sparseBelow, crowdedAbove }
  };
}

export function requiredRadiusForCrowdingRatio({
  carrierCount,
  yarnWidthMm,
  braidAngleDegFromAxis,
  targetCrowdingRatio = 1
} = {}) {
  const Nc = positiveEvenInteger(carrierCount, "carrierCount");
  const width = positiveNumber(yarnWidthMm, "yarnWidthMm");
  const angle = braidAngle(braidAngleDegFromAxis);
  const target = positiveNumber(targetCrowdingRatio, "targetCrowdingRatio");
  const cosAlpha = Math.cos(angle * DEG_TO_RAD);
  return (Nc * width) / (4 * Math.PI * cosAlpha * target);
}

function coverageState(ratio, sparseBelow, crowdedAbove) {
  if (ratio < sparseBelow) return "sparse";
  if (ratio > crowdedAbove) return "crowded";
  return "nominal";
}

function braidAngle(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number >= 90) {
    throw new Error("braidAngleDegFromAxis must be > 0 and < 90 degrees");
  }
  return number;
}

function positiveNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${name} must be a positive number`);
  return number;
}

function positiveEvenInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 2 || number % 2 !== 0) {
    throw new Error(`${name} must be an even integer >= 2 for a symmetric biaxial braid`);
  }
  return number;
}

function finiteRange(value, min, max, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return number;
}
