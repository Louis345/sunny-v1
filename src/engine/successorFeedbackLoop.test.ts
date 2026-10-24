import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import primary from '../scripts/fixtures/successor-primary-20261021.json';
import correction from '../scripts/fixtures/successor-correction-20261021.json';
import {linearJourneyFixture} from '../scripts/fixtures/authoredJourney';
import {seedSpellingLab} from '../scripts/fixtures/spellingEvidenceFirst';
import {builtInWordRadar} from '../scripts/fixtures/builtInSpellingActivity';
import {plainDraw,saveOldFormDecision,successorToolReply} from '../scripts/fixtures/successorToolConversation';
import {journeyFrontier} from '../shared/adventureBoardDefinition';
import {buildSpellingRecallItems} from './learningCycleIngest';
import {createLearningCycle,getLearningCycle,transitionLearningCycle,type LearningCycleRecordV2} from './learningCycleRepository';
import {currentBoardInstance,successorResumeAction} from './learningBoardInstances';
import {prepareSuccessorBoard} from './canonicalProgressionGenerator';
import * as runtime from './learningCycleRuntime';
import * as canvas from './adventureBoardCanvas';
import * as recoveryCli from '../scripts/authorizePlannerRecovery';
import * as catalogDecisions from './learningDecisionContext';
import {getChildChart} from '../profiles/childChart';
import {writeWaterfallContentCatalog} from '../profiles/chartWaterfall';

const roots:string[]=[];
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
const childId='feedback-lab',homeworkId='lab-assignment',words=['write','island'];
const sourceIds=['explain-long-i','wheel-pattern','radar-read','spell-guided','radar-check'].map(id=>`${homeworkId}:${id}`);
function fixture(board:unknown=primary){
 const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-feedback-loop-'));roots.push(rootDir);
 vi.stubEnv('SUNNY_CONTEXT_ROOT',path.join(rootDir,'src/context'));
 vi.stubGlobal('fetch',()=>{throw Error('lab_forbids_network');});
 seedSpellingLab(rootDir,words,'',childId);
 const items=buildSpellingRecallItems({homeworkId,words,evidenceIds:['school:lab'],measurementRole:'practice',exposure:'practiced',occasionId:'first'});
 const initial=createLearningCycle({childId,homeworkId,domain:'spelling',assignment:{title:'Lab assignment',contentFingerprint:'lab',capturedEvidenceIds:['school:lab'],targets:words},academicTheory:{theoryId:'lab-theory',revision:1,hypothesis:'Practice may help; independent evidence is still missing',supportCriteria:[],reviseCriteria:[],falsifyCriteria:[]},engagementTheory:null,boardDefinition:linearJourneyFixture(['first']),initialLifecycle:'board_ready',nodes:[{
  nodeId:'first',role:'baseline',title:'First chapter',state:'ready',academicTarget:{domain:'spelling',skill:'spelling',targets:words},algorithmOwner:'ai_tutor',theoryId:'lab-theory',experimentId:'first',mechanic:'word-radar',theme:'world',openingScreen:{title:'First chapter',purpose:'Practice'},generationPrompt:null,artwork:{status:'ready',localPath:'/generated/world.jpeg',prompt:null},sfxContract:[],companionContract:{events:[]},evidenceIds:[],
  ...builtInWordRadar({rootDir,childId,homeworkId,nodeId:'first',title:'First chapter',items}),
 }]},{rootDir});
 const before=runtime.recordCanonicalNodeCompletion({childId,homeworkId,nodeId:'first',sessionId:'first-session',result:{completed:true,accuracy:0,timeSpent_ms:100,targetResults:items.map(item=>({target:item.id,correct:false,attemptedValue:'unknown'}))}},{rootDir})!;
 expect(before.lifecycle).toBe('baseline_evaluating');
 const decision={status:'inconclusive',reason:'Supported practice is not independent improvement.',progressionAction:'generate_support',preserve:[],change:[],testNext:[],nextEvidenceRequired:['Independent evidence'],predictionEvaluationIds:[],boardDefinition:board,nextInstruments:sourceIds.map(nodeId=>({nodeId,title:nodeId.split(':')[1],academicTarget:'Spelling',mechanic:'word-radar',theme:'Illustrated world',openingPurpose:'Practice',creatorPrompt:'Build this activity',spelling:{wordIds:items.map(item=>item.wordId),measurementRole:'practice',responseMode:'spelling_letters',builtInActivityId:'first'}}))};
 const requests:any[]=[];
 const create=vi.fn(async(payload:unknown)=>{requests.push(payload);return successorToolReply(decision,payload);});
 const request={childId,homeworkId,client:{messages:{stream:(payload:unknown)=>({finalMessage:()=>create(payload)})}} as never,draw:plainDraw};
 const receipts=()=>Object.fromEntries((fs.readdirSync(path.join(rootDir,`src/context/${childId}/homework/cycles/.planner/${homeworkId}`),{recursive:true}) as string[]).filter(file=>file.includes('provider-receipts/')&&file.endsWith('.json')).map(file=>[file,fs.readFileSync(path.join(rootDir,`src/context/${childId}/homework/cycles/.planner/${homeworkId}`,file),'utf8')]));
 return {rootDir,initial,before,decision,request,create,requests,receipts};
}
async function preserveHistoricalFailure(f:ReturnType<typeof fixture>){
 // The real 2026-10-21 failure: a decision received through the old single form (saved on disk),
 // interrupted before the new board was committed. New tool decisions save every turn as it
 // arrives and resume at no cost, so this explicit recovery path is for saved old-form decisions.
 await saveOldFormDecision({rootDir:f.rootDir,childId,homeworkId,decision:f.decision});
 const rename=fs.renameSync;
 const spy=vi.spyOn(fs,'renameSync').mockImplementation((from,to)=>{
  if(String(to).endsWith(`/cycles/${homeworkId}.json`)&&JSON.parse(fs.readFileSync(from,'utf8')).lifecycle==='baseline_generating')throw Object.assign(Error('lab-interrupt-before-commit'),{status:409});
  return rename(from,to);
 });
 try{await expect(runtime.advanceCanonicalCycleFromEvidence(f.request,{rootDir:f.rootDir})).rejects.toThrow('lab-interrupt-before-commit');}finally{spy.mockRestore();}
 const cycle=getLearningCycle(childId,homeworkId,{rootDir:f.rootDir})!;
 return transitionLearningCycle(childId,homeworkId,cycle.revision,{type:'block',reason:'planner_decision_invalid:board_definition_invalid:historical_canvas_veto'},{rootDir:f.rootDir});
}

