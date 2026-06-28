/**
 * BraidStudio deterministic visual signature predictor.
 * This is pattern inference, not production simulation.
 */

export function normalizeCarrierColors(carrierColorMap = {}, carrierCount = 0) {
  if (!carrierColorMap || typeof carrierColorMap !== "object") {
    throw new Error("Geçersiz carrierColorMap formatı.");
  }

  const normalizedCount = carrierCount || inferCarrierCount(carrierColorMap);
  const colors = [];
  const warnings = [];
  const missingCarriers = [];

  for (let carrierNo = 1; carrierNo <= normalizedCount; carrierNo += 1) {
    const value = carrierColorMap[String(carrierNo)] ?? carrierColorMap[carrierNo];
    if (value === undefined || value === null || String(value).trim() === "") {
      colors.push(null);
      missingCarriers.push(carrierNo);
      warnings.push(`Eksik taşıyıcı rengi: carrier ${carrierNo}`);
    } else {
      colors.push(String(value).trim());
    }
  }

  return {
    colors,
    warnings,
    missingCarriers
  };
}

export function splitCarrierGroups(carrierCountOrColors, options = {}) {
  const carrierCount = Array.isArray(carrierCountOrColors) ? carrierCountOrColors.length : Number(carrierCountOrColors || 0);
  const groups = options.machineProfile?.carrierGroups || {};
  const clockwise = Array.isArray(groups.clockwise) && groups.clockwise.length
    ? groups.clockwise
    : oddNumbers(carrierCount);
  const counterClockwise = Array.isArray(groups.counterClockwise) && groups.counterClockwise.length
    ? groups.counterClockwise
    : evenNumbers(carrierCount);

  return {
    clockwise,
    counterClockwise
  };
}

export function detectPeriod(colors = []) {
  const n = colors.length;
  if (n === 0) return 0;

  for (let period = 1; period <= n / 2; period += 1) {
    if (n % period !== 0) continue;
    let isPeriodic = true;
    for (let index = 0; index < n; index += 1) {
      if (colors[index] !== colors[index % period]) {
        isPeriodic = false;
        break;
      }
    }
    if (isPeriodic) return period;
  }
  return n;
}

export function detectBlocks(colors = []) {
  if (colors.length === 0) return { blockSize: 0, repeatingBlock: false };

  const blocks = [];
  let currentBlockSize = 1;
  let maxBlockSize = 1;

  for (let index = 1; index < colors.length; index += 1) {
    if (colors[index] === colors[index - 1]) {
      currentBlockSize += 1;
    } else {
      blocks.push(currentBlockSize);
      maxBlockSize = Math.max(maxBlockSize, currentBlockSize);
      currentBlockSize = 1;
    }
  }
  blocks.push(currentBlockSize);
  maxBlockSize = Math.max(maxBlockSize, currentBlockSize);

  const firstBlock = blocks[0];
  const repeatingBlock = blocks.length > 1 && blocks.every((block) => block === firstBlock);
  return {
    blockSize: repeatingBlock ? firstBlock : maxBlockSize,
    repeatingBlock
  };
}

export function detectTracer(colors = []) {
  const presentColors = colors.filter((color) => color !== null);
  if (presentColors.length === 0) {
    return { dominantColor: null, accentColors: [], tracerPositions: [] };
  }

  const dominantColor = mostCommonColor(presentColors);
  const accentColors = [...new Set(presentColors.filter((color) => color !== dominantColor))];
  const tracerPositions = colors
    .map((color, index) => ({ color, position: index + 1 }))
    .filter((item) => item.color !== null && item.color !== dominantColor)
    .map((item) => item.position);

  return { dominantColor, accentColors, tracerPositions };
}

