import { evaluateProductionFit } from "/src/utils/braidProductionPhysics.js";

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
  productionFit: $("#productionFit"),
  generateBraid: $("#generateBraid"),
  carrierGrid: $("#carrierGrid"),
  carrierPopover: $("#carrierPopover"),
  fixedPalette: $("#fixedPalette"),
  bulkColor: $("#bulkColor"),
  paintAll: $("#paintAll"),
  resetColors: $("#resetColors"),
  invertFlow: $("#invertFlow"),
  repeatBadge: $("#repeatBadge"),
  summary: $("#summary"),
  carrierTable: $("#carrierTable"),
  patternCanvas: $("#patternCanvas"),
  photoRender: $("#photoRender"),
  photoRenderState: $("#photoRenderState"),
  renderStage: $(".render-stage"),
  meterPosition: $("#meterPosition"),
  meterWindowLabel: $("#meterWindowLabel"),
  diameterRulers: [$("#diameterRulerLeft"), $("#diameterRulerRight")],
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
const denierGeometryCalibration = 1 / 3;
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
  photoRenderUrl: null,
  photoRenderObjectUrl: null,
  polyesterReference: null,
  renderNonce: null,
  simulationDirty: false,
  generating: false
};

function defaultCarrierColor(no) {
  return no === 1 || no === 3 ? defaultMarker : defaultGround;
}

function validHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ""));
}

function effectiveDenier(denier) {
  return Math.max(1, Number(denier) * denierGeometryCalibration);
}

function loadPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) || "null");
    if (!value || typeof value !== "object") return null;
    if (value.schemaVersion !== 3) {
      if (Number(value.strandWidth) === 130) value.strandWidth = 100;
      if (Number(value.filamentCount) === 30) value.filamentCount = 20;
      if (Number(value.denier) === 1300) value.denier = 1000;
      value.schemaVersion = 3;
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
      schemaVersion: 3,
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
  const denierScale = Math.sqrt(effectiveDenier(denier) / 1000);
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
  const productionFit = evaluateProductionFit({
    diameterMm,
    carrierCount,
    angleDeg,
    filamentCount,
    denier,
    strandWidthScale
  });

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
    productionFit,
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
  const roughnessMap = document.createElement("canvas");
  roughnessMap.width = width;
  roughnessMap.height = height;
  const normalMap = document.createElement("canvas");
  normalMap.width = width;
  normalMap.height = height;
  const cctx = color.getContext("2d");
  const hctx = heightMap.getContext("2d");
  const rctx = roughnessMap.getContext("2d");
  const nctx = normalMap.getContext("2d");
  const colorImage = cctx.createImageData(width, height);
  const heightImage = hctx.createImageData(width, height);
  const roughnessImage = rctx.createImageData(width, height);
  const normalImage = nctx.createImageData(width, height);
  const lanes = result.carrierCount / 2;
  const sCarriers = result.carriers.filter((carrier) => carrier.group === "S");
  const zCarriers = result.carriers.filter((carrier) => carrier.group === "Z");
  const rgbCache = new Map(result.carriers.map((carrier) => [carrier.color, cssToRgb(carrier.color)]));
  const baseRgb = cssToRgb(mostCommonCarrierColor(result));
  const angleSlope = Math.tan(result.angleDeg * Math.PI / 180);
  const axialAdvance = result.lengthMm * angleSlope / result.laneWidth;
  const materialFill = Math.pow(result.denier / 1300, .12) * Math.pow(result.filamentCount / 30, .08);
  const bandHalf = clamp(.525 * result.strandWidthScale * materialFill, .45, .64);
  const span = Math.max(1, crossingSpan());

  for (let y = 0; y < height; y += 1) {
    const axial = ((y + .5) / height) * axialAdvance;
    for (let x = 0; x < width; x += 1) {
      const circumferential = ((x + .5) / width) * lanes;
      const sValue = circumferential - axial;
      const zValue = circumferential + axial + .5;
      const sLine = Math.round(sValue);
      const zLine = Math.round(zValue);
      const sSigned = sValue - sLine;
      const zSigned = zValue - zLine;
      const sDistance = Math.abs(sSigned);
      const zDistance = Math.abs(zSigned);
      const inS = sDistance <= bandHalf;
      const inZ = zDistance <= bandHalf;
      const sOver = mod(sLine + zLine, span * 2) < span;

      let family = "base";
      let signedDistance = 0;
      let visibleRgb = baseRgb;
      let crossingAmount = 0;
      let underDistance = 1;
      if (inS && (!inZ || sOver)) {
        family = "S";
        signedDistance = sSigned;
        underDistance = zDistance / bandHalf;
        const carrier = sCarriers[mod(sLine, sCarriers.length)];
        visibleRgb = rgbCache.get(carrier?.color) || baseRgb;
      } else if (inZ) {
        family = "Z";
        signedDistance = zSigned;
        underDistance = sDistance / bandHalf;
        const carrier = zCarriers[mod(zLine, zCarriers.length)];
        visibleRgb = rgbCache.get(carrier?.color) || baseRgb;
      }
      if (inS && inZ) {
        crossingAmount = Math.pow(Math.max(0, 1 - underDistance * underDistance), .36);
      }

      let heightValue = 34;
      let roughnessValue = 236;
      let rgb;
      if (family === "base") {
        const recess = .61 + .035 * Math.sin((circumferential + axial) * Math.PI * 2);
        rgb = shadeRgb(baseRgb, recess);
      } else {
        const rawNormalized = clamp(signedDistance / bandHalf, -1, 1);
        const compressionSpread = 1 + crossingAmount * .07;
        const normalized = clamp(rawNormalized / compressionSpread, -1, 1);
        const crownBase = Math.max(0, 1 - normalized * normalized);
        const crown = Math.pow(crownBase, .31 + crossingAmount * .055);
        const along = family === "S" ? axial + circumferential : axial - circumferential;
        const filaments = Math.max(8, result.filamentCount);
        const familySign = family === "S" ? 1 : -1;
        const lightCenter = family === "S" ? -.24 : .14;
        const directionalLobe = Math.exp(-Math.pow((normalized - lightCenter) / .25, 2));
        const material = samplePolyesterReference(
          along * (.72 + result.denier / 4200),
          (normalized * .5 + .5) * .42 * (filaments / 30) * Math.sqrt(1300 / result.denier),
          familySign
        );
        const bundleDrift = (hash2(Math.floor(along * 2.2), familySign + 7) - .5) * .34
          + Math.sin(along * Math.PI * 1.35 + familySign) * .11;
        const filamentPosition = (normalized * .5 + .5) * filaments + bundleDrift;
        const filamentWave = Math.cos(fract(filamentPosition) * Math.PI * 2);
        const filamentCrown = Math.sign(filamentWave) * Math.pow(Math.abs(filamentWave), 1.65);
        const filamentCluster = .78 + .22 * Math.sin(
          along * Math.PI * 3.4 + Math.floor(filamentPosition) * .91
        );
        const filamentGlint = Math.pow(Math.max(0, filamentWave), 7)
          * filamentCluster
          * (.68 + .32 * hash2(Math.floor(along * 19), Math.floor(filamentPosition)));
        const fiberRelief = material.relief * (11 + result.denier / 390)
          + filamentCrown * (7 + result.denier / 520);
        const satinRibbon = material.highlight * Math.pow(crown, 1.1);
        const silkGlint = material.sparkle * (.72 + .28 * directionalLobe);
        const lightBias = .06 * (1 - Math.abs(normalized + .22));
        const edgeRoll = Math.pow(Math.abs(normalized), 3.2) * .14;
        const crossingEdge = Math.exp(-Math.pow((underDistance - .92) / .062, 2));
        const contactShadow = crossingEdge * (.145 + .055 * Math.max(0, normalized * familySign));
        const crossingCompression = crossingAmount * Math.pow(crown, .72);
        const crossingHighlight = crossingCompression * directionalLobe * .11;
        const shoulderLight = directionalLobe * crown * (.045 + crossingAmount * .03);
        const shadeValue = .72 + crown * .25 + material.relief * .055
          + filamentCrown * .024 + filamentGlint * .055
          + satinRibbon * .075 + silkGlint * .045
          + lightBias + crossingHighlight + shoulderLight - edgeRoll - contactShadow;
        rgb = polyesterShadeRgb(
          visibleRgb,
          shadeValue,
          satinRibbon * .09 + silkGlint * .065 + filamentGlint * .085
        );
        heightValue = 58 + crown * (166 - crossingCompression * 9) + crossingCompression * 32
          + directionalLobe * crossingCompression * 11
          + fiberRelief + material.highlight * 8;
        roughnessValue = 190 - material.highlight * 68 - material.sparkle * 28
          - filamentGlint * 112 - Math.max(0, filamentCrown) * 20
          + Math.pow(Math.abs(normalized), 2.4) * 32;
      }

      const idx = (y * width + x) * 4;
      colorImage.data[idx] = clampByte(rgb[0]);
      colorImage.data[idx + 1] = clampByte(rgb[1]);
      colorImage.data[idx + 2] = clampByte(rgb[2]);
      colorImage.data[idx + 3] = 255;
      const h = clampByte(heightValue);
      heightImage.data[idx] = h;
      heightImage.data[idx + 1] = h;
      heightImage.data[idx + 2] = h;
      heightImage.data[idx + 3] = 255;
      const rough = clampByte(roughnessValue);
      roughnessImage.data[idx] = rough;
      roughnessImage.data[idx + 1] = rough;
      roughnessImage.data[idx + 2] = rough;
      roughnessImage.data[idx + 3] = 255;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const yBefore = Math.max(0, y - 1);
    const yAfter = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x += 1) {
      const xBefore = mod(x - 1, width);
      const xAfter = mod(x + 1, width);
      const offset = (y * width + x) * 4;
      const left = heightImage.data[(y * width + xBefore) * 4];
      const right = heightImage.data[(y * width + xAfter) * 4];
      const up = heightImage.data[(yBefore * width + x) * 4];
      const down = heightImage.data[(yAfter * width + x) * 4];
      let nx = (left - right) * .055;
      let ny = (up - down) * .055;
      const inverseLength = 1 / Math.hypot(nx, ny, 1);
      nx *= inverseLength;
      ny *= inverseLength;
      const nz = inverseLength;
      normalImage.data[offset] = clampByte(128 + nx * 127);
      normalImage.data[offset + 1] = clampByte(128 + ny * 127);
      normalImage.data[offset + 2] = clampByte(nz * 255);
      normalImage.data[offset + 3] = 255;
    }
  }

  cctx.putImageData(colorImage, 0, 0);
  hctx.putImageData(heightImage, 0, 0);
  rctx.putImageData(roughnessImage, 0, 0);
  nctx.putImageData(normalImage, 0, 0);
  return { color, height: heightMap, roughness: roughnessMap, normal: normalMap };
}

