import {it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {linearJourneyFixture} from '../scripts/fixtures/authoredJourney';
import {journeyFromBoardDefinition,compositionFromBoardDefinition} from '../shared/adventureBoardDefinition';
const verify=vi.hoisted(()=>vi.fn());
vi.mock('./adventureBoardCanvas',async importOriginal=>({...await importOriginal<typeof import('./adventureBoardCanvas')>(),verifyAuthoredBoardCanvas:verify}));
import {askLearningExperienceDesigner} from './directMathExperience';
it('sends the received candidate for bounded geometry repair and reuses completed work on restart',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-geometry-repair-'));
 const definition=linearJourneyFixture(['teach','check']);const composition=compositionFromBoardDefinition(definition),journey=journeyFromBoardDefinition(definition);
 const program={domain:'spelling',planId:'preserve',journey,plan:{nodePlan:[]}} as never;
 const failure=new Error('board_canvas_invalid:["768x1024:teach:overlaps:check:normalized_center_separation current_x=0 current_y=0.2 required_x=0.2 OR required_y=0.26"]');
 verify.mockReset().mockRejectedValueOnce(failure).mockResolvedValue({});
 const stream=vi.fn((request:any)=>({finalMessage:async()=>{
  if(stream.mock.calls.length===1)return {content:[{type:'tool_use',name:'create_learning_design_packet',input:{composition,rationale:'World'}}],usage:{input_tokens:1,output_tokens:1},stop_reason:'tool_use'};
  expect(request.tools[0].name).toBe('repair_board_geometry');
  expect(request.messages[0].content).toContain(JSON.stringify(composition));
  return {content:[{type:'tool_use',name:'repair_board_geometry',input:{patches:[{path:'/portals/1/position/portrait',value:{x:.2,y:.25}},{path:'/portals/2/position/portrait',value:{x:.6,y:.65}}]}}],usage:{input_tokens:1,output_tokens:1},stop_reason:'tool_use'};
 }}));
 const run=()=>askLearningExperienceDesigner({childId:'synthetic',program,childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),client:{messages:{stream}} as never});
 try{
  const result=await run();expect(stream).toHaveBeenCalledTimes(2);expect(result.packet.composition.theme).toEqual(composition.theme);expect(result.packet.composition.portals.map(p=>p.position.landscape)).toEqual(composition.portals.map(p=>p.position.landscape));
  const saved=JSON.parse(fs.readFileSync(path.join(root,'design.json'),'utf8'));expect(saved.rejectedComposition).toEqual(composition);
  await run();expect(stream).toHaveBeenCalledTimes(2);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
it('refuses a saved geometry receipt for another program even when the candidate matches',async()=>{
 const {createHash}=await import('node:crypto');const {runMathProviderStage}=await import('./adaptiveMathDiscovery');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-geometry-identity-'));
 const definition=linearJourneyFixture(['teach','check']),composition=compositionFromBoardDefinition(definition),journey=journeyFromBoardDefinition(definition);
 const program={domain:'spelling',planId:'preserve',journey,plan:{nodePlan:[]}} as never;
 const sourceHash=createHash('sha256').update(JSON.stringify({childId:'synthetic',domain:'spelling',program})).digest('hex');
 const checkpoint={version:1,planId:'preserve',model:'claude-fable-5',expectedNodeIds:[],completedNodeIds:[],missingNodeIds:[],artifacts:[],sourceHash,rejectedComposition:composition,compositionDefect:'board_canvas_invalid:["768x1024:teach:overlaps:check:normalized_center_separation"]',attempts:[{attempt:1,requestedNodeIds:[],receivedNodeIds:[],inputTokens:1,outputTokens:1,elapsedMs:1,stopReason:'tool_use'}]};
 fs.writeFileSync(path.join(root,'design.json'),JSON.stringify(checkpoint));
 const request={model:'claude-fable-5',messages:[{role:'user',content:`Received candidate: ${JSON.stringify(composition)}\nImmutable journey: ${JSON.stringify({...journey,title:'Different program'})}`}],tool_choice:{type:'tool',name:'repair_board_geometry'},tools:[]};
 await runMathProviderStage({draftDir:root,stage:'targeted-design-2',model:request.model,request,execute:async()=>({content:[{type:'tool_use',name:'repair_board_geometry',input:{patches:[{path:'/portals/1/position/portrait',value:{x:.2,y:.3}}]}}],usage:{input_tokens:1,output_tokens:1},stop_reason:'tool_use'})});
 const stream=vi.fn();verify.mockReset().mockResolvedValue({});
 try{await expect(askLearningExperienceDesigner({childId:'synthetic',program,childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),client:{messages:{stream}} as never})).rejects.toThrow('learning_design_saved_request_identity_mismatch');expect(stream).not.toHaveBeenCalled();}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
it('preserves successful geometry during a math continuation with unfinished activity designs',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-math-geometry-'));
 const definition=linearJourneyFixture(['teach','check']),composition=compositionFromBoardDefinition(definition),journey=journeyFromBoardDefinition(definition);
 const program={domain:'math',planId:'math-preserve',journey,activities:[{id:'teach'},{id:'check'}],fork:{routes:[{id:'route',nodeIds:['teach','check']}]}} as never;
 const spine={title:'World',narrative:'World',openingChoice:'Begin',backgroundDirection:'Illustrated',routeDirections:[{routeId:'route',label:'Route',promise:'Learn',childFacingActionCue:'Tap',previewNodeId:'teach',engagementVariable:'pace'}]};
 verify.mockReset().mockRejectedValueOnce(new Error('board_canvas_invalid:["768x1024:teach:overlaps:check:normalized_center_separation"]')).mockResolvedValue({});
 const stream=vi.fn(()=>({finalMessage:async()=>({content:[{type:'tool_use',name:'create_math_design_packet',input:{composition:stream.mock.calls.length===1?composition:{...composition,theme:{...composition.theme,background:{type:'solid',value:'#000'}}},boardCreativeSpine:spine,artifacts:[],rationale:'Preserve'}}],usage:{input_tokens:1,output_tokens:1},stop_reason:'tool_use'})}));
 try{await expect(askLearningExperienceDesigner({childId:'synthetic',program,childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),client:{messages:{stream}} as never})).rejects.toThrow('composition_correction_changed_protected_fields');expect(stream).toHaveBeenCalledTimes(2);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
