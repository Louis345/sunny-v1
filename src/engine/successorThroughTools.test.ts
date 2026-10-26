import fs from 'node:fs';
import {spellingActivityMenu} from './spellingTeachingTools';
import {spellingActivityCatalog} from './assignmentPlanner';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {linearJourneyFixture} from '../scripts/fixtures/authoredJourney';
import {seedSpellingLab} from '../scripts/fixtures/spellingEvidenceFirst';
import {oldFormDecisionStage,plainDraw,saveOldFormDecision,successorToolReply} from '../scripts/fixtures/successorToolConversation';
import {plannerTransportPolicy} from './plannerTransport';
import {buildInitialEngagementTheory,writeEngagementTheory} from './engagementTheory';
import {getLearningCycle} from './learningCycleRepository';
import {buildSpellingRecallItems} from './learningCycleIngest';
import {createLearningCycle} from './learningCycleRepository';
import {currentBoardInstance} from './learningBoardInstances';
import {prepareSuccessorBoard} from './canonicalProgressionGenerator';
import {resolveAdaptiveMathDraftDir} from './adaptiveMathDiscovery';
import {resolveChildContextDir} from '../utils/contextRoot';
import {strictBudget} from './plannerTransport';
import * as runtime from './learningCycleRuntime';
import {transitionLearningCycle} from './learningCycleRepository';
import * as canvas from './adventureBoardCanvas';

// Board 3 is the feedback loop: after she plays, the Planner decides and orders the next board.
// It now works through small locked tools, like Discovery and Teaching; nothing is sent back.
const roots:string[]=[];
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
const childId='tools-lab',homeworkId='lab-assignment',words=['write','island'];
const wordRadarConfig={recallMode:'hidden_word_recall',inputMode:'keyboard'};
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fixture(){
 const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-successor-tools-'));roots.push(rootDir);
 vi.stubEnv('SUNNY_CONTEXT_ROOT',path.join(rootDir,'src/context'));
 vi.stubGlobal('fetch',()=>{throw Error('lab_forbids_network');});
 seedSpellingLab(rootDir,words,'',childId);
 const items=buildSpellingRecallItems({homeworkId,words,evidenceIds:['school:lab'],measurementRole:'practice',exposure:'practiced',occasionId:'radar-check'});
 const evidenceContract={academic:true,engagement:true,companionObservations:true,spellingItems:Object.fromEntries(items.map(item=>[item.id,item])),nativeConfig:{activityId:'word-radar',wordRadarConfig}};
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
 // The recorded decision re-runs the proven radar and also asks for a brand-new game.
 const instrument=(nodeId:string)=>({nodeId,title:nodeId.split(':')[1],academicTarget:'Spelling',mechanic:'word-radar',theme:'world',openingPurpose:'Practice',spelling:{wordIds:items.map(item=>item.wordId),measurementRole:'practice',responseMode:'spelling_letters'}});
 const decision={status:'revised',reason:'Re-check with the proven radar.',progressionAction:'generate_support',preserve:[],change:[],testNext:[],nextEvidenceRequired:['Independent evidence'],predictionEvaluationIds:[],
  nextInstruments:[instrument(`${homeworkId}:radar-check`),instrument(`${homeworkId}:treasure-dig`)],boardDefinition:linearJourneyFixture([`${homeworkId}:radar-check`,`${homeworkId}:treasure-dig`])};
 const requests:any[]=[];
 const stream=vi.fn((payload:any)=>{requests.push(structuredClone(payload));return {finalMessage:async()=>successorToolReply(decision,payload)};});
 return {rootDir,items,requests,stream,request:{childId,homeworkId,client:{messages:{stream}} as never,draw:plainDraw}};
}

