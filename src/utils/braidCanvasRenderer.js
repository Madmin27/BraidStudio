import { buildBraidMatrix, topDirectionAt } from "./braidMatrix.js";

/* app.js'teki colorMap ile birebir uyumlu. Turkish/English renk adlarının
   her ikisi de aynı hex'e çözümlenir, böylece "siyah" FALLBACK_COLORS'ta
   bulunamayıp gri/#8d9892'ye düşmez. */
const FALLBACK_COLORS = {
  siyah: "#1b1f1d",
  black: "#1b1f1d",
  kırmızı: "#bd2f2b",
  red: "#bd2f2b",
  lacivert: "#1f3d70",
  blue: "#1f3d70",
  beyaz: "#f8faf9",
  white: "#f8faf9",
  gray: "#77817b",
  gri: "#77817b",
  nylon: "#d8dde0",
  sarı: "#d7a800",
  yellow: "#d7d900",
  yeşil: "#2d7d46",
  green: "#2d7d46",
  turuncu: "#d96c1a",
  orange: "#d96c1a",
  mor: "#6b3fa0",
  purple: "#6b3fa0",
  pembe: "#d45087",
  pink: "#d45087"
};

export function drawMainRopeCanvas(canvas, sheet, options = {}) {
  const ctx = canvas?.getContext?.("2d");
  if (!ctx) return null;

  // HiDPI / Retina: CSS mantıksal boyutunu al, buffer'ı dpr katı yap
  const rect = canvas.getBoundingClientRect();
  const logicalW = rect.width;
  const logicalH = rect.height;
  const dpr = window.devicePixelRatio || 1;
  if (dpr > 1) {
    canvas.width = logicalW * dpr;
    canvas.height = logicalH * dpr;
    canvas.style.width = logicalW + 'px';
    canvas.style.height = logicalH + 'px';
    ctx.scale(dpr, dpr);
  } else {
    // dpr=1 için de HTML attribute'unu CSS boyutuna sıfırla
    canvas.width = logicalW;
    canvas.height = logicalH;
  }

  const width = logicalW;
  const height = logicalH;
  const close = Boolean(options.close);

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  roundedClip(ctx, 0, 0, width, height, close ? 0 : 4);
  const grid = close
    ? drawCloseTextileView(ctx, sheet, width, height)
    : drawTechnicalRopeView(ctx, sheet, width, height);
  if (close) {
    const shadow = ctx.createLinearGradient(0, height * 0.78, 0, height);
    shadow.addColorStop(0, "rgba(0,0,0,0)");
    shadow.addColorStop(1, "rgba(0,0,0,0.10)");
    ctx.fillStyle = shadow;
    ctx.fillRect(0, height * 0.72, width, height * 0.28);
  }
  ctx.restore();
  return {
    steps: grid.steps,
    carrierCount: Number(sheet.carrier_count || sheet.carrier_layout?.length || 0),
    rows: grid.rows,
    cellWidth: grid.cellWidth,
    cellHeight: grid.cellHeight,
    cellCount: grid.steps * grid.rows
  };
}

function drawTechnicalRopeView(ctx, sheet, width, height) {
  return drawMatrixTextileCells(ctx, sheet, width, height, {
    close: false,
    background: "#fcfcfc"
  });
}

function drawCloseTextileView(ctx, sheet, width, height) {
  return drawMatrixTextileCells(ctx, sheet, width, height, {
    close: true,
    background: "#fafafa"
  });
}

function drawMatrixTextileCells(ctx, sheet, width, height, options) {
  const carrierCount = Number(sheet.carrier_count || sheet.carrier_layout?.length || 0);
  const grid = calculateCalibratedBraidGrid({ width, height, carrierCount, close: options.close });

  ctx.fillStyle = options.background;
  ctx.fillRect(0, 0, width, height);
  drawRopeBodyBase(ctx, width, height, options.close);
  drawVectorBraidSurface(ctx, sheet, width, height, options.close);
  return grid;
}

