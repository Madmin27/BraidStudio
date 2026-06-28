import {
  applyUserSelection,
  generateRecipe,
  initialRecipeState,
  shouldAnalyzeImage
} from "../src/state.js";
import { machineProfiles } from "../src/machineProfiles.js";

const patterns = [
  { id: "diamond", name: "Diamond", carriers: [16, 24], colors: ["siyah", "kırmızı"], material: "polyester", walk: "two-over-two" },
  { id: "spiral", name: "Spiral", carriers: [12, 16, 24], colors: ["lacivert", "beyaz"], material: "polypropylene", walk: "standard" },
  { id: "plain", name: "Düz örgü", carriers: [8, 12, 16], colors: ["siyah"], material: "cotton", walk: "standard" },
  { id: "herringbone", name: "Balıksırtı", carriers: [24, 32], colors: ["gri", "siyah"], material: "nylon", walk: "counter-rotating" },
  { id: "ladder", name: "Merdiven", carriers: [16, 24], colors: ["sarı", "siyah"], material: "polyester", walk: "standard" },
  { id: "chevron", name: "Chevron", carriers: [24, 32], colors: ["kırmızı", "beyaz"], material: "polypropylene", walk: "two-over-two" }
];

const colorMap = {
  siyah: "#1b1f1d",
  kırmızı: "#bd2f2b",
  lacivert: "#1f3d70",
  beyaz: "#f8faf9",
  white: "#f8faf9",
  blue: "#1f3d70",
  red: "#bd2f2b",
  black: "#1b1f1d",
  gray: "#77817b",
  gri: "#77817b",
  nylon: "#d8dde0",
  sarı: "#d7a800"
};

let state = structuredClone(initialRecipeState);
let currentImage = null;
let selectedPatternId = "diamond";

const aiResult = document.querySelector("#aiResult");
const recipeOutput = document.querySelector("#recipeOutput");
const analyzeButton = document.querySelector("#analyzeButton");
const generateButton = document.querySelector("#generateButton");
const selectionForm = document.querySelector("#selectionForm");
const imageInput = document.querySelector("#imageInput");
const imagePreview = document.querySelector("#imagePreview");
const imageStatus = document.querySelector("#imageStatus");
const cacheStatus = document.querySelector("#cacheStatus");
const analysisLog = document.querySelector("#analysisLog");
const aiRawOutput = document.querySelector("#aiRawOutput");
const uploadPrompt = document.querySelector("#uploadPrompt");
const patternAlbum = document.querySelector("#patternAlbum");
const patternSelect = document.querySelector("#patternSelect");
const colorsInput = document.querySelector("#colorsInput");
const materialSelect = document.querySelector("#materialSelect");
const carrierSelect = document.querySelector("#carrierSelect");
const machineProfileSelect = document.querySelector("#machineProfileSelect");
const walkTypeSelect = document.querySelector("#walkTypeSelect");
const sheathInput = document.querySelector("#sheathInput");
const coreEnabledSelect = document.querySelector("#coreEnabledSelect");
const coreMaterialInput = document.querySelector("#coreMaterialInput");
const recipeSheet = document.querySelector("#recipeSheet");
const downloadPngButton = document.querySelector("#downloadPngButton");
const printPdfButton = document.querySelector("#printPdfButton");
const recipeImagePreview = document.querySelector("#recipeImagePreview");
const analysisSteps = [];
let latestRecipePngUrl = "";
let recipeImageRenderTimer = null;

function cacheKey(imageHash) {
  return `braidstudio:analysis:carrier-layout-v2:${imageHash}`;
}

