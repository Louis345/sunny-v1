import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../artifacts/wardrobe-certification/acceptance/', import.meta.url);
await mkdir(root,{recursive:true});
const browser = await chromium.launch({headless:true,channel:'chrome'});
const results=[];const logs=[];
try {
 const page=await browser.newPage({viewport:{width:1600,height:1100}});
 page.on('console',m=>logs.push(m.text()));
 page.on('pageerror',e=>logs.push(`PAGE_ERROR ${e.message}`));
 await page.goto('http://127.0.0.1:5197/?wardrobeLab=true&wardrobeCompatibilityLab=true&grokBackground=false');
 await page.getByRole('button',{name:'Review Matilda prepared identity',exact:true}).click();
 const ready=async()=>{await page.waitForFunction(()=>{const p=[...document.querySelectorAll('[data-wardrobe-state]')];return p.length===2&&p.every(e=>e.dataset.wardrobeState==='ready'&&e.dataset.wardrobeRevealed==='true')},{},{timeout:20000}); await page.waitForTimeout(400);};
 for (const [view,pose] of [['front','idle'],['side','idle'],['back','idle'],['face','idle'],['face','blink'],['face','speak'],['face','head-turn'],['front','arms-up'],['front','leg-swing']]) {
  await page.getByLabel('Inspection view',{exact:true}).selectOption(view);
  await page.getByLabel('Inspection movement',{exact:true}).selectOption(pose);
  await ready();
  const file=`matilda-dress-${view}-${pose}.png`;
  await page.screenshot({path:new URL(file,root).pathname,fullPage:true});
  results.push({companion:'matilda',garment:'ribbon-dress',view,pose,capture:file,automated:'rendered',visual:'pending review',walkingEquivalent:false});
 }
 assert.equal(logs.filter(m=>m.startsWith('PAGE_ERROR')).length,0);
 assert.equal(logs.filter(m=>/Material .* is not compatible/.test(m)).length,0);
 console.log(`Captured ${results.length} Matilda dress inspection cases; visual judgment required.`);
} finally {
 await writeFile(new URL('captures.json',root),JSON.stringify(results,null,2)+'\n');
 await writeFile(new URL('browser.log',root),logs.join('\n'));
 await browser.close();
}
