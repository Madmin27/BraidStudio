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
  spin: false,
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
  geometryRequestId: 0,
  geometryMesh: null,
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
      if (Number(value.filamentCount) === 20) value.filamentCount = 25;
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

function mostCommonCarrierColor(result) {
  const counts = new Map();
  for (const carrier of result.carriers) {
    counts.set(carrier.color, (counts.get(carrier.color) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || defaultBase;
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
  state.renderer.toneMappingExposure = 1.0;
  ui.threeMount.appendChild(state.renderer.domElement);

  state.scene.add(new THREE.HemisphereLight(0xffffff, 0x68716c, .55));
  const key = new THREE.DirectionalLight(0xfff8ef, 1.35);
  key.position.set(4.5, 7, 6);
  key.castShadow = true;
  key.shadow.bias = -0.0001;
  key.shadow.normalBias = 0.025;
  state.scene.add(key);
  const fill = new THREE.DirectionalLight(0xddeaff, .38);
  fill.position.set(-5, 1.5, 4);
  state.scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, .68);
  rim.position.set(-2, 5, -6);
  state.scene.add(rim);
  const polyesterStrip = new THREE.RectAreaLight(
    0xfffbf4,
    polyesterProofVariant() === "current"
      ? 0
      : (polyesterProofVariant() === "textile" ? 3.2 : 5.5),
    10,
    1.2
  );
  polyesterStrip.position.set(0, 4.8, 5.4);
  polyesterStrip.lookAt(0, 0, 0);
  state.scene.add(polyesterStrip);

  state.ropeGroup = new THREE.Group();
  state.scene.add(state.ropeGroup);
  installThreeInteractions();
  resizeThree();
  window.addEventListener("resize", resizeThree);
  animate();
}

function clearRopeGroup() {
  while (state.ropeGroup.children.length) {
    const child = state.ropeGroup.children.pop();
    disposeObject(child);
  }
}

function polyesterProofVariant() {
  const requested = new URLSearchParams(window.location.search).get("polyesterProof");
  return requested === "current" || requested === "ribbon" || requested === "strong" || requested === "geometry" || requested === "textile"
    ? requested
    : "textile";
}

function geometryMode() {
  return new URLSearchParams(window.location.search).get("geometryMode") === "crossing"
    ? "crossing"
    : "rope";
}

function geometryPayload(result) {
  return {
    mode: geometryMode(),
    visibleRows: result.visibleRows,
    carrierCount: result.carrierCount,
    diameterMm: result.diameterMm,
    braidAngle: result.angleDeg,
    strandWidthScale: result.strandWidthScale,
    filamentCount: result.filamentCount,
    denier: result.denier,
    ribbonShader: polyesterProofVariant() !== "current",
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

function drawGeometryWaiting(text = "Geometri hesaplanıyor") {
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

async function requestGeometryMesh(result) {
  const requestId = ++state.geometryRequestId;
  state.generating = true;
  refreshGenerateButton();
  drawGeometryWaiting();
  clearRopeGroup();
  ui.statusPill.textContent = "Geometri hesaplanıyor";

  try {
    const response = await fetch("/api/braid-geometry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(geometryPayload(result))
    });
    const mesh = await response.json();
    if (requestId !== state.geometryRequestId) return;
    if (!response.ok || mesh.error) {
      throw new Error(mesh.error || "geometry_failed");
    }
    state.geometryMesh = mesh;
    renderGeometryThree(mesh);
    renderCanvasFromThree();
    ui.statusPill.textContent = state.simulationDirty ? "Değişiklikler hazır" : "Geometri hazır";
  } catch (error) {
    if (requestId !== state.geometryRequestId) return;
    drawGeometryWaiting("Geometri hatası");
    ui.statusPill.textContent = "Geometri hatası";
    console.error(error);
  } finally {
    if (requestId === state.geometryRequestId) {
      state.generating = false;
      refreshGenerateButton();
    }
  }
}

function renderGeometryThree(mesh) {
  clearRopeGroup();
  state.renderer.localClippingEnabled = false;
  const proofVariant = polyesterProofVariant();
  for (const yarn of mesh.yarns || []) {
    const geometry = geometryFromCarrierMesh(yarn.mesh);
    const material = getCarrierMaterial(yarn.color || defaultBase, mesh);
    material.clippingPlanes = null;
    const object = new THREE.Mesh(geometry, material);
    // In ribbon proof mode the carrier depth and curved profile already show
    // the over-under order. Hard self shadows produce the vertical black seam
    // seen at contact edges, so reserve those shadows for the legacy renderer.
    object.castShadow = proofVariant === "current";
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

    const sheathColor = new THREE.Color(mostCommonCarrierColor(state.lastResult)).multiplyScalar(.98);
    const sheathMaterial = proofVariant === "current"
      ? new THREE.MeshStandardMaterial({
          color: sheathColor,
          roughness: .92,
          metalness: 0,
          side: THREE.DoubleSide
        })
      : new THREE.MeshBasicMaterial({
          color: sheathColor,
          side: THREE.DoubleSide
        });
    const sheathRadius = proofVariant === "current"
      ? mesh.radius * .90
      : Math.max(mesh.radius * .78, mesh.radius - mesh.yarnThickness * .58);
    const sheath = new THREE.Mesh(
      new THREE.CylinderGeometry(sheathRadius, sheathRadius, mesh.length, 96, 1, true),
      sheathMaterial
    );
    sheath.rotation.z = Math.PI / 2;
    sheath.receiveShadow = proofVariant === "current";
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

    state.viewRotation = { x: 0, y: 0, z: 0 };
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

function getCarrierMaterial(color, mesh) {
  const filamentCount = Math.round(mesh.filamentCount || state.lastResult?.filamentCount || 25);
  const denier = Math.round(mesh.denier || state.lastResult?.denier || 1000);
  const materialScale = Math.sqrt(denier / 1000);
  const filamentDiameterScale = mesh.filamentDiameterScale
    ?? clamp(Math.sqrt(denier / 1000), .45, 1.75);
  const proofVariant = polyesterProofVariant();
  const legacyMaterial = proofVariant === "current";
  const key = `${color.toLowerCase()}:carrier-polyester:${proofVariant}:${filamentCount}:${denier}`;
  if (state.materialCache.has(key)) return state.materialCache.get(key);
  if (proofVariant === "geometry") {
    const geometryMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: .08,
      roughness: .82,
      metalness: 0,
      side: THREE.DoubleSide
    });
    geometryMaterial.userData.sharedBraidMaterial = true;
    state.materialCache.set(key, geometryMaterial);
    return geometryMaterial;
  }
  const fiberMaps = makePolyesterFiberMaps(filamentCount, denier, proofVariant);
  const strongSheen = proofVariant === "strong";
  const textileSurface = proofVariant === "textile";
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: legacyMaterial ? 0 : (textileSurface ? .012 : .06),
    map: fiberMaps.color,
    bumpMap: fiberMaps.bump,
    bumpScale: legacyMaterial
      ? clamp(.018 * materialScale * filamentDiameterScale, .006, .034)
      : clamp((textileSurface ? .006 : .015) * materialScale * filamentDiameterScale, .003, textileSurface ? .011 : .026),
    normalMap: fiberMaps.normal,
    normalScale: legacyMaterial
      ? new THREE.Vector2(.88, .16)
      : new THREE.Vector2(
          textileSurface ? .025 : .12,
          textileSurface ? .24 : (strongSheen ? .94 : .78)
        ),
    roughnessMap: fiberMaps.roughness,
    roughness: legacyMaterial ? .78 : (textileSurface ? .24 : (strongSheen ? .25 : .36)),
    metalness: 0,
    sheen: legacyMaterial ? .96 : (textileSurface ? .10 : (strongSheen ? 1 : .84)),
    sheenRoughness: legacyMaterial ? .4 : (textileSurface ? .62 : (strongSheen ? .24 : .34)),
    sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), legacyMaterial ? .72 : .82),
    specularIntensityMap: fiberMaps.specular,
    specularIntensity: legacyMaterial ? .98 : (textileSurface ? .90 : (strongSheen ? .78 : .58)),
    specularColor: new THREE.Color(0xffffff),
    anisotropy: legacyMaterial ? .96 : (textileSurface ? .98 : (strongSheen ? .97 : .92)),
    anisotropyMap: legacyMaterial ? null : fiberMaps.anisotropy,
    anisotropyRotation: legacyMaterial ? Math.PI / 2 : 0,
    side: THREE.DoubleSide
  });
  material.userData.sharedBraidMaterial = true;
  state.materialCache.set(key, material);
  return material;
}