export function calculateCalibratedBraidGrid({ width, height, carrierCount, close = false }) {
  const rows = Math.max(1, Math.ceil(Number(carrierCount || 0)));
  const cellHeight = height / rows;
  const targetCellWidth = close ? cellHeight * 0.82 : cellHeight * 1.22;
  const naturalSteps = Math.max(rows * 2, Math.ceil(width / Math.max(targetCellWidth, 1)));
  const steps = close
    ? Math.max(rows + 8, Math.min(48, naturalSteps))
    : Math.max(rows * 4, Math.min(150, naturalSteps));
  const cellWidth = width / Math.max(steps, 1);
  return {
    rows,
    cellHeight,
    cellWidth,
    steps
  };
}

export function calculateMarkerPitch(carrierCount) {
  return calculatePatternRepeatModel({ carrierCount }).markerPitchColumns;
}

export function expectedMarkerCoverage(carrierCount, markerCount) {
  const count = Number(carrierCount || 0);
  if (!count) return 0;
  return Number(markerCount || 0) / count;
}

export function calculatePatternRepeatModel({
  carrierCount,
  markerCount = 0,
  viewLengthMm = 300,
  ropeDiameterMm = 10,
  braidAngleDeg = 45,
  columns = 58,
  densityScale = 1
} = {}) {
  const count = Math.max(1, Math.round(Number(carrierCount || 0)));
  const safeColumns = Math.max(1, Math.round(Number(columns || 0)));
  const safeDensityScale = Math.max(1, Number(densityScale || 1));
  const safeDiameter = Math.max(1, Number(ropeDiameterMm || 10));
  const safeAngle = Math.min(75, Math.max(25, Number(braidAngleDeg || 45)));
  const circumferenceMm = Math.PI * safeDiameter;
  const helixLeadMm = circumferenceMm / Math.tan(degToRad(safeAngle));
  const longitudinalRepeats = Math.max(1, Number(viewLengthMm || 300) / helixLeadMm);
  const geometricPitchColumns = Math.max(1, safeColumns / longitudinalRepeats);
  const coveragePitchColumns = Math.max(4, count * safeDensityScale);
  const markerPitchColumns = Math.round(Math.max(geometricPitchColumns, coveragePitchColumns));

  return {
    carrierCount: count,
    markerCount: Math.max(0, Number(markerCount || 0)),
    expectedMarkerCoverage: expectedMarkerCoverage(count, markerCount),
    viewLengthMm: Number(viewLengthMm || 300),
    ropeDiameterMm: safeDiameter,
    braidAngleDeg: safeAngle,
    densityScale: safeDensityScale,
    circumferenceMm,
    helixLeadMm,
    longitudinalRepeats,
    geometricPitchColumns,
    coveragePitchColumns,
    markerPitchColumns
  };
}

function normalizeCarrierLayout(carrierLayout, colorSequence, carrierCount) {
  const fromSequence = Array.isArray(colorSequence) ? colorSequence : [];
  const fromLayout = Array.isArray(carrierLayout) ? carrierLayout : [];
  return Array.from({ length: carrierCount }, (_, index) => {
    const carrier = fromLayout.find((item) => Number(item.carrier_no) === index + 1);
    const color = carrier?.color || fromSequence[index] || "white";
    return {
      carrier_no: index + 1,
      color,
      strand_role: carrier?.strand_role || (color === "white" ? "sheath" : "sheath_marker")
    };
  });
}

