import { chromium } from "playwright-core";
import { writeFile } from "node:fs/promises";

async function savePatternCanvas(page, path) {
  const dataUrl = await page.locator("#patternCanvas").evaluate((canvas) => canvas.toDataURL("image/png"));
  await writeFile(path, Buffer.from(dataUrl.split(",")[1], "base64"));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const targetUrl = process.env.BRAIDSTUDIO_URL || "http://127.0.0.1:3027/";
await page.goto(targetUrl, { waitUntil: "networkidle" });
await page.waitForFunction(() => ["TexGen mesh", "Üretim yüzeyi"].includes(document.querySelector("#statusPill")?.textContent), null, {
  timeout: 90000
});
if (!process.env.TARGET_ONLY) {
  await savePatternCanvas(page, "/tmp/braid-polyester-denier-default.png");
}

const defaults = await page.evaluate(() => ({
  filamentCount: document.querySelector("#filamentCountValue")?.textContent,
  denier: document.querySelector("#denierValue")?.textContent,
  angle: document.querySelector("#angleValue")?.textContent,
  diameter: document.querySelector("#diameterValue")?.textContent,
  carrierCount: document.querySelector("#carrierCount")?.value
}));

await page.locator("#filamentCount").evaluate((input) => {
  input.value = "10";
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.locator("#denier").evaluate((input) => {
  input.value = "500";
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.locator("#braidAngle").evaluate((input) => {
  input.value = "30";
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.locator("#crossingMode").selectOption("regular");
await page.locator("#generateBraid").click();
await page.waitForFunction(() => ["TexGen mesh", "Üretim yüzeyi"].includes(document.querySelector("#statusPill")?.textContent), null, {
  timeout: 90000
});
await savePatternCanvas(page, "/tmp/braid-polyester-denier-10-500-regular.png");

const result = await page.evaluate(() => ({
  status: document.querySelector("#statusPill")?.textContent,
  filamentCount: document.querySelector("#filamentCountValue")?.textContent,
  denier: document.querySelector("#denierValue")?.textContent,
  canvasSize: [document.querySelector("#patternCanvas")?.width, document.querySelector("#patternCanvas")?.height]
}));
console.log(JSON.stringify({ targetUrl, defaults, changed: result }));
await browser.close();