async function hashFile(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readCachedAnalysis(imageHash) {
  const raw = localStorage.getItem(cacheKey(imageHash));
  return raw ? JSON.parse(raw) : null;
}

function saveCachedAnalysis(analysis) {
  localStorage.setItem(cacheKey(analysis.image_hash), JSON.stringify(analysis));
}

function colorToHex(color) {
  return colorMap[String(color || "").toLowerCase()] || "#8d9892";
}

function logAnalysis(message) {
  const time = new Date().toLocaleTimeString("tr-TR");
  analysisSteps.unshift(`${time} - ${message}`);
  analysisLog.innerHTML = analysisSteps.slice(0, 8).map((step) => `<div>${step}</div>`).join("");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(String(reader.result).split(",")[1] || "");
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function renderPairs(target, data) {
  function formatValue(value) {
    if (Array.isArray(value)) {
      if (value.length && typeof value[0] === "object") {
        return `<pre class="mini-json">${JSON.stringify(value, null, 2)}</pre>`;
      }
      return value.join(", ");
    }
    if (value && typeof value === "object") {
      return `<pre class="mini-json">${JSON.stringify(value, null, 2)}</pre>`;
    }
    return value ?? "null";
  }

  target.innerHTML = Object.entries(data)
    .map(([key, value]) => `<dt>${key}</dt><dd>${formatValue(value)}</dd>`)
    .join("");
}

function patternPreview(pattern) {
  const bars = pattern.colors.map((color, index) => `<i style="--i:${index}"></i>`).join("");
  return `<div class="pattern-preview pattern-${pattern.id}">${bars}</div>`;
}

function renderAlbum() {
  patternAlbum.innerHTML = patterns.map((pattern) => `
    <button class="pattern-card ${pattern.id === selectedPatternId ? "selected" : ""}" type="button" data-pattern="${pattern.id}">
      ${patternPreview(pattern)}
      <strong>${pattern.name}</strong>
      <span>${pattern.carriers.join("/")} kukla</span>
    </button>
  `).join("");
}

function renderMachineProfiles() {
  machineProfileSelect.innerHTML = machineProfiles.map((profile) => `
    <option value="${profile.machineProfileId}">
      ${profile.carrierCount} kukla - ${profile.walkType} - ${profile.status}
    </option>
  `).join("");
}

function collectUserSelection() {
  const form = new FormData(selectionForm);
  const material = form.get("material");
  const coreEnabled = form.get("core_enabled") === "true";
  return {
    pattern_type: form.get("pattern_type"),
    colors: String(form.get("colors")).split(",").map((color) => color.trim()).filter(Boolean),
    material,
    carrier_count: Number(form.get("carrier_count")),
    machine_id: "default-machine",
    machine_profile_id: form.get("machine_profile_id"),
    direction: "clockwise",
    braid_walk_type: form.get("braid_walk_type"),
    sheath: {
      enabled: true,
      material: form.get("sheath_material") || material
    },
    core: {
      enabled: coreEnabled,
      material: coreEnabled ? form.get("core_material") || "tanımsız" : null,
      diameter_mm: null
    }
  };
}

function syncSelectionState() {
  state = applyUserSelection(state, collectUserSelection());
}

function normalizeMaterial(material) {
  const value = String(material || "").toLowerCase();
  if (value.includes("polyester") || value === "pes") return "polyester";
  if (value.includes("polypropylene") || value.includes("pp")) return "polypropylene";
  if (value.includes("nylon") || value.includes("polyamide")) return "nylon";
  if (value.includes("cotton")) return "cotton";
  return "polyester";
}

function normalizePattern(patternType) {
  const value = String(patternType || "").toLowerCase();
  const options = Array.from(patternSelect.options).map((option) => option.value);
  if (options.includes(value)) return value;
  if (value.includes("fleck")) return "solid_with_flecks";
  if (value.includes("marker")) return "solid_with_markers";
  if (value.includes("spiral")) return "spiral";
  return "plain";
}

function applyAiSuggestionToSelection(analysis) {
  const predictions = analysis?.predictions || {};
  const carrierCount = Number(predictions.carrier_count || predictions.estimated_carrier_count || 16);
  const colors = Array.isArray(predictions.colors) && predictions.colors.length ? predictions.colors : ["white", "blue"];
  patternSelect.value = normalizePattern(predictions.pattern_type);
  colorsInput.value = colors.join(", ");
  materialSelect.value = normalizeMaterial(predictions.material || predictions.estimated_material);
  carrierSelect.value = String([8, 12, 16, 24, 32].includes(carrierCount) ? carrierCount : 16);
  const matchedProfile = machineProfiles.find((profile) => profile.carrierCount === Number(carrierSelect.value) && profile.machineFamily === "maypole_circular");
  machineProfileSelect.value = matchedProfile?.machineProfileId || "mp_16_std";
  walkTypeSelect.value = predictions.braid_walk_type && !["unknown", "null"].includes(String(predictions.braid_walk_type).toLowerCase()) ? predictions.braid_walk_type : "1_over_1";
  sheathInput.value = materialSelect.value;
  coreEnabledSelect.value = String(Boolean(predictions.core && String(predictions.core).toLowerCase() !== "unknown" && String(predictions.core).toLowerCase() !== "no"));
  coreMaterialInput.value = coreEnabledSelect.value === "true" ? materialSelect.value : "";

  syncSelectionState();
  state = generateRecipe(state);
  logAnalysis("AI önerisi kullanıcı seçimine otomatik aktarıldı ve teknik sheet üretildi.");
}

function render() {
  renderPairs(aiResult, state.ai_analysis_result?.predictions || {
    durum: "Görsel yükleyip analiz et",
    not: "AI tahmini öneridir; reçeteyi kullanıcı seçimi belirler"
  });
  recipeOutput.textContent = JSON.stringify(state.generated_recipe || {
    ai_analysis_result: state.ai_analysis_result,
    user_selected_options: state.user_selected_options,
    machine_constraints: state.machine_constraints
  }, null, 2);
  renderRecipeSheet(state.generated_recipe);
  if (state.ai_analysis_result) {
    aiRawOutput.textContent = JSON.stringify({
      provider: state.ai_analysis_result.provider,
      model: state.ai_analysis_result.model,
      analyzed_at: state.ai_analysis_result.analyzed_at,
      duration_ms: state.ai_analysis_result.duration_ms,
      usage: state.ai_analysis_result.usage,
      raw_text: state.ai_analysis_result.raw_text,
      predictions: state.ai_analysis_result.predictions
    }, null, 2);
  }
  renderAlbum();
}

function renderRecipeSheet(recipe) {
  if (!recipe) {
    recipeSheet.innerHTML = `
      <div class="empty-sheet">
        <strong>Henüz teknik reçete yok</strong>
        <span>Final seçimleri yapıp reçete üret.</span>
      </div>
    `;
    recipeImagePreview.hidden = true;
    recipeImagePreview.removeAttribute("src");
    return;
  }

  const sheet = recipe.technical_sheet;
  const warnings = recipe.preview.warnings.map((warning) => `<li>${warning}</li>`).join("");
  const title = `${sheet.carrier_count || ""} Kukla ${sheet.material || ""} ${sheet.pattern_type || "Halat"} Reçetesi`.trim();

  recipeSheet.innerHTML = `
    <header class="ts-header">
      <div class="ts-recipe-id">${recipe.recipe_id}</div>
      <div><h2>${title}</h2><p>${sheet.material || "Material"} deterministic technical recipe sheet</p></div>
      <table><tbody><tr><th>Revizyon</th><td>1.0</td></tr><tr><th>Tarih</th><td>${new Date(recipe.generated_at).toLocaleDateString("tr-TR")}</td></tr><tr><th>Durum</th><td>${recipe.shop_validation.production_ready ? "ONAYLI" : "DRAFT"}</td></tr></tbody></table>
    </header>
    <section class="ts-block ts-specs"><h3>Teknik özellikler</h3>${renderSpecs(sheet)}</section>
    <section class="ts-block ts-main"><h3>Ana halat görünümü</h3>${renderMainRopeSvg(sheet)}</section>
    <section class="ts-block"><h3>Yakın görünüm</h3>${renderCloseRopeSvg(sheet)}</section>
    <section class="ts-block"><h3>Kesit görünümü</h3>${renderSectionSvg(sheet)}</section>
    <section class="ts-block"><h3>Makara görünümü</h3>${renderSpoolSvg(sheet)}</section>
    <section class="ts-block"><h3>Desen şeması</h3>${renderPatternSvg(sheet)}</section>
    <section class="ts-block"><h3>Renk dizilimi</h3>${renderColorSequence(sheet)}</section>
    <section class="ts-block"><h3>Kukla dizilimi</h3>${renderCarrierRingSvg(sheet)}</section>
    <section class="ts-block"><h3>Kukla yürüyüş diyagramı</h3>${renderWalkSvg(sheet)}</section>
    <section class="ts-block"><h3>Üretim tarifi</h3>${renderKeyValues([["Makine", "Maypole / Tres örgü"], ["Kukla", sheet.carrier_count], ["Yürüyüş", sheet.braid_walk_type], ["İplik takma", "Renk dizilimine göre"]])}</section>
    <section class="ts-block"><h3>Malzeme önerisi</h3>${renderKeyValues([["Dış kılıf", sheet.sheath.material || sheet.material], ["İç dolgu", sheet.core.enabled ? sheet.core.material : "Yok"], ["Renk", sheet.color_sequence.join(" / ")]])}</section>
    <section class="ts-block"><h3>Nasıl yapılır</h3>${renderSteps(sheet.recipeSteps || recipe.technical_sheet.recipeSteps)}</section>
    <section class="ts-block"><h3>Notlar</h3><ul>${warnings}<li>Teknik çizimler SVG renderer ile deterministik üretilmiştir.</li></ul></section>
    <section class="ts-block"><h3>Onay / kontrol</h3>${renderKeyValues([["Hazırlayan", "BraidStudio"], ["Kontrol", "________"], ["Onay", recipe.shop_validation.production_ready ? "ONAYLI" : "Bekliyor"]])}</section>
    <section class="ts-block"><h3>Kullanım alanları</h3><div class="usage-icons"><span>Yelken</span><span>Marina</span><span>Endüstriyel</span><span>Mooring</span></div></section>
  `;
  scheduleRecipeImagePreview();
}

function getRecipeSheetCss() {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
}

function buildRecipeSheetSvgMarkup() {
  const clone = recipeSheet.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  clone.style.width = "1600px";
  clone.style.minHeight = "1050px";
  clone.style.overflow = "hidden";
  const html = `
    <div xmlns="http://www.w3.org/1999/xhtml">
      <style>${getRecipeSheetCss()}</style>
      ${clone.outerHTML}
    </div>
  `;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1050" viewBox="0 0 1600 1050">
      <foreignObject width="1600" height="1050">${html}</foreignObject>
    </svg>
  `;
}

function renderRecipeSheetToPng() {
  return new Promise((resolve, reject) => {
    const svg = buildRecipeSheetSvgMarkup();
    const image = new Image();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 1050;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("recipe_image_render_failed"));
    };
    image.src = url;
  });
}

function scheduleRecipeImagePreview() {
  clearTimeout(recipeImageRenderTimer);
  recipeImageRenderTimer = setTimeout(async () => {
    try {
      latestRecipePngUrl = await renderRecipeSheetToPng();
      recipeImagePreview.src = latestRecipePngUrl;
      recipeImagePreview.hidden = false;
      logAnalysis("Teknik reçete resmi otomatik üretildi.");
    } catch (error) {
      logAnalysis(`Teknik reçete resmi üretilemedi: ${error.message}`);
    }
  }, 120);
}

function renderSpecs(sheet) {
  return renderKeyValues([
    ["Çap", "Kullanıcı girecek"],
    ["Hammadde", sheet.material],
    ["Yapı", sheet.sheath.enabled ? "Kılıflı örgü" : "Tek örgü"],
    ["İç dolgu", sheet.core.enabled ? sheet.core.material : "Yok"],
    ["Örgü tipi", sheet.pattern_type],
    ["Makine", sheet.machine_id],
    ["Profil", sheet.machineProfile.machineProfileId],
    ["Profil durumu", sheet.machine_profile_status],
    ["Track model", sheet.machineProfile.trackModel],
    ["Kukla sayısı", sheet.carrier_count],
    ["Yürüyüş", sheet.braid_walk_type],
    ["Doğrulama", sheet.validationRequired ? "Gerekli" : "Tamam"]
  ]);
}

function renderKeyValues(rows) {
  return `<table class="kv"><tbody>${rows.map(([key, value]) => `<tr><th>${key}</th><td>${value ?? "Tanımsız"}</td></tr>`).join("")}</tbody></table>`;
}

function renderSteps(steps = []) {
  return `<ol class="step-list">${steps.map((step) => `<li>${step}</li>`).join("")}</ol>`;
}

function ropeLines(sheet, width = 760, height = 120, close = false) {
  const markerColor = colorToHex(markerColors(sheet)[0] || "blue");
  const baseStroke = close ? 9 : 5;
  const markerStroke = close ? 10 : 6;
  const gap = close ? 19 : 24;
  const lines = [];
  for (let offset = -width; offset < width * 1.4; offset += gap) {
    lines.push(`<path d="M ${offset} ${height} C ${offset + width * 0.28} ${height * 0.08}, ${offset + width * 0.55} ${height * 0.92}, ${offset + width} 0" stroke="#d7ddd8" stroke-width="${baseStroke}" fill="none"/>`);
    lines.push(`<path d="M ${offset} 0 C ${offset + width * 0.28} ${height * 0.92}, ${offset + width * 0.55} ${height * 0.08}, ${offset + width} ${height}" stroke="#aab4ae" stroke-width="${Math.max(1.5, baseStroke / 3)}" fill="none" opacity=".9"/>`);
  }
  const markerGap = close ? 92 : 190;
  for (let offset = -markerGap; offset < width * 1.25; offset += markerGap) {
    lines.push(`<path d="M ${offset} ${height} C ${offset + width * 0.22} ${height * 0.04}, ${offset + width * 0.42} ${height * 0.9}, ${offset + width * 0.72} 0" stroke="${markerColor}" stroke-width="${markerStroke}" fill="none"/>`);
    lines.push(`<path d="M ${offset + 20} ${height} C ${offset + width * 0.24} ${height * 0.08}, ${offset + width * 0.45} ${height * 0.88}, ${offset + width * 0.74} 0" stroke="#f8faf9" stroke-width="${Math.max(2, markerStroke / 2.6)}" fill="none" opacity=".55"/>`);
  }
  return lines.join("");
}

function markerColors(sheet) {
  const base = sheet.color_sequence[0];
  return [...new Set(sheet.color_sequence.filter((color) => color !== base))];
}

function renderMainRopeSvg(sheet) {
  return `<svg viewBox="0 0 820 160" role="img"><rect x="20" y="36" width="760" height="74" fill="#fbfbf8" stroke="#111"/>${ropeLines(sheet)}<line x1="20" y1="135" x2="780" y2="135" stroke="#111"/><text x="20" y="154">0</text><text x="740" y="154">30 cm</text></svg>`;
}

function renderCloseRopeSvg(sheet) {
  return `<svg viewBox="0 0 360 220" role="img"><rect width="360" height="220" fill="#fbfbf8" stroke="#111"/>${ropeLines(sheet, 360, 220, true)}</svg>`;
}

function renderPatternSvg(sheet) {
  return `<svg viewBox="0 0 360 220" role="img"><rect width="360" height="220" fill="#fff" stroke="#111"/>${ropeLines(sheet, 360, 220, false)}<text x="18" y="198">45°</text></svg>`;
}

function renderSpoolSvg(sheet) {
  return `<svg viewBox="0 0 360 220" role="img"><ellipse cx="180" cy="35" rx="130" ry="18" fill="#26323a"/><rect x="70" y="35" width="220" height="150" fill="#eef1ee" stroke="#333"/>${ropeLines(sheet, 230, 150, false).replaceAll("<path d=\"M ", "<path transform=\"translate(70 35)\" d=\"M ")}<ellipse cx="180" cy="185" rx="130" ry="18" fill="#26323a"/></svg>`;
}

function renderSectionSvg(sheet) {
  const carriers = sheet.carrier_layout;
  const dots = carriers.map((carrier, index) => {
    const angle = (Math.PI * 2 * index) / carriers.length - Math.PI / 2;
    const x = 180 + Math.cos(angle) * 76;
    const y = 105 + Math.sin(angle) * 76;
    return `<circle cx="${x}" cy="${y}" r="7" fill="${colorToHex(carrier.color)}" stroke="#111"/>`;
  }).join("");
  return `<svg viewBox="0 0 360 220" role="img"><circle cx="180" cy="105" r="88" fill="#fff" stroke="#111"/><circle cx="180" cy="105" r="48" fill="#f5f2e9" stroke="#777"/>${dots}<text x="245" y="92">Kılıf</text><text x="245" y="124">İç dolgu</text></svg>`;
}

function renderColorSequence(sheet) {
  return `<div class="color-strip">${sheet.color_sequence.map((color, index) => `<span><i style="background:${colorToHex(color)}"></i>${index + 1}</span>`).join("")}</div>`;
}

function renderCarrierRingSvg(sheet) {
  const carriers = sheet.carrier_layout;
  const dots = carriers.map((carrier, index) => {
    const angle = (Math.PI * 2 * index) / carriers.length - Math.PI / 2;
    const x = 180 + Math.cos(angle) * 82;
    const y = 105 + Math.sin(angle) * 82;
    return `<g><circle cx="${x}" cy="${y}" r="13" fill="${colorToHex(carrier.color)}" stroke="#111"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10">${carrier.carrier_no}</text></g>`;
  }).join("");
  return `<svg viewBox="0 0 360 220" role="img"><circle cx="180" cy="105" r="82" fill="none" stroke="#888"/>${dots}</svg>`;
}