function samplePolyesterReference(along, across, direction) {
  const source = state.polyesterReference;
  if (!source) return { relief: 0, highlight: 0, sparkle: 0 };
  const u = fract(direction > 0 ? along : -along);
  const v = fract(across);
  const x = Math.min(source.width - 1, Math.floor(u * source.width));
  const y = Math.min(source.height - 1, Math.floor(v * source.height));
  const yBefore = mod(y - 2, source.height);
  const yAfter = mod(y + 2, source.height);
  const index = (y * source.width + x) * 4;
  const beforeIndex = (yBefore * source.width + x) * 4;
  const afterIndex = (yAfter * source.width + x) * 4;
  const luminance = polyesterLuminance(source.data, index);
  const before = polyesterLuminance(source.data, beforeIndex);
  const after = polyesterLuminance(source.data, afterIndex);
  const localMean = (before + luminance + after) / 3;
  const relief = clamp((luminance - 219) / 35, -1, 1);
  const highlight = Math.pow(clamp((luminance - 229) / 24, 0, 1), 1.4);
  const sparkle = Math.pow(clamp((luminance - localMean) / 13, 0, 1), 1.15);
  return { relief, highlight, sparkle };
}

function polyesterLuminance(data, index) {
  return (data[index] * 299 + data[index + 1] * 587 + data[index + 2] * 114) / 1000;
}

async function loadPolyesterReference() {
  const image = new Image();
  image.decoding = "async";
  image.src = "/polyester-multifilament-v1.png?v=3";
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  const pixelCount = pixels.width * pixels.height;
  for (let index = 0; index < pixels.data.length; index += 4) {
    const luminance = polyesterLuminance(pixels.data, index);
    luminanceSum += luminance;
    luminanceSquaredSum += luminance * luminance;
  }
  const mean = luminanceSum / pixelCount;
  const variance = Math.max(1, luminanceSquaredSum / pixelCount - mean * mean);
  state.polyesterReference = {
    width: pixels.width,
    height: pixels.height,
    data: pixels.data,
    mean,
    deviation: Math.sqrt(variance)
  };
}

function polyesterShadeRgb(rgb, amount, glint) {
  const luminance = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  const saturationBoost = luminance < 210 ? 1.08 : 1;
  return rgb.map((channel) => {
    const saturated = luminance + (channel - luminance) * saturationBoost;
    return clampByte(saturated * amount + (255 - saturated) * glint);
  });
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

  state.renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });
  state.renderer.setPixelRatio(Math.max(1.75, Math.min(window.devicePixelRatio || 1, 2)));
  state.renderer.shadowMap.enabled = true;
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  state.renderer.outputColorSpace = THREE.SRGBColorSpace;
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.renderer.toneMappingExposure = .9;
  ui.threeMount.appendChild(state.renderer.domElement);

  state.scene.add(new THREE.HemisphereLight(0xffffff, 0xaeb9c0, .12));
  const key = new THREE.DirectionalLight(0xfffbf5, 2.45);
  key.position.set(4.5, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -34;
  key.shadow.camera.right = 34;
  key.shadow.camera.top = 16;
  key.shadow.camera.bottom = -16;
  key.shadow.camera.near = .1;
  key.shadow.camera.far = 70;
  key.shadow.bias = -.00025;
  key.shadow.normalBias = .018;
  state.scene.add(key);
  const fill = new THREE.DirectionalLight(0xeaf3ff, .2);
  fill.position.set(-5, 1.5, 4);
  state.scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.65);
  rim.position.set(-2, 5, -6);
  state.scene.add(rim);
  const lowerFill = new THREE.DirectionalLight(0xf8fbff, .14);
  lowerFill.position.set(1, -5, 5);
  state.scene.add(lowerFill);
  const cameraFlash = new THREE.PointLight(0xffffff, 42, 36, 2);
  cameraFlash.position.set(0, 2.2, 9);
  state.scene.add(cameraFlash);
  const fiberKey = new THREE.RectAreaLight(0xffffff, 5.4, 12, .62);
  fiberKey.position.set(-1.5, 4.6, 5.4);
  fiberKey.lookAt(0, 0, 0);
  state.scene.add(fiberKey);
  const fiberRim = new THREE.RectAreaLight(0xe8f3ff, 3.2, 9, .38);
  fiberRim.position.set(3.8, 2.4, -4.5);
  fiberRim.lookAt(0, 0, 0);
  state.scene.add(fiberRim);
  installSatinEnvironment();

  state.ropeGroup = new THREE.Group();
  state.scene.add(state.ropeGroup);
  installThreeInteractions();
  resizeThree();
  window.addEventListener("resize", resizeThree);
  animate();
}

