import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {linearJourneyFixture} from '../scripts/fixtures/authoredJourney';
import {seedSpellingLab} from '../scripts/fixtures/spellingEvidenceFirst';
import {buildSpellingRecallItems} from './learningCycleIngest';
import {createLearningCycle,getLearningCycle,projectLearningCycle,repointReusedSetup} from './learningCycleRepository';
import {validateLetterRushConfig} from './activityEngineConfig';
import {currentBoardInstance,successorResumeAction} from './learningBoardInstances';
import {prepareSuccessorBoard} from './canonicalProgressionGenerator';
import {resolveAdaptiveMathDraftDir} from './adaptiveMathDiscovery';
import {resolveChildContextDir} from '../utils/contextRoot';
import * as runtime from './learningCycleRuntime';
import * as canvas from './adventureBoardCanvas';
import {validateVisualLearnerArtifactConfig} from '../shared/visualLearnerArtifactConfig';

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

// 2026-10-21 human catch (demo copy of Ila): the re-launched explainer still reported board 1's question
// IDs on completion, so learning_cycle_instrument_unknown_item rejected it three times and the board
// never finished. The lab above only exercised Word Radar, whose setup carries no question IDs.
const explainerWords=['write','island','minus'];
function explainerFixture(plannerWords:string[]){
 const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-successor-reuse-explainer-'));roots.push(rootDir);
 vi.stubEnv('SUNNY_CONTEXT_ROOT',path.join(rootDir,'src/context'));
 vi.stubGlobal('fetch',()=>{throw Error('lab_forbids_network');});
 seedSpellingLab(rootDir,explainerWords,'',childId);
 const nodeId='explain-long-i';
 const items=buildSpellingRecallItems({homeworkId,words:explainerWords,evidenceIds:['school:lab'],measurementRole:'practice',exposure:'practiced',occasionId:nodeId});
 const byWord=new Map(items.map(item=>[item.word,item]));
 // Built exactly as first-board ingestion builds a spelling explainer (learningCycleIngest.ts).
 const nativeConfig=validateVisualLearnerArtifactConfig({
  artifactId:`${homeworkId}:${nodeId}:visual-explainer`,type:'visual-explainer',concept:'Silent letters',learningGoal:'Keep the silent letter',misconception:'Spelling by sound alone',
  sourceEvidence:{source:`assignment:${homeworkId}`,capturedAt:'2026-10-18T00:00:00Z',summary:'Silent letters were dropped'},algorithmTargets:['error-pattern-remediation','retrieval-practice'],
  reuseDecision:{status:'candidate',reason:'Planner-selected assisted spelling instruction.'},parentApproval:{status:'pending'},mode:{default:'pause-for-question'},preview:{allowPlaythrough:true},
  narration:{enabled:false,provider:'companion',voiceId:'runtime-companion',modelId:'runtime-companion',audioPath:'none',scriptPath:'none',timings:[{id:'strategy',startProgress:0,endProgress:100,text:'Spot the silent letter'}]},
  questions:[{id:'check-write',prompt:'Which letter is silent in write?',options:[{id:'w',label:'w',correct:true},{id:'t',label:'t',correct:false}],correctOptionId:'w',targetConcept:byWord.get('write')!.id,misconceptionTag:'sound-only',pauseAtProgress:48,scaffoldLevel:2}],
  companionContext:{role:'hint_only',maxSentences:3,canRevealAnswer:true},
  evidence:{targetResults:items.map(item=>item.id),completion:`${nodeId}:assisted-visual-instruction-complete`},
  chrome:{childShowsEvidence:false,parentShowsEvidence:true,childShowsCarePlan:false,parentShowsCarePlan:true},
  spellingModel:{strategy:{title:'Spot the silent letter',steps:['Say it.','Find the quiet letter.']},words:[
   {id:byWord.get('write')!.id,text:'write',chunks:['wr','ite'],focusChunk:'wr',tip:'The w is silent.'},
   {id:byWord.get('island')!.id,text:'island',chunks:['is','land'],focusChunk:'is',tip:'The s is silent.'},
   {id:byWord.get('minus')!.id,text:'minus',chunks:['mi','nus'],focusChunk:'mi',tip:'Long i at the start.'}]},
 }) as unknown as Record<string,unknown>;
 const evidenceContract={academic:true,engagement:true,companionObservations:true,spellingItems:Object.fromEntries(items.map(item=>[item.id,item])),itemRoles:Object.fromEntries(items.map(item=>[item.id,'practice'])),nativeConfig};
 const configFile=path.join(resolveAdaptiveMathDraftDir(childId,homeworkId,{rootDir}),'native-instruments',`${nodeId}.json`);
 const configuration={version:1,node:{id:nodeId,type:'visual-explainer',activityId:'visual-explainer',targets:explainerWords,difficulty:1,title:'Long i Secrets'},evidenceContract};
 fs.mkdirSync(path.dirname(configFile),{recursive:true});fs.writeFileSync(configFile,JSON.stringify(configuration));
 createLearningCycle({childId,homeworkId,domain:'spelling',assignment:{title:'Lab assignment',contentFingerprint:'lab',capturedEvidenceIds:['school:lab'],targets:explainerWords},academicTheory:{theoryId:'lab-theory',revision:1,hypothesis:'Silent letters need teaching',supportCriteria:[],reviseCriteria:[],falsifyCriteria:[]},engagementTheory:null,boardDefinition:linearJourneyFixture([nodeId]),initialLifecycle:'board_ready',nodes:[{
  nodeId,role:'baseline',title:'Long i Secrets',state:'ready',implementationType:'visual-explainer',academicTarget:{domain:'spelling',skill:'spelling',targets:explainerWords},algorithmOwner:'ai_tutor',theoryId:'lab-theory',experimentId:nodeId,mechanic:'visual-explainer',theme:'world',openingScreen:{title:'Long i Secrets',purpose:'Teach'},generationPrompt:null,
  artifactBinding:{contentId:`${homeworkId}:${nodeId}`,artifactId:`${homeworkId}:${nodeId}:native`,localArtifactPath:'/games/spelling-visual-explainer.html',localArtworkPath:'/generated/world.jpeg',contractFingerprint:sha(configuration),validationStatus:'passed'},
  artwork:{status:'ready',localPath:'/generated/world.jpeg',prompt:null},sfxContract:[],companionContract:{events:[]},evidenceContract,evidenceIds:[],
 } as any]},{rootDir});
 // The explainer's real completion: the shared runtime reports exactly config.evidence.targetResults.
 const explainerCompletion=(config:any)=>config.evidence.targetResults.map((target:string)=>({target,evidenceRole:'assisted_instruction',scaffoldLevel:2,masteryEligible:false}));
 runtime.recordCanonicalNodeCompletion({childId,homeworkId,nodeId,sessionId:'first-session',result:{completed:true,accuracy:1,timeSpent_ms:100,targetResults:explainerCompletion(nativeConfig)}},{rootDir});
 const nextInstruments=[{nodeId:`${homeworkId}:${nodeId}`,title:'Silent Letter Detective Camp',academicTarget:'Spelling',mechanic:'visual-explainer',theme:'Detective camp',openingPurpose:'Re-teach',creatorPrompt:'Build a visual-explainer reusing the proven framing.',spelling:{wordIds:plannerWords.map(word=>byWord.get(word)!.wordId),measurementRole:'practice',responseMode:'spelling_letters'}}];
 const decision={status:'revised',reason:'Re-teach the missed silent-letter words.',progressionAction:'generate_support',preserve:[],change:[],testNext:[],nextEvidenceRequired:['Independent evidence'],predictionEvaluationIds:[],boardDefinition:linearJourneyFixture(nextInstruments.map(row=>row.nodeId)),nextInstruments};
 const create=vi.fn(async(_payload:unknown)=>({id:'recorded',stop_reason:'tool_use',content:[{type:'tool_use',name:'decide_learning_cycle_progression',input:decision}]}));
 return {rootDir,items,explainerCompletion,request:{childId,homeworkId,client:{messages:{stream:(payload:unknown)=>({finalMessage:()=>create(payload)})}} as never}};
}

