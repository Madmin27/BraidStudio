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
  const matrix = buildBraidMatrix({
    carrierLayout: sheet.carrier_layout,
    machineProfile: sheet.machineProfile,
    braidLogic: sheet.braid_walk_type,
    steps: close ? 34 : 54
  });
  const cellW = width / Math.max(matrix.steps, 1);
  const cellH = height / Math.max(matrix.carrierCount, 1);
  const strandWidth = close ? Math.max(12, cellH * 1.35) : Math.max(5.5, cellH * 1.02);
  const baseColor = mostCommonColor(sheet.color_sequence || []);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f3f5f1";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  roundedClip(ctx, 0, 0, width, height, close ? 0 : 4);
  ctx.fillStyle = "#eef1ed";
  ctx.fillRect(0, 0, width, height);

  matrix.cells.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.topCarrier) return;
      const x = cell.time * cellW;
      const y = cell.column * cellH;
      const direction = cell.topDirection;
      const color = cell.visibleColor || baseColor;
      const isMarker = color !== baseColor;
      const x1 = x - cellW * 0.22;
      const x2 = x + cellW * 1.22;
      const y1 = direction === "clockwise" ? y + cellH * 0.96 : y + cellH * 0.04;
      const y2 = direction === "clockwise" ? y + cellH * 0.04 : y + cellH * 0.96;
      const widthScale = isMarker ? 1.12 : 1;

      drawVolumetricStrand(ctx, {
        x1,
        y1,
        x2,
        y2,
        color,
        lineWidth: strandWidth * widthScale,
        shadowAlpha: isMarker ? 0.34 : 0.22,
        highlightAlpha: isMarker ? 0.25 : 0.62
      });
    });
  });

  ctx.restore();
  return {
    steps: matrix.steps,
    carrierCount: matrix.carrierCount,
    cellCount: matrix.steps * matrix.carrierCount
  };
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
