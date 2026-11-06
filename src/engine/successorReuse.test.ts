import fs from 'node:fs';
import {spellingActivityMenu} from './spellingTeachingTools';
import {spellingActivityCatalog} from './assignmentPlanner';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {linearJourneyFixture} from '../scripts/fixtures/authoredJourney';
import {seedSpellingLab} from '../scripts/fixtures/spellingEvidenceFirst';
import {plainDraw,saveOldFormDecision,successorToolReply} from '../scripts/fixtures/successorToolConversation';
import {buildSpellingRecallItems} from './learningCycleIngest';
import {canonicalJourneyLaunchable,createLearningCycle,getLearningCycle,projectLearningCycle,repointReusedSetup} from './learningCycleRepository';
import {validateLetterRushConfig} from './activityEngineConfig';
import {boardTopologyHash,currentBoardInstance,successorResumeAction} from './learningBoardInstances';
import {prepareSuccessorBoard,repairNotReadyActivity} from './canonicalProgressionGenerator';
import {resolveAdaptiveMathDraftDir} from './adaptiveMathDiscovery';
import {resolveChildContextDir} from '../utils/contextRoot';
import * as runtime from './learningCycleRuntime';
import * as canvas from './adventureBoardCanvas';
import {validateVisualLearnerArtifactConfig} from '../shared/visualLearnerArtifactConfig';
import {writeWaterfallContentCatalog} from '../profiles/chartWaterfall';
import {getChildChart} from '../profiles/childChart';

// 2026-10-21 human catch: the Planner told board 3 to reuse four proven activities, two of them Word
// Radar "exactly as before". Code sent all five to the AI builder, all failed, and Ila had nothing to
// play. Logs showed the reuse decisions as deferred bookkeeping; the lab only modeled built boards.
const roots:string[]=[];
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
const childId='reuse-lab',homeworkId='lab-assignment',words=['write','island'];
const wordRadarConfig={recallMode:'hidden_word_recall',inputMode:'keyboard'};
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fixture(answerForms?:string[][]){
 const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-successor-reuse-'));roots.push(rootDir);
 vi.stubEnv('SUNNY_CONTEXT_ROOT',path.join(rootDir,'src/context'));
 vi.stubGlobal('fetch',()=>{throw Error('lab_forbids_network');});
 seedSpellingLab(rootDir,words,'',childId);
 const items=buildSpellingRecallItems({homeworkId,words,evidenceIds:['school:lab'],measurementRole:'practice',exposure:'practiced',occasionId:'radar-check'})
  .map((item,index)=>answerForms?{...item,response:{mode:'tap_selection' as const,acceptedForms:answerForms[index],caseSensitive:false}}:item);
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
 const create=vi.fn(async(payload:unknown)=>successorToolReply(decision,payload));
 return {rootDir,items,configuration,create,decision,request:{childId,homeworkId,client:{messages:{stream:(payload:unknown)=>({finalMessage:()=>create(payload)})}} as never,draw:plainDraw}};
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
 // Nothing goes to the AI builder: the step with no built-in to re-run is Not ready (contract 50).
 expect(generateHtml).not.toHaveBeenCalled();
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
 // The Not ready step is passed over, so finishing the re-run hands the evidence back to the Planner.
 expect(successorResumeAction(played)).toBe('decide');
});

it('keeps a reused activity playable across restarts without rebuilding it',async()=>{
 const f=fixture(),opts={rootDir:f.rootDir};
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 vi.spyOn(canvas,'verifyPreparingBoardCanvas').mockResolvedValue(undefined);
 const generateHtml=vi.fn(async({node}:any)=>`<html><body><h1>${node.title}</h1></body></html>`);
 const prepare=()=>prepareSuccessorBoard({childId,homeworkId,generateHtml,generateArtwork:async()=>'/generated/world.jpeg',validate:async()=>({passed:true,failures:[]})},opts);
 const first=await prepare();
 expect(await prepare()).toEqual(first);
 expect(generateHtml).not.toHaveBeenCalled();
 expect(getLearningCycle(childId,homeworkId,opts)).toEqual(first);
});