it('re-launches a reused explainer whose real completion lands on the new board, with the Planner\'s narrowed words',async()=>{
 const f=explainerFixture(['write','island']),opts={rootDir:f.rootDir};
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 vi.spyOn(canvas,'verifyPreparingBoardCanvas').mockResolvedValue(undefined);
 const generateHtml=vi.fn(async()=>'<html></html>');
 const after=await prepareSuccessorBoard({childId,homeworkId,generateHtml,generateArtwork:async()=>'/generated/world.jpeg',validate:async()=>({passed:true,failures:[]})},opts);
 const board=currentBoardInstance(after);
 const reused=after.nodes.find(node=>board.nodeIds.includes(node.nodeId))!;
 expect(generateHtml).not.toHaveBeenCalled();
 expect(reused.reusedFrom).toBe('explain-long-i');
 const config=reused.evidenceContract.nativeConfig as any;
 // No identity from board 1 survives in the re-launched setup.
 for (const old of f.items) expect(JSON.stringify(config)).not.toContain(old.id);
 expect(config.spellingModel.words.map((word:any)=>word.text)).toEqual(['write','island']);
 expect(validateVisualLearnerArtifactConfig(config)).toBeTruthy();
 const played=runtime.recordCanonicalNodeCompletion({childId,homeworkId,nodeId:reused.nodeId,sessionId:'board-2-session',result:{completed:true,accuracy:1,timeSpent_ms:100,targetResults:f.explainerCompletion(config)}},opts)!;
 expect(played.nodes.find(node=>node.nodeId===reused.nodeId)?.state).toBe('completed');
 expect(successorResumeAction(played)).toBe('decide');
});

