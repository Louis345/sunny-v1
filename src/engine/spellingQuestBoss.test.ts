import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {linearJourneyFixture} from '../scripts/fixtures/authoredJourney';
import {seedSpellingLab} from '../scripts/fixtures/spellingEvidenceFirst';
import {plainDraw,successorToolReply} from '../scripts/fixtures/successorToolConversation';
import {buildSpellingRecallItems} from './learningCycleIngest';
import {createLearningCycle,getLearningCycle,projectLearningCycle} from './learningCycleRepository';
import {currentBoardInstance} from './learningBoardInstances';
import {prepareSuccessorBoard} from './canonicalProgressionGenerator';
import {resolveAdaptiveMathDraftDir} from './adaptiveMathDiscovery';
import {resolveChildContextDir} from '../utils/contextRoot';
import * as runtime from './learningCycleRuntime';
import * as canvas from './adventureBoardCanvas';

// Owner, 2026-11-05: spelling Quest and Boss use her own list words. Quest is the primer, Boss the final
// check before the graded test. Until today the spelling Planner was never offered either, so a child
// could finish board after board without a Quest. This walks one cycle from her first fresh check
// through Quest and Boss to waiting for the graded test, the way the kiosk saves it.
const roots:string[]=[];
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
const childId='quest-lab',homeworkId='quest-assignment',words=['write','island'];
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fixture(){
 const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-quest-boss-'));roots.push(rootDir);
 vi.stubEnv('SUNNY_CONTEXT_ROOT',path.join(rootDir,'src/context'));
 vi.stubGlobal('fetch',()=>{throw Error('lab_forbids_network');});
 vi.spyOn(canvas,'verifyPreparingBoardCanvas').mockResolvedValue(undefined);
 seedSpellingLab(rootDir,words,'',childId);
 const items=buildSpellingRecallItems({homeworkId,words,evidenceIds:['school:lab'],measurementRole:'fresh_checkpoint',exposure:'practiced',occasionId:'radar-check'});
 const wordRadarConfig={recallMode:'hidden_word_recall',inputMode:'keyboard'};
 const evidenceContract={academic:true,engagement:true,companionObservations:true,spellingItems:Object.fromEntries(items.map(item=>[item.id,item])),
  itemRoles:Object.fromEntries(items.map(item=>[item.id,'fresh_checkpoint'])),nativeConfig:{activityId:'word-radar',wordRadarConfig}};
 const configFile=path.join(resolveAdaptiveMathDraftDir(childId,homeworkId,{rootDir}),'native-instruments','radar-check.json');
 const configuration={version:1,node:{id:'radar-check',type:'word-radar',activityId:'word-radar',targets:words,difficulty:1,title:'Radar Check',wordRadarConfig},evidenceContract};
 fs.mkdirSync(path.dirname(configFile),{recursive:true});fs.writeFileSync(configFile,JSON.stringify(configuration));
 const localArtifactPath=`/${path.relative(resolveChildContextDir(childId,{rootDir}),configFile).split(path.sep).join('/')}`;
 const node=(nodeId:string,role:string,state:string)=>({
  nodeId,role,title:'Radar Check',state,implementationType:'word-radar',academicTarget:{domain:'spelling',skill:'spelling',targets:words},algorithmOwner:'ai_tutor',theoryId:'lab-theory',experimentId:nodeId,mechanic:'word-radar',theme:'world',openingScreen:{title:'Radar Check',purpose:'Check'},generationPrompt:null,
  artifactBinding:{contentId:`${homeworkId}:${nodeId}`,artifactId:`${homeworkId}:${nodeId}:native`,localArtifactPath,localArtworkPath:'/generated/world.jpeg',contractFingerprint:sha(configuration),validationStatus:'passed'},
  artwork:{status:'ready',localPath:'/generated/world.jpeg',prompt:null},sfxContract:[],companionContract:{events:[]},evidenceContract,evidenceIds:[]});
 createLearningCycle({childId,homeworkId,domain:'spelling',assignment:{title:'Lab assignment',contentFingerprint:'lab',capturedEvidenceIds:['school:lab'],targets:words},
  academicTheory:{theoryId:'lab-theory',revision:1,hypothesis:'Recall needs practice',supportCriteria:[],reviseCriteria:[],falsifyCriteria:[]},engagementTheory:null,
  boardDefinition:linearJourneyFixture(['radar-check']),initialLifecycle:'board_ready',nodes:[node('radar-check','baseline','ready') as never]},{rootDir});
 // Her first check (Discovery), as the kiosk saved it: one fresh word right on her own.
 const file=path.join(resolveChildContextDir(childId,{rootDir}),'homework','cycles',`${homeworkId}.json`);
 const saved=JSON.parse(fs.readFileSync(file,'utf8'));
 saved.nodes.push({...node(`${homeworkId}:discovery`,'evaluation','completed'),academicTarget:{domain:'spelling',skill:'independent_recall',targets:words}});
 saved.observations.push({observationId:'discovery-1',itemId:items[0].id,sourceId:`evaluation:${homeworkId}:discovery`,childResponse:'write',
  constructLinks:[{constructId:items[0].constructId,role:'primary',confidence:1}],result:{correct:true,score:1},assistance:{status:'unassisted',scaffolds:[]},
  exposure:'unseen',provenance:'independent_probe',observedAt:'2026-11-01T18:00:00.000Z',confounds:[`word_id:${items[0].wordId}`,'measurement_role:fresh_checkpoint','first_response']});
 fs.writeFileSync(file,JSON.stringify(saved));
 const opts={rootDir};
 let decision:any;
 const requests:any[]=[];
 const stream=vi.fn((payload:any)=>{requests.push(structuredClone(payload));return {finalMessage:async()=>successorToolReply(decision,payload)};});
 const request={childId,homeworkId,client:{messages:{stream}} as never,draw:plainDraw};
 const plan=(action:string,encounter?:string)=>{decision={status:'supported',reason:'From her checks.',progressionAction:action,preserve:[],change:[],testNext:[],nextEvidenceRequired:['Her typed words'],predictionEvaluationIds:[],
  ...(action==='await_calibration'?{}:{nextInstruments:[{nodeId:`${homeworkId}:radar-check`,title:encounter??'Radar',academicTarget:'Spelling',openingPurpose:'Check',encounter,spelling:{builtInActivityId:'radar-check',wordIds:items.map(item=>item.wordId)}}],
   boardDefinition:linearJourneyFixture([`${homeworkId}:radar-check`])})};};
 const build=()=>prepareSuccessorBoard({childId,homeworkId,generateHtml:async()=>'<html></html>',generateArtwork:async()=>'/generated/world.jpeg',validate:async()=>({passed:true,failures:[]})},opts);
 // She types every word of a node herself, then finishes it.
 const play=(nodeId:string,session:string)=>{
  const cycle=getLearningCycle(childId,homeworkId,opts)!;
  const own=Object.values(cycle.nodes.find(row=>row.nodeId===nodeId)!.evidenceContract.spellingItems!);
  own.forEach((item,index)=>runtime.recordSpellingDiscoveryAttempt({childId,homeworkId,attempt:{attemptId:`${session}-${index}`,itemId:item.id,attemptedValue:item.word,observedAt:new Date().toISOString()},support:{status:'unassisted',scaffolds:[]}},opts));
  return runtime.recordCanonicalNodeCompletion({childId,homeworkId,nodeId,sessionId:session,result:{completed:true,accuracy:1,timeSpent_ms:100,targetResults:own.map(item=>({target:item.id,correct:true,attemptedValue:item.word}))}},opts)!;
 };
 return {rootDir,opts,items,requests,stream,request,plan,build,play};
}