function installSatinEnvironment() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const base = ctx.createLinearGradient(0, 0, 0, canvas.height);
  base.addColorStop(0, "#dfe7ec");
  base.addColorStop(.38, "#ffffff");
  base.addColorStop(.64, "#cad5dc");
  base.addColorStop(1, "#f7f8f7");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [x, width, alpha] of [[80, 86, .96], [315, 34, .72], [572, 118, .9], [876, 46, .8]]) {
    const strip = ctx.createLinearGradient(x, 0, x + width, 0);
    strip.addColorStop(0, "rgba(255,255,255,0)");
    strip.addColorStop(.5, `rgba(255,255,255,${alpha})`);
    strip.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = strip;
    ctx.fillRect(x, 0, width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(state.renderer);
  state.scene.environment = pmrem.fromEquirectangular(texture).texture;
  state.scene.environmentIntensity = .28;
  texture.dispose();
  pmrem.dispose();
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
    geometryMode: "mesh",
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
    renderNonce: state.renderNonce,
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

async function requestProductionRender(result) {
  const requestId = ++state.texgenRequestId;
  state.generating = true;
  refreshGenerateButton();
  ui.patternCanvas.hidden = true;
  ui.photoRender.hidden = true;
  ui.renderStage.classList.add("is-rendering");
  showPhotoRenderState("Yeni üretim hazırlanıyor...");
  ui.statusPill.textContent = "Polyester renderı hazırlanıyor";

  try {
    await requestPolyesterRender(result, requestId);
    ui.statusPill.textContent = state.simulationDirty ? "Değişiklikler hazır" : "Üretim yüzeyi";
  } catch (error) {
    if (requestId !== state.texgenRequestId) return;
    ui.renderStage.classList.remove("is-rendering");
    showPhotoRenderState("Yüksek kaliteli lif renderı tamamlanamadı.");
    ui.statusPill.textContent = "Lif render hatası";
    console.error(error);
  } finally {
    if (requestId === state.texgenRequestId) {
      state.generating = false;
      refreshGenerateButton();
    }
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function showPhotoRenderState(text) {
  ui.photoRenderState.textContent = text;
  ui.photoRenderState.hidden = false;
}

const meterOutputLengthMm = 1000;
const meterPixelsPerMm = 16;
const rulerRangeMm = 50;
const meterLightCenterMm = 500;
const meterLightSpanMm = 700;

function updateDiameterRulers(diameterMm, imageHeight) {
  document.querySelector(".rope-measurement").style.setProperty("--meter-render-height", `${imageHeight}px`);
  ui.diameterRulers.forEach((ruler) => {
    ruler.style.setProperty("--meter-render-height", `${imageHeight}px`);
    ruler.style.setProperty("--mm-px", `${meterPixelsPerMm}px`);
    const labels = [0, 10, 20, 30, 40, 50]
      .map((millimeter) => `<span class="ruler-label" style="top:${millimeter * meterPixelsPerMm}px">${millimeter}${millimeter === rulerRangeMm ? " mm" : ""}</span>`)
      .join("");
    const ropeTopMm = (rulerRangeMm - diameterMm) / 2;
    ruler.innerHTML = `${labels}<span class="diameter-span" style="top:${ropeTopMm * meterPixelsPerMm}px;height:${diameterMm * meterPixelsPerMm}px" title="${diameterMm} mm çap"></span>`;
  });
}

function updateMeterNavigation(requestedStartMm = null) {
  const visibleMm = Math.min(
    meterOutputLengthMm,
    ui.renderStage.clientWidth / meterPixelsPerMm
  );
  const maxStartMm = Math.max(0, meterOutputLengthMm - visibleMm);
  if (requestedStartMm !== null) {
    ui.renderStage.scrollLeft = clamp(requestedStartMm, 0, maxStartMm) * meterPixelsPerMm;
  }
  const startMm = clamp(ui.renderStage.scrollLeft / meterPixelsPerMm, 0, maxStartMm);
  const endMm = Math.min(meterOutputLengthMm, startMm + visibleMm);
  ui.meterPosition.max = `${Math.ceil(maxStartMm)}`;
  ui.meterPosition.value = `${Math.round(startMm)}`;
  ui.meterWindowLabel.textContent = `${Math.round(startMm)}-${Math.round(endMm)} mm / 1000 mm`;
}

async function buildMeterPanorama(source, result) {
  const diameterMm = Number(result.diameterMm || result.diameter || 16);
  const sourceAspect = Number(result.renderAspect) || source.naturalWidth / source.naturalHeight;
  const orthoScaleMm = Number(result.orthoScaleMm) || 50;
  const sourceHorizontalMm = orthoScaleMm;
  const sourceVerticalMm = orthoScaleMm / sourceAspect;
  const sourceLengthMm = Math.min(
    sourceHorizontalMm,
    Number(result.repeatLengthMm) || Math.max(48, diameterMm * 3.5)
  );
  const cropWidth = Math.min(
    source.naturalWidth,
    Math.max(1, source.naturalWidth * sourceLengthMm / sourceHorizontalMm)
  );
  const cropHeightMm = Math.min(rulerRangeMm, sourceVerticalMm);
  const cropHeight = Math.min(
    source.naturalHeight,
    Math.max(1, source.naturalHeight * cropHeightMm / sourceVerticalMm)
  );
  const cropX = (source.naturalWidth - cropWidth) / 2;
  const cropY = (source.naturalHeight - cropHeight) / 2;
  const outputWidth = meterOutputLengthMm * meterPixelsPerMm;
  const outputHeight = rulerRangeMm * meterPixelsPerMm;
  const tileContentHeight = Math.round(cropHeightMm * meterPixelsPerMm);
  const tileContentY = Math.round((outputHeight - tileContentHeight) / 2);
  const tileWidth = Math.round(sourceLengthMm * meterPixelsPerMm);
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d", { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const tile = document.createElement("canvas");
  tile.width = tileWidth;
  tile.height = outputHeight;
  const tileContext = tile.getContext("2d", { alpha: false });
  tileContext.imageSmoothingEnabled = true;
  tileContext.imageSmoothingQuality = "high";
  tileContext.fillStyle = "#c6c8c8";
  tileContext.fillRect(0, 0, tileWidth, outputHeight);
  tileContext.drawImage(
    source,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    tileContentY,
    tileWidth,
    tileContentHeight
  );

  for (let x = 0; x < outputWidth; x += tileWidth) {
    const width = Math.min(tileWidth, outputWidth - x);
    context.drawImage(tile, 0, 0, width, outputHeight, x, 0, width, outputHeight);
  }

  const lightLayer = document.createElement("canvas");
  lightLayer.width = outputWidth;
  lightLayer.height = outputHeight;
  const lightContext = lightLayer.getContext("2d");
  const lightCenterX = meterLightCenterMm * meterPixelsPerMm;
  const lightHalfWidth = meterLightSpanMm * meterPixelsPerMm / 2;
  const horizontalLight = lightContext.createLinearGradient(
    lightCenterX - lightHalfWidth,
    0,
    lightCenterX + lightHalfWidth,
    0
  );
  horizontalLight.addColorStop(0, "rgba(255,255,255,0)");
  horizontalLight.addColorStop(.20, "rgba(255,252,246,.34)");
  horizontalLight.addColorStop(.80, "rgba(255,252,246,.34)");
  horizontalLight.addColorStop(1, "rgba(255,255,255,0)");
  lightContext.fillStyle = horizontalLight;
  lightContext.fillRect(lightCenterX - lightHalfWidth, 0, lightHalfWidth * 2, outputHeight);

  const ropeCenterY = outputHeight / 2;
  const lightHalfHeight = (diameterMm / 2 + 5) * meterPixelsPerMm;
  lightContext.globalCompositeOperation = "destination-in";
  const verticalMask = lightContext.createLinearGradient(
    0,
    ropeCenterY - lightHalfHeight,
    0,
    ropeCenterY + lightHalfHeight
  );
  verticalMask.addColorStop(0, "rgba(0,0,0,0)");
  verticalMask.addColorStop(.25, "rgba(0,0,0,.82)");
  verticalMask.addColorStop(.5, "rgba(0,0,0,1)");
  verticalMask.addColorStop(.75, "rgba(0,0,0,.82)");
  verticalMask.addColorStop(1, "rgba(0,0,0,0)");
  lightContext.fillStyle = verticalMask;
  lightContext.fillRect(0, 0, outputWidth, outputHeight);

  context.save();
  context.globalCompositeOperation = "screen";
  context.drawImage(lightLayer, 0, 0);
  context.restore();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("meter_panorama_failed")), "image/png");
  });
  updateDiameterRulers(diameterMm, outputHeight);
  return URL.createObjectURL(blob);
}