function drawRopeBodyBase(ctx, width, height, close) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#f7f8f7");
  gradient.addColorStop(0.16, "#ffffff");
  gradient.addColorStop(0.52, "#fbfbfb");
  gradient.addColorStop(0.82, "#f2f2f2");
  gradient.addColorStop(1, close ? "#e5e2df" : "#ededed");
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawVectorBraidSurface(ctx, sheet, width, height, close) {
  const carrierCount = Number(sheet.carrier_count || sheet.carrier_layout?.length || 0);
  const carrierLayout = normalizeCarrierLayout(sheet.carrier_layout, sheet.color_sequence, carrierCount);
  const baseColor = mostCommonColor(carrierLayout.map((carrier) => carrier.color)) || "beyaz";
  const rows = close ? Math.min(16, carrierCount || 16) : Math.max(1, carrierCount || 16);
  const cols = close ? 22 : 48;
  const cellW = width / cols;
  const cellH = height / rows;
  const overlap = 1;
  const matrix = buildBraidMatrix({
    carrierLayout,
    machineProfile: sheet.machineProfile,
    braidLogic: sheet.braid_walk_type,
    steps: cols + 2
  });

  ctx.save();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  for (let row = -1; row <= rows; row += 1) {
    for (let col = -1; col <= cols; col += 1) {
      const cell = visibleMatrixCell(matrix, row, col, rows);
      const direction = cell?.topCarrier?.direction || cell?.topDirection || "clockwise";
      const x = col * cellW;
      const y = row * cellH;
      drawIllustrationCrown(ctx, {
        x,
        y,
        width: cellW * (close ? 1.28 : 1.34) * overlap,
        height: cellH * (close ? 1.16 : 1.22) * overlap,
        color: cell?.topCarrier?.color || baseColor,
        direction,
        top: (row + col) % 4 < 2,
        close,
        marker: (cell?.topCarrier?.color || baseColor) !== baseColor
      });
    }
  }

  const floorShadow = ctx.createLinearGradient(0, height * 0.78, 0, height);
  floorShadow.addColorStop(0, "rgba(255,255,255,0)");
  floorShadow.addColorStop(0.55, close ? "rgba(90,70,55,0.16)" : "rgba(90,70,55,0.10)");
  floorShadow.addColorStop(1, close ? "rgba(48,36,28,0.34)" : "rgba(48,36,28,0.22)");
  ctx.fillStyle = floorShadow;
  ctx.fillRect(0, height * 0.74, width, height * 0.26);
  ctx.restore();
}

function visibleMatrixCell(matrix, row, col, visualRows) {
  if (!matrix?.cells?.length || !matrix.carrierCount) return null;
  const time = positiveModulo(col, matrix.steps);
  const normalizedRow = positiveModulo(row, visualRows);
  const column = Math.min(
    matrix.carrierCount - 1,
    Math.floor((normalizedRow / Math.max(visualRows, 1)) * matrix.carrierCount)
  );
  return matrix.cells[time]?.[column] || null;
}

function drawBraidCrowns(ctx, { matrix, width, height, close }) {
  const cellW = width / Math.max(matrix.steps, 1);
  const cellH = height / Math.max(matrix.carrierCount, 1);
  const baseColor = mostCommonColor(matrix.carrierPaths.map((path) => path.carrier.color));
  const underCrowns = [];
  const topCrowns = [];

  matrix.carrierPaths.forEach((path) => {
    path.points.forEach((point) => {
      const x = point.time * cellW;
      const y = point.column * cellH;
      const isTop = topDirectionAt({
        time: point.time,
        column: point.column,
        braidLogic: matrix.braidLogic
      }) === path.carrier.direction;
      const crown = { carrier: path.carrier, x, y, top: isTop };
      if (isTop) topCrowns.push(crown);
      else underCrowns.push(crown);
    });
  });

  [...underCrowns, ...topCrowns]
    .sort((a, b) => (a.top === b.top ? a.y - b.y : Number(a.top) - Number(b.top)))
    .forEach((crown) => drawBraidCrown(ctx, {
      x: crown.x,
      y: crown.y,
      width: cellW,
      height: cellH,
      color: crown.carrier.color || baseColor,
      direction: crown.carrier.direction,
      top: crown.top,
      close,
      marker: crown.carrier.color !== baseColor
    }));
}

