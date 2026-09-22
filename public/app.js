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
  materialProfile: $("#materialProfile"),
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
  threeRuler: $("#threeRuler"),
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
  materialLights: null,
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
  setSavedControl(ui.materialProfile, preferences.materialProfile);
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
      materialProfile: ui.materialProfile.value,
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

function calculateBraid() {
  const carrierCount = Number(ui.carrierCount.value);
  const diameterMm = Number(ui.diameter.value);
  const angleDeg = Number(ui.braidAngle.value);
  const strandWidthScale = Number(ui.strandWidth.value) / 100;
  const filamentCount = Number(ui.filamentCount.value);
  const denier = Number(ui.denier.value);
  const visibleRows = 30;

  return {
    carrierCount,
    diameterMm,
    angleDeg,
    strandWidthScale,
    filamentCount,
    denier,
    visibleRows,
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
  state.renderer.toneMappingExposure = 1.04;
  ui.threeMount.appendChild(state.renderer.domElement);

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0xaeb4b0, .92);
  state.scene.add(hemisphere);
  const key = new THREE.DirectionalLight(0xfffaf4, .78);
  key.position.set(4.5, 7, 6);
  key.castShadow = true;
  key.shadow.bias = -0.0001;
  key.shadow.normalBias = 0.025;
  state.scene.add(key);
  const fill = new THREE.DirectionalLight(0xe7efff, .46);
  fill.position.set(-5, 1.5, 4);
  state.scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, .24);
  rim.position.set(-2, 5, -6);
  state.scene.add(rim);
  const satinSoftbox = new THREE.RectAreaLight(0xfffdf8, .62, 18, 8);
  satinSoftbox.position.set(0, 7, 8);
  satinSoftbox.lookAt(0, 0, 0);
  state.scene.add(satinSoftbox);
  state.materialLights = { hemisphere, key, fill, rim, softbox: satinSoftbox };
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

function applyMaterialLighting(profile) {
  const lighting = profile?.lighting;
  if (!lighting || !state.materialLights) return;
  const keyPosition = Array.isArray(lighting.keyPosition)
    ? lighting.keyPosition
    : [4.5, 7, 6];
  const softboxPosition = Array.isArray(lighting.softboxPosition)
    ? lighting.softboxPosition
    : [0, 7, 8];
  state.renderer.toneMappingExposure = Number(lighting.exposure);
  state.materialLights.hemisphere.intensity = Number(lighting.hemisphere);
  state.materialLights.key.intensity = Number(lighting.key);
  state.materialLights.key.position.set(...keyPosition.map(Number));
  state.materialLights.fill.intensity = Number(lighting.fill);
  state.materialLights.rim.intensity = Number(lighting.rim);
  state.materialLights.softbox.intensity = Number(lighting.softbox);
  state.materialLights.softbox.width = Number(lighting.softboxWidth ?? 18);
  state.materialLights.softbox.height = Number(lighting.softboxHeight ?? 8);
  state.materialLights.softbox.position.set(...softboxPosition.map(Number));
  state.materialLights.softbox.lookAt(0, 0, 0);
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
    materialProfileId: ui.materialProfile.value,
    crossingMode: ui.crossingMode.value,
    flip: state.flip,
    baseColor: mostCommonCarrierColor(result),
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
    renderSummary(state.lastResult, mesh);
    ui.statusPill.textContent = mesh.fitStatus === "overfilled"
      ? "Yoğunluk bu çapa sığmıyor"
      : state.simulationDirty ? "Değişiklikler hazır" : "Geometri hazır";
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
  applyMaterialLighting(mesh.materialProfile);
  state.renderer.localClippingEnabled = false;
  const runtimeMaterials = [];
  for (const yarn of mesh.yarns || []) {
    const geometry = geometryFromCarrierMesh(yarn.mesh, mesh.materialProfile);
    const material = getCarrierMaterial(yarn.color || defaultBase, mesh);
    material.clippingPlanes = null;
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = false;
    object.receiveShadow = true;
    state.ropeGroup.add(object);
    runtimeMaterials.push({
      carrierNo: yarn.carrierNo,
      color: yarn.color || defaultBase,
      materialUuid: material.uuid,
      textureUuid: material.map?.uuid || null,
      ...material.userData.fiberModel
    });
  }
  window.__BRAIDSTUDIO_RUNTIME_AUDIT__ = {
    mode: mesh.mode,
    materialProfileId: mesh.materialProfile?.materialProfileId,
    carrierCount: runtimeMaterials.length,
    selectedDiameterMm: mesh.diameterMm,
    meshOuterDiameterMm: mesh.meshOuterDiameterMm,
    diameterErrorMm: mesh.diameterErrorMm,
    materials: runtimeMaterials
  };

  if (mesh.mode === "crossing") {
    state.viewRotation = { x: 0, y: 0, z: 0 };
    state.zoom = 24;
    state.camera.position.set(0, 0, state.zoom);
    state.camera.lookAt(0, 0, 0);
    state.ropeGroup.position.set(0, 0, 0);
    return;
  }

  if (mesh.mode === "rope") {
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
    const sheathMaterial = new THREE.MeshBasicMaterial({
      color: sheathColor,
      side: THREE.DoubleSide
    });
    const sheathRadius = Math.max(
      mesh.radius * .72,
      (mesh.surfaceBaseRadius || mesh.radius) - mesh.yarnThickness * .5
    );
    const sheath = new THREE.Mesh(
      new THREE.CylinderGeometry(sheathRadius, sheathRadius, mesh.length, 96, 1, true),
      sheathMaterial
    );
    sheath.rotation.z = Math.PI / 2;
    sheath.receiveShadow = false;
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
    state.zoom = clamp(mesh.length * 2.15, 52, 80);
    state.camera.position.set(0, 0, state.zoom);
    state.camera.lookAt(0, 0, 0);
    state.ropeGroup.position.set(0, 0, 0);
    return;
  }

  throw new Error(`unsupported_geometry_mode:${mesh.mode}`);
}

