import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCandidateColorMap } from "./server/lib/candidateColorGenerator.js";
import { loadLibrary } from "./server/lib/libraryLoader.js";
import { validateLibrary } from "./server/lib/libraryValidator.js";
import { solvePattern } from "./server/lib/patternSolver.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const srcDir = join(__dirname, "src");
const dataDir = join(__dirname, "data");
const analysisCacheFile = join(dataDir, "analysis-cache.json");
const analysisPromptVersion = "carrier-layout-v2";

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
  const library = await loadLibrary(__dirname);
  const solverResult = solvePattern({
    visualSignature: predictions.visualSignature || predictions.visual_signature || inferVisualSignature(predictions),
    colors: predictions.colors || [],
    estimatedCarrierCount: predictions.estimatedCarrierCount || predictions.estimated_carrier_count || predictions.carrier_count,
    preferredMachineProfileId: predictions.preferredMachineProfileId || null
  }, library);

  return {
    ...analysis,
    recipe_candidates: solverResult.possibleRecipes,
    recipe_candidate_certainty: solverResult.certainty
  };
}

function jsonResponse(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
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
  const carrierCount = Number(result.carrier_count || result.kukla_sayisi || result.estimated_carrier_count || 0) || null;
  const estimatedCarrierCount = carrierCount || Number(result.estimated_carrier_count || 0) || inferCarrierCount(result, colors);
  const visualSignature = result.visualSignature || result.visual_signature || inferVisualSignature(result);
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
    visualSignature,
    dominantColor: result.dominantColor || result.dominant_color || colors[0] || null,
    accentColors: Array.isArray(result.accentColors) ? result.accentColors : colors.slice(1),
    estimatedCarrierCount,
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    pattern_type: result.pattern_type || result.braid_pattern || "unknown",
    colors,
    material: normalizeUnknown(result.material) || normalizeUnknown(result.estimated_material) || inferMaterial(result, colors),
    estimated_material: normalizeUnknown(result.estimated_material) || inferMaterial(result, colors),
    carrier_count: carrierCount,
    estimated_carrier_count: estimatedCarrierCount,
    estimated_color_sequence: estimatedColorSequence,
    estimated_carrier_layout: estimatedCarrierLayout,
    estimated_layout_basis: result.estimated_layout_basis || "AI estimate plus deterministic fallback; user must confirm machine/shop setup.",
    machine_fit: result.machine_fit || "requires_user_confirmation",
    braid_walk_type: result.braid_walk_type || "unknown",
    sheath: normalizeUnknown(result.sheath) || "braided sheath",
    core: normalizeUnknown(result.core) || "unknown",
    confidence: result.confidence || "low",
    warning: "AI sonucu üretim gerçeği değildir; final reçete kullanıcı seçimiyle üretilir."
  };
}

function normalizeUnknown(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return !text || ["unknown", "null", "n/a"].includes(text.toLowerCase()) ? null : text;
}

function inferCarrierCount(result, colors) {
  const pattern = String(result.pattern_type || result.braid_pattern || "").toLowerCase();
  if (pattern.includes("marker") || pattern.includes("tracer") || colors.length >= 2) return 16;
  return null;
}

function inferVisualSignature(result) {
  const text = `${result.visualSignature || ""} ${result.pattern_type || ""} ${result.braid_pattern || ""}`.toLowerCase();
  if (text.includes("rib") || text.includes("herringbone") || text.includes("twill")) return "diagonal_rib";
  if (text.includes("spiral") || text.includes("tracer") || text.includes("marker") || text.includes("fleck") || text.includes("izli")) return "spiral_tracer";
  if (text.includes("block") || text.includes("stripe")) return "block_stripe";
  if (text.includes("plain") || text.includes("diamond")) return "plain_weave";
  return "unknown";
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

function analysisCacheKey(imageHash) {
  const { openRouterModel } = getRuntimeConfig();
  return `openrouter:${openRouterModel}:${analysisPromptVersion}:${imageHash}`;
}

async function analyzeWithOpenRouter({ imageHash, mimeType, dataBase64 }) {
  const { openRouterApiKey, openRouterModel, appUrl } = getRuntimeConfig();
  if (!openRouterApiKey) {
    throw Object.assign(new Error("missing_openrouter_api_key"), { statusCode: 503 });
  }

  const prompt = [
    "Analyze this braid/rope product image only as a pattern classifier.",
    "Return only compact JSON with keys:",
    "visualSignature, colors, dominantColor, accentColors, estimatedCarrierCount, material, confidence, warnings.",
    "visualSignature must be one of: plain_weave, diagonal_rib, spiral_tracer, block_stripe, unknown.",
    "AI must not output recipeId, walkMap, carrier path or production-ready claims.",
    "If carrier count is uncertain, still provide estimatedCarrierCount as a candidate with low confidence.",
    "For white/blue braided rope with flecks/tracers, polyester is a reasonable material suggestion unless visual evidence says otherwise.",
    "Final recipe is selected later by backend library solver and user confirmation."
  ].join(" ");
  const endpoint = "https://openrouter.ai/api/v1/chat/completions";
  const startedAt = Date.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${openRouterApiKey}`,
      "content-type": "application/json",
      "http-referer": appUrl,
      "x-title": "BraidStudio"
    },
    body: JSON.stringify({
      model: openRouterModel,
      temperature: 0.1,
      response_format: { type: "json_object" },
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
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = payload.error?.message || payload.error || "openrouter_request_failed";
    throw Object.assign(new Error(String(providerMessage)), {
      statusCode: response.status,
      details: {
        provider: "openrouter",
        model: openRouterModel,
        http_status: response.status,
        raw_error: payload
      }
    });
  }

  const text = payload.choices?.[0]?.message?.content || "{}";
  return {
    image_hash: imageHash,
    provider: "openrouter",
    model: openRouterModel,
    prompt_version: analysisPromptVersion,
    analyzed_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    predictions: normalizeAnalysis(extractJson(text)),
    raw_text: text,
    usage: payload.usage || null
  };
}

async function handleAnalyzeImage(req, res) {
  try {
    const body = await readRequestJson(req);
    const imageHash = String(body.imageHash || "");
    const mimeType = String(body.mimeType || "");
    const dataBase64 = String(body.dataBase64 || "");
    const force = Boolean(body.force);
    if (!imageHash || !mimeType.startsWith("image/") || !dataBase64) {
      jsonResponse(res, 400, { error: "invalid_image_payload" });
      return;
    }

    const cache = await readAnalysisCache();
    const cacheKey = analysisCacheKey(imageHash);
    if (!force && cache[cacheKey]) {
      const analysis = await enrichAnalysisWithPatternCandidates(cache[cacheKey]);
      cache[cacheKey] = analysis;
      await writeAnalysisCache(cache);
      jsonResponse(res, 200, { analysis, cache: "hit" });
      return;
    }

    const analysis = await enrichAnalysisWithPatternCandidates(await analyzeWithOpenRouter({ imageHash, mimeType, dataBase64 }));
    cache[cacheKey] = analysis;
    await writeAnalysisCache(cache);
    jsonResponse(res, 200, { analysis, cache: force ? "refresh" : "miss" });
  } catch (error) {
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
