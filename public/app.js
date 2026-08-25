import * as THREE from "/vendor/three.module.js";

const $ = (selector) => document.querySelector(selector);

const ui = {
  carrierCount: $("#carrierCount"),
  diameter: $("#diameter"),
  diameterValue: $("#diameterValue"),
  braidAngle: $("#braidAngle"),
  angleValue: $("#angleValue"),
  strandWidth: $("#strandWidth"),
  strandWidthValue: $("#strandWidthValue"),
  filamentCount: $("#filamentCount"),
  filamentCountValue: $("#filamentCountValue"),
  denier: $("#denier"),
  denierValue: $("#denierValue"),
  crossingMode: $("#crossingMode"),
  generateBraid: $("#generateBraid"),
  carrierGrid: $("#carrierGrid"),
  carrierPopover: $("#carrierPopover"),
  fixedPalette: $("#fixedPalette"),
  bulkColor: $("#bulkColor"),
  paintAll: $("#paintAll"),
  resetColors: $("#resetColors"),
  invertFlow: $("#invertFlow"),
  repeatBadge: $("#repeatBadge"),
  sceneMeta: $("#sceneMeta"),
  summary: $("#summary"),
  carrierTable: $("#carrierTable"),
  patternCanvas: $("#patternCanvas"),
  threeMount: $("#threeMount"),
  toggleSpin: $("#toggleSpin"),
  downloadPng: $("#downloadPng"),
  statusPill: $("#statusPill"),
  imageModal: $("#imageModal"),
  modalImage: $("#modalImage"),
  closeImageModal: $("#closeImageModal")
};

const defaultAccent = "#151718";
const defaultBase = "#59ee78";
const defaultMarker = "#e11912";
const defaultGround = "#f6f5ee";
const preferenceKey = "braidstudio.preferences.v1";
const fixedColors = [
  ["#59ee78", "yesil"],
  ["#151718", "siyah"],
  ["#f6f5ee", "beyaz"],
  ["#e11912", "kirmizi"],
  ["#174f92", "mavi"],
  ["#f2c230", "sari"],
  ["#148d62", "koyu yesil"],
  ["#f07518", "turuncu"],
];
const colorNames = {
  "#e11912": "kirmizi",
  "#f6f5ee": "beyaz",
  "#35df67": "yesil",
  "#59ee78": "yesil",
  "#151718": "siyah",
  "#174f92": "mavi",
  "#f2c230": "sari",
  "#148d62": "yesil",
  "#f07518": "turuncu",
  "#7a3db8": "mor"
};

const state = {
  carriers: [],
  spin: true,
  flip: false,
  scene: null,
  camera: null,
  renderer: null,
  ropeGroup: null,
  materialCache: new Map(),
  polyesterFiberMaps: new Map(),
  viewRotation: { x: -0.58, y: 1.18, z: -0.18 },
  autoRotation: 0,
  zoom: 8.8,
  drag: null,
  activeColor: defaultAccent,
  lastResult: null,
  texgenRequestId: 0,
  texgenMesh: null,
  simulationDirty: false,
  generating: false
};

function defaultCarrierColor(no) {
  return no === 1 || no === 3 ? defaultMarker : defaultGround;
}

function validHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ""));
}

function loadPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) || "null");
    if (!value || typeof value !== "object") return null;
    if (value.schemaVersion !== 2) {
      if (Number(value.strandWidth) === 130) value.strandWidth = 100;
      if (Number(value.filamentCount) === 20) value.filamentCount = 30;
      if (Number(value.denier) === 1000) value.denier = 1300;
      value.schemaVersion = 2;
    }
    return value;
  } catch {
    return null;
  }
}

function setSavedControl(control, value) {
  if (value === undefined || value === null) return;
  const next = String(value);
  if (control.tagName === "SELECT" && ![...control.options].some((option) => option.value === next)) return;
  const numeric = Number(next);
  if (control.type === "range" && (!Number.isFinite(numeric) || numeric < Number(control.min) || numeric > Number(control.max))) return;
  control.value = next;
}

function applySavedPreferences(preferences) {
  if (!preferences) return;
  setSavedControl(ui.carrierCount, preferences.carrierCount);
  setSavedControl(ui.diameter, preferences.diameter);
  setSavedControl(ui.braidAngle, preferences.braidAngle);
  setSavedControl(ui.strandWidth, preferences.strandWidth);
  setSavedControl(ui.filamentCount, preferences.filamentCount);
  setSavedControl(ui.denier, preferences.denier);
  setSavedControl(ui.crossingMode, preferences.crossingMode);
  state.flip = Boolean(preferences.flip);
  if (validHexColor(preferences.activeColor)) {
    state.activeColor = preferences.activeColor;
    ui.bulkColor.value = preferences.activeColor;
  }
}

function savePreferences() {
  try {
    localStorage.setItem(preferenceKey, JSON.stringify({
      schemaVersion: 2,
      carrierCount: Number(ui.carrierCount.value),
      diameter: Number(ui.diameter.value),
      braidAngle: Number(ui.braidAngle.value),
      strandWidth: Number(ui.strandWidth.value),
      filamentCount: Number(ui.filamentCount.value),
      denier: Number(ui.denier.value),
      crossingMode: ui.crossingMode.value,
      flip: state.flip,
      activeColor: state.activeColor,
      carrierColors: state.carriers.map((carrier) => carrier.color)
    }));
  } catch {
    // Private browsing or storage restrictions should not block the simulator.
  }
}

function initCarriers(count, { preserveExisting = true, colors = null } = {}) {
  const old = new Map(state.carriers.map((carrier) => [carrier.no, carrier.color]));
  state.carriers = Array.from({ length: count }, (_, index) => {
    const no = index + 1;
    const storedColor = Array.isArray(colors) && validHexColor(colors[index]) ? colors[index] : null;
    const existingColor = preserveExisting ? old.get(no) : null;
    return {
      no,
      color: storedColor || existingColor || defaultCarrierColor(no)
    };
  });
}

function directionFor(index) {
  const sign = index % 2 === 0 ? 1 : -1;
  return state.flip ? -sign : sign;
}

function crossingSpan() {
  return {
    diamond: 1,
    regular: 2,
    hercules: 3
  }[ui.crossingMode.value] || 1;
}

function calculateBraid() {
  const carrierCount = Number(ui.carrierCount.value);
  const diameterMm = Number(ui.diameter.value);
  const angleDeg = Number(ui.braidAngle.value);
  const strandWidthScale = Number(ui.strandWidth.value) / 100;
  const filamentCount = Number(ui.filamentCount.value);
  const denier = Number(ui.denier.value);
  const denierScale = Math.sqrt(denier / 1000);
  const radiusMm = diameterMm / 2;
  const angleRad = angleDeg * Math.PI / 180;
  const angleRad2d = clamp(angleRad * .92, .44, 1.08);
  const pitchMm = (2 * Math.PI * radiusMm) / Math.tan(angleRad);
  const lengthMm = 160;
  const rows = 58;
  const visibleRows = 30;
  const circumference = Math.PI * diameterMm;
  const laneWidth = circumference / (carrierCount / 2);
  const repeatRows = carrierCount / gcd(carrierCount, crossingSpan() * 2);
  const turns = lengthMm / pitchMm;
  const rowMm = lengthMm / rows;
  const visible = [];

  for (let row = 0; row < rows; row += 1) {
    for (let index = 0; index < carrierCount; index += 1) {
      const carrier = state.carriers[index];
      const dir = directionFor(index);
      const phase = index * (Math.PI * 2 / carrierCount);
      const z0 = row / rows;
      const z1 = (row + 1.04) / rows;
      const zMm0 = z0 * lengthMm;
      const zMm1 = z1 * lengthMm;
      const theta0 = phase + dir * (zMm0 / pitchMm) * Math.PI * 2;
      const theta1 = phase + dir * (zMm1 / pitchMm) * Math.PI * 2;
      const over = ((row + index + (dir > 0 ? 0 : crossingSpan())) % (crossingSpan() * 2)) < crossingSpan();
      visible.push({
        carrierNo: carrier.no,
        color: carrier.color,
        dir,
        row,
        phase,
        z0,
        z1,
        zMm0,
        zMm1,
        theta0,
        theta1,
        over
      });
    }
  }

  return {
    carrierCount,
    diameterMm,
    angleDeg,
    angleRad2d,
    strandWidthScale,
    filamentCount,
    denier,
    denierScale,
    pitchMm,
    lengthMm,
    turns,
    rowMm,
    circumference,
    laneWidth,
    repeatRows,
    visibleRows,
    rows,
    visible,
    carriers: state.carriers.map((carrier, index) => ({
      ...carrier,
      direction: directionFor(index) > 0 ? "saat yonu" : "ters yon",
      group: directionFor(index) > 0 ? "S" : "Z"
    }))
  };
}

function renderCarrierControls() {
  ui.carrierGrid.innerHTML = state.carriers.map((carrier, index) => `
    <div class="carrier" data-carrier="${carrier.no}" role="button" tabindex="0" style="--carrier-color:${carrier.color}">
      <span>${carrier.no}<small>${directionFor(index) > 0 ? "S / sag" : "Z / sol"}</small></span>
      <i class="carrier-swatch" aria-hidden="true"></i>
    </div>
  `).join("");

  ui.carrierGrid.querySelectorAll(".carrier").forEach((card) => {
    const openCard = (event) => {
      showCarrierPopover(card, Number(card.dataset.carrier));
    };
    card.addEventListener("click", openCard);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openCard(event);
    });
  });

}

