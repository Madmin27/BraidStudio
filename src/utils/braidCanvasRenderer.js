import { buildBraidMatrix } from "./braidMatrix.js";

const FALLBACK_COLORS = {
  white: "#f8faf9",
  blue: "#134074",
  red: "#d90429",
  black: "#1b1f1d",
  yellow: "#d7d900",
  sarı: "#d7d900",
  gray: "#77817b",
  gri: "#77817b"
};

export function drawMainRopeCanvas(canvas, sheet, options = {}) {
  const ctx = canvas?.getContext?.("2d");
  if (!ctx) return null;

  const width = canvas.width;
  const height = canvas.height;
  const close = Boolean(options.close);

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  roundedClip(ctx, 0, 0, width, height, close ? 0 : 4);
  const grid = close
    ? drawCloseTextileView(ctx, sheet, width, height)
    : drawTechnicalRopeView(ctx, sheet, width, height);
  if (close) {
    const shadow = ctx.createLinearGradient(0, height * 0.70, 0, height);
    shadow.addColorStop(0, "rgba(255,255,255,0)");
    shadow.addColorStop(1, "rgba(67,54,42,0.42)");
    ctx.fillStyle = shadow;
    ctx.fillRect(0, height * 0.62, width, height * 0.38);
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
    background: "#fbfbf8",
    strokeAlpha: 0.18,
    shadowAlpha: 0.16
  });
}

function drawCloseTextileView(ctx, sheet, width, height) {
  return drawMatrixTextileCells(ctx, sheet, width, height, {
    close: true,
    background: "#f5f4ef",
    strokeAlpha: 0.10,
    shadowAlpha: 0.34
  });
}

function drawMatrixTextileCells(ctx, sheet, width, height, options) {
  const carrierCount = Number(sheet.carrier_count || sheet.carrier_layout?.length || 0);
  const grid = calculateCalibratedBraidGrid({ width, height, carrierCount, close: options.close });
  const rows = grid.rows;
  const steps = grid.steps;
  const cellWidth = grid.cellWidth;
  const cellHeight = grid.cellHeight;
  const span = isTwoOverTwo(sheet.braid_walk_type) ? 2 : 1;
  const colors = normalizeColorSequence(sheet.color_sequence, sheet.carrier_layout, carrierCount);

  ctx.fillStyle = options.background;
  ctx.fillRect(0, 0, width, height);

  drawDeterministicStrands(ctx, {
    colors,
    rows,
    steps,
    cellWidth,
    cellHeight,
    width,
    close: options.close,
    shadowAlpha: options.shadowAlpha,
    span
  });
  return grid;
}

export function calculateCalibratedBraidGrid({ width, height, carrierCount, close = false }) {
  const rows = Math.max(1, Math.ceil(Number(carrierCount || 0)));
  const cellHeight = height / rows;
  const maxMainSteps = 40;
  const closeSteps = Math.max(rows + 8, Math.ceil(rows * 1.5));
  const naturalMainSteps = Math.max(1, Math.floor(width / cellHeight));
  const steps = close ? closeSteps : Math.min(maxMainSteps, naturalMainSteps);
  const cellWidth = cellHeight;
  return {
    rows,
    cellHeight,
    cellWidth,
    steps
  };
}

function normalizeColorSequence(colorSequence, carrierLayout, carrierCount) {
  const fromSequence = Array.isArray(colorSequence) ? colorSequence : [];
  const fromLayout = Array.isArray(carrierLayout) ? carrierLayout : [];
  return Array.from({ length: carrierCount }, (_, index) => {
    if (fromSequence[index]) return fromSequence[index];
    const carrier = fromLayout.find((item) => Number(item.carrier_no) === index + 1);
    return carrier?.color || "white";
  });
}