function getCarrierMaterial(color, mesh) {
  const profile = mesh.materialProfile || {};
  const profileId = profile.materialProfileId || "polyester_satin";
  const optics = profile.optics || {};
  const lightCarrier = optics.lightCarrier || {};
  const endsPerCarrier = Math.round(mesh.endsPerCarrier || mesh.filamentCount || 25);
  const denierPerEnd = Math.round(mesh.effectiveDenierPerEnd || mesh.effectiveDenier || mesh.denier || 1000);
  const reliefScale = clamp(Math.sqrt(denierPerEnd / 700), .55, 1.8);
  const key = `${color.toLowerCase()}:${profileId}:${endsPerCarrier}:${denierPerEnd}`;
  if (state.materialCache.has(key)) return state.materialCache.get(key);
  const normalScale = Array.isArray(optics.normalScale) ? optics.normalScale : [.012, .12];
  const carrierColor = new THREE.Color(color);
  const carrierLuminance = carrierColor.r * .2126 + carrierColor.g * .7152 + carrierColor.b * .0722;
  const lightStart = Number(lightCarrier.luminanceStart ?? 1);
  const lightFull = Math.max(lightStart + .001, Number(lightCarrier.luminanceFull ?? 1.001));
  const lightAmount = clamp((carrierLuminance - lightStart) / (lightFull - lightStart), 0, 1);
  const lightMix = lightAmount * lightAmount * (3 - 2 * lightAmount);
  const fiberMaps = makePolyesterFiberMaps(endsPerCarrier, denierPerEnd, profile, lightMix);
  const resolveOptic = (name, fallback) => THREE.MathUtils.lerp(
    Number(optics[name] ?? fallback),
    Number(lightCarrier[name] ?? optics[name] ?? fallback),
    lightMix
  );
  const bumpScaleMultiplier = THREE.MathUtils.lerp(
    1,
    Number(lightCarrier.bumpScaleMultiplier ?? 1),
    lightMix
  );
  const normalScaleMultiplier = THREE.MathUtils.lerp(
    1,
    Number(lightCarrier.normalScaleMultiplier ?? 1),
    lightMix
  );
  const resolvedDiffuseMultiplier = THREE.MathUtils.lerp(
    1,
    Number(lightCarrier.diffuseMultiplier ?? 1),
    lightMix
  );
  const resolvedBumpScale = clamp(
    Number(optics.bumpScale ?? .003) * reliefScale * bumpScaleMultiplier,
    Number(optics.bumpMin ?? .0015),
    Number(optics.bumpMax ?? .005)
  );
  const resolvedNormalScale = [
    Number(normalScale[0]) * reliefScale * normalScaleMultiplier,
    Number(normalScale[1]) * reliefScale * normalScaleMultiplier
  ];
  const resolvedRoughness = resolveOptic("roughness", .50);
  const resolvedSheen = resolveOptic("sheen", .28);
  const resolvedSheenRoughness = resolveOptic("sheenRoughness", .76);
  const resolvedSpecularIntensity = resolveOptic("specularIntensity", .52);
  const resolvedAnisotropy = resolveOptic("anisotropy", .84);
  const materialColor = carrierColor.clone().multiplyScalar(resolvedDiffuseMultiplier);
  const material = new THREE.MeshPhysicalMaterial({
    color: materialColor,
    map: fiberMaps.color,
    bumpMap: fiberMaps.bump,
    bumpScale: resolvedBumpScale,
    normalMap: fiberMaps.normal,
    normalScale: new THREE.Vector2(...resolvedNormalScale),
    roughnessMap: fiberMaps.roughness,
    roughness: resolvedRoughness,
    metalness: 0,
    ior: Number(optics.ior ?? 1.5),
    sheen: resolvedSheen,
    sheenRoughness: resolvedSheenRoughness,
    sheenColor: new THREE.Color(color).lerp(
      new THREE.Color(0xffffff),
      resolveOptic("sheenWhiteMix", .34)
    ),
    sheenRoughnessMap: profileId === "polyester_satin" ? fiberMaps.roughness : null,
    specularIntensityMap: fiberMaps.specular,
    specularIntensity: resolvedSpecularIntensity,
    specularColor: new THREE.Color(0xffffff),
    anisotropy: resolvedAnisotropy,
    anisotropyMap: fiberMaps.anisotropy,
    anisotropyRotation: 0,
    side: THREE.DoubleSide
  });
  material.userData.sharedBraidMaterial = true;
  material.userData.fiberModel = {
    endsPerCarrier,
    requestedDenierPerEnd: Math.round(mesh.denierPerEnd || mesh.denier || denierPerEnd),
    effectiveDenierPerEnd: denierPerEnd,
    denierPerEnd,
    physicalYarnBands: fiberMaps.audit.physicalYarnBands,
    microFibersPerEnd: fiberMaps.audit.microFibersPerEnd,
    aggregateFiberClusters: fiberMaps.audit.aggregateFiberClusters,
    carrierLuminance,
    lightCarrierOpticsMix: lightMix,
    resolvedRoughness,
    resolvedSheen,
    resolvedSheenRoughness,
    resolvedSpecularIntensity,
    resolvedAnisotropy,
    resolvedDiffuseMultiplier,
    resolvedBumpScale,
    resolvedNormalScale,
    lightTextureClass: fiberMaps.audit.lightTextureClass,
    specularMapColorSpace: fiberMaps.audit.specularMapColorSpace,
    textureMapKey: fiberMaps.audit.mapKey,
    textureRepeatU: fiberMaps.audit.repeatU,
    textureMinFilter: fiberMaps.audit.minFilter,
    textureMipmaps: fiberMaps.audit.mipmaps,
    worldSpaceU: profile.texture?.worldSpaceU === true
  };
  state.materialCache.set(key, material);
  return material;
}

