const { chromium } = require("playwright-core");
const chromePath = "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome";
const fs = require("fs");

const MODES = ["current", "colored-first", "white-first"];
const LABELS = ["A-current", "B-colored-first", "C-white-first"];

(async () => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox"]
  });

  for (let i = 0; i < MODES.length; i++) {
    const mode = MODES[i];
    const label = LABELS[i];
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    await page.addInitScript(() => {
      window.__PASS0_ONLY__ = true;
    });

    await page.goto("http://127.0.0.1:3017/", { waitUntil: "networkidle" });
    await new Promise(r => setTimeout(r, 500));

    // Set paint order mode
    await page.evaluate((m) => { window.__PAINT_ORDER_MODE__ = m; }, mode);

    const carrierSelect = page.locator("#carrierCount");
    if (await carrierSelect.isVisible()) {
      await carrierSelect.selectOption("8");
      await new Promise(r => setTimeout(r, 200));
    }

    await page.locator("#generateButton").click();
    await new Promise(r => setTimeout(r, 3000));

    // Screenshot
    const mainCanvas = await page.$("[data-braid-canvas='main']");
    if (mainCanvas) {
      await mainCanvas.screenshot({ path: `/root/sunucu/BraidStudio/public/paint-order-${label}.png` });
      console.log(`Saved paint-order-${label}.png`);
    } else {
      // Fallback: full page
      await page.screenshot({ path: `/root/sunucu/BraidStudio/public/paint-order-${label}.png`, fullPage: true });
      console.log(`Saved paint-order-${label}.png (full page)`);
    }

    await page.close();
  }

  await browser.close();
  console.log("All paint order tests done.");
})();
