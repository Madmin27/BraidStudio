export const MATERIAL_PROFILES = Object.freeze({
  polyester: Object.freeze({
    material: "polyester",
    shortCode: "PES",
    densityGcm3: 1.38,
    densityBasis: "nominal_reference"
  }),
  polypropylene: Object.freeze({
    material: "polypropylene",
    shortCode: "PP",
    densityGcm3: 0.91,
    densityBasis: "nominal_reference"
  }),
  nylon: Object.freeze({
    material: "nylon",
    shortCode: "PA",
    densityGcm3: 1.14,
    densityBasis: "nominal_reference"
  }),
  cotton: Object.freeze({
    material: "cotton",
    shortCode: "CO",
    densityGcm3: 1.54,
    densityBasis: "nominal_reference"
  })
});

const MATERIAL_ALIASES = Object.freeze({
  pes: "polyester",
  polyester: "polyester",
  pet: "polyester",
  pp: "polypropylene",
  polypropylene: "polypropylene",
  polypropylen: "polypropylene",
  nylon: "nylon",
  pa: "nylon",
  pa6: "nylon",
  pa66: "nylon",
  cotton: "cotton",
  pamuk: "cotton"
});

export function normalizeMaterialName(value) {
  const key = String(value || "").trim().toLowerCase();
  return MATERIAL_ALIASES[key] || key || "unknown";
}

export function resolveMaterialProfile(material, densityOverrideGcm3 = null) {
  const normalized = normalizeMaterialName(material);
  const known = MATERIAL_PROFILES[normalized] || null;
  const override = Number(densityOverrideGcm3);

  if (Number.isFinite(override) && override > 0) {
    return {
      material: normalized,
      shortCode: known?.shortCode || normalized.slice(0, 3).toUpperCase() || "MAT",
      densityGcm3: override,
      densityBasis: "user_override"
    };
  }

  if (!known) {
    throw new Error(`unsupported material density: ${material || "unknown"}; provide densityGcm3`);
  }

  return { ...known };
}
