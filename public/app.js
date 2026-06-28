import {
  applyUserSelection,
  generateRecipe,
  initialRecipeState
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

const analyzeButton = document.querySelector("#analyzeButton");
const generateButton = document.querySelector("#generateButton");
const selectionForm = document.querySelector("#selectionForm");
const imageInput = document.querySelector("#imageInput");
const imagePreview = document.querySelector("#imagePreview");
const imageStatus = document.querySelector("#imageStatus");
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
const recipeImageOutput = document.querySelector(".recipe-image-output");
const processLog = document.querySelector("#processLog");
const processStatus = document.querySelector("#processStatus");
const mismatchReport = document.querySelector("#mismatchReport");
recipeImagePreview.addEventListener("error", () => {
  recipeImagePreview.hidden = true;
  recipeImagePreview.removeAttribute("src");
  recipeImageOutput.hidden = true;
});
const analysisSteps = [];
const processSteps = [];
let latestRecipePngUrl = "";

function cacheKey(imageHash) {
  return `braidstudio:analysis:fingerprint-v1:${imageHash}`;
}

async function hashFile(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function saveCachedAnalysis(analysis) {
  localStorage.setItem(cacheKey(analysis.image_hash), JSON.stringify(analysis));
}

function colorToHex(color) {
  return colorMap[String(color || "").toLowerCase()] || "#8d9892";
}

function logAnalysis(message) {
  console.info(`[BraidStudio] ${message}`);
  const analysisLog = document.querySelector("#analysisLog");
  if (!analysisLog) return;
  const time = new Date().toLocaleTimeString("tr-TR");
  analysisSteps.unshift(`${time} - ${message}`);
  analysisLog.innerHTML = analysisSteps.slice(0, 8).map((step) => `<div>${step}</div>`).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function logProcess(stage, message, details = {}, status = "info") {
  const item = {
    time: new Date().toLocaleTimeString("tr-TR"),
    stage,
    message,
    details,
    status
  };
  processSteps.unshift(item);
  console.info("[BraidStudio]", stage, message, details);
  renderProcessLog();
}

function renderProcessLog() {
  if (!processLog) return;
  processStatus.textContent = processSteps[0]?.message || "Bekliyor";
  processLog.innerHTML = processSteps.slice(0, 18).map((step) => `
    <details class="process-item ${step.status}" ${step.status === "error" || step.status === "warn" ? "open" : ""}>
      <summary><span>${escapeHtml(step.time)}</span><strong>${escapeHtml(step.stage)}</strong>${escapeHtml(step.message)}</summary>
      <pre>${escapeHtml(JSON.stringify(step.details || {}, null, 2))}</pre>
    </details>
  `).join("");
}

function updateMismatchReport(report = []) {
  if (!mismatchReport) return;
  if (!report.length) {
    mismatchReport.innerHTML = `<div class="mismatch-ok">Tutarsızlık yok.</div>`;
    return;
  }
  mismatchReport.innerHTML = report.map((item) => `
    <div class="mismatch-${item.level}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.message)}</span>
    </div>
  `).join("");
}

function buildMismatchReport({ analysis = state.ai_analysis_result, finalSelection = state.user_selected_options, recipe = state.generated_recipe } = {}) {
  const report = [];
  const predictions = analysis?.predictions || {};
  const predictor = predictions.predictor_result || analysis?.predictor_result || {};
  const structural = predictions.structuralAnalysis || predictions.fingerprint?.structuralAnalysis || {};
  const selectedCarrierCount = Number(finalSelection.carrier_count || 0);
  const aiCarrierCount = Number(structural.carrierCount || predictions.estimatedCarrierCount || predictions.estimated_carrier_count || 0);
  const layoutCount = Array.isArray(finalSelection.carrier_layout) ? finalSelection.carrier_layout.length : 0;
  const candidate = finalSelection.ai_selected_candidate;
  const profile = machineProfiles.find((item) => item.machineProfileId === finalSelection.machine_profile_id);

  if (aiCarrierCount && selectedCarrierCount && aiCarrierCount !== selectedCarrierCount) {
    report.push({
      level: "warn",
      title: "Kukla sayısı farkı",
      message: `AI ${aiCarrierCount} tahmin etti, finalSelection ${selectedCarrierCount} kullanıyor. Reçete finalSelection'a göre çizilir.`
    });
  }

  if (layoutCount && selectedCarrierCount && layoutCount !== selectedCarrierCount) {
    report.push({
      level: "error",
      title: "Carrier layout sayısı hatalı",
      message: `carrier_layout ${layoutCount}, seçilen kukla sayısı ${selectedCarrierCount}. Desen burada bozulur.`
    });
  }

  if (candidate?.recipeId && candidate.visualSignature && predictor.visualSignature && candidate.visualSignature !== predictor.visualSignature) {
    report.push({
      level: "warn",
      title: "Candidate / predictor imzası farklı",
      message: `Candidate ${candidate.visualSignature}, predictor ${predictor.visualSignature}.`
    });
  }

  if (predictor.analysis?.braidLogic && finalSelection.braid_walk_type && normalizeWalkType(predictor.analysis.braidLogic, finalSelection.colors) !== finalSelection.braid_walk_type) {
    report.push({
      level: "error",
      title: "Yürüyüş tipi tutarsız",
      message: `Predictor ${predictor.analysis.braidLogic}, kullanıcı seçimi ${finalSelection.braid_walk_type}. Desen mekaniği burada kopar.`
    });
  }

  const finalColors = finalSelection.colors || [];
  const layoutColors = new Set((finalSelection.carrier_layout || []).map((carrier) => carrier.color));
  for (const color of finalColors.slice(1)) {
    if (layoutCount && !layoutColors.has(color)) {
      report.push({
        level: "error",
        title: "Renk carrier layout'ta yok",
        message: `${color} renk listesinde var ama carrier_layout içinde yok. Tracer çizimi eksik çıkar.`
      });
    }
  }

  const markerDirections = markerDirectionSummary(finalSelection.carrier_layout, profile);
  if (markerDirections.markerCount > 1 && markerDirections.directionCount === 1) {
    report.push({
      level: "warn",
      title: "Tracer taşıyıcıları aynı yönde",
      message: `Renkli kuklalar sadece ${markerDirections.directions.join(", ")} grubunda. X/dual görünüm değil paralel spiral oluşur.`
    });
  }

  if (recipe?.technical_sheet) {
    const sheet = recipe.technical_sheet;
    if (sheet.carrier_layout.length !== sheet.carrier_count) {
      report.push({
        level: "error",
        title: "Renderer girdisi hatalı",
        message: `Sheet carrier_layout ${sheet.carrier_layout.length}, carrier_count ${sheet.carrier_count}.`
      });
    }
  }

  return report;
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
  if (value.includes("marker") || value.includes("tracer") || value.includes("dual_counter_spiral")) return "solid_with_markers";
  if (value.includes("diagonal_rib")) return "herringbone";
  if (value.includes("spiral")) return "spiral";
  return "plain";
}

function normalizeWalkType(value, colors = []) {
  const text = String(value || "").toLowerCase();
  const colorSet = new Set(colors.map((color) => String(color).toLowerCase()));
  if (text.includes("2_over_2") || text.includes("two-over-two") || text.includes("twill")) return "two-over-two";
  if (colorSet.has("yellow") && colorSet.has("black")) return "two-over-two";
  return "1_over_1";
}

function pickRecipeCandidate(analysis, carrierCount) {
  const candidates = Array.isArray(analysis?.recipe_candidates) ? analysis.recipe_candidates : [];
  return candidates.find((candidate) => {
    const count = Object.keys(candidate.carrierColorMap || {}).length;
    return count === carrierCount;
  }) || null;
}

function carrierLayoutFromColorMap(carrierColorMap) {
  return Object.entries(carrierColorMap || {})
    .map(([carrierNo, color]) => ({
      carrier_no: Number(carrierNo),
      color,
      strand_role: "sheath"
    }))
    .filter((carrier) => Number.isFinite(carrier.carrier_no))
    .sort((a, b) => a.carrier_no - b.carrier_no);
}

function carrierLayoutFromPrediction(predictions) {
  if (Array.isArray(predictions.estimated_carrier_layout) && predictions.estimated_carrier_layout.length) {
    return predictions.estimated_carrier_layout.map((carrier, index) => ({
      carrier_no: Number(carrier.carrier_no || index + 1),
      color: carrier.color || "white",
      strand_role: carrier.role || carrier.strand_role || "sheath"
    }));
  }
  return [];
}

function markerLayoutFromColors(carrierCount, colors) {
  const base = colors[0] || "white";
  const accentColors = colors.slice(1);
  const layout = Array.from({ length: carrierCount }, (_, index) => ({
    carrier_no: index + 1,
    color: base,
    strand_role: "sheath"
  }));

  if (!accentColors.length) return layout;

  const yellow = accentColors.find((color) => String(color).toLowerCase().includes("yellow") || String(color).toLowerCase().includes("sarı"));
  const black = accentColors.find((color) => String(color).toLowerCase().includes("black") || String(color).toLowerCase().includes("siyah"));
  const cluster = yellow && black
    ? [black, yellow, black]
    : accentColors.length >= 2
      ? [accentColors[1], accentColors[0], accentColors[1]]
      : [accentColors[0]];
  const starts = carrierCount === 16
    ? [1, 8]
    : carrierCount === 24
      ? [1, 8, 17]
      : Array.from({ length: Math.max(1, Math.round(carrierCount / 8)) }, (_, index) => 1 + index * Math.max(4, Math.floor(carrierCount / Math.max(1, Math.round(carrierCount / 8)))));

  for (const start of starts) {
    cluster.forEach((color, index) => {
      const carrierNo = ((start + index - 1) % carrierCount) + 1;
      layout[carrierNo - 1] = {
        carrier_no: carrierNo,
        color,
        strand_role: "sheath_marker"
      };
    });
  }

  return layout;
}

function markerDirectionSummary(carrierLayout = [], machineProfile = null) {
  const base = mostCommonColor(carrierLayout.map((carrier) => carrier.color));
  const markers = carrierLayout.filter((carrier) => carrier.color !== base);
  const directions = [...new Set(markers.map((carrier) => carrierDirection(carrier.carrier_no, machineProfile)))];
  return {
    markerCount: markers.length,
    directionCount: directions.filter((direction) => direction !== "unknown").length,
    directions
  };
}

function applyAiSuggestionToSelection(analysis) {
  const predictions = analysis?.predictions || {};
  const fingerprint = predictions.fingerprint || {};
  const predictorResult = predictions.predictor_result || analysis?.predictor_result || {};
  const structuralAnalysis = fingerprint.structuralAnalysis || predictions.structuralAnalysis || {};
  const carrierCount = Number(structuralAnalysis.carrierCount || predictions.carrier_count || predictions.estimated_carrier_count || 16);
  const normalizedCarrierCount = [8, 12, 16, 24, 32].includes(carrierCount) ? carrierCount : 16;
  const bestCandidate = pickRecipeCandidate(analysis, normalizedCarrierCount);
  const candidateLayout = carrierLayoutFromColorMap(bestCandidate?.carrierColorMap);
  const predictedLayout = carrierLayoutFromPrediction(predictions);
  const colors = Array.isArray(predictions.colors) && predictions.colors.length ? predictions.colors : ["white", "blue"];
  const markerLayout = markerLayoutFromColors(normalizedCarrierCount, colors);
  const matchedProfile = machineProfiles.find((profile) => profile.carrierCount === normalizedCarrierCount && profile.machineFamily === "maypole_circular");
  const candidateUsable = candidateLayout.length === normalizedCarrierCount && !hasSameDirectionMarkerConflict(candidateLayout, matchedProfile);
  const predictedUsable = predictedLayout.length === normalizedCarrierCount && !hasSameDirectionMarkerConflict(predictedLayout, matchedProfile);
  logProcess("AI sonucu", "AI/predictor sonucu alındı", {
    model: analysis?.model,
    rawSignature: fingerprint.predictedSignature || predictions.predictedSignature,
    predictorSignature: predictorResult.visualSignature,
    predictorReliable: predictorResult.isReliable,
    predictorWarnings: predictorResult.warnings,
    carrierCount: normalizedCarrierCount,
    colors,
    predictorBraidLogic: predictorResult.analysis?.braidLogic,
    structuralBraidLogic: structuralAnalysis.braidLogic,
    recipeCandidateCount: analysis?.recipe_candidates?.length || 0
  });
  patternSelect.value = normalizePattern(predictorResult.visualSignature || fingerprint.predictedSignature || predictions.predictedSignature || predictions.visualSignature || predictions.pattern_type);
  colorsInput.value = colors.join(", ");
  materialSelect.value = normalizeMaterial(predictions.material || predictions.estimated_material);
  carrierSelect.value = String(normalizedCarrierCount);
  machineProfileSelect.value = matchedProfile?.machineProfileId || "mp_16_std";
  walkTypeSelect.value = normalizeWalkType(predictorResult.analysis?.braidLogic || bestCandidate?.braidLogic || structuralAnalysis.braidLogic || predictions.braid_walk_type, colors);
  sheathInput.value = materialSelect.value;
  coreEnabledSelect.value = String(Boolean(predictions.core && String(predictions.core).toLowerCase() !== "unknown" && String(predictions.core).toLowerCase() !== "no"));
  coreMaterialInput.value = coreEnabledSelect.value === "true" ? materialSelect.value : "";

  syncSelectionState();
  state = applyUserSelection(state, {
    carrier_layout: candidateUsable
      ? candidateLayout
      : markerLayout.length
        ? markerLayout
        : predictedUsable
          ? predictedLayout
          : predictedLayout,
    ai_selected_candidate: bestCandidate ? {
      recipeId: bestCandidate.recipeId,
      confidence: bestCandidate.confidence,
      visualSignature: bestCandidate.visualSignature,
      status: bestCandidate.status
    } : null,
    ai_suggestion_applied_at: new Date().toISOString()
  });
  logProcess("Kullanıcı seçimine aktarım", "AI önerisi finalSelection alanlarına aktarıldı", {
    selectedPattern: patternSelect.value,
    selectedWalkType: walkTypeSelect.value,
    selectedCarrierCount: Number(carrierSelect.value),
    selectedColors: colors,
    candidate: bestCandidate ? {
      recipeId: bestCandidate.recipeId,
      visualSignature: bestCandidate.visualSignature,
      carrierMapCount: Object.keys(bestCandidate.carrierColorMap || {}).length,
      braidLogic: bestCandidate.braidLogic,
      confidence: bestCandidate.confidence,
      used: candidateUsable,
      rejectedReason: candidateLayout.length && !candidateUsable ? "marker taşıyıcıları aynı yön grubunda" : null
    } : null,
    carrierLayoutCount: state.user_selected_options.carrier_layout.length,
    carrierLayoutPreview: state.user_selected_options.carrier_layout.slice(0, 16)
  }, buildMismatchReport().some((item) => item.level === "error") ? "error" : "info");
  updateMismatchReport(buildMismatchReport());
  clearGeneratedRecipe();
  generateButton.disabled = false;
  logAnalysis(`${bestCandidate ? `${bestCandidate.recipeId} adayı` : "AI önerisi"} kullanıcı seçimi alanlarına aktarıldı. Reçete Görseli butonuna basınca teknik resim üretilecek.`);
}

function hasSameDirectionMarkerConflict(carrierLayout = [], machineProfile = null) {
  const summary = markerDirectionSummary(carrierLayout, machineProfile);
  return summary.markerCount > 1 && summary.directionCount === 1;
}

function render() {
  renderRecipeSheet(state.generated_recipe);
  renderAlbum();
}

function clearGeneratedRecipe() {
  latestRecipePngUrl = "";
  state = {
    ...state,
    generated_recipe: null
  };
  recipeImageOutput.hidden = true;
  recipeImagePreview.hidden = true;
  recipeImagePreview.removeAttribute("src");
  updateMismatchReport(buildMismatchReport());
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
  logProcess("Renderer girdisi", "Teknik sheet DOM üretildi", {
    recipeId: recipe.recipe_id,
    patternType: sheet.pattern_type,
    carrierCount: sheet.carrier_count,
    walkType: sheet.braid_walk_type,
    colorSequence: sheet.color_sequence,
    carrierLayoutCount: sheet.carrier_layout.length,
    markerStarts: markerClusterStarts(sheet),
    markerColors: tracerClusterColors(sheet),
    markerDirections: markerDirectionSummary(sheet.carrier_layout, sheet.machineProfile),
    previewConfidence: recipe.preview.previewConfidence,
    warnings: recipe.preview.warnings
  }, buildMismatchReport({ recipe }).some((item) => item.level === "error") ? "error" : "info");
  updateMismatchReport(buildMismatchReport({ recipe }));
}

function getRecipeSheetCss() {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .filter((text) => !text.includes(":has("))
          .join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
}

function buildRecipeSheetSvgMarkup() {
  const clone = recipeSheet.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  clone.querySelectorAll("svg").forEach((svg) => {
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  });
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
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 1050;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => {
      reject(new Error("recipe_image_render_failed"));
    };
    image.src = url;
  });
}

function downloadRecipeSvgFallback() {
  const svg = buildRecipeSheetSvgMarkup();
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = "braidstudio-recipe-sheet.svg";
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const id = `ropeClip${width}x${height}${close ? "c" : "m"}`;
  const isTwill = isTwillWalk(sheet.braid_walk_type);
  const strandGap = close ? (isTwill ? 12 : 18) : (isTwill ? 13 : 22);
  const strandStroke = close ? (isTwill ? 9.4 : 2.2) : (isTwill ? 5.4 : 1.45);
  const tracerStroke = close ? (isTwill ? 12 : 8) : (isTwill ? 9 : 6);
  const tracerStep = close ? 92 : 124;
  const tracerLength = close ? 34 : 42;
  const lines = [];
  const slope = isTwill ? 1.02 : 1.45;

  lines.push(`<defs><clipPath id="${id}"><rect x="0" y="0" width="${width}" height="${height}" rx="${close ? 0 : 3}"/></clipPath></defs>`);
  lines.push(`<g clip-path="url(#${id})">`);
  lines.push(`<rect width="${width}" height="${height}" fill="#f7f8f5"/>`);

  for (let offset = -height * 2; offset < width + height * 2; offset += strandGap) {
    const x2 = offset + height * slope;
    lines.push(`<line x1="${offset}" y1="${height}" x2="${x2}" y2="0" stroke="#aeb8b1" stroke-width="${strandStroke + 1.4}" opacity=".48"/>`);
    lines.push(`<line x1="${offset}" y1="${height}" x2="${x2}" y2="0" stroke="#edf0ec" stroke-width="${strandStroke}" opacity=".98"/>`);
    lines.push(`<line x1="${offset + strandGap * 0.22}" y1="${height}" x2="${x2 + strandGap * 0.22}" y2="0" stroke="#ffffff" stroke-width="${Math.max(1, strandStroke * 0.25)}" opacity=".9"/>`);
  }

  for (let offset = -height * 2 + strandGap / 2; offset < width + height * 2; offset += strandGap) {
    const x2 = offset + height * slope;
    lines.push(`<line x1="${offset}" y1="0" x2="${x2}" y2="${height}" stroke="#9facA5" stroke-width="${strandStroke + 1.1}" opacity=".38"/>`);
    lines.push(`<line x1="${offset}" y1="0" x2="${x2}" y2="${height}" stroke="#dfe5df" stroke-width="${strandStroke}" opacity=".98"/>`);
    lines.push(`<line x1="${offset + strandGap * 0.22}" y1="0" x2="${x2 + strandGap * 0.22}" y2="${height}" stroke="#ffffff" stroke-width="${Math.max(1, strandStroke * 0.22)}" opacity=".72"/>`);
  }

  const tracerClusters = markerClusters(sheet);
  for (const cluster of tracerClusters) {
    const phase = ((cluster.start - 1) / Math.max(1, sheet.carrier_count || 1)) * tracerStep;
    const reverse = cluster.direction === "counterClockwise";
    for (let offset = -tracerStep + phase; offset < width + tracerStep; offset += tracerStep) {
      cluster.colors.forEach((color, index) => {
        const segmentOffset = offset + index * (tracerLength * 0.72);
        const y1 = reverse ? 0 : height;
        const y2 = reverse ? height * 0.58 : height * 0.42;
        const x2 = segmentOffset + tracerLength * 0.9;
        lines.push(`<line x1="${segmentOffset}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#59635d" stroke-width="${tracerStroke + 1.4}" stroke-linecap="round" opacity=".32"/>`);
        lines.push(`<line x1="${segmentOffset}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colorToHex(color)}" stroke-width="${tracerStroke}" stroke-linecap="round"/>`);
        lines.push(`<line x1="${segmentOffset + 1}" y1="${y1}" x2="${x2 - 1}" y2="${y2}" stroke="#ffffff" stroke-width="${Math.max(1, tracerStroke * 0.18)}" stroke-linecap="round" opacity=".35"/>`);
      });
    }
  }

  lines.push("</g>");
  return lines.join("");
}

function markerClusters(sheet) {
  const carriers = Array.isArray(sheet.carrier_layout) ? sheet.carrier_layout : [];
  const sequence = sheet.color_sequence || [];
  const base = mostCommonColor(sequence);
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
      direction: carrierDirection(marker.carrier_no, sheet.machineProfile)
    });
  }
  return clusters;
}

