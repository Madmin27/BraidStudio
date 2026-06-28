import { buildBraidMatrix, getCarrierDirection } from "./braidMatrix.js";

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

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  roundedClip(ctx, 0, 0, width, height, close ? 0 : 4);
  if (close) {
    drawCloseTextileView(ctx, sheet, width, height);
  } else {
    drawTechnicalRopeView(ctx, sheet, width, height);
  }

  ctx.restore();
  return {
    steps: matrix.steps,
    carrierCount: matrix.carrierCount,
    cellCount: matrix.steps * matrix.carrierCount
  };
}

function drawTechnicalRopeView(ctx, sheet, width, height) {
  ctx.fillStyle = "#fbfbf8";
  ctx.fillRect(0, 0, width, height);
  drawFineBraidLattice(ctx, width, height, {
    gap: Math.max(15, height / 5.3),
    stroke: 1.45,
    alpha: 0.72
  });
  drawTracerBands(ctx, sheet, width, height, {
    repeat: width / 4.7,
    segmentLength: height * 0.25,
    segmentGap: height * 0.115,
    lineWidth: Math.max(8, height * 0.095),
    bandOffset: height * 0.10,
    technical: true
  });
}

function drawCloseTextileView(ctx, sheet, width, height) {
  ctx.fillStyle = "#f5f4ef";
  ctx.fillRect(0, 0, width, height);
  drawVolumetricWeave(ctx, width, height);
  drawTracerBands(ctx, sheet, width, height, {
    repeat: width / 2.2,
    segmentLength: height * 0.105,
    segmentGap: height * 0.052,
    lineWidth: Math.max(18, height * 0.075),
    bandOffset: height * 0.18,
    technical: false
  });
  const shadow = ctx.createLinearGradient(0, height * 0.70, 0, height);
  shadow.addColorStop(0, "rgba(255,255,255,0)");
  shadow.addColorStop(1, "rgba(67,54,42,0.42)");
  ctx.fillStyle = shadow;
  ctx.fillRect(0, height * 0.62, width, height * 0.38);
}

function drawFineBraidLattice(ctx, width, height, { gap, stroke, alpha }) {
  ctx.save();
  ctx.lineWidth = stroke;
  ctx.strokeStyle = `rgba(90, 98, 93, ${alpha})`;
  for (let x = -height * 3; x < width + height * 3; x += gap) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height * 1.18, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height * 1.18, height);
    ctx.stroke();
  }
  ctx.lineWidth = Math.max(0.8, stroke * 0.55);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
  for (let x = -height * 3 + gap * 0.42; x < width + height * 3; x += gap) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height * 1.18, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height * 1.18, height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVolumetricWeave(ctx, width, height) {
  const gap = Math.max(26, height / 8);
  const lineWidth = gap * 0.82;
  ctx.save();
  for (let x = -height * 3; x < width + height * 3; x += gap) {
    drawVolumetricStrand(ctx, {
      x1: x,
      y1: height,
      x2: x + height * 1.18,
      y2: 0,
      color: "white",
      lineWidth,
      shadowAlpha: 0.34,
      highlightAlpha: 0.78
    });
  }
  for (let x = -height * 3 + gap * 0.48; x < width + height * 3; x += gap) {
    drawVolumetricStrand(ctx, {
      x1: x,
      y1: 0,
      x2: x + height * 1.18,
      y2: height,
      color: "white",
      lineWidth,
      shadowAlpha: 0.30,
      highlightAlpha: 0.62
    });
  }
  ctx.restore();
}

function drawTracerBands(ctx, sheet, width, height, options) {
  const clusters = markerClusters(sheet);
  const visibleClusters = clusters.length ? clusters : fallbackAccentClusters(sheet);
  const slope = height * 0.82;

  visibleClusters.forEach((cluster, clusterIndex) => {
    const reverse = cluster.direction === "counterClockwise";
    const phase = (cluster.start / Math.max(1, sheet.carrier_count || sheet.color_sequence?.length || 1)) * options.repeat;
    for (let startX = -options.repeat + phase; startX < width + options.repeat; startX += options.repeat) {
      const shiftedX = startX + clusterIndex * options.bandOffset;
      const y1 = reverse ? 0 : height;
      const y2 = reverse ? height : 0;
      drawSegmentedBand(ctx, {
        x1: shiftedX,
        y1,
        x2: shiftedX + slope,
        y2,
        colors: cluster.colors,
        lineWidth: options.lineWidth,
        segmentLength: options.segmentLength,
        segmentGap: options.segmentGap,
        technical: options.technical
      });
    }
  });
}

function drawSegmentedBand(ctx, { x1, y1, x2, y2, colors, lineWidth, segmentLength, segmentGap, technical }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const total = segmentLength + segmentGap;
  const palette = colors.length ? colors : ["red"];

  for (let distance = 0, index = 0; distance < length; distance += total, index += 1) {
    const color = palette[index % palette.length];
    const sx = x1 + ux * distance;
    const sy = y1 + uy * distance;
    const ex = x1 + ux * Math.min(distance + segmentLength, length);
    const ey = y1 + uy * Math.min(distance + segmentLength, length);
    if (technical) {
      ctx.save();
      ctx.lineCap = "butt";
      ctx.strokeStyle = colorToHex(color);
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.restore();
    } else {
      drawVolumetricStrand(ctx, {
        x1: sx,
        y1: sy,
        x2: ex,
        y2: ey,
        color,
        lineWidth,
        shadowAlpha: 0.42,
        highlightAlpha: 0.28
      });
    }
  }
}

function markerClusters(sheet) {
  const carriers = Array.isArray(sheet.carrier_layout) ? sheet.carrier_layout : [];
  const base = mostCommonColor(sheet.color_sequence || carriers.map((carrier) => carrier.color));
  const markers = carriers.filter((carrier) => carrier.color !== base);
  const clusters = [];

  for (const marker of markers) {
    const previous = markers.find((item) => item.carrier_no === marker.carrier_no - 1);
    if (previous) continue;
    const colors = [];
    let current = marker.carrier_no;
    while (markers.find((item) => item.carrier_no === current)) {
      const item = markers.find((candidate) => candidate.carrier_no === current);
      colors.push(item.color);
      current += 1;
    }
    clusters.push({
      start: marker.carrier_no,
      colors,
      direction: getCarrierDirection(marker.carrier_no, sheet.machineProfile)
    });
  }

  return clusters;
}

function fallbackAccentClusters(sheet) {
  const sequence = sheet.color_sequence || [];
  const base = mostCommonColor(sequence);
  const accents = [...new Set(sequence.filter((color) => color !== base))];
  if (!accents.length) return [];
  return [{
    start: 1,
    colors: accents,
    direction: "clockwise"
  }];
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