function drawBraidCrown(ctx, { x, y, width, height, color, direction, top, close, marker }) {
  const padX = width * (close ? 0.20 : 0.16);
  const p1 = {
    x: x - padX,
    y: direction === "clockwise" ? y + height * 0.88 : y + height * 0.12
  };
  const p2 = {
    x: x + width + padX,
    y: direction === "clockwise" ? y + height * 0.12 : y + height * 0.88
  };
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const half = height * (close ? 0.46 : 0.28);
  const points = [
    { x: p1.x + nx * half, y: p1.y + ny * half },
    { x: p2.x + nx * half, y: p2.y + ny * half },
    { x: p2.x - nx * half, y: p2.y - ny * half },
    { x: p1.x - nx * half, y: p1.y - ny * half }
  ];
  const hex = colorToHex(color);
  const bVal = brightness(hex);

  // 3-stop gradient: iplik kesitine paralel (dik eksende)
  // Açık iplik → #e0e0e0 (üst kenar) / #ffffff (merkez) / #d8d8d8 (alt kenar)
  // Koyu iplik → shade -18 / shade +12 / shade -22
  const gradient = ctx.createLinearGradient(
    x + width * 0.5 - nx * half,
    y + height * 0.5 - ny * half,
    x + width * 0.5 + nx * half,
    y + height * 0.5 + ny * half
  );
  if (bVal > 180) {
    gradient.addColorStop(0, top ? "#e7e7e7" : "#dddddd");
    gradient.addColorStop(0.42, "#ffffff");
    gradient.addColorStop(0.62, "#fbfbfb");
    gradient.addColorStop(1, top ? "#d9d9d9" : "#d1d1d1");
  } else {
    gradient.addColorStop(0, shadeHex(hex, -22));
    gradient.addColorStop(0.44, shadeHex(hex, 28));
    gradient.addColorStop(0.62, shadeHex(hex, 10));
    gradient.addColorStop(1, shadeHex(hex, -24));
  }

  ctx.save();
  ctx.globalAlpha = top ? 1 : 0.82;
  if (top) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.22)";
    ctx.shadowBlur = close ? 5 : 2.2;
    ctx.shadowOffsetX = close ? 1.2 : 0.45;
    ctx.shadowOffsetY = close ? 2.2 : 0.8;
  } else {
    ctx.shadowColor = "rgba(0, 0, 0, 0.08)";
    ctx.shadowBlur = close ? 1.4 : 0.4;
    ctx.shadowOffsetY = close ? 0.5 : 0.2;
  }
  ctx.fillStyle = gradient;
  roundedCrownPath(ctx, points);
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.globalAlpha = top ? 1 : 0.64;
  ctx.strokeStyle = marker ? "rgba(0,0,0,0.28)" : "rgba(60,60,60,0.18)";
  ctx.lineWidth = close ? 0.55 : 0.35;
  ctx.stroke();

  const fiberCount = close ? 4 : 1;
  const fiberOffset = bVal > 80 ? -8 : 8;
  const fiberColor = shadeHex(hex, fiberOffset);
  ctx.globalAlpha = close ? 0.10 : 0.045;
  ctx.strokeStyle = fiberColor;
  ctx.lineWidth = close ? 0.55 : 0.35;
  for (let index = 1; index <= fiberCount; index += 1) {
    const offset = (index / (fiberCount + 1) - 0.5) * half * 0.92;
    ctx.beginPath();
    ctx.moveTo(p1.x + nx * offset, p1.y + ny * offset);
    ctx.lineTo(p2.x + nx * offset, p2.y + ny * offset);
    ctx.stroke();
  }
  ctx.restore();
}