function makePolyesterFiberMaps(endsPerCarrier, denierPerEnd, profile = {}, lightMix = 0) {
  const textureProfile = profile.texture || {};
  const lightTextureProfile = textureProfile.lightCarrier || {};
  const profileId = profile.materialProfileId || "polyester_satin";
  const isPolyesterSatin = profileId === "polyester_satin";
  const lightTextureClass = isPolyesterSatin && lightMix >= .5 ? "light" : "base";
  const fiberValue = (name, fallback) => Number(
    (lightTextureClass === "light" ? lightTextureProfile[name] : undefined)
      ?? textureProfile[name]
      ?? fallback
  );
  const mapKey = `${profileId}:${endsPerCarrier}:${denierPerEnd}:${lightTextureClass}`;
  if (state.polyesterFiberMaps.has(mapKey)) return state.polyesterFiberMaps.get(mapKey);
  const width = 512;
  const height = isPolyesterSatin ? 512 : 256;
  const strandCount = clamp(Math.round(endsPerCarrier), 8, 40);
  const strandSpacing = height / strandCount;
  const denierScale = Math.sqrt(denierPerEnd / 700);
  const referenceMicroFibers = Number(textureProfile.referenceMicroFibersPerEnd ?? 6);
  const microFibersPerYarn = clamp(
    Math.round(referenceMicroFibers * Math.sqrt(denierPerEnd / 700)),
    3,
    12
  );
  const aggregateFiberClusters = clamp(Math.round(Math.sqrt(strandCount) * 1.6), 5, 10);
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
  anisotropyCanvas.width = isPolyesterSatin ? width : 8;
  anisotropyCanvas.height = isPolyesterSatin ? height : 8;
  const colorCtx = colorCanvas.getContext("2d");
  const bumpCtx = bumpCanvas.getContext("2d");
  const roughnessCtx = roughnessCanvas.getContext("2d");
  const specularCtx = specularCanvas.getContext("2d");
  const anisotropyCtx = anisotropyCanvas.getContext("2d");
  const colorImage = colorCtx.createImageData(width, height);
  const bumpImage = bumpCtx.createImageData(width, height);
  const roughnessImage = roughnessCtx.createImageData(width, height);
  const specularImage = specularCtx.createImageData(width, height);
  const anisotropyImage = isPolyesterSatin
    ? anisotropyCtx.createImageData(width, height)
    : null;
  const bumpAmplitude = clamp(54 * denierScale, 24, 78);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pathPhase = Math.PI * 2 * x / width;
      const wave = isPolyesterSatin
        ? (
          Math.sin(pathPhase * 3 + y * .004)
          + .45 * Math.sin(pathPhase * 7 - y * .002)
        ) * strandSpacing * .018
        : Math.sin(x * .022 + y * .006) * strandSpacing * .055;
      const wrapped = mod(y + wave, height);
      const strandPosition = wrapped / strandSpacing;
      const strandIndex = Math.floor(strandPosition);
      const local = strandPosition - strandIndex;
      let colorValue;
      let bumpValue;
      let roughnessValue;
      let specularValue;
      let anisotropyDirection = 0;
      let anisotropyStrength = .9;

      if (isPolyesterSatin) {
        const macroCrown = Math.pow(Math.sin(Math.PI * local), 1.25);
        const macroGroove = Math.pow(Math.abs(Math.cos(Math.PI * local)), 12);
        const microPosition = local * microFibersPerYarn
          + fract(Math.sin((strandIndex + 1) * 43.17) * 1973.31) * .72
          + .035 * Math.sin(pathPhase * 3 + strandIndex * .61);
        const microIndex = strandIndex * microFibersPerYarn + Math.floor(microPosition);
        const filamentVariation = fract(Math.sin((microIndex + 1) * 78.233) * 43758.5453);
        const microLocal = fract(microPosition);
        const microFiber = Math.pow(
          Math.sin(Math.PI * microLocal),
          1.65 + filamentVariation * 1.3
        );
        const microGroove = Math.pow(
          Math.abs(Math.cos(Math.PI * microLocal)),
          8 + filamentVariation * 6
        );
        const pathUnit = x / width;
        const fragmentWave = clamp(
          .14
          + .56 * periodicFiberNoise(microIndex, pathUnit * 13, 13, 1)
          + .30 * periodicFiberNoise(microIndex, pathUnit * 29, 29, 2),
          0,
          1
        );
        const brokenHighlight = Math.pow(fragmentWave, 2.2);
        const macroVariation = .68
          + filamentVariation * .20
          + .12 * Math.sin(pathPhase * 3 + strandIndex * .43);
        const edgeMask = Math.pow(Math.abs(y / (height - 1) * 2 - 1), 7);
        const edgeVariation = .5 + .5 * Math.sin(pathPhase * 11 + microIndex * 1.31);
        const crossUnit = y / height;
        let aggregateGlint = 0;
        if (lightTextureClass !== "light") {
          const aggregateSignal = clamp(
            .58 * periodicNoise2D(
              pathUnit * 7,
              crossUnit * aggregateFiberClusters,
              7,
              aggregateFiberClusters,
              3
            )
            + .42 * periodicNoise2D(pathUnit * 17, crossUnit * 5, 17, 5, 4),
            0,
            1
          );
          aggregateGlint = Math.pow(aggregateSignal, 2.8);
        }
        const colorSatin = fiberValue("colorSatinAmplitude", 3);
        const macroColor = fiberValue("macroColorAmplitude", 4);
        const macroGrooveColor = fiberValue("macroGrooveColor", 3);
        const microColor = fiberValue("microColorAmplitude", 5);
        const microGrooveColor = fiberValue("microGrooveColor", 2.5);
        const filamentColorVariation = fiberValue("filamentColorVariation", 8);
        const microGrooveVisibility = .58
          + .42 * periodicFiberNoise(microIndex, pathUnit * 17, 17, 10);

        colorValue = clampByte(
          fiberValue("colorBase", 228)
          + macroCrown * macroColor * macroVariation
          - macroGroove * macroGrooveColor
          + microFiber * microColor * (.62 + brokenHighlight * .58)
          - microGroove * microGrooveColor * microGrooveVisibility
          + (filamentVariation - .5) * filamentColorVariation
          + brokenHighlight * colorSatin
          + aggregateGlint * fiberValue("aggregateColor", 12)
          - edgeMask * (2 + edgeVariation * 3)
        );
        bumpValue = clampByte(
          128
          + macroCrown * fiberValue("macroRelief", 3.5) * denierScale
            * macroVariation
          - macroGroove * 4
          + microFiber * fiberValue("microRelief", 10) * denierScale
            * (.45 + brokenHighlight * .55)
          - microGroove * 2.4
          + (brokenHighlight - .5) * 1.4
          + edgeMask * (edgeVariation - .5) * 6
        );
        roughnessValue = clampByte(
          fiberValue("roughnessBase", 226)
          - microFiber * (
            fiberValue("roughnessFiber", 16)
            + brokenHighlight * fiberValue("roughnessSatin", 30)
          )
          - macroCrown * (7 + brokenHighlight * 12)
          - aggregateGlint * fiberValue("aggregateRoughness", 42)
          + (1 - brokenHighlight) * 5
          + edgeMask * fiberValue("edgeRoughness", 18)
        );
        specularValue = clampByte(
          fiberValue("specularBase", 58)
          + microFiber * (
            fiberValue("specularFiber", 42)
            + brokenHighlight * fiberValue("specularSatin", 92)
          )
          + macroCrown * (12 + brokenHighlight * 28)
          + aggregateGlint * fiberValue("aggregateSpecular", 88)
          - edgeMask * 18
        );
        anisotropyDirection = .035 * Math.sin(pathPhase * 3 + microIndex * .17)
          + .015 * Math.sin(pathPhase * 11 - strandIndex * .41);
        anisotropyStrength = clamp(
          .68 + microFiber * (.14 + brokenHighlight * .18) - edgeMask * .10,
          .5,
          1
        );
      } else {
        const ridge = Math.pow(Math.sin(Math.PI * local), .82);
        const fiberCore = Math.pow(Math.sin(Math.PI * local), 2.15);
        const capillaryLine = Math.pow(Math.sin(Math.PI * local), 16);
        const capillaryGroove = Math.pow(Math.abs(Math.cos(Math.PI * local)), 18);
        const contactShadow = Math.pow(1 - ridge, 3);
        const filamentTone = (
          fract(Math.sin((strandIndex + 1) * 91.713) * 43758.5453) - .5
        ) * 7;
        const satinBand = .5 + .34 * Math.sin(x * .031 + strandIndex * .47)
          + .16 * Math.sin(x * .009 - strandIndex * .23);
        colorValue = clampByte(
          235 + ridge * 6 - contactShadow * 3 + filamentTone * .16
          + capillaryLine * 4 - capillaryGroove * 4
          + satinBand * fiberCore * Number(textureProfile.colorSatinAmplitude ?? 8)
        );
        bumpValue = clampByte(
          116 + ridge * bumpAmplitude + capillaryLine * 4 - capillaryGroove * 14
        );
        roughnessValue = clampByte(
          Number(textureProfile.roughnessBase ?? 225)
          - fiberCore * (
            Number(textureProfile.roughnessFiber ?? 24)
            + satinBand * Number(textureProfile.roughnessSatin ?? 12)
          )
          - ridge * 4
        );
        specularValue = clampByte(
          Number(textureProfile.specularBase ?? 46)
          + fiberCore * (
            Number(textureProfile.specularFiber ?? 44)
            + satinBand * Number(textureProfile.specularSatin ?? 24)
          )
          + capillaryLine * 8
        );
      }
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
      roughnessImage.data[offset + 3] = isPolyesterSatin ? roughnessValue : 255;
      specularImage.data[offset] = specularValue;
      specularImage.data[offset + 1] = specularValue;
      specularImage.data[offset + 2] = specularValue;
      specularImage.data[offset + 3] = specularValue;
      if (anisotropyImage) {
        anisotropyImage.data[offset] = clampByte(127.5 + Math.cos(anisotropyDirection) * 127.5);
        anisotropyImage.data[offset + 1] = clampByte(127.5 + Math.sin(anisotropyDirection) * 127.5);
        anisotropyImage.data[offset + 2] = clampByte(anisotropyStrength * 255);
        anisotropyImage.data[offset + 3] = 255;
      }
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
      const nz = isPolyesterSatin ? .75 : 1.45;
      const inverseLength = 1 / Math.hypot(nx, ny, nz);
      const offset = (y * width + x) * 4;
      normalImage.data[offset] = (nx * inverseLength * .5 + .5) * 255;
      normalImage.data[offset + 1] = (ny * inverseLength * .5 + .5) * 255;
      normalImage.data[offset + 2] = (nz * inverseLength * .5 + .5) * 255;
      normalImage.data[offset + 3] = 255;
    }
  }
  normalCtx.putImageData(normalImage, 0, 0);

  if (anisotropyImage) {
    anisotropyCtx.putImageData(anisotropyImage, 0, 0);
  } else {
    // R/G encode +X tangent direction; B is anisotropy strength.
    anisotropyCtx.fillStyle = "rgb(255,128,230)";
    anisotropyCtx.fillRect(0, 0, anisotropyCanvas.width, anisotropyCanvas.height);
  }

  const colorTexture = new THREE.CanvasTexture(colorCanvas);
  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  const normalTexture = new THREE.CanvasTexture(normalCanvas);
  const roughnessTexture = new THREE.CanvasTexture(roughnessCanvas);
  const specularTexture = new THREE.CanvasTexture(specularCanvas);
  const anisotropyTexture = new THREE.CanvasTexture(anisotropyCanvas);
  const repeatU = Number(
    textureProfile.worldSpaceU ? textureProfile.repeatPerMm : textureProfile.repeatU
  ) || 3.5;
  for (const texture of [colorTexture, bumpTexture, normalTexture, roughnessTexture, specularTexture, anisotropyTexture]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatU, 1);
    texture.anisotropy = Math.min(12, state.renderer.capabilities.getMaxAnisotropy?.() || 1);
  }
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  const maps = {
    color: colorTexture,
    bump: bumpTexture,
    normal: normalTexture,
    roughness: roughnessTexture,
    specular: specularTexture,
    anisotropy: anisotropyTexture,
    audit: {
      mapKey,
      repeatU,
      minFilter: "LinearMipmapLinearFilter",
      mipmaps: true,
      physicalYarnBands: strandCount,
      microFibersPerEnd: microFibersPerYarn,
      aggregateFiberClusters,
      lightTextureClass,
      specularMapColorSpace: "linear-data"
    }
  };
  state.polyesterFiberMaps.set(mapKey, maps);
  return maps;
}

