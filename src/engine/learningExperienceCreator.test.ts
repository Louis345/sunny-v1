import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {verifyAuthoredBoardCanvas} from './adventureBoardCanvas';
vi.mock('./adventureBoardCanvas',async original=>({...await original<typeof import('./adventureBoardCanvas')>(),verifyAuthoredBoardCanvas:vi.fn(async()=>({})),
 measureBoardPortals:vi.fn(async()=>[]),renderBoardPreview:vi.fn(async()=>({screenshots:[],portals:[],artworkLoaded:true}))}));
afterEach(()=>vi.clearAllMocks());
import * as creator from './directMathExperience';
import {authoredJourney} from '../scripts/fixtures/authoredJourney';
import {journeyFromBoardDefinition,compositionFromBoardDefinition} from '../shared/adventureBoardDefinition';

const submit=(composition:unknown)=>({id:'creator-receipt',stop_reason:'tool_use',usage:{input_tokens:1,output_tokens:1},content:[{type:'tool_use',id:'tool',name:'submit_board',input:{composition,rationale:'Recorded fixture.'}}]});
describe('existing Creator realizes native spelling journeys',()=>{
 it('uses one visual tool call and resumes its saved composition without replanning',async()=>{
  const board=authoredJourney(),journey=journeyFromBoardDefinition(board);
  const plan:any={planId:'synthetic-journey',childId:'lab',domain:'spelling',journey,nodePlan:['learn','play','check'].map(id=>({id,type:'word-radar',activityId:'word-radar',targets:['piece']}))};
  const stream=vi.fn((_request:unknown)=>({finalMessage:async()=>submit(compositionFromBoardDefinition(board))}));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-domain-creator-'));
  try{
   const input:any={childId:'lab',program:{domain:'spelling',planId:plan.planId,journey,plan},childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),client:{messages:{stream}}};
   const result=await creator.askLearningExperienceDesigner(input);
   expect(result.plan.boardDefinition).toEqual(board);
   expect(verifyAuthoredBoardCanvas).not.toHaveBeenCalled();
   expect(result.plan.nodePlan).toEqual(plan.nodePlan);
   expect(result.plan.journey).toEqual(journey);
   expect(stream).toHaveBeenCalledTimes(1);
   const request:any=stream.mock.calls[0][0];
   expect(request.messages[0].content).toContain('spelling');
   for(const tool of request.tools){expect(tool.input_schema.properties).not.toHaveProperty('journey');expect(tool.input_schema.properties).not.toHaveProperty('activities');}
   await creator.askLearningExperienceDesigner(input);
   expect(stream).toHaveBeenCalledTimes(1);
   input.program.journey=structuredClone(journey);input.program.journey.portals[0].label='A changed educational label';
   await expect(creator.askLearningExperienceDesigner(input)).rejects.toThrow('learning_design_checkpoint_program_mismatch');
   expect(stream).toHaveBeenCalledTimes(1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });

 it('publishes a submission with unplaced portals at the logged fallback spot instead of sending it back',async()=>{
  const board=authoredJourney(),journey=journeyFromBoardDefinition(board);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-creator-fallback-'));
  const stream=vi.fn((_request:unknown)=>({finalMessage:async()=>submit({})}));
  const log=vi.spyOn(console,'log').mockImplementation(()=>{});
  try{
   const input:any={childId:'lab',program:{domain:'spelling',planId:'fallback',journey,plan:{planId:'fallback',journey,nodePlan:[]}},childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),client:{messages:{stream}}};
   const result=await creator.askLearningExperienceDesigner(input);
   expect(stream).toHaveBeenCalledTimes(1);
   expect(result.plan.boardDefinition!.portals.map(portal=>portal.id)).toEqual(journey.portals.map(portal=>portal.id));
   expect(result.plan.boardDefinition!.portals.every(portal=>portal.position.landscape.x===.5&&portal.position.portrait.y===.5)).toBe(true);
   expect(log.mock.calls.filter(call=>String(call[0]).includes('[experience-creator] [portal] [fallback-position]'))).toHaveLength(journey.portals.length);
  }finally{log.mockRestore();fs.rmSync(root,{recursive:true,force:true});}
 });

 it('stops without buying another call when the Creator returns nothing to draw, and replays that receipt on restart',async()=>{
  const board=authoredJourney(),journey=journeyFromBoardDefinition(board);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-creator-empty-'));
  const stream=vi.fn((_request:unknown)=>({finalMessage:async()=>({id:'empty',stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1},content:[{type:'text',text:'No map.'}]})}));
  try{
   const input:any={childId:'lab',program:{domain:'spelling',planId:'empty',journey,plan:{planId:'empty',journey,nodePlan:[]}},childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),client:{messages:{stream}}};
   await expect(creator.askLearningExperienceDesigner(input)).rejects.toThrow('composition_missing');
   await expect(creator.askLearningExperienceDesigner(input)).rejects.toThrow('composition_missing');
   expect(stream).toHaveBeenCalledTimes(1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
});
