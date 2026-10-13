import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildSync} from 'esbuild';
import {chromium} from 'playwright';
import {renderBoardDefinition,type AdventureBoardDefinition} from '../shared/adventureBoardDefinition';

export type BoardCanvasProof={definitionHash:string;rendererHash:string;viewports:string[];screenshots:string[];verifiedAt:string};
export const boardDefinitionHash=(definition:AdventureBoardDefinition)=>createHash('sha256').update(JSON.stringify(definition)).digest('hex');
const viewports=[{width:1280,height:720},{width:768,height:1024},{width:1470,height:956}];

/** Required authored artwork is a publication dependency, never a replacement theme. */
export function verifyBoardArtworkReady(input:{definition:AdventureBoardDefinition;rootDir:string}):void {
 const background=input.definition.theme.background;
 if(background.type!=='image')return;
 if(!background.value.startsWith('/') || background.value.startsWith('//'))return; // Remote/data images are checked by rendered acceptance, not local IO.
 const publicRoot=path.resolve(input.rootDir,'web/public');
 const file=path.resolve(publicRoot,decodeURIComponent(new URL(background.value,'http://sunny.local').pathname).replace(/^\//,''));
 if( !file.startsWith(`${publicRoot}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size===0)throw new Error(`board_artwork_not_ready:${background.value}`);
 console.log(` 🎮 [board-canvas] [required-artwork] [present] ${background.value}`);
}

/** Existing generation verifies the actual shared canvas before making a board visible.
 * No model, topology repair, or educational policy lives here. A failed composition
 * returns precise geometry to the existing recoverable generation job.
 */
export async function verifyAuthoredBoardCanvas(input:{definition:AdventureBoardDefinition;directory:string;rootDir:string}):Promise<BoardCanvasProof>{
 const sourceRoot=path.resolve(__dirname,'../..');
 const css=fs.readFileSync(path.join(sourceRoot,'web/src/components/AdventureBoard.css'),'utf8');
 const rendererHash=createHash('sha256').update(fs.readFileSync(__filename)).update(css).update(fs.readFileSync(path.join(sourceRoot,'web/src/components/AdventureBoard.tsx'))).update(fs.readFileSync(path.join(sourceRoot,'src/shared/adventureBoardDefinition.ts'))).update(fs.readFileSync(path.join(sourceRoot,'web/src/components/XPBar.tsx'))).digest('hex');
 const definitionHash=boardDefinitionHash(input.definition);
 const receipt=path.join(input.directory,'canvas-proof.json');
 if(fs.existsSync(receipt)){
  const prior=JSON.parse(fs.readFileSync(receipt,'utf8')) as BoardCanvasProof;
  if(prior.definitionHash===definitionHash&&prior.rendererHash===rendererHash&&prior.screenshots.every(file=>fs.existsSync(file))&&viewports.every(v=>prior.viewports.includes(`${v.width}x${v.height}`)))return prior;
 }
 const renderBundle=buildSync({stdin:{contents:`import React from 'react';import{renderToStaticMarkup}from'react-dom/server';import{AdventureBoard}from'./src/components/AdventureBoard';import{XPBar}from'./src/components/XPBar';export const render=board=>renderToStaticMarkup(React.createElement(React.Fragment,null,React.createElement(AdventureBoard,{board}),React.createElement(XPBar,{level:1,xp:0,xpToNext:100,onOpen:()=>{}})));`,resolveDir:path.join(sourceRoot,'web')},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'}});
 fs.mkdirSync(input.directory,{recursive:true});
 const moduleFile=path.join(input.directory,`canvas-render-${rendererHash.slice(0,12)}.cjs`);
 fs.writeFileSync(moduleFile,renderBundle.outputFiles[0]!.text);
 const render=(require(moduleFile) as {render:(board:ReturnType<typeof renderBoardDefinition>)=>string}).render;
 const board=renderBoardDefinition(input.definition,{boardId:'candidate',planId:'candidate',childId:'canvas-verification',domain:'generic',activities:[...new Set(input.definition.portals.flatMap(p=>p.activityNodeId?[p.activityNodeId]:[]))].map(id=>({id,verified:true,state:'ready'}))});
 const browser=await chromium.launch({headless:true});
 const screenshots:string[]=[];const defects:string[]=[];
 try{
  for(const viewport of viewports){
   const page=await browser.newPage({viewport});
   await page.route('**/*',route=>route.abort()); // Geometry verification has no provider or network side effects.
   await page.setContent(`<style>${css}body{margin:0}</style>${render(board)}`,{waitUntil:'domcontentloaded'});
   const issues=await page.locator('[data-portal-id]').evaluateAll((elements, viewport)=>{
    const levelControl=elements[0]!.ownerDocument.querySelector('.level-path-trigger')!.getBoundingClientRect();
    const composition=elements[0]!.ownerDocument.querySelector('.adventure-board__composition')!.getBoundingClientRect();
    const boxes=elements.map(element=>({id:element.getAttribute('data-portal-id'),box:element.getBoundingClientRect(),label:element.querySelector('.adventure-board__node-label')?.getBoundingClientRect()}));
    return boxes.flatMap((a,index)=>{
     const errors:string[]=[];
     if(a.box.left<8||a.box.top<8||a.box.right>viewport.width-8||a.box.bottom>viewport.height-72)errors.push(`${a.id}:clipped_or_control_rail_overlap`);
     if(!a.label?.height)errors.push(`${a.id}:hidden_label`);
     if(Math.min(a.box.right,levelControl.right)>Math.max(a.box.left,levelControl.left)&&Math.min(a.box.bottom,levelControl.bottom)>Math.max(a.box.top,levelControl.top))errors.push(`${a.id}:overlaps:level-control`);
     for(const b of boxes.slice(index+1))if(Math.min(a.box.right,b.box.right)>Math.max(a.box.left,b.box.left)&&Math.min(a.box.bottom,b.box.bottom)>Math.max(a.box.top,b.box.top)){
      // Return measured execution limits in the author's coordinate units. The
      // author chooses which portal to move; runtime never changes composition.
      const currentX=Math.abs((a.box.left+a.box.width/2)-(b.box.left+b.box.width/2))/composition.width;
      const currentY=Math.abs((a.box.top+a.box.height/2)-(b.box.top+b.box.height/2))/composition.height;
      const requiredX=((a.box.width+b.box.width)/2+8)/composition.width;
      const requiredY=((a.box.height+b.box.height)/2+8)/composition.height;
      errors.push(`${a.id}:overlaps:${b.id}:normalized_center_separation current_x=${currentX.toFixed(4)} current_y=${currentY.toFixed(4)} required_x=${requiredX.toFixed(4)} OR required_y=${requiredY.toFixed(4)} (change authored x or y separation to meet either minimum)`);
     }
     return errors;
    });
   },viewport);
   const backgroundValid=await page.evaluate(background=>background.type==='image' || (globalThis as unknown as {CSS:{supports:(property:string,value:string)=>boolean}}).CSS.supports('background',background.value),input.definition.theme.background);
   if(!backgroundValid)issues.push('background_css_invalid:theme.background.value must be executable CSS (gradient uses linear-gradient/radial-gradient, not a symbolic theme name)');
   const size=`${viewport.width}x${viewport.height}`;
   defects.push(...issues.map(issue=>`${size}:${issue}`));
   const screenshot=path.join(input.directory,`canvas-${size}.png`);await page.screenshot({path:screenshot});screenshots.push(screenshot);
   await page.close();
  }
 }finally{await browser.close();}
 if(defects.length){fs.writeFileSync(path.join(input.directory,'canvas-defects.json'),JSON.stringify({definitionHash,defects},null,2));throw new Error(`board_canvas_invalid:${JSON.stringify(defects)}`);}
 const proof={definitionHash,rendererHash,viewports:viewports.map(v=>`${v.width}x${v.height}`),screenshots,verifiedAt:new Date().toISOString()};
 fs.writeFileSync(receipt,JSON.stringify(proof,null,2));
 console.log(` 🎮 [board-canvas] [verified] [${definitionHash.slice(0,12)}] viewports=${proof.viewports.join(',')}`);
 return proof;
}

/** Persist renderer proof independently of the immutable authored definition. */
export async function verifyPreparingBoardCanvas(input:{rootDir:string;childId:string;homeworkId:string;directory:string}):Promise<void>{
 const {getLearningCycle,transitionLearningCycle}=await import('./learningCycleRepository');
 const cycle=getLearningCycle(input.childId,input.homeworkId,{rootDir:input.rootDir});
 const board=cycle?.boards?.find(candidate=>candidate.publishedAt===null);
 if(!board?.definition)return;
 verifyBoardArtworkReady({...input,definition:board.definition});
 const proof=await verifyAuthoredBoardCanvas({...input,definition:board.definition});
 const latest=getLearningCycle(input.childId,input.homeworkId,{rootDir:input.rootDir})!;
 if(JSON.stringify(latest.canvasVerifications?.[board.boardId])===JSON.stringify(proof))return;
 transitionLearningCycle(input.childId,input.homeworkId,latest.revision,{type:'board_canvas_verified',boardId:board.boardId,proof},{rootDir:input.rootDir});
}