it.each([['primary-wheel',primary,'opt-wheel'],['primary-radar',primary,'opt-radar'],['correction-wheel',correction,'opt-wheel'],['correction-radar',correction,'opt-radar']])('replays, publishes, learns from synthetic practice and returns to the Planner across restarts: %s',async(_name,board,option)=>{
 const f=fixture(board),opts={rootDir:f.rootDir};
 const blocked=await preserveHistoricalFailure(f);
 const oldReceipts=f.receipts();
 const replay={childId,homeworkId,blockedDecisionId:blocked.decisionHistory.at(-1)!.decisionId,reason:'Human approved local recovery verification'};
 const replayArgs=['--child',childId,'--homework',homeworkId,'--blocked-decision',replay.blockedDecisionId,'--reason',replay.reason];
 expect(()=>(recoveryCli as any).replayPlannerRecoveryFromArgs(replayArgs,opts)).toThrow('Usage:');
 expect(getLearningCycle(childId,homeworkId,opts)).toEqual(blocked);
 const recovered=await (recoveryCli as any).replayPlannerRecoveryFromArgs([...replayArgs,'--replay-received'],opts) as LearningCycleRecordV2;
 expect(recovered.lifecycle).toBe('baseline_generating');
 expect(recovered.observations).toEqual(blocked.observations);
 expect(recovered.academicPredictions).toEqual(blocked.academicPredictions);
 expect(recovered.decisionHistory.slice(0,blocked.decisionHistory.length)).toEqual(blocked.decisionHistory);
 expect(recovered.decisionHistory.at(-1)).toMatchObject({replayedResponse:{blockedDecisionId:replay.blockedDecisionId,reason:replay.reason,requestHash:expect.stringMatching(/^[a-f0-9]{64}$/),receiptHash:expect.stringMatching(/^[a-f0-9]{64}$/)}});
 expect(f.receipts()).toEqual(oldReceipts);
 expect(f.create).toHaveBeenCalledTimes(0);
 expect(await (runtime as any).replayCanonicalPlannerResponse(replay,opts)).toEqual(recovered);
 expect(successorResumeAction(getLearningCycle(childId,homeworkId,opts)!)).toBe('prepare');
 vi.spyOn(canvas,'verifyPreparingBoardCanvas').mockRejectedValue(Error('lab screenshot tool unavailable'));
 const generateHtml=vi.fn(async({node}:any)=>`<html><body><h1>${node.title}</h1></body></html>`);
 const prepare=()=>prepareSuccessorBoard({childId,homeworkId,generateHtml,generateArtwork:async()=>'/generated/world.jpeg',validate:async()=>({passed:true,failures:[]})},opts);
 let cycle=await prepare();
 const published=structuredClone(currentBoardInstance(cycle));
 expect(published.publishedAt).not.toBeNull();
 expect(await prepare()).toEqual(cycle);
 expect(generateHtml).not.toHaveBeenCalled();
 const resultsBefore=cycle.observations.length;
 let complete=false,completedActivities=0;
 for(let step=0;step<8;step++){
  cycle=getLearningCycle(childId,homeworkId,opts)!;
  const board=currentBoardInstance(cycle);
  const frontier=journeyFrontier(board.definition!,cycle.routeSelection?.choices??{},cycle.nodes.filter(node=>node.state==='completed').map(node=>node.nodeId));
  if(frontier.complete){complete=true;break;}
  if(frontier.choiceId){transitionLearningCycle(childId,homeworkId,cycle.revision,{type:'journey_choice_selected',choiceId:frontier.choiceId,optionId:option,choiceEventId:`choice-${option}`},opts);continue;}
  const node=cycle.nodes.find(node=>node.nodeId===frontier.activityNodeId)!;
  const items=Object.values(node.evidenceContract.spellingItems!);
  runtime.recordCanonicalNodeCompletion({childId,homeworkId,nodeId:node.nodeId,sessionId:`practice-${step}`,result:{completed:true,accuracy:1,timeSpent_ms:100,targetResults:items.map(item=>({target:item.id,correct:true,attemptedValue:item.word,scaffoldLevel:1}))}},opts);
  completedActivities++;
 }
 expect(complete).toBe(true);
 expect(completedActivities).toBe(4);
 cycle=getLearningCycle(childId,homeworkId,opts)!;
 expect(cycle.lifecycle).toBe('baseline_evaluating');
 expect(currentBoardInstance(cycle)).toEqual(published);
 const practice=cycle.observations.slice(resultsBefore);
 expect(practice).toHaveLength(8);
 expect(practice.every(row=>row.provenance==='practice'&&row.assistance.status==='assisted')).toBe(true);
 expect(cycle.predictionEvaluations).toEqual(blocked.predictionEvaluations);
 expect(successorResumeAction(cycle)).toBe('decide');
 // This second fake provider sees the saved synthetic results, not a reset baseline.
 const next=await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 // The next decision is new, so it goes through the tools (its first turn holds the facts).
 const prompt=f.requests[0].messages[0].content[0].text;
 for(const observation of practice)expect(prompt).toContain(observation.observationId);
 expect(prompt).toContain('assisted');
 expect(next.observations).toEqual(cycle.observations);
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 expect(f.create).toHaveBeenCalledTimes(2); // two tool turns; the repeated call bought nothing
 expect(f.receipts()).toMatchObject(oldReceipts);
 const ready=await prepare();
 expect(ready.lifecycle).toBe('baseline_ready');
 expect(currentBoardInstance(ready).boardId).not.toBe(published.boardId);
 expect(ready.boards!.find(board=>board.boardId===published.boardId)).toEqual(published);
 expect(ready.decisionHistory.filter(row=>row.eventType==='theory_decided')).toHaveLength(2);
 expect(generateHtml).not.toHaveBeenCalled();
});

