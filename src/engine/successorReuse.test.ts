import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {linearJourneyFixture} from '../scripts/fixtures/authoredJourney';
import {seedSpellingLab} from '../scripts/fixtures/spellingEvidenceFirst';
import {buildSpellingRecallItems} from './learningCycleIngest';
import {createLearningCycle,getLearningCycle,projectLearningCycle} from './learningCycleRepository';
import {currentBoardInstance,successorResumeAction} from './learningBoardInstances';
import {prepareSuccessorBoard} from './canonicalProgressionGenerator';
import {resolveAdaptiveMathDraftDir} from './adaptiveMathDiscovery';
import {resolveChildContextDir} from '../utils/contextRoot';
import * as runtime from './learningCycleRuntime';
import * as canvas from './adventureBoardCanvas';

// 2026-10-21 human catch: the Planner told board 3 to reuse four proven activities, two of them Word
// Radar "exactly as before". Code sent all five to the AI builder, all failed, and Ila had nothing to
// play. Logs showed the reuse decisions as deferred bookkeeping; the lab only modeled built boards.
const roots:string[]=[];
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
const childId='reuse-lab',homeworkId='lab-assignment',words=['write','island'];
const wordRadarConfig={recallMode:'hidden_word_recall',inputMode:'keyboard'};
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fixture(){
 const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-successor-reuse-'));roots.push(rootDir);
 vi.stubEnv('SUNNY_CONTEXT_ROOT',path.join(rootDir,'src/context'));
 vi.stubGlobal('fetch',()=>{throw Error('lab_forbids_network');});
 seedSpellingLab(rootDir,words,'',childId);
 const items=buildSpellingRecallItems({homeworkId,words,evidenceIds:['school:lab'],measurementRole:'practice',exposure:'practiced',occasionId:'radar-check'});
 const evidenceContract={academic:true,engagement:true,companionObservations:true,spellingItems:Object.fromEntries(items.map(item=>[item.id,item])),nativeConfig:{activityId:'word-radar',wordRadarConfig}};
 // Board 1's built-in Word Radar, bound exactly as the first board binds native instruments.
 const configFile=path.join(resolveAdaptiveMathDraftDir(childId,homeworkId,{rootDir}),'native-instruments','radar-check.json');
 const configuration={version:1,node:{id:'radar-check',type:'word-radar',activityId:'word-radar',targets:words,difficulty:1,title:'Radar Check',wordRadarConfig},evidenceContract};
 fs.mkdirSync(path.dirname(configFile),{recursive:true});fs.writeFileSync(configFile,JSON.stringify(configuration));
 const localArtifactPath=`/${path.relative(resolveChildContextDir(childId,{rootDir}),configFile).split(path.sep).join('/')}`;
 createLearningCycle({childId,homeworkId,domain:'spelling',assignment:{title:'Lab assignment',contentFingerprint:'lab',capturedEvidenceIds:['school:lab'],targets:words},academicTheory:{theoryId:'lab-theory',revision:1,hypothesis:'Recall needs practice',supportCriteria:[],reviseCriteria:[],falsifyCriteria:[]},engagementTheory:null,boardDefinition:linearJourneyFixture(['radar-check']),initialLifecycle:'board_ready',nodes:[{
  nodeId:'radar-check',role:'baseline',title:'Radar Check',state:'ready',implementationType:'word-radar',academicTarget:{domain:'spelling',skill:'spelling',targets:words},algorithmOwner:'ai_tutor',theoryId:'lab-theory',experimentId:'radar-check',mechanic:'word-radar',theme:'world',openingScreen:{title:'Radar Check',purpose:'Check'},generationPrompt:null,
  artifactBinding:{contentId:`${homeworkId}:radar-check`,artifactId:`${homeworkId}:radar-check:native`,localArtifactPath,localArtworkPath:'/generated/world.jpeg',contractFingerprint:sha(configuration),validationStatus:'passed'},
  artwork:{status:'ready',localPath:'/generated/world.jpeg',prompt:null},sfxContract:[],companionContract:{events:[]},evidenceContract,evidenceIds:[],
 }]},{rootDir});
 runtime.recordCanonicalNodeCompletion({childId,homeworkId,nodeId:'radar-check',sessionId:'first-session',result:{completed:true,accuracy:0,timeSpent_ms:100,targetResults:items.map(item=>({target:item.id,correct:false,attemptedValue:'rite'}))}},{rootDir});
 const instrument=(nodeId:string,mechanic:string,creatorPrompt:string)=>({nodeId,title:nodeId.split(':')[1],academicTarget:'Spelling',mechanic,theme:'Illustrated world',openingPurpose:'Practice',creatorPrompt,spelling:{wordIds:items.map(item=>item.wordId),measurementRole:'practice',responseMode:'spelling_letters'}});
 const nextInstruments=[instrument(`${homeworkId}:radar-check`,'word-radar','Reuse the word-radar configuration exactly as before with fresh occasion IDs.'),instrument(`${homeworkId}:treasure-dig`,'treasure-dig','Build a new digging game.')];
 const decision={status:'revised',reason:'Re-check with the proven radar; try one new game.',progressionAction:'generate_support',preserve:[],change:[],testNext:[],nextEvidenceRequired:['Independent evidence'],predictionEvaluationIds:[],boardDefinition:linearJourneyFixture(nextInstruments.map(row=>row.nodeId)),nextInstruments};
 const create=vi.fn(async(_payload:unknown)=>({id:'recorded',stop_reason:'tool_use',content:[{type:'tool_use',name:'decide_learning_cycle_progression',input:decision}]}));
 return {rootDir,items,configuration,request:{childId,homeworkId,client:{messages:{stream:(payload:unknown)=>({finalMessage:()=>create(payload)})}} as never}};
}