function geometryFromCarrierMesh(mesh, materialProfile = {}) {
  const geometry = new THREE.BufferGeometry();
  const worldSpaceU = materialProfile.texture?.worldSpaceU === true;
  const pathLengthMm = Number(mesh.pathLengthMm || 1);
  const uvs = worldSpaceU
    ? mesh.uvs.map((value, index) => index % 2 === 0 ? value * pathLengthMm : value)
    : mesh.uvs;
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
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
  if (state.geometryMesh?.mode === "rope") {
    state.camera.position.z = clamp(state.geometryMesh.length * 2.15, 52, 80);
    state.ropeGroup.rotation.set(0, 0, 0);
  }
  state.camera.aspect = canvas.width / canvas.height;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(canvas.width, canvas.height, false);
  state.renderer.render(state.scene, state.camera);
  recordDiameterProjectionAudit(canvas.width, canvas.height, state.geometryMesh);
  ctx.drawImage(state.renderer.domElement, 0, 0, canvas.width, canvas.height);
  drawMeasurementRulers(ctx, canvas.width, canvas.height, state.geometryMesh);

  state.ropeGroup.rotation.set(previewRotation.x, previewRotation.y, previewRotation.z);
  state.camera.position.z = previewZoom;
  state.camera.aspect = mountRect.width / Math.max(1, mountRect.height);
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(mountRect.width, mountRect.height, false);
  state.renderer.render(state.scene, state.camera);
}