function renderWalkSvg(sheet) {
  const count = Math.min(sheet.carrier_count || 16, 24);
  const rows = 5;
  const cols = count;
  const cellW = 320 / Math.max(cols - 1, 1);
  const cellH = 26;
  const lines = [];
  const grid = [];
  for (let col = 0; col < cols; col += 1) {
    const x = 20 + col * cellW;
    grid.push(`<text x="${x}" y="16" text-anchor="middle" font-size="8">${col + 1}</text>`);
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x1 = 20 + col * cellW;
      const next = row % 2 === 0 ? Math.min(col + 1, cols - 1) : Math.max(col - 1, 0);
      const x2 = 20 + next * cellW;
      const y1 = 30 + row * cellH;
      const y2 = 30 + (row + 1) * cellH;
      const color = colorToHex(sheet.color_sequence[col % sheet.color_sequence.length]);
      lines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.8"/><circle cx="${x1}" cy="${y1}" r="2.8" fill="${color}" stroke="#111"/>`);
    }
  }
  const status = sheet.walkMap?.status || "generic_candidate";
  return `<svg viewBox="0 0 360 180" role="img"><rect width="360" height="180" fill="#fff" stroke="#111"/>${grid.join("")}${lines.join("")}<text x="18" y="146" font-size="9">${sheet.walkMap?.machineProfileId || ""}</text><text x="18" y="159" font-size="9">${sheet.machineProfile.trackModel}</text><text x="18" y="172" font-size="9">${status} - shop ölçümü gerekir</text></svg>`;
}

