import { calculateBraidCoverage } from "./braidCoverage.js";
import { solveCrossingDeformation } from "./deformationSolver.js";
import { getCachedYarnProfile } from "./yarnProfileCache.js";

export const PHYSICAL_PREVIEW_UNITS = Object.freeze({
  length: "mm",
  area: "mm2",
  density: "g/cm3",
  linearDensity: "denier_g_per_9000m",
  angle: "deg_from_rope_axis"
});

export const DEFAULT_DIAGNOSTIC_THRESHOLDS = Object.freeze({
  coreBleedHighBelowCoverage: 0.80,
  coreBleedMediumBelowCoverage: 0.95,
  jammingMediumAboveOverfill: 0.02,
  jammingHighAboveOverfill: 0.12
});

export function solvePhysicalPreview({
  yarnConstruction,
  braidGeometry = {},
  carrierCount = null,
  machineProfile = null,
  deformationCalibration = null,
  diagnosticThresholds = DEFAULT_DIAGNOSTIC_THRESHOLDS
} = {}) {
  const physicalCarrierCount = resolveCarrierCount(carrierCount, braidGeometry, machineProfile);
  const yarnProfile = getCachedYarnProfile(yarnConstruction || {});
  const coreDiameterMm = positiveNumber(
    braidGeometry.coreDiameterMm ?? braidGeometry.core_diameter_mm,
    "braidGeometry.coreDiameterMm"
  );
  const braidAngleDegFromAxis = resolveBraidAngle(braidGeometry, machineProfile);

  const coreRadiusMm = coreDiameterMm / 2;
  const freeThicknessMm = yarnProfile.crossSection.thicknessMm;
  const nominalYarnCenterlineRadiusMm = coreRadiusMm + freeThicknessMm / 2;

  const initialCoverage = calculateBraidCoverage({
    carrierCount: physicalCarrierCount,
    yarnWidthMm: yarnProfile.crossSection.widthMm,
    radiusMm: nominalYarnCenterlineRadiusMm,
    braidAngleDegFromAxis,
    thresholds: braidGeometry.coverageThresholds
  });

  const deformation = solveCrossingDeformation({
    yarnProfile,
    coverage: initialCoverage,
    calibration: deformationCalibration || {}
  });

  const estimatedYarnCenterlineRadiusMm = nominalYarnCenterlineRadiusMm + deformation.estimatedAdditionalCrownMm;
  const relaxedCoverage = calculateBraidCoverage({
    carrierCount: physicalCarrierCount,
    yarnWidthMm: yarnProfile.crossSection.widthMm,
    radiusMm: estimatedYarnCenterlineRadiusMm,
    braidAngleDegFromAxis,
    thresholds: braidGeometry.coverageThresholds
  });

  const predictedOuterDiameterMm = 2 * (
    estimatedYarnCenterlineRadiusMm + deformation.crossingThicknessMm / 2
  );
  const diagnostics = buildDiagnostics(initialCoverage, relaxedCoverage, diagnosticThresholds);
  const confidence = buildConfidence({ yarnProfile, deformation, machineProfile, braidGeometry });

  return {
    engine: "BraidStudioPhysicalPreview",
    engineVersion: 1,
    units: PHYSICAL_PREVIEW_UNITS,
    inputs: {
      physicalCarrierCount,
      crossingsPerIdealTick: physicalCarrierCount / 2,
      coreDiameterMm,
      braidAngleDegFromAxis,
      machineProfileId: machineProfile?.machineProfileId || null
    },
    yarnProfile,
    geometry: {
      coreRadiusMm,
      nominalYarnCenterlineRadiusMm,
      estimatedYarnCenterlineRadiusMm,
      predictedOuterDiameterMm,
      helixPitchMm: relaxedCoverage.helixPitchMm
    },
    coverage: {
      initial: initialCoverage,
      postDeformationEstimate: relaxedCoverage
    },
    deformation,
    diagnostics,
    rendererContract: {
      physicalCarrierCount,
      crossingsPerTick: physicalCarrierCount / 2,
      yarnWidthMm: yarnProfile.crossSection.widthMm,
      yarnFreeThicknessMm: yarnProfile.crossSection.thicknessMm,
      yarnCrossingThicknessMm: deformation.crossingThicknessMm,
      braidAngleDegFromAxis,
      helixPitchMm: relaxedCoverage.helixPitchMm,
      nominalYarnCenterlineRadiusMm,
      estimatedYarnCenterlineRadiusMm,
      topCrossingUpliftMm: deformation.topUpliftMm,
      underCrossingDepressionMm: deformation.underDepressionMm,
      material: yarnProfile.material.name,
      yarnProfileCacheKey: yarnProfile.cacheKey,
      totalFilamentsPerCarrier: yarnProfile.surface.totalFilamentsPerCarrier
    },
    confidence,
    warnings: collectWarnings({ yarnProfile, initialCoverage, deformation, machineProfile })
  };
}

