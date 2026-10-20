import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import {chromium} from 'playwright';
import {expect,it} from 'vitest';
import {AdventureBoard} from '../components/AdventureBoard';
import {XPBar} from '../components/XPBar';
import {authoredJourney} from '../../../src/scripts/fixtures/authoredJourney';
import {renderBoardDefinition,BOARD_AUTHORING_INSTRUCTION} from '../../../src/shared/adventureBoardDefinition';
// Human saw the missing fork and label collisions. State logs lacked geometry;
// the old lab exercised fixed slots, not the actual Planner-authored composition.
it.each([{width:1280,height:720},{width:768,height:1024},{width:1470,height:956}])('preserves a visible fork inside the $width×$height canvas',async viewport=>{
 const definition=authoredJourney();
 const landscape=[[0,.5],[.18,.5],[.39,.16],[.61,.16],[.39,.84],[.61,.84],[.82,.5],[1,.5]];
 const portrait=[[.5,0],[.5,.17],[.15,.34],[.15,.56],[.85,.34],[.85,.56],[.5,.78],[.5,1]];
 const labels=['Start','Choose your path','Learn the chunks','Play with words','Play with words','Learn the chunks','Recall checkpoint','Adventure complete'];
 definition.portals.forEach((p,i)=>{p.label=labels[i];p.position={landscape:{x:landscape[i][0],y:landscape[i][1]},portrait:{x:portrait[i][0],y:portrait[i][1]}};});
 const board=renderBoardDefinition(definition,{boardId:'lab-authored',planId:'lab',childId:'synthetic',domain:'spelling',activities:['learn','play','check'].map(id=>({id,verified:true,state:'ready'}))});
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport});
  await page.setContent(`<style>${readFileSync(resolve('src/components/AdventureBoard.css'),'utf8')}body{margin:0}</style>${renderToStaticMarkup(<AdventureBoard board={board}/> )}`);
  const issues=await page.locator('.adventure-board__node').evaluateAll(elements=>{
   const boxes=elements.map(el=>({label:el.getAttribute('aria-label'),rect:el.getBoundingClientRect()}));
   return boxes.flatMap((a,i)=>{
    const errors=[] as string[];
    if(a.rect.left<16||a.rect.top<24||a.rect.right>innerWidth-16||a.rect.bottom>innerHeight-72)errors.push(`${a.label}:clipped`);
    for(const b of boxes.slice(i+1))if(Math.min(a.rect.right,b.rect.right)>Math.max(a.rect.left,b.rect.left)&&Math.min(a.rect.bottom,b.rect.bottom)>Math.max(a.rect.top,b.rect.top))errors.push(`${a.label}:overlap:${b.label}`);
    return errors;
   });
  });
  mkdirSync('/tmp/sunny-authored-board-evidence',{recursive:true});
  await page.screenshot({path:`/tmp/sunny-authored-board-evidence/${viewport.width}x${viewport.height}.png`});
  expect(issues).toEqual([]);
  if(viewport.width===1280||viewport.width===768){
   const area=await page.locator('.adventure-board__composition').boundingBox();
   expect(BOARD_AUTHORING_INSTRUCTION).toContain(`${area!.width}x${area!.height}`);
  }
  await expect(page.getByRole('button',{name:'Choose your path'}).count()).resolves.toBe(1);
  const destination=page.locator('.adventure-board__node-label').filter({hasText:'Adventure complete'});
  expect(await destination.isVisible()).toBe(true);
 } finally {await browser.close();}
},20000);

// Full-host screenshots exposed this: the isolated canvas lab omitted the XP
// control, so node-node checks passed while the host covered Start.
it.each([{width:1280,height:720},{width:768,height:1024}])('keeps authored portals clear of the real level control at $width×$height',async viewport=>{
 const definition=authoredJourney();
 definition.portals[0].position.landscape={x:0,y:0};
 const board=renderBoardDefinition(definition,{boardId:'overlay-lab',planId:'lab',childId:'synthetic',domain:'spelling',activities:[]});
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport});
  await page.setContent(`<style>${readFileSync(resolve('src/components/AdventureBoard.css'),'utf8')}body{margin:0}</style>${renderToStaticMarkup(<><AdventureBoard board={board}/><XPBar level={1} xp={0} xpToNext={100} onOpen={()=>{}}/></>)}`);
  const overlaps=await page.locator('.adventure-board__node').evaluateAll(elements=>{
   const hud=document.querySelector('.level-path-trigger')!.getBoundingClientRect();
   return elements.filter(el=>{const box=el.getBoundingClientRect();return Math.min(box.right,hud.right)>Math.max(box.left,hud.left)&&Math.min(box.bottom,hud.bottom)>Math.max(box.top,hud.top);}).map(el=>el.getAttribute('aria-label'));
  });
  expect(overlaps).toEqual([]);
 }finally{await browser.close();}
},20000);
