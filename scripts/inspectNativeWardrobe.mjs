import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const character=process.env.WARDROBE_CHARACTER??'Princess';
const root=`/tmp/sunny-native-${character.toLowerCase()}`;await mkdir(root,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});const results=[];
try{
 const page=await browser.newPage({viewport:{width:1500,height:1100}});
 await page.goto('http://127.0.0.1:5197/?wardrobeLab=true&wardrobeCompatibilityLab=true&wardrobeEngineering=true&grokBackground=false');
 await page.getByRole('button',{name:`Review ${character} prepared identity`,exact:true}).click();
 const outfits=process.env.WARDROBE_OUTFITS?.split(',')??['Navy Ribbon Dress','Comet Hoodie','Constellation Blazer'];
 for(const accessory of process.env.WARDROBE_ACCESSORIES?.split(',')??['none']){
 await page.getByLabel('Inspection accessory',{exact:true}).selectOption(accessory);
 for(const outfit of outfits){
  await page.getByRole('button',{name:`Preview ${outfit}`,exact:true}).click();
  const cases=process.env.WARDROBE_CASES?process.env.WARDROBE_CASES.split(',').map(c=>c.split(':')):process.env.WARDROBE_QUICK?[['front','idle']]:[['front','idle'],['side','idle'],['face','idle'],['face','speak'],['face','head-turn'],['front','arms-up'],['front','elbows-bent']];
  for(const [view,pose] of cases){
   await page.getByLabel('Inspection view',{exact:true}).selectOption(view);await page.getByLabel('Inspection movement',{exact:true}).selectOption(pose);
   await page.waitForFunction(()=>{const p=[...document.querySelectorAll('[data-wardrobe-state]')];return p.length===2&&p.every(e=>['ready','failed'].includes(e.dataset.wardrobeState))},null,{timeout:30000});
   const states=await page.locator('[data-wardrobe-state]').evaluateAll(es=>es.map(e=>e.dataset.wardrobeState));if(states.some(s=>s!=='ready'))throw new Error(`Load failed ${character}/${outfit}: ${states}`);
   await page.waitForTimeout(500);const file=`${outfit.replaceAll(' ','-').toLowerCase()}-${view}-${pose}${accessory==='none'?'':`-${accessory}`}.png`;
   await page.locator('.wardrobe-compatibility-lab__comparison').screenshot({path:`${root}/${file}`});results.push({character,outfit,view,pose,accessory,file,visual:'pending'});console.log(`${root}/${file}`);
  }
 }
 }
}finally{try{await writeFile(`${root}/captures.json`,JSON.stringify(results,null,2));}finally{await browser.close();}}
