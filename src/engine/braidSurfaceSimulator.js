export function simulateBraidSurface({ recipe = {}, machineProfile = null, steps = 48 } = {}) {
  const carrierColorMap = recipe.carrierColorMap || recipe.carrier_color_map || {};
  const carrierCount = Number(machineProfile?.carrierCount || recipe.carrierCount || Object.keys(carrierColorMap).length || 0);
  const braidLogic = normalizeBraidLogic(recipe.metadata?.braidLogic || recipe.braidLogic || machineProfile?.defaultWalk || "1_over_1");
  const warnings = [];
  const carrierGroups = resolveCarrierGroups(machineProfile, carrierCount, warnings);
  const colors = normalizeCarrierColors(carrierColorMap, carrierCount);
  const baseColor = mostCommonColor(colors.filter(Boolean)) || "white";
  const accentCarriers = colors
    .map((color, index) => ({ carrierNo: index + 1, color }))
    .filter((carrier) => carrier.color && carrier.color !== baseColor);
  const accentDirections = new Set(accentCarriers.map((carrier) => carrierDirection(carrier.carrierNo, carrierGroups)));
  const crossingSchedule = crossingScheduleFor(braidLogic);
  const surfaceGrid = buildSurfaceGrid({ colors, carrierGroups, braidLogic, crossingSchedule, steps });
  const expectedVisualSignature = expectedSignatureFor({
    colors,
    braidLogic,
    accentCarriers,
    accentDirections
  });

  if (accentCarriers.length > 1 && accentDirections.size === 1) {
    warnings.push("Tracer carriers are in same direction group; counter spiral unlikely.");
  }

  return {
    expectedVisualSignature,
    surfaceGrid,
    warnings,
    confidence: confidenceFor({ warnings, carrierCount, accentCarriers, expectedVisualSignature }),
    analysis: {
      carrierCount,
      braidLogic,
      baseColor,
      accentCarriers,
      accentDirections: Array.from(accentDirections),
      crossingSchedule
    }
  };
}

export function resolveCarrierGroups(machineProfile, carrierCount, warnings = []) {
  const groups = machineProfile?.carrierGroups || {};
  const hasClockwise = Array.isArray(groups.clockwise) && groups.clockwise.length;
  const hasCounterClockwise = Array.isArray(groups.counterClockwise) && groups.counterClockwise.length;

  if (hasClockwise && hasCounterClockwise) {
    return {
      clockwise: groups.clockwise.map(Number),
      counterClockwise: groups.counterClockwise.map(Number),
      source: "machineProfile.carrierGroups"
    };
  }

  warnings.push("carrierGroups missing; using odd/even fallback (odd=CW, even=CCW).");
  return {
    clockwise: oddNumbers(carrierCount),
    counterClockwise: evenNumbers(carrierCount),
    source: "odd_even_fallback"
  };
}

function buildSurfaceGrid({ colors, carrierGroups, braidLogic, crossingSchedule, steps }) {
  const carrierCount = colors.length;
  const normalizedSteps = Math.max(1, Number(steps || 48));
  const grid = [];

  for (let step = 0; step < normalizedSteps; step += 1) {
    const slots = [];
    for (let slot = 0; slot < carrierCount; slot += 1) {
      const topDirection = crossingSchedule[step % crossingSchedule.length];
      const clockwiseCarrierNo = carrierAtSlot({ slot, step, carrierCount, direction: "clockwise", carrierGroups });
      const counterCarrierNo = carrierAtSlot({ slot, step, carrierCount, direction: "counterClockwise", carrierGroups });
      const visibleCarrierNo = topDirection === "clockwise"
        ? clockwiseCarrierNo || counterCarrierNo
        : counterCarrierNo || clockwiseCarrierNo;
      const direction = visibleCarrierNo ? carrierDirection(visibleCarrierNo, carrierGroups) : topDirection;

      slots.push({
        slot: slot + 1,
        visibleCarrierNo,
        color: visibleCarrierNo ? colors[visibleCarrierNo - 1] : null,
        direction,
        layer: topDirection
      });
    }
    grid.push({ step, slots });
  }

  return grid;
}