function resolveCarrierCount(carrierCount, braidGeometry, machineProfile) {
  const value = Number(
    carrierCount ??
    braidGeometry.carrierCount ??
    machineProfile?.carriersPerHead ??
    machineProfile?.carrierCount
  );
  if (!Number.isInteger(value) || value < 2 || value % 2 !== 0) {
    throw new Error("physical carrierCount must be an even integer >= 2");
  }
  return value;
}

function resolveBraidAngle(braidGeometry, machineProfile) {
  const value = Number(
    braidGeometry.braidAngleDegFromAxis ??
    braidGeometry.braidAngleDeg ??
    machineProfile?.kinematics?.defaultBraidAngle ??
    45
  );
  if (!Number.isFinite(value) || value <= 0 || value >= 90) {
    throw new Error("braid angle must be > 0 and < 90 degrees from the rope axis");
  }
  return value;
}

function buildDiagnostics(initialCoverage, relaxedCoverage, thresholds = {}) {
  const cfg = {
    ...DEFAULT_DIAGNOSTIC_THRESHOLDS,
    ...(thresholds || {})
  };
  const optical = relaxedCoverage.opticalCoverageFraction;
  const overfill = initialCoverage.overfillRatio;

  return {
    modelClass: "geometric_heuristic",
    coreBleedRisk: optical < cfg.coreBleedHighBelowCoverage
      ? "high"
      : optical < cfg.coreBleedMediumBelowCoverage
        ? "medium"
        : "low",
    surfaceOpeningRisk: optical < cfg.coreBleedHighBelowCoverage
      ? "high"
      : optical < cfg.coreBleedMediumBelowCoverage
        ? "medium"
        : "low",
    jammingRisk: overfill > cfg.jammingHighAboveOverfill
      ? "high"
      : overfill > cfg.jammingMediumAboveOverfill
        ? "medium"
        : "low",
    rawGapWidthMm: relaxedCoverage.gapWidthMm,
    rawOverlapEquivalentMm: initialCoverage.overlapEquivalentMm,
    overfillRatio: overfill,
    opticalCoverageFraction: optical,
    note: "Risk labels are preview heuristics until shop calibration is available."
  };
}

function buildConfidence({ yarnProfile, deformation, machineProfile, braidGeometry }) {
  let score = Number(yarnProfile.confidence?.score || 0.4);
  const reasons = [...(yarnProfile.confidence?.reasons || [])];

  if (deformation.confidence.level === "calibrated") {
    score += 0.12;
    reasons.push("shop-calibrated deformation coefficients supplied");
  } else {
    score -= 0.08;
    reasons.push("deformation uses generic coefficients");
  }

  const machineValidated = machineProfile?.status === "shop_measured" || machineProfile?.shopMeasured === true;
  if (machineValidated) {
    score += 0.08;
    reasons.push("machine profile is shop measured");
  } else {
    score -= 0.05;
    reasons.push("machine path/kinematics are not shop measured");
  }

  if (braidGeometry?.braidAngleMeasured === true) {
    score += 0.08;
    reasons.push("braid angle is measured");
  } else {
    reasons.push("braid angle is selected/estimated rather than measured");
  }

  score = Math.max(0.2, Math.min(0.95, score));
  return {
    level: score >= 0.8 ? "calibrated" : score >= 0.6 ? "constrained_estimate" : "estimated",
    score: Number(score.toFixed(2)),
    reasons,
    dimensionalClaim: "engineering_preview_not_micron_accuracy"
  };
}

function collectWarnings({ yarnProfile, initialCoverage, deformation, machineProfile }) {
  const warnings = [...(yarnProfile.warnings || [])];
  if (!initialCoverage.idealCoverEquationValid) {
    warnings.push("Ideal optical cover-factor equation is saturated because crowdingRatio > 1; overfill is handled as a separate geometry diagnostic.");
  }
  if (deformation.confidence.level !== "calibrated") {
    warnings.push("Crown/compression values are semi-empirical estimates; shop calibration is required for dimensional production claims.");
  }
  if (!machineProfile || (machineProfile.status !== "shop_measured" && machineProfile.shopMeasured !== true)) {
    warnings.push("Machine profile is not shop measured; physical preview is not production-certified.");
  }
  return warnings;
}

function positiveNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${name} must be a positive number`);
  return number;
}
