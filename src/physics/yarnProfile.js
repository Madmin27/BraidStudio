import { normalizeMaterialName, resolveMaterialProfile } from "./materialProfiles.js";

export const DEFAULT_YARN_ASSUMPTIONS = Object.freeze({
  packingFactor: 0.72,
  baseAspectRatio: 2.0,
  compressibility: 0.25
});

export function resolveCarrierDenier(input = {}) {
  const denier = positiveNumber(
    input.linearDensityDenier ?? input.denier ?? input.denierPerEnd,
    "linearDensityDenier"
  );
  const basis = normalizeDenierBasis(input.denierBasis);
  const endsPerCarrier = positiveInteger(input.endsPerCarrier ?? 1, "endsPerCarrier");
  const pliesPerEnd = positiveInteger(input.pliesPerEnd ?? 1, "pliesPerEnd");

  return {
    linearDensityDenier: denier,
    denierBasis: basis,
    endsPerCarrier,
    pliesPerEnd,
    carrierDenier: basis === "per_ply"
      ? denier * pliesPerEnd * endsPerCarrier
      : denier * endsPerCarrier
  };
}

export function buildYarnProfile(input = {}) {
  const denier = resolveCarrierDenier(input);
  const material = resolveMaterialProfile(input.material, input.densityGcm3);
  const warnings = [];
  const assumptions = [];

  const packingFactor = resolveFraction({
    value: input.packingFactor,
    fallback: DEFAULT_YARN_ASSUMPTIONS.packingFactor,
    name: "packingFactor",
    warnings,
    assumptions,
    fallbackLabel: "generic_packing_factor"
  });
  const baseAspectRatio = resolveRange({
    value: input.baseAspectRatio,
    fallback: DEFAULT_YARN_ASSUMPTIONS.baseAspectRatio,
    min: 1,
    max: 12,
    name: "baseAspectRatio",
    warnings,
    assumptions,
    fallbackLabel: "generic_ellipse_aspect_ratio"
  });
  const compressibility = resolveRange({
    value: input.compressibility,
    fallback: DEFAULT_YARN_ASSUMPTIONS.compressibility,
    min: 0,
    max: 1,
    name: "compressibility",
    warnings,
    assumptions,
    fallbackLabel: "generic_compressibility"
  });

  // Denier is g / 9000 m. With density in g/cm3, this expression gives mm2 directly.
  const solidAreaMm2 = denier.carrierDenier / (9000 * material.densityGcm3);
  const denierEstimatedBundleAreaMm2 = solidAreaMm2 / packingFactor;

  const measuredWidthMm = optionalPositiveNumber(input.measuredWidthMm, "measuredWidthMm");
  const measuredThicknessMm = optionalPositiveNumber(input.measuredThicknessMm, "measuredThicknessMm");

  const geometry = resolveEllipseGeometry({
    measuredWidthMm,
    measuredThicknessMm,
    denierEstimatedBundleAreaMm2,
    baseAspectRatio,
    solidAreaMm2,
    explicitPackingFactor: input.packingFactor !== null && input.packingFactor !== undefined,
    warnings
  });

  const filamentsPerEnd = optionalPositiveInteger(input.filamentsPerEnd, "filamentsPerEnd");
  const totalFilamentsPerCarrier = filamentsPerEnd
    ? filamentsPerEnd * denier.endsPerCarrier
    : null;

  const confidence = geometryConfidence({
    measuredWidthMm,
    measuredThicknessMm,
    explicitPackingFactor: input.packingFactor !== null && input.packingFactor !== undefined,
    explicitDensity: input.densityGcm3 !== null && input.densityGcm3 !== undefined,
    explicitAspectRatio: input.baseAspectRatio !== null && input.baseAspectRatio !== undefined
  });

  const normalizedInput = {
    material: material.material,
    linearDensityDenier: denier.linearDensityDenier,
    denierBasis: denier.denierBasis,
    endsPerCarrier: denier.endsPerCarrier,
    pliesPerEnd: denier.pliesPerEnd,
    filamentsPerEnd,
    densityGcm3: material.densityGcm3,
    packingFactor,
    baseAspectRatio,
    compressibility,
    measuredWidthMm,
    measuredThicknessMm
  };

  return deepFreeze({
    profileVersion: 1,
    cacheKey: buildYarnProfileCacheKey(normalizedInput),
    material: {
      name: material.material,
      shortCode: material.shortCode,
      densityGcm3: material.densityGcm3,
      densityBasis: material.densityBasis
    },
    construction: {
      linearDensityDenier: denier.linearDensityDenier,
      denierBasis: denier.denierBasis,
      endsPerCarrier: denier.endsPerCarrier,
      pliesPerEnd: denier.pliesPerEnd,
      filamentsPerEnd,
      totalFilamentsPerCarrier,
      carrierDenier: denier.carrierDenier
    },
    area: {
      solidAreaMm2,
      denierEstimatedBundleAreaMm2,
      effectiveBundleAreaMm2: geometry.effectiveAreaMm2,
      packingFactor,
      inferredPackingFactor: geometry.inferredPackingFactor
    },
    crossSection: {
      model: "ellipse",
      geometrySource: geometry.geometrySource,
      widthMm: geometry.widthMm,
      thicknessMm: geometry.thicknessMm,
      aspectRatio: geometry.widthMm / geometry.thicknessMm,
      compressibility
    },
    surface: {
      filamentsPerEnd,
      totalFilamentsPerCarrier,
      microTextureScaleBasis: filamentsPerEnd ? "filament_count" : "generic"
    },
    confidence,
    warnings,
    assumptions,
    normalizedInput
  });
}