function markerClusterStarts(sheet) {
  return markerClusters(sheet).map((cluster) => cluster.start);
}

function tracerClusterColors(sheet) {
  return markerClusters(sheet).map((cluster) => cluster.colors.join("+"));
}

function carrierDirection(carrierNo, machineProfile = null) {
  const groups = machineProfile?.carrierGroups || {};
  if ((groups.clockwise || groups.trackA || []).includes(carrierNo)) return "clockwise";
  if ((groups.counterClockwise || groups.trackB || []).includes(carrierNo)) return "counterClockwise";
  return carrierNo % 2 === 1 ? "clockwise" : "counterClockwise";
}

function isTwillWalk(walkType) {
  const value = String(walkType || "").toLowerCase();
  return value.includes("2_over_2") || value.includes("two-over-two") || value.includes("2 üst") || value.includes("twill");
}

function mostCommonColor(colors = []) {
  const counts = new Map();
  for (const color of colors) counts.set(color, (counts.get(color) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || colors[0];
}

function renderMainRopeSvg(sheet) {
  return `<svg viewBox="0 0 820 160" role="img"><g transform="translate(20 36)">${ropeLines(sheet, 760, 74, false)}<rect width="760" height="74" fill="none" stroke="#111"/></g><line x1="20" y1="135" x2="780" y2="135" stroke="#111"/><text x="20" y="154">0</text><text x="740" y="154">30 cm</text></svg>`;
}

function renderCloseRopeSvg(sheet) {
  return `<svg viewBox="0 0 360 220" role="img"><rect width="360" height="220" fill="#fbfbf8" stroke="#111"/>${ropeLines(sheet, 360, 220, true)}</svg>`;
}

function renderPatternSvg(sheet) {
  return `<svg viewBox="0 0 360 220" role="img"><rect width="360" height="220" fill="#fff" stroke="#111"/>${ropeLines(sheet, 360, 220, false)}<text x="18" y="198">45°</text></svg>`;
}

function renderSpoolSvg(sheet) {
  return `<svg viewBox="0 0 360 220" role="img"><ellipse cx="180" cy="35" rx="130" ry="18" fill="#26323a"/><rect x="70" y="35" width="220" height="150" fill="#eef1ee" stroke="#333"/><g transform="translate(70 35)">${ropeLines(sheet, 220, 150, false)}</g><ellipse cx="180" cy="185" rx="130" ry="18" fill="#26323a"/></svg>`;
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
  const count = Math.min(sheet.carrier_count || 16, 32);
  const steps = Array.isArray(sheet.walkMap?.steps) ? sheet.walkMap.steps.slice(0, 8) : [];
  const base = mostCommonColor(sheet.color_sequence || []);
  const paths = [];
  const grid = [];
  const x0 = 42;
  const y0 = 22;
  const plotW = 286;
  const plotH = 112;
  const stepW = plotW / Math.max(steps.length, 1);

  for (let row = 0; row < count; row += 1) {
    const y = y0 + (row / Math.max(count - 1, 1)) * plotH;
    grid.push(`<line x1="${x0}" y1="${y}" x2="${x0 + plotW}" y2="${y}" stroke="#e0e4e0" stroke-width=".7"/>`);
    if (row % 2 === 0) grid.push(`<text x="18" y="${y + 3}" font-size="7">${row + 1}</text>`);
  }
  for (let stepIndex = 0; stepIndex <= steps.length; stepIndex += 1) {
    const x = x0 + stepIndex * stepW;
    grid.push(`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + plotH}" stroke="#c8d0ca" stroke-width=".7"/>`);
    grid.push(`<text x="${x}" y="16" text-anchor="middle" font-size="7">${stepIndex}</text>`);
  }

  for (const carrier of sheet.carrier_layout || []) {
    let currentPosition = carrier.carrier_no;
    const points = [`${x0},${y0 + ((currentPosition - 1) / Math.max(count - 1, 1)) * plotH}`];
    steps.forEach((step, stepIndex) => {
      const move = step.moves.find((item) => item.carrier_no === carrier.carrier_no);
      currentPosition = move?.to || currentPosition;
      const x = x0 + (stepIndex + 1) * stepW;
      const y = y0 + ((currentPosition - 1) / Math.max(count - 1, 1)) * plotH;
      points.push(`${x},${y}`);
    });
    const isMarker = carrier.color !== base;
    paths.push(`<polyline points="${points.join(" ")}" fill="none" stroke="${colorToHex(carrier.color)}" stroke-width="${isMarker ? 2.4 : 1.1}" opacity="${isMarker ? ".95" : ".44"}"/>`);
    paths.push(`<circle cx="${x0}" cy="${points[0].split(",")[1]}" r="${isMarker ? 3 : 1.8}" fill="${colorToHex(carrier.color)}" stroke="#111" stroke-width=".5"/>`);
  }
  const status = sheet.walkMap?.status || "generic_candidate";
  return `<svg viewBox="0 0 360 180" role="img"><rect width="360" height="180" fill="#fff" stroke="#111"/>${grid.join("")}${paths.join("")}<text x="18" y="148" font-size="9">${sheet.walkMap?.machineProfileId || ""}</text><text x="18" y="161" font-size="9">${sheet.machineProfile.trackModel}</text><text x="18" y="174" font-size="9">${status} - shop ölçümü gerekir</text></svg>`;
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
  clearGeneratedRecipe();
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
  clearGeneratedRecipe();
  generateButton.disabled = true;
  logProcess("Görsel yükleme", "Görsel yüklendi", {
    name: file.name,
    type: file.type,
    size: file.size,
    imageHash: imageHash.slice(0, 16)
  });
  logAnalysis(`Görsel hazır. AI analiz için butona bas: ${imageHash.slice(0, 12)}`);
  render();
});

analyzeButton.addEventListener("click", async () => {
  if (!currentImage) {
    imageStatus.textContent = "Önce görsel seç";
    return;
  }

  analyzeButton.disabled = true;
  analyzeButton.textContent = "Analiz ediliyor...";
  imageStatus.textContent = "Analiz ediliyor";
  logProcess("AI analiz", "Analiz başlatıldı", {
    imageHash: currentImage.imageHash.slice(0, 16),
    fileType: currentImage.file.type,
    forceRefresh: true
  });
  logAnalysis("Görsel base64 hazırlanıyor.");
  try {
    const dataBase64 = await fileToBase64(currentImage.file);
    logProcess("AI analiz", "Görsel base64 hazırlandı", {
      base64Length: dataBase64.length
    });
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
      throw new Error(`${payload.error || "analysis_failed"}${payload.details?.http_status ? ` (${payload.details.http_status})` : ""}`);
    }
    saveCachedAnalysis(payload.analysis);
    state = { ...state, ai_analysis_result: payload.analysis };
    imageStatus.textContent = "Analiz tamamlandı";
    logProcess("AI analiz", "Backend analiz cevabı alındı", {
      cache: payload.cache,
      provider: payload.analysis.provider,
      model: payload.analysis.model,
      durationMs: payload.analysis.duration_ms,
      predictions: payload.analysis.predictions,
      predictorResult: payload.analysis.predictor_result,
      candidateCount: payload.analysis.recipe_candidates?.length || 0
    });
    logAnalysis(`${payload.cache === "refresh" ? "Cache bypass edildi, yeni OpenRouter cevabı alındı" : "OpenRouter cevabı alındı"}: ${payload.analysis.model}`);
    applyAiSuggestionToSelection(payload.analysis);
  } catch (error) {
    imageStatus.textContent = `Hata: ${error.message}`;
    logProcess("AI analiz", "Analiz hata verdi", {
      error: error.message
    }, "error");
    logAnalysis(`Hata: ${error.message}`);
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = "AI ile analiz et";
    render();
  }
});