it('builds the next board through small locked tools, re-running only built-ins, with no correction stage',async()=>{
 const f=fixture(),opts={rootDir:f.rootDir};
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 // A short conversation of locked tools, never the old single form.
 expect(f.stream).toHaveBeenCalledTimes(2);
 const tools=f.requests[0].tools;
 expect(tools.map((tool:any)=>tool.name)).toEqual(['decide','add_step','remove_step','set_order','add_choice','finish_board']);
 expect(tools.every((tool:any)=>tool.strict===true)).toBe(true);
 expect(strictBudget(tools).unsupported).toEqual([]);
 expect(f.requests[0].tool_choice).toEqual({type:'auto'});
 // On offer: the proven radar to re-run and the certified games and modes; a brand-new game cannot be ordered at all.
 expect(tools.find((tool:any)=>tool.name==='add_step').input_schema.properties.built_in.enum).toEqual(['radar-check',...spellingActivityMenu(spellingActivityCatalog(childId)).choices]);
 vi.spyOn(canvas,'verifyPreparingBoardCanvas').mockResolvedValue(undefined);
 const generateHtml=vi.fn(async()=>'<html></html>');
 const after=await prepareSuccessorBoard({childId,homeworkId,generateHtml,generateArtwork:async()=>'/generated/world.jpeg',validate:async()=>({passed:true,failures:[]})},opts);
 const board=currentBoardInstance(after);
 expect(board.kind).toBe('successor');
 const nodes=after.nodes.filter(node=>board.nodeIds.includes(node.nodeId));
 expect(nodes).toHaveLength(1);
 expect(nodes[0]).toMatchObject({implementationType:'word-radar',state:'ready'});
 expect(generateHtml).not.toHaveBeenCalled();
 // Every turn is a saved receipt; no correction or patch stage exists.
 const stages=fs.readdirSync(path.join(resolveChildContextDir(childId,{rootDir:f.rootDir}),'homework','cycles','.planner',homeworkId),{recursive:true}).map(String).filter(name=>name.endsWith('.stage.json'));
 expect(stages.some(name=>/-tools-turn-1\.stage\.json$/.test(name))).toBe(true);
 expect(stages.filter(name=>/correction|patch/.test(name))).toEqual([]);
});

// 2026-10-24: only a received old-form decision replays. A frozen old request that was never
// answered is not sent as the retired single form, and a saved decision is never patched by a purchase.
it('decides through the tools when an old single-form request was frozen but never answered',async()=>{
 const f=fixture();
 const {draftDir,stage}=await oldFormDecisionStage({rootDir:f.rootDir,childId,homeworkId});
 const request={model:'claude-sonnet-5',max_tokens:32000,messages:[{role:'user',content:'old'}],tools:[{name:'decide_learning_cycle_progression',input_schema:{type:'object'}}],tool_choice:{type:'tool',name:'decide_learning_cycle_progression'}};
 fs.mkdirSync(draftDir,{recursive:true});fs.writeFileSync(path.join(draftDir,`${stage}.request.json`),JSON.stringify({request,snapshot:null,policy:plannerTransportPolicy('claude-sonnet-5',32000,300000)}));
 await runtime.advanceCanonicalCycleFromEvidence(f.request,{rootDir:f.rootDir});
 expect(f.requests.flatMap((row:any)=>row.tools.map((tool:any)=>tool.name))).not.toContain('decide_learning_cycle_progression');
 expect(f.requests[0].tools[0].name).toBe('decide');
});

it('never buys a citation patch for a saved old-form decision',async()=>{
 const f=fixture();
 await saveOldFormDecision({rootDir:f.rootDir,childId,homeworkId,decision:{status:'revised',reason:'Saved.',progressionAction:'collect_more_evidence',preserve:[],change:[],testNext:[],nextEvidenceRequired:['More'],predictionEvaluationIds:['not-an-evaluation'],nextInstruments:[]}});
 await runtime.advanceCanonicalCycleFromEvidence(f.request,{rootDir:f.rootDir}).catch(()=>undefined);
 expect(f.stream).not.toHaveBeenCalled();
 const {draftDir}=await oldFormDecisionStage({rootDir:f.rootDir,childId,homeworkId});
 expect((fs.readdirSync(path.dirname(draftDir),{recursive:true}) as string[]).map(String).filter(name=>/citation-patch/.test(name))).toEqual([]);
});