async function displayPhotoRender(imageUrl, requestId, result) {
  const source = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = imageUrl;
  });
  if (requestId !== state.texgenRequestId) return;
  const meterUrl = await buildMeterPanorama(source, result);
  if (requestId !== state.texgenRequestId) {
    URL.revokeObjectURL(meterUrl);
    return;
  }
  if (state.photoRenderObjectUrl) URL.revokeObjectURL(state.photoRenderObjectUrl);
  state.photoRenderObjectUrl = meterUrl;
  state.photoRenderUrl = meterUrl;
  ui.photoRender.src = meterUrl;
  ui.photoRender.classList.add("meter-render");
  ui.photoRender.hidden = false;
  ui.patternCanvas.hidden = true;
  ui.renderStage.classList.add("has-meter-render");
  ui.renderStage.classList.remove("is-rendering");
  ui.photoRenderState.hidden = true;
  const centerMeterView = () => requestAnimationFrame(() => {
    const visibleMm = ui.renderStage.clientWidth / meterPixelsPerMm;
    ui.renderStage.scrollLeft = (meterLightCenterMm - visibleMm / 2) * meterPixelsPerMm;
    updateMeterNavigation();
  });
  if (ui.photoRender.complete && ui.photoRender.naturalWidth) {
    centerMeterView();
  } else {
    ui.photoRender.addEventListener("load", centerMeterView, { once: true });
  }
}

async function requestPolyesterRender(result, requestId) {
  ui.patternCanvas.hidden = true;
  ui.photoRender.hidden = true;
  ui.photoRender.classList.remove("meter-render");
  ui.renderStage.classList.remove("has-meter-render");
  ui.renderStage.classList.add("is-rendering");
  state.photoRenderUrl = null;
  showPhotoRenderState("Polyester lif renderı hazırlanıyor...");
  ui.statusPill.textContent = "Lif renderı sırada";

  const response = await fetch("/api/polyester-render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(texgenPayload(result))
  });
  let job = await response.json();
  if (!response.ok || job.error) {
    throw new Error(job.error || "polyester_render_failed");
  }

  const deadline = Date.now() + 12 * 60 * 1000;
  const fibersPerEnd = Math.max(12, Math.round((result.denier / 2.25) / 12) * 12);
  const physicalFiberCount = fibersPerEnd * result.filamentCount * result.carrierCount;
  const fiberLabel = new Intl.NumberFormat("tr-TR").format(physicalFiberCount);
  while (job.status !== "complete") {
    if (requestId !== state.texgenRequestId) return;
    if (job.status === "failed") throw new Error(job.error || "polyester_render_failed");
    if (Date.now() > deadline) throw new Error("polyester_render_timeout");
    if (job.status === "queued") {
      const suffix = job.queuePosition > 1 ? ` (${job.queuePosition}. sıra)` : "";
      showPhotoRenderState(`Yüksek kaliteli render sırada${suffix}`);
      ui.statusPill.textContent = "Render sırasında";
    } else {
      showPhotoRenderState(`${fiberLabel} lif, ışık ve temas gölgeleri hesaplanıyor...`);
      ui.statusPill.textContent = "Polyester lifleri işleniyor";
    }
    await wait(2000);
    const statusResponse = await fetch(`/api/polyester-render/${job.id}`);
    job = await statusResponse.json();
    if (!statusResponse.ok || job.error && job.status !== "failed") {
      throw new Error(job.error || "polyester_render_status_failed");
    }
  }
  await displayPhotoRender(`${job.imageUrl}?v=${job.id}`, requestId, {
    ...result,
    repeatLengthMm: job.repeatLengthMm,
    orthoScaleMm: job.orthoScaleMm,
    renderAspect: job.renderAspect
  });
}