function recordDiameterProjectionAudit(width, height, mesh) {
  if (mesh?.mode !== "rope") return;
  state.ropeGroup.updateMatrixWorld(true);
  const halfLength = Number(mesh.length) * .45;
  const diameterMm = Number(mesh.diameterMm);
  const sampleDiameterPx = (x) => {
    const top = new THREE.Vector3(x, diameterMm / 2, 0)
      .applyMatrix4(state.ropeGroup.matrixWorld)
      .project(state.camera);
    const bottom = new THREE.Vector3(x, -diameterMm / 2, 0)
      .applyMatrix4(state.ropeGroup.matrixWorld)
      .project(state.camera);
    return Math.abs(top.y - bottom.y) * height * .5;
  };
  const samples = [-halfLength, 0, halfLength].map(sampleDiameterPx);
  const spreadPx = Math.max(...samples) - Math.min(...samples);
  window.__BRAIDSTUDIO_RUNTIME_AUDIT__ = {
    ...(window.__BRAIDSTUDIO_RUNTIME_AUDIT__ || {}),
    measurementProjection: {
      projection: "front_parallel_perspective",
      selectedDiameterMm: diameterMm,
      meshOuterDiameterMm: Number(mesh.meshOuterDiameterMm),
      diameterErrorMm: Number(mesh.diameterErrorMm),
      diameterSamplesPx: samples,
      maximumDiameterSpreadPx: spreadPx
    }
  };
}