function showCarrierPopover(card, carrierNo) {
  const carrier = state.carriers.find((item) => item.no === carrierNo);
  if (!carrier) return;
  const rect = card.getBoundingClientRect();
  ui.carrierPopover.innerHTML = `
    <div class="popover-title">Kukla ${carrier.no}</div>
    <div class="popover-palette">
      ${fixedColors.map(([hex, name]) => `
        <button
          type="button"
          class="palette-color${hex.toLowerCase() === carrier.color.toLowerCase() ? " active" : ""}"
          style="--swatch:${hex}"
          data-color="${hex}"
          title="${name}"
          aria-label="${name}"
        ></button>
      `).join("")}
    </div>
  `;
  ui.carrierPopover.hidden = false;
  ui.carrierPopover.style.left = `${clamp(rect.left, 8, window.innerWidth - 258)}px`;
  ui.carrierPopover.style.top = `${clamp(rect.bottom + 8, 8, window.innerHeight - 190)}px`;

  ui.carrierPopover.querySelectorAll("[data-color]").forEach((button) => {
    button.addEventListener("click", () => {
      applyCarrierColor(carrier.no, button.dataset.color);
      hideCarrierPopover();
    });
  });
}

function applyCarrierColor(carrierNo, color, closeAfterRender = true) {
  const carrier = state.carriers.find((item) => item.no === carrierNo);
  if (!carrier) return;
  carrier.color = color;
  state.activeColor = color;
  ui.bulkColor.value = color;
  renderFixedPalette();
  renderCarrierControls();
  markSimulationDirty();
  if (closeAfterRender) hideCarrierPopover();
}

function hideCarrierPopover() {
  ui.carrierPopover.hidden = true;
}

function renderFixedPalette() {
  ui.fixedPalette.innerHTML = fixedColors.map(([hex, name]) => `
    <button
      type="button"
      class="palette-color${hex.toLowerCase() === state.activeColor.toLowerCase() ? " active" : ""}"
      style="--swatch:${hex}"
      data-color="${hex}"
      title="${name}"
      aria-label="${name}"
    ></button>
  `).join("");

  ui.fixedPalette.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeColor = button.dataset.color;
      ui.bulkColor.value = state.activeColor;
      renderFixedPalette();
    });
  });
}

function renderCanvas(result) {
  const canvas = ui.patternCanvas;
  const ctx = canvas.getContext("2d");
  state.surfaceTexture = makeBraidSurfaceTexture(result, 1536, 2200);
  renderProceduralRope(ctx, canvas.width, canvas.height, result, state.surfaceTexture.color);
}

function renderProceduralRope(ctx, width, height, result, textureCanvas) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const texture = textureCanvas.getContext("2d").getImageData(0, 0, textureCanvas.width, textureCanvas.height).data;
  const image = ctx.createImageData(width, height);
  const data = image.data;
  const start = { x: 118, y: 90 };
  const end = { x: width + 132, y: height + 72 };
  const axisX = end.x - start.x;
  const axisY = end.y - start.y;
  const length = Math.hypot(axisX, axisY);
  const ux = axisX / length;
  const uy = axisY / length;
  const nx = -uy;
  const ny = ux;
  const radius = Math.min(160, height * .22);
  const texW = textureCanvas.width;
  const texH = textureCanvas.height;
  const baseFill = cssToRgb(mostCommonCarrierColor(result));

  drawRopeDropShadow(ctx, start, end, radius);

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const idx = (py * width + px) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = 255;

      const relX = px - start.x;
      const relY = py - start.y;
      const s = relX * ux + relY * uy;
      const d = relX * nx + relY * ny;
      if (s < 0 || s > length || Math.abs(d) > radius) continue;

      const v = d / radius;
      const theta = Math.asin(clamp(v, -1, 1));
      const u = theta / Math.PI + .5;
      const sampleX = mod(Math.floor(u * texW), texW);
      const sampleY = mod(Math.floor(s * 1.58), texH);
      const tIdx = (sampleY * texW + sampleX) * 4;
      const round = Math.sqrt(Math.max(0, 1 - v * v));
      const shade = (.72 + round * .34) * (.95 - Math.abs(v) * .15);
      const bottomShadow = Math.max(0, Math.abs(v) - .62) * 54;
      data[idx] = clampByte(texture[tIdx] * shade - bottomShadow);
      data[idx + 1] = clampByte(texture[tIdx + 1] * shade - bottomShadow);
      data[idx + 2] = clampByte(texture[tIdx + 2] * shade - bottomShadow);
    }
  }

  ctx.putImageData(image, 0, 0);

  drawRopeEndDetails(ctx, start, end, ux, uy, nx, ny, radius, baseFill);
}

function makeBraidSurfaceTexture(result, width, height) {
  const color = document.createElement("canvas");
  color.width = width;
  color.height = height;
  const heightMap = document.createElement("canvas");
  heightMap.width = width;
  heightMap.height = height;
  const cctx = color.getContext("2d");
  const hctx = heightMap.getContext("2d");
  const colorImage = cctx.createImageData(width, height);
  const heightImage = hctx.createImageData(width, height);
  const lanes = result.carrierCount / 2;
  const angleFactor = Math.tan(result.angleDeg * Math.PI / 180) / Math.tan(34 * Math.PI / 180);
  const longitudinalScale = clamp(.58 / angleFactor, .42, .78);
  const bandHalf = clamp(.38 * result.strandWidthScale * Math.pow(result.denierScale, .18), .3, .48);
  const base = mostCommonCarrierColor(result);
  const baseRgb = cssToRgb(base);
  const span = Math.max(1, crossingSpan());

  for (let y = 0; y < height; y += 1) {
    const z = y / (width / lanes) * longitudinalScale;
    const row = Math.floor(z * 1.02);
    for (let x = 0; x < width; x += 1) {
      const u = (x / width) * lanes;
      const aValue = u - z;
      const bValue = u + z + .5;
      const aRound = Math.round(aValue);
      const bRound = Math.round(bValue);
      const aDist = Math.abs(aValue - aRound);
      const bDist = Math.abs(bValue - bRound);
      const inA = aDist < bandHalf;
      const inB = bDist < bandHalf;
      const topA = mod(row + aRound + bRound, span * 2) < span;

      let family = "base";
      let dist = 1;
      let carrierIndex = 0;
      let visibleRgb = baseRgb;
      let heightProfile = .16;
      let crossingShadow = 0;

      if (inA || inB) {
        if (inA && (!inB || topA)) {
          family = "a";
          dist = aDist / bandHalf;
          carrierIndex = mod(aRound * 2 + row * 2, result.carrierCount);
        } else {
          family = "b";
          dist = bDist / bandHalf;
          carrierIndex = mod(bRound * 2 + 1 - row * 2, result.carrierCount);
        }
        visibleRgb = cssToRgb(result.carriers[carrierIndex]?.color || base);
        heightProfile = Math.sin((1 - clamp(dist, 0, 1)) * Math.PI * .5);
        crossingShadow = inA && inB ? 18 * (1 - heightProfile) : 0;
        if (isVeryDarkRgb(visibleRgb)) {
          const tracerWindow = fract(z * .72 + carrierIndex * .19 + (family === "a" ? .08 : .31));
          if (tracerWindow > .42) {
            visibleRgb = baseRgb;
            heightProfile *= .86;
            crossingShadow = 0;
          }
        }
      }

      const fiber = sampleSurfaceFiber(u, z, dist, family, result);
      const yarnShade = .76 + heightProfile * .32 + fiber;
      const rgb = shadeRgb(visibleRgb, yarnShade);
      const recess = family === "base" ? 38 : 0;
      const idx = (y * width + x) * 4;
      colorImage.data[idx] = clampByte(rgb[0] - recess - crossingShadow);
      colorImage.data[idx + 1] = clampByte(rgb[1] - recess - crossingShadow);
      colorImage.data[idx + 2] = clampByte(rgb[2] - recess - crossingShadow);
      colorImage.data[idx + 3] = 255;

      const h = clampByte(70 + heightProfile * 150);
      heightImage.data[idx] = h;
      heightImage.data[idx + 1] = h;
      heightImage.data[idx + 2] = h;
      heightImage.data[idx + 3] = 255;
    }
  }

  cctx.putImageData(colorImage, 0, 0);
  hctx.putImageData(heightImage, 0, 0);
  return { color, height: heightMap };
}

function isVeryDarkRgb(rgb) {
  return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 < 72;
}

function sampleSurfaceFiber(u, z, dist, family, result) {
  const direction = family === "b" ? -1 : 1;
  const along = z + u * direction * .16;
  const across = clamp(1 - dist, 0, 1);
  const filamentFrequency = clamp(result.filamentCount * .9, 9, 42);
  const fine = Math.sin((along * filamentFrequency + across * 3.5) * Math.PI * 2);
  const silk = Math.sin((along * filamentFrequency * 2.7 + u * 1.9) * Math.PI * 2);
  const herring = Math.abs(fract(along * 4.8 + across * .65) - .5);
  const noise = hash2(Math.floor(u * 41), Math.floor(z * 57)) - .5;
  return fine * .035 + silk * .018 + (.5 - herring) * .07 + noise * .03;
}