it.each(['max_tokens','refusal'])('never turns a %s response into a zero-cost replay or automatic paid retry',async stop=>{
 const f=fixture();f.create.mockResolvedValueOnce({id:'failed',stop_reason:stop,content:[]} as never);
 await expect(runtime.advanceCanonicalCycleFromEvidence(f.request,{rootDir:f.rootDir})).rejects.toThrow();
 const blocked=getLearningCycle(childId,homeworkId,{rootDir:f.rootDir})!,receipts=f.receipts();
 await expect((runtime as any).replayCanonicalPlannerResponse({childId,homeworkId,blockedDecisionId:blocked.decisionHistory.at(-1)!.decisionId,reason:'Local verification'},{rootDir:f.rootDir})).rejects.toThrow('planner_replay_not_eligible');
 expect(getLearningCycle(childId,homeworkId,{rootDir:f.rootDir})).toEqual(blocked);
 expect(f.receipts()).toEqual(receipts);
 expect(f.create).toHaveBeenCalledTimes(1);
});


it('keeps interrupted replay blocked and startup unable to repurchase, then commits once on explicit replay',async()=>{
 const f=fixture(),opts={rootDir:f.rootDir};
 const blocked=await preserveHistoricalFailure(f),receipts=f.receipts();
 const replay={childId,homeworkId,blockedDecisionId:blocked.decisionHistory.at(-1)!.decisionId,reason:'Verify interrupted replay'};
 const rename=fs.renameSync;
 const spy=vi.spyOn(fs,'renameSync').mockImplementation((from,to)=>{
  if(String(to).endsWith(`/cycles/${homeworkId}.json`)&&JSON.parse(fs.readFileSync(from,'utf8')).lifecycle==='baseline_generating')throw Error('lab-interrupted-replay');
  return rename(from,to);
 });
 try{await expect(runtime.replayCanonicalPlannerResponse(replay,opts)).rejects.toThrow('lab-interrupted-replay');}finally{spy.mockRestore();}
 expect(getLearningCycle(childId,homeworkId,opts)).toEqual(blocked);
 expect(f.receipts()).toEqual(receipts);
 expect(successorResumeAction(getLearningCycle(childId,homeworkId,opts)!)).toBeNull();
 expect(await runtime.advanceCanonicalCycleFromEvidence(f.request,opts)).toEqual(blocked);
 const settled=await Promise.allSettled([runtime.replayCanonicalPlannerResponse(replay,opts),runtime.replayCanonicalPlannerResponse(replay,opts)]);
 expect(settled.some(result=>result.status==='fulfilled')).toBe(true);
 const final=getLearningCycle(childId,homeworkId,opts)!;
 expect(final.decisionHistory.filter(row=>row.eventType==='theory_decided')).toHaveLength(1);
 expect(final.boards).toHaveLength(2);
 expect(f.create).toHaveBeenCalledTimes(0);
 expect(f.receipts()).toEqual(receipts);
});

