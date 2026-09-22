import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL || 'http://127.0.0.1:3219/';
const out=process.env.OUTPUT_DIR || 'proofs/release-ui';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();const errors=[];const report={base,errors};
try {
 const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base);await p.waitForFunction(()=>document.querySelector('#statusPill').textContent.includes('hazır'));
 await p.locator('#materialProfile').selectOption('polip_rope');await p.locator('#renderRealistic').click();
 await p.waitForFunction(()=>document.querySelector('#renderStatus').textContent.includes('polyester için'));assert.equal(await p.locator('#renderRealistic').isEnabled(),true);
 await p.locator('#materialProfile').selectOption('polyester_satin');
 if(process.env.RUN_RENDER==='1') {
  await p.evaluate(()=>{for(const [id,v] of [['diameter',16],['braidAngle',45],['filamentCount',25]]) {let el=document.getElementById(id);el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));}});
  await p.locator('#renderRealistic').click();
  await p.waitForFunction(()=>document.querySelector('#renderStatus').textContent.startsWith('Çıktı hazır'),{},{timeout:600000});
  await p.locator('#renderImage').evaluate(im=>im.decode());
  report.image=await p.locator('#renderImage').getAttribute('src');report.recipe=await p.locator('#renderRecipe').textContent();
 }
 await p.locator('.render-card').scrollIntoViewIfNeeded();await p.screenshot({path:`${out}/desktop.png`});
 await p.setViewportSize({width:390,height:844});await p.locator('.render-card').scrollIntoViewIfNeeded();
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await p.screenshot({path:`${out}/mobile.png`});
 assert.deepEqual(errors,[]);report.status='passed';writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
}finally{await browser.close();}
