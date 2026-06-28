import { normalizeVisualSignature } from "./signatureUtils.js";

export function generateCandidateColorMap(input) {
  const carrierCount = Number(input?.carrierCount || 0);
  if (!Number.isInteger(carrierCount) || carrierCount <= 0) {
    throw Object.assign(new Error("invalid_carrier_count"), { statusCode: 400 });
  }

  const colors = normalizeColors(input?.colors);
  const signature = normalizeVisualSignature(input?.visualSignature);
  const base = colors[0];
  const accent = colors[1] || colors[0];
  let sequence;
  let generationRule;

  if (signature === "plain_weave") {
    sequence = Array.from({ length: carrierCount }, (_, index) => colors[index % colors.length]);
    generationRule = "alternating";
  } else if (signature === "diagonal_rib") {
    sequence = Array.from({ length: carrierCount }, (_, index) => colors[Math.floor(index / 2) % colors.length]);
    generationRule = "paired_block";
  } else if (signature === "single_spiral_tracer") {
    const accentPositions = spiralTracerPositions(carrierCount, Number(input?.tracerCount || 0));
    sequence = Array.from({ length: carrierCount }, (_, index) => (
      accentPositions.has(index + 1) ? accent : base
    ));
    generationRule = "spiral_tracer_spacing";
  } else if (signature === "block_striped_segment") {
    sequence = groupedBlocks(carrierCount, colors);
    generationRule = "grouped_blocks";
  } else {
    sequence = Array.from({ length: carrierCount }, (_, index) => colors[index % colors.length]);
    generationRule = "alternating_fallback";
  }

  return {
    carrierColorMap: Object.fromEntries(sequence.map((color, index) => [String(index + 1), color])),
    generationRule,
    status: "candidate"
  };
}

function normalizeColors(colors) {
  const list = Array.isArray(colors) ? colors.map((color) => String(color).trim()).filter(Boolean) : [];
  return list.length ? list : ["white", "black"];
}

function spiralTracerPositions(carrierCount, tracerCount) {
  if (carrierCount === 16) return new Set([1, 5, 9, 13]);
  if (carrierCount === 24 && tracerCount === 3) return new Set([1, 9, 17]);
  if (carrierCount === 24) return new Set([1, 7, 13, 19]);

  const count = tracerCount || Math.max(1, Math.round(carrierCount / 6));
  const step = Math.max(1, Math.floor(carrierCount / count));
  return new Set(Array.from({ length: count }, (_, index) => 1 + index * step).filter((position) => position <= carrierCount));
}

function groupedBlocks(carrierCount, colors) {
  const blockSize = Math.ceil(carrierCount / colors.length);
  return Array.from({ length: carrierCount }, (_, index) => colors[Math.min(colors.length - 1, Math.floor(index / blockSize))]);
}
