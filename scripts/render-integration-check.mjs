import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
const base=process.env.BASE_URL || 'http://127.0.0.1:3219';
const out=process.env.OUTPUT_DIR || 'proofs/release-render'; mkdirSync(out,{recursive:true});
const call=async (path,body)=>{const r=await fetch(base+path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
for(const body of [null,{carrierCount:15},{diameterMm:'NaN'},{materialProfileId:'polip_rope'}]) {
 const r=await call('/api/renders',body);assert.equal(r.status,400,JSON.stringify(r));
}
const recipe={carrierCount:16,diameterMm:16,braidAngle:45,filamentCount:25,denier:1000,materialProfileId:'polyester_satin',carriers:Array.from({length:16},(_,i)=>({color:i===0?'#bb0615':'#f6f5ee'}))};
const simultaneous=await Promise.all([call('/api/renders',recipe),call('/api/renders',recipe)]);
assert.deepEqual(simultaneous.map(r=>r.status).sort(),[202,429]);
let job=simultaneous.find(r=>r.status===202).data;assert.equal(job.recipe.denierScale,1);
const id=job.id;
assert.equal((await call(`/api/renders/${id}/rope.png`)).status,409);
const start=Date.now();
while(job.status==='rendering' && Date.now()-start<600000) {await new Promise(r=>setTimeout(r,2500)); job=(await call(`/api/renders/${id}`)).data;}
assert.equal(job.status,'complete',JSON.stringify(job));
assert.equal(job.report.carrierCount,16); assert.deepEqual(job.report.directions,{S:8,Z:8});
assert.equal(job.report.denoising,true);assert.deepEqual(job.report.recipe,job.recipe);
for(const [key,file] of [['image','rope.png'],['close','close.png']]) {const r=await fetch(base+job[key]);assert.equal(r.status,200);const b=Buffer.from(await r.arrayBuffer());assert.equal(b.subarray(1,4).toString(),'PNG');writeFileSync(`${out}/${file}`,b);}
writeFileSync(`${out}/report.json`,JSON.stringify(job,null,2));console.log(JSON.stringify({status:'passed',id,seconds:(Date.now()-start)/1000}));
