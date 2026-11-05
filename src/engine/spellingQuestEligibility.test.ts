import {expect,it} from 'vitest';
import {baselineQuestEvidenceEligibility} from './learningCycleRuntime';

// Human-caught 2026-11-05: both girls had fresh, unaided correct words on their first check, yet every
// next-board question told the Planner "Quest not available, 0 target-aligned observations". Logs showed the
// eligibility line but nobody compared it with her answers; the lab cycles used one board-level skill and an
// `activity:<node>` source, so the per-word skills, the Discovery check and the `:recall` source were never tried.
// The cycle below has the shape the kiosk really saves.
const item=(word:string)=>({id:`item-${word}`,wordId:word,constructId:`spelling.word.${word}`});
const cycle=(observations:unknown[])=>({
 domain:'spelling',
 academicPredictions:['a','b'].map(word=>({predictionId:`p-${word}`,constructId:`spelling.word.${word}`})),
 nodes:[
  {nodeId:'hw:discovery',role:'evaluation',academicTarget:{skill:'independent_recall'},evidenceContract:{spellingItems:{a:item('a'),b:item('b')}}},
  {nodeId:'hw:b2:step-1',role:'baseline',academicTarget:{skill:'spelling_practice'},evidenceContract:{spellingItems:{a:item('a')}}},
 ],
 observations,
}) as never;
const seen=(word:string,over:Record<string,unknown>={})=>({observationId:`o-${word}`,sourceId:'evaluation:hw:discovery',itemId:`item-${word}`,childResponse:word,
 constructLinks:[{constructId:`spelling.word.${word}`,role:'primary',confidence:1}],result:{correct:true,score:1},assistance:{status:'unassisted',scaffolds:[]},
 exposure:'unseen',provenance:'independent_probe',confounds:[`word_id:${word}`,'measurement_role:fresh_checkpoint'],...over});

it('counts a fresh, unaided correct word on her first check toward Quest',()=>{
 expect(baselineQuestEvidenceEligibility(cycle([seen('a'),seen('b',{result:{correct:false,score:0},childResponse:'bb'})]))).toEqual({
  eligible:true,targetAlignedObservationCount:2,independentCorrectObservationCount:1,reason:'eligible_independent_correct_evidence'});
});

it('counts her typed answers on later boards as aligned practice, never as fresh evidence',()=>{
 const practice=seen('a',{observationId:'o-later',sourceId:'activity:hw:b2:step-1:recall',exposure:'previously_practiced',provenance:'practice'});
 expect(baselineQuestEvidenceEligibility(cycle([practice]))).toEqual({
  eligible:false,targetAlignedObservationCount:1,independentCorrectObservationCount:0,reason:'no_independent_correct_baseline_evidence'});
});

it('never counts a word that is not on her list, or help she was given',()=>{
 const stranger=seen('z',{observationId:'o-z'});
 const helped=seen('a',{observationId:'o-help',assistance:{status:'assisted',scaffolds:['companion_help']}});
 expect(baselineQuestEvidenceEligibility(cycle([stranger,helped]))).toMatchObject({eligible:false,targetAlignedObservationCount:1,independentCorrectObservationCount:0});
});
