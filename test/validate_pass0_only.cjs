const { chromium } = require("playwright-core");
const chromePath = "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome";

(async () => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox"]
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // PASS 0 ONLY: hard-disable PASS 1/2 via init script (source code also has them hard-commented-out)
  await page.addInitScript(() => {
    window.__PASS0_ONLY__ = true;
  });

  await page.goto("http://127.0.0.1:3017/", { waitUntil: "networkidle" });
  await new Promise(r => setTimeout(r, 500));

  // Verify the flag
  const flagCheck = await page.evaluate(() => window.__PASS0_ONLY__);
  console.log("__PASS0_ONLY__ flag:", flagCheck);

  const carrierSelect = page.locator("#carrierCount");
  if (await carrierSelect.isVisible()) {
    await carrierSelect.selectOption("8");
    await new Promise(r => setTimeout(r, 200));
  }

  await page.locator("#generateButton").click();
  await new Promise(r => setTimeout(r, 3000));

  const result = await page.evaluate(() => {
    const mainCanvas = document.querySelector("[data-braid-canvas='main']");
    if (!mainCanvas) return { error: "No main canvas" };
    const ctx = mainCanvas.getContext("2d");
    const w = mainCanvas.width, h = mainCanvas.height;
    const cellW = w / 34;
    const cellH = h / 8;

    let crowns = [];
    try {
      if (window.__BRAID_CROWNS__ && Array.isArray(window.__BRAID_CROWNS__)) {
        crowns = window.__BRAID_CROWNS__;
      }
    } catch(e) {}

    const lum = (r,g,b) => (r*299 + g*587 + b*114) / 1000;
    const results = [];

    const inset = 0.06;
    const ribbonFrac = 1 - 2*inset;
    const sampleInset = 0.12;
    const s = inset + ribbonFrac * sampleInset;
    const s2 = inset + ribbonFrac * (1 - sampleInset);

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 34; col++) {
        const crown = crowns.find(c => c.row === row && c.col === col);
        if (!crown) continue;

        const cx = col * cellW;
        const cy = row * cellH;

        let s1x, s1y, s2x, s2y;
        if (crown.direction === "clockwise") {
          s1x = cx + cellW * s;     s1y = cy + cellH * s;
          s2x = cx + cellW * s2;    s2y = cy + cellH * s2;
        } else {
          s1x = cx + cellW * s2;    s1y = cy + cellH * s;
          s2x = cx + cellW * s;     s2y = cy + cellH * s2;
        }

        const p1 = ctx.getImageData(Math.round(s1x), Math.round(s1y), 1, 1).data;
        const p2 = ctx.getImageData(Math.round(s2x), Math.round(s2y), 1, 1).data;
        const p1L = lum(p1[0],p1[1],p1[2]);
        const p2L = lum(p2[0],p2[1],p2[2]);
        const diff = p1L - p2L;

        const threshold = 5;
        let pass;
        if (Math.abs(diff) > threshold) {
          pass = diff > 0 ? "✓" : "✗";
        } else {
          pass = "~";
        }

        results.push({
          rc: `${row},${col}`,
          dir: crown.direction === "clockwise" ? "cw\\" : "ccw/",
          color: crown.topColor,
          p1: "#"+[p1[0],p1[1],p1[2]].map(v=>v.toString(16).padStart(2,"0")).join(""),
          p2: "#"+[p2[0],p2[1],p2[2]].map(v=>v.toString(16).padStart(2,"0")).join(""),
          diff: Math.round(diff),
          pass
        });
      }
    }

    const total = results.length;
    const passed = results.filter(r => r.pass === "✓").length;
    const failed = results.filter(r => r.pass === "✗").length;
    const flat = results.filter(r => r.pass === "~").length;

    const byColor = {};
    for (const r of results) {
      if (!byColor[r.color]) byColor[r.color] = { total:0, pass:0, fail:0, flat:0 };
      byColor[r.color].total++;
      if (r.pass === "✓") byColor[r.color].pass++;
      else if (r.pass === "✗") byColor[r.color].fail++;
      else byColor[r.color].flat++;
    }

    return {
      total, passed, failed, flat,
      accuracy: (passed/total*100).toFixed(1) + "%",
      byColor,
      failSamples: results.filter(r => r.pass === "✗").slice(0, 20),
      passSamples: results.filter(r => r.pass === "✓").slice(0, 10),
      flatSamples: results.filter(r => r.pass === "~").slice(0, 10)
    };
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});
