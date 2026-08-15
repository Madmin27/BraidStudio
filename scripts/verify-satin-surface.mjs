import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(process.env.BRAIDSTUDIO_URL || "http://127.0.0.1:3027/", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelector("#statusPill")?.textContent === "Üretim yüzeyi", null, { timeout: 30000 });
await page.locator("#patternCanvas").screenshot({ path: "/tmp/braid-satin-default.png" });
const defaultCanvas = await page.locator("#patternCanvas").evaluate((canvas) => canvas.toDataURL("image/png"));
writeFileSync("/tmp/braid-satin-default-full.png", Buffer.from(defaultCanvas.split(",")[1], "base64"));
await page.locator("#threeMount").screenshot({ path: "/tmp/braid-satin-3d.png" });

if (process.env.BRAIDSTUDIO_ONLY_DEFAULT === "1") {
  console.log(JSON.stringify(await page.evaluate(() => ({
    status: document.querySelector("#statusPill")?.textContent,
    meta: document.querySelector("#sceneMeta")?.textContent
  }))));
  await browser.close();
  process.exit(0);
}

for (const [selector, value] of [["#filamentCount", "12"]]) {
  await page.locator(selector).evaluate((input, next) => {
    input.value = next;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}
await page.locator("#generateBraid").click();
await page.waitForFunction(() => document.querySelector("#statusPill")?.textContent === "Üretim yüzeyi", null, { timeout: 30000 });
await page.locator("#patternCanvas").screenshot({ path: "/tmp/braid-satin-12-filaments.png" });

for (const [selector, value] of [["#filamentCount", "30"], ["#denier", "500"]]) {
  await page.locator(selector).evaluate((input, next) => {
    input.value = next;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}
await page.locator("#generateBraid").click();
await page.waitForFunction(() => document.querySelector("#statusPill")?.textContent === "Üretim yüzeyi", null, { timeout: 30000 });
await page.locator("#patternCanvas").screenshot({ path: "/tmp/braid-satin-500-denier.png" });

for (const [selector, value] of [["#diameter", "24"], ["#braidAngle", "48"], ["#filamentCount", "18"], ["#denier", "800"]]) {
  await page.locator(selector).evaluate((input, next) => {
    input.value = next;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}
await page.locator("#generateBraid").click();
await page.waitForFunction(() => document.querySelector("#statusPill")?.textContent === "Üretim yüzeyi", null, { timeout: 30000 });
await page.locator("#patternCanvas").screenshot({ path: "/tmp/braid-satin-24mm-48deg.png" });
console.log(JSON.stringify(await page.evaluate(() => ({
  status: document.querySelector("#statusPill")?.textContent,
  meta: document.querySelector("#sceneMeta")?.textContent,
  diameter: document.querySelector("#diameterValue")?.textContent,
  angle: document.querySelector("#angleValue")?.textContent,
  filamentCount: document.querySelector("#filamentCountValue")?.textContent,
  denier: document.querySelector("#denierValue")?.textContent
}))));
await browser.close();