function projectedPixelsPerMillimeter(width, height, mesh) {
  const diameterMm = Number(mesh?.diameterMm);
  if (!(diameterMm > 0)) return 0;
  const top = new THREE.Vector3(0, diameterMm / 2, 0).project(state.camera);
  const bottom = new THREE.Vector3(0, -diameterMm / 2, 0).project(state.camera);
  return Math.abs(top.y - bottom.y) * height * .5 / diameterMm;
}

function drawMeasurementRulers(ctx, width, height, mesh, { clear = false } = {}) {
  if (clear) ctx.clearRect(0, 0, width, height);
  if (mesh?.mode !== "rope") return;
  const pxPerMm = projectedPixelsPerMillimeter(width, height, mesh);
  if (!(pxPerMm >= 3)) return;

  const topHeight = 30;
  const leftWidth = 48;
  const diameterMm = Number(mesh.diameterMm);
  const ropeTop = height / 2 - diameterMm * pxPerMm / 2;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, topHeight);
  ctx.fillRect(0, 0, leftWidth, height);
  ctx.strokeStyle = "rgba(35,66,56,.78)";
  ctx.fillStyle = "#234238";
  ctx.lineWidth = 1;
  ctx.font = "11px system-ui, sans-serif";
  ctx.textBaseline = "top";

  ctx.beginPath();
  ctx.moveTo(leftWidth, topHeight - .5);
  ctx.lineTo(width, topHeight - .5);
  for (let mm = 0; leftWidth + mm * pxPerMm <= width; mm += 1) {
    const x = leftWidth + mm * pxPerMm;
    const major = mm % 5 === 0;
    ctx.moveTo(x, topHeight);
    ctx.lineTo(x, topHeight - (major ? 12 : 6));
    if (major && x < width - 34) ctx.fillText(String(mm), x + 3, 3);
  }
  ctx.stroke();
  ctx.fillText("mm", width - 22, 3);

  ctx.beginPath();
  ctx.moveTo(leftWidth - .5, topHeight);
  ctx.lineTo(leftWidth - .5, height);
  const firstMm = Math.floor((topHeight - ropeTop) / pxPerMm);
  const lastMm = Math.ceil((height - ropeTop) / pxPerMm);
  for (let mm = firstMm; mm <= lastMm; mm += 1) {
    const y = ropeTop + mm * pxPerMm;
    if (y < topHeight || y > height) continue;
    const major = mm % 5 === 0;
    ctx.moveTo(leftWidth, y);
    ctx.lineTo(leftWidth - (major ? 12 : 6), y);
    if (major && mm >= 0) ctx.fillText(String(mm), 4, y + 2);
  }
  ctx.stroke();
  ctx.fillText("mm", 4, topHeight + 4);
  ctx.restore();
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