function applyPattern(patternId) {
  const pattern = patterns.find((item) => item.id === patternId);
  if (!pattern) return;

  selectedPatternId = pattern.id;
  patternSelect.value = pattern.id;
  colorsInput.value = pattern.colors.join(", ");
  materialSelect.value = pattern.material;
  carrierSelect.value = String(pattern.carriers.at(-1));
  const matchedProfile = machineProfiles.find((profile) => profile.carrierCount === Number(carrierSelect.value) && profile.machineFamily === "maypole_circular");
  machineProfileSelect.value = matchedProfile?.machineProfileId || "mp_16_std";
  walkTypeSelect.value = matchedProfile?.walkType || pattern.walk;
  sheathInput.value = pattern.material;
  syncSelectionState();
  render();
}

imageInput.addEventListener("change", async () => {
  const file = imageInput.files?.[0];
  if (!file) return;

  const imageHash = await hashFile(file);
  currentImage = { file, imageHash };
  imagePreview.src = URL.createObjectURL(file);
  imagePreview.alt = file.name;
  imagePreview.hidden = false;
  uploadPrompt.hidden = true;
  imageStatus.textContent = "Yüklendi";

  const cachedAnalysis = readCachedAnalysis(imageHash);
  if (cachedAnalysis) {
    state = { ...state, ai_analysis_result: cachedAnalysis };
    cacheStatus.textContent = "Cache kullanıldı";
    logAnalysis(`Bu görsel için tarayıcı cache bulundu: ${imageHash.slice(0, 12)}`);
    applyAiSuggestionToSelection(cachedAnalysis);
  } else {
    cacheStatus.textContent = "Butona bas";
    logAnalysis(`Görsel hazır. Analiz için butona bas: ${imageHash.slice(0, 12)}`);
  }
  render();
});