function drawDeterministicStrands(ctx, { colors, rows, steps, cellWidth, cellHeight, width, close, shadowAlpha, span }) {
  // İplik kalınlığı %30 artırıldı (üretim halatındaki dolgunluğu yansıtmak için)
  const lineWidth = close
    ? Math.max(5, cellHeight * 1.07)
    : Math.max(2.2, cellHeight * 0.76);

  // Tüm kuklalar eşit stillendirme ile çizilir.
  // Eski base/marker ayrımı ve marker solid outline kaldırıldı:
  // marker ipliklerin #111 kontur + aşırı gölgesi beyaz alanları yutuyor,
  // hücre sınır çizgilerinin iplik rengini boğmasına yol açıyordu.
  const allCarriers = colors.map((color, index) => ({ color, index }));
  const patternWidth = Math.max(cellWidth, steps * cellWidth);
  for (let offsetX = 0; offsetX < width + patternWidth; offsetX += patternWidth) {
    for (const carrier of allCarriers) {
      drawCarrierStrand(ctx, {
        carrier,
        rows,
        steps,
        cellWidth,
        cellHeight,
        offsetX,
        lineWidth,
        close,
        shadowAlpha: shadowAlpha * 0.65,
        dashed: false,
        span
      });
    }
  }
}

function drawCarrierStrand(ctx, { carrier, rows, steps, cellWidth, cellHeight, offsetX, lineWidth, close, shadowAlpha, dashed, span }) {
  const direction = carrier.index % 2 === 0 ? 1 : -1;
  const segments = [];
  let current = [];

  for (let time = 0; time <= steps; time += 1) {
    const yGrid = positiveModulo(carrier.index + direction * time, rows);
    const previous = current.at(-1);
    if (previous && Math.abs(yGrid - previous.yGrid) > rows / 2) {
      segments.push(current);
      current = [];
    }
    current.push({
      x: offsetX + time * cellWidth,
      y: yGrid * cellHeight + cellHeight / 2,
      yGrid,
      upper: Math.floor((time + yGrid) / span) % 2 === (direction === 1 ? 0 : 1)
    });
  }
  if (current.length > 1) segments.push(current);

  for (const segment of segments) {
    drawStrandSegment(ctx, {
      points: segment,
      color: carrier.color,
      lineWidth,
      close,
      shadowAlpha,
      dashed
    });
  }
}

function drawStrandSegment(ctx, { points, color, lineWidth, close, shadowAlpha, dashed }) {
  if (points.length < 2) return;
  const first = points[0];
  const last = points[points.length - 1];
  const base = colorToHex(color);

  // NOT: Marker ipliklerde eski solid outline (#111) + aşırı gölge kaldırıldı.
  // Tüm iplikler aynı gölge/nurlama ile render edilir; marker'lar sadece dashed çizgiyle ayrışır.

  const gradient = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
  gradient.addColorStop(0, shadeHex(base, -22));
  gradient.addColorStop(0.45, shadeHex(base, 38));
  gradient.addColorStop(0.68, shadeHex(base, -4));
  gradient.addColorStop(1, shadeHex(base, -18));

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = `rgba(45, 54, 48, ${shadowAlpha})`;
  ctx.shadowBlur = close ? 2.2 : 0.8;
  ctx.shadowOffsetY = close ? 1.2 : 0.4;
  if (dashed) {
    const dash = Math.max(4, lineWidth * (close ? 1.1 : 0.9));
    ctx.setLineDash([dash, dash * 1.4]);
  }
  ctx.strokeStyle = gradient;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const point of points.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();

  ctx.shadowColor = "transparent";
  ctx.setLineDash([]);
  ctx.strokeStyle = close ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.22)";
  ctx.lineWidth = Math.max(0.5, lineWidth * 0.18);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y - lineWidth * 0.14);
  for (const point of points.slice(1)) {
    ctx.lineTo(point.x, point.y - lineWidth * 0.14);
  }
  ctx.stroke();
  ctx.restore();
}

