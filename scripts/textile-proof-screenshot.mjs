import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const outputDir = process.env.OUTPUT_DIR || "proofs/current-rope";
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3217/";
const requestedBraidAngle = Number(process.env.BRAID_ANGLE || 0);
mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
let geometryReport = null;
page.on("response", async (response) => {
  if (!response.url().endsWith("/api/braid-geometry") || !response.ok()) return;
  const mesh = await response.json();
  geometryReport = {
    geometryModel: mesh.geometryModel,
    crossingDepthModel: mesh.crossingDepthModel,
    crossingDeformationModel: mesh.crossingDeformationModel,
    crossingEdgeTimingModel: mesh.crossingEdgeTimingModel,
    cylindricalSweepModel: mesh.cylindricalSweepModel,
    crossSectionFrameModel: mesh.crossSectionFrameModel,
    crossSectionOrder: mesh.crossSectionOrder,
    carrierPathModel: mesh.carrierPathModel,
    piecesPerCarrier: mesh.piecesPerCarrier,
    surfacePieceCount: mesh.surfacePieceCount,
    minimumCrossingEnvelopeClearance: mesh.minimumCrossingEnvelopeClearance,
    contactWidthConstraint: mesh.contactWidthConstraint,
    minimumContactAreaRetention: mesh.minimumContactAreaRetention,
    ringSegments: mesh.ringSegments
  };
});
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForFunction(
  () => document.querySelector("#statusPill")?.textContent === "Geometri hazır",
  null,
  { timeout: 60000 }
);
if (requestedBraidAngle >= 24 && requestedBraidAngle <= 68) {
  await page.locator("#braidAngle").evaluate((control, value) => {
    control.value = String(value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  }, requestedBraidAngle);
  await page.locator("#generateBraid").click();
  await page.waitForFunction(
    () => document.querySelector("#statusPill")?.textContent === "Geometri hazır",
    null,
    { timeout: 60000 }
  );
}
await page.waitForTimeout(800);

const mount = page.locator("#threeMount");
const normalBuffer = await mount.screenshot({ path: `${outputDir}/normal.png` });
const generatedBuffer = await page.locator("#patternCanvas").screenshot({
  path: `${outputDir}/generated.png`
});

async function measureScreenshot(buffer) {
  return page.evaluate(async (base64) => {
  const source = new Image();
  source.src = `data:image/png;base64,${base64}`;
  await source.decode();
  const sample = document.createElement("canvas");
  sample.width = 160;
  sample.height = 90;
  const context = sample.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  let nonTransparent = 0;
  let dark = 0;
  let bright = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] > 8) nonTransparent += 1;
    const luminance = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
    if (luminance < 80 && pixels[index + 3] > 8) dark += 1;
    if (luminance > 210 && pixels[index + 3] > 8) bright += 1;
  }
    return { nonTransparent, dark, bright, total: sample.width * sample.height };
  }, buffer.toString("base64"));
}

const normalStats = await measureScreenshot(normalBuffer);
const generatedStats = await measureScreenshot(generatedBuffer);
const mountBox = await mount.boundingBox();
await page.screenshot({
  path: `${outputDir}/corner.png`,
  clip: {
    x: mountBox.x + mountBox.width * .03,
    y: mountBox.y + mountBox.height * .34,
    width: mountBox.width * .42,
    height: mountBox.height * .34
  }
});

const box = await mount.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, -4200);
await page.waitForTimeout(500);
const closeBuffer = await mount.screenshot({ path: `${outputDir}/close.png` });
const closeStats = await measureScreenshot(closeBuffer);

await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: "networkidle" });
await page.waitForFunction(
  () => document.querySelector("#statusPill")?.textContent === "Geometri hazır",
  null,
  { timeout: 60000 }
);
await page.waitForTimeout(500);
const mobileBuffer = await page.locator("#threeMount").screenshot({ path: `${outputDir}/mobile.png` });
const mobileStats = await measureScreenshot(mobileBuffer);

const report = {
  generatedAt: new Date().toISOString(),
  sourceUrl: baseUrl,
  braidAngle: requestedBraidAngle || null,
  geometry: geometryReport,
  screenshots: {
    normal: normalStats,
    generated: generatedStats,
    close: closeStats,
    mobile: mobileStats
  },
  accepted: false,
  deployed: !/^https?:\/\/(127\.0\.0\.1|localhost)(?::|\/)/.test(baseUrl),
  acceptanceNote: "User visual acceptance is still required."
};
writeFileSync(`${outputDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
await browser.close();