generateButton.addEventListener("click", () => {
  syncSelectionState();
  logProcess("Reçete üretimi", "Reçete üretimi başlatıldı", {
    finalSelection: state.user_selected_options,
    mismatchBeforeGenerate: buildMismatchReport()
  }, buildMismatchReport().some((item) => item.level === "error") ? "error" : "info");
  state = generateRecipe(state);
  latestRecipePngUrl = "";
  recipeImageOutput.hidden = true;
  recipeImagePreview.hidden = true;
  recipeImagePreview.removeAttribute("src");
  logProcess("Reçete üretimi", "generated_recipe oluşturuldu", {
    recipeId: state.generated_recipe.recipe_id,
    productionReady: state.generated_recipe.production_ready,
    technicalSheet: {
      carrierCount: state.generated_recipe.technical_sheet.carrier_count,
      walkType: state.generated_recipe.technical_sheet.braid_walk_type,
      colorSequence: state.generated_recipe.technical_sheet.color_sequence,
      carrierLayoutCount: state.generated_recipe.technical_sheet.carrier_layout.length
    }
  });
  updateMismatchReport(buildMismatchReport({ recipe: state.generated_recipe }));
  render();
});

selectionForm.addEventListener("change", () => {
  selectedPatternId = patternSelect.value;
  syncSelectionState();
  clearGeneratedRecipe();
  logProcess("Kullanıcı değişikliği", "Final seçim manuel değişti, eski reçete temizlendi", {
    finalSelection: state.user_selected_options,
    mismatch: buildMismatchReport()
  });
  render();
});

