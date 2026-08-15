import { chromium } from "playwright-core";

const url = process.env.BRAIDSTUDIO_URL || "http://127.0.0.1:3017/";
const browser = await chromium.launch({ headless: true });
const errors = [];

async function waitForPhoto(page, previousSrc = null) {
  await page.waitForFunction((oldSrc) => {
    const image = document.querySelector("#photoRender");
    const button = document.querySelector("#generateBraid");
    return image && !image.hidden && image.naturalWidth === 1600
      && !button.disabled && (!oldSrc || image.src !== oldSrc);
  }, previousSrc, { timeout: 12 * 60 * 1000 });
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
desktop.on("pageerror", (error) => errors.push(error.message));
desktop.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
await desktop.goto(url, { waitUntil: "domcontentloaded" });
await waitForPhoto(desktop);
const defaults = await desktop.evaluate(() => ({
  filamentCount: document.querySelector("#filamentCountValue")?.textContent,
  denier: document.querySelector("#denierValue")?.textContent,
  status: document.querySelector("#statusPill")?.textContent,
  image: document.querySelector("#photoRender")?.src,
  naturalSize: [
    document.querySelector("#photoRender")?.naturalWidth,
    document.querySelector("#photoRender")?.naturalHeight
  ]
}));
await desktop.locator("#photoRender").dispatchEvent("click");
await desktop.waitForFunction(() => !document.querySelector("#imageModal")?.hidden);
const modalSource = await desktop.locator("#modalImage").getAttribute("src");
await desktop.locator("#closeImageModal").dispatchEvent("click");

const downloadPromise = desktop.waitForEvent("download");
await desktop.locator("#downloadPng").dispatchEvent("click");
const download = await downloadPromise;
const downloadName = download.suggestedFilename();

const previousSrc = defaults.image;
await desktop.locator("#denier").evaluate((input) => {
  input.value = "900";
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
await desktop.locator("#generateBraid").dispatchEvent("click");
await waitForPhoto(desktop, previousSrc);
const changed = await desktop.evaluate(() => ({
  denier: document.querySelector("#denierValue")?.textContent,
  status: document.querySelector("#statusPill")?.textContent,
  image: document.querySelector("#photoRender")?.src
}));

await desktop.close();

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
mobile.on("pageerror", (error) => errors.push(error.message));
await mobile.goto(url, { waitUntil: "domcontentloaded" });
await waitForPhoto(mobile);
const mobileLayout = await mobile.evaluate(() => ({
  viewportWidth: window.innerWidth,
  pageWidth: document.documentElement.scrollWidth,
  imageVisible: !document.querySelector("#photoRender")?.hidden,
  imageWidth: document.querySelector("#photoRender")?.getBoundingClientRect().width
}));
console.log(JSON.stringify({
  url,
  defaults,
  changed,
  modalUsesPhoto: new URL(modalSource, url).href === defaults.image,
  downloadName,
  mobileLayout,
  errors
}, null, 2));

await browser.close();