it('sends an explainer to the builder instead of re-launching it when its check question would be dropped',async()=>{
 const f=explainerFixture(['island','minus']),opts={rootDir:f.rootDir};
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 const next=getLearningCycle(childId,homeworkId,opts)!;
 const node=next.nodes.find(row=>row.title==='Silent Letter Detective Camp')!;
 expect(node.reusedFrom).toBeUndefined();
 expect(node.evidenceContract.nativeConfig).toBeUndefined();
});

// 2026-10-22 harness catch (self-run kiosk robot): a reused Letter Rush whose activity ID was literally
// "letter-rush" had its game type rewritten to the new node ID, so the kiosk's config request returned 422
// and the game said it could not load. The re-point treated every matching string as an identity.
it('re-points only compound identities, never a bare value that happens to equal the old activity ID',()=>{
 const items=buildSpellingRecallItems({homeworkId,words,evidenceIds:['school:lab'],measurementRole:'practice',exposure:'practiced',occasionId:'letter-rush'});
 const config={schemaVersion:1,activityId:'letter-rush',mode:'read-and-race',topic:'Current spelling gaps',domain:'spelling',learningGoal:'Practice missed words',gradeBand:'early_elementary',
  scaffolds:{showWord:true,letterBank:true,allowRetryBeforeScore:true,companionHints:false},words:words.map(text=>({text})),
  evidencePolicy:{writesPracticeEvidence:true,writesMasteryEvidence:false,requiresPerTargetResult:true,allowedEvidence:['practice']}};
 expect(validateLetterRushConfig(config).ok).toBe(true);
 const source={nodeId:'letter-rush',implementationType:'letter-rush',evidenceContract:{spellingItems:Object.fromEntries(items.map(item=>[item.id,item])),nativeConfig:config}} as any;
 const fresh=buildSpellingRecallItems({homeworkId,words,evidenceIds:['school:lab'],measurementRole:'practice',exposure:'practiced',occasionId:'b3'});
 const repointed=repointReusedSetup(source,`${homeworkId}:b3:letter-rush`,fresh)!;
 expect(repointed.activityId).toBe('letter-rush');
 expect(validateLetterRushConfig(repointed).ok).toBe(true);
});

it('does not reuse a setup that its own game would reject',()=>{
 const items=buildSpellingRecallItems({homeworkId,words,evidenceIds:['school:lab'],measurementRole:'practice',exposure:'practiced',occasionId:'letter-rush'});
 const source={nodeId:'old-rush',implementationType:'letter-rush',evidenceContract:{spellingItems:Object.fromEntries(items.map(item=>[item.id,item])),nativeConfig:{schemaVersion:1,activityId:'letter-rush'}}} as any;
 expect(repointReusedSetup(source,`${homeworkId}:b3:old-rush`,items)).toBeUndefined();
});
