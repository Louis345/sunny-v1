import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createLearningCycle, getLearningCycle, type CreateLearningCycleInput } from './learningCycleRepository';
import { advanceCanonicalCycleFromEvidence, baselineQuestEvidenceEligibility, recordCanonicalNodeCompletion } from './learningCycleRuntime';
import { buildDirectActiveSessionPlan, buildDirectLearningCycleInput, parseDirectItem, type DirectItem, type DirectLearningExperiencePlan } from './directMathExperience';
import { plan } from '../scripts/fixtures/adaptiveMathRelease';
const roots: string[] = [];
afterEach(()=>roots.splice(0).forEach(r=>fs.rmSync(r,{recursive:true,force:true})));
function setup(response: DirectItem['response'] = {mode:'numeric',expected:10}, exposure='unseen') {
 const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-evidence-release-'));roots.push(rootDir);
 const item={id:'q1',prompt:'How many?',lineage:{sourceEvidenceIds:['assignment:1'],measurementRole:'fresh_checkpoint',exposure},response};
 const node={nodeId:'baseline',role:'baseline',title:'Lab',state:'ready',academicTarget:{domain:'math',skill:'groups',targets:['q1']},algorithmOwner:'retrieval-practice',theoryId:'t',experimentId:'e',mechanic:'lab',theme:'lab',openingScreen:{title:'Lab',purpose:'Measure'},generationPrompt:null,artifactBinding:null,artwork:{status:'ready',localPath:null,prompt:null},sfxContract:[],companionContract:{events:[]},evidenceContract:{academic:true,engagement:true,companionObservations:true,itemRoles:{q1:'fresh_checkpoint'},itemContracts:{q1:item}},evidenceIds:[]};
 createLearningCycle({childId:'lab',homeworkId:'hw',domain:'math',assignment:{title:'Lab',contentFingerprint:'lab',capturedEvidenceIds:['assignment:1'],targets:['q1']},academicTheory:{theoryId:'t',revision:1,hypothesis:'Test',supportCriteria:[],reviseCriteria:[],falsifyCriteria:[]},engagementTheory:null,nodes:[node]} as CreateLearningCycleInput,{rootDir});
 return {rootDir,complete:(attemptedValue: string|undefined,correct=true)=>recordCanonicalNodeCompletion({childId:'lab',homeworkId:'hw',nodeId:'baseline',sessionId:'s',result:{completed:true,accuracy:correct?1:0,timeSpent_ms:100,targetResults:[{target:'q1',correct,attemptedValue}]}},{rootDir})!};
}
it.each(['practice','repeated','wrong-construct'])('Quest rejects %s evidence despite a reported correct answer',kind=>{
 const {complete}=setup();const cycle=complete('10');
 const o=cycle.observations[0];
 if(kind==='practice')o.provenance='practice';
 if(kind==='repeated')o.exposure='previously_practiced';
 if(kind==='wrong-construct')o.constructLinks[0].constructId='math.unrelated';
 expect(baselineQuestEvidenceEligibility(cycle).eligible).toBe(false);
});
it('Quest admits a captured correct fresh checkpoint',()=>expect(baselineQuestEvidenceEligibility(setup().complete('10')).eligible).toBe(true));
it.each([["9",true,false],["10",false,true]] as const)('server scores %s independently of claimed %s',(answer,claimed,expected)=>{
 const cycle=setup().complete(answer,claimed);expect(cycle.observations[0].result.correct).toBe(expected);expect(cycle.evidence.academic[0].accuracy).toBe(expected?1:0);
});
it.each([undefined,'','   ','spoken aloud, not transcribed'])('uncaptured answer %s stays unknown',value=>{
 const c=setup().complete(value);expect(c.observations[0].result.correct).toBeUndefined();expect(c.observations[0].provenance).toBe('practice');expect(baselineQuestEvidenceEligibility(c).eligible).toBe(false);
});
it('selection uses frozen option identity',()=>{
 const c=setup({mode:'selection',options:[{id:'a',label:'10',correct:true},{id:'b',label:'9',correct:false}]}).complete('b');expect(c.observations[0].result.correct).toBe(false);
});
it.each([['{"count":10}',true],['{"count":9}',false],['not-json',undefined]] as const)('construction evaluates captured state %s',(answer,expected)=>{
 expect(setup({mode:'construction',expectedState:{count:10},successDescription:'Ten counters'}).complete(answer).observations[0].result.correct).toBe(expected);
});
it('explanation remains unscored without an independent rubric evaluation',()=>{
 const c=setup({mode:'explanation',rubric:['Explain equal groups']}).complete('Because groups');expect(c.observations[0].result.correct).toBeUndefined();expect(c.observations[0].provenance).toBe('practice');
});
it('frozen prior exposure cannot become unseen',()=>expect(setup(undefined,'taught').complete('10').observations[0].provenance).toBe('practice'));
it('canonical program freezes complete Planner answer contracts',()=>{
 const plannerPlan: DirectLearningExperiencePlan=plan(2);const artifacts=plannerPlan.activities.map(a=>({nodeId:a.id,childId:'lab',homeworkId:'hw',title:a.title,htmlPath:'/lab.html',artworkUrl:'/lab.svg',creatorPrompt:'lab',promptHash:'lab',plannerModel:'mock',creatorModel:'mock'}));
 const activeSessionPlan=buildDirectActiveSessionPlan({childId:'lab',homeworkId:'hw',plan:plannerPlan,artifacts,backgroundUrl:'/lab.svg',questArtworkUrl:'',bossArtworkUrl:'',report:{passed:true,failures:[],screenshots:[]}});
 const contract=buildDirectLearningCycleInput({childId:'lab',homeworkId:'hw',extraction:{filename:'lab',fullText:'Lab',fileHash:'lab',pages:[],warnings:[]} as never,plannerPlan,activeSessionPlan,artifacts});
 expect((contract.nodes[0].evidenceContract as any).itemContracts).toEqual(Object.fromEntries(plannerPlan.activities[0].items.map(i=>[i.id,i])));
});

