import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import * as creator from './directMathExperience';
import {authoredJourney} from '../scripts/fixtures/authoredJourney';
import {journeyFromBoardDefinition,compositionFromBoardDefinition} from '../shared/adventureBoardDefinition';

describe('existing Creator realizes native spelling journeys',()=>{
 it('uses one visual tool call and resumes its saved composition without replanning',async()=>{
  const board=authoredJourney(),journey=journeyFromBoardDefinition(board);
  const plan:any={planId:'synthetic-journey',childId:'lab',domain:'spelling',journey,nodePlan:['learn','play','check'].map(id=>({id,type:'word-radar',activityId:'word-radar',targets:['piece']}))};
  const stream=vi.fn((_request:unknown)=>({finalMessage:async()=>({id:'creator-receipt',stop_reason:'tool_use',usage:{input_tokens:1,output_tokens:1},content:[{type:'tool_use',name:'create_learning_design_packet',input:{composition:compositionFromBoardDefinition(board),rationale:'Realize the authored choice.'}}]})}));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-domain-creator-'));
  try{
   const input:any={childId:'lab',program:{domain:'spelling',planId:plan.planId,journey,plan},childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),client:{messages:{stream}}};
   const result=await creator.askLearningExperienceDesigner(input);
   expect(result.plan.boardDefinition).toEqual(board);
   expect(result.plan.nodePlan).toEqual(plan.nodePlan);
   expect(result.plan.journey).toEqual(journey);
   expect(stream).toHaveBeenCalledTimes(1);
   const request:any=stream.mock.calls[0][0];
   expect(request.messages[0].content).toContain('spelling');
   expect(request.tools[0].input_schema.properties).not.toHaveProperty('journey');
   expect(request.tools[0].input_schema.properties).not.toHaveProperty('activities');
   await creator.askLearningExperienceDesigner(input);
   expect(stream).toHaveBeenCalledTimes(1);
   input.program.journey=structuredClone(journey);input.program.journey.portals[0].label='A changed educational label';
   await expect(creator.askLearningExperienceDesigner(input)).rejects.toThrow('learning_design_checkpoint_program_mismatch');
   expect(stream).toHaveBeenCalledTimes(1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
 it('does not reset exhausted Creator attempt budgets after restart',async()=>{
  const board=authoredJourney(),journey=journeyFromBoardDefinition(board);
  const plan:any={planId:'synthetic-budget',domain:'spelling',journey,nodePlan:[]};
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-creator-budget-'));
  const stream=vi.fn((_request:unknown)=>({finalMessage:async()=>({id:'bad-receipt',stop_reason:'tool_use',usage:{input_tokens:1,output_tokens:1},content:[{type:'tool_use',name:'create_learning_design_packet',input:{composition:{},rationale:'Invalid fixture.'}}]})}));
  try{
   const input:any={childId:'lab',program:{domain:'spelling',planId:plan.planId,journey,plan},childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),client:{messages:{stream}}};
   await expect(creator.askLearningExperienceDesigner(input)).rejects.toThrow('composition_missing');
   expect(stream).toHaveBeenCalledTimes(2);
   await expect(creator.askLearningExperienceDesigner(input)).rejects.toThrow('composition_missing');
   expect(stream).toHaveBeenCalledTimes(2);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });

 it('sends the diagnosed defect once and preserves the valid correction across restart',async()=>{
  const board=authoredJourney(),journey=journeyFromBoardDefinition(board),root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-creator-repair-'));
  const stream=vi.fn((_request:unknown)=>({finalMessage:async()=>({id:'receipt',stop_reason:'tool_use',usage:{input_tokens:1,output_tokens:1},content:[{type:'tool_use',name:'create_learning_design_packet',input:{composition:stream.mock.calls.length===1?{}:compositionFromBoardDefinition(board),rationale:'Fixture.'}}]})}));
  try{
   const input:any={childId:'lab',program:{domain:'spelling',planId:'repair',journey,plan:{planId:'repair',journey,nodePlan:[]}},childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),client:{messages:{stream}}};
   const result=await creator.askLearningExperienceDesigner(input);
   expect(result.plan.boardDefinition).toEqual(board);expect(stream).toHaveBeenCalledTimes(2);
   const first:any=stream.mock.calls[0][0],second:any=stream.mock.calls[1][0];
   expect(second.messages[0].content).not.toBe(first.messages[0].content);
   expect(second.messages[0].content).toContain('composition');
   await creator.askLearningExperienceDesigner(input);expect(stream).toHaveBeenCalledTimes(2);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });

});