export function buildYarnProfileCacheKey(input = {}) {
  const material = normalizeMaterialName(input.material);
  const values = [
    `mat=${material}`,
    `D=${numberKey(input.linearDensityDenier ?? input.denier ?? input.denierPerEnd)}`,
    `basis=${normalizeDenierBasis(input.denierBasis)}`,
    `ends=${numberKey(input.endsPerCarrier ?? 1)}`,
    `plies=${numberKey(input.pliesPerEnd ?? 1)}`,
    `fil=${numberKey(input.filamentsPerEnd)}`,
    `rho=${numberKey(input.densityGcm3)}`,
    `phi=${numberKey(input.packingFactor)}`,
    `ar=${numberKey(input.baseAspectRatio)}`,
    `cmp=${numberKey(input.compressibility)}`,
    `mw=${numberKey(input.measuredWidthMm)}`,
    `mt=${numberKey(input.measuredThicknessMm)}`
  ];
  return `yarn-v1|${values.join("|")}`;
}

function resolveEllipseGeometry({
  measuredWidthMm,
  measuredThicknessMm,
  denierEstimatedBundleAreaMm2,
  baseAspectRatio,
  solidAreaMm2,
  explicitPackingFactor,
  warnings
}) {
  if (measuredWidthMm && measuredThicknessMm) {
    const measuredAreaMm2 = ellipseArea(measuredWidthMm, measuredThicknessMm);
    const inferredPackingFactor = solidAreaMm2 / measuredAreaMm2;
    if (inferredPackingFactor > 1.02 || inferredPackingFactor < 0.2) {
      warnings.push("Measured yarn cross-section is materially inconsistent with denier/density assumptions.");
    } else if (explicitPackingFactor) {
      const mismatch = Math.abs(measuredAreaMm2 - denierEstimatedBundleAreaMm2) / measuredAreaMm2;
      if (mismatch > 0.2) {
        warnings.push("Measured cross-section and supplied packingFactor differ by more than 20%; measured geometry is used for preview.");
      }
    }
    return {
      geometrySource: "measured_width_and_thickness",
      widthMm: measuredWidthMm,
      thicknessMm: measuredThicknessMm,
      effectiveAreaMm2: measuredAreaMm2,
      inferredPackingFactor
    };
  }

  if (measuredWidthMm) {
    const thicknessMm = (4 * denierEstimatedBundleAreaMm2) / (Math.PI * measuredWidthMm);
    return {
      geometrySource: "measured_width_denier_inferred_thickness",
      widthMm: measuredWidthMm,
      thicknessMm,
      effectiveAreaMm2: denierEstimatedBundleAreaMm2,
      inferredPackingFactor: null
    };
  }

  if (measuredThicknessMm) {
    const widthMm = (4 * denierEstimatedBundleAreaMm2) / (Math.PI * measuredThicknessMm);
    return {
      geometrySource: "measured_thickness_denier_inferred_width",
      widthMm,
      thicknessMm: measuredThicknessMm,
      effectiveAreaMm2: denierEstimatedBundleAreaMm2,
      inferredPackingFactor: null
    };
  }

  const widthMm = Math.sqrt((4 * denierEstimatedBundleAreaMm2 * baseAspectRatio) / Math.PI);
  const thicknessMm = widthMm / baseAspectRatio;
  return {
    geometrySource: "denier_density_packing_estimate",
    widthMm,
    thicknessMm,
    effectiveAreaMm2: denierEstimatedBundleAreaMm2,
    inferredPackingFactor: null
  };
}

