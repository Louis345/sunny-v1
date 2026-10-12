import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {getActivityToolContract} from './activityToolCatalog';
import {verifyAuthoredBoardCanvas} from './adventureBoardCanvas';
import {requestPlannerMessage} from './plannerTransport';
vi.mock('./adventureBoardCanvas',()=>({verifyAuthoredBoardCanvas:vi.fn()}));
vi.mock('./plannerTransport',async original=>({...await original<typeof import('./plannerTransport')>(),requestPlannerMessage:vi.fn()}));
import {authoredJourney} from '../scripts/fixtures/authoredJourney';
import {assignmentPlannerCanvasCorrectionSchema,assertAssignmentPlannerCanvasCorrection,parseAssignmentPlannerJson,planAssignmentFromSourceWithTelemetry,ASSIGNMENT_PLANNER_TOOL_NAME} from './assignmentPlanner';
const draft=()=>({activeSessionPlan:{boardDefinition:authoredJourney(),nodePlan:[{id:'learn',activityId:'word-radar',targets:['float']}]},plannedMeasurements:[{id:'measure-learn',confidence:.5}],planTheory:{hypothesis:'H'}});
describe('canvas correction preserves the Painter journey',()=>{
 it('freezes educational fields in the tool while permitting authored positions',()=>{
  const input=draft(), schema:any=assignmentPlannerCanvasCorrectionSchema(input);
  expect(schema.properties.planTheory.const).toEqual(input.planTheory);
  expect(schema.properties.activeSessionPlan.properties.nodePlan.const).toEqual(input.activeSessionPlan.nodePlan);
  const board=schema.properties.activeSessionPlan.properties.boardDefinition;
  expect(board.properties.paths.const).toEqual(input.activeSessionPlan.boardDefinition.paths);
  expect(board.properties.choices.const).toEqual(input.activeSessionPlan.boardDefinition.choices);
  expect(board.properties.portals.items.anyOf[0].properties.id.const).toBe(input.activeSessionPlan.boardDefinition.portals[0].id);
  expect(board.properties.portals.items.anyOf[0].properties.position.const).toBeUndefined();
 });
 it('accepts position/control-point repair without mutating the original',()=>{
  const input=draft(), before=structuredClone(input), corrected=structuredClone(input);
  corrected.activeSessionPlan.boardDefinition.portals[0].position.portrait.x=.2;
  Object.assign(corrected.activeSessionPlan.boardDefinition.edges[0],{controlPoints:{landscape:[],portrait:[{x:.3,y:.4}]}});
  expect(()=>assertAssignmentPlannerCanvasCorrection(input,corrected)).not.toThrow();expect(input).toEqual(before);
 });
 it.each(['activity','choice','label','order','missing-portal','measurement'])( 'rejects semantic drift during layout repair: %s', defect=>{
  const input=draft(),changed=structuredClone(input);
  if(defect==='activity')changed.activeSessionPlan.nodePlan[0].activityId='visual-explainer';
  if(defect==='choice')changed.activeSessionPlan.boardDefinition.choices=[];
  if(defect==='label')changed.activeSessionPlan.boardDefinition.portals[0].label='Different';
  if(defect==='order')changed.activeSessionPlan.boardDefinition.portals.reverse();
  if(defect==='missing-portal')changed.activeSessionPlan.boardDefinition.portals.pop();
  if(defect==='measurement')changed.plannedMeasurements[0].confidence=1;
  expect(()=>assertAssignmentPlannerCanvasCorrection(input,changed)).toThrow('canvas_correction_changed_journey');
 });
});

it.each([1,2])('invokes frozen canvas schema and guard in production correction stage %i',async stage=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-canvas-repair-'));
 vi.stubEnv('ANTHROPIC_API_KEY','fixture-not-a-key');
 try {
  const input:any=parseAssignmentPlannerJson(JSON.stringify({activeSessionPlan:{boardDefinition:authoredJourney(),nodePlan:['check','play','learn'].map(id=>({id,title:id,type:'word-radar',activityId:'word-radar',targets:['float'],wordRadarConfig:getActivityToolContract('word-radar').capabilityModes.find(mode=>mode.config.recallMode===(id==='check'?'hidden_word_recall':'partial_visual_recall'))!.config}))},planTheory:{hypothesis:'H',evidenceSummary:['e'],intervention:'I',supportCriteria:['s'],reviseCriteria:['r'],falsifyCriteria:['f']},plannedMeasurements:['check','play','learn'].map(id=>({id:'measure-'+id,activityId:'word-radar',target:'float',evidenceType:'practice',supportCriteria:'s',reviseCriteria:'r',falsifyCriteria:'f',spelling:{role:id==='check'?'fresh_checkpoint':'practice',interventionNodeIds:id==='check'?['play','learn']:[],evidenceIds:['e'],reason:'r',uncertainty:'u',expectedAccuracy:{min:0,max:1},confidence:.5,maxDelayDays:1,finalCheck:id==='check'}})),reviewQuestions:['q']}));
  const packet:any={childId:'synthetic',sourceDocument:{fileHash:'a'.repeat(64),fullText:'Spelling float',pages:[{pageNumber:1,text:'Spelling float'}]},capturedHomework:{title:'Float',type:'spelling_test',words:['float'],questions:[],sourceDocuments:[{filename:'source.pdf'}]},childChart:{},activityCatalog:[{activityId:'word-radar',nodeType:'word-radar',launchable:true,capabilityModes:getActivityToolContract('word-radar').capabilityModes}],discoveryEvidence:{observations:[{observationId:'e'}],summary:{constructs:[]},history:{constructs:{}}}};
  vi.mocked(verifyAuthoredBoardCanvas).mockReset().mockRejectedValue(new Error('board_canvas_invalid:portrait overlap'));
  const requests:any[]=[];
  vi.mocked(requestPlannerMessage).mockReset().mockImplementation(async(_client,request:any)=>{
   requests.push(request);const corrected=structuredClone(input);
   corrected.activeSessionPlan.boardDefinition.portals[0].position.portrait.x=.25;
   if(requests.length===stage)corrected.plannedMeasurements[0].spelling.confidence=1;
   return {id:'recorded-'+requests.length,stop_reason:'tool_use',content:[{type:'tool_use',id:'tool-'+requests.length,name:ASSIGNMENT_PLANNER_TOOL_NAME,input:corrected}],usage:{input_tokens:1,output_tokens:1}} as never;
  });
  await expect(planAssignmentFromSourceWithTelemetry(packet,{callPlannerModel:async()=>({draft:input,receivedAt:new Date().toISOString()} as never),providerReceipt:{draftDir:root,stage:'targeted'}})).rejects.toThrow('canvas_correction_changed_journey');
  expect(requests).toHaveLength(stage);
  for(const request of requests)expect(request.tools[0].input_schema.properties.plannedMeasurements.const).toEqual(input.plannedMeasurements);
  expect(fs.existsSync(path.join(root,'board.json'))).toBe(false);
 } finally {vi.unstubAllEnvs();fs.rmSync(root,{recursive:true,force:true});}
});