function renderRealtimeSurfaceRope(result, mesh) {
  clearRopeGroup();
  state.renderer.localClippingEnabled = false;
  state.surfaceTexture = makeBraidSurfaceTexture(result, 1536, 3072);
  const map = new THREE.CanvasTexture(state.surfaceTexture.color);
  const bumpMap = new THREE.CanvasTexture(state.surfaceTexture.height);
  const roughnessMap = new THREE.CanvasTexture(state.surfaceTexture.roughness);
  const normalMap = new THREE.CanvasTexture(state.surfaceTexture.normal);
  for (const texture of [map, bumpMap, roughnessMap, normalMap]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = texture === map ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = Math.min(12, state.renderer.capabilities.getMaxAnisotropy?.() || 1);
  }

  const radius = mesh.radius;
  const length = mesh.length;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 256, 192, true),
    new THREE.MeshPhysicalMaterial({
      map,
      bumpMap,
      bumpScale: clamp(mesh.yarnThickness * mesh.diameterScale * .42, .05, .15),
      normalMap,
      normalScale: new THREE.Vector2(.46, .46),
      displacementMap: bumpMap,
      displacementScale: clamp(mesh.yarnThickness * mesh.diameterScale * .28, .035, .105),
      displacementBias: -clamp(mesh.yarnThickness * mesh.diameterScale * .14, .0175, .0525),
      color: 0xffffff,
      roughnessMap,
      roughness: .54,
      metalness: 0,
      sheen: .9,
      sheenRoughness: .18,
      sheenColor: new THREE.Color(0xffffff),
      specularIntensity: .82,
      clearcoat: .1,
      clearcoatRoughness: .22,
      anisotropy: 1,
      anisotropyRotation: Math.PI * .25
    })
  );
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  state.ropeGroup.add(body);

  const base = new THREE.Color(mostCommonCarrierColor(result));
  const coreMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xc3c8c2,
    roughness: .86,
    metalness: 0
  });
  const rimMaterial = new THREE.MeshPhysicalMaterial({
    color: base.clone().multiplyScalar(.88),
    roughness: .6,
    sheen: .42,
    side: THREE.DoubleSide
  });
  for (const x of [-length / 2, length / 2]) {
    const core = new THREE.Mesh(new THREE.CircleGeometry(radius * .73, 96), coreMaterial);
    core.rotation.y = Math.PI / 2;
    core.position.x = x;
    state.ropeGroup.add(core);
    const rim = new THREE.Mesh(new THREE.RingGeometry(radius * .73, radius, 96, 2), rimMaterial);
    rim.rotation.y = Math.PI / 2;
    rim.position.x = x + (x < 0 ? -.003 : .003);
    state.ropeGroup.add(rim);
  }

  state.viewRotation = { x: -.08, y: -.16, z: 0 };
  state.autoRotation = 0;
  state.zoom = clamp(length * 1.35, 27, 42);
  state.camera.position.set(0, 0, state.zoom);
  state.camera.lookAt(0, 0, 0);
  state.ropeGroup.position.set(0, 0, 0);
}

function renderTexgenThree(mesh) {
  clearRopeGroup();
  state.renderer.localClippingEnabled = false;
  for (const yarn of mesh.yarns || []) {
    if (!yarn.mesh) continue;
    const color = yarn.color || defaultBase;
    const geometry = yarn.fiberPath?.length > 3
      ? geometryFromFiberShell(yarn, mesh)
      : geometryFromTexgenMesh(yarn.mesh);
    const material = getTexgenYarnMaterial(color, mesh);
    material.clippingPlanes = null;
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = true;
    object.receiveShadow = true;
    state.ropeGroup.add(object);
    if (yarn.fiberPath?.length > 3) {
      const glintFibers = new THREE.Mesh(
        geometryFromFiberGlints(yarn, mesh),
        getFiberGlintMaterial(color, mesh)
      );
      glintFibers.castShadow = true;
      glintFibers.receiveShadow = true;
      state.ropeGroup.add(glintFibers);
    }
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
      color: new THREE.Color(mostCommonCarrierColor(state.lastResult)).multiplyScalar(.94),
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
    state.zoom = clamp(mesh.length * 1.16, 24, 38);
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

function getFiberBundleCoreMaterial(color, mesh) {
  const filamentCount = Math.round(mesh.filamentCount || 20);
  const denier = Math.round(mesh.denier || 1000);
  const key = `${color.toLowerCase()}:fiber-bundle-core-v4:${filamentCount}:${denier}`;
  if (state.materialCache.has(key)) return state.materialCache.get(key);
  const fiberMaps = makePolyesterFiberMaps(filamentCount, denier);
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    map: fiberMaps.color,
    normalMap: fiberMaps.normal,
    normalScale: new THREE.Vector2(.12, .03),
    roughnessMap: fiberMaps.roughness,
    roughness: .72,
    metalness: 0,
    sheen: .28,
    sheenRoughness: .56,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), .24),
    specularIntensity: .28,
    anisotropy: .72,
    anisotropyRotation: Math.PI / 2,
    side: THREE.DoubleSide
  });
  material.userData.sharedBraidMaterial = true;
  state.materialCache.set(key, material);
  return material;
}

