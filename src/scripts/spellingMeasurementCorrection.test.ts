import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {linearJourneyFixture} from './fixtures/authoredJourney';
import {recordedSpellingDiagnostic,recordedSpellingPlan,seedSpellingLab} from './fixtures/spellingEvidenceFirst';
import {runSpellingDiscoveryIntake} from './ingestHomework';
import {getChildChart} from '../profiles/childChart';
import {getLearningCycle} from '../engine/learningCycleRepository';
import {buildSpellingTargetedCycleInput} from '../engine/learningCycleIngest';
import {recordSpellingDiscoveryAttempt} from '../engine/learningCycleRuntime';
import {completeDiscoveryEvaluation,resolveAdaptiveMathDraftDir,runMathProviderStage,hashDiscoveryContract} from '../engine/adaptiveMathDiscovery';
import {readAssignmentSourceExtraction} from '../engine/assignmentSourceExtraction';
import {ASSIGNMENT_PLANNER_TOOL_NAME,attachSpellingDiscoveryEvidence,buildAssignmentPlanningPacket,planAssignmentFromSourceWithTelemetry} from '../engine/assignmentPlanner';
import {requestPlannerMessage} from '../engine/plannerTransport';
vi.mock('../engine/plannerTransport',async original=>({...await original<typeof import('../engine/plannerTransport')>(),requestPlannerMessage:vi.fn()}));
vi.mock('../engine/adventureBoardCanvas',()=>({verifyAuthoredBoardCanvas:vi.fn(async()=>({}))}));
const roots:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();roots.splice(0).forEach(root=>fs.rmSync(root,{recursive:true,force:true}));});

async function fixture(replies?:unknown[]) {
 const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-measurement-patch-'));roots.push(rootDir);
 const childId='lab-child',sourceFile=seedSpellingLab(rootDir);
 const {homeworkId}=await runSpellingDiscoveryIntake({rootDir,childId,sourceFile},{callPlannerModel:async packet=>({draft:{title:'Recorded words',words:['night','light'].map(word=>({word,pageNumber:1})),uncertainty:[],diagnostic:recordedSpellingDiagnostic(packet),boardDefinition:linearJourneyFixture(['diagnostic'])}})});
 const scope={rootDir,childId,homeworkId},opening=getLearningCycle(childId,homeworkId,scope)!;
 Object.values(opening.nodes[0].evidenceContract.spellingItems!).forEach((item,index)=>recordSpellingDiscoveryAttempt({childId,homeworkId,attempt:{attemptId:'observed-'+index,itemId:item.id,attemptedValue:item.word,observedAt:'2026-10-11T12:00:00Z'},support:{status:'unassisted',scaffolds:[]}},scope));
 completeDiscoveryEvaluation({...scope,completedAt:'2026-10-11T12:01:00Z'});
 const draftDir=resolveAdaptiveMathDraftDir(childId,homeworkId,scope),chart=getChildChart(childId,scope);
 const packet=attachSpellingDiscoveryEvidence(buildAssignmentPlanningPacket({childId,childChart:chart,extraction:readAssignmentSourceExtraction(path.join(draftDir,'assignment-extraction.json'))}),chart);
 const original:any=structuredClone(recordedSpellingPlan(packet,rootDir));delete original.activeSessionPlan.learningRoutes;
 original.activeSessionPlan.nodePlan.push({id:'reward',type:'mystery',activityId:'mystery',title:'Reward Break',targets:[],difficulty:1,source:'chart_planner'});
 original.activeSessionPlan.boardDefinition=linearJourneyFixture(['practice','reward','check']);
 original.plannedMeasurements[0].spelling.evidenceIds=[];
 original.plannedMeasurements[0].spelling.interventionNodeIds=['check'];
 original.plannedMeasurements.push({...structuredClone(original.plannedMeasurements[0]),id:'measure-reward',activityId:'mystery',target:'Reward',spelling:{...original.plannedMeasurements[0].spelling,evidenceIds:[],interventionNodeIds:[]}});
 const patch={corrections:[
  {path:'plannedMeasurements.0.spelling.evidenceIds',value:['observed-0','observed-1']},
  {path:'plannedMeasurements.2.spelling',value:null},
 ]};
 const requests:any[]=[];
 vi.stubEnv('ANTHROPIC_API_KEY','recorded-no-network');vi.stubGlobal('fetch',()=>{throw Error('network forbidden');});
 vi.mocked(requestPlannerMessage).mockImplementation(async(_client,request:any)=>{
  requests.push(request);if(requests.length>3)throw Error('correction call budget exceeded');
  return {id:'recorded-measurement-'+requests.length,stop_reason:'tool_use',content:[{type:'tool_use',id:'tool-'+requests.length,name:ASSIGNMENT_PLANNER_TOOL_NAME,input:JSON.parse(JSON.stringify(requests.length===1?original:replies?.[requests.length-2]??patch))}],usage:{input_tokens:1,output_tokens:1}} as never;
 });
 const options={providerReceipt:{draftDir,stage:'measurement-regression'}};
 return {rootDir,draftDir,childId,homeworkId,original,patch,packet,requests,run:()=>planAssignmentFromSourceWithTelemetry(packet,options)};
}
it('repairs only invalid measurement fields without deleting a valid reward or checkpoint references',async()=>{
 const {run,requests,original}=await fixture();
 const result=await run();
 expect(requests).toHaveLength(2);
 expect(Object.keys(requests[1].tools[0].input_schema.properties)).toEqual(['corrections']);
 expect(requests[1].system).toContain('only named measurement field corrections');
 expect(requests[1].tools[0].strict).toBe(true);
 expect(requests[0].tools[0].strict).toBeUndefined();
 expect(result.output.activeSessionPlan.boardDefinition).toEqual(original.activeSessionPlan.boardDefinition);
 expect(result.output.activeSessionPlan.nodePlan.map(node=>({id:node.id,type:node.type,title:node.title,targets:node.targets}))).toEqual(original.activeSessionPlan.nodePlan.map((node:any)=>({id:node.id,type:node.type,title:node.title,targets:node.targets})));
 expect(result.output.plannedMeasurements[1].spelling).toEqual(original.plannedMeasurements[1].spelling);
 expect(result.output.plannedMeasurements[2].spelling).toBeUndefined();
 await run();expect(requests).toHaveLength(2);
});

