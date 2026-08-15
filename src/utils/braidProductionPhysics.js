const PET_DENSITY_KG_M3 = 1380;
const REFERENCE_DIAMETER_MM = 16;
const REFERENCE_CARRIER_COUNT = 16;
const REFERENCE_ANGLE_DEG = 34;
const REFERENCE_YARN_ENDS = 20;
const REFERENCE_DENIER_PER_END = 1000;
const radians = (degrees) => degrees * Math.PI / 180;
const degrees = (radiansValue) => radiansValue * 180 / Math.PI;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
// A zero-thickness flat braid closes at the analytical width below. A round,
// finite-thickness polyester bundle needs additional width at its curved
// over-under contacts. This factor is calibrated to the accepted 16 mm sample.
export const CYLINDRICAL_CONTACT_FACTOR = 1.55 / (2 * Math.cos(radians(REFERENCE_ANGLE_DEG)));

export function denierAreaMm2(denier, densityKgM3 = PET_DENSITY_KG_M3) {
  if (!(denier > 0) || !(densityKgM3 > 0)) throw new RangeError("Denier and density must be positive");
  return (denier / 9_000_000) / densityKgM3 * 1_000_000;
}

export function requiredCarrierWidthMm({ diameterMm, carrierCount, angleDeg }) {
  if (!(diameterMm > 0) || !(carrierCount > 0) || !(angleDeg > 0 && angleDeg < 90)) {
    throw new RangeError("Invalid braid dimensions");
  }
  return 2 * Math.PI * diameterMm * Math.cos(radians(angleDeg))
    / carrierCount * CYLINDRICAL_CONTACT_FACTOR;
}

export const REFERENCE_CARRIER_WIDTH_MM = requiredCarrierWidthMm({
  diameterMm: REFERENCE_DIAMETER_MM,
  carrierCount: REFERENCE_CARRIER_COUNT,
  angleDeg: REFERENCE_ANGLE_DEG
});

export function naturalCarrierWidthMm({ filamentCount, denier, strandWidthScale = 1 }) {
  if (!(filamentCount > 0) || !(denier > 0) || !(strandWidthScale > 0)) {
    throw new RangeError("Invalid yarn package");
  }
  const referenceTotalDenier = REFERENCE_YARN_ENDS * REFERENCE_DENIER_PER_END;
  const totalDenier = filamentCount * denier;
  return REFERENCE_CARRIER_WIDTH_MM
    * Math.sqrt(totalDenier / referenceTotalDenier)
    * strandWidthScale;
}

export function evaluateProductionFit({
  diameterMm,
  carrierCount,
  angleDeg,
  filamentCount,
  denier,
  strandWidthScale = 1,
  packingFraction = 0.82
}) {
  const requiredWidthMm = requiredCarrierWidthMm({ diameterMm, carrierCount, angleDeg });
  const carrierWidthMm = naturalCarrierWidthMm({ filamentCount, denier, strandWidthScale });
  const fillRatio = carrierWidthMm / requiredWidthMm;
  const totalDenierPerCarrier = filamentCount * denier;
  const polymerAreaMm2 = denierAreaMm2(totalDenierPerCarrier);
  const packedAreaMm2 = polymerAreaMm2 / packingFraction;
  const carrierThicknessMm = packedAreaMm2 / carrierWidthMm;
  const angleArgument = carrierWidthMm * carrierCount
    / (2 * Math.PI * diameterMm * CYLINDRICAL_CONTACT_FACTOR);
  const recommendedAngleDeg = angleArgument <= 1 ? degrees(Math.acos(angleArgument)) : null;
  const recommendedDiameterMm = carrierWidthMm * carrierCount
    / (2 * Math.PI * Math.cos(radians(angleDeg)) * CYLINDRICAL_CONTACT_FACTOR);
  const widthAt100 = naturalCarrierWidthMm({ filamentCount, denier, strandWidthScale: 1 });
  const recommendedWidthPercent = requiredWidthMm / widthAt100 * 100;
  const recommendedDenier = denier / (fillRatio * fillRatio);
  const recommendedFilamentCount = filamentCount / (fillRatio * fillRatio);

  let status = "ideal";
  let label = "Üretime uygun";
  if (fillRatio < 0.84) {
    status = "open";
    label = "Örtme yetersiz";
  } else if (fillRatio < 0.94) {
    status = "loose";
    label = "Gevşek örgü";
  } else if (fillRatio > 1.16) {
    status = "overpacked";
    label = "İp paketi sığmıyor";
  } else if (fillRatio > 1.06) {
    status = "tight";
    label = "Sıkı örgü";
  }

  return {
    status,
    label,
    fillRatio,
    fillPercent: fillRatio * 100,
    requiredWidthMm,
    carrierWidthMm,
    carrierThicknessMm,
    totalDenierPerCarrier,
    recommendedAngleDeg,
    recommendedDiameterMm,
    recommendedWidthPercent,
    recommendedDenier: clamp(recommendedDenier, 1, 100_000),
    recommendedFilamentCount: clamp(recommendedFilamentCount, 1, 10_000)
  };
}
