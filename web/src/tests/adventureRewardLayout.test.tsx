import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {expect,it} from 'vitest';
import {AdventureBoard} from '../components/AdventureBoard';
import raw from '../storybook/raw-horizontal-adventure-board.json';
import type {AdventureBoardJson} from '../../../src/shared/adventureBoardJson';

// Parent saw Reward Break covering the checkpoint. The old lab checked labels
// against labels, not the complete button, and only used a large desktop viewport.
it.each([{width:1200,height:780},{width:768,height:1024},{width:390,height:844}])('keeps Reward Break clear of the locked checkpoint at $width x $height',async(viewport)=>{
 const board={...raw,boardId:'synthetic-reward-overlap',choiceSets:[],edges:[],nodes:[
  {id:'checkpoint',kind:'activity',label:'Word Radar',slot:'6',state:'locked',activityId:'word-radar'},
  {id:'reward',kind:'mystery',label:'Reward Break',slot:'6.1',state:'available'},
 ]} as unknown as AdventureBoardJson;
 const before=JSON.stringify(board);
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport});
  await page.setContent(`<style>body{margin:0}${readFileSync(resolve('src/components/AdventureBoard.css'),'utf8')}</style>${renderToStaticMarkup(<AdventureBoard board={board}/> )}`);
  expect(await page.locator('.adventure-board').getAttribute('data-board-id')).toBe(board.boardId);
  expect(await page.locator('.adventure-board').getAttribute('data-child-id')).toBe(board.childId);
  const boxes=await page.locator('.adventure-board__node').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
  expect(boxes).toHaveLength(2);
  const [a,b]=boxes;
  const area=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  expect(area).toBe(0);
  for(const box of boxes){expect(box.left).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(viewport.width);expect(box.bottom).toBeLessThanOrEqual(viewport.height);}
  expect(JSON.stringify(board)).toBe(before);
 }finally{await browser.close();}
},15000);
