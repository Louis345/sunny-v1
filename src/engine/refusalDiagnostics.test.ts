import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import * as canvas from './adventureBoardCanvas';
vi.mock('./adventureBoardCanvas',async original=>({...await original<typeof import('./adventureBoardCanvas')>(),
 verifyAuthoredBoardCanvas:vi.fn(async()=>{throw new Error('board_canvas_invalid:["must not be consulted"]');}),
 measureBoardPortals:vi.fn(async()=>[{viewport:'1280x720',id:'check',width:123,height:187},{viewport:'768x1024',id:'check',width:123,height:211}]),
 renderBoardPreview:vi.fn(async(input:{directory:string})=>{
  fs.mkdirSync(input.directory,{recursive:true});
  const screenshots=['1280x720','768x1024'].map(viewport=>{const file=path.join(input.directory,`preview-${viewport}.png`);fs.writeFileSync(file,'png');return {viewport,file};});
  return {screenshots,portals:[],overlaps:[],crowded:[],artworkLoaded:true};
 })}));
import * as creator from './directMathExperience';
import * as transport from './plannerTransport';
import {authoredJourney} from '../scripts/fixtures/authoredJourney';
import {journeyFromBoardDefinition} from '../shared/adventureBoardDefinition';

// Step 0 of docs/specs/SPELLING_BOARD_PLAN_CONTRACT.md. Two board refusals (2026-10-14, 2026-10-19)
// left only `[refused]` behind, so nobody can tell why the provider declined. Save its reason.
const roots:string[]=[];
afterEach(()=>{vi.clearAllMocks();vi.restoreAllMocks();roots.splice(0).forEach(root=>fs.rmSync(root,{recursive:true,force:true}));});
const journey=journeyFromBoardDefinition(authoredJourney());
const refused=(stop_details:unknown={type:'refusal',category:'cyber',explanation:'Declined by a safety classifier.'})=>({id:'refused',stop_reason:'refusal',stop_details,usage:{input_tokens:1,output_tokens:0},content:[]});
const reply=(name:string,input:unknown,index:number)=>({id:`creator-${index}`,stop_reason:'tool_use',usage:{input_tokens:1,output_tokens:1},content:[{type:'tool_use',id:`tool-${index}`,name,input}]});
function design(turns:Array<unknown>,extra:Record<string,unknown>={}) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-map-artist-'));roots.push(root);
 const stream=vi.fn((_request:unknown)=>({finalMessage:async()=>turns[stream.mock.calls.length-1]}));
 const plan:any={planId:'artist',childId:'lab',domain:'spelling',journey,nodePlan:['learn','play','check'].map(id=>({id,type:'word-radar',activityId:'word-radar',targets:['piece']}))};
 const input:any={childId:'lab',program:{domain:'spelling',planId:plan.planId,journey,plan},childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),rawResponseDir:path.join(root,'diagnostics'),client:{messages:{stream}},...extra};
 return {root,stream,run:()=>creator.askLearningExperienceDesigner(input)};
}

describe('step 0: a refusal says why',()=>{
 // 2026-10-19: the board stopped with [refused] and nothing else; the provider's reason was never
 // saved, so the root cause cannot be diagnosed. The lab injected a refusal and asserted the stop only.
 it('saves and logs the provider stop_details',async()=>{
  const errors=vi.spyOn(console,'error').mockImplementation(()=>{});const logs=vi.spyOn(console,'log').mockImplementation(()=>{});
  const {root,run}=design([refused()]);
  await run().catch(()=>undefined);
  const saved=JSON.parse(fs.readFileSync(path.join(root,'diagnostics','design-response-1.json'),'utf8'));
  expect(saved.stopDetails).toEqual({type:'refusal',category:'cyber',explanation:'Declined by a safety classifier.'});
  expect([...errors.mock.calls,...logs.mock.calls].map(call=>call.join(' ')).join('\n')).toMatch(/\[refused\].*category=cyber/);
 });
 it('logs the provider stop_details when a Planner response is refused',()=>{
  const errors=vi.spyOn(console,'error').mockImplementation(()=>{});
  expect(()=>transport.assertPlannerResponseComplete(refused() as never)).toThrow('planner_response_refusal');
  expect(errors.mock.calls.map(call=>call.join(' ')).join('\n')).toMatch(/\[planner\] \[response\] \[refused\] category=cyber explanation=Declined by a safety classifier\./);
 });
});

