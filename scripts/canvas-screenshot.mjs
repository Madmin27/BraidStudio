import { chromium } from 'playwright-core';
import { writeFileSync } from 'fs';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://127.0.0.1:3017/debug-block-angle.html');
await page.waitForTimeout(500);

const dataUrl = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return c ? c.toDataURL('image/png') : null;
});

if (!dataUrl) {
  console.error('No canvas found');
  process.exit(1);
}

const buf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
writeFileSync('public/debug-block-angle-pass0.png', buf);
console.log('Saved', buf.length, 'bytes');
await browser.close();
