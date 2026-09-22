import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, readdir, writeFile, rm, access } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(rootDir, "public");
const materialDir = join(rootDir, "data", "materials");
const geometryScript = join(rootDir, "scripts", "braid_geometry.py");
const runtimeAuditDir = join(rootDir, "audit");
const runtimeAuditFile = join(runtimeAuditDir, "runtime-files.jsonl");
const port = Number(process.env.PORT || 3017);
const host = process.env.HOST || "127.0.0.1";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function inRange(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validateMaterialProfile(profile, source) {
  if (!/^[a-z0-9_]+$/.test(profile?.materialProfileId || "")) {
    throw new Error(`invalid_material_profile_id:${source}`);
  }
  if (!profile.displayName || !inRange(profile.denierScale, .4, 1.2)) {
    throw new Error(`invalid_material_profile:${source}`);
  }
  for (const key of ["roughness", "sheen", "sheenRoughness", "specularIntensity", "anisotropy"]) {
    if (!inRange(profile.optics?.[key], 0, 1)) {
      throw new Error(`invalid_material_optics:${source}:${key}`);
    }
  }
  return profile;
}

async function loadMaterialProfiles() {
  const files = (await readdir(materialDir)).filter((file) => file.endsWith(".json")).sort();
  const profiles = await Promise.all(files.map(async (file) => {
    const profile = JSON.parse(await readFile(join(materialDir, file), "utf8"));
    return validateMaterialProfile(profile, file);
  }));
  if (new Set(profiles.map((profile) => profile.materialProfileId)).size !== profiles.length) {
    throw new Error("duplicate_material_profile_id");
  }
  if (!profiles.some((profile) => profile.materialProfileId === "polyester_satin")) {
    throw new Error("polyester_satin_profile_missing");
  }
  return profiles;
}

async function auditRuntime(event) {
  try {
    await mkdir(runtimeAuditDir, { recursive: true });
    await appendFile(runtimeAuditFile, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
  } catch (error) {
    console.error("runtime_audit_failed", error.message);
  }
}

function jsonResponse(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function readRequestJson(req, limitBytes = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) {
      throw Object.assign(new Error("payload_too_large"), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("invalid_json"), { statusCode: 400 });
  }
}

function normalizeGeometryPayload(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('invalid_recipe'),{statusCode:400});
  const carrierCount = Number(body.carrierCount ?? 16);
  if (!Number.isInteger(carrierCount) || carrierCount < 8 || carrierCount > 48 || carrierCount % 2) {
    throw Object.assign(new Error("carrier_count_must_be_even"), { statusCode: 400 });
  }
  for (const key of ['visibleRows','diameterMm','braidAngle','strandWidthScale','filamentCount','denier']) {
    if (body[key] !== undefined && !Number.isFinite(Number(body[key]))) {
      throw Object.assign(new Error('invalid_numeric_parameter'), {statusCode:400});
    }
  }
  const validHex = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
  return {
    mode: body.mode === "crossing" ? "crossing" : "rope",
    visibleRows: Math.max(8, Math.min(30, Number(body.visibleRows || 30))),
    baseColor: validHex(body.baseColor, "#59ee78"),
    carrierCount,
    diameterMm: Math.max(4, Math.min(80, Number(body.diameterMm || 16))),
    braidAngle: Math.max(24, Math.min(68, Number(body.braidAngle || 34))),
    strandWidthScale: Math.max(.75, Math.min(2.2, Number(body.strandWidthScale || 1))),
    filamentCount: Math.max(8, Math.min(40, Number(body.filamentCount || 25))),
    denier: Math.max(300, Math.min(3000, Number(body.denier || 1000))),
    materialProfileId: /^[a-z0-9_]+$/.test(String(body.materialProfileId || ""))
      ? String(body.materialProfileId)
      : "polyester_satin",
    crossingMode: ["diamond", "regular", "hercules"].includes(body.crossingMode)
      ? body.crossingMode
      : "diamond",
    flip: Boolean(body.flip),
    carriers: Array.from({ length: carrierCount }, (_, index) => {
      const carrier = Array.isArray(body.carriers) ? body.carriers[index] : null;
      return {
        no: index + 1,
        color: validHex(carrier?.color, "#59ee78")
      };
    })
  };
}

function runBraidGeometry(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [geometryScript], {
      cwd: rootDir,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(Object.assign(new Error("geometry_timeout"), { statusCode: 504 })));
    }, 20000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 18 * 1024 * 1024) {
        child.kill("SIGKILL");
        finish(() => reject(Object.assign(new Error("geometry_output_too_large"), { statusCode: 413 })));
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => finish(() => {
      if (code !== 0) {
        reject(Object.assign(new Error("geometry_failed"), {
          statusCode: 500,
          details: stderr.slice(0, 1000)
        }));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(Object.assign(new Error("geometry_invalid_json"), {
          statusCode: 500,
          details: stdout.slice(0, 1000)
        }));
      }
    }));
    child.stdin.end(JSON.stringify(payload));
  });
}