it('re-launches an existing built-in activity the Planner names, with fresh question IDs and no AI build',async()=>{
 const f=fixture(),opts={rootDir:f.rootDir};
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 vi.spyOn(canvas,'verifyPreparingBoardCanvas').mockResolvedValue(undefined);
 const generateHtml=vi.fn(async({node}:any)=>`<html><body><h1>${node.title}</h1></body></html>`);
 const after=await prepareSuccessorBoard({childId,homeworkId,generateHtml,generateArtwork:async()=>'/generated/world.jpeg',validate:async()=>({passed:true,failures:[]})},opts);
 const board=currentBoardInstance(after);
 expect(board.kind).toBe('successor');
 const reused=after.nodes.find(node=>board.nodeIds.includes(node.nodeId)&&node.title==='radar-check')!;
 // Only the activity the Planner asked to be new goes to the AI builder.
 expect(generateHtml.mock.calls.map(([call]:any)=>call.node.nodeId)).toEqual([after.nodes.find(node=>board.nodeIds.includes(node.nodeId)&&node.title==='treasure-dig')!.nodeId]);
 expect(reused.implementationType).toBe('word-radar');
 expect(reused.evidenceContract.nativeConfig).toEqual(f.configuration.evidenceContract.nativeConfig);
 expect(reused.artifactBinding?.validationStatus).toBe('passed');
 // The re-launched game carries board 3's fresh question IDs, never board 1's.
 const file=path.join(resolveChildContextDir(childId,{rootDir:f.rootDir}),reused.artifactBinding!.localArtifactPath.replace(/^\/+/,''));
 const saved=JSON.parse(fs.readFileSync(file,'utf8'));
 expect(saved.node.id).toBe(reused.nodeId);
 expect(saved.node.wordRadarConfig).toEqual(wordRadarConfig);
 expect(Object.keys(saved.evidenceContract.spellingItems)).toEqual(Object.keys(reused.evidenceContract.spellingItems!));
 expect(Object.keys(reused.evidenceContract.spellingItems!).some(id=>f.items.some(item=>item.id===id))).toBe(false);
 expect(reused.artifactBinding!.contractFingerprint).toBe(sha(saved));
 const planNode=projectLearningCycle(after).activeSessionPlan.nodePlan.find(node=>node.id===reused.nodeId)!;
 expect(planNode).toMatchObject({type:'word-radar',wordRadarConfig});
 // Answers on the re-launched game land on the new board's questions.
 const played=runtime.recordCanonicalNodeCompletion({childId,homeworkId,nodeId:reused.nodeId,sessionId:'board-2-session',result:{completed:true,accuracy:1,timeSpent_ms:100,targetResults:Object.keys(reused.evidenceContract.spellingItems!).map(target=>({target,correct:true,attemptedValue:'write'}))}},opts)!;
 expect(played.observations.filter(row=>reused.evidenceContract.spellingItems![row.itemId]).length).toBe(words.length);
 // Finishing the board hands the new evidence back to the Planner: the loop continues.
 const built=after.nodes.find(node=>board.nodeIds.includes(node.nodeId)&&node.title==='treasure-dig')!;
 const finished=runtime.recordCanonicalNodeCompletion({childId,homeworkId,nodeId:built.nodeId,sessionId:'board-2-session',result:{completed:true,accuracy:1,timeSpent_ms:100,targetResults:Object.keys(built.evidenceContract.spellingItems!).map(target=>({target,correct:true,attemptedValue:'island'}))}},opts)!;
 expect(successorResumeAction(finished)).toBe('decide');
});

it('keeps a reused activity playable across restarts without rebuilding it',async()=>{
 const f=fixture(),opts={rootDir:f.rootDir};
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 vi.spyOn(canvas,'verifyPreparingBoardCanvas').mockResolvedValue(undefined);
 const generateHtml=vi.fn(async({node}:any)=>`<html><body><h1>${node.title}</h1></body></html>`);
 const prepare=()=>prepareSuccessorBoard({childId,homeworkId,generateHtml,generateArtwork:async()=>'/generated/world.jpeg',validate:async()=>({passed:true,failures:[]})},opts);
 const first=await prepare();
 expect(await prepare()).toEqual(first);
 expect(generateHtml).toHaveBeenCalledTimes(1);
 expect(getLearningCycle(childId,homeworkId,opts)).toEqual(first);
});

it('never reuses a practice activity as a checkpoint, so a check cannot show the answer',async()=>{
 const f=fixture(),opts={rootDir:f.rootDir};
 // The Planner asks for a fresh checkpoint but names board 1's practice-only radar.
 const cycle=getLearningCycle(childId,homeworkId,opts)!;
 expect(Object.values(cycle.nodes[0].evidenceContract.itemRoles??{}).every(role=>role==='practice')).toBe(true);
 const stream=(f.request as any).client.messages.stream;
 (f.request as any).client.messages.stream=(payload:unknown)=>({finalMessage:async()=>{const response=await stream(payload).finalMessage();for(const row of response.content[0].input.nextInstruments)row.spelling.measurementRole='fresh_checkpoint';return response;}});
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 const next=getLearningCycle(childId,homeworkId,opts)!;
 const radar=next.nodes.find(node=>node.title==='radar-check'&&node.nodeId!=='radar-check')!;
 expect(radar.reusedFrom).toBeUndefined();
 expect(radar.implementationType).toBeUndefined();
});