function renderSummary(result, mesh = null) {
  ui.diameterValue.textContent = `${result.diameterMm} mm`;
  ui.angleValue.textContent = `${result.angleDeg}°`;
  ui.strandWidthValue.textContent = `${Math.round(result.strandWidthScale * 100)}%`;
  ui.filamentCountValue.textContent = `${result.filamentCount}`;
  ui.denierValue.textContent = `${result.denier}D`;
  const dimensions = mesh?.derivedDimensions;
  ui.repeatBadge.textContent = dimensions
    ? `${result.carrierCount / 2} blokta aynı kukla`
    : "Hesaplanıyor";
  ui.sceneMeta.textContent = `${result.carrierCount} kukla, ${result.diameterMm} mm, ${result.angleDeg}° örgü`;
  const fitLabel = {
    ok: "Uygun",
    loose: "Gevşek paket",
    overfilled: "Çapa sığmıyor"
  }[mesh?.fitStatus] || "Hesaplanıyor";
  const geometryMetrics = mesh ? [
    ["Bir tur adımı", `${dimensions.helicalPitchAxialMm.toFixed(1)} mm`],
    ["Görünen tur", `${(mesh.length / dimensions.helicalPitchAxialMm).toFixed(2)} tur`],
    ["Yüzey çevresi", `${dimensions.circumferenceMm.toFixed(1)} mm`],
    ["Kukla aralığı", `${dimensions.circumferentialPitchMm.toFixed(2)} mm`],
    ["Aynı kuklanın dönüşü", `${result.carrierCount / 2} blok / ${dimensions.helicalPitchAxialMm.toFixed(1)} mm`],
    ["Üst-alt tekrarı", `${dimensions.patternRepeatRows} sıra / ${dimensions.weaveRepeatAxialMm.toFixed(1)} mm`],
    ["Görünen kesit", mesh.visibleRows ? `${mesh.visibleRows} sıra` : "tek crossing"],
    ["Taşıyıcı toplamı", `${mesh.totalCarrierDenier}D`],
    ["Kalibre taşıyıcı", `${mesh.derivedDimensions.effectiveCarrierDenier}D`],
    ["Blok kesiti", `${mesh.yarnWidth.toFixed(2)} x ${mesh.yarnThickness.toFixed(2)} mm`],
    ["Temas doluluğu", `%${Math.round(mesh.contactPackingFraction * 100)}`],
    ["Çap uyumu", fitLabel]
  ] : [];
  ui.summary.innerHTML = [
    ["Kukla", `${result.carrierCount} adet`],
    ["Gruplar", `${result.carrierCount / 2} S + ${result.carrierCount / 2} Z`],
    ["Çap", `${result.diameterMm} mm`],
    ["Tel / denye", `${result.filamentCount} tel x ${result.denier}D`],
    ["Malzeme", ui.materialProfile.options[ui.materialProfile.selectedIndex].textContent],
    ["Üst-alt", ui.crossingMode.options[ui.crossingMode.selectedIndex].textContent]
  ].concat(geometryMetrics)
    .map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");

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
  if (!document.querySelector('#renderRealistic').disabled) {
    document.querySelector('#renderStatus').textContent = document.querySelector('#renderResult').hidden
      ? 'Seçili reçeteden hesaplanır. İşlem birkaç dakika sürebilir.'
      : 'Ayarlar değişti. Gösterilen çıktı aşağıdaki önceki reçeteye aittir; yenisini oluşturabilirsiniz.';
  }
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
  ui.threeRuler.width = Math.max(1, Math.round(rect.width));
  ui.threeRuler.height = Math.max(1, Math.round(rect.height));
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
    const maxZoom = state.geometryMesh?.mode === "rope" ? 90 : 13;
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
  if (state.geometryMesh?.mode === "rope") {
    state.camera.position.y = 0;
    state.camera.lookAt(0, 0, 0);
  }
  state.ropeGroup.rotation.x = state.viewRotation.x;
  state.ropeGroup.rotation.y = state.viewRotation.y;
  state.ropeGroup.rotation.z = state.viewRotation.z + state.autoRotation;
  state.renderer.render(state.scene, state.camera);
  drawMeasurementRulers(
    ui.threeRuler.getContext("2d"),
    ui.threeRuler.width,
    ui.threeRuler.height,
    state.geometryMesh,
    { clear: true }
  );
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

function hashNoise2D(x, y, salt) {
  return fract(Math.sin((x + 1) * 127.1 + (y + 1) * 311.7 + salt * 74.7) * 43758.5453);
}

function periodicFiberNoise(fiberIndex, position, period, salt) {
  const left = Math.floor(position);
  const amount = fract(position);
  const blend = amount * amount * (3 - 2 * amount);
  const a = hashNoise2D(fiberIndex, mod(left, period), salt);
  const b = hashNoise2D(fiberIndex, mod(left + 1, period), salt);
  return a + (b - a) * blend;
}

function periodicNoise2D(x, y, periodX, periodY, salt) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx0 = fract(x);
  const ty0 = fract(y);
  const tx = tx0 * tx0 * (3 - 2 * tx0);
  const ty = ty0 * ty0 * (3 - 2 * ty0);
  const a = hashNoise2D(mod(x0, periodX), mod(y0, periodY), salt);
  const b = hashNoise2D(mod(x0 + 1, periodX), mod(y0, periodY), salt);
  const c = hashNoise2D(mod(x0, periodX), mod(y0 + 1, periodY), salt);
  const d = hashNoise2D(mod(x0 + 1, periodX), mod(y0 + 1, periodY), salt);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
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
ui.materialProfile.addEventListener("change", markSimulationDirty);
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

// Offline appearance output uses the same recipe function as the WebGL preview.
const realisticButton = document.querySelector('#renderRealistic');
realisticButton.addEventListener('click', async () => {
  const status = document.querySelector('#renderStatus');
  realisticButton.disabled = true;
  const payload = geometryPayload(calculateBraid());
  payload.mode = 'rope';
  const label = `${payload.carrierCount} kukla · ${payload.diameterMm} mm · ${payload.braidAngle}° · ${payload.filamentCount} iplik × ${payload.denier}D`;
  document.querySelector('#renderResult').hidden = true;
  document.querySelector('#renderRecipe').textContent = label;
  status.textContent = 'Görüntü hesaplanıyor… Ayar değişiklikleri sonraki çıktıya uygulanır.';
  try {
    let response = await fetch('/api/renders', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    let job = await response.json();
    if (!response.ok) throw new Error(job.error);
    const id = job.id;
    while (job.status === 'rendering') {
      await new Promise(resolve => setTimeout(resolve,2000));
      response = await fetch(`/api/renders/${id}`);
      job = await response.json();
      if (!response.ok) throw new Error(job.error);
    }
    if (job.status !== 'complete') throw new Error(job.error || 'Çıktı hazırlanamadı.');
    document.querySelector('#renderImage').src=job.image;
    document.querySelector('#renderDownload').href=job.image;
    document.querySelector('#renderClose').href=job.close;
    document.querySelector('#renderResult').hidden=false;
    status.textContent='Çıktı hazır. Yukarıdaki reçeteye aittir; sonuçlar geçici olarak saklanır.';
  } catch(error) { status.textContent=error.message; }
  finally {realisticButton.disabled=false;}
});