async function recipeAndMaterial(body) {
  const payload = normalizeGeometryPayload(body);
  const materialProfiles = await loadMaterialProfiles();
  const materialProfile = materialProfiles.find(p => p.materialProfileId === payload.materialProfileId)
    || materialProfiles.find(p => p.materialProfileId === 'polyester_satin');
  payload.materialProfileId = materialProfile.materialProfileId;
  payload.denierScale = materialProfile.denierScale;
  return {payload, materialProfile};
}

async function handleBraidGeometry(req, res) {
  const startedAt = Date.now();
  try {
    const {payload, materialProfile} = await recipeAndMaterial(await readRequestJson(req));
    const mesh = await runBraidGeometry(payload);
    await auditRuntime({
      type: "geometry",
      status: "ok",
      mode: payload.mode,
      model: mesh.geometryModel,
      materialProfileId: materialProfile.materialProfileId,
      carrierCount: mesh.carrierCount,
      durationMs: Date.now() - startedAt,
      files: ["server.js", "scripts/braid_geometry.py", `data/materials/${materialProfile.materialProfileId}.json`]
    });
    jsonResponse(res, 200, { ...mesh, materialProfile, productionGeometry: true });
  } catch (error) {
    await auditRuntime({
      type: "geometry",
      status: "error",
      durationMs: Date.now() - startedAt,
      error: error.message || "braid_geometry_failed",
      files: ["server.js", "scripts/braid_geometry.py"]
    });
    jsonResponse(res, error.statusCode || 500, {
      error: error.message || "braid_geometry_failed",
      details: error.details || null
    });
  }
}

function publicAssetPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  const relativePath = normalize(pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
  if (relativePath.startsWith("..")) return null;
  return join(publicDir, relativePath);
}


