import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import primary from '../scripts/fixtures/successor-primary-20261021.json';
import correction from '../scripts/fixtures/successor-correction-20261021.json';
import {journeyExecutions, renderBoardDefinition} from '../shared/adventureBoardDefinition';
import {parseCanonicalProgressionDecision, advanceCanonicalCycleFromEvidence} from './learningCycleRuntime';
import {buildSpellingRecallItems} from './learningCycleIngest';
import {createLearningCycle, getLearningCycle} from './learningCycleRepository';
import {listBoardInstances} from './learningBoardInstances';
import {prepareSuccessorBoard} from './canonicalProgressionGenerator';
import * as canvas from './adventureBoardCanvas';

const ids=['explain-long-i','wheel-pattern','radar-read','spell-guided','radar-check'].map(id=>`lab-assignment:${id}`);
const words=['write','island'];
const instruments=ids.map(nodeId=>({nodeId,title:nodeId.split(':')[1],academicTarget:'Spelling',mechanic:'word-radar',theme:'Illustrated world',openingPurpose:'Practice',creatorPrompt:'Build this activity',spelling:{wordIds:words,measurementRole:'practice',responseMode:'spelling_letters'}}));
const decision=(boardDefinition:unknown)=>({status:'inconclusive',reason:'Use the recorded work to plan further teaching.',progressionAction:'generate_support',preserve:[],change:[],testNext:[],nextEvidenceRequired:[],predictionEvaluationIds:[],nextInstruments:instruments,boardDefinition});
const roots:string[]=[];
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});