it.each(['unknown','duplicate'])('rejects %s patch paths before another provider request',async defect=>{
 const patch={path:'plannedMeasurements.0.spelling.evidenceIds',value:['observed-0']};
 const f=await fixture([{corrections:defect==='unknown'?[{path:'activeSessionPlan.nodePlan.0.type',value:'mystery'}]:[patch,patch]}]);
 await expect(f.run()).rejects.toThrow('planner_measurement_patch_invalid');
 expect(f.requests).toHaveLength(2);
 await expect(f.run()).rejects.toThrow('planner_measurement_patch_invalid');
 expect(f.requests).toHaveLength(2);
});
it('stops after two valid but incomplete correction attempts, preserving all receipts for restart',async()=>{
 const f=await fixture([{corrections:[{path:'plannedMeasurements.2.spelling',value:null}]},{corrections:[{path:'plannedMeasurements.0.spelling.evidenceIds',value:[]}]}]);
 await expect(f.run()).rejects.toThrow('assignment_planner_tool_invalid');
 expect(f.requests).toHaveLength(3);
 await expect(f.run()).rejects.toThrow('assignment_planner_tool_invalid');
 expect(f.requests).toHaveLength(3);
});
it('repairs a malformed whole spelling claim on an already-declared nonacademic reward',async()=>{
 const f=await fixture();f.original.plannedMeasurements[2].spelling={};
 const result=await f.run();
 expect(result.output.plannedMeasurements[2].spelling).toBeUndefined();
 expect(result.output.activeSessionPlan.nodePlan.some(node=>node.id==='reward')).toBe(true);
 expect(f.requests).toHaveLength(2);
});
async function seedLegacy(f:Awaited<ReturnType<typeof fixture>>,input:unknown,uncertain=false,suffix="tool-correction-v3-1"){
 return runMathProviderStage({draftDir:f.draftDir,stage:`measurement-regression-${suffix}`,model:'recorded',request:{originalRequestHash:hashDiscoveryContract(f.packet)},execute:async()=>{
  if(uncertain)throw Error('lost transport response');
  return {message:{id:'legacy-receipt',stop_reason:'tool_use',content:[{type:'tool_use',name:ASSIGNMENT_PLANNER_TOOL_NAME,input}],usage:{input_tokens:1,output_tokens:1}},latencyMs:1,createdAt:'2026-10-11T12:02:00Z'};
 }});
}
it('reuses a valid legacy measurement-only repair without repurchasing it',async()=>{
 const f=await fixture(),legacy=structuredClone(f.original);
 legacy.plannedMeasurements[0].spelling.evidenceIds=['observed-0','observed-1'];delete legacy.plannedMeasurements[2].spelling;
 await seedLegacy(f,legacy);
 const result=await f.run();
 expect(result.output.activeSessionPlan.boardDefinition).toEqual(f.original.activeSessionPlan.boardDefinition);
 expect(f.requests).toHaveLength(1);
 await f.run();expect(f.requests).toHaveLength(1);
});
it('preserves a legacy receipt that rewrote protected nodes, and repairs from the original plan',async()=>{
 const f=await fixture(),legacy=structuredClone(f.original);legacy.activeSessionPlan.nodePlan.pop();
 await seedLegacy(f,legacy);
 const files=fs.readdirSync(path.join(f.draftDir,'provider-receipts'));const before=files.map(file=>[file,fs.readFileSync(path.join(f.draftDir,'provider-receipts',file),'utf8')] as const);
 const result=await f.run();
 expect(result.output.activeSessionPlan.nodePlan.map(node=>node.id)).toEqual(f.original.activeSessionPlan.nodePlan.map((node:any)=>node.id));
 for(const[file,bytes]of before)expect(fs.readFileSync(path.join(f.draftDir,'provider-receipts',file),'utf8')).toBe(bytes);
 expect(f.requests).toHaveLength(2);
});
it('makes no replacement correction request after an uncertain legacy outcome',async()=>{
 const f=await fixture();await expect(seedLegacy(f,null,true)).rejects.toThrow('provider_outcome_uncertain');
 await expect(f.run()).rejects.toThrow('provider_outcome_uncertain');
 expect(f.requests).toHaveLength(1);
});
it('rejects a full correction that changes a protected theory',async()=>{
 const f=await fixture(),changed=structuredClone(f.original);changed.planTheory.hypothesis='A different educational claim';
 vi.mocked(requestPlannerMessage).mockImplementation(async(_client,request:any)=>{f.requests.push(request);return {id:'bad-theory-'+f.requests.length,stop_reason:'tool_use',content:[{type:'tool_use',name:ASSIGNMENT_PLANNER_TOOL_NAME,input:JSON.parse(JSON.stringify(f.requests.length===1?f.original:changed))}],usage:{input_tokens:1,output_tokens:1}} as never;});
 await expect(f.run()).rejects.toThrow('planner_measurement_correction_changed_protected_fields');
 expect(f.requests).toHaveLength(2);
});