function drawProjectedBraidTiles(ctx, result, geom, overPass) {
  const span = Math.max(1, crossingSpan());
  const corners = [
    [0, -geom.radius],
    [0, geom.radius],
    [geom.length, -geom.radius],
    [geom.length, geom.radius]
  ];

  for (const family of [0, 1]) {
    const angle = family === 0 ? -geom.tileAngle : geom.tileAngle;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const normX = -dirY;
    const normY = dirX;
    const normalValues = corners.map(([x, y]) => x * normX + y * normY);
    const alongValues = corners.map(([x, y]) => x * dirX + y * dirY);
    const rowMin = Math.floor((Math.min(...normalValues) - geom.blockLength) / geom.laneGap) - 1;
    const rowMax = Math.ceil((Math.max(...normalValues) + geom.blockLength) / geom.laneGap) + 1;
    const stepMin = Math.floor((Math.min(...alongValues) - geom.blockLength) / geom.blockStep) - 1;
    const stepMax = Math.ceil((Math.max(...alongValues) + geom.blockLength) / geom.blockStep) + 1;

    for (let row = rowMin; row <= rowMax; row += 1) {
      const normalOffset = row * geom.laneGap + (family === 0 ? 0 : geom.laneGap * .34);
      for (let step = stepMin; step <= stepMax; step += 1) {
        const over = mod(step + row + family, span * 2) < span;
        if (over !== overPass) continue;

        const alongOffset = step * geom.blockStep + (row & 1 ? geom.blockStep * .5 : 0) + family * geom.blockStep * .18;
        const centerX = dirX * alongOffset + normX * normalOffset;
        const centerY = dirY * alongOffset + normY * normalOffset;
        if (centerX < -geom.blockLength || centerX > geom.length + geom.blockLength) continue;
        if (centerY < -geom.radius - geom.blockLength || centerY > geom.radius + geom.blockLength) continue;

        const carrierIndex = family === 0
          ? mod(row * 4 + step * 2, result.carrierCount)
          : mod(row * 4 + 3 - step * 2, result.carrierCount);
        const carrier = result.carriers[carrierIndex];
        const carrierColor = carrier?.color || mostCommonCarrierColor(result);
        const darkTracerHidden = isVeryDarkColor(carrierColor) && mod(step + row + family, 3) !== 0;
        const tileColor = darkTracerHidden ? mostCommonCarrierColor(result) : carrierColor;
        const depth = over ? cylinderDepthLocal(centerY / geom.radius) : cylinderDepthLocal(centerY / geom.radius) * .82;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle);
        ctx.globalAlpha = over ? 1 : (isVeryDarkColor(tileColor) ? .08 : .76);
        drawWovenTape(
          ctx,
          -geom.blockLength / 2,
          -geom.tapeWidth / 2,
          geom.blockLength,
          geom.tapeWidth,
          tileColor,
          over,
          depth,
          result
        );
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }
  }
}

function drawCylinderLightOverlay(ctx, length, radius) {
  const gloss = ctx.createLinearGradient(0, -radius, 0, radius);
  gloss.addColorStop(0, "rgba(0,0,0,.2)");
  gloss.addColorStop(.18, "rgba(255,255,255,.14)");
  gloss.addColorStop(.45, "rgba(255,255,255,.24)");
  gloss.addColorStop(.72, "rgba(0,0,0,.05)");
  gloss.addColorStop(1, "rgba(0,0,0,.28)");
  ctx.fillStyle = gloss;
  ctx.fillRect(0, -radius, length, radius * 2);
}

function drawRopeDropShadow(ctx, start, end, radius) {
  ctx.save();
  ctx.globalAlpha = .18;
  ctx.strokeStyle = "rgba(28,36,30,.5)";
  ctx.lineWidth = radius * 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(start.x + radius * .18, start.y + radius * .35);
  ctx.lineTo(end.x - radius * .15, end.y + radius * .35);
  ctx.stroke();
  ctx.restore();
}

function cylinderDepthLocal(v) {
  const edge = clamp(Math.abs(v), 0, 1);
  return .72 + (1 - edge * edge) * .34;
}

function sampleBraidSurface(s, d, spacing, tapeWidth, braidSlope, result) {
  const halfWidth = tapeWidth / 2;
  const aValue = (d - braidSlope * s) / spacing;
  const bValue = (d + braidSlope * s + spacing * .18) / spacing;
  const aRound = Math.round(aValue);
  const bRound = Math.round(bValue);
  const aDist = Math.abs(aValue - aRound) * spacing;
  const bDist = Math.abs(bValue - bRound) * spacing;
  const inA = aDist < halfWidth;
  const inB = bDist < halfWidth;
  const crossingRun = Math.max(1, crossingSpan());
  const crossingStep = Math.floor(s / (spacing * 1.48));
  const topA = mod(crossingStep + aRound + bRound, crossingRun * 2) < crossingRun;
  const colorStep = Math.floor(s / (spacing * 2.25));
  const carrierA = mod(aRound * 2 + colorStep * 2, result.carrierCount);
  const carrierB = mod(bRound * 2 + 1 - colorStep * 2, result.carrierCount);
  const base = mostCommonCarrierColor(result);

  if (inA && inB) {
    const family = topA ? "a" : "b";
    const dist = topA ? aDist : bDist;
    const carrier = topA ? carrierA : carrierB;
    return {
      family,
      color: result.carriers[carrier]?.color || base,
      edge: clamp(1 - dist / halfWidth, 0, 1),
      shadow: .5
    };
  }
  if (inA) {
    return {
      family: "a",
      color: result.carriers[carrierA]?.color || base,
      edge: clamp(1 - aDist / halfWidth, 0, 1),
      shadow: .12
    };
  }
  if (inB) {
    return {
      family: "b",
      color: result.carriers[carrierB]?.color || base,
      edge: clamp(1 - bDist / halfWidth, 0, 1),
      shadow: .12
    };
  }
  return {
    family: "base",
    color: base,
    edge: .08,
    shadow: .55
  };
}

function sampleFiber(s, d, family, result) {
  const direction = family === "b" ? -1 : 1;
  const countScale = result.filamentCount / 20;
  const fine = Math.abs(fract((s * .105 + d * direction * .18) * countScale) - .5);
  const herring = Math.abs(fract((s * .032 + Math.abs(fract(d * .045) - .5) * 1.9) * countScale) - .5);
  const silk = Math.abs(fract((s * .31 - d * direction * .075) * Math.sqrt(result.denier / 1000)) - .5);
  const noise = hash2(Math.floor(s * .19), Math.floor(d * .31));
  return .94 + (.5 - fine) * .12 + (.5 - herring) * .08 + (.5 - silk) * .045 + (noise - .5) * .035;
}

function drawRopeCapColor(dNorm, sNorm, baseRgb) {
  const r = Math.sqrt(Math.max(0, 1 - dNorm * dNorm - sNorm * sNorm));
  const shadeValue = .42 + r * .45;
  const gray = shadeRgb(baseRgb, shadeValue);
  const core = Math.abs(sNorm) < .55 && Math.abs(dNorm) < .72;
  if (core) return shadeRgb([198, 205, 194], .82 + r * .22);
  return gray;
}