function carrierAtSlot({ slot, step, carrierCount, direction, carrierGroups }) {
  const candidates = direction === "clockwise" ? carrierGroups.clockwise : carrierGroups.counterClockwise;
  return candidates.find((carrierNo) => carrierColumnAt(carrierNo, carrierCount, direction, step) === slot) || null;
}

function carrierColumnAt(carrierNo, carrierCount, direction, step) {
  const start = Number(carrierNo) - 1;
  const delta = direction === "clockwise" ? step : -step;
  return positiveModulo(start + delta, carrierCount);
}

function expectedSignatureFor({ colors, braidLogic, accentCarriers, accentDirections }) {
  const period = detectPeriod(colors);
  const block = detectBlockPattern(colors);

  if (braidLogic === "1_over_1" && period === 2 && block.maxBlockSize === 1) {
    return "plain_weave";
  }

  if (braidLogic === "2_over_2" && block.repeatingBlockSize === 2) {
    return "diagonal_rib";
  }

  if (accentCarriers.length > 0 && accentDirections.size === 1) {
    return "parallel_spiral_tracer";
  }

  if (accentCarriers.length > 0 && accentDirections.size > 1) {
    return "dual_counter_spiral_candidate";
  }

  return "plain_weave";
}

function crossingScheduleFor(braidLogic) {
  if (braidLogic === "2_over_2") return ["clockwise", "clockwise", "counterClockwise", "counterClockwise"];
  return ["clockwise", "counterClockwise"];
}

function normalizeBraidLogic(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("2_over_2") || text.includes("two-over-two") || text.includes("2 alt") || text.includes("2 üst")) {
    return "2_over_2";
  }
  return "1_over_1";
}

function normalizeCarrierColors(carrierColorMap, carrierCount) {
  return Array.from({ length: carrierCount }, (_, index) => {
    const carrierNo = String(index + 1);
    return carrierColorMap[carrierNo] || carrierColorMap[index + 1] || null;
  });
}

function carrierDirection(carrierNo, carrierGroups) {
  if (carrierGroups.clockwise.includes(carrierNo)) return "clockwise";
  if (carrierGroups.counterClockwise.includes(carrierNo)) return "counterClockwise";
  return carrierNo % 2 === 1 ? "clockwise" : "counterClockwise";
}

function confidenceFor({ warnings, carrierCount, accentCarriers, expectedVisualSignature }) {
  if (!carrierCount) return 0;
  let confidence = 0.82;
  if (warnings.length) confidence -= 0.12;
  if (!accentCarriers.length && expectedVisualSignature !== "plain_weave") confidence -= 0.1;
  return Number(Math.max(0.25, Math.min(0.95, confidence)).toFixed(2));
}

function detectPeriod(colors) {
  const n = colors.length;
  for (let period = 1; period <= n / 2; period += 1) {
    if (n % period !== 0) continue;
    if (colors.every((color, index) => color === colors[index % period])) return period;
  }
  return n;
}

function detectBlockPattern(colors) {
  const blocks = [];
  let current = 1;
  for (let index = 1; index < colors.length; index += 1) {
    if (colors[index] === colors[index - 1]) current += 1;
    else {
      blocks.push(current);
      current = 1;
    }
  }
  blocks.push(current);
  const first = blocks[0] || 0;
  return {
    maxBlockSize: Math.max(...blocks, 0),
    repeatingBlockSize: blocks.length > 1 && blocks.every((block) => block === first) ? first : 0
  };
}

function mostCommonColor(colors) {
  const counts = new Map();
  for (const color of colors) counts.set(color, (counts.get(color) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function oddNumbers(count) {
  return Array.from({ length: Math.ceil(count / 2) }, (_, index) => index * 2 + 1).filter((value) => value <= count);
}

function evenNumbers(count) {
  return Array.from({ length: Math.floor(count / 2) }, (_, index) => (index + 1) * 2);
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}