// The child discovered this because no new board appeared. Logs recorded validation failures,
// but the lab used valid, freshly invented linear boards and missed real branching output.
// Fixtures retain only the actual two board payloads, with the assignment identity anonymized.
describe('a canvas cannot veto a spelling successor',()=>{
 it.each([['primary',primary],['correction',correction]])('executes the %s response from the failed morning handoff',(_name,board)=>{
  const original=structuredClone(board);
  const result=parseCanonicalProgressionDecision(decision(board));
  const definition=result.successor!.boardDefinition!;
  const routes=journeyExecutions(definition).map(route=>route.activityNodeIds);
  expect(routes).toEqual(expect.arrayContaining([
   [ids[0],ids[1],ids[3],ids[4]],
   [ids[0],ids[2],ids[3],ids[4]],
  ]));
  expect(routes).toHaveLength(2);
  expect(result.reason).toBe(decision(board).reason);
  expect(result.successor!.instruments).toEqual(instruments);
  expect(board).toEqual(original);
  for(const portal of original.portals)expect(definition.portals.find(row=>row.id===portal.id)!.position).toEqual(portal.position);
  for(const route of journeyExecutions(definition)){
   const rendered=renderBoardDefinition(definition,{boardId:'lab',planId:'lab',childId:'lab-child',domain:'spelling',selections:route.selections,activities:ids.map(id=>({id,state:'ready',verified:true})),allowReadyActivitySelection:true});
   expect(rendered.nodes.filter(node=>node.activityNodeId).every(node=>node.state==='available')).toBe(true);
  }
 });

 it('does not let an unused unknown portal veto the authored routes',()=>{
  const log=vi.spyOn(console,'log').mockImplementation(()=>{});
  const source=structuredClone(primary);
  source.portals.push({id:'ghost',label:'Unused',kind:'activity',activityNodeId:'nope',position:{landscape:{x:.5,y:.5},portrait:{x:.5,y:.5}}});
  const definition=parseCanonicalProgressionDecision(decision(source)).successor!.boardDefinition!;
  expect(definition.portals.some(portal=>portal.id==='ghost')).toBe(false);
  expect(journeyExecutions(definition).map(route=>route.activityNodeIds)).toEqual(expect.arrayContaining([[ids[0],ids[1],ids[3],ids[4]],[ids[0],ids[2],ids[3],ids[4]]]));
  expect(log.mock.calls.flat().join(' ')).toContain('[portal] [not-ready] portal=ghost');
 });
 it.each(['start','endpoint'])('reports a missing %s without rejecting or changing instruction',kind=>{
  const log=vi.spyOn(console,'log').mockImplementation(()=>{});
  const source=structuredClone(primary);
  if(kind==='start'){
   const start=source.portals.find(portal=>portal.kind==='start')!.id;
   source.paths.forEach(row=>row.portalIds=row.portalIds.filter(id=>id!==start));
   source.portals=source.portals.filter(portal=>portal.id!==start);
  }else source.portals.find(portal=>portal.kind==='endpoint')!.kind='activity';
  const definition=parseCanonicalProgressionDecision(decision(source)).successor!.boardDefinition!;
  expect(journeyExecutions(definition).map(route=>route.activityNodeIds)).toEqual(expect.arrayContaining([[ids[0],ids[1],ids[3],ids[4]],[ids[0],ids[2],ids[3],ids[4]]]));
  expect(log.mock.calls.flat().join(' ')).toContain(`[path] [${kind}-missing]`);
 });

 it('reports prescribed activities absent from every route without rejecting the plan',()=>{
  const log=vi.spyOn(console,'log').mockImplementation(()=>{});
  const source=structuredClone(primary);
  source.paths.find(row=>row.id==='path-radar')!.portalIds=[ids[1]];
  const definition=parseCanonicalProgressionDecision(decision(source)).successor!.boardDefinition!;
  expect(journeyExecutions(definition)).toHaveLength(2);
  expect(log.mock.calls.flat().join(' ')).toContain(`[portal] [unreachable] activity=${ids[2]}`);
 });
 it('retains a choice with no extra stops and resumes the shared continuation once',()=>{
  const log=vi.spyOn(console,'log').mockImplementation(()=>{});
  const source=structuredClone(primary);
  source.paths.find(row=>row.id==='path-wheel')!.portalIds=['p-mix','p-checkpoint'];
  const definition=parseCanonicalProgressionDecision(decision(source)).successor!.boardDefinition!;
  expect(definition.choices).toEqual(source.choices);
  expect(journeyExecutions(definition).map(row=>row.activityNodeIds)).toEqual(expect.arrayContaining([[ids[0],ids[3],ids[4]],[ids[0],ids[2],ids[3],ids[4]]]));
  expect(definition.paths.find(row=>row.id==='path-wheel')!.portalIds).toEqual([]);
  expect(log.mock.calls.flat().join(' ')).toContain('[path] [shared-continuation] path=path-wheel');
 });

 it('binds an existing canonical activity portal so route completion cannot skip it',()=>{
  const source=structuredClone(primary) as any;
  source.portals.push({id:ids[1],label:'Wheel',kind:'activity',position:{landscape:{x:.5,y:.3},portrait:{x:.5,y:.3}}});
  const definition=parseCanonicalProgressionDecision(decision(source)).successor!.boardDefinition!;
  expect(journeyExecutions(definition).some(route=>route.activityNodeIds.join(',')===[ids[0],ids[1],ids[3],ids[4]].join(','))).toBe(true);
 });
 it('does not pretend two portals are two independent measurements of one instrument',()=>{
  const source=structuredClone(correction) as any;
  source.portals.push({...source.portals.find((portal:any)=>portal.id==='p-mix'),id:'second-mix'});
  source.paths.find((row:any)=>row.id===source.rootPathId).portalIds.splice(-1,0,'second-mix');
  expect(()=>parseCanonicalProgressionDecision(decision(source))).toThrow('successor_journey_unreadable:repeated_measurement_identity');
 });

 it.each(['missing-presentation','outside-canvas'])('does not make presentation completeness a gate: %s',kind=>{
  const source=structuredClone(primary) as any;
  if(kind==='missing-presentation'){
   delete source.theme;delete source.edges;delete source.portals[1].position.portrait;
  }else source.portals[1].position.landscape.x=1.2;
  const definition=parseCanonicalProgressionDecision(decision(source)).successor!.boardDefinition!;
  expect(journeyExecutions(definition)).toHaveLength(2);
  expect(definition.portals.every(portal=>Number.isFinite(portal.position.portrait.x))).toBe(true);
  if(kind==='missing-presentation')expect(definition.portals[1].position.landscape).toEqual(source.portals[1].position.landscape);
  if(kind==='outside-canvas')expect(definition.portals[1].position.landscape.x).toBe(1.2);
 });
 it('reports an unresolved educational stop instead of silently deleting it',()=>{
  const source=structuredClone(primary);
  source.paths[0].portalIds.splice(1,0,'not-a-declared-activity');
  expect(()=>parseCanonicalProgressionDecision(decision(source))).toThrow('successor_journey_unreadable:unresolved_stop');
 });

 it.each(['recorded','missing-single-path-explanation','off-path-unknown'])('commits once and publishes without a canvas approval or correction purchase: %s',async variant=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-canvas-decoupling-'));roots.push(root);
  vi.stubEnv('SUNNY_CONTEXT_ROOT',path.join(root,'src/context'));
  const childId='lab-child',homeworkId='lab-assignment';
  fs.mkdirSync(path.join(root,'src/context',childId),{recursive:true});
  fs.writeFileSync(path.join(root,'src/context',childId,'learning_profile.json'),JSON.stringify({childId}));
  const items=buildSpellingRecallItems({homeworkId,words,evidenceIds:['source:lab'],measurementRole:'practice',exposure:'practiced',occasionId:'baseline'});
  const before=createLearningCycle({childId,homeworkId,domain:'spelling',assignment:{title:'Lab assignment',contentFingerprint:'lab',capturedEvidenceIds:['source:lab'],targets:words},academicTheory:{theoryId:'lab-theory',revision:1,hypothesis:'Teach from observed work',supportCriteria:[],reviseCriteria:[],falsifyCriteria:[]},engagementTheory:null,initialLifecycle:'baseline_evaluating',nodes:[{
   nodeId:'baseline',role:'baseline',title:'Completed practice',state:'completed',academicTarget:{domain:'spelling',skill:'spelling',targets:words},algorithmOwner:'ai_tutor',theoryId:'lab-theory',experimentId:'lab-experiment',mechanic:'word-radar',theme:'world',openingScreen:{title:'Completed practice',purpose:'Practice'},generationPrompt:null,artifactBinding:null,artwork:{status:'ready',localPath:'/generated/world.jpeg',prompt:null},sfxContract:[],companionContract:{events:[]},evidenceContract:{academic:true,engagement:true,companionObservations:true,spellingItems:Object.fromEntries(items.map(item=>[item.id,item]))},evidenceIds:[],
  }]},{rootDir:root});
  // Saved word IDs, rather than displayed words, remain authoritative.
  const actual=structuredClone(decision(primary));
  if(variant==='missing-single-path-explanation'){
   actual.boardDefinition={...primary,rootPathId:'root',paths:[{id:'root',portalIds:['p-start',...ids,'p-end']}],choices:[],portals:[{...primary.portals[0],id:'p-start',kind:'start'},...ids.map(id=>({id,label:id,kind:'activity',activityNodeId:id,position:{landscape:{x:.5,y:.5},portrait:{x:.5,y:.5}}})),{id:'p-end',label:'Done',kind:'endpoint',position:{landscape:{x:.9,y:.9},portrait:{x:.9,y:.9}}}],edges:[]} as any;
  }
  if(variant==='off-path-unknown')(actual.boardDefinition as typeof primary).portals.push({id:'ghost',label:'Unused',kind:'activity',activityNodeId:'nope',position:{landscape:{x:.5,y:.5},portrait:{x:.5,y:.5}}});
  actual.nextInstruments.forEach(row=>row.spelling.wordIds=items.map(item=>item.wordId));
  const create=vi.fn().mockResolvedValue({id:'recorded-primary',stop_reason:'tool_use',content:[{type:'tool_use',name:'decide_learning_cycle_progression',input:actual}]});
  const request={childId,homeworkId,client:{messages:{stream:(payload:unknown)=>({finalMessage:()=>create(payload)})}} as never};
  const after=await advanceCanonicalCycleFromEvidence(request,{rootDir:root});
  expect(after.lifecycle).toBe('baseline_generating');
  expect(after.observations).toEqual(before.observations);
  expect(after.academicPredictions).toEqual(before.academicPredictions);
  expect(after.boards![0]).toEqual(listBoardInstances(before)[0]);
  const diagnostic=vi.spyOn(canvas,'verifyPreparingBoardCanvas').mockRejectedValue(Error('screenshot renderer unavailable'));
  const generateHtml=vi.fn(async({node}:any)=>`<html><body><h1>${node.title}</h1></body></html>`);
  const prepared=await prepareSuccessorBoard({childId,homeworkId,generateHtml,generateArtwork:async()=>'/generated/world.jpeg',validate:async()=>({passed:true,failures:[]})},{rootDir:root});
  expect(prepared.lifecycle).toBe('baseline_ready');
  expect(prepared.boards!.at(-1)!.publishedAt).not.toBeNull();
  expect(generateHtml).toHaveBeenCalledTimes(5);
  expect(prepared.decisionHistory.filter(row=>row.eventType==='block')).toHaveLength(0);
  expect(prepared.observations).toEqual(before.observations);
  await advanceCanonicalCycleFromEvidence(request,{rootDir:root});
  await prepareSuccessorBoard({childId,homeworkId,generateHtml},{rootDir:root});
  expect(create).toHaveBeenCalledTimes(1);
  expect(generateHtml).toHaveBeenCalledTimes(5);
  expect(getLearningCycle(childId,homeworkId,{rootDir:root})!.decisionHistory.filter(row=>row.eventType==='theory_decided')).toHaveLength(1);
  expect(diagnostic).toHaveBeenCalled();
 });
});
