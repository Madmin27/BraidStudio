/**
 * BraidStudio - Deterministik Görsel İmza Tahmin Motoru
 * (Üretim simülasyonu değildir, örüntü tabanlı imza kestirimi yapar.)
 */

function normalizeCarrierColors(carrierColorMap) {
  const warnings = [];
  if (!carrierColorMap || typeof carrierColorMap !== 'object') {
    throw new Error('Geçersiz carrierColorMap formatı.');
  }

  const indices = Object.keys(carrierColorMap).map(Number).sort((a, b) => a - b);
  if (indices.length === 0) return { colors: [], warnings };

  const maxIndex = indices[indices.length - 1];
  const colors = [];

  for (let i = 1; i <= maxIndex; i++) {
    if (carrierColorMap[i] === undefined) {
      warnings.push(`Eksik indeks tespit edildi: Taşıyıcı ${i} tanımsız. 'black' varsayıldı.`);
      colors.push('black');
    } else {
      colors.push(carrierColorMap[i]);
    }
  }
  return { colors, warnings };
}

function splitCarrierGroups(colors) {
  const clockwise = [];
  const counterClockwise = [];

  colors.forEach((color, index) => {
    const carrierNum = index + 1;
    if (carrierNum % 2 !== 0) {
      clockwise.push(color);
    } else {
      counterClockwise.push(color);
    }
  });

  return { clockwise, counterClockwise };
}

function detectPeriod(colors) {
  const n = colors.length;
  if (n === 0) return 0;

  for (let p = 1; p <= n / 2; p++) {
    if (n % p === 0) {
      let isPeriodic = true;
      for (let i = 0; i < n; i++) {
        if (colors[i] !== colors[i % p]) {
          isPeriodic = false;
          break;
        }
      }
      if (isPeriodic) return p;
    }
  }
  return n;
}

function detectBlocks(colors) {
  if (colors.length === 0) return { blockSize: 0, repeatingBlock: false };

  let maxBlockSize = 1;
  let currentBlockSize = 1;
  const blocks = [];

  for (let i = 1; i < colors.length; i++) {
    if (colors[i] === colors[i - 1]) {
      currentBlockSize++;
    } else {
      blocks.push(currentBlockSize);
      if (currentBlockSize > maxBlockSize) maxBlockSize = currentBlockSize;
      currentBlockSize = 1;
    }
  }
  blocks.push(currentBlockSize);
  if (currentBlockSize > maxBlockSize) maxBlockSize = currentBlockSize;

  // Tüm blok boyutları eşit mi kontrolü
  const firstBlock = blocks[0];
  const repeatingBlock = blocks.length > 1 && blocks.every(b => b === firstBlock);

  return {
    blockSize: repeatingBlock ? firstBlock : maxBlockSize,
    repeatingBlock
  };
}

function detectTracer(colors) {
  if (colors.length === 0) {
    return { dominantColor: null, accentColors: [], tracerPositions: [] };
  }

  const counts = {};
  colors.forEach(c => counts[c] = (counts[c] || 0) + 1);

  let dominantColor = colors[0];
  let maxCount = 0;

  for (const color in counts) {
    if (counts[color] > maxCount) {
      maxCount = counts[color];
      dominantColor = color;
    }
  }

  const accentColors = Object.keys(counts).filter(c => c !== dominantColor);
  const tracerPositions = [];

  colors.forEach((color, index) => {
    if (color !== dominantColor) {
      tracerPositions.push(index + 1);
    }
  });

  return { dominantColor, accentColors, tracerPositions };
}