function drawIllustrationCrown(ctx, { x, y, width, height, color, direction, top, close, marker }) {
  const p1 = {
    x: x - width * 0.08,
    y: direction === "clockwise" ? y + height * 0.92 : y + height * 0.08
  };
  const p2 = {
    x: x + width * 1.08,
    y: direction === "clockwise" ? y + height * 0.08 : y + height * 0.92
  };
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const half = Math.min(width, height) * (close ? 0.42 : 0.40);
  const points = [
    { x: p1.x + nx * half, y: p1.y + ny * half },
    { x: p2.x + nx * half, y: p2.y + ny * half },
    { x: p2.x - nx * half, y: p2.y - ny * half },
    { x: p1.x - nx * half, y: p1.y - ny * half }
  ];
  const center = {
    x: x + width * 0.5,
    y: y + height * 0.5
  };
  const scaledPoints = scaleCrownPoints(points, center, 1.06);
  const hex = colorToHex(color);
  const gradient = setupTextileGradient(ctx, {
    x: x + width * 0.5 - nx * half,
    y: y + height * 0.5 - ny * half
  }, {
    x: x + width * 0.5 + nx * half,
    y: y + height * 0.5 + ny * half
  }, color);

  ctx.save();
  ctx.globalAlpha = top ? 1 : 0.88;
  ctx.shadowColor = top ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.06)";
  ctx.shadowBlur = top ? (close ? 5 : 3.8) : (close ? 1.2 : 0.9);
  ctx.shadowOffsetX = top ? (close ? 1.1 : 0.55) : 0;
  ctx.shadowOffsetY = top ? (close ? 2.4 : 1.25) : 0.35;
  ctx.fillStyle = gradient;
  roundedCrownPath(ctx, scaledPoints);
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 0.6;
  ctx.stroke();

  if (close || !marker) {
    ctx.globalAlpha = marker ? 0.10 : (close ? 0.10 : 0.07);
    ctx.strokeStyle = shadeHex(hex, brightness(hex) > 120 ? -12 : 18);
    ctx.lineWidth = close ? 0.45 : 0.38;
    const fiberCount = close ? 3 : 2;
    for (let index = 1; index <= fiberCount; index += 1) {
      const offset = (index / (fiberCount + 1) - 0.5) * half * 0.85;
      ctx.beginPath();
      ctx.moveTo(p1.x + nx * offset, p1.y + ny * offset);
      ctx.lineTo(p2.x + nx * offset, p2.y + ny * offset);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function setupTextileGradient(ctx, p1, p2, color) {
  const hex = colorToHex(color);
  const gradient = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
  if (isBlackColor(color, hex)) {
    gradient.addColorStop(0, "#121212");
    gradient.addColorStop(0.2, "#242424");
    gradient.addColorStop(0.5, "#424242");
    gradient.addColorStop(0.8, "#242424");
    gradient.addColorStop(1, "#0d0d0d");
  } else if (brightness(hex) > 180) {
    gradient.addColorStop(0, "#d5d5d5");
    gradient.addColorStop(0.2, "#f0f0f0");
    gradient.addColorStop(0.5, "#ffffff");
    gradient.addColorStop(0.8, "#f0f0f0");
    gradient.addColorStop(1, "#cccccc");
  } else {
    gradient.addColorStop(0, shadeHex(hex, -20));
    gradient.addColorStop(0.2, shadeHex(hex, -4));
    gradient.addColorStop(0.5, shadeHex(hex, 28));
    gradient.addColorStop(0.8, shadeHex(hex, -4));
    gradient.addColorStop(1, shadeHex(hex, -24));
  }
  return gradient;
}

function scaleCrownPoints(points, center, scale) {
  return points.map((point) => ({
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale
  }));
}

function isBlackColor(color, hex) {
  const value = String(color || "").trim().toLowerCase();
  return value === "black" || value === "siyah" || brightness(hex) < 45;
}

function roundedCrownPath(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  ctx.quadraticCurveTo(
    (points[0].x + points[1].x) / 2,
    (points[0].y + points[1].y) / 2,
    points[1].x,
    points[1].y
  );
  ctx.quadraticCurveTo(
    (points[1].x + points[2].x) / 2,
    (points[1].y + points[2].y) / 2,
    points[2].x,
    points[2].y
  );
  ctx.quadraticCurveTo(
    (points[2].x + points[3].x) / 2,
    (points[2].y + points[3].y) / 2,
    points[3].x,
    points[3].y
  );
  ctx.quadraticCurveTo(
    (points[3].x + points[0].x) / 2,
    (points[3].y + points[0].y) / 2,
    points[0].x,
    points[0].y
  );
  ctx.closePath();
}

function isTwoOverTwo(walkType) {
  const value = String(walkType || "").toLowerCase();
  return value.includes("2_over_2") || value.includes("two-over-two") || value.includes("twill") || value.includes("2 üst") || value.includes("2 alt");
}

function isCounterRotating(walkType) {
  const value = String(walkType || "").toLowerCase();
  return value.includes("counter-rotating") || value.includes("counter_rotating") || value.includes("karşı");
}

function positiveModulo(value, modulo) {
  if (!modulo) return 0;
  return ((value % modulo) + modulo) % modulo;
}

function degToRad(value) {
  return (Number(value || 0) * Math.PI) / 180;
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

export function drawWalkDiagramCanvas(canvas, sheet) {
  const ctx = canvas?.getContext?.("2d");
  if (!ctx) return null;

  const width = canvas.width;
  const height = canvas.height;
  const carrierCount = Number(sheet.carrier_count || sheet.carrier_layout?.length || 0);
  const walkSteps = isTwoOverTwo(sheet.braid_walk_type)
    ? Math.max(16, Math.min(32, carrierCount * 2))
    : Math.max(12, Math.min(24, carrierCount));
  const matrix = buildBraidMatrix({
    carrierLayout: sheet.carrier_layout,
    machineProfile: sheet.machineProfile,
    braidLogic: sheet.braid_walk_type,
    steps: walkSteps
  });
  const paddingLeft = 34;
  const paddingTop = 20;
  const paddingRight = 18;
  const paddingBottom = 28;
  const plotW = width - paddingLeft - paddingRight;
  const plotH = height - paddingTop - paddingBottom;
  const stepW = plotW / Math.max(matrix.steps - 1, 1);
  const rowH = plotH / Math.max(matrix.carrierCount - 1, 1);
  const baseColor = mostCommonColor(sheet.color_sequence || []);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  ctx.font = "10px Inter, Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let row = 0; row < matrix.carrierCount; row += 1) {
    const y = paddingTop + row * rowH;
    ctx.strokeStyle = row % 2 === 0 ? "#dce3de" : "#edf1ee";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();
    if (row % 2 === 0) {
      ctx.fillStyle = "#66746d";
      ctx.fillText(String(row + 1), paddingLeft - 7, y);
    }
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (let step = 0; step < matrix.steps; step += 1) {
    const x = paddingLeft + step * stepW;
    ctx.strokeStyle = "#c8d0ca";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, paddingTop);
    ctx.lineTo(x, height - paddingBottom);
    ctx.stroke();
    ctx.fillStyle = "#66746d";
    ctx.fillText(String(step + 1), x, 14);
  }

  matrix.carrierPaths.forEach((path) => {
    const color = path.carrier.color || baseColor;
    const isMarker = color !== baseColor;
    ctx.beginPath();
    path.points.forEach((point, index) => {
      const x = paddingLeft + point.time * stepW;
      const y = paddingTop + point.column * rowH;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = colorToHex(color);
    ctx.globalAlpha = isMarker ? 0.95 : 0.42;
    ctx.lineWidth = isMarker ? 2.5 : 1.1;
    ctx.stroke();
    ctx.globalAlpha = 1;

    path.points.forEach((point) => {
      const x = paddingLeft + point.time * stepW;
      const y = paddingTop + point.column * rowH;
      ctx.beginPath();
      ctx.fillStyle = colorToHex(color);
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 0.6;
      ctx.arc(x, y, isMarker ? 3.6 : 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  });

  ctx.fillStyle = "#526159";
  ctx.textAlign = "left";
  ctx.fillText(`${sheet.machineProfile?.machineProfileId || ""} / ${sheet.braid_walk_type || ""}`, paddingLeft, height - 8);

  return {
    steps: matrix.steps,
    carrierCount: matrix.carrierCount,
    pathCount: matrix.carrierPaths.length
  };
}

export function renderTechnicalSheetCanvases(root, sheet) {
  const main = root.querySelector("[data-braid-canvas='main']");
  const walk = root.querySelector("[data-braid-canvas='walk']");
  return {
    main: drawMainRopeCanvas(main, sheet),
    walk: drawWalkDiagramCanvas(walk, sheet)
  };
}

export function replaceCanvasWithImages(root, sourceRoot = root) {
  const sourceCanvases = Array.from(sourceRoot.querySelectorAll("canvas"));
  root.querySelectorAll("canvas").forEach((canvas, index) => {
    const sourceCanvas = sourceCanvases[index] || canvas;
    const image = root.ownerDocument.createElement("img");
    image.src = sourceCanvas.toDataURL("image/png");
    image.width = sourceCanvas.width;
    image.height = sourceCanvas.height;
    image.alt = canvas.getAttribute("aria-label") || "";
    image.className = canvas.className;
    image.setAttribute("style", canvas.getAttribute("style") || "");
    canvas.replaceWith(image);
  });
}

function colorToHex(color) {
  return FALLBACK_COLORS[String(color || "").toLowerCase()] || "#8d9892";
}

function brightness(hex) {
  const value = hex.replace("#", "");
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  return Math.round((r * 299 + g * 587 + b * 114) / 1000);
}

function shadeHex(hex, percent) {
  const value = hex.replace("#", "");
  const num = parseInt(value.length === 3 ? value.split("").map((char) => char + char).join("") : value, 16);
  const amount = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function roundedClip(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.clip();
}

function mostCommonColor(colors = []) {
  const counts = new Map();
  for (const color of colors) counts.set(color, (counts.get(color) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || colors[0];
}
