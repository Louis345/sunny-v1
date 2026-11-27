import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,type Browser} from 'playwright';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {AdventureBoard} from '../components/AdventureBoard';
import raw from '../storybook/raw-horizontal-adventure-board.json';
import type {AdventureBoardJson} from '../../../src/shared/adventureBoardJson';

// Parent saw Reward Break covering the checkpoint. The old lab checked labels
// against labels, not the complete button, and only used a large desktop viewport.
// I3 (11/08): the 768x1024 case failed in the full web run and passed alone. Each case launched its own Chromium inside
// a 15 s budget while the parallel web run kept every core busy, and the page could reach the network. Now one browser
// is launched once with its own budget, the page cannot leave the machine, and motion is off, so a case measures only
// the layout.
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},60000);
afterAll(async()=>{await browser?.close();});
it.each([{width:1200,height:780},{width:768,height:1024},{width:390,height:844}])('keeps Reward Break clear of the locked checkpoint at $width x $height',async(viewport)=>{
 const board={...raw,boardId:'synthetic-reward-overlap',choiceSets:[],edges:[],nodes:[
  {id:'checkpoint',kind:'activity',label:'Word Radar',slot:'6',state:'locked',activityId:'word-radar'},
  {id:'reward',kind:'mystery',label:'Reward Break',slot:'6.1',state:'available'},
 ]} as unknown as AdventureBoardJson;
 const before=JSON.stringify(board);
 const context=await browser.newContext({viewport,reducedMotion:'reduce'});
 try {
  const page=await context.newPage();
  await page.route('**/*',route=>route.request().url().startsWith('data:')?route.continue():route.abort());
  await page.setContent(`<style>body{margin:0}*,*::before,*::after{animation:none!important;transition:none!important}${readFileSync(resolve('src/components/AdventureBoard.css'),'utf8')}</style>${renderToStaticMarkup(<AdventureBoard board={board}/> )}`);
  expect(await page.locator('.adventure-board').getAttribute('data-board-id')).toBe(board.boardId);
  expect(await page.locator('.adventure-board').getAttribute('data-child-id')).toBe(board.childId);
  const boxes=await page.locator('.adventure-board__node').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
  expect(boxes).toHaveLength(2);
  const [a,b]=boxes;
  const area=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  expect(area).toBe(0);
  for(const box of boxes){expect(box.left).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(viewport.width);expect(box.bottom).toBeLessThanOrEqual(viewport.height);}
  expect(JSON.stringify(board)).toBe(before);
 }finally{await context.close();}
},15000);