function drawRopeEndDetails(ctx, start, end, ux, uy, nx, ny, radius, baseRgb) {
  ctx.save();
  const angle = Math.atan2(uy, ux);
  ctx.translate(start.x, start.y);
  ctx.rotate(angle);

  const outer = ctx.createRadialGradient(-radius * .08, -radius * .16, radius * .18, 0, 0, radius * .96);
  outer.addColorStop(0, `rgb(${shadeRgb(baseRgb, 1.18).join(",")})`);
  outer.addColorStop(.58, `rgb(${shadeRgb(baseRgb, .92).join(",")})`);
  outer.addColorStop(1, `rgb(${shadeRgb(baseRgb, .62).join(",")})`);
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * .74, radius * .96, 0, 0, Math.PI * 2);
  ctx.fill();

  const core = ctx.createRadialGradient(-radius * .18, -radius * .2, radius * .08, -radius * .04, 0, radius * .52);
  core.addColorStop(0, "rgba(231,237,224,.95)");
  core.addColorStop(.62, "rgba(183,198,179,.92)");
  core.addColorStop(1, "rgba(100,126,101,.82)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(-radius * .08, 0, radius * .42, radius * .56, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * .74, radius * .96, 0, 0, Math.PI * 2);
  ctx.clip();
  for (let i = -radius; i <= radius; i += radius * .13) {
    ctx.globalAlpha = .22;
    ctx.strokeStyle = "rgba(255,255,255,.76)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(i - radius * .55, -radius);
    ctx.lineTo(i + radius * .55, radius);
    ctx.stroke();

    ctx.globalAlpha = .18;
    ctx.strokeStyle = "rgba(24,80,42,.55)";
    ctx.beginPath();
    ctx.moveTo(i + radius * .55, -radius);
    ctx.lineTo(i - radius * .55, radius);
    ctx.stroke();
  }
  ctx.restore();

  ctx.globalAlpha = .42;
  ctx.strokeStyle = "rgba(20,48,32,.44)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * .74, radius * .96, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function mostCommonCarrierColor(result) {
  const counts = new Map();
  for (const carrier of result.carriers) {
    counts.set(carrier.color, (counts.get(carrier.color) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || defaultBase;
}

function drawCylinderSegment(ctx, segment, result, cellW, cellH, body, displayRows) {
  const dir = segment.dir;
  const row = segment.row;
  const thetaTurns = (segment.theta0 - segment.phase) / (Math.PI * 2);
  const startX = wrap(((segment.phase / (Math.PI * 2)) * body.w) + thetaTurns * body.w, body.w);
  const yNorm = (row + .5) / displayRows;
  const curveLift = Math.sin((yNorm - .5) * Math.PI) * cellH * .9;
  const y = body.y + row * cellH + curveLift;
  const lengthFactor = clamp(1.98 - result.turns * .12, 1.18, 1.72) * clamp(result.strandWidthScale, .8, 1.45);
  const len = cellW * lengthFactor;
  const thick = cellH * clamp(1.72 - result.diameterMm * .005, 1.18, 1.64) * clamp(result.strandWidthScale, .85, 1.62) * clamp(result.denierScale, .78, 1.24);
  const x = body.x + startX - len / 2;
  const angle = dir > 0 ? -result.angleRad2d : result.angleRad2d;

  for (const shift of [-body.w, 0, body.w]) {
    ctx.save();
    ctx.translate(x + shift + len / 2, y + cellH / 2);
    ctx.rotate(angle);
    const depth = cylinderDepth(yNorm);
    drawWovenTape(ctx, -len / 2, -thick / 2, len, thick, segment.color, segment.over, depth, result);
    ctx.restore();
  }
}

function drawWovenTape(ctx, x, y, width, height, color, over, depth = 1, result = null) {
  const bevel = Math.min(height * .18, width * .08);
  wovenTapePath(ctx, x, y, width, height, bevel);

  const grad = ctx.createLinearGradient(x, y, x, y + height);
  grad.addColorStop(0, shade(color, (over ? 1.08 : .96) * depth));
  grad.addColorStop(.5, shade(color, (over ? 1 : .9) * depth));
  grad.addColorStop(1, shade(color, (over ? .9 : .8) * depth));
  ctx.fillStyle = grad;
  ctx.shadowColor = over ? "rgba(0,0,0,.12)" : "rgba(0,0,0,.04)";
  ctx.shadowBlur = over ? 5 : 2;
  ctx.shadowOffsetY = over ? 2 : 1;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.save();
  wovenTapePath(ctx, x, y, width, height, bevel);
  ctx.clip();
  drawPolyesterFilaments(ctx, x, y, width, height, color, over, result);
  drawStrongHerringbone(ctx, x, y, width, height, color, result);
  ctx.restore();
  ctx.strokeStyle = "rgba(45,48,44,.12)";
  ctx.lineWidth = .8;
  wovenTapePath(ctx, x, y, width, height, bevel);
  ctx.stroke();
}

function wovenTapePath(ctx, x, y, width, height, bevel) {
  ctx.beginPath();
  ctx.moveTo(x + bevel, y);
  ctx.lineTo(x + width - bevel * .22, y);
  ctx.quadraticCurveTo(x + width, y, x + width - bevel * .38, y + bevel * .72);
  ctx.lineTo(x + width - bevel, y + height - bevel * .18);
  ctx.quadraticCurveTo(x + width - bevel, y + height, x + width - bevel * 1.28, y + height);
  ctx.lineTo(x + bevel * .22, y + height);
  ctx.quadraticCurveTo(x, y + height, x + bevel * .38, y + height - bevel * .72);
  ctx.lineTo(x + bevel, y + bevel * .18);
  ctx.closePath();
}

function drawPolyesterFilaments(ctx, x, y, width, height, color, over, result) {
  const filamentCount = result?.filamentCount || 20;
  const denierScale = result?.denierScale || 1;
  const fiberStep = height / Math.max(6, filamentCount);
  const light = isLightColor(color);
  for (let i = 0; i < filamentCount; i += 1) {
    const yy = y + fiberStep * (i + .45);
    const tone = .78 + (i % 7) * .055 + (over ? .08 : 0);
    ctx.globalAlpha = light ? .5 : .36;
    ctx.strokeStyle = light ? `rgba(${185 + (i % 5) * 6},${188 + (i % 4) * 7},${184 + (i % 6) * 5},.78)` : shade(color, tone);
    ctx.lineWidth = clamp(denierScale * .55, .38, 1.1);
    ctx.beginPath();
    ctx.moveTo(x - width * .08, yy);
    ctx.bezierCurveTo(
      x + width * .25,
      yy + Math.sin(i * 1.7) * fiberStep * .35,
      x + width * .68,
      yy - Math.cos(i * 1.25) * fiberStep * .28,
      x + width * 1.08,
      yy + Math.sin(i * .9) * fiberStep * .22
    );
    ctx.stroke();

    if (i % 2 === 0) {
      ctx.globalAlpha = light ? .22 : .18;
      ctx.strokeStyle = light ? "rgba(255,255,255,.72)" : shade(color, 1.32);
      ctx.lineWidth = .55;
      ctx.beginPath();
      ctx.moveTo(x + i * 3, y + height);
      ctx.lineTo(x + i * 3 + height * .7, y);
      ctx.stroke();
    }
  }

  drawHerringboneFibers(ctx, x, y, width, height, color, light, filamentCount, denierScale);

  ctx.globalAlpha = over ? .24 : .14;
  ctx.strokeStyle = light ? "rgba(130,134,128,.32)" : "rgba(255,255,255,.38)";
  ctx.lineWidth = .75;
  for (let line = -height; line < width; line += Math.max(4, 12 - filamentCount * .12)) {
    ctx.beginPath();
    ctx.moveTo(x + line, y + height);
    ctx.lineTo(x + line + height, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawHerringboneFibers(ctx, x, y, width, height, color, light, filamentCount, denierScale) {
  const repeat = clamp(height * 1.55, 10, 24);
  const center = y + height * .5;
  const strokeA = light ? "rgba(122,126,120,.34)" : shade(color, .72);
  const strokeB = light ? "rgba(255,255,255,.52)" : shade(color, 1.18);

  for (let px = x - repeat; px < x + width + repeat; px += repeat) {
    for (const mirror of [-1, 1]) {
      ctx.globalAlpha = light ? .34 : .26;
      ctx.strokeStyle = strokeA;
      ctx.lineWidth = clamp(denierScale * .62, .42, 1.05);
      ctx.beginPath();
      ctx.moveTo(px, center);
      ctx.lineTo(px + repeat * .55, center + mirror * height * .42);
      ctx.stroke();

      ctx.globalAlpha = .16;
      ctx.strokeStyle = strokeB;
      ctx.beginPath();
      ctx.moveTo(px + repeat * .18, center);
      ctx.lineTo(px + repeat * .7, center + mirror * height * .36);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = .18;
  ctx.strokeStyle = light ? "rgba(90,94,90,.28)" : "rgba(255,255,255,.24)";
  ctx.lineWidth = .45;
  for (let i = 0; i < Math.min(42, filamentCount * 1.5); i += 1) {
    const px = x + (i / Math.min(42, filamentCount * 1.5)) * width;
    ctx.beginPath();
    ctx.moveTo(px, y + height * .08);
    ctx.lineTo(px + height * .18, y + height * .92);
    ctx.stroke();
  }
}

function drawStrongHerringbone(ctx, x, y, width, height, color, result) {
  const light = isLightColor(color);
  const denierScale = result?.denierScale || 1;
  const step = clamp(height * .72, 7, 15);
  const mid = y + height * .5;
  const dark = light ? "rgba(92,98,92,.42)" : shade(color, .58);
  const bright = light ? "rgba(255,255,255,.62)" : shade(color, 1.28);

  for (let px = x - step; px < x + width + step; px += step) {
    ctx.globalAlpha = .46;
    ctx.lineWidth = clamp(denierScale * .75, .55, 1.25);
    ctx.strokeStyle = dark;
    ctx.beginPath();
    ctx.moveTo(px, mid);
    ctx.lineTo(px + step * .5, y + height * .12);
    ctx.lineTo(px + step, mid);
    ctx.lineTo(px + step * 1.5, y + height * .88);
    ctx.lineTo(px + step * 2, mid);
    ctx.stroke();

    ctx.globalAlpha = .28;
    ctx.strokeStyle = bright;
    ctx.beginPath();
    ctx.moveTo(px + step * .18, mid);
    ctx.lineTo(px + step * .5, y + height * .24);
    ctx.lineTo(px + step * .82, mid);
    ctx.lineTo(px + step * 1.5, y + height * .76);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function isLightColor(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 190;
}

function isVeryDarkColor(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 72;
}

function drawCylinderFrame(ctx, body, width, height) {
  const shadow = ctx.createRadialGradient(width / 2, body.y + body.h + 44, 80, width / 2, body.y + body.h + 44, width * .48);
  shadow.addColorStop(0, "rgba(48,36,30,.52)");
  shadow.addColorStop(.42, "rgba(48,36,30,.22)");
  shadow.addColorStop(1, "rgba(48,36,30,0)");
  ctx.fillStyle = shadow;
  ctx.fillRect(body.x + 12, body.y + body.h - 8, body.w - 24, height - body.y - body.h + 55);

  const bodyGrad = ctx.createLinearGradient(0, body.y, 0, body.y + body.h);
  bodyGrad.addColorStop(0, "#ffffff");
  bodyGrad.addColorStop(.18, "#f4f5f2");
  bodyGrad.addColorStop(.52, "#e8ebe7");
  bodyGrad.addColorStop(.82, "#d8dcd7");
  bodyGrad.addColorStop(1, "#bcc1bd");
  ctx.fillStyle = bodyGrad;
  roundedRectPath(ctx, body.x, body.y, body.w, body.h, 10);
  ctx.fill();
}

function drawCylinderOverlay(ctx, body) {
  const gloss = ctx.createLinearGradient(0, body.y, 0, body.y + body.h);
  gloss.addColorStop(0, "rgba(255,255,255,.22)");
  gloss.addColorStop(.2, "rgba(255,255,255,.07)");
  gloss.addColorStop(.58, "rgba(255,255,255,0)");
  gloss.addColorStop(.86, "rgba(0,0,0,.05)");
  gloss.addColorStop(1, "rgba(0,0,0,.17)");
  ctx.fillStyle = gloss;
  ctx.fillRect(body.x, body.y, body.w, body.h);

  ctx.strokeStyle = "rgba(120,124,118,.34)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(body.x + 8, body.y + 16);
  ctx.bezierCurveTo(body.x + body.w * .32, body.y - 8, body.x + body.w * .68, body.y - 8, body.x + body.w - 8, body.y + 16);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(body.x + 8, body.y + body.h - 20);
  ctx.bezierCurveTo(body.x + body.w * .32, body.y + body.h + 16, body.x + body.w * .68, body.y + body.h + 16, body.x + body.w - 8, body.y + body.h - 20);
  ctx.stroke();
}

function cylinderDepth(yNorm) {
  const distance = Math.abs(yNorm - .5) * 2;
  return .72 + (1 - distance * distance) * .34;
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function initThree() {
  state.scene = new THREE.Scene();
  state.scene.background = null;
  state.camera = new THREE.PerspectiveCamera(35, 1, .1, 100);
  state.camera.position.set(0, 2.8, 8.8);
  state.camera.lookAt(0, 0, 0);

  state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  state.renderer.shadowMap.enabled = true;
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  state.renderer.outputColorSpace = THREE.SRGBColorSpace;
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.renderer.toneMappingExposure = 1.08;
  ui.threeMount.appendChild(state.renderer.domElement);

  state.scene.add(new THREE.HemisphereLight(0xffffff, 0x68716c, 1.35));
  const key = new THREE.DirectionalLight(0xfff8ef, 3.6);
  key.position.set(4.5, 7, 6);
  key.castShadow = true;
  state.scene.add(key);
  const fill = new THREE.DirectionalLight(0xddeaff, 1.05);
  fill.position.set(-5, 1.5, 4);
  state.scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 2.15);
  rim.position.set(-2, 5, -6);
  state.scene.add(rim);

  state.ropeGroup = new THREE.Group();
  state.scene.add(state.ropeGroup);
  installThreeInteractions();
  resizeThree();
  window.addEventListener("resize", resizeThree);
  animate();
}

function renderThree(result) {
  while (state.ropeGroup.children.length) {
    const child = state.ropeGroup.children.pop();
    disposeObject(child);
  }

  const radius = clamp(.76 + result.diameterMm * .026, .86, 2.15);
  const length = 5.6;
  const textureSource = state.surfaceTexture || makeBraidSurfaceTexture(result, 1536, 2200);
  const map = new THREE.CanvasTexture(textureSource.color);
  const bumpMap = new THREE.CanvasTexture(textureSource.height);
  for (const texture of [map, bumpMap]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.offset.set(.26, 0);
    texture.anisotropy = Math.min(8, state.renderer.capabilities.getMaxAnisotropy?.() || 1);
  }
  map.colorSpace = THREE.SRGBColorSpace;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 192, 48, true),
    new THREE.MeshStandardMaterial({
      map,
      bumpMap,
      bumpScale: .075 * result.strandWidthScale,
      roughness: .96,
      metalness: 0
    })
  );
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  state.ropeGroup.add(body);

  const baseColor = new THREE.Color(mostCommonCarrierColor(result));
  const capMaterial = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: .92,
    metalness: 0
  });
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8c7b5,
    roughness: .88,
    metalness: 0
  });
  for (const z of [-length / 2, length / 2]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(radius * .99, 96), capMaterial);
    cap.position.z = z;
    cap.rotation.z = z < 0 ? 0 : Math.PI;
    cap.castShadow = true;
    cap.receiveShadow = true;
    state.ropeGroup.add(cap);
  }
  const core = new THREE.Mesh(new THREE.CircleGeometry(radius * .42, 72), coreMaterial);
  core.position.z = -length / 2 - .002;
  core.castShadow = true;
  core.receiveShadow = true;
  state.ropeGroup.add(core);
}

function clearRopeGroup() {
  while (state.ropeGroup.children.length) {
    const child = state.ropeGroup.children.pop();
    disposeObject(child);
  }
}

function texgenPayload(result) {
  return {
    engine: "weave2d",
    cellsX: 8,
    cellsY: 7,
    visibleRows: result.visibleRows,
    carrierCount: result.carrierCount,
    diameterMm: result.diameterMm,
    braidAngle: result.angleDeg,
    strandWidthScale: result.strandWidthScale,
    filamentCount: result.filamentCount,
    denier: result.denier,
    crossingMode: ui.crossingMode.value,
    flip: state.flip,
    baseColor: mostCommonCarrierColor(result),
    accentColor: state.activeColor,
    carriers: result.carriers.map((carrier) => ({
      no: carrier.no,
      color: carrier.color
    }))
  };
}

function drawTexgenWaiting(text = "TexGen geometri hesaplaniyor") {
  const canvas = ui.patternCanvas;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#234238";
  ctx.font = "700 28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

async function requestTexgenMesh(result) {
  const requestId = ++state.texgenRequestId;
  state.generating = true;
  refreshGenerateButton();
  drawTexgenWaiting();
  clearRopeGroup();
  ui.statusPill.textContent = "TexGen hesapliyor";

  try {
    const response = await fetch("/api/texgen-braid", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(texgenPayload(result))
    });
    const mesh = await response.json();
    if (requestId !== state.texgenRequestId) return;
    if (!response.ok || mesh.error) {
      throw new Error(mesh.error || "texgen_failed");
    }
    state.texgenMesh = mesh;
    renderTexgenThree(mesh);
    renderCanvasFromThree();
    ui.statusPill.textContent = state.simulationDirty ? "Değişiklikler hazır" : "TexGen mesh";
  } catch (error) {
    if (requestId !== state.texgenRequestId) return;
    drawTexgenWaiting("TexGen geometri hatasi");
    ui.statusPill.textContent = "TexGen hata";
    console.error(error);
  } finally {
    if (requestId === state.texgenRequestId) {
      state.generating = false;
      refreshGenerateButton();
    }
  }
}

function renderTexgenThree(mesh) {
  clearRopeGroup();
  state.renderer.localClippingEnabled = false;
  for (const yarn of mesh.yarns || []) {
    const geometry = geometryFromTexgenMesh(yarn.mesh);
    const material = getTexgenYarnMaterial(yarn.color || defaultBase, mesh);
    material.clippingPlanes = null;
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = true;
    object.receiveShadow = true;
    state.ropeGroup.add(object);
  }

  if (mesh.cylindricalWeave) {
    const endPlanes = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), mesh.length / 2),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), mesh.length / 2)
    ];
    state.renderer.localClippingEnabled = true;
    for (const object of state.ropeGroup.children) {
      object.material.clippingPlanes = endPlanes;
      object.material.clipShadows = true;
    }

    const sheathMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(mostCommonCarrierColor(state.lastResult)).multiplyScalar(.82),
      roughness: .88,
      metalness: 0,
      side: THREE.DoubleSide
    });
    const sheath = new THREE.Mesh(
      new THREE.CylinderGeometry(mesh.radius * .93, mesh.radius * .93, mesh.length, 96, 1, true),
      sheathMaterial
    );
    sheath.rotation.z = Math.PI / 2;
    sheath.receiveShadow = true;
    state.ropeGroup.add(sheath);

    const coreMaterial = new THREE.MeshStandardMaterial({
      color: 0xb7c1ba,
      roughness: .96,
      metalness: 0
    });
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(mesh.radius * .72, mesh.radius * .72, mesh.length + .012, 64, 1, false),
      coreMaterial
    );
    core.rotation.z = Math.PI / 2;
    core.castShadow = true;
    core.receiveShadow = true;
    state.ropeGroup.add(core);

    const cutRingMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(mostCommonCarrierColor(state.lastResult)).multiplyScalar(.9),
      roughness: .82,
      metalness: 0,
      side: THREE.DoubleSide
    });
    for (const x of [-mesh.length / 2 - .008, mesh.length / 2 + .008]) {
      const cutRing = new THREE.Mesh(
        new THREE.RingGeometry(mesh.radius * .72, mesh.radius * .99, 96, 3),
        cutRingMaterial
      );
      cutRing.rotation.y = Math.PI / 2;
      cutRing.position.x = x;
      cutRing.receiveShadow = true;
      state.ropeGroup.add(cutRing);
    }

    state.viewRotation = { x: -0.08, y: -0.24, z: -0.08 };
    state.zoom = clamp(mesh.length * 1.35, 28, 44);
    state.camera.position.set(0, 0, state.zoom);
    state.camera.lookAt(0, 0, 0);
    state.ropeGroup.position.set(0, 0, 0);
    return;
  }

  if (mesh.flatWeave) {
    state.viewRotation = { x: -1.02, y: 0.02, z: -0.30 };
    state.zoom = 27;
    state.ropeGroup.position.set(0, 0, 0);
    return;
  }

  state.ropeGroup.position.set(0, 0, 0);

  const capMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(mostCommonCarrierColor(state.lastResult)),
    roughness: .9,
    metalness: 0
  });
  const coreMaterial = new THREE.MeshStandardMaterial({ color: 0xb8c7b5, roughness: .88, metalness: 0 });
  for (const z of [-mesh.length / 2, mesh.length / 2]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(mesh.radius * .92, 96), capMaterial);
    cap.position.z = z;
    cap.castShadow = true;
    cap.receiveShadow = true;
    state.ropeGroup.add(cap);
  }
  const core = new THREE.Mesh(new THREE.CircleGeometry(mesh.radius * .38, 72), coreMaterial);
  core.position.z = -mesh.length / 2 - .01;
  state.ropeGroup.add(core);
}