function geometryConfidence({ measuredWidthMm, measuredThicknessMm, explicitPackingFactor, explicitDensity, explicitAspectRatio }) {
  let score = 0.42;
  const reasons = [];
  if (measuredWidthMm && measuredThicknessMm) {
    score = 0.88;
    reasons.push("measured yarn width and thickness supplied");
  } else if (measuredWidthMm || measuredThicknessMm) {
    score = 0.72;
    reasons.push("one measured yarn cross-section dimension supplied");
  } else {
    reasons.push("cross-section estimated from denier/density/packing assumptions");
  }
  if (explicitPackingFactor) score += 0.05;
  else reasons.push("packingFactor uses generic estimate");
  if (explicitDensity) score += 0.02;
  if (explicitAspectRatio && !measuredWidthMm && !measuredThicknessMm) score += 0.04;
  return {
    level: score >= 0.8 ? "measured_input" : score >= 0.6 ? "constrained_estimate" : "estimated",
    score: Number(Math.min(0.95, score).toFixed(2)),
    reasons
  };
}

function normalizeDenierBasis(value) {
  const basis = String(value || "per_end").toLowerCase();
  if (!new Set(["per_end", "per_ply"]).has(basis)) {
    throw new Error(`denierBasis must be per_end or per_ply; received ${value}`);
  }
  return basis;
}

function resolveFraction({ value, fallback, name, warnings, assumptions, fallbackLabel }) {
  if (value === null || value === undefined || value === "") {
    assumptions.push(fallbackLabel);
    return fallback;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 1) {
    throw new Error(`${name} must be > 0 and <= 1`);
  }
  if (number < 0.35 || number > 0.95) warnings.push(`${name}=${number} is outside the usual generic working range; verify shop data.`);
  return number;
}

function resolveRange({ value, fallback, min, max, name, warnings, assumptions, fallbackLabel }) {
  if (value === null || value === undefined || value === "") {
    assumptions.push(fallbackLabel);
    return fallback;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  if (number === min || number === max) warnings.push(`${name} is at the supported boundary; verify input.`);
  return number;
}

function positiveNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${name} must be a positive number`);
  return number;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${name} must be a positive integer`);
  return number;
}

function optionalPositiveNumber(value, name) {
  if (value === null || value === undefined || value === "") return null;
  return positiveNumber(value, name);
}

function optionalPositiveInteger(value, name) {
  if (value === null || value === undefined || value === "") return null;
  return positiveInteger(value, name);
}

function ellipseArea(widthMm, thicknessMm) {
  return Math.PI * widthMm * thicknessMm / 4;
}

function numberKey(value) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  return Number.isFinite(number) ? String(Number(number.toPrecision(12))) : String(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