const renderJobs = new Map();
let activeRender = null;
const renderDir = join(rootDir, '.render-cache');
await rm(renderDir,{recursive:true,force:true});
const blender = process.env.BLENDER_BIN || '/root/.cache/braid-render/blender-4.0.2-linux-x64/blender';
async function performRender(job, request) {
  let child;
  try {
    await mkdir(job.dir, {recursive:true, mode:0o700});
    await writeFile(join(job.dir, 'request.json'), JSON.stringify(request));
    await new Promise((resolve,reject) => {
      child = spawn(blender, ['-b','-t','12','--python',join(rootDir,'scripts/render_braid.py'),'--',join(job.dir,'request.json'),job.dir], {cwd:rootDir, stdio:['ignore','pipe','pipe']});
      let errorText = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('render_timeout')); }, 600000);
      child.stdout.on('data', () => {});
      child.stderr.on('data', chunk => { errorText = (errorText + chunk).slice(-4000); });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('render_failed:'+errorText)); });
    });
    job.report = JSON.parse(await readFile(join(job.dir,'report.json'),'utf8'));
    await access(join(job.dir,'rope.png')); await access(join(job.dir,'close.png'));
    job.status='complete';
  } catch(error) {
    job.status='failed'; job.error=error.message.startsWith('render_timeout') ? 'İşlem süre sınırını aştı.' : 'Görüntü oluşturulamadı.';
    await auditRuntime({type:'render', status:'error', error:error.message});
  } finally { activeRender=null; }
}
async function handleRender(req,res) {
  try {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname === '/api/renders' && req.method === 'POST') {
      if (activeRender) return jsonResponse(res,429,{error:'Sunucuda bir görüntü hesaplanıyor. Tamamlandığında yeniden deneyin.'});
      // Acquire before the first await: two simultaneous clients must not launch two workers.
      activeRender='starting';
      try {
        const {payload,materialProfile} = await recipeAndMaterial(await readRequestJson(req));
        if (payload.materialProfileId !== 'polyester_satin') throw Object.assign(new Error('Gerçekçi çıktı şu anda polyester için kullanılabilir.'),{statusCode:400});
        payload.mode='rope';
        await access(blender);
        // Bound storage and memory; old results are temporary.
        for (const [id,old] of renderJobs) {
          if (Date.now()-old.created>6*3600000 || renderJobs.size>=16) {
            await rm(old.dir,{recursive:true,force:true}); renderJobs.delete(id);
          }
        }
        const id=randomUUID(); const job={id,status:'rendering',created:Date.now(),recipe:payload,dir:join(renderDir,id)};
        renderJobs.set(id,job); activeRender=id;
        void performRender(job,{recipe:payload,material:materialProfile});
        return jsonResponse(res,202,{id,status:job.status,recipe:payload});
      } catch(error) {activeRender=null; throw error;}
    }
    const match=url.pathname.match(/^\/api\/renders\/([a-f0-9-]{36})(?:\/(rope\.png|close\.png))?$/);
    const job=match && renderJobs.get(match[1]);
    if (!job) return jsonResponse(res,404,{error:'Çıktı bulunamadı; yeniden oluşturun.'});
    if(req.method!=='GET') return jsonResponse(res,405,{error:'method_not_allowed'});
    if(match[2]) {
      if(job.status!=='complete') return jsonResponse(res,409,{error:'not_ready'});
      const data=await readFile(join(job.dir,match[2]));
      res.writeHead(200,{'content-type':'image/png','cache-control':'no-store'}); return res.end(data);
    }
    return jsonResponse(res,200,{id:job.id,status:job.status,error:job.error,recipe:job.recipe,report:job.report,
      ...(job.status==='complete'?{image:'/api/renders/'+job.id+'/rope.png',close:'/api/renders/'+job.id+'/close.png'}:{})});
  } catch(error) {jsonResponse(res,error.statusCode||500,{error:error.statusCode?error.message:'Görüntü servisi kullanılamıyor.'});}
}

const server = createServer(async (req, res) => {
  if (req.url?.split('?')[0] === '/api/renders' || req.url?.startsWith('/api/renders/')) {
    await handleRender(req,res); return;
  }
  if (req.url === "/api/braid-geometry" && req.method === "POST") {
    await handleBraidGeometry(req, res);
    return;
  }
  if (req.url?.startsWith("/api/")) {
    jsonResponse(res, 404, { error: "not_found" });
    return;
  }
  if (!req.url || !["GET", "HEAD"].includes(req.method || "")) {
    jsonResponse(res, 405, { error: "method_not_allowed" });
    return;
  }

  try {
    const path = publicAssetPath(req.url);
    if (!path) throw new Error("invalid_asset_path");
    const data = await readFile(path);
    if ([".html", ".js", ".css"].includes(extname(path))) {
      await auditRuntime({ type: "asset", request: req.url, file: path.slice(rootDir.length) });
    }
    res.writeHead(200, {
      "content-type": contentTypes[extname(path)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    try {
      const data = await readFile(join(publicDir, "index.html"));
      res.writeHead(200, {
        "content-type": contentTypes[".html"],
        "cache-control": "no-store"
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      jsonResponse(res, 500, { error: "static_asset_failed" });
    }
  }
});

server.listen(port, host, () => {
  console.log(`BraidStudio listening on http://${host}:${port}`);
});
