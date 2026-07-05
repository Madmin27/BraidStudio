const { chromium } = require("playwright-core");
const chromePath = "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome";

const MODES = [
  { mode: "current", label: "A-current" },
  { mode: "mild",    label: "B-112" },
  { mode: "strong",  label: "C-116" },
];

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ["--no-sandbox"] });

  for (const { mode, label } of MODES) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript(() => { window.__PASS0_ONLY__ = true; });
    await page.goto("http://127.0.0.1:3017/", { waitUntil: "networkidle" });
    await new Promise(r => setTimeout(r, 500));

    await page.evaluate((m) => { window.__COLORED_OVERLAP_MODE__ = m; }, mode);

    const carrierSelect = page.locator("#carrierCount");
    if (await carrierSelect.isVisible()) await carrierSelect.selectOption("8");
    await new Promise(r => setTimeout(r, 200));

    await page.locator("#generateButton").click();
    await new Promise(r => setTimeout(r, 3000));

    const canvas = await page.$("[data-braid-canvas='main']");
    if (canvas) {
      await canvas.screenshot({ path: `/root/sunucu/BraidStudio/public/colored-overlap-${label}.png` });
      console.log(`Saved colored-overlap-${label}.png`);
    } else {
      await page.screenshot({ path: `/root/sunucu/BraidStudio/public/colored-overlap-${label}.png`, fullPage: true });
      console.log(`Saved colored-overlap-${label}.png (full page)`);
    }

    await page.close();
  }

  await browser.close();
  console.log("Colored overlap A/B/C test done.");
})();