function geometryFromFiberShell(yarn, mesh) {
  const sourcePoints = yarn.fiberPath.map((point) => new THREE.Vector3(point.x, point.y, point.z));
  const centerCurve = new THREE.CatmullRomCurve3(sourcePoints, false, "centripetal", .35);
  const pathSegments = clamp(Math.round(mesh.visibleRows * 2.65), 76, 96);
  const ringSegments = clamp(Math.round((mesh.filamentCount || 20) * 2), 24, 72);
  const physicalRidgeCount = Math.max(8, Math.round(mesh.filamentCount || 20));
  const centers = centerCurve.getSpacedPoints(pathSegments);
  const bundleWidth = mesh.yarnWidth * mesh.diameterScale;
  const bundleDepth = Math.max(mesh.yarnThickness * mesh.diameterScale, bundleWidth * .045);
  const sectionPower = 2.45;
  const positions = [];
  const uvs = [];
  const indices = [];
  const tangent = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const lateral = new THREE.Vector3();
  const sectionUp = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  const phaseSeed = (yarn.carrierNo || 1) * .371 + (yarn.repeat || 0) * .113;
  const ringSize = ringSegments + 1;

  for (let step = 0; step <= pathSegments; step += 1) {
    const t = step / pathSegments;
    const center = centers[step];
    tangent.copy(centerCurve.getTangent(t)).normalize();
    radial.set(0, center.y, center.z).normalize();
    lateral.crossVectors(radial, tangent).normalize();
    sectionUp.crossVectors(tangent, lateral).normalize();
    if (sectionUp.dot(radial) < 0) sectionUp.negate();
    const metadata = sampleFiberPathMetadata(yarn.fiberPath, t);
    const localWidth = bundleWidth * (1 + metadata.crown * .04);
    const localDepth = bundleDepth * (1 - metadata.crown * .46);
    const phaseWander = Math.sin(step * .11 + phaseSeed) * .065
      + Math.sin(step * .031 + phaseSeed * 2.7) * .035;

    for (let side = 0; side <= ringSegments; side += 1) {
      const angle = side / ringSegments * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const lxNorm = Math.sign(cos) * Math.pow(Math.abs(cos), 2 / sectionPower);
      const uzNorm = Math.sign(sin) * Math.pow(Math.abs(sin), 2 / sectionPower);
      const lx = lxNorm * localWidth * .5;
      let uz = uzNorm * localDepth * .5;
      if (sin > 0) {
        const across = (lxNorm + 1) * .5;
        const ridge = Math.cos((across * physicalRidgeCount + phaseWander) * Math.PI * 2);
        const edgeFade = Math.max(0, 1 - Math.pow(Math.abs(lxNorm), 7));
        uz += localDepth * .006 * ridge * edgeFade * (1 - metadata.crown * .2);
      }
      vertex.copy(center)
        .addScaledVector(lateral, lx)
        .addScaledVector(sectionUp, uz);
      positions.push(vertex.x, vertex.y, vertex.z);
      uvs.push(side / ringSegments, t);
    }
  }

  for (let step = 0; step < pathSegments; step += 1) {
    const row = step * ringSize;
    const nextRow = row + ringSize;
    for (let side = 0; side < ringSegments; side += 1) {
      const a = row + side;
      const b = a + 1;
      const c = nextRow + side;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeTangents();
  geometry.computeBoundingSphere();
  return geometry;
}

function getFiberGlintMaterial(color, mesh) {
  const denier = Math.round(mesh.denier || 1000);
  const key = `${color.toLowerCase()}:polyester-glint-fibers-v3:${denier}`;
  if (state.materialCache.has(key)) return state.materialCache.get(key);
  const base = new THREE.Color(color);
  const material = new THREE.MeshPhysicalMaterial({
    color: base.clone().lerp(new THREE.Color(0xffffff), isLightColor(color) ? .24 : .16),
    vertexColors: true,
    roughness: .22,
    metalness: 0,
    ior: 1.57,
    sheen: .66,
    sheenRoughness: .12,
    sheenColor: base.clone().lerp(new THREE.Color(0xffffff), .7),
    specularIntensity: 1,
    specularColor: new THREE.Color(0xffffff),
    anisotropy: 1,
    anisotropyRotation: 0,
    side: THREE.FrontSide
  });
  material.userData.sharedBraidMaterial = true;
  state.materialCache.set(key, material);
  return material;
}

function geometryFromFiberGlints(yarn, mesh) {
  const sourcePoints = yarn.fiberPath.map((point) => new THREE.Vector3(point.x, point.y, point.z));
  const curve = new THREE.CatmullRomCurve3(sourcePoints, false, "centripetal", .35);
  const pathSegments = clamp(Math.round(mesh.visibleRows * 2.35), 70, 86);
  const centers = curve.getSpacedPoints(pathSegments);
  const filamentCount = clamp(Math.round(mesh.filamentCount || 20), 8, 40);
  const glintCount = filamentCount;
  const bundleWidth = mesh.yarnWidth * mesh.diameterScale;
  const bundleDepth = Math.max(mesh.yarnThickness * mesh.diameterScale, bundleWidth * .045);
  const denierScale = clamp(Math.sqrt(effectiveDenier(mesh.denier || 1000) / 1300), .24, .86);
  const fiberRadius = clamp(bundleWidth / filamentCount * .30 * denierScale, .0015, .012);
  const radialSegments = 5;
  const ringSize = radialSegments + 1;
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const tangent = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const lateral = new THREE.Vector3();
  const sectionUp = new THREE.Vector3();
  const center = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let fiber = 0; fiber < glintCount; fiber += 1) {
    const xNorm = (glintCount <= 1 ? 0 : fiber / (glintCount - 1) * 2 - 1) * .91;
    const phase = fiber * 2.3999632297 + (yarn.carrierNo || 1) * .41;
    const tone = .94 + fract(Math.sin((fiber + 1) * 43.17 + phase) * 43758.5453) * .1;
    const vertexBase = positions.length / 3;
    for (let step = 0; step <= pathSegments; step += 1) {
      const t = step / pathSegments;
      center.copy(centers[step]);
      tangent.copy(curve.getTangent(t)).normalize();
      radial.set(0, center.y, center.z).normalize();
      lateral.crossVectors(radial, tangent).normalize();
      sectionUp.crossVectors(tangent, lateral).normalize();
      if (sectionUp.dot(radial) < 0) sectionUp.negate();
      const metadata = sampleFiberPathMetadata(yarn.fiberPath, t);
      const localWidth = bundleWidth * (1 + metadata.crown * .04);
      const localDepth = bundleDepth * (1 - metadata.crown * .46);
      const surfaceHeight = localDepth * .5 * Math.pow(
        Math.max(0, 1 - Math.pow(Math.abs(xNorm), 2.45)),
        1 / 2.45
      );
      const wander = Math.sin(step * .17 + phase) * fiberRadius * .22
        + Math.sin(step * .047 + phase * 1.7) * fiberRadius * .14;
      center.addScaledVector(lateral, xNorm * localWidth * .5 + wander);
      center.addScaledVector(sectionUp, surfaceHeight - fiberRadius * .08);
      for (let side = 0; side <= radialSegments; side += 1) {
        const angle = side / radialSegments * Math.PI * 2;
        normal.copy(lateral).multiplyScalar(Math.cos(angle))
          .addScaledVector(sectionUp, Math.sin(angle))
          .normalize();
        vertex.copy(center).addScaledVector(normal, fiberRadius);
        positions.push(vertex.x, vertex.y, vertex.z);
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(t * 2.6 + fiber * .19, side / radialSegments);
        colors.push(tone, tone, tone);
      }
    }
    for (let step = 0; step < pathSegments; step += 1) {
      const row = vertexBase + step * ringSize;
      const nextRow = row + ringSize;
      for (let side = 0; side < radialSegments; side += 1) {
        const a = row + side;
        const b = a + 1;
        const c = nextRow + side;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeTangents();
  geometry.computeBoundingSphere();
  return geometry;
}

function geometryFromTexgenMeshInset(sourceMesh, mesh) {
  const geometry = geometryFromTexgenMesh(sourceMesh);
  const positions = geometry.getAttribute("position");
  const inset = Math.max(mesh.yarnThickness * mesh.diameterScale * .20, .012);
  const point = new THREE.Vector3();
  const radial = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    radial.set(0, point.y, point.z);
    if (radial.lengthSq() > 1e-8) {
      radial.normalize();
      point.addScaledVector(radial, -inset);
      positions.setXYZ(index, point.x, point.y, point.z);
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function getExplicitFiberMaterial(color, mesh) {
  const denier = Math.round(mesh.denier || state.lastResult?.denier || 1000);
  const key = `${color.toLowerCase()}:explicit-polyester-fibers-v4:${denier}`;
  if (state.materialCache.has(key)) return state.materialCache.get(key);
  const base = new THREE.Color(color);
  const fiberBase = base.clone().multiplyScalar(isLightColor(color) ? .91 : .82);
  const material = new THREE.MeshPhysicalMaterial({
    color: fiberBase,
    vertexColors: true,
    roughness: .3,
    metalness: 0,
    ior: 1.57,
    sheen: .44,
    sheenRoughness: .2,
    sheenColor: base.clone().lerp(new THREE.Color(0xffffff), .48),
    specularIntensity: 1,
    specularColor: new THREE.Color(0xffffff),
    anisotropy: 1,
    anisotropyRotation: 0,
    side: THREE.FrontSide
  });
  material.userData.sharedBraidMaterial = true;
  state.materialCache.set(key, material);
  return material;
}

function geometryFromFiberBundle(yarn, mesh) {
  const sourcePoints = yarn.fiberPath.map((point) => new THREE.Vector3(point.x, point.y, point.z));
  const centerCurve = new THREE.CatmullRomCurve3(sourcePoints, false, "centripetal", .35);
  const pathSegments = clamp(Math.round(mesh.visibleRows * 3.1), 78, 104);
  const centers = centerCurve.getSpacedPoints(pathSegments);
  const filamentCount = clamp(Math.round(mesh.filamentCount || 20), 8, 40);
  const bundleWidth = mesh.yarnWidth * mesh.diameterScale;
  const bundleDepth = Math.max(mesh.yarnThickness * mesh.diameterScale, bundleWidth * .045);
  const denierDiameter = clamp(Math.sqrt(effectiveDenier(mesh.denier || 1000) / 1300), .24, .86);
  const spacing = bundleWidth * .9 / Math.max(1, filamentCount - 1);
  const lateralRadius = clamp(spacing * .57, .009, .055);
  const verticalRadius = clamp(bundleDepth * .11 * denierDiameter, .006, .027);
  const offsets = packedFiberOffsets(filamentCount);
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const radialSegments = 6;
  const ringSize = radialSegments + 1;
  const radial = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const lateral = new THREE.Vector3();
  const sectionUp = new THREE.Vector3();
  const center = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let filament = 0; filament < filamentCount; filament += 1) {
    const xNorm = offsets[filament];
    const vertexBase = positions.length / 3;
    const phase = filament * 2.3999632297;
    const tone = .9 + fract(Math.sin((filament + 1) * 78.233) * 43758.5453) * .14;
    for (let step = 0; step <= pathSegments; step += 1) {
      center.copy(centers[step]);
      tangent.copy(centerCurve.getTangent(step / pathSegments)).normalize();
      radial.set(0, center.y, center.z).normalize();
      lateral.crossVectors(radial, tangent).normalize();
      sectionUp.crossVectors(tangent, lateral).normalize();
      if (sectionUp.dot(radial) < 0) sectionUp.negate();
      const metadata = sampleFiberPathMetadata(yarn.fiberPath, step / pathSegments);
      const localWidth = bundleWidth * (1 + metadata.crown * .1);
      const localDepth = bundleDepth * (1 - metadata.crown * .38);
      const surfaceHeight = localDepth * .5 * Math.pow(
        Math.max(0, 1 - Math.pow(Math.abs(xNorm), 2.45)),
        1 / 2.45
      );
      const lateralOffset = xNorm * localWidth * .5;
      const lateralWander = (
        Math.sin(step * .29 + phase) * .055
        + Math.sin(step * .073 + phase * 1.7) * .035
      ) * lateralRadius;
      const surfaceWander = Math.sin(step * .19 + phase * .83) * verticalRadius * .11;
      center.addScaledVector(lateral, lateralOffset + lateralWander);
      center.addScaledVector(sectionUp, surfaceHeight - verticalRadius * .54 + surfaceWander);

      for (let side = 0; side <= radialSegments; side += 1) {
        const angle = side / radialSegments * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        normal.copy(lateral).multiplyScalar(cos / lateralRadius)
          .addScaledVector(sectionUp, sin / verticalRadius)
          .normalize();
        vertex.copy(center)
          .addScaledVector(lateral, cos * lateralRadius)
          .addScaledVector(sectionUp, sin * verticalRadius);
        positions.push(vertex.x, vertex.y, vertex.z);
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(step / pathSegments * 2.35 + filament * .173, side / radialSegments);
        colors.push(tone, tone, tone);
      }
    }

    for (let step = 0; step < pathSegments; step += 1) {
      const row = vertexBase + step * ringSize;
      const nextRow = row + ringSize;
      for (let side = 0; side < radialSegments; side += 1) {
        const a = row + side;
        const b = a + 1;
        const c = nextRow + side;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeTangents();
  geometry.computeBoundingSphere();
  return geometry;
}

function packedFiberOffsets(count) {
  const offsets = [];
  for (let index = 0; index < count; index += 1) {
    const xNorm = (count <= 1 ? 0 : index / (count - 1) * 2 - 1) * .92;
    offsets.push(xNorm);
  }
  return offsets;
}

function sampleFiberPathMetadata(path, t) {
  const scaled = clamp(t, 0, 1) * Math.max(0, path.length - 1);
  const left = Math.floor(scaled);
  const right = Math.min(path.length - 1, left + 1);
  const mix = scaled - left;
  return {
    crown: THREE.MathUtils.lerp(path[left]?.crown || 0, path[right]?.crown || 0, mix)
  };
}

function getTexgenYarnMaterial(color, mesh) {
  const filamentCount = Math.round(mesh.filamentCount || state.lastResult?.filamentCount || 20);
  const denier = Math.round(mesh.denier || state.lastResult?.denier || 1000);
  const materialScale = Math.sqrt(effectiveDenier(denier) / 1300);
  const filamentDiameterScale = mesh.filamentDiameterScale
    ?? clamp(.5 * (effectiveDenier(denier) / 1000), .05, .5);
  const key = `${color.toLowerCase()}:texgen-polyester-silk-v12:${filamentCount}:${denier}`;
  if (state.materialCache.has(key)) return state.materialCache.get(key);
  const fiberMaps = makePolyesterFiberMaps(filamentCount, denier);
  const base = new THREE.Color(color);
  const diffuse = base.clone().multiplyScalar(isLightColor(color) ? .84 : .92);
  const material = new THREE.MeshPhysicalMaterial({
    color: diffuse,
    map: fiberMaps.color,
    bumpMap: fiberMaps.bump,
    bumpScale: clamp(.0025 * materialScale * filamentDiameterScale, .00035, .0015),
    normalMap: fiberMaps.normal,
    normalScale: new THREE.Vector2(.11, .018),
    roughnessMap: fiberMaps.roughness,
    roughness: .25,
    metalness: 0,
    ior: 1.57,
    sheen: .84,
    sheenRoughness: .1,
    sheenRoughnessMap: fiberMaps.roughness,
    sheenColor: base.clone().lerp(new THREE.Color(0xffffff), .76),
    specularIntensityMap: fiberMaps.specular,
    specularIntensity: 1,
    specularColor: new THREE.Color(0xffffff),
    anisotropy: 1,
    anisotropyRotation: Math.PI / 2,
    side: THREE.DoubleSide
  });
  material.userData.sharedBraidMaterial = true;
  state.materialCache.set(key, material);
  return material;
}

function makePolyesterFiberMaps(filamentCount, denier) {
  const mapKey = `filament-relief-v8:${filamentCount}:${denier}`;
  if (state.polyesterFiberMaps.has(mapKey)) return state.polyesterFiberMaps.get(mapKey);
  const width = 512;
  const height = 512;
  const source = state.polyesterReference;
  const denierScale = Math.sqrt(effectiveDenier(denier) / 1300);
  const filamentDiameterScale = clamp(.5 * (effectiveDenier(denier) / 1000), .05, .5);
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
  const sourceMean = source?.mean || 226;
  const sourceDeviation = Math.max(6, source?.deviation || 18);
  const visibleFilaments = clamp(Math.round(filamentCount), 8, 40);
  const sourceAcrossScale = clamp((filamentCount / 30) * Math.sqrt(1300 / effectiveDenier(denier)), .4, 4.2);

  const sampleSource = (along, across) => {
    if (!source) return sourceMean;
    const sourceX = fract(along) * source.width;
    const sourceY = fract(across) * source.height;
    const x0 = Math.floor(sourceX) % source.width;
    const y0 = Math.floor(sourceY) % source.height;
    const x1 = (x0 + 1) % source.width;
    const y1 = (y0 + 1) % source.height;
    const tx = sourceX - Math.floor(sourceX);
    const ty = sourceY - Math.floor(sourceY);
    const luminanceAt = (x, y) => polyesterLuminance(source.data, (y * source.width + x) * 4);
    const top = THREE.MathUtils.lerp(luminanceAt(x0, y0), luminanceAt(x1, y0), tx);
    const bottom = THREE.MathUtils.lerp(luminanceAt(x0, y1), luminanceAt(x1, y1), tx);
    return THREE.MathUtils.lerp(top, bottom, ty);
  };

  for (let y = 0; y < height; y += 1) {
    const along = y / height;
    for (let x = 0; x < width; x += 1) {
      const u = (x + .5) / width;
      const across = u * sourceAcrossScale;
      const sourceNoise = clamp(
        (sampleSource(along * 1.7 + .09, across * .74 + .31) - sourceMean) / sourceDeviation,
        -1,
        1
      );
      const longNoise = clamp(
        (sampleSource(along * 4.1 + .47, across * .23 + .17) - sourceMean) / sourceDeviation,
        -1,
        1
      );
      const wander = Math.sin(along * Math.PI * 2 * 2.15 + Math.floor(u * visibleFilaments) * 1.73)
        * .035;
      const phase = fract(u * visibleFilaments + wander + sourceNoise * .012);
      const centered = (phase - .5) * 2;
      const filamentCrown = Math.pow(Math.max(0, 1 - centered * centered), .62);
      const groove = Math.pow(Math.abs(centered), 7.5);
      const micro = Math.sin(along * Math.PI * 2 * (34 + visibleFilaments * .35)
        + u * Math.PI * 3.2) * .5 + .5;
      const relief = filamentCrown * .82 + sourceNoise * .11 + (micro - .5) * .055;
      const highlight = Math.pow(filamentCrown, 4.2) * (.72 + micro * .28);
      const colorValue = clampByte(218 + filamentCrown * 22 - groove * 5
        + sourceNoise * 4 + longNoise * 3);
      const bumpValue = clampByte(122 + relief * 22 * denierScale * filamentDiameterScale);
      const roughnessValue = clampByte(168 - highlight * 68 + Math.abs(longNoise) * 7
        + groove * 8);
      const specularValue = clampByte(92 + highlight * 151 + filamentCrown * 18
        - groove * 18);
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
      roughnessImage.data[offset + 3] = roughnessValue;
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
      const nz = 1.65;
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
    texture.repeat.set(1, 1);
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
  geometry.computeTangents();
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
    state.camera.position.z = clamp(state.texgenMesh.length * .9, 21, 32);
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
  const fit = result.productionFit;
  ui.productionFit.className = `production-fit is-${fit.status}`;
  ui.productionFit.innerHTML = `
    <div><span>Fiziksel doluluk</span><strong>${fit.label}</strong></div>
    <div class="production-fit-meter"><i style="width:${clamp(fit.fillPercent, 0, 140) / 1.4}%"></i><b></b></div>
    <p><strong>%${fit.fillPercent.toFixed(0)}</strong> doluluk · paket ${fit.carrierWidthMm.toFixed(2)} mm · gereken ${fit.requiredWidthMm.toFixed(2)} mm</p>
    <small>${productionFitAdvice(fit)}</small>
  `;
  ui.summary.innerHTML = [
    ["Kukla", `${result.carrierCount} adet`],
    ["Gruplar", `${result.carrierCount / 2} S + ${result.carrierCount / 2} Z`],
    ["Çap", `${result.diameterMm} mm`],
    ["Tel / denye", `${result.filamentCount} tel x ${result.denier}D`],
    ["Bir tur adımı", `${result.pitchMm.toFixed(1)} mm`],
    ["Görünen tur", `${result.turns.toFixed(2)} tur`],
    ["Yüzey çevresi", `${result.circumference.toFixed(1)} mm`],
    ["Kukla aralığı", `${result.laneWidth.toFixed(2)} mm`],
    ["İp paketi", `${fit.carrierWidthMm.toFixed(2)} x ${fit.carrierThicknessMm.toFixed(2)} mm`],
    ["Fiziksel doluluk", `%${fit.fillPercent.toFixed(0)} - ${fit.label}`],
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

function productionFitAdvice(fit) {
  if (fit.status === "ideal") return "Çap, açı ve ip paketi birbiriyle uyumlu.";
  const suggestions = [];
  if (fit.recommendedAngleDeg !== null) suggestions.push(`${fit.recommendedAngleDeg.toFixed(0)}° açı`);
  suggestions.push(`${fit.recommendedWidthPercent.toFixed(0)}% ip genişliği`);
  suggestions.push(`yaklaşık ${fit.recommendedFilamentCount.toFixed(0)} tel`);
  suggestions.push(`${Math.round(fit.recommendedDenier / 100) * 100}D`);
  suggestions.push(`${fit.recommendedDiameterMm.toFixed(1)} mm çap`);
  return `Yakın üretim dengesi: ${suggestions.join(" veya ")}.`;
}

function updateControlReadouts() {
  ui.diameterValue.textContent = `${ui.diameter.value} mm`;
  ui.angleValue.textContent = `${ui.braidAngle.value}°`;
  ui.strandWidthValue.textContent = `${ui.strandWidth.value}%`;
  ui.filamentCountValue.textContent = ui.filamentCount.value;
  ui.denierValue.textContent = `${ui.denier.value}D`;
  const fit = evaluateProductionFit({
    diameterMm: Number(ui.diameter.value),
    carrierCount: Number(ui.carrierCount.value),
    angleDeg: Number(ui.braidAngle.value),
    filamentCount: Number(ui.filamentCount.value),
    denier: Number(ui.denier.value),
    strandWidthScale: Number(ui.strandWidth.value) / 100
  });
  ui.productionFit.className = `production-fit is-${fit.status}`;
  ui.productionFit.innerHTML = `
    <div><span>Fiziksel doluluk</span><strong>${fit.label}</strong></div>
    <div class="production-fit-meter"><i style="width:${clamp(fit.fillPercent, 0, 140) / 1.4}%"></i><b></b></div>
    <p><strong>%${fit.fillPercent.toFixed(0)}</strong> doluluk · paket ${fit.carrierWidthMm.toFixed(2)} mm · gereken ${fit.requiredWidthMm.toFixed(2)} mm</p>
    <small>${productionFitAdvice(fit)}</small>
  `;
}

function refreshGenerateButton() {
  ui.generateBraid.disabled = state.generating;
  ui.generateBraid.textContent = state.generating ? "Yüksek kalite üretiliyor..." : "Üret";
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
  state.renderNonce = `${Date.now().toString(36)}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  state.lastResult = result;
  state.simulationDirty = false;
  updateControlReadouts();
  refreshGenerateButton();
  savePreferences();
  renderSummary(result);
  requestProductionRender(result);
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
  ui.modalImage.src = state.photoRenderUrl || ui.patternCanvas.toDataURL("image/png");
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
ui.downloadPng.addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = state.photoRenderUrl || ui.patternCanvas.toDataURL("image/png");
  a.download = `braidstudio-${ui.carrierCount.value}-kukla.png`;
  a.click();
});
ui.meterPosition.addEventListener("input", () => {
  updateMeterNavigation(Number(ui.meterPosition.value));
});
ui.renderStage.addEventListener("scroll", () => updateMeterNavigation(), { passive: true });
window.addEventListener("resize", () => updateMeterNavigation());
ui.patternCanvas.addEventListener("click", openImageModal);
ui.photoRender.addEventListener("click", openImageModal);
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