it('gives the final bounded attempt a distinct identity even when the previous patch changes nothing',async()=>{
 const unchanged={corrections:[{path:'plannedMeasurements.0.spelling.evidenceIds',value:[]}]};
 const f=await fixture([unchanged,unchanged]);
 await expect(f.run()).rejects.toThrow('assignment_planner_tool_invalid');expect(f.requests).toHaveLength(3);
 await expect(f.run()).rejects.toThrow('assignment_planner_tool_invalid');expect(f.requests).toHaveLength(3);
});


it('preserves received v6 field patches while preserving now-valid practice references',async()=>{
 const f=await fixture();
 await seedLegacy(f,{corrections:[{path:'plannedMeasurements.0.spelling.interventionNodeIds',value:['check']}]},false,'measurement-field-correction-v6-1');
 const directory=path.join(f.draftDir,'provider-receipts');const before=fs.readdirSync(directory).map(file=>[file,fs.readFileSync(path.join(directory,file),'utf8')] as const);
 const result=await f.run();expect(f.requests).toHaveLength(2);
 expect(result.output.plannedMeasurements[0].spelling?.interventionNodeIds).toEqual(['check']);
 for(const[file,bytes]of before)expect(fs.readFileSync(path.join(directory,file),'utf8')).toBe(bytes);
 await f.run();expect(f.requests).toHaveLength(2);
});
it('does not replace an uncertain v6 field-patch request',async()=>{
 const f=await fixture();await expect(seedLegacy(f,null,true,'measurement-field-correction-v6-1')).rejects.toThrow('provider_outcome_uncertain');
 await expect(f.run()).rejects.toThrow('provider_outcome_uncertain');expect(f.requests).toHaveLength(1);
});


it.each(['instruction','practice'])('preserves authored %s relationships without a correction call',async role=>{
 const f=await fixture();
 f.original.plannedMeasurements[0].spelling.role=role;
 f.original.plannedMeasurements[0].spelling.evidenceIds=['observed-0','observed-1'];
 delete f.original.plannedMeasurements[2].spelling;
 const before=structuredClone(f.original);
 const result=await f.run();
 expect(f.requests).toHaveLength(1);
 expect(result.output.plannedMeasurements[0].spelling).toEqual(before.plannedMeasurements[0].spelling);
 expect(result.output.activeSessionPlan.boardDefinition).toEqual(before.activeSessionPlan.boardDefinition);
 expect(result.output.plannedMeasurements[1].spelling).toEqual(before.plannedMeasurements[1].spelling);
 const plan={...result.output.activeSessionPlan,childId:f.childId,domain:'spelling' as const,activeHomeworkId:f.homeworkId,plannedMeasurements:result.output.plannedMeasurements,planTheory:result.output.planTheory};
 const planBytes=JSON.stringify(plan);
 const cycle=getLearningCycle(f.childId,f.homeworkId,{rootDir:f.rootDir})!;
 const contract=buildSpellingTargetedCycleInput({cycle,plan,now:'2026-10-12T19:00:00Z'});
 expect(JSON.stringify(plan)).toBe(planBytes);
 const checkItems=Object.keys(contract.nodes.find(node=>node.nodeId==='check')!.evidenceContract.spellingItems!);
 expect(contract.academicPredictions).toHaveLength(checkItems.length);
 expect(contract.academicPredictions?.flatMap(prediction=>prediction.eligibility.checkpointItemIds)).toEqual(checkItems);
 expect(contract.academicPredictions?.every(prediction=>prediction.intervention==='practice')).toBe(true);
 await f.run();expect(f.requests).toHaveLength(1);
});