analyzeButton.addEventListener("click", async () => {
  if (!currentImage) {
    imageStatus.textContent = "Önce görsel seç";
    return;
  }

  analyzeButton.disabled = true;
  cacheStatus.textContent = "OpenRouter yeniden analiz ediyor";
  logAnalysis("Görsel base64 hazırlanıyor.");
  try {
    const dataBase64 = await fileToBase64(currentImage.file);
    logAnalysis("Backend /api/analyze-image isteği gönderildi.");
    const response = await fetch("/api/analyze-image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imageHash: currentImage.imageHash,
        mimeType: currentImage.file.type,
        dataBase64,
        force: true
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      aiRawOutput.textContent = JSON.stringify(payload, null, 2);
      throw new Error(`${payload.error || "analysis_failed"}${payload.details?.http_status ? ` (${payload.details.http_status})` : ""}`);
    }
    saveCachedAnalysis(payload.analysis);
    state = { ...state, ai_analysis_result: payload.analysis };
    cacheStatus.textContent = payload.cache === "hit" ? "Server cache" : "OpenRouter sonucu";
    logAnalysis(`${payload.cache === "refresh" ? "Cache bypass edildi, yeni OpenRouter cevabı alındı" : "OpenRouter cevabı alındı"}: ${payload.analysis.model}`);
    applyAiSuggestionToSelection(payload.analysis);
  } catch (error) {
    cacheStatus.textContent = `Hata: ${error.message}`;
    logAnalysis(`Hata: ${error.message}`);
  } finally {
    analyzeButton.disabled = false;
    render();
  }
});

generateButton.addEventListener("click", () => {
  syncSelectionState();
  state = generateRecipe(state);
  render();
});

selectionForm.addEventListener("change", () => {
  selectedPatternId = patternSelect.value;
  syncSelectionState();
  render();
});

patternAlbum.addEventListener("click", (event) => {
  const card = event.target.closest("[data-pattern]");
  if (card) applyPattern(card.dataset.pattern);
});

downloadPngButton.addEventListener("click", async () => {
  if (!latestRecipePngUrl && state.generated_recipe) {
    latestRecipePngUrl = await renderRecipeSheetToPng();
  }
  if (!latestRecipePngUrl) return;
  const link = document.createElement("a");
  link.download = "braidstudio-recipe-sheet.png";
  link.href = latestRecipePngUrl;
  link.click();
});

printPdfButton.addEventListener("click", () => {
  window.print();
});

renderMachineProfiles();
applyPattern(selectedPatternId);
