import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {getActivityToolContract} from './activityToolCatalog';
import {requestPlannerMessage} from './plannerTransport';
vi.mock('./plannerTransport',async original=>({...await original<typeof import('./plannerTransport')>(),requestPlannerMessage:vi.fn()}));
import {authoredJourney} from '../scripts/fixtures/authoredJourney';
import {parseAssignmentPlannerJson,planAssignmentFromSourceWithTelemetry} from './assignmentPlanner';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
// Human saw a blocked chapter. The old lab rewarded layout corrections rather than continuity.
it('accepts an overlapping Teaching map with missing art without buying a canvas correction',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-canvas-continuity-'));
 try {
  const input:any=parseAssignmentPlannerJson(JSON.stringify({activeSessionPlan:{boardDefinition:authoredJourney(),nodePlan:['check','play','learn'].map(id=>({id,title:id,type:'word-radar',activityId:'word-radar',targets:['float'],wordRadarConfig:getActivityToolContract('word-radar').capabilityModes.find(mode=>mode.config.recallMode===(id==='check'?'hidden_word_recall':'partial_visual_recall'))!.config}))},planTheory:{hypothesis:'H',evidenceSummary:['e'],intervention:'I',supportCriteria:['s'],reviseCriteria:['r'],falsifyCriteria:['f']},plannedMeasurements:['check','play','learn'].map(id=>({id:'measure-'+id,activityId:'word-radar',target:'float',evidenceType:'practice',supportCriteria:'s',reviseCriteria:'r',falsifyCriteria:'f',spelling:{role:id==='check'?'fresh_checkpoint':'practice',interventionNodeIds:id==='check'?['play','learn']:[],evidenceIds:['e'],reason:'r',uncertainty:'u',expectedAccuracy:{min:0,max:1},confidence:.5,maxDelayDays:1,finalCheck:id==='check'}})),reviewQuestions:['q']}));
  const packet:any={childId:'synthetic',sourceDocument:{fileHash:'a'.repeat(64),fullText:'Spelling float',pages:[{pageNumber:1,text:'Spelling float'}]},capturedHomework:{title:'Float',type:'spelling_test',words:['float'],questions:[],sourceDocuments:[{filename:'source.pdf'}]},childChart:{},activityCatalog:[{activityId:'word-radar',nodeType:'word-radar',launchable:true,capabilityModes:getActivityToolContract('word-radar').capabilityModes}],discoveryEvidence:{observations:[{observationId:'e'}],summary:{constructs:[]},history:{constructs:{}}}};

  const board=input.activeSessionPlan.boardDefinition;
  board.theme.background={type:'image',value:'/generated/missing-lab.png'};
  board.portals[1].position=structuredClone(board.portals[0].position);
  const original=structuredClone(board);
  const provider=vi.mocked(requestPlannerMessage).mockRejectedValue(new Error('unexpected_paid_correction'));
  const error=vi.spyOn(console,'error').mockImplementation(()=>{});
  const result=await planAssignmentFromSourceWithTelemetry(packet,{callPlannerModel:async()=>({draft:input,receivedAt:new Date().toISOString()} as never),providerReceipt:{draftDir:root,stage:'targeted'}});
  expect(result.output.activeSessionPlan.boardDefinition).toEqual(original);
  expect(result.output.activeSessionPlan.plannedMeasurements!.map(row=>row.id)).toEqual(input.plannedMeasurements.map((row:any)=>row.id));
  expect(provider).not.toHaveBeenCalled();
  expect(error.mock.calls.flat().join(' ')).toContain('[artwork] [missing]');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