it('runs a spelling cycle through Quest and Boss to the graded test',async()=>{
 const f=fixture();
 expect(f.play('radar-check','board-1').lifecycle).toBe('baseline_evaluating');

 // Quest: offered because her first check had a fresh word right, and marked on exactly one step.
 f.plan('generate_quest','quest');
 await runtime.advanceCanonicalCycleFromEvidence(f.request,f.opts);
 const tools=f.requests[0].tools;
 expect(tools.find((tool:any)=>tool.name==='decide').input_schema.properties.progression_action.enum).toEqual(['generate_support','generate_quest','collect_more_evidence']);
 expect(tools.find((tool:any)=>tool.name==='add_step').input_schema.properties.encounter.enum).toEqual(['none','quest']);
 const quest=await f.build();
 expect(quest.lifecycle).toBe('quest_ready');
 const questNode=quest.nodes.find(row=>currentBoardInstance(quest).nodeIds.includes(row.nodeId))!;
 expect(questNode.role).toBe('quest');
 expect(Object.values(questNode.evidenceContract.spellingItems!).every(item=>item.lineage.measurementRole==='fresh_checkpoint')).toBe(true);
 // On her map it is a Quest, so the unlock ceremony and its star show.
 const kindOn=(cycle:any,nodeId:string)=>(projectLearningCycle(cycle) as any).adventureBoard.nodes.find((row:any)=>row.activityNodeId===nodeId)?.kind;
 expect(kindOn(quest,questNode.nodeId)).toBe('quest');

 // Her typed Quest words are independent recall of practiced words: never unseen.
 const afterQuest=f.play(questNode.nodeId,'quest');
 expect(afterQuest.lifecycle).toBe('quest_evaluating');
 const questAnswers=afterQuest.observations.filter(row=>row.sourceId===`activity:${questNode.nodeId}:recall`);
 expect(questAnswers.length).toBe(2);
 expect(questAnswers.every(row=>row.provenance==='independent_probe'&&row.exposure==='previously_practiced')).toBe(true);

 // Boss: offered only after the Quest, and it unlocks from her Quest answers.
 f.requests.length=0;
 f.plan('generate_boss','boss');
 await runtime.advanceCanonicalCycleFromEvidence(f.request,f.opts);
 expect(f.requests[0].tools.find((tool:any)=>tool.name==='decide').input_schema.properties.progression_action.enum).toEqual(['generate_boss','generate_support','await_calibration']);
 const boss=await f.build();
 expect(boss.lifecycle).toBe('boss_ready');
 const bossNode=boss.nodes.find(row=>currentBoardInstance(boss).nodeIds.includes(row.nodeId))!;
 expect(bossNode.role).toBe('boss');
 expect(kindOn(boss,bossNode.nodeId)).toBe('boss');

 // After Boss, Sunny waits for the graded test; the app's own score cannot close the cycle.
 expect(f.play(bossNode.nodeId,'boss').lifecycle).toBe('boss_evaluating');
 f.requests.length=0;
 f.plan('await_calibration');
 const done=await runtime.advanceCanonicalCycleFromEvidence(f.request,f.opts);
 expect(f.requests[0].tools.find((tool:any)=>tool.name==='decide').input_schema.properties.progression_action.enum).toEqual(['await_calibration']);
 expect(done.lifecycle).toBe('awaiting_calibration');
});

