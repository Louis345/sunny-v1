import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../artifacts/wardrobe-certification/',import.meta.url);
const browser=await chromium.launch({headless:true,channel:'chrome'});
const logs=[];
try {
 const page=await browser.newPage({viewport:{width:1600,height:1100}});
 page.on('console',m=>logs.push(m.text()));
 await page.addInitScript(()=>{
  window.wardrobeFrameAudit={frames:0,violations:[]};
  window.wardrobeExpected={companion:'elli',variant:'sleeveless-dress',accessory:'none'};
  document.addEventListener('click',event=>{
   const label=event.target.closest('button')?.getAttribute('aria-label')??'';
   if(label.startsWith('Review '))window.wardrobeExpected.companion=label.split(' ')[1].toLowerCase();
   if(label==='Preview Teal Ribbon Dress')window.wardrobeExpected.variant='teal-ribbon-dress';
  });
  document.addEventListener('change',event=>{if(event.target.getAttribute('aria-label')==='Inspection accessory')window.wardrobeExpected.accessory=event.target.value;});
  const tick=()=>{const a=window.wardrobeFrameAudit;if(a.frames++>=1800)return;
   for(const e of document.querySelectorAll('[data-wardrobe-state]'))if(e.dataset.wardrobeRevealed==='true'){
    const k=JSON.parse(e.dataset.wardrobeSelection),expected=window.wardrobeExpected;
    if(e.dataset.wardrobeState!=='ready'||k[0]!==expected.companion||(k[3]!=='none'&&(k[4]?.id!==expected.variant||k[5]!==expected.accessory)))a.violations.push(e.dataset.wardrobeSelection);
   }
   requestAnimationFrame(tick);
  };requestAnimationFrame(tick);
 });
 let release;const gate=new Promise(resolve=>{release=resolve});
 await page.route('**/__wardrobe-assets/**',async route=>{await gate;await route.continue().catch(e=>logs.push(`Expected cancelled route: ${e.message}`));});
 let markElliRequested;const elliRequested=new Promise(resolve=>{markElliRequested=resolve});
 let releaseElli;const elliGate=new Promise(resolve=>{releaseElli=resolve});
 await page.route('**/elli-wardrobe-*.vrm',async route=>{markElliRequested();await elliGate;await route.continue().catch(e=>logs.push(`Expected cancelled Elli route: ${e.message}`));});
 await page.goto('http://127.0.0.1:5197/?wardrobeLab=true&wardrobeCompatibilityLab=true&grokBackground=false');
 let requestTimer;try {await Promise.race([elliRequested,new Promise((_,reject)=>{requestTimer=setTimeout(()=>reject(new Error('Elli delayed request never started')),15000)})]);} finally {clearTimeout(requestTimer);}
 await page.getByRole('button',{name:'Review Matilda prepared identity',exact:true}).click();
 await page.waitForTimeout(500);
 const dressed=page.locator('[data-wardrobe-selection*="matilda-wardrobe-"]');
 assert.equal(await dressed.count(),1,'The pending dressed pane must exist');
 assert.equal(await dressed.getAttribute('data-wardrobe-revealed'),'false','Pending dress must stay hidden');
 release();
 const ready=async()=>page.waitForFunction(()=>{const p=[...document.querySelectorAll('[data-wardrobe-state]')];return p.length===2&&p.every(e=>e.dataset.wardrobeState==='ready'&&e.dataset.wardrobeRevealed==='true')},{},{timeout:25000});
 await ready();
 const oldResponse=page.waitForResponse(response=>response.url().includes('/elli-wardrobe-'),{timeout:15000});
 releaseElli(); // The older Elli request completes after Matilda is already visible.
 const completed=await oldResponse;assert.equal(completed.status(),200);await completed.finished();
 await page.waitForTimeout(700);
 assert.ok((await page.locator('[data-wardrobe-revealed="true"]').evaluateAll(es=>es.map(e=>e.dataset.wardrobeSelection))).every(k=>JSON.parse(k)[0]==='matilda'));
 await page.getByRole('button',{name:'Review Elli prepared identity',exact:true}).click();await ready();
 await page.route('**/matilda-wardrobe-*.vrm',route=>route.abort('failed'));
 await page.getByRole('button',{name:'Review Matilda prepared identity',exact:true}).click();
 await page.getByText('Matilda preview unavailable',{exact:true}).waitFor({timeout:25000});
 assert.equal(await page.locator('[data-wardrobe-state="failed"][data-wardrobe-revealed="false"]').count(),1);
 await page.screenshot({path:new URL('switch-failure.png',root).pathname});
 await page.unroute('**/matilda-wardrobe-*.vrm');
 await page.getByRole('button',{name:'Review Elli prepared identity',exact:true}).click();await ready();
 for (const accessory of ['crown','cat-ears','none']) {
  await page.getByLabel('Inspection accessory',{exact:true}).selectOption(accessory);await ready();
 }
 await page.getByRole('button',{name:'Preview Teal Ribbon Dress',exact:true}).click();await ready();
 const audit=await page.evaluate(()=>window.wardrobeFrameAudit);
 assert.equal(audit.violations.length,0);
 assert.ok(audit.frames>0&&audit.frames<1800,'Frame sampler must cover the run without exhausting its bound');
 await writeFile(new URL('switching-result.json',root),JSON.stringify({status:'passed',...audit,checks:['slow archive stays hidden','switch discards previous companion','failed current model hidden with explicit unavailable state','accessory changes and removal','dress variant replacement','source pane with no replacement outfit']},null,2));
 console.log('Wardrobe browser switching checks passed.');
} finally {await writeFile(new URL('switching-browser.log',root),logs.join('\n'));await browser.close();}
