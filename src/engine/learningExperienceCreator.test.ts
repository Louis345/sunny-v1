import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {verifyAuthoredBoardCanvas} from './adventureBoardCanvas';
vi.mock('./adventureBoardCanvas',async original=>({...await original<typeof import('./adventureBoardCanvas')>(),verifyAuthoredBoardCanvas:vi.fn(async()=>({})),
 measureBoardPortals:vi.fn(async()=>[]),renderBoardPreview:vi.fn(async()=>({screenshots:[],portals:[],artworkLoaded:true}))}));
afterEach(()=>vi.clearAllMocks());
import * as creator from './directMathExperience';
import {authoredJourney} from '../scripts/fixtures/authoredJourney';
import {journeyFromBoardDefinition} from '../shared/adventureBoardDefinition';
import {layoutJourney,DEFAULT_THEME_PRESET} from '../shared/boardLayout';

const submit=(map:Record<string,unknown>)=>({id:'creator-receipt',stop_reason:'tool_use',usage:{input_tokens:1,output_tokens:1},content:[{type:'tool_use',id:'tool',name:'submit_board',input:{whatISee:'Recorded.',pattern:'recorded fixture',...map,rationale:'Recorded fixture.'}}]});
/** The artist's map for a board, in its tool's shape. */
const mapOf=(board:ReturnType<typeof authoredJourney>)=>({theme:'illustrated-night',portals:board.portals.map(portal=>({id:portal.id,...portal.position})),edges:board.edges.map(edge=>({id:edge.id,curve:'straight',style:'dashed'}))});
describe('existing Creator realizes native spelling journeys',()=>{
 it('uses one visual tool call and resumes its saved composition without replanning',async()=>{
  const board=authoredJourney(),journey=journeyFromBoardDefinition(board);
  const plan:any={planId:'synthetic-journey',childId:'lab',domain:'spelling',journey,nodePlan:['learn','play','check'].map(id=>({id,type:'word-radar',activityId:'word-radar',targets:['piece']}))};
  const stream=vi.fn((_request:unknown)=>({finalMessage:async()=>submit(mapOf(board))}));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-domain-creator-'));
  try{
   const input:any={childId:'lab',program:{domain:'spelling',planId:plan.planId,journey,plan},childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),client:{messages:{stream}}};
   const result=await creator.askLearningExperienceDesigner(input);
   expect(result.plan.boardDefinition!.portals.map(portal=>portal.position)).toEqual(board.portals.map(portal=>portal.position));
   expect(verifyAuthoredBoardCanvas).not.toHaveBeenCalled();
   expect(result.plan.nodePlan).toEqual(plan.nodePlan);
   expect(result.plan.journey).toEqual(journey);
   expect(stream).toHaveBeenCalledTimes(1);
   const request:any=stream.mock.calls[0][0];
   for(const portal of journey.portals)expect(request.messages[0].content).toContain(portal.label); // the journey, not the whole program
   for(const tool of request.tools){expect(tool.input_schema.properties).not.toHaveProperty('journey');expect(tool.input_schema.properties).not.toHaveProperty('activities');}
   await creator.askLearningExperienceDesigner(input);
   expect(stream).toHaveBeenCalledTimes(1);
   input.program.journey=structuredClone(journey);input.program.journey.portals[0].label='A changed educational label';
   await expect(creator.askLearningExperienceDesigner(input)).rejects.toThrow('learning_design_checkpoint_program_mismatch');
   expect(stream).toHaveBeenCalledTimes(1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });

 it('publishes a submission with no placed portals on the logged plain layout instead of sending it back',async()=>{
  const board=authoredJourney(),journey=journeyFromBoardDefinition(board);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-creator-fallback-'));
  const stream=vi.fn((_request:unknown)=>({finalMessage:async()=>submit({})}));
  const log=vi.spyOn(console,'log').mockImplementation(()=>{});
  try{
   const input:any={childId:'lab',program:{domain:'spelling',planId:'fallback',journey,plan:{planId:'fallback',journey,nodePlan:[]}},childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),client:{messages:{stream}}};
   const result=await creator.askLearningExperienceDesigner(input);
   expect(stream).toHaveBeenCalledTimes(1);
   expect(result.plan.boardDefinition!.portals.map(portal=>portal.id)).toEqual(journey.portals.map(portal=>portal.id));
   const plain=layoutJourney(journey).positions;
   expect(Object.fromEntries(result.plan.boardDefinition!.portals.map(portal=>[portal.id,portal.position]))).toEqual(plain);
   expect(log.mock.calls.filter(call=>String(call[0]).includes('[experience-creator] [composition] [fallback-layout] reason=nothing_placed'))).toHaveLength(1);
  }finally{log.mockRestore();fs.rmSync(root,{recursive:true,force:true});}
 });

 it('publishes the plain layout without buying another call when the Creator returns nothing to draw, and reuses it on restart',async()=>{
  const board=authoredJourney(),journey=journeyFromBoardDefinition(board);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-creator-empty-'));
  const stream=vi.fn((_request:unknown)=>({finalMessage:async()=>({id:'empty',stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1},content:[{type:'text',text:'No map.'}]})}));
  try{
   const input:any={childId:'lab',program:{domain:'spelling',planId:'empty',journey,plan:{planId:'empty',journey,nodePlan:[]}},childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),client:{messages:{stream}}};
   const first=await creator.askLearningExperienceDesigner(input);
   expect(Object.fromEntries(first.plan.boardDefinition!.portals.map(portal=>[portal.id,portal.position]))).toEqual(layoutJourney(journey).positions);
   expect((await creator.askLearningExperienceDesigner(input)).plan.boardDefinition).toEqual(first.plan.boardDefinition);
   expect(stream).toHaveBeenCalledTimes(1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });

 // Kiosk walk 2026-10-13 (and live runs 6 and 18): a spare palette key cost the artist its whole
 // world. Contract 39 offers closed theme presets instead; a look that cannot be read still keeps
 // the illustrated world and every placed stop.
 it('keeps the illustrated world and the artist\'s map when its look cannot be read',async()=>{
  const board=authoredJourney(),journey=journeyFromBoardDefinition(board),root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-creator-theme-'));
  const stream=vi.fn((_request:unknown)=>({finalMessage:async()=>submit({...mapOf(board),theme:'neon-gradient'})}));
  try{
   const result=await creator.askLearningExperienceDesigner({childId:'lab',program:{domain:'spelling',planId:'theme',journey,plan:{planId:'theme',journey,nodePlan:[]}},childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),client:{messages:{stream}}} as any);
   const definition=result.plan.boardDefinition!;
   expect(definition.theme).toEqual({background:DEFAULT_THEME_PRESET.background,palette:DEFAULT_THEME_PRESET.palette});
   expect(definition.portals.map(portal=>portal.position)).toEqual(board.portals.map(portal=>portal.position));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
 it('falls back to the illustrated world, never a plain colour, when no theme can be read',async()=>{
  const board=authoredJourney(),journey=journeyFromBoardDefinition(board),root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-creator-notheme-'));
  const stream=vi.fn((_request:unknown)=>({finalMessage:async()=>submit({})}));
  try{
   const result=await creator.askLearningExperienceDesigner({childId:'lab',program:{domain:'spelling',planId:'notheme',journey,plan:{planId:'notheme',journey,nodePlan:[]}},childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),client:{messages:{stream}}} as any);
   expect(result.plan.boardDefinition!.theme.background.type).toBe('image');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
});