it('refuses a Quest step the decision did not authorize, and a game that shows her words',async()=>{
 const f=fixture();
 f.play('radar-check','board-1');
 f.plan('generate_support','quest');
 await expect(runtime.advanceCanonicalCycleFromEvidence(f.request,f.opts)).rejects.toThrow();
 const errors=f.requests.flatMap((row:any)=>row.messages.flatMap((message:any)=>Array.isArray(message.content)?message.content:[])).filter((block:any)=>block.type==='tool_result'&&block.is_error).map((block:any)=>String(block.content));
 expect(errors.some(error=>/needs progression_action generate_quest/.test(error))).toBe(true);
});

// Contract 54 (owner, 2026-11-07): the Planner decides when Quest is justified; code adds no evidence gate. Her
// answers are still recorded exactly as they happened, so a Quest chosen on thin evidence shows in the record.
it('offers Quest to the Planner with no evidence gate, even when no fresh answer was right',async()=>{
 const f=fixture();
 const file=path.join(resolveChildContextDir(childId,{rootDir:f.rootDir}),'homework','cycles',`${homeworkId}.json`);
 const saved=JSON.parse(fs.readFileSync(file,'utf8'));
 saved.observations=saved.observations.filter((row:any)=>row.observationId!=='discovery-1');
 fs.writeFileSync(file,JSON.stringify(saved));
 const radar=Object.values(getLearningCycle(childId,homeworkId,f.opts)!.nodes.find(row=>row.nodeId==='radar-check')!.evidenceContract.spellingItems!);
 radar.forEach((item,index)=>runtime.recordSpellingDiscoveryAttempt({childId,homeworkId,attempt:{attemptId:`miss-${index}`,itemId:item.id,attemptedValue:'zzz',observedAt:new Date().toISOString()},support:{status:'unassisted',scaffolds:[]}},f.opts));
 expect(runtime.recordCanonicalNodeCompletion({childId,homeworkId,nodeId:'radar-check',sessionId:'thin',result:{completed:true,accuracy:0,timeSpent_ms:100,targetResults:radar.map(item=>({target:item.id,correct:false,attemptedValue:'zzz'}))}},f.opts)!.lifecycle).toBe('baseline_evaluating');
 f.plan('generate_quest','quest');
 await runtime.advanceCanonicalCycleFromEvidence(f.request,f.opts);
 expect(f.requests[0].tools.find((tool:any)=>tool.name==='decide').input_schema.properties.progression_action.enum).toContain('generate_quest');
 expect((await f.build()).lifecycle).toBe('quest_ready');
});