it.each([false,true])('does not write catalog effects before a replayed successor commits (invalid successor=%s)',async invalid=>{
 const f=fixture(),opts={rootDir:f.rootDir};
 const profilePath=path.join(f.rootDir,`src/context/${childId}/learning_profile.json`);
 const profile=JSON.parse(fs.readFileSync(profilePath,'utf8'));
 const contentId='lab-catalog-content',evidenceId=f.before.observations[0].observationId;
 const item={contentId,childId,homeworkId,type:'activity',source:'generated',title:'Recorded workshop',algorithmTargets:['retrieval-practice'],targetSkills:['spelling'],targetWords:words,targetConcepts:[],engagementHooks:[],inputEvidence:{contentFingerprint:'lab'},reuseStatus:'candidate',reuseReason:'Await evidence',theoryDecisionId:'first-plan'};
 const seeded={...profile,aiContentCatalog:[item]};fs.writeFileSync(profilePath,JSON.stringify(seeded));writeWaterfallContentCatalog(childId,seeded,opts);
 const proposals=[{contentId,action:'revise',reason:'Revise from saved evidence',evidenceIds:[evidenceId]}];
 (f.decision as any).contentDecisions=proposals;
 // Capture the legacy shape without catalog effects: its old reader failed before that step.
 const capture=vi.spyOn(catalogDecisions,'applyEvidenceBasedMathContentDecisions').mockReturnValue(seeded);
 let blocked:LearningCycleRecordV2;
 try{blocked=await preserveHistoricalFailure(f);}finally{capture.mockRestore();}
 if(invalid){
  const receiptFiles=(fs.readdirSync(path.join(f.rootDir,`src/context/${childId}/homework/cycles/.planner/${homeworkId}`),{recursive:true}) as string[]).filter(file=>file.includes('provider-receipts/')&&file.endsWith('.json')&&!file.endsWith('.stage.json'));
  const file=path.join(f.rootDir,`src/context/${childId}/homework/cycles/.planner/${homeworkId}`,receiptFiles[0]);
  const recorded=JSON.parse(fs.readFileSync(file,'utf8'));
  recorded.response.plannerMessage.content[0].input.nextInstruments[0].spelling.wordIds=['not-an-assigned-word'];
  fs.writeFileSync(file,JSON.stringify(recorded));
 }
 const beforeBytes=fs.readFileSync(profilePath,'utf8'),beforeCatalog=structuredClone(getChildChart(childId,opts).contentCatalog.items),receipts=f.receipts();
 const replay={childId,homeworkId,blockedDecisionId:blocked!.decisionHistory.at(-1)!.decisionId,reason:'Verify replay catalog isolation'};
 if(invalid){
  await expect(runtime.replayCanonicalPlannerResponse(replay,opts)).rejects.toThrow('spelling_successor_word_unknown');
  expect(getLearningCycle(childId,homeworkId,opts)).toEqual(blocked!);
 }else{
  const recovered=await runtime.replayCanonicalPlannerResponse(replay,opts);
  expect(recovered.lifecycle).toBe('baseline_generating');
  expect(recovered.decisionHistory.at(-1)!.replayedResponse).toMatchObject({deferredContentDecisions:proposals});
 }
 expect(fs.readFileSync(profilePath,'utf8')).toBe(beforeBytes);
 expect(getChildChart(childId,opts).contentCatalog.items).toEqual(beforeCatalog);
 expect(f.receipts()).toEqual(receipts);
 expect(f.create).toHaveBeenCalledTimes(0);
});