function predictVisualSignature(carrierColorMap, options = {}) {
  const braidLogic = options.braidLogic || "1_over_1";
  const predictorWarnings = [];

  // 1. Normalizasyon
  const { colors, warnings: normWarnings } = normalizeCarrierColors(carrierColorMap);
  predictorWarnings.push(...normWarnings);

  const carrierCount = colors.length;
  if (carrierCount === 0) {
    return { visualSignature: "unknown", patternFamily: "unknown", confidence: 0.0, warnings: ["Boş harita."] };
  }

  // 2. Kinematik Gruplama ve Metrik Analizleri
  const { clockwise, counterClockwise } = splitCarrierGroups(colors);
  const period = detectPeriod(colors);
  const { blockSize, repeatingBlock } = detectBlocks(colors);
  const { dominantColor, accentColors, tracerPositions } = detectTracer(colors);

  const analysis = {
    carrierCount,
    period,
    blockSize,
    dominantColor,
    accentColors,
    tracerPositions,
    clockwiseColors: clockwise,
    counterClockwiseColors: counterClockwise
  };

  // Tracer Oran Hesabı
  const accentCount = tracerPositions.length;
  const accentRatio = accentCount / carrierCount;

  // Kinematik Tracer Analizi (Odd/Even Gruplama Kontrolü)
  let tracerInClockwise = false;
  let tracerInCounterClockwise = false;

  tracerPositions.forEach(pos => {
    if (pos % 2 !== 0) tracerInClockwise = true;
    if (pos % 2 === 0) tracerInCounterClockwise = true;
  });

  // 3. Karar Kuralları Matrisi
  
  // Rule A: plain_weave
  if (braidLogic === "1_over_1" && period === 2 && blockSize === 1) {
    return {
      visualSignature: "plain_weave",
      patternFamily: "diamond",
      confidence: 0.75,
      basis: ["braidLogic == 1_over_1", "period == 2", "alternating colors"],
      warnings: predictorWarnings,
      analysis
    };
  }

  // Rule B: diagonal_rib
  if (braidLogic === "2_over_2" && blockSize === 2 && repeatingBlock) {
    return {
      visualSignature: "diagonal_rib",
      patternFamily: "twill",
      confidence: 0.72,
      basis: ["braidLogic == 2_over_2", "blockSize == 2", "repeating blocks"],
      warnings: predictorWarnings,
      analysis
    };
  }

  // Rule D: dual_counter_spiral (Spiral Tracer'dan önce kontrol edilmelidir)
  if (dominantColor && accentRatio >= 0.10 && accentRatio <= 0.35 && tracerInClockwise && tracerInCounterClockwise) {
    return {
      visualSignature: "dual_counter_spiral",
      patternFamily: "tracer",
      confidence: 0.68,
      basis: ["dominant color present", "balanced accent ratio", "tracers exist in BOTH clockwise and counter-clockwise sets"],
      warnings: predictorWarnings,
      analysis
    };
  }

  // Rule C: spiral_tracer
  if (dominantColor && accentRatio >= 0.10 && accentRatio <= 0.35) {
    // Özel Kinematik Şüphe/Hata Yakalama Durumu:
    if (tracerInClockwise && !tracerInCounterClockwise && accentCount > 1) {
      predictorWarnings.push(
        "Kinematik Uyuşmazlık Uyarısı: Tüm tracer taşıyıcıları sadece TEK (Clockwise) grupta. Çift karşıt spiral yerine paralel sarmal oluşacaktır."
      );
    }
    return {
      visualSignature: "spiral_tracer",
      patternFamily: "tracer",
      confidence: 0.70,
      basis: ["dominant color present", "accent ratio between 10% and 35%"],
      warnings: predictorWarnings,
      analysis
    };
  }

  // Rule E: block_striped_segment
  if (blockSize >= carrierCount / 4) {
    return {
      visualSignature: "block_striped_segment",
      patternFamily: "stripe",
      confidence: 0.65,
      basis: ["large monolithic color blocks detected"],
      warnings: predictorWarnings,
      analysis
    };
  }

  // Rule F: unknown
  return {
    visualSignature: "unknown",
    patternFamily: "unknown",
    confidence: 0.25,
    basis: ["no explicit deterministic pattern matched"],
    warnings: predictorWarnings,
    analysis
  };
}

module.exports = {
  normalizeCarrierColors,
  splitCarrierGroups,
  detectPeriod,
  detectBlocks,
  detectTracer,
  predictVisualSignature
};
