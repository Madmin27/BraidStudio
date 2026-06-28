export const visualSignatureAliases = {
  herringbone: "diagonal_rib",
  spiral_tracer: "single_spiral_tracer",
  block_stripe: "block_striped_segment"
};

export function normalizeVisualSignature(value) {
  const key = String(value || "").trim();
  return visualSignatureAliases[key] || key;
}

export function signaturesCompatible(a, b) {
  if (!a || !b) return false;
  return normalizeVisualSignature(a) === normalizeVisualSignature(b);
}

export function getSignatureDefinition(patternSignatures, visualSignature) {
  const normalized = normalizeVisualSignature(visualSignature);
  return patternSignatures[visualSignature] || patternSignatures[normalized] || null;
}