it('rejects a retry disguised as two fresh rows in one completion',()=>{
 const {rootDir}=setup();
 expect(()=>recordCanonicalNodeCompletion({childId:'lab',homeworkId:'hw',nodeId:'baseline',sessionId:'s',result:{completed:true,accuracy:1,timeSpent_ms:10,targetResults:[{target:'q1',attemptedValue:'9',correct:false},{target:'q1',attemptedValue:'10',correct:true}]}},{rootDir})).toThrow('learning_cycle_duplicate_item:q1');
 expect(getLearningCycle('lab','hw',{rootDir})!.observations).toHaveLength(0);
});

it.each([undefined,[],[{id:'same'},{id:'same'}]])('rejects missing or duplicate next math contracts before generation',async items=>{
 const {rootDir,complete}=setup();complete('10');
 await expect(advanceCanonicalCycleFromEvidence({childId:'lab',homeworkId:'hw',decide:async()=>({status:'revised',reason:'Support',progressionAction:'generate_support',preserve:[],change:[],testNext:[],nextEvidenceRequired:[],nextInstrument:{nodeId:'support',title:'Support',academicTarget:'groups',mechanic:'lab',theme:'lab',openingPurpose:'Practice',creatorPrompt:'Build',items} as never})},{rootDir})).rejects.toThrow(/math_instrument/);
});
it('rejects duplicate selection option identities',()=>expect(()=>parseDirectItem({id:'q',prompt:'Choose',lineage:{sourceEvidenceIds:['s'],exposure:'unseen',measurementRole:'fresh_checkpoint'},response:{mode:'selection',options:[{id:'same',label:'10',correct:true},{id:'same',label:'9',correct:false}]}})).toThrow('direct_plan_duplicate_option_id'));