function makePolyesterFiberMaps(filamentCount, denier, proofVariant = "ribbon") {
  const mapKey = `bundle-v50:${proofVariant}:${filamentCount}:${denier}`;
  if (state.polyesterFiberMaps.has(mapKey)) return state.polyesterFiberMaps.get(mapKey);
  const legacyMaterial = proofVariant === "current";
  const textileSurface = proofVariant === "textile";
  const width = legacyMaterial ? 256 : 512;
  const height = legacyMaterial ? 512 : 256;
  const strandCount = clamp(Math.round(filamentCount), 8, 40);
  const strandSpacing = (legacyMaterial ? width : height) / strandCount;
  const denierScale = Math.sqrt(denier / 1000);
  const filamentDiameterScale = clamp(denierScale, .45, 1.75);
  const colorCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  const normalCanvas = document.createElement("canvas");
  const roughnessCanvas = document.createElement("canvas");
  const specularCanvas = document.createElement("canvas");
  const anisotropyCanvas = document.createElement("canvas");
  colorCanvas.width = bumpCanvas.width = width;
  colorCanvas.height = bumpCanvas.height = height;
  normalCanvas.width = roughnessCanvas.width = specularCanvas.width = width;
  normalCanvas.height = roughnessCanvas.height = specularCanvas.height = height;
  anisotropyCanvas.width = anisotropyCanvas.height = 8;
  const colorCtx = colorCanvas.getContext("2d");
  const bumpCtx = bumpCanvas.getContext("2d");
  const roughnessCtx = roughnessCanvas.getContext("2d");
  const specularCtx = specularCanvas.getContext("2d");
  const colorImage = colorCtx.createImageData(width, height);
  const bumpImage = bumpCtx.createImageData(width, height);
  const roughnessImage = roughnessCtx.createImageData(width, height);
  const specularImage = specularCtx.createImageData(width, height);
  const bumpAmplitude = legacyMaterial
    ? clamp(112 * denierScale * filamentDiameterScale, 36, 172)
    : clamp((textileSurface ? 54 : 108) * denierScale, 24, textileSurface ? 78 : 148);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const longitudinalGlint = legacyMaterial
        ? Math.sin(y * .071) * 1.7 + Math.sin(y * .019) * 1.2
        : Math.sin(x * .043) * 1.4 + Math.sin(x * .013) * .9;
      const wave = legacyMaterial
        ? Math.sin(y * .028 + x * .004) * strandSpacing * .075
        : Math.sin(x * .022 + y * .006) * strandSpacing * .055;
      const wrapped = legacyMaterial ? mod(x + wave, width) : mod(y + wave, height);
      const strandPosition = wrapped / strandSpacing;
      const strandIndex = Math.floor(strandPosition);
      const local = strandPosition - strandIndex;
      const ridge = Math.pow(Math.sin(Math.PI * local), legacyMaterial ? .72 : .82);
      const fiberCore = Math.pow(
        Math.sin(Math.PI * local),
        legacyMaterial ? 5.5 : (textileSurface ? 2.15 : 4.2)
      );
      const capillaryLine = textileSurface
        ? Math.pow(Math.sin(Math.PI * local), 16)
        : 0;
      const capillaryGroove = textileSurface
        ? Math.pow(Math.abs(Math.cos(Math.PI * local)), 18)
        : 0;
      const contactShadow = Math.pow(1 - ridge, 3);
      const filamentTone = (fract(Math.sin((strandIndex + 1) * 91.713) * 43758.5453) - .5) * 7;
      const silkGlint = legacyMaterial
        ? fiberCore * (25 + longitudinalGlint * 1.8)
        : fiberCore * (6 + longitudinalGlint * 1.1);
      const satinBand = textileSurface
        ? .5 + .34 * Math.sin(x * .031 + strandIndex * .47)
          + .16 * Math.sin(x * .009 - strandIndex * .23)
        : 0;
      const colorValue = legacyMaterial
        ? clampByte(198 + ridge * 31 - contactShadow * 22 + filamentTone + silkGlint)
        : textileSurface
          ? clampByte(
              235 + ridge * 6 - contactShadow * 3 + filamentTone * .16
              + capillaryLine * 8 - capillaryGroove * 7 + satinBand * fiberCore * 20
            )
          : clampByte(203 + ridge * 45 - contactShadow * 18 + filamentTone * .42 + silkGlint);
      const bumpValue = clampByte(
        (textileSurface ? 116 : 62) + ridge * bumpAmplitude
        + capillaryLine * (textileSurface ? 4 : 0)
        - capillaryGroove * (textileSurface ? 14 : 0)
      );
      const roughnessValue = legacyMaterial
        ? clampByte(236 - fiberCore * 164 - ridge * 18)
        : textileSurface
          ? clampByte(214 - fiberCore * (28 + satinBand * 20) - ridge * 6)
          : clampByte(202 - fiberCore * 72 - ridge * 18);
      const specularValue = legacyMaterial
        ? clampByte(54 + fiberCore * 198 + ridge * 20)
        : textileSurface
          ? clampByte(92 + fiberCore * (78 + satinBand * 48) + capillaryLine * 18)
          : clampByte(84 + fiberCore * 132 + ridge * 18);
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

  const anisotropyCtx = anisotropyCanvas.getContext("2d");
  // R is anisotropy strength; G/B encode the tangent-space direction.
  // The yarn fibers follow mesh U/tangent, so use +X rather than bitangent.
  anisotropyCtx.fillStyle = "rgb(255,255,128)";
  anisotropyCtx.fillRect(0, 0, anisotropyCanvas.width, anisotropyCanvas.height);

  const colorTexture = new THREE.CanvasTexture(colorCanvas);
  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  const normalTexture = new THREE.CanvasTexture(normalCanvas);
  const roughnessTexture = new THREE.CanvasTexture(roughnessCanvas);
  const specularTexture = new THREE.CanvasTexture(specularCanvas);
  const anisotropyTexture = new THREE.CanvasTexture(anisotropyCanvas);
  for (const texture of [colorTexture, bumpTexture, normalTexture, roughnessTexture, specularTexture, anisotropyTexture]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(legacyMaterial ? 2 : 3.5, legacyMaterial ? 1.35 : 1);
    texture.anisotropy = Math.min(12, state.renderer.capabilities.getMaxAnisotropy?.() || 1);
  }
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  const maps = {
    color: colorTexture,
    bump: bumpTexture,
    normal: normalTexture,
    roughness: roughnessTexture,
    specular: specularTexture,
    anisotropy: anisotropyTexture
  };
  state.polyesterFiberMaps.set(mapKey, maps);
  return maps;
}

function geometryFromCarrierMesh(mesh) {
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
  if (state.geometryMesh?.cylindricalWeave) {
    state.camera.position.z = clamp(state.geometryMesh.length * 1.05, 24, 36);
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
  requestGeometryMesh(result);
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
    const maxZoom = state.geometryMesh?.flatWeave || state.geometryMesh?.cylindricalWeave ? 55 : 13;
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
  if (state.geometryMesh?.cylindricalWeave) {
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

function colorName(hex) {
  return colorNames[hex.toLowerCase()] || hex.toUpperCase();
}


function mod(value, max) {
  return ((value % max) + max) % max;
}

function fract(value) {
  return value - Math.floor(value);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
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