// 2026-10-25 Saori catch: Reina finished her Teaching board and the Planner decided her next one, but
// engagement bookkeeping updated her cycle 10 seconds later. A "chart changed during the decision" check
// forced a retry, the retry rebuilt the Planner's question from the newer chart, collided with the saved
// turns, and blocked the cycle. Logs named both steps; the lab child had no engagement record, so the
// robot never lived through it. A decision belongs to the evidence batch that closed; later changes are
// later evidence, and the Planner's question is frozen when the batch closes.
it('publishes the next board when engagement updates while the Planner decides, buying nothing twice',async()=>{
 const f=fixture();
 const draw=async(journey:any)=>{writeEngagementTheory(childId,buildInitialEngagementTheory({childId,domain:'spelling',homeworkId}),{rootDir:f.rootDir});return plainDraw(journey);};
 const cycle=await runtime.advanceCanonicalCycleFromEvidence({...f.request,draw},{rootDir:f.rootDir});
 expect(cycle.lifecycle).not.toBe('blocked');
 expect(cycle.decisionHistory.at(-1)?.eventType).toBe('theory_decided');
 expect(f.stream).toHaveBeenCalledTimes(2);
});

it('replays the frozen question after a restart even though the chart changed meanwhile',async()=>{
 const f=fixture();
 const crash=async()=>{throw Object.assign(new Error('lab_process_stopped'),{status:503});};
 await expect(runtime.advanceCanonicalCycleFromEvidence({...f.request,draw:crash},{rootDir:f.rootDir})).rejects.toThrow('lab_process_stopped');
 expect(f.stream).toHaveBeenCalledTimes(2);
 writeEngagementTheory(childId,buildInitialEngagementTheory({childId,domain:'spelling',homeworkId}),{rootDir:f.rootDir});
 const noCall=vi.fn(()=>{throw new Error('must_not_buy_the_decision_again');});
 const cycle=await runtime.advanceCanonicalCycleFromEvidence({...f.request,client:{messages:{stream:noCall}} as never},{rootDir:f.rootDir});
 expect(noCall).not.toHaveBeenCalled();
 expect(cycle.lifecycle).not.toBe('blocked');
 expect(getLearningCycle(childId,homeworkId,{rootDir:f.rootDir})!.decisionHistory.at(-1)?.eventType).toBe('theory_decided');
});

// 2026-10-25: Reina's next board was blocked by that bug before the fix shipped. "Blocked" waits for a
// person; the operator retry accepted only truncated answers, so a cycle blocked by a since-fixed bug
// had no logged way back. The retry also accepts that cause, sets the collided turns aside (never
// deleted), and the fixed code decides fresh.
it('lets an operator retry a cycle blocked by the fixed stage-changed bug, then publishes',async()=>{
 const f=fixture(),opts={rootDir:f.rootDir};
 const crash=async()=>{throw Object.assign(new Error('lab_process_stopped'),{status:503});};
 await expect(runtime.advanceCanonicalCycleFromEvidence({...f.request,draw:crash},opts)).rejects.toThrow('lab_process_stopped');
 const {draftDir,stage}=await oldFormDecisionStage({rootDir:f.rootDir,childId,homeworkId});
 // As before the fix: no frozen question, and the chart has moved on since the saved turns.
 fs.rmSync(path.join(draftDir,`${stage}-tools.question.json`),{force:true});
 writeEngagementTheory(childId,buildInitialEngagementTheory({childId,domain:'spelling',homeworkId}),{rootDir:f.rootDir});
 const before=getLearningCycle(childId,homeworkId,opts)!;
 const blocked=transitionLearningCycle(childId,homeworkId,before.revision,{type:'block',reason:`planner_decision_invalid:provider_stage_request_changed:${stage}-tools-turn-1`},opts);
 const blockedDecisionId=blocked.decisionHistory.at(-1)!.decisionId;
 const reopened=runtime.authorizeCanonicalPlannerRetry({childId,homeworkId,blockedDecisionId,reason:'The stage-changed bug is fixed'},opts);
 expect(reopened.lifecycle).toBe(before.lifecycle);
 const superseded=path.join(draftDir,'superseded',blockedDecisionId.replace(/[^a-zA-Z0-9_-]+/g,'_'));
 expect(fs.readdirSync(superseded).filter(name=>name.startsWith(`${stage}-tools-turn-`))).toHaveLength(2);
 f.stream.mockClear();
 const decided=await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 expect(decided.decisionHistory.at(-1)?.eventType).toBe('theory_decided');
 expect(f.stream).toHaveBeenCalledTimes(2);
});
