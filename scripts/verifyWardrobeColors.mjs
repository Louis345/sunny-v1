import {chromium} from 'playwright';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const root=new URL('../artifacts/wardrobe-certification/colors/',import.meta.url);await mkdir(root,{recursive:true});const browser=await chromium.launch({headless:true,channel:'chrome'}),captures=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}});await page.goto('http://127.0.0.1:5197/?wardrobeLab=true&wardrobeCompatibilityLab=true&grokBackground=false');
 for(const companion of ['Elli','Matilda']){
  await page.getByRole('button',{name:`Review ${companion} prepared identity`,exact:true}).click();
  for(const color of ['Navy','Plum','Teal','Rose']){
   await page.getByRole('button',{name:`Preview ${color} Ribbon Dress`,exact:true}).click();
   await page.waitForFunction(()=>{const panes=[...document.querySelectorAll('[data-wardrobe-state]')];return panes.length===2&&panes.every(p=>p.dataset.wardrobeState==='ready'&&p.dataset.wardrobeRevealed==='true')},{},{timeout:30000});await page.waitForTimeout(300);
   const file=`${companion.toLowerCase()}-${color.toLowerCase()}.png`;await page.locator('.wardrobe-compatibility-lab__comparison').screenshot({path:new URL(file,root).pathname});captures.push({companion,color,file,automated:'rendered',visual:'pending',humanApproval:null});
  }
 }
 assert.equal(captures.length,8);
}finally{await writeFile(new URL('captures.json',root),JSON.stringify(captures,null,2));await browser.close();}
console.log('All eight current dress palettes rendered; visual review remains separate.');