function drawTextileCell(ctx, { x, y, width, height, color, direction, close, strokeAlpha, shadowAlpha }) {
  const radius = close ? Math.max(4, Math.min(width, height) * 0.32) : Math.max(1.4, Math.min(width, height) * 0.18);
  const padX = close ? -width * 0.10 : -width * 0.04;
  const padY = close ? -height * 0.06 : -height * 0.03;
  const drawX = x + padX;
  const drawY = y + padY;
  const drawW = width - padX * 2;
  const drawH = height - padY * 2;
  const gradient = direction === "clockwise"
    ? ctx.createLinearGradient(drawX, drawY + drawH, drawX + drawW, drawY)
    : ctx.createLinearGradient(drawX, drawY, drawX + drawW, drawY + drawH);
  const base = colorToHex(color);

  gradient.addColorStop(0, shadeHex(base, -24));
  gradient.addColorStop(0.34, shadeHex(base, -2));
  gradient.addColorStop(0.52, shadeHex(base, 44));
  gradient.addColorStop(0.72, shadeHex(base, -4));
  gradient.addColorStop(1, shadeHex(base, -20));

  ctx.save();
  ctx.shadowColor = `rgba(65, 74, 68, ${shadowAlpha})`;
  ctx.shadowBlur = close ? 2.4 : 0.8;
  ctx.shadowOffsetY = close ? 1.2 : 0.5;
  roundedRectPath(ctx, drawX, drawY, drawW, drawH, radius);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = `rgba(0, 0, 0, ${strokeAlpha})`;
  ctx.lineWidth = close ? 0.7 : 0.45;
  ctx.stroke();

  ctx.strokeStyle = close ? "rgba(255,255,255,0.46)" : "rgba(255,255,255,0.34)";
  ctx.lineWidth = Math.max(0.6, Math.min(width, height) * (close ? 0.08 : 0.045));
  ctx.beginPath();
  if (direction === "clockwise") {
    ctx.moveTo(drawX + drawW * 0.20, drawY + drawH * 0.72);
    ctx.lineTo(drawX + drawW * 0.78, drawY + drawH * 0.24);
  } else {
    ctx.moveTo(drawX + drawW * 0.20, drawY + drawH * 0.24);
    ctx.lineTo(drawX + drawW * 0.78, drawY + drawH * 0.72);
  }
  ctx.stroke();
  ctx.restore();
}

function isTwoOverTwo(walkType) {
  const value = String(walkType || "").toLowerCase();
  return value.includes("2_over_2") || value.includes("two-over-two") || value.includes("twill") || value.includes("2 üst");
}

function positiveModulo(value, modulo) {
  if (!modulo) return 0;
  return ((value % modulo) + modulo) % modulo;
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
  const matrix = buildBraidMatrix({
    carrierLayout: sheet.carrier_layout,
    machineProfile: sheet.machineProfile,
    braidLogic: sheet.braid_walk_type,
    steps: 8
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
  const close = root.querySelector("[data-braid-canvas='close']");
  const walk = root.querySelector("[data-braid-canvas='walk']");
  return {
    main: drawMainRopeCanvas(main, sheet),
    close: drawMainRopeCanvas(close, sheet, { close: true }),
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

function drawVolumetricStrand(ctx, { x1, y1, x2, y2, color, lineWidth, shadowAlpha, highlightAlpha }) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = `rgba(82, 92, 86, ${shadowAlpha})`;
  ctx.shadowBlur = 2.2;
  ctx.shadowOffsetY = 1.4;
  ctx.strokeStyle = createStrandGradient(ctx, x1, y1, x2, y2, color);
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = `rgba(255, 255, 255, ${highlightAlpha})`;
  ctx.lineWidth = Math.max(1, lineWidth * 0.17);
  ctx.beginPath();
  ctx.moveTo(x1 + (x2 - x1) * 0.18, y1 + (y2 - y1) * 0.18);
  ctx.lineTo(x1 + (x2 - x1) * 0.82, y1 + (y2 - y1) * 0.82);
  ctx.stroke();
  ctx.restore();
}

function createStrandGradient(ctx, x1, y1, x2, y2, baseColor) {
  const hex = colorToHex(baseColor);
  const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
  gradient.addColorStop(0, shadeHex(hex, -24));
  gradient.addColorStop(0.30, shadeHex(hex, -4));
  gradient.addColorStop(0.50, shadeHex(hex, 42));
  gradient.addColorStop(0.72, shadeHex(hex, -3));
  gradient.addColorStop(1, shadeHex(hex, -22));
  return gradient;
}

function colorToHex(color) {
  return FALLBACK_COLORS[String(color || "").toLowerCase()] || "#8d9892";
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
