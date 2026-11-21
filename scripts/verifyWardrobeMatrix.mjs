import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../artifacts/wardrobe-certification/current-matrix/',import.meta.url);await mkdir(root,{recursive:true});
const versions={bodies:JSON.parse(await readFile(new URL('../web/src/lib/wardrobePrepared.generated.json',import.meta.url),'utf8')),fits:JSON.parse(await readFile(new URL('../web/src/lib/wardrobeFitted.generated.json',import.meta.url),'utf8')),assets:JSON.parse(await readFile(new URL('../web/src/lib/wardrobeAssetVersions.generated.json',import.meta.url),'utf8'))};
const browser=await chromium.launch({headless:true,channel:'chrome'}),captures=[],logs=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}});page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>logs.push(`PAGE_ERROR ${e.message}`));
 await page.goto('http://127.0.0.1:5197/?wardrobeLab=true&wardrobeCompatibilityLab=true&grokBackground=false');
 for(const companion of ['Matilda','Elli']){
  await page.getByRole('button',{name:`Review ${companion} prepared identity`,exact:true}).click();
  for(const [family,label] of [['sleeveless-dress','Navy Ribbon Dress'],['comet-hoodie','Comet Hoodie'],['constellation-blazer','Constellation Blazer']]){
   await page.getByRole('button',{name:`Preview ${label}`,exact:true}).click();
   const cases=process.env.WARDROBE_MATRIX_SCOPE==='accessories'?[]:[...['front','side','back','face'].map(view=>[view,'idle','none']),...['blink','speak','head-turn'].map(pose=>['face',pose,'none']),...['arms-up','elbows-bent','leg-swing'].map(pose=>['front',pose,'none'])];
   for(const accessory of ['crown','cat-ears','halo'])for(const [view,pose] of [['face','idle'],['side','idle'],['face','head-turn'],['front','arms-up']])cases.push([view,pose,accessory]);
   for(const [view,pose,accessory] of cases){
    await page.getByLabel('Inspection view',{exact:true}).selectOption(view);await page.getByLabel('Inspection movement',{exact:true}).selectOption(pose);await page.getByLabel('Inspection accessory',{exact:true}).selectOption(accessory);
    await page.waitForFunction(()=>{const panes=[...document.querySelectorAll('[data-wardrobe-state]')];return panes.length===2&&panes.every(p=>['ready','failed'].includes(p.dataset.wardrobeState))},{},{timeout:30000});
    await page.waitForTimeout(500);
    const file=`${companion.toLowerCase()}-${family}-${accessory}-${view}-${pose}.png`;
    await page.locator('.wardrobe-compatibility-lab__comparison').screenshot({path:new URL(file,root).pathname});
    const states=await page.locator('[data-wardrobe-state]').evaluateAll(es=>es.map(e=>({state:e.dataset.wardrobeState,revealed:e.dataset.wardrobeRevealed,selection:e.dataset.wardrobeSelection})));
    captures.push({companion:companion.toLowerCase(),family,view,pose,accessory,file,states,visual:'pending',humanApproval:null});
   }
   console.log(`Captured ${companion} ${family}, including each accessory; visual review pending.`);
  }
 }
 assert.equal(logs.filter(l=>l.startsWith('PAGE_ERROR')).length,0);
 assert.ok(captures.every(c=>c.states.every(s=>s.state==='ready'&&s.revealed==='true')),'Every matrix case must render before visual review');
}finally{await writeFile(new URL('captures.json',root),JSON.stringify({versions,captures},null,2));await writeFile(new URL('browser.log',root),logs.join('\n'));await browser.close();}