function getTexgenYarnMaterial(color, mesh) {
  const filamentCount = Math.round(mesh.filamentCount || state.lastResult?.filamentCount || 30);
  const denier = Math.round(mesh.denier || state.lastResult?.denier || 1300);
  const materialScale = Math.sqrt(denier / 1300);
  const filamentDiameterScale = mesh.filamentDiameterScale
    ?? clamp(.5 * (denier / 1000), .15, 1.5);
  const key = `${color.toLowerCase()}:texgen-polyester-satin-v3:${filamentCount}:${denier}`;
  if (state.materialCache.has(key)) return state.materialCache.get(key);
  const fiberMaps = makePolyesterFiberMaps(filamentCount, denier);
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    map: fiberMaps.color,
    bumpMap: fiberMaps.bump,
    bumpScale: clamp(.018 * materialScale * filamentDiameterScale, .006, .034),
    normalMap: fiberMaps.normal,
    normalScale: new THREE.Vector2(.88, .16),
    roughnessMap: fiberMaps.roughness,
    roughness: .78,
    metalness: 0,
    sheen: .96,
    sheenRoughness: .4,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), .72),
    specularIntensityMap: fiberMaps.specular,
    specularIntensity: .98,
    specularColor: new THREE.Color(0xffffff),
    anisotropy: .96,
    anisotropyRotation: Math.PI / 2,
    side: THREE.DoubleSide
  });
  material.userData.sharedBraidMaterial = true;
  state.materialCache.set(key, material);
  return material;
}