export function predictVisualSignature(carrierColorMap = {}, braidLogicOrOptions = "1_over_1", maybeOptions = {}) {
  const parsed = parsePredictOptions(braidLogicOrOptions, maybeOptions);
  const carrierCount = Number(parsed.machineProfile?.carrierCount || parsed.carrierCount || inferCarrierCount(carrierColorMap));
  const normalized = normalizeCarrierColors(carrierColorMap, carrierCount);
  const colors = normalized.colors;
  const warnings = [...normalized.warnings];

  if (colors.length === 0) {
    return finalizeResult({
      visualSignature: "unknown",
      patternFamily: "unknown",
      confidence: 0,
      basis: ["Boş harita."],
      warnings,
      analysis: {
        carrierCount: 0,
        braidLogic: parsed.braidLogic,
        colors,
        missingCarriers: normalized.missingCarriers
      }
    });
  }

  const period = detectPeriod(colors);
  const { blockSize, repeatingBlock } = detectBlocks(colors);
  const tracer = detectTracer(colors);
  const groups = splitCarrierGroups(colors.length, parsed);
  const accentCarriers = tracer.tracerPositions.map((carrierNo) => ({
    carrierNo,
    color: colors[carrierNo - 1]
  }));
  const accentGroupUsage = analyzeAccentGroups(accentCarriers, groups);
  const accentRatio = accentCarriers.length / colors.length;
  const hasAdjacentTracerCluster = hasAdjacentPositions(tracer.tracerPositions);
  const analysis = {
    carrierCount: colors.length,
    braidLogic: parsed.braidLogic,
    period,
    blockSize,
    dominantColor: tracer.dominantColor,
    accentColors: tracer.accentColors,
    tracerPositions: tracer.tracerPositions,
    colors,
    carrierGroups: groups,
    clockwiseColors: groups.clockwise.map((carrierNo) => colors[carrierNo - 1]),
    counterClockwiseColors: groups.counterClockwise.map((carrierNo) => colors[carrierNo - 1]),
    accentCarriers,
    accentGroupUsage,
    hasAdjacentTracerCluster,
    missingCarriers: normalized.missingCarriers
  };

  if (normalized.missingCarriers.length) {
    warnings.push("Eksik taşıyıcı nedeniyle görsel imza güvenilir değildir.");
  }

  if (parsed.braidLogic === "1_over_1" && period === 2 && blockSize === 1) {
    return finalizeResult({
      visualSignature: "plain_weave",
      patternFamily: "diamond",
      confidence: 0.75,
      basis: ["braidLogic == 1_over_1", "period == 2", "alternating colors"],
      warnings,
      analysis
    });
  }

  if (parsed.braidLogic === "2_over_2" && blockSize === 2 && repeatingBlock) {
    return finalizeResult({
      visualSignature: "diagonal_rib",
      patternFamily: "twill",
      confidence: 0.72,
      basis: ["braidLogic == 2_over_2", "blockSize == 2", "repeating blocks"],
      warnings,
      analysis
    });
  }

  if (tracer.dominantColor && accentRatio >= 0.10 && accentRatio <= 0.45 && hasAdjacentTracerCluster) {
    return finalizeResult({
      visualSignature: "spiral_tracer",
      patternFamily: "tracer",
      confidence: 0.7,
      basis: ["dominant color present", "adjacent multi-color tracer cluster", "spiral tracer group"],
      warnings,
      analysis
    });
  }

  if (tracer.dominantColor && accentRatio >= 0.10 && accentRatio <= 0.35 && accentGroupUsage.clockwise > 0 && accentGroupUsage.counterClockwise > 0) {
    return finalizeResult({
      visualSignature: "dual_counter_spiral",
      patternFamily: "tracer",
      confidence: 0.68,
      basis: ["dominant color present", "balanced accent ratio", "tracers exist in BOTH clockwise and counter-clockwise sets"],
      warnings,
      analysis
    });
  }

  if (tracer.dominantColor && accentRatio >= 0.10 && accentRatio <= 0.35) {
    if (accentCarriers.length > 1 && (accentGroupUsage.clockwise === 0 || accentGroupUsage.counterClockwise === 0)) {
      warnings.push(
        "Kinematik Uyuşmazlık Uyarısı: Tüm tracer taşıyıcıları sadece tek hareket grubunda; çift karşıt spiral yerine paralel sarmal oluşacaktır."
      );
    }
    return finalizeResult({
      visualSignature: "spiral_tracer",
      patternFamily: "tracer",
      confidence: warnings.some((warning) => warning.includes("Kinematik Uyuşmazlık")) ? 0.5 : 0.70,
      basis: ["dominant color present", "accent ratio between 10% and 35%"],
      warnings,
      analysis
    });
  }

  if (blockSize >= colors.length / 4) {
    return finalizeResult({
      visualSignature: "block_striped_segment",
      patternFamily: "stripe",
      confidence: 0.65,
      basis: ["large monolithic color blocks detected"],
      warnings,
      analysis
    });
  }

  return finalizeResult({
    visualSignature: "unknown",
    patternFamily: "unknown",
    confidence: 0.25,
    basis: ["no explicit deterministic pattern matched"],
    warnings,
    analysis
  });
}

function parsePredictOptions(braidLogicOrOptions, maybeOptions) {
  if (braidLogicOrOptions && typeof braidLogicOrOptions === "object") {
    return {
      ...braidLogicOrOptions,
      braidLogic: braidLogicOrOptions.braidLogic || "1_over_1"
    };
  }

  return {
    ...maybeOptions,
    braidLogic: braidLogicOrOptions || maybeOptions.braidLogic || "1_over_1"
  };
}

function finalizeResult(result) {
  const missingCarrierCount = result.analysis?.missingCarriers?.length || 0;
  const adjustedConfidence = clamp01(result.confidence - Math.min(0.35, missingCarrierCount * 0.08));
  const isReliable = (
    missingCarrierCount === 0 &&
    result.visualSignature !== "unknown" &&
    !result.warnings.some((warning) => warning.includes("Kinematik Uyuşmazlık"))
  );

  return {
    ...result,
    confidence: adjustedConfidence,
    isReliable
  };
}

function inferCarrierCount(carrierColorMap = {}) {
  return Object.keys(carrierColorMap)
    .map((key) => Number(key))
    .filter(Number.isFinite)
    .reduce((max, value) => Math.max(max, value), 0);
}

function oddNumbers(count) {
  return Array.from({ length: Math.ceil(count / 2) }, (_, index) => index * 2 + 1).filter((value) => value <= count);
}

function evenNumbers(count) {
  return Array.from({ length: Math.floor(count / 2) }, (_, index) => (index + 1) * 2);
}

function mostCommonColor(colors = []) {
  const counts = new Map();
  for (const color of colors) {
    counts.set(color, (counts.get(color) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || null;
}

function analyzeAccentGroups(accentCarriers, groups) {
  const clockwise = new Set(groups.clockwise);
  const counterClockwise = new Set(groups.counterClockwise);
  return accentCarriers.reduce((usage, carrier) => {
    if (clockwise.has(carrier.carrierNo)) usage.clockwise += 1;
    if (counterClockwise.has(carrier.carrierNo)) usage.counterClockwise += 1;
    return usage;
  }, { clockwise: 0, counterClockwise: 0 });
}

function hasAdjacentPositions(positions = []) {
  const ordered = [...positions].sort((a, b) => a - b);
  return ordered.some((position, index) => index > 0 && position === ordered[index - 1] + 1);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}
