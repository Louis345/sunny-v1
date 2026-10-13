import {expect,it} from 'vitest';
import {z} from 'zod';
import {assertNativeLearningProgramCorrection} from './assignmentPlanner';
import {adventureJourneySchema,journeyExecutions,validateBoardDefinition} from '../shared/adventureBoardDefinition';
const authored={version:2,title:'Choose your practice',rationale:'Two equivalent learning sequences',rootPathId:'root',portals:[{id:'start',label:'Start',kind:'start'},{id:'choice',label:'Choose',kind:'choice'},{id:'a',label:'Learn first',kind:'activity',activityNodeId:'shared-a'},{id:'b',label:'Play first',kind:'activity',activityNodeId:'shared-b'},{id:'check',label:'Check',kind:'activity',activityNodeId:'checkpoint'},{id:'end',label:'Done',kind:'endpoint'}],paths:[{id:'root',portalIds:['start','choice','check','end']},{id:'learn',portalIds:['a','b']},{id:'play',portalIds:['b','a']}],choices:[{id:'order',portalId:'choice',purpose:'Choose the order',options:[{id:'learn-first',label:'Learn first',pathId:'learn',hypothesis:'Teaching first may help'},{id:'play-first',label:'Play first',pathId:'play',hypothesis:'Playing first may help'}]}]};
it('derives every connection from the authored ordered paths without asking for duplicate chronology',()=>{
 const journey=adventureJourneySchema.parse(authored);
 expect(journeyExecutions(journey).map(x=>x.activityNodeIds)).toEqual([['shared-a','shared-b','checkpoint'],['shared-b','shared-a','checkpoint']]);
 expect(new Set(journey.edges.map(e=>`${e.from}->${e.to}`))).toEqual(new Set(['start->choice','choice->a','a->b','b->check','check->end','choice->b','b->a','a->check']));
 expect(validateBoardDefinition(journey,['shared-a','shared-b','checkpoint'])).toEqual([]);
 expect(journey.paths).toEqual(authored.paths);expect(journey.choices).toEqual(authored.choices);
 expect(adventureJourneySchema.parse(authored).edges).toEqual(journey.edges);
});
it('keeps received historical connection identities unchanged',()=>{
 const saved={...authored,edges:[{id:'old-connection-id',from:'start',to:'choice'}]};
 expect(adventureJourneySchema.parse(saved).edges).toEqual(saved.edges);
});
it('does not invent a path to make a cyclic choice executable',()=>{
 expect(()=>adventureJourneySchema.parse({...authored,paths:[{id:'root',portalIds:['start','choice','end']},{id:'learn',portalIds:['choice']},{id:'play',portalIds:['a']}]})).toThrow('path_cycle');
});
it('enforces the existing connection capacity before asking the Creator for an impossible composition',()=>{
 const ids=Array.from({length:32},(_,i)=>`a${i}`),steps=[1,3,5,7,9,11,13,15];
 const make=(multipliers:number[])=>({...authored,portals:[{id:'start',label:'Start',kind:'start'},{id:'fork',label:'Choose',kind:'choice'},...ids.map(id=>({id,label:id,kind:'activity',activityNodeId:id})),{id:'end',label:'Done',kind:'endpoint'}],paths:[{id:'root',portalIds:['start','fork','end']},...multipliers.map(step=>({id:`p${step}`,portalIds:ids.map((_,i)=>ids[(i*step)%32])}))],choices:[{id:'choose',portalId:'fork',purpose:'Choose a sequence',options:multipliers.map(step=>({id:`o${step}`,label:`Order ${step}`,pathId:`p${step}`,hypothesis:'Compare engagement'}))}]});
 expect(adventureJourneySchema.parse(make(steps.slice(0,-1))).edges).toHaveLength(226);
 expect(()=>adventureJourneySchema.parse(make(steps))).toThrow('journey_capacity_exceeded');
});

it('keeps valid sibling paths immutable when a traversal defect arrives through schema validation',()=>{
 const journey={...authored,portals:[...authored.portals,{id:'c',label:'Third activity',kind:'activity',activityNodeId:'shared-c'}],paths:[authored.paths[0],{id:'learn',portalIds:['choice','a']},{id:'play',portalIds:['b','c']}]};
 const original={journey};const parsed=z.object({journey:adventureJourneySchema}).safeParse(original);
 expect(parsed.success).toBe(false);if(parsed.success)throw new Error('expected cyclic path');
 const repaired=structuredClone(original);repaired.journey.paths[1].portalIds=['a'];
 expect(()=>assertNativeLearningProgramCorrection(original,repaired,parsed.error)).not.toThrow();
 const drift=structuredClone(repaired);drift.journey.paths[2].portalIds=['c','b'];
 expect(()=>assertNativeLearningProgramCorrection(original,drift,parsed.error)).toThrow('learning_program_correction_changed_protected_fields');
});

it('treats an endpoint bound to the preceding activity as its completion marker, not another measurement',()=>{
 const semantic={version:2,title:'One instrument',rationale:'Keep the endpoint binding',rootPathId:'root',singlePathReason:'One chapter',portals:[{id:'start',kind:'start',label:'Start'},{id:'reward',kind:'activity',label:'Reward',activityNodeId:'reward-instrument'},{id:'end',kind:'endpoint',label:'Done',activityNodeId:'reward-instrument'}],paths:[{id:'root',portalIds:['start','reward','end']}],choices:[]};
 const journey=adventureJourneySchema.parse(semantic);expect(journeyExecutions(journey)[0].activityNodeIds).toEqual(['reward-instrument']);expect(validateBoardDefinition(journey,['reward-instrument'])).toEqual([]);expect(journey.portals).toEqual(semantic.portals);expect(journeyExecutions(journey)[0].portalIds).toEqual(['start','reward','end']);
 const repeated=adventureJourneySchema.parse({...semantic,portals:[...semantic.portals.slice(0,2),{id:'again',kind:'activity',label:'Measure again',activityNodeId:'reward-instrument'},{id:'end',kind:'endpoint',label:'Done'}],paths:[{id:'root',portalIds:['start','reward','again','end']}]});expect(validateBoardDefinition(repeated,['reward-instrument']).some(issue=>issue.code==='repeated_instrument')).toBe(true);
 const boundOnly=adventureJourneySchema.parse({...semantic,portals:[semantic.portals[0],semantic.portals[2]],paths:[{id:'root',portalIds:['start','end']}]});expect(journeyExecutions(boundOnly)[0].activityNodeIds).toEqual(['reward-instrument']);
});