patternAlbum.addEventListener("click", (event) => {
  const card = event.target.closest("[data-pattern]");
  if (card) applyPattern(card.dataset.pattern);
});

downloadPngButton.addEventListener("click", async () => {
  if (!state.generated_recipe) return;
  try {
    logProcess("PNG üretimi", "PNG render butonla başlatıldı", {
      recipeId: state.generated_recipe.recipe_id,
      sheetBlocks: recipeSheet.querySelectorAll(".ts-block").length
    });
    if (!latestRecipePngUrl) {
      latestRecipePngUrl = await renderRecipeSheetToPng();
    }
    recipeImagePreview.src = latestRecipePngUrl;
    recipeImageOutput.hidden = false;
    recipeImagePreview.hidden = false;
    const link = document.createElement("a");
    link.download = "braidstudio-recipe-sheet.png";
    link.href = latestRecipePngUrl;
    link.click();
    logProcess("PNG üretimi", "PNG render tamamlandı ve indirildi", {
      bytesApprox: latestRecipePngUrl.length
    });
  } catch (error) {
    logAnalysis(`PNG üretilemedi, SVG indiriliyor: ${error.message}`);
    recipeImageOutput.hidden = true;
    recipeImagePreview.hidden = true;
    recipeImagePreview.removeAttribute("src");
    logProcess("PNG üretimi", "PNG render hata verdi, SVG fallback indiriliyor", {
      error: error.message,
      fallback: "SVG fallback indirilecek"
    }, "error");
    downloadRecipeSvgFallback();
  }
});

printPdfButton.addEventListener("click", () => {
  window.print();
});

renderMachineProfiles();
applyPattern(selectedPatternId);
