import {chromium} from 'playwright';import {mkdir,writeFile} from 'node:fs/promises';
const root=new URL(process.env.WARDROBE_FAMILY_EVIDENCE_DIR ?? '../artifacts/wardrobe-certification/garment-families/',import.meta.url);await mkdir(root,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});const logs=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}});page.on('console',m=>logs.push(m.text()));
 await page.goto('http://127.0.0.1:5197/?wardrobeLab=true&wardrobeCompatibilityLab=true&grokBackground=false');
 for(const companion of ['Matilda','Elli']){
  await page.getByRole('button',{name:`Review ${companion} prepared identity`,exact:true}).click();
  for(const family of ['Comet Hoodie','Constellation Blazer']){
   await page.getByRole('button',{name:`Preview ${family}`,exact:true}).click();
   for(const [view,pose] of [['front','idle'],['side','idle'],['back','idle'],['front','arms-up']]){
    await page.getByLabel('Inspection view',{exact:true}).selectOption(view);await page.getByLabel('Inspection movement',{exact:true}).selectOption(pose);
    await page.waitForFunction(()=>{const p=[...document.querySelectorAll('[data-wardrobe-state]')];return p.length===2&&p.every(e=>['ready','failed'].includes(e.dataset.wardrobeState))},{},{timeout:25000});
    await page.waitForTimeout(400);const file=`${companion.toLowerCase()}-${family.toLowerCase().replaceAll(' ','-')}-${view}-${pose}.png`;
    await page.screenshot({path:new URL(file,root).pathname});results.push({companion,family,view,pose,file,states:await page.locator('[data-wardrobe-state]').evaluateAll(es=>es.map(e=>e.dataset.wardrobeState))});
   }
  }
 }
}finally{await writeFile(new URL('captures.json',root),JSON.stringify(results,null,2));await writeFile(new URL('browser.log',root),logs.join('\n'));await browser.close();}
console.log(`Captured ${results.length} candidate family views; visual review required.`);
