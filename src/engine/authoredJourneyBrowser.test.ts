import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildSync} from 'esbuild';
import {chromium} from 'playwright';
import {it,expect} from 'vitest';
import {authoredJourney} from '../scripts/fixtures/authoredJourney';
import {createLearningCycle,getLearningCycle,transitionLearningCycle,projectLearningCycle,canonicalJourneyLaunchable,type CreateLearningCycleInput,type LearningCycleRecordV2} from './learningCycleRepository';
import {publishBoardInstance} from './learningBoardInstances';

// Actual shared React canvas + canonical server interpreter. Activity mechanics,
// voice and academic scoring are covered by the separate full-host acceptance.
it.each(['learn','play'] as const)('executes shared activities in authored %s-first order through the browser',async first=>{
 const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-shared-journey-'));
 const definition=authoredJourney();
 const input:CreateLearningCycleInput={childId:'synthetic',homeworkId:'shared-journey',domain:'math',initialLifecycle:'baseline_ready',
  assignment:{title:'Synthetic',contentFingerprint:'synthetic',capturedEvidenceIds:['lab'],targets:['10']},
  academicTheory:{theoryId:'lab',revision:1,hypothesis:'Synthetic test',supportCriteria:[],reviseCriteria:[],falsifyCriteria:[]},engagementTheory:null,
  nodes:['check','play','learn'].map(nodeId=>({nodeId,role:'baseline',title:nodeId,state:'ready',academicTarget:{domain:'math',skill:'lab',targets:['10']},algorithmOwner:'retrieval-practice',theoryId:'lab',experimentId:'lab',mechanic:'lab',theme:'lab',openingScreen:{title:nodeId,purpose:'Lab'},generationPrompt:null,artifactBinding:{contentId:nodeId,artifactId:nodeId,localArtifactPath:'/lab.html',localArtworkPath:'/lab.svg',contractFingerprint:nodeId,validationStatus:'passed'},artwork:{status:'ready',localPath:null,prompt:null},sfxContract:[],companionContract:{events:[]},evidenceContract:{academic:true,engagement:true,companionObservations:true},evidenceIds:[]}))};
 const board=publishBoardInstance({...input,boards:[]} as unknown as LearningCycleRecordV2,{kind:'teaching',definition,predecessorBoardId:null,plannerDecisionId:'lab',evidenceIds:[],nodeIds:input.nodes.map(n=>n.nodeId),publishedAt:new Date().toISOString()});
 let cycle=createLearningCycle({...input,boards:[board]},{rootDir});
 const launches:string[]=[];
 const project=()=>projectLearningCycle(cycle).adventureBoard;
 const bundle=buildSync({stdin:{resolveDir:path.resolve('web'),contents:`import React from 'react';import{createRoot}from'react-dom/client';import{AdventureBoard}from'./src/components/AdventureBoard';function Host(){const[board,setBoard]=React.useState(null);React.useEffect(()=>{window.project().then(setBoard)},[]);return board&&React.createElement(AdventureBoard,{board,onChoiceClick:option=>window.choose(option.journeyOptionId).then(setBoard),onNodeClick:node=>{if(node.activityNodeId)window.complete(node.activityNodeId).then(setBoard)}})}createRoot(document.getElementById('root')).render(React.createElement(Host));`},bundle:true,write:false,platform:'browser',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"test"'}}).outputFiles[0]!.text;
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.setDefaultTimeout(4000);
  page.on('pageerror',error=>console.error('Shared canvas browser error:',error.message));
  await page.exposeFunction('project',project);
  await page.exposeFunction('choose',(optionId:string)=>{
   cycle=transitionLearningCycle(cycle.childId,cycle.homeworkId,cycle.revision,{type:'journey_choice_selected',choiceId:'order',optionId,choiceEventId:`choice-${cycle.revision}`},{rootDir});return project();
  });
  await page.exposeFunction('complete',(nodeId:string)=>{
   expect(canonicalJourneyLaunchable(cycle,nodeId)).toBe(true);launches.push(nodeId);
   cycle=transitionLearningCycle(cycle.childId,cycle.homeworkId,cycle.revision,{type:'instrument_observed',nodeId,completed:true,observations:[],academicEvidence:[{evidenceId:`lab-${nodeId}`,summary:'Synthetic completion'}],engagementEvidence:[],companionObservations:[]},{rootDir});return project();
  });
  const styles=fs.readdirSync('web/dist/assets').filter(file=>file.endsWith('.css')).map(file=>fs.readFileSync(path.join('web/dist/assets',file),'utf8')).join('\n');
  await page.route('**/*',route=>route.abort());
  await page.setContent(`<style>${styles}body{margin:0}</style><div id="root"></div>`);
  await page.addScriptTag({content:bundle});
  await page.getByRole('button',{name:'choose',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:first==='learn'?/Learn first/:/Play first/}).click();
  const portal=first==='learn'?'learn-a':'play-b';
  await page.locator(`[data-portal-id="${portal}"]`).click();
  await expect.poll(()=>launches).toEqual([first]);
  // Switching chooses the first unfinished canonical activity, not a duplicate.
  await page.getByRole('button',{name:'choose',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:first==='learn'?/Play first/:/Learn first/}).click();
  const second=first==='learn'?'play':'learn';
  await page.locator(`[data-portal-id="${second==='play'?'play-b':'learn-a'}"]`).click();
  await expect.poll(()=>launches).toEqual([first,second]);
  await page.locator('[data-portal-id="check"]').click();
  await expect.poll(()=>cycle.lifecycle).toBe('baseline_evaluating');
  expect(launches).toEqual([first,second,'check']);
  const evidenceBefore=structuredClone(cycle.evidence);
  await page.evaluate(()=> (globalThis as unknown as {complete:(id:string)=>Promise<unknown>}).complete('check'));
  expect(cycle.evidence).toEqual(evidenceBefore);
  expect(cycle.nodes.find(node=>node.nodeId==='check')!.evidenceIds).toEqual(['lab-check']);
  expect(cycle.boards![0].definition).toEqual(definition);
  const reloaded=getLearningCycle(cycle.childId,cycle.homeworkId,{rootDir})!;
  expect(reloaded.routeSelection).toEqual(cycle.routeSelection);
  expect(projectLearningCycle(reloaded).adventureBoard.definition).toEqual(definition);
  const output=path.resolve('outputs/authored-journey-browser');fs.mkdirSync(output,{recursive:true});
  await page.screenshot({path:path.join(output,`${first}-first-completed.png`)});
 } finally {await browser.close();fs.rmSync(rootDir,{recursive:true,force:true});}
},20000);