it('never reuses a practice activity as a checkpoint, so a check cannot show the answer',async()=>{
 const f=fixture(),opts={rootDir:f.rootDir};
 // Board 1's radar is practice-only. A step's role comes from the built-in it re-runs, so the Planner
 // has no way to order this radar as a fresh checkpoint: the tool has no role to write.
 const cycle=getLearningCycle(childId,homeworkId,opts)!;
 expect(Object.values(cycle.nodes[0].evidenceContract.itemRoles??{}).every(role=>role==='practice')).toBe(true);
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 const addStep=(f.create.mock.calls[0][0] as any).tools.find((tool:any)=>tool.name==='add_step').input_schema;
 expect(Object.keys(addStep.properties)).not.toContain('role');
 const next=getLearningCycle(childId,homeworkId,opts)!;
 const radar=next.nodes.find(node=>node.title==='radar-check'&&node.nodeId!=='radar-check')!;
 expect(Object.values(radar.evidenceContract.itemRoles??{}).every(role=>role==='practice')).toBe(true);
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
 const create=vi.fn(async(payload:unknown)=>successorToolReply(decision,payload));
 return {rootDir,items,explainerCompletion,request:{childId,homeworkId,client:{messages:{stream:(payload:unknown)=>({finalMessage:()=>create(payload)})}} as never,draw:plainDraw}};
}

it('re-launches a reused explainer whose real completion lands on the new board',async()=>{
 const f=explainerFixture(explainerWords),opts={rootDir:f.rootDir};
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
 expect(config.spellingModel.words.map((word:any)=>word.text)).toEqual(explainerWords);
 expect(validateVisualLearnerArtifactConfig(config)).toBeTruthy();
 const played=runtime.recordCanonicalNodeCompletion({childId,homeworkId,nodeId:reused.nodeId,sessionId:'board-2-session',result:{completed:true,accuracy:1,timeSpent_ms:100,targetResults:f.explainerCompletion(config)}},opts)!;
 expect(played.nodes.find(node=>node.nodeId===reused.nodeId)?.state).toBe('completed');
 expect(successorResumeAction(played)).toBe('decide');
});

it('re-runs an explainer for the Planner\'s narrowed words, since its setup carries question IDs',async()=>{
 const f=explainerFixture(['write','island']),opts={rootDir:f.rootDir};
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 const node=getLearningCycle(childId,homeworkId,opts)!.nodes.find(row=>row.title==='Silent Letter Detective Camp')!;
 expect(node.reusedFrom).toBe('explain-long-i');
 expect((node.evidenceContract.nativeConfig as any).spellingModel.words.map((word:any)=>word.text)).toEqual(['write','island']);
 expect(JSON.stringify(node.evidenceContract.nativeConfig)).not.toMatch(/\bminus\b/);
});

it('does not re-launch an explainer when its check question would be dropped',async()=>{
 // Since 2026-10-24 the order tool asks the re-run check while the Planner chooses: narrowing this
 // explainer away from its check word is refused with the reason, so it never becomes a Not ready step.
 const f=explainerFixture(['island','minus']),opts={rootDir:f.rootDir};
 const before=getLearningCycle(childId,homeworkId,opts)!;
 const requests:any[]=[];const stream=(f.request as any).client.messages.stream;
 (f.request as any).client.messages.stream=(payload:any)=>{requests.push(payload);return stream(payload);};
 await expect(runtime.advanceCanonicalCycleFromEvidence(f.request,opts)).rejects.toThrow('canonical_progression_tools_unfinished');
 const refusal=requests[1].messages.at(-1).content.find((block:any)=>block.is_error);
 expect(String(refusal.content)).toContain('cannot be re-run for just those words');
 expect(getLearningCycle(childId,homeworkId,opts)!.boards).toEqual(before.boards);
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

// 2026-10-23 human catch (Saori copy of Ila): the Planner said "reuse" for four activities, but reuse was
// decided by matching activity IDs, so anything unmatched went to the AI builder, and the board showed
// untested generated games. Logs showed the reuse decisions as catalog bookkeeping that nothing obeyed.
// One source of truth now: each spelling activity names the tested built-in it re-runs.
const named=(f:ReturnType<typeof fixture>,builtIn:Record<string,string|undefined>)=>{
 for(const row of f.decision.nextInstruments as any[]){const id=builtIn[row.nodeId];if(id)row.spelling.builtInActivityId=id;}
};
// 2026-10-25 owner review: the menu was only games she had played, so next boards were replays. It now
// offers those re-runs plus every certified game and mode; a brand-new AI-built game is still not on it.
it('offers the Planner the built-ins she played and every certified game and mode, never a new AI build',async()=>{
 const f=fixture(),opts={rootDir:f.rootDir};
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 const addStep=(f.create.mock.calls[0][0] as any).tools.find((tool:any)=>tool.name==='add_step').input_schema;
 expect(addStep.required).toContain('built_in');
 expect(addStep.properties.built_in.enum).toEqual(['radar-check',...spellingActivityMenu(spellingActivityCatalog(childId)).choices]);
 expect(addStep.properties.built_in.enum).not.toContain('generated-baseline');
});
// 2026-10-23: the deepest cause of AI-built spelling games was the request itself. It told the Planner
// "You are the artist ... choose a game" and required a creator prompt and game-design fields for every
// spelling activity, while the code could only run built-ins. A spelling request is now an order form.
it('asks the spelling Planner for orders from the built-in list, not game designs',async()=>{
 const f=fixture(),opts={rootDir:f.rootDir};
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 const payload=f.create.mock.calls[0][0] as any;
 const tools=JSON.stringify(payload.tools);
 for(const field of ['creatorPrompt','stakesDesign','failureMode','escalation','mechanicSpec','mathematicalHook'])expect(tools).not.toContain(`"${field}"`);
 const prompt=payload.messages[0].content[0].text as string;
 expect(prompt).not.toContain('You are the artist');
 expect(prompt).not.toMatch(/choose a game/i);
 expect(prompt).toMatch(/tested built-in/i);
});
it('runs the built-in the Planner names under any new activity ID, and never builds a spelling game',async()=>{
 const f=fixture(),opts={rootDir:f.rootDir};
 Object.assign(f.decision.nextInstruments[0] as any,{nodeId:`${homeworkId}:radar-again`,title:'radar-again'});
 f.decision.boardDefinition=linearJourneyFixture(f.decision.nextInstruments.map(row=>row.nodeId));
 named(f,{[`${homeworkId}:radar-again`]:'radar-check'});
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 vi.spyOn(canvas,'verifyPreparingBoardCanvas').mockResolvedValue(undefined);
 const generateHtml=vi.fn(async()=>'<html><body><h1>x</h1></body></html>');
 const after=await prepareSuccessorBoard({childId,homeworkId,generateHtml,generateArtwork:async()=>'/generated/world.jpeg',validate:async()=>({passed:true,failures:[]})},opts);
 const board=currentBoardInstance(after);
 const radar=after.nodes.find(node=>board.nodeIds.includes(node.nodeId)&&node.title==='radar-again')!;
 expect(radar.reusedFrom).toBe('radar-check');
 expect(radar.artifactBinding?.validationStatus).toBe('passed');
 expect(generateHtml).not.toHaveBeenCalled();
 // A brand-new game is not a built-in, so it cannot be ordered at all: no Not ready step exists.
 expect(after.nodes.some(node=>board.nodeIds.includes(node.nodeId)&&node.title==='treasure-dig')).toBe(false);
 expect(after.nodes.filter(node=>board.nodeIds.includes(node.nodeId)).every(node=>!node.notReadyReason)).toBe(true);
 expect(board.publishedAt).not.toBeNull();
});
it('re-runs a built-in for its own words or fewer, never a word its setup lacks or would still show',()=>{
 const items=buildSpellingRecallItems({homeworkId,words:['write','island','minus'],evidenceIds:['school:lab'],measurementRole:'practice',exposure:'practiced',occasionId:'radar-check'});
 const source={nodeId:'radar-check',implementationType:'word-radar',evidenceContract:{spellingItems:Object.fromEntries(items.slice(0,2).map(item=>[item.id,item])),nativeConfig:{activityId:'word-radar',wordRadarConfig}}} as any;
 const fresh=(count:number)=>buildSpellingRecallItems({homeworkId,words:['write','island','minus'].slice(0,count),evidenceIds:['school:lab'],measurementRole:'practice',exposure:'practiced',occasionId:'b3'});
 expect(repointReusedSetup(source,`${homeworkId}:b3:radar`,fresh(2))).toBeDefined();
 expect(repointReusedSetup(source,`${homeworkId}:b3:radar`,fresh(1))).toBeDefined();
 expect(repointReusedSetup(source,`${homeworkId}:b3:radar`,fresh(3))).toBeUndefined();
 // Letter Rush carries spellings, not IDs: dropping a word would still show it, so that re-run is refused.
 const rushConfig={schemaVersion:1,activityId:'letter-rush',mode:'read-and-race',topic:'Current spelling gaps',domain:'spelling',learningGoal:'Practice missed words',gradeBand:'early_elementary',
  scaffolds:{showWord:true,letterBank:true,allowRetryBeforeScore:true,companionHints:false},words:['write','island'].map(text=>({text})),
  evidencePolicy:{writesPracticeEvidence:true,writesMasteryEvidence:false,requiresPerTargetResult:true,allowedEvidence:['practice']}};
 const rush={nodeId:'old-rush',implementationType:'letter-rush',evidenceContract:{spellingItems:Object.fromEntries(items.slice(0,2).map(item=>[item.id,item])),nativeConfig:rushConfig}} as any;
 expect(repointReusedSetup(rush,`${homeworkId}:b3:rush`,fresh(2))).toBeDefined();
 expect(repointReusedSetup(rush,`${homeworkId}:b3:rush`,fresh(1))).toBeUndefined();
});
it('scores a re-run activity with the answer forms of the built-in it re-runs',async()=>{
 const f=fixture([['w'],['s']]),opts={rootDir:f.rootDir};
 named(f,{[`${homeworkId}:radar-check`]:'radar-check'});
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 const next=getLearningCycle(childId,homeworkId,opts)!;
 const radar=next.nodes.find(node=>node.reusedFrom==='radar-check')!;
 const byWord=new Map(Object.values(radar.evidenceContract.spellingItems!).map(item=>[item.word,item.response]));
 expect(byWord.get('write')).toEqual({mode:'tap_selection',acceptedForms:['w'],caseSensitive:false});
 expect(byWord.get('island')).toEqual({mode:'tap_selection',acceptedForms:['s'],caseSensitive:false});
});

// 2026-10-23 human catch (Saori copy of Ila): board 3 was made before built-in reuse existed, so all five
// steps were sent to the AI builder and stayed Not ready; the first repair restored those AI-built files.
// The repair must re-run the built-in the Planner asked for. This rebuilds that board's saved shape.
async function legacyNotReadyBoard(){
 const f=fixture(),opts={rootDir:f.rootDir};
 // That board's decision was received through the old single form and is saved on disk.
 await saveOldFormDecision({rootDir:f.rootDir,childId,homeworkId,decision:f.decision});
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 const file=path.join(resolveChildContextDir(childId,{rootDir:f.rootDir}),'homework/cycles',`${homeworkId}.json`);
 const saved=JSON.parse(fs.readFileSync(file,'utf8'));
 const preparing=saved.boards.at(-1);
 for(const node of saved.nodes.filter((row:any)=>preparing.nodeIds.includes(row.nodeId))){
  delete node.implementationType;delete node.reusedFrom;delete node.evidenceContract.nativeConfig;
  for(const item of Object.values(node.evidenceContract.spellingItems) as any[])item.response={mode:'spelling_letters',acceptedForms:[item.word],caseSensitive:false};
 }
 preparing.topologyHash=boardTopologyHash(saved,preparing);
 fs.writeFileSync(file,JSON.stringify(saved));
 vi.spyOn(canvas,'verifyPreparingBoardCanvas').mockResolvedValue(undefined);
 const generateHtml=vi.fn(async()=>'<html></html>');
 const published=await prepareSuccessorBoard({childId,homeworkId,generateHtml,generateArtwork:async()=>'/generated/world.jpeg',validate:async()=>({passed:true,failures:[]})},opts);
 const board=currentBoardInstance(published);
 const step=(title:string)=>published.nodes.find(node=>board.nodeIds.includes(node.nodeId)&&node.title===title)!;
 return {f,opts,published,board,generateHtml,radar:step('radar-check'),dig:step('treasure-dig')};
}
it('repairs a Not ready step in place by re-running the built-in it named, with no AI build',async()=>{
 const {opts,published,board,generateHtml,radar,dig}=await legacyNotReadyBoard();
 expect(board.publishedAt).not.toBeNull();
 expect(radar.notReadyReason).toBeDefined();
 const repaired=repairNotReadyActivity({childId,homeworkId,nodeId:radar.nodeId},opts);
 const node=repaired.nodes.find(row=>row.nodeId===radar.nodeId)!;
 expect(node.reusedFrom).toBe('radar-check');
 expect(node.implementationType).toBe('word-radar');
 expect(node.notReadyReason).toBeUndefined();
 expect(node.artifactBinding?.validationStatus).toBe('passed');
 expect(canonicalJourneyLaunchable(repaired,radar.nodeId)).toBe(true);
 expect(generateHtml).not.toHaveBeenCalled();
 expect(repaired.nodes.find(row=>row.nodeId===dig.nodeId)).toEqual(published.nodes.find(row=>row.nodeId===dig.nodeId));
 expect(currentBoardInstance(repaired).definition).toEqual(board.definition);
 expect(repaired.observations).toEqual(published.observations);
 const played=runtime.recordCanonicalNodeCompletion({childId,homeworkId,nodeId:radar.nodeId,sessionId:'repaired-session',result:{completed:true,accuracy:1,timeSpent_ms:100,targetResults:Object.keys(node.evidenceContract.spellingItems!).map(target=>({target,correct:true,attemptedValue:'write'}))}},opts)!;
 expect(played.observations.filter(row=>node.evidenceContract.spellingItems![row.itemId]).length).toBe(words.length);
 expect(()=>repairNotReadyActivity({childId,homeworkId,nodeId:radar.nodeId},opts)).toThrow('not_ready_repair_not_eligible');
});
it('leaves a Not ready step alone when it names no built-in to re-run',async()=>{
 const {opts,dig}=await legacyNotReadyBoard();
 const before=getLearningCycle(childId,homeworkId,opts)!;
 expect(()=>repairNotReadyActivity({childId,homeworkId,nodeId:dig.nodeId},opts)).toThrow(/not_ready_repair_no_builtin:.*:no_builtin_named:/);
 expect(getLearningCycle(childId,homeworkId,opts)).toEqual(before);
});

// 2026-10-23: the Planner wrote a separate catalog "reuse" list that nothing obeyed, beside the board it
// actually ordered: two sources of truth about which activity runs. The orders are the one source now,
// and the catalog records follow from them.
it('marks a re-run built-in as reused in the catalog, from the order itself, with no separate list',async()=>{
 const f=fixture(),opts={rootDir:f.rootDir};
 const profilePath=path.join(f.rootDir,`src/context/${childId}/learning_profile.json`);
 const profile=JSON.parse(fs.readFileSync(profilePath,'utf8'));
 const contentId=`${homeworkId}:radar-check`;
 const item={contentId,childId,homeworkId,type:'activity',source:'baseline',title:'Radar Check',algorithmTargets:['retrieval-practice'],targetSkills:['spelling'],targetWords:words,targetConcepts:[],engagementHooks:[],inputEvidence:{contentFingerprint:'lab'},reuseStatus:'candidate',reuseReason:'Await evidence',theoryDecisionId:'first-plan'};
 const seeded={...profile,aiContentCatalog:[item]};fs.writeFileSync(profilePath,JSON.stringify(seeded));writeWaterfallContentCatalog(childId,seeded,opts);
 named(f,{[`${homeworkId}:radar-check`]:'radar-check'});
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 const payload=f.create.mock.calls[0][0] as any;
 expect(JSON.stringify(payload.tools)).not.toContain('contentDecisions');
 expect(payload.messages[0].content[0].text).not.toContain('contentDecisionEvidenceIds');
 const recorded=getChildChart(childId,opts).contentCatalog.items.find(row=>row.contentId===contentId)!;
 expect(recorded.reuseStatus).toBe('reuse');
});
