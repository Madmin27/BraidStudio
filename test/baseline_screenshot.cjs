const { chromium } = require("playwright-core");
const chromePath = "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome";

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto("http://127.0.0.1:3017/", { waitUntil: "networkidle" });
  await new Promise(r => setTimeout(r, 500));

  const sel = page.locator("#carrierCount");
  if (await sel.isVisible()) await sel.selectOption("8");
  await new Promise(r => setTimeout(r, 200));

  await page.locator("#generateButton").click();
  await new Promise(r => setTimeout(r, 3000));

  const canvas = await page.$("[data-braid-canvas='main']");
  if (canvas) {
    await canvas.screenshot({ path: "/root/sunucu/BraidStudio/public/baseline-colored-first.png" });
    console.log("OK baseline-colored-first.png");
  } else {
    console.log("canvas not found, full page fallback");
    await page.screenshot({ path: "/root/sunucu/BraidStudio/public/baseline-colored-first.png", fullPage: true });
  }
  await browser.close();
})();