function makePolyesterFiberMaps(filamentCount, denier) {
  const mapKey = `${filamentCount}:${denier}`;
  if (state.polyesterFiberMaps.has(mapKey)) return state.polyesterFiberMaps.get(mapKey);
  const width = 256;
  const height = 512;
  const strandCount = clamp(Math.round(filamentCount), 8, 40);
  const strandSpacing = width / strandCount;
  const denierScale = Math.sqrt(denier / 1300);
  const filamentDiameterScale = clamp(.5 * (denier / 1000), .15, 1.5);
  const colorCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  const normalCanvas = document.createElement("canvas");
  const roughnessCanvas = document.createElement("canvas");
  const specularCanvas = document.createElement("canvas");
  colorCanvas.width = bumpCanvas.width = width;
  colorCanvas.height = bumpCanvas.height = height;
  normalCanvas.width = roughnessCanvas.width = specularCanvas.width = width;
  normalCanvas.height = roughnessCanvas.height = specularCanvas.height = height;
  const colorCtx = colorCanvas.getContext("2d");
  const bumpCtx = bumpCanvas.getContext("2d");
  const roughnessCtx = roughnessCanvas.getContext("2d");
  const specularCtx = specularCanvas.getContext("2d");
  const colorImage = colorCtx.createImageData(width, height);
  const bumpImage = bumpCtx.createImageData(width, height);
  const roughnessImage = roughnessCtx.createImageData(width, height);
  const specularImage = specularCtx.createImageData(width, height);
  const bumpAmplitude = clamp(112 * denierScale * filamentDiameterScale, 36, 172);

  for (let y = 0; y < height; y += 1) {
    const longitudinalGlint = Math.sin(y * .071) * 1.7 + Math.sin(y * .019) * 1.2;
    for (let x = 0; x < width; x += 1) {
      const wave = Math.sin(y * .028 + x * .004) * strandSpacing * .075;
      const wrappedX = mod(x + wave, width);
      const strandPosition = wrappedX / strandSpacing;
      const strandIndex = Math.floor(strandPosition);
      const local = strandPosition - strandIndex;
      const ridge = Math.pow(Math.sin(Math.PI * local), .72);
      const fiberCore = Math.pow(Math.sin(Math.PI * local), 5.5);
      const contactShadow = Math.pow(1 - ridge, 3);
      const filamentTone = (fract(Math.sin((strandIndex + 1) * 91.713) * 43758.5453) - .5) * 7;
      const silkGlint = fiberCore * (25 + longitudinalGlint * 1.8);
      const colorValue = clampByte(198 + ridge * 31 - contactShadow * 22 + filamentTone + silkGlint);
      const bumpValue = clampByte(62 + ridge * bumpAmplitude);
      const roughnessValue = clampByte(236 - fiberCore * 164 - ridge * 18);
      const specularValue = clampByte(54 + fiberCore * 198 + ridge * 20);
      const offset = (y * width + x) * 4;

      colorImage.data[offset] = colorValue;
      colorImage.data[offset + 1] = colorValue;
      colorImage.data[offset + 2] = colorValue;
      colorImage.data[offset + 3] = 255;
      bumpImage.data[offset] = bumpValue;
      bumpImage.data[offset + 1] = bumpValue;
      bumpImage.data[offset + 2] = bumpValue;
      bumpImage.data[offset + 3] = 255;
      roughnessImage.data[offset] = roughnessValue;
      roughnessImage.data[offset + 1] = roughnessValue;
      roughnessImage.data[offset + 2] = roughnessValue;
      roughnessImage.data[offset + 3] = 255;
      specularImage.data[offset] = specularValue;
      specularImage.data[offset + 1] = specularValue;
      specularImage.data[offset + 2] = specularValue;
      specularImage.data[offset + 3] = specularValue;
    }
  }
  colorCtx.putImageData(colorImage, 0, 0);
  bumpCtx.putImageData(bumpImage, 0, 0);
  roughnessCtx.putImageData(roughnessImage, 0, 0);
  specularCtx.putImageData(specularImage, 0, 0);

  const normalCtx = normalCanvas.getContext("2d");
  const normalImage = normalCtx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = bumpImage.data[(y * width + mod(x - 1, width)) * 4];
      const right = bumpImage.data[(y * width + mod(x + 1, width)) * 4];
      const up = bumpImage.data[(mod(y - 1, height) * width + x) * 4];
      const down = bumpImage.data[(mod(y + 1, height) * width + x) * 4];
      const nx = (left - right) / 255;
      const ny = (up - down) / 255;
      const nz = 1.45;
      const inverseLength = 1 / Math.hypot(nx, ny, nz);
      const offset = (y * width + x) * 4;
      normalImage.data[offset] = (nx * inverseLength * .5 + .5) * 255;
      normalImage.data[offset + 1] = (ny * inverseLength * .5 + .5) * 255;
      normalImage.data[offset + 2] = (nz * inverseLength * .5 + .5) * 255;
      normalImage.data[offset + 3] = 255;
    }
  }
  normalCtx.putImageData(normalImage, 0, 0);

  const colorTexture = new THREE.CanvasTexture(colorCanvas);
  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  const normalTexture = new THREE.CanvasTexture(normalCanvas);
  const roughnessTexture = new THREE.CanvasTexture(roughnessCanvas);
  const specularTexture = new THREE.CanvasTexture(specularCanvas);
  for (const texture of [colorTexture, bumpTexture, normalTexture, roughnessTexture, specularTexture]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 1.35);
    texture.anisotropy = Math.min(12, state.renderer.capabilities.getMaxAnisotropy?.() || 1);
  }
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  const maps = {
    color: colorTexture,
    bump: bumpTexture,
    normal: normalTexture,
    roughness: roughnessTexture,
    specular: specularTexture
  };
  state.polyesterFiberMaps.set(mapKey, maps);
  return maps;
}

