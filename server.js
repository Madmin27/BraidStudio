import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCandidateColorMap } from "./server/lib/candidateColorGenerator.js";
import { loadLibrary } from "./server/lib/libraryLoader.js";
import { validateLibrary } from "./server/lib/libraryValidator.js";
import { solvePattern } from "./server/lib/patternSolver.js";
import { predictVisualSignature } from "./src/utils/braidPredictor.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const srcDir = join(__dirname, "src");
const dataDir = join(__dirname, "data");
const analysisCacheFile = join(dataDir, "analysis-cache.json");
const analysisPromptVersion = "hybrid-v1";

loadEnvFile(join(__dirname, ".env"));

const port = Number(process.env.PORT || 3017);
const host = process.env.HOST || "127.0.0.1";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function loadEnvFile(path) {
  const values = parseEnvFile(path);
  for (const [key, value] of Object.entries(values)) {
    if (value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    values[key.trim()] = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

function getRuntimeConfig() {
  const fileEnv = parseEnvFile(join(__dirname, ".env"));
  return {
    openRouterApiKey: fileEnv.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || fileEnv.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "",
    openRouterModel: fileEnv.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL || fileEnv.GEMINI_MODEL || process.env.GEMINI_MODEL || "google/gemini-2.5-flash",
    openRouterModel2: fileEnv.OPENROUTER_MODEL2 || process.env.OPENROUTER_MODEL2 || "deepseek/deepseek-r1",
    appUrl: fileEnv.PUBLIC_APP_URL || process.env.PUBLIC_APP_URL || "https://braidstudio.minen.com.tr"
  };
}

function assetPath(urlPath) {
  const cleanPath = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  if (cleanPath.startsWith("/src/")) {
    return join(srcDir, cleanPath.slice("/src/".length));
  }
  const requested = cleanPath === "/" ? "/index.html" : cleanPath;
  return join(publicDir, requested);
}

async function readRequestJson(req, limitBytes = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) {
      throw Object.assign(new Error("payload_too_large"), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function readAnalysisCache() {
  try {
    return JSON.parse(await readFile(analysisCacheFile, "utf8"));
  } catch {
    return {};
  }
}

async function writeAnalysisCache(cache) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(analysisCacheFile, JSON.stringify(cache, null, 2));
}

async function enrichAnalysisWithPatternCandidates(analysis) {
  const predictions = analysis?.predictions || {};
  const fingerprint = predictions.fingerprint || {};
  const structuralAnalysis = fingerprint.structuralAnalysis || predictions.structuralAnalysis || {};
  const library = await loadLibrary(__dirname);
  const estimatedCarrierCount = structuralAnalysis.carrierCount || predictions.estimatedCarrierCount || predictions.estimated_carrier_count || predictions.carrier_count;
  const predictorMachineProfile = library.machines.find((machine) => machine.carrierCount === Number(estimatedCarrierCount)) || null;
  const predictorCarrierColorMap = buildPredictorCarrierColorMap(predictions, Number(estimatedCarrierCount || 0));
  const predictorResult = predictVisualSignature(
    predictorCarrierColorMap,
    structuralAnalysis.braidLogic || predictions.braid_walk_type || "1_over_1",
    {
      carrierCount: Number(estimatedCarrierCount || 0),
      machineProfile: predictorMachineProfile
    }
  );
  const solverResult = solvePattern({
    predictedSignature: predictorResult.visualSignature || fingerprint.predictedSignature || predictions.predictedSignature,
    visualSignature: predictorResult.visualSignature || predictions.visualSignature || predictions.visual_signature || inferVisualSignature(predictions),
    colors: predictions.colors || [],
    estimatedCarrierCount,
    preferredMachineProfileId: predictions.preferredMachineProfileId || null
  }, library);

  return {
    ...analysis,
    predictions: {
      ...predictions,
      braid_walk_type: structuralAnalysis.braidLogic || predictions.braid_walk_type,
      predictor_result: predictorResult,
      visualSignature: predictorResult.visualSignature || predictions.visualSignature,
      predictedSignature: predictorResult.visualSignature || predictions.predictedSignature
    },
    predictor_result: predictorResult,
    recipe_candidates: solverResult.possibleRecipes,
    recipe_candidate_certainty: solverResult.certainty
  };
}

function buildPredictorCarrierColorMap(predictions, carrierCount) {
  const layout = Array.isArray(predictions.estimated_carrier_layout) ? predictions.estimated_carrier_layout : [];
  if (layout.length === carrierCount) {
    return Object.fromEntries(layout.map((carrier, index) => [
      String(carrier.carrier_no || index + 1),
      carrier.color || "white"
    ]));
  }

  const colors = Array.isArray(predictions.colors) && predictions.colors.length ? predictions.colors : ["white"];
  const base = colors[0] || "white";
  const accents = colors.slice(1);
  const yellow = accents.find((color) => String(color).toLowerCase().includes("yellow") || String(color).toLowerCase().includes("sarı"));
  const black = accents.find((color) => String(color).toLowerCase().includes("black") || String(color).toLowerCase().includes("siyah"));
  const cluster = yellow && black
    ? [black, yellow, black]
    : accents.length >= 2
      ? [accents[1], accents[0], accents[1]]
      : accents;
  const starts = carrierCount === 16 ? [1, 9] : carrierCount === 24 ? [1, 9, 17] : [1];
  const map = Object.fromEntries(Array.from({ length: carrierCount }, (_, index) => [String(index + 1), base]));

  for (const start of starts) {
    cluster.forEach((color, index) => {
      const carrierNo = ((start + index - 1) % carrierCount) + 1;
      map[String(carrierNo)] = color;
    });
  }

  return map;
}

function jsonResponse(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function extractJson(text) {
  const withoutThink = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const withoutFence = withoutThink.replace(/```json|```/gi, "").trim();
  const fenced = withoutFence.match(/\{[\s\S]*\}/);
  const raw = fenced ? fenced[0] : withoutFence;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeAnalysis(parsed) {
  const result = parsed && typeof parsed === "object" ? parsed : {};
  const colors = Array.isArray(result.colors) ? result.colors : [];
  const sourceFingerprint = result.fingerprint && typeof result.fingerprint === "object" ? result.fingerprint : result;
  const structuralAnalysis = normalizeStructuralAnalysis(sourceFingerprint.structuralAnalysis || result.structuralAnalysis || {}, result, colors);
  const predictedSignature = sourceFingerprint.predictedSignature || result.predictedSignature || result.visualSignature || result.visual_signature || inferVisualSignature(result);
  const visualSignature = predictedSignature;
  const carrierCount = Number(result.carrier_count || result.kukla_sayisi || result.estimated_carrier_count || sourceFingerprint.estimatedCarrierCount || structuralAnalysis.carrierCount || 0) || null;
  const estimatedCarrierCount = carrierCount || Number(result.estimated_carrier_count || result.estimatedCarrierCount || 0) || inferCarrierCount(result, colors);
  const confidenceScore = normalizeConfidenceScore(sourceFingerprint.confidenceScore ?? result.confidenceScore ?? result.confidence);
  const estimatedColorSequence = Array.isArray(result.estimated_color_sequence)
    ? result.estimated_color_sequence
    : buildEstimatedColorSequence(colors, estimatedCarrierCount);
  const estimatedCarrierLayout = Array.isArray(result.estimated_carrier_layout)
    ? result.estimated_carrier_layout
    : estimatedColorSequence.map((color, index) => ({
      carrier_no: index + 1,
      color,
      role: color === colors[1] ? "marker/tracer" : "base"
    }));

  return {
    fingerprint: {
      predictedSignature,
      confidenceScore,
      structuralAnalysis
    },
    predictedSignature,
    confidenceScore,
    structuralAnalysis,
    visualSignature,
    dominantColor: result.dominantColor || result.dominant_color || colors[0] || null,
    accentColors: Array.isArray(result.accentColors) ? result.accentColors : colors.slice(1),
    estimatedCarrierCount,
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    pattern_type: result.pattern_type || result.braid_pattern || patternTypeFromSignature(predictedSignature),
    colors,
    material: normalizeUnknown(result.material) || normalizeUnknown(result.estimated_material) || inferMaterial(result, colors),
    estimated_material: normalizeUnknown(result.estimated_material) || inferMaterial(result, colors),
    carrier_count: carrierCount,
    estimated_carrier_count: estimatedCarrierCount,
    estimated_color_sequence: estimatedColorSequence,
    estimated_carrier_layout: estimatedCarrierLayout,
    estimated_layout_basis: result.estimated_layout_basis || "AI estimate plus deterministic fallback; user must confirm machine/shop setup.",
    machine_fit: result.machine_fit || "requires_user_confirmation",
    braid_walk_type: result.braid_walk_type || structuralAnalysis.braidLogic || "unknown",
    sheath: normalizeUnknown(result.sheath) || "braided sheath",
    core: normalizeUnknown(result.core) || "unknown",
    confidence: result.confidence || confidenceLabel(confidenceScore),
    warning: "AI sonucu üretim gerçeği değildir; final reçete kullanıcı seçimiyle üretilir."
  };
}

function normalizeStructuralAnalysis(structuralAnalysis, result, colors) {
  const carrierCount = Number(
    structuralAnalysis.carrierCount ||
    result.estimatedCarrierCount ||
    result.estimated_carrier_count ||
    result.carrier_count ||
    0
  ) || inferCarrierCount(result, colors);

  return {
    carrierCount,
    symmetry: structuralAnalysis.symmetry || inferSymmetry(result),
    primaryApplication: structuralAnalysis.primaryApplication || result.primaryApplication || "unknown",
    braidLogic: structuralAnalysis.braidLogic || result.braidLogic || inferBraidLogic(result, colors)
  };
}

function normalizeConfidenceScore(value) {
  if (typeof value === "number") return Math.max(0, Math.min(1, value));
  const text = String(value || "").toLowerCase();
  if (text === "high") return 0.85;
  if (text === "medium") return 0.6;
  if (text === "low") return 0.35;
  const number = Number(text);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0.35;
}

function normalizeUnknown(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return !text || ["unknown", "null", "n/a"].includes(text.toLowerCase()) ? null : text;
}

function inferCarrierCount(result, colors) {
  const sequenceCount = Array.isArray(result.estimated_color_sequence) ? result.estimated_color_sequence.length : 0;
  const layoutCount = Array.isArray(result.estimated_carrier_layout) ? result.estimated_carrier_layout.length : 0;
  const inferred = sequenceCount || layoutCount;
  if ([8, 12, 16, 24, 32].includes(inferred)) return inferred;
  return null;
}

function inferVisualSignature(result) {
  const text = `${result.predictedSignature || ""} ${result.visualSignature || ""} ${result.pattern_type || ""} ${result.braid_pattern || ""}`.toLowerCase();
  if (text.includes("dual") && text.includes("spiral")) return "dual_counter_spiral";
  if (text.includes("rib") || text.includes("herringbone") || text.includes("twill")) return "diagonal_rib";
  if (text.includes("spiral") || text.includes("tracer") || text.includes("marker") || text.includes("fleck") || text.includes("izli")) return "spiral_tracer";
  if (text.includes("block") || text.includes("stripe")) return "block_stripe";
  if (text.includes("plain") || text.includes("diamond")) return "plain_weave";
  return "unknown";
}

function inferSymmetry(result) {
  const signature = inferVisualSignature(result);
  if (signature === "dual_counter_spiral") return "bilateral_periodic";
  if (signature === "single_spiral_tracer" || signature === "spiral_tracer") return "rotational_periodic";
  if (signature === "plain_weave") return "alternating_periodic";
  return "unknown";
}

function inferBraidLogic(result, colors) {
  const signature = inferVisualSignature(result);
  const colorSet = new Set(colors.map((color) => String(color).toLowerCase()));
  if (signature.includes("tracer") && colorSet.has("yellow") && colorSet.has("black")) return "2_over_2";
  if (signature.includes("rib") || signature.includes("twill")) return "2_over_2";
  return "1_over_1";
}

function patternTypeFromSignature(signature) {
  const value = String(signature || "").toLowerCase();
  if (value.includes("dual_counter_spiral") || value.includes("spiral_tracer")) return "solid_with_markers";
  if (value.includes("diagonal_rib")) return "herringbone";
  if (value.includes("block")) return "ladder";
  if (value.includes("plain")) return "plain";
  return "unknown";
}

function confidenceLabel(score) {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function inferMaterial(result, colors) {
  const text = `${result.pattern_type || ""} ${result.sheath || ""} ${colors.join(" ")}`.toLowerCase();
  if (text.includes("white") || text.includes("blue") || text.includes("fleck") || text.includes("marker")) {
    return "polyester";
  }
  return "polyester";
}

function buildEstimatedColorSequence(colors, carrierCount) {
  if (!carrierCount) return [];
  const base = colors[0] || "white";
  const marker = colors[1] || colors[0] || "blue";
  return Array.from({ length: carrierCount }, (_, index) => {
    const carrierNo = index + 1;
    return carrierNo % 4 === 0 ? marker : base;
  });
}

function analysisCacheKey(imageHash, imageContext = {}) {
  const { openRouterModel, openRouterModel2 } = getRuntimeConfig();
  return `openrouter:${openRouterModel}:${openRouterModel2}:${analysisPromptVersion}:${imageHash}:${contextCacheKey(imageContext)}`;
}

function contextCacheKey(imageContext = {}) {
  const normalized = normalizeImageContext(imageContext);
  const serialized = JSON.stringify(normalized);
  return Buffer.from(serialized).toString("base64url").slice(0, 48);
}

function logAnalysisServer(stage, message, details = {}) {
  console.info("[BraidStudio:analysis]", stage, message, details);
}

async function callOpenRouter({ model, messages, appUrl, openRouterApiKey, temperature = 0.1, responseFormat = null, stage = "openrouter", timeoutMs = 110000 }) {
  const body = {
    model,
    temperature,
    messages
  };
  if (responseFormat) {
    body.response_format = responseFormat;
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  logAnalysisServer(stage, "OpenRouter isteği başladı", { model, timeoutMs });

  let response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${openRouterApiKey}`,
        "content-type": "application/json",
        "http-referer": appUrl,
        "x-title": "BraidStudio"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw Object.assign(new Error(`${stage}_timeout`), {
        statusCode: 504,
        details: { provider: "openrouter", model, timeoutMs }
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = payload.error?.message || payload.error || "openrouter_request_failed";
    throw Object.assign(new Error(String(providerMessage)), {
      statusCode: response.status,
      details: {
        provider: "openrouter",
        model,
        http_status: response.status,
        raw_error: payload
      }
    });
  }

  logAnalysisServer(stage, "OpenRouter cevabı alındı", {
    model,
    durationMs: Date.now() - startedAt,
    promptTokens: payload.usage?.prompt_tokens || null,
    completionTokens: payload.usage?.completion_tokens || null
  });

  return {
    text: payload.choices?.[0]?.message?.content || "",
    usage: payload.usage || null
  };
}

function buildVisualAnalysisPrompt(imageContext = {}) {
  const context = normalizeImageContext(imageContext);
  const contextLines = [
    context.productUse ? `- Kullanıcı ürün/kullanım notu: ${context.productUse}` : "",
    context.knownDiameter ? `- Kullanıcı bilinen çap notu: ${context.knownDiameter}` : "",
    context.expectedCarrierCount ? `- Kullanıcı beklenen kukla ipucu: ${context.expectedCarrierCount}` : "",
    context.markerFlowHint ? `- Kullanıcı marker yönü ipucu: ${context.markerFlowHint}` : "",
    context.whiteStrandCountHint ? `- Kullanıcı beyaz şerit sayımı ipucu: ${context.whiteStrandCountHint}` : "",
    context.notes ? `- Kullanıcı serbest notu: ${context.notes}` : ""
  ].filter(Boolean);

  return [
    "Görevin, yüklenen örgü halat görselini bir tekstil laboratuvarı tarayıcısı gibi objektif olarak incelemek ve aşağıdaki spesifik sorulara sayısal/net cevaplar vermektir.",
    "Kesinlikle bir reçete JSON'u üretme, sadece gözlemlerini raporla.",
    "Kullanıcı ipuçları sadece yardımcı bağlamdır; fotoğrafla çelişirse bunu raporda uyarı olarak belirt.",
    contextLines.length ? "Kullanıcıdan gelen görsel bilgileri:" : "",
    ...contextLines,
    "",
    "Analiz Parametreleri:",
    "1. RENKLER: Halat yüzeyinde baskın zemin rengi haricinde hangi izleyici (marker) renkleri görüyorsun?",
    "2. MARKER YÖNÜ: Renkli izleyici benekleri takip edildiğinde, bu çizgiler birbiriyle kesişip X (baklava/diamond) deseni mi oluşturuyor, yoksa birbirine paralel olarak tek bir yöne (spiral/sarmal) doğru mu akıyor?",
    "3. ŞERİT SAYIMI (KRİTİK): İki paralel marker hattı veya aynı marker'ın bir tur dönüp tekrar aynı hizaya geldiği mesafe arasında kalan bölgede, yan yana dizilmiş kaç adet beyaz iplik şeridi/lif demeti sayabiliyorsun? Örn: 3-4, 7-8, 11-12.",
    "",
    "Çıktı Formatı:",
    "- Detected_Colors: [Renkler]",
    "- Pattern_Flow: [X_Kesişim veya Paralel_Spiral]",
    "- White_Strand_Count_Between_Markers: [Sayı]"
  ].join("\n");
}

function normalizeImageContext(imageContext = {}) {
  const source = imageContext && typeof imageContext === "object" ? imageContext : {};
  return {
    productUse: String(source.productUse || "").trim().slice(0, 160),
    knownDiameter: String(source.knownDiameter || "").trim().slice(0, 80),
    expectedCarrierCount: ["16", "24", "32"].includes(String(source.expectedCarrierCount || "")) ? String(source.expectedCarrierCount) : "",
    markerFlowHint: ["Paralel_Spiral", "X_Kesişim"].includes(String(source.markerFlowHint || "")) ? String(source.markerFlowHint) : "",
    whiteStrandCountHint: String(source.whiteStrandCountHint || "").trim().slice(0, 40),
    notes: String(source.notes || "").trim().slice(0, 240)
  };
}

function buildMathRecipePrompt(visualAnalysisText) {
  return [
    "Sen BraidStudio sisteminin Endüstriyel Tekstil Matematik Çekirdeğisin.",
    "Görevin, sana metin olarak iletilen görsel analiz verilerini alıp, aşağıdaki kesin matematiksel kısıtlamaları uygulayarak hatasız bir Maypole örgü makinesi reçetesi JSON'u üretmektir.",
    "",
    "[MÜHENDİSLİK VE KINEMATİK KISITLAMALARI]",
    "1. KUKLA SAYISI (carrierCount) TESPİTİ:",
    "- Eğer gelen veride White_Strand_Count_Between_Markers değeri 3-5 arasındaysa, carrierCount KESİNLİKLE 16 olmalıdır.",
    "- Eğer 7-9 arasındaysa, carrierCount KESİNLİKLE 24 olmalıdır.",
    "- Eğer 10-13 arasındaysa, carrierCount KESİNLİKLE 32 olmalıdır.",
    "Asla ezbere 16 seçme. Girdi orantısını kullan.",
    "",
    "2. YÖN VE İNDEKS UYUMU (Pattern_Flow):",
    "- Eğer Pattern_Flow Paralel_Spiral ise, renkli olan TÜM kuklalar ya sadece TEK indekslerde (Odd -> Clockwise) ya da sadece ÇİFT indekslerde (Even -> Counter-Clockwise) yer almalıdır. Asla tek/çift karıştırma.",
    "- Eğer Pattern_Flow X_Kesişim ise, renkli kuklalar hem tek hem çift indekslere dengeli dağıtılmalıdır.",
    "",
    "3. TWO-OVER-TWO ÖRGÜ MANTIĞI:",
    "- walkType two-over-two olarak setlenecektir.",
    "- colorSequence dizisinin uzunluğu tam olarak belirlenen carrierCount değerine eşit olmalıdır.",
    "",
    "Girdi Gözlemleri:",
    visualAnalysisText,
    "",
    "Sadece aşağıdaki JSON şablonuna uygun ve başka hiçbir açıklama metni içermeyen temiz JSON çıktısı ver:",
    "{",
    "  \"recipeId\": \"REC-POL-N-SO-DRAFT\",",
    "  \"productionReady\": false,",
    "  \"technicalSheet\": {",
    "    \"carrierCount\": 16,",
    "    \"walkType\": \"two-over-two\",",
    "    \"colorSequence\": [\"white\"],",
    "    \"carrierLayoutCount\": 16",
    "  }",
    "}"
  ].join("\n");
}

async function analyzeWithOpenRouter({ imageHash, mimeType, dataBase64, imageContext = {} }) {
  const { openRouterApiKey, openRouterModel, openRouterModel2, appUrl } = getRuntimeConfig();
  if (!openRouterApiKey) {
    throw Object.assign(new Error("missing_openrouter_api_key"), { statusCode: 503 });
  }

  const startedAt = Date.now();
  const visual = await callOpenRouter({
    model: openRouterModel,
    appUrl,
    openRouterApiKey,
    temperature: 0.05,
    stage: "flash_visual_analysis",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildVisualAnalysisPrompt(imageContext) },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${dataBase64}`
            }
          }
        ]
      }
    ]
  });

  const math = await callOpenRouter({
    model: openRouterModel2,
    appUrl,
    openRouterApiKey,
    temperature: 0.65,
    stage: "r1_math_recipe",
    messages: [
      {
        role: "system",
        content: buildMathRecipePrompt(visual.text)
      }
    ]
  });

  const recipeJson = extractJson(math.text);
  return {
    image_hash: imageHash,
    provider: "openrouter",
    model: `${openRouterModel} -> ${openRouterModel2}`,
    models: {
      visual_analysis: openRouterModel,
      math_recipe: openRouterModel2
    },
    prompt_version: analysisPromptVersion,
    analyzed_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    visual_analysis: {
      model: openRouterModel,
      raw_text: visual.text,
      usage: visual.usage
    },
    math_recipe: {
      model: openRouterModel2,
      raw_text: math.text,
      json: recipeJson,
      usage: math.usage
    },
    predictions: normalizeHybridRecipeAnalysis(recipeJson, visual.text),
    raw_text: math.text,
    usage: combineUsage(visual.usage, math.usage)
  };
}

function combineUsage(...usages) {
  const present = usages.filter(Boolean);
  if (!present.length) return null;
  return present.reduce((total, usage) => ({
    prompt_tokens: Number(total.prompt_tokens || 0) + Number(usage.prompt_tokens || 0),
    completion_tokens: Number(total.completion_tokens || 0) + Number(usage.completion_tokens || 0),
    total_tokens: Number(total.total_tokens || 0) + Number(usage.total_tokens || 0),
    cost: Number(total.cost || 0) + Number(usage.cost || 0)
  }), {});
}

function normalizeHybridRecipeAnalysis(recipe, visualAnalysisText) {
  const technicalSheet = recipe?.technicalSheet || recipe?.technical_sheet || {};
  const carrierCount = normalizeAllowedCarrierCount(technicalSheet.carrierCount || technicalSheet.carrier_count || technicalSheet.carrierLayoutCount || technicalSheet.carrier_layout_count);
  const rawSequence = Array.isArray(technicalSheet.colorSequence)
    ? technicalSheet.colorSequence
    : Array.isArray(technicalSheet.color_sequence)
      ? technicalSheet.color_sequence
      : [];
  const normalizedSequence = normalizeColorSequenceLength(rawSequence, carrierCount);
  const colorSequence = enforceKinematicColorSequence(normalizedSequence, visualAnalysisText);
  const colors = colorsFromSequence(colorSequence);
  const patternFlow = parsePatternFlow(visualAnalysisText);
  const visualSignature = patternFlow === "X_Kesişim" ? "dual_counter_spiral" : "spiral_tracer";
  const estimatedCarrierLayout = colorSequence.map((color, index) => ({
    carrier_no: index + 1,
    color,
    role: color === colors[0] ? "sheath" : "sheath_marker"
  }));

  return normalizeAnalysis({
    fingerprint: {
      predictedSignature: visualSignature,
      confidenceScore: carrierCount ? 0.82 : 0.45,
      structuralAnalysis: {
        carrierCount,
        symmetry: visualSignature === "dual_counter_spiral" ? "bilateral_periodic" : "rotational_periodic",
        primaryApplication: "general_purpose_rope",
        braidLogic: "two-over-two"
      }
    },
    predictedSignature: visualSignature,
    confidenceScore: carrierCount ? 0.82 : 0.45,
    pattern_type: "solid_with_markers",
    colors,
    material: "polyester",
    carrier_count: carrierCount,
    estimated_carrier_count: carrierCount,
    estimated_color_sequence: colorSequence,
    estimated_carrier_layout: estimatedCarrierLayout,
    estimated_layout_basis: "hybrid_flash_visual_analysis_plus_r1_math_recipe",
    braid_walk_type: "two-over-two",
    machine_fit: "requires_user_confirmation",
    sheath: "braided sheath",
    core: "unknown",
    warnings: [
      "AI sonucu üretim gerçeği değildir; final reçete kullanıcı seçimiyle üretilir.",
      "Hybrid pipeline: Flash görsel ölçüm, R1 matematiksel reçete adımı kullanıldı."
    ]
  });
}

function normalizeAllowedCarrierCount(value) {
  const count = Number(value || 0);
  return [16, 24, 32].includes(count) ? count : null;
}

function normalizeColorSequenceLength(sequence, carrierCount) {
  if (!carrierCount) return [];
  const normalized = sequence.map((color) => normalizeColorName(color)).filter(Boolean);
  const base = mostCommonColor(normalized) || "white";
  return Array.from({ length: carrierCount }, (_, index) => normalized[index] || base);
}

function normalizeColorName(color) {
  const text = String(color || "").trim().toLowerCase();
  if (!text) return "";
  if (text === "siyah") return "black";
  if (text === "sarı") return "yellow";
  if (text === "beyaz") return "white";
  if (text === "mavi") return "blue";
  if (text === "kırmızı") return "red";
  return text;
}

function colorsFromSequence(sequence) {
  const base = mostCommonColor(sequence) || sequence[0] || "white";
  const rest = [...new Set(sequence.filter((color) => color && color !== base))];
  return [base, ...rest];
}

function enforceKinematicColorSequence(sequence, visualAnalysisText) {
  const patternFlow = parsePatternFlow(visualAnalysisText);
  if (patternFlow !== "Paralel_Spiral" || sequence.length < 2) return sequence;

  const base = mostCommonColor(sequence) || "white";
  const markers = sequence
    .map((color, index) => ({ color, index }))
    .filter((item) => item.color && item.color !== base);
  const markerParities = new Set(markers.map((item) => item.index % 2));
  if (markerParities.size <= 1) return sequence;

  const rebuilt = Array.from({ length: sequence.length }, () => base);
  const targetParity = 0;
  let slot = 0;
  for (const marker of markers) {
    const index = targetParity + slot * 2;
    if (index >= rebuilt.length) break;
    rebuilt[index] = marker.color;
    slot += 1;
  }
  return rebuilt;
}

function mostCommonColor(colors) {
  const counts = new Map();
  for (const color of colors) {
    if (!color) continue;
    counts.set(color, (counts.get(color) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function parsePatternFlow(text) {
  const value = String(text || "").toLowerCase();
  if (value.includes("x_kesişim") || value.includes("x kesişim") || value.includes("diamond") || value.includes("baklava")) return "X_Kesişim";
  return "Paralel_Spiral";
}

async function legacyAnalyzeWithOpenRouter({ imageHash, mimeType, dataBase64 }) {
  const { openRouterApiKey, openRouterModel, appUrl } = getRuntimeConfig();
  if (!openRouterApiKey) {
    throw Object.assign(new Error("missing_openrouter_api_key"), { statusCode: 503 });
  }

  const prompt = [
    "Analyze this braid/rope product image only as a technical pattern fingerprint classifier.",
    "Return only compact JSON with keys:",
    "predictedSignature, confidenceScore, structuralAnalysis, colors, dominantColor, accentColors, material, warnings.",
    "predictedSignature must be one of: plain_weave, diagonal_rib, single_spiral_tracer, dual_counter_spiral, spiral_tracer, block_stripe, block_striped_segment, unknown.",
    "confidenceScore must be a number between 0 and 1.",
    "structuralAnalysis must contain carrierCount, symmetry, primaryApplication, braidLogic.",
    "carrierCount must be one of 8, 12, 16, 24, 32 only when visible repeat/strand evidence supports it; otherwise use null and add a warning.",
    "Estimate carrierCount from visible braid frequency: if there are about 10 or more base-white strands between adjacent tracer diagonals, prefer 24 or 32 over 16.",
    "For tight rope where strands pass in paired over-under bands, set structuralAnalysis.braidLogic to 2_over_2.",
    "For white rope with adjacent yellow/black tracer blocks, prefer spiral_tracer with braidLogic 2_over_2 unless the visual clearly shows one-over-one.",
    "Do not default carrierCount to 16. Do not guess carrierCount from color count alone.",
    "AI must not output recipeId, walkMap, carrier path or production-ready claims.",
    "If carrier count is uncertain, set structuralAnalysis.carrierCount to null with lower confidence.",
    "For white/blue braided rope with flecks/tracers, polyester is a reasonable material suggestion unless visual evidence says otherwise.",
    "Final recipe is selected later by backend library solver and user confirmation."
  ].join(" ");
  const startedAt = Date.now();
  const result = await callOpenRouter({
    model: openRouterModel,
    appUrl,
    openRouterApiKey,
      temperature: 0.1,
    responseFormat: { type: "json_object" },
    messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${dataBase64}`
              }
            }
          ]
        }
      ]
  });

  return {
    image_hash: imageHash,
    provider: "openrouter",
    model: openRouterModel,
    prompt_version: analysisPromptVersion,
    analyzed_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    predictions: normalizeAnalysis(extractJson(result.text)),
    raw_text: result.text,
    usage: result.usage
  };
}

async function handleAnalyzeImage(req, res) {
  const startedAt = Date.now();
  try {
    const body = await readRequestJson(req);
    const imageHash = String(body.imageHash || "");
    const mimeType = String(body.mimeType || "");
    const dataBase64 = String(body.dataBase64 || "");
    const imageContext = normalizeImageContext(body.imageContext);
    const force = Boolean(body.force);
    if (!imageHash || !mimeType.startsWith("image/") || !dataBase64) {
      jsonResponse(res, 400, { error: "invalid_image_payload" });
      return;
    }
    logAnalysisServer("request", "Analiz isteği alındı", {
      imageHash: imageHash.slice(0, 16),
      mimeType,
      dataBase64Length: dataBase64.length,
      force,
      imageContext
    });

    const cache = await readAnalysisCache();
    const cacheKey = analysisCacheKey(imageHash, imageContext);
    if (!force && cache[cacheKey]) {
      logAnalysisServer("cache", "Analiz cache hit", {
        imageHash: imageHash.slice(0, 16),
        cacheKey
      });
      const analysis = await enrichAnalysisWithPatternCandidates(cache[cacheKey]);
      cache[cacheKey] = analysis;
      await writeAnalysisCache(cache);
      jsonResponse(res, 200, { analysis, cache: "hit" });
      return;
    }

    logAnalysisServer("pipeline", "Hibrit analiz pipeline başladı", {
      imageHash: imageHash.slice(0, 16)
    });
    const analysis = await enrichAnalysisWithPatternCandidates(await analyzeWithOpenRouter({ imageHash, mimeType, dataBase64, imageContext }));
    cache[cacheKey] = analysis;
    await writeAnalysisCache(cache);
    logAnalysisServer("pipeline", "Hibrit analiz pipeline tamamlandı", {
      imageHash: imageHash.slice(0, 16),
      durationMs: Date.now() - startedAt,
      model: analysis.model,
      carrierCount: analysis.predictions?.estimated_carrier_count || analysis.predictions?.carrier_count || null
    });
    jsonResponse(res, 200, { analysis, cache: force ? "refresh" : "miss" });
  } catch (error) {
    logAnalysisServer("error", "Analiz hata verdi", {
      durationMs: Date.now() - startedAt,
      error: error.message || "analysis_failed",
      details: error.details || null
    });
    jsonResponse(res, error.statusCode || 500, {
      error: error.message || "analysis_failed",
      details: error.details || null
    });
  }
}

async function handleLibrary(req, res) {
  try {
    jsonResponse(res, 200, await loadLibrary(__dirname));
  } catch (error) {
    jsonResponse(res, 500, { error: error.message || "library_load_failed" });
  }
}

async function handleLibraryValidate(req, res) {
  try {
    const library = await loadLibrary(__dirname);
    jsonResponse(res, 200, validateLibrary(library));
  } catch (error) {
    jsonResponse(res, 500, { error: error.message || "library_validate_failed" });
  }
}

async function handlePatternSolve(req, res) {
  try {
    const body = await readRequestJson(req, 256 * 1024);
    const library = await loadLibrary(__dirname);
    jsonResponse(res, 200, solvePattern(body, library));
  } catch (error) {
    jsonResponse(res, error.statusCode || 500, { error: error.message || "pattern_solve_failed" });
  }
}

async function handleGenerateColorMap(req, res) {
  try {
    const body = await readRequestJson(req, 256 * 1024);
    jsonResponse(res, 200, generateCandidateColorMap(body));
  } catch (error) {
    jsonResponse(res, error.statusCode || 500, { error: error.message || "color_map_generation_failed" });
  }
}

async function handlePatternPredict(req, res) {
  try {
    const body = await readRequestJson(req, 256 * 1024);
    const library = await loadLibrary(__dirname);
    const machineProfile = body.machineProfileId
      ? library.machines.find((machine) => machine.machineProfileId === body.machineProfileId)
      : null;

    if (body.machineProfileId && !machineProfile) {
      jsonResponse(res, 404, { error: "machine_profile_not_found" });
      return;
    }

    jsonResponse(res, 200, predictVisualSignature(
      body.carrierColorMap || {},
      body.braidLogic || machineProfile?.defaultWalk || "1_over_1",
      {
        carrierCount: body.carrierCount,
        machineProfile: machineProfile || body.machineProfile || null
      }
    ));
  } catch (error) {
    jsonResponse(res, error.statusCode || 500, { error: error.message || "pattern_predict_failed" });
  }
}

const server = createServer(async (req, res) => {
  if (req.url === "/api/library" && req.method === "GET") {
    await handleLibrary(req, res);
    return;
  }

  if (req.url === "/api/library/validate" && req.method === "GET") {
    await handleLibraryValidate(req, res);
    return;
  }

  if (req.url === "/api/analyze-image" && req.method === "POST") {
    await handleAnalyzeImage(req, res);
    return;
  }

  if (req.url === "/api/pattern/solve" && req.method === "POST") {
    await handlePatternSolve(req, res);
    return;
  }

  if (req.url === "/api/pattern/generate-color-map" && req.method === "POST") {
    await handleGenerateColorMap(req, res);
    return;
  }

  if (req.url === "/api/pattern/predict" && req.method === "POST") {
    await handlePatternPredict(req, res);
    return;
  }

  if (req.url?.startsWith("/api/")) {
    jsonResponse(res, 404, { error: "not_found" });
    return;
  }

  if (!req.url || !["GET", "HEAD"].includes(req.method || "")) {
    res.writeHead(405, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  try {
    const path = assetPath(req.url);
    const data = await readFile(path);
    res.writeHead(200, {
      "content-type": contentTypes[extname(path)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    const data = await readFile(join(publicDir, "index.html"));
    res.writeHead(200, {
      "content-type": contentTypes[".html"],
      "cache-control": "no-store"
    });
    res.end(req.method === "HEAD" ? undefined : data);
  }
});

server.listen(port, host, () => {
  console.log(`BraidStudio listening on http://${host}:${port}`);
});