function geometryFromTexgenMesh(mesh) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.vertices, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(mesh.uvs, 2));
  geometry.setIndex(mesh.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function renderCanvasFromThree() {
  const previewZoom = state.zoom;
  state.camera.position.set(0, 0, previewZoom);
  state.camera.lookAt(0, 0, 0);
  const previewRotation = {
    x: state.viewRotation.x,
    y: state.viewRotation.y,
    z: state.viewRotation.z + state.autoRotation
  };
  state.ropeGroup.rotation.set(previewRotation.x, previewRotation.y, previewRotation.z);
  const canvas = ui.patternCanvas;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const mountRect = ui.threeMount.getBoundingClientRect();
  if (state.texgenMesh?.cylindricalWeave) {
    state.camera.position.z = clamp(state.texgenMesh.length * 1.05, 24, 36);
    state.ropeGroup.rotation.set(0, -.18, 0);
  }
  state.camera.aspect = canvas.width / canvas.height;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(canvas.width, canvas.height, false);
  state.renderer.render(state.scene, state.camera);
  ctx.drawImage(state.renderer.domElement, 0, 0, canvas.width, canvas.height);

  state.ropeGroup.rotation.set(previewRotation.x, previewRotation.y, previewRotation.z);
  state.camera.position.z = previewZoom;
  state.camera.aspect = mountRect.width / Math.max(1, mountRect.height);
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(mountRect.width, mountRect.height, false);
  state.renderer.render(state.scene, state.camera);
}

function disposeObject(object) {
  object.traverse?.((child) => {
    child.geometry?.dispose();
    if (!child.material?.userData?.sharedBraidMaterial) {
      child.material?.map?.dispose?.();
      child.material?.bumpMap?.dispose?.();
      child.material?.dispose?.();
    }
  });
  object.geometry?.dispose();
  if (!object.material?.userData?.sharedBraidMaterial) object.material?.dispose?.();
}

function makeFilamentYarnBundle(index, result, radius, length) {
  const carrier = result.carriers[index];
  const dir = directionFor(index);
  const phase = index * (Math.PI * 2 / result.carrierCount);
  const group = new THREE.Group();
  const steps = 138;
  const lane = (Math.PI * 2 * radius / result.carrierCount) * result.strandWidthScale;
  const filamentCount = result.filamentCount;
  const filamentRadius = clamp(lane / filamentCount * .82 * result.denierScale, .008, .046);
  const bundleWidth = lane * .58;
  const bundleDepth = clamp(lane * .08, .012, .046);

  group.add(makeBundleUnderlay(index, result, radius, length, lane * 1.08));

  for (let filament = 0; filament < filamentCount; filament += 1) {
    const rowPos = filamentCount === 1 ? 0 : (filament / (filamentCount - 1)) * 2 - 1;
    const herringbone = filament % 2 === 0 ? 1 : -1;
    const lateralBase = rowPos * bundleWidth * .5;
    const depthBase = (1 - Math.abs(rowPos)) * bundleDepth;
    const points = [];

    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const zMm = t * result.lengthMm;
      const theta = phase + dir * (zMm / result.pitchMm) * Math.PI * 2;
      const row = Math.floor(t * result.rows);
      const over = ((row + index + (dir > 0 ? 0 : crossingSpan())) % (crossingSpan() * 2)) < crossingSpan();
      const braidPulse = over ? 1 : .2;
      const micro = Math.sin(t * Math.PI * 34 + filament * 1.7) * bundleWidth * .012 * herringbone;
      const lateral = lateralBase + micro;
      const radial = radius + depthBase + braidPulse * bundleDepth * .45;
      const thetaOffset = lateral / Math.max(.001, radial);
      const z = -length / 2 + t * length + herringbone * Math.sin(t * Math.PI * 24 + filament) * .006;
      const finalTheta = theta + thetaOffset;
      points.push(new THREE.Vector3(Math.cos(finalTheta) * radial, Math.sin(finalTheta) * radial, z));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, steps, filamentRadius, 5, false);
    const mesh = new THREE.Mesh(geometry, getFiberMaterial(carrier.color, filament));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

function makeBundleUnderlay(index, result, radius, length, width) {
  const carrier = result.carriers[index];
  const dir = directionFor(index);
  const phase = index * (Math.PI * 2 / result.carrierCount);
  const steps = 138;
  const vertices = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const zMm = t * result.lengthMm;
    const theta = phase + dir * (zMm / result.pitchMm) * Math.PI * 2;
    const row = Math.floor(t * result.rows);
    const over = ((row + index + (dir > 0 ? 0 : crossingSpan())) % (crossingSpan() * 2)) < crossingSpan();
    const radial = radius + (over ? width * .035 : width * .008);
    const z = -length / 2 + t * length;

    for (const side of [-1, 1]) {
      const thetaOffset = side * width * .5 / Math.max(.001, radial);
      const finalTheta = theta + thetaOffset;
      vertices.push(Math.cos(finalTheta) * radial, Math.sin(finalTheta) * radial, z);
      normals.push(Math.cos(finalTheta), Math.sin(finalTheta), .04);
      uvs.push(side < 0 ? 0 : 1, t * 10);
    }
  }

  for (let i = 0; i < steps; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = getYarnMaterial(carrier.color);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeYarnRibbonSegment(segment, result, radius, length) {
  const steps = 7;
  const zStart = -length / 2 + segment.z0 * length;
  const zEnd = -length / 2 + segment.z1 * length;
  const surface = radius + (segment.over ? .052 : .012);
  const width = (Math.PI * 2 * radius / result.carrierCount) * result.strandWidthScale * 1.18;
  const vertices = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  const dTheta = segment.theta1 - segment.theta0;
  const dZ = zEnd - zStart;
  const tangentU = surface * dTheta;
  const tangentV = dZ;
  const normalizer = Math.hypot(tangentU, tangentV) || 1;
  const perpU = -tangentV / normalizer;
  const perpV = tangentU / normalizer;

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const baseTheta = lerp(segment.theta0, segment.theta1, t);
    const baseZ = lerp(zStart, zEnd, t);
    for (const side of [-1, 1]) {
      const uOffset = perpU * width * .5 * side;
      const zOffset = perpV * width * .5 * side;
      const theta = baseTheta + uOffset / surface;
      const z = baseZ + zOffset;
      vertices.push(Math.cos(theta) * surface, Math.sin(theta) * surface, z);
      normals.push(Math.cos(theta), Math.sin(theta), .08);
      uvs.push(side < 0 ? 0 : 1, t * 5);
    }
  }

  for (let i = 0; i < steps; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = getYarnMaterial(segment.color);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function getYarnMaterial(color) {
  const key = color.toLowerCase();
  if (state.materialCache.has(key)) return state.materialCache.get(key);
  const texture = makeYarnTexture(color);
  const normal = makeHerringboneNormalTexture();
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    map: texture,
    bumpMap: normal.bump,
    bumpScale: .045,
    normalMap: normal.normal,
    normalScale: new THREE.Vector2(.42, -.42),
    roughness: .98,
    metalness: 0,
    side: THREE.DoubleSide
  });
  state.materialCache.set(key, material);
  return material;
}

function getFiberMaterial(color, variant) {
  const tone = 0.86 + (variant % 7) * .045;
  const key = `${color.toLowerCase()}:fiber:${variant % 7}`;
  if (state.materialCache.has(key)) return state.materialCache.get(key);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(shade(color, tone)),
    roughness: .99,
    metalness: 0
  });
  state.materialCache.set(key, material);
  return material;
}

function makeHerringboneNormalTexture() {
  const key = "herringbone-normal";
  if (state.materialCache.has(key)) return state.materialCache.get(key);
  const size = 128;
  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext("2d");
  bctx.fillStyle = "#777";
  bctx.fillRect(0, 0, size, size);
  for (let y = -16; y < size + 16; y += 16) {
    for (let x = -16; x < size + 16; x += 22) {
      const gradA = bctx.createLinearGradient(x, y + 8, x + 11, y);
      gradA.addColorStop(0, "#5f5f5f");
      gradA.addColorStop(.52, "#d9d9d9");
      gradA.addColorStop(1, "#777");
      bctx.strokeStyle = gradA;
      bctx.lineWidth = 3;
      bctx.beginPath();
      bctx.moveTo(x, y + 8);
      bctx.lineTo(x + 11, y);
      bctx.stroke();

      const gradB = bctx.createLinearGradient(x + 11, y, x + 22, y + 8);
      gradB.addColorStop(0, "#777");
      gradB.addColorStop(.52, "#d9d9d9");
      gradB.addColorStop(1, "#5f5f5f");
      bctx.strokeStyle = gradB;
      bctx.beginPath();
      bctx.moveTo(x + 11, y);
      bctx.lineTo(x + 22, y + 8);
      bctx.stroke();
    }
  }

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = size;
  normalCanvas.height = size;
  const nctx = normalCanvas.getContext("2d");
  const src = bctx.getImageData(0, 0, size, size).data;
  const out = nctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const left = src[((y * size + ((x - 1 + size) % size)) * 4)];
      const right = src[((y * size + ((x + 1) % size)) * 4)];
      const up = src[((((y - 1 + size) % size) * size + x) * 4)];
      const down = src[((((y + 1) % size) * size + x) * 4)];
      const dx = (left - right) / 255;
      const dy = (up - down) / 255;
      const dz = 1.6;
      const inv = 1 / Math.hypot(dx, dy, dz);
      const offset = (y * size + x) * 4;
      out.data[offset] = (dx * inv * .5 + .5) * 255;
      out.data[offset + 1] = (dy * inv * .5 + .5) * 255;
      out.data[offset + 2] = (dz * inv * .5 + .5) * 255;
      out.data[offset + 3] = 255;
    }
  }
  nctx.putImageData(out, 0, 0);

  const bump = new THREE.CanvasTexture(bumpCanvas);
  const normal = new THREE.CanvasTexture(normalCanvas);
  for (const texture of [bump, normal]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.8, 7.5);
  }
  const value = { bump, normal };
  state.materialCache.set(key, value);
  return value;
}

function makeYarnTexture(color) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const light = isLightColor(color);
  for (let row = -16; row < 144; row += 16) {
    for (let x = -24; x < 152; x += 22) {
      ctx.globalAlpha = light ? .34 : .22;
      ctx.strokeStyle = light ? "rgba(132,136,130,.72)" : shade(color, .68);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, row + 8);
      ctx.lineTo(x + 11, row);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 11, row);
      ctx.lineTo(x + 22, row + 8);
      ctx.stroke();

      ctx.globalAlpha = light ? .22 : .18;
      ctx.strokeStyle = light ? "rgba(255,255,255,.72)" : shade(color, 1.22);
      ctx.beginPath();
      ctx.moveTo(x + 3, row + 10);
      ctx.lineTo(x + 11, row + 3);
      ctx.lineTo(x + 19, row + 10);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.8, 7.5);
  return texture;
}

function renderSummary(result) {
  ui.diameterValue.textContent = `${result.diameterMm} mm`;
  ui.angleValue.textContent = `${result.angleDeg}°`;
  ui.strandWidthValue.textContent = `${Math.round(result.strandWidthScale * 100)}%`;
  ui.filamentCountValue.textContent = `${result.filamentCount}`;
  ui.denierValue.textContent = `${result.denier}D`;
  ui.repeatBadge.textContent = `${result.repeatRows} sıra tekrar`;
  ui.sceneMeta.textContent = `${result.carrierCount} kukla, ${result.diameterMm} mm, ${result.angleDeg}° örgü`;
  ui.summary.innerHTML = [
    ["Kukla", `${result.carrierCount} adet`],
    ["Gruplar", `${result.carrierCount / 2} S + ${result.carrierCount / 2} Z`],
    ["Çap", `${result.diameterMm} mm`],
    ["Tel / denye", `${result.filamentCount} tel x ${result.denier}D`],
    ["Bir tur adımı", `${result.pitchMm.toFixed(1)} mm`],
    ["Görünen tur", `${result.turns.toFixed(2)} tur`],
    ["Yüzey çevresi", `${result.circumference.toFixed(1)} mm`],
    ["Kukla aralığı", `${result.laneWidth.toFixed(2)} mm`],
    ["Desen tekrarı", `${result.repeatRows} örgü sırası`],
    ["Görünen kesit", `${result.visibleRows} sıra`],
    ["Üst-alt", ui.crossingMode.options[ui.crossingMode.selectedIndex].textContent]
  ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join("");

  ui.carrierTable.innerHTML = result.carriers.map((carrier) => `
    <div class="carrier-row">
      <strong>${carrier.no}</strong>
      <span class="swatch" style="background:${carrier.color}"></span>
      <span>${carrier.group} - ${carrier.direction} - ${colorName(carrier.color)}</span>
    </div>
  `).join("");
}

function updateControlReadouts() {
  ui.diameterValue.textContent = `${ui.diameter.value} mm`;
  ui.angleValue.textContent = `${ui.braidAngle.value}°`;
  ui.strandWidthValue.textContent = `${ui.strandWidth.value}%`;
  ui.filamentCountValue.textContent = ui.filamentCount.value;
  ui.denierValue.textContent = `${ui.denier.value}D`;
}

function refreshGenerateButton() {
  ui.generateBraid.disabled = state.generating;
  ui.generateBraid.textContent = state.generating ? "Üretiliyor..." : "Üret";
  ui.generateBraid.classList.toggle("is-dirty", state.simulationDirty && !state.generating);
}

function markSimulationDirty() {
  updateControlReadouts();
  savePreferences();
  state.simulationDirty = true;
  refreshGenerateButton();
  if (!state.generating) ui.statusPill.textContent = "Değişiklikler hazır";
}

function renderAll() {
  const result = calculateBraid();
  state.lastResult = result;
  state.simulationDirty = false;
  updateControlReadouts();
  refreshGenerateButton();
  savePreferences();
  renderSummary(result);
  requestTexgenMesh(result);
}

function resizeThree() {
  const rect = ui.threeMount.getBoundingClientRect();
  state.camera.aspect = rect.width / Math.max(1, rect.height);
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(rect.width, rect.height, false);
}

function installThreeInteractions() {
  const mount = ui.threeMount;
  mount.addEventListener("contextmenu", (event) => event.preventDefault());
  mount.addEventListener("pointerdown", (event) => {
    mount.setPointerCapture(event.pointerId);
    state.spin = false;
    ui.toggleSpin.textContent = "Sabit";
    state.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      mode: event.button === 2 || event.shiftKey ? "z" : "xy"
    };
    mount.classList.add("is-dragging");
  });
  mount.addEventListener("pointermove", (event) => {
    if (!state.drag || state.drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.drag.x;
    const dy = event.clientY - state.drag.y;
    state.drag.x = event.clientX;
    state.drag.y = event.clientY;

    if (state.drag.mode === "z") {
      state.viewRotation.z += dx * .012;
    } else {
      state.viewRotation.y += dx * .01;
      state.viewRotation.x += dy * .01;
      state.viewRotation.x = clamp(state.viewRotation.x, -Math.PI * .48, Math.PI * .48);
    }
  });
  mount.addEventListener("pointerup", endThreeDrag);
  mount.addEventListener("pointercancel", endThreeDrag);
  mount.addEventListener("wheel", (event) => {
    event.preventDefault();
    const maxZoom = state.texgenMesh?.flatWeave || state.texgenMesh?.cylindricalWeave ? 55 : 13;
    state.zoom = clamp(state.zoom + event.deltaY * .006, 4.6, maxZoom);
    state.camera.position.z = state.zoom;
    state.camera.lookAt(0, 0, 0);
  }, { passive: false });
}

function endThreeDrag(event) {
  if (!state.drag || state.drag.pointerId !== event.pointerId) return;
  ui.threeMount.releasePointerCapture(event.pointerId);
  ui.threeMount.classList.remove("is-dragging");
  state.drag = null;
}

function animate() {
  requestAnimationFrame(animate);
  if (state.spin && state.ropeGroup) {
    state.autoRotation += .006;
  }
  state.camera.position.z = state.zoom;
  if (state.texgenMesh?.cylindricalWeave) {
    state.camera.position.y = 0;
    state.camera.lookAt(0, 0, 0);
  }
  state.ropeGroup.rotation.x = state.viewRotation.x;
  state.ropeGroup.rotation.y = state.viewRotation.y;
  state.ropeGroup.rotation.z = state.viewRotation.z + state.autoRotation;
  state.renderer.render(state.scene, state.camera);
}

function resetDefaultColors() {
  const count = Number(ui.carrierCount.value);
  initCarriers(count, { preserveExisting: false });
  renderCarrierControls();
  markSimulationDirty();
}

function updateCarrierCount() {
  const count = Number(ui.carrierCount.value);
  initCarriers(count, { preserveExisting: true });
  renderCarrierControls();
  markSimulationDirty();
}

function shade(hex, amount) {
  const clean = hex.replace("#", "");
  const rgb = [0, 2, 4].map((pos) => parseInt(clean.slice(pos, pos + 2), 16));
  return `rgb(${rgb.map((value) => Math.max(0, Math.min(255, Math.round(value * amount)))).join(",")})`;
}

function colorName(hex) {
  return colorNames[hex.toLowerCase()] || hex.toUpperCase();
}

function wrap(value, max) {
  return ((value % max) + max) % max;
}

function mod(value, max) {
  return ((value % max) + max) % max;
}

function fract(value) {
  return value - Math.floor(value);
}

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return fract(s);
}

function cssToRgb(hex) {
  const clean = String(hex || defaultBase).replace("#", "");
  return [0, 2, 4].map((pos) => parseInt(clean.slice(pos, pos + 2), 16) || 0);
}

function shadeRgb(rgb, amount) {
  return rgb.map((value) => clampByte(value * amount));
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function gcd(a, b) {
  return b ? gcd(b, a % b) : a;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function openImageModal() {
  ui.modalImage.src = ui.patternCanvas.toDataURL("image/png");
  ui.imageModal.hidden = false;
  ui.closeImageModal.focus();
}

function closeImageModal() {
  ui.imageModal.hidden = true;
  ui.modalImage.removeAttribute("src");
}

ui.carrierCount.addEventListener("change", updateCarrierCount);
ui.diameter.addEventListener("input", markSimulationDirty);
ui.braidAngle.addEventListener("input", markSimulationDirty);
ui.strandWidth.addEventListener("input", markSimulationDirty);
ui.filamentCount.addEventListener("input", markSimulationDirty);
ui.denier.addEventListener("input", markSimulationDirty);
ui.crossingMode.addEventListener("change", markSimulationDirty);
ui.generateBraid.addEventListener("click", renderAll);
ui.bulkColor.addEventListener("input", () => {
  state.activeColor = ui.bulkColor.value;
  renderFixedPalette();
  savePreferences();
});
ui.paintAll.addEventListener("click", () => {
  state.carriers.forEach((carrier) => carrier.color = state.activeColor);
  renderCarrierControls();
  markSimulationDirty();
});
ui.resetColors.addEventListener("click", resetDefaultColors);
ui.invertFlow.addEventListener("click", () => {
  state.flip = !state.flip;
  renderCarrierControls();
  markSimulationDirty();
});
ui.toggleSpin.addEventListener("click", () => {
  state.spin = !state.spin;
  ui.toggleSpin.textContent = state.spin ? "Döndür" : "Sabit";
});
ui.downloadPng.addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = ui.patternCanvas.toDataURL("image/png");
  a.download = `braidstudio-${ui.carrierCount.value}-kukla.png`;
  a.click();
});
ui.patternCanvas.addEventListener("click", openImageModal);
ui.closeImageModal.addEventListener("click", closeImageModal);
ui.imageModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-modal]")) closeImageModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !ui.imageModal.hidden) closeImageModal();
});
document.addEventListener("click", (event) => {
  if (ui.carrierPopover.hidden) return;
  if (ui.carrierPopover.contains(event.target) || event.target.closest(".carrier")) return;
  hideCarrierPopover();
});

initThree();
const savedPreferences = loadPreferences();
applySavedPreferences(savedPreferences);
initCarriers(Number(ui.carrierCount.value), {
  preserveExisting: false,
  colors: savedPreferences?.carrierColors
});
renderFixedPalette();
renderCarrierControls();
updateControlReadouts();
renderAll();
