import { describe, expect, it } from 'vitest';
import { authoredJourney, choiceJourneyFixture } from '../scripts/fixtures/authoredJourney';
import { assignmentPlannerToolJsonSchema, parseAssignmentPlannerJson, validateAssignmentPlannerRelationships, buildAssignmentPlannerPrompt, assignmentPlannerSourceImages } from './assignmentPlanner';

function draft() {
  return {
    activeSessionPlan:{ boardDefinition:authoredJourney(), nodePlan:['check','play','learn'].map(id => ({id, type:'word-radar',activityId:'word-radar',targets:['float']})) },
    planTheory:{hypothesis:'H',evidenceSummary:['e'],intervention:'I',supportCriteria:['s'],reviseCriteria:['r'],falsifyCriteria:['f']},
    plannedMeasurements:['check','play','learn'].map(id => ({id:`measure-${id}`,activityId:'word-radar',target:'float',evidenceType:'practice',supportCriteria:'s',reviseCriteria:'r',falsifyCriteria:'f',
      spelling:{role:id==='check'?'fresh_checkpoint':'practice',interventionNodeIds:id==='check'?['learn','play']:[],evidenceIds:['e'],reason:'r',uncertainty:'u',expectedAccuracy:{min:0,max:1},confidence:.5,maxDelayDays:1,finalCheck:id==='check'}})),reviewQuestions:['q'],
  };
}

describe('Planner and runtime share the authored journey contract', () => {
  it('requires the definition in the tool and removes independently authored routes', () => {
    const schema = assignmentPlannerToolJsonSchema() as any;
    expect(schema.properties.activeSessionPlan.required).toContain('boardDefinition');
    expect(schema.properties.activeSessionPlan.properties).not.toHaveProperty('learningRoutes');
    expect(schema.properties.activeSessionPlan.properties.boardDefinition.properties.version.const).toBe(2);
  });
  it('preserves authored composition and validates checkpoint chronology on every path, not inventory order', () => {
    const input = draft();
    const parsed = parseAssignmentPlannerJson(JSON.stringify(input));
    expect(parsed.activeSessionPlan.boardDefinition).toEqual(input.activeSessionPlan.boardDefinition);
    expect(validateAssignmentPlannerRelationships(parsed,new Set(['e']),true,new Set(['float']))).toEqual(parsed);
  });
  it('rejects a checkpoint placed before its cited exposure on one alternative', () => {
    const input = draft();
    input.activeSessionPlan.boardDefinition.paths[1].portalIds = ['check','learn-a','play-a'];
    expect(() => validateAssignmentPlannerRelationships(parseAssignmentPlannerJson(JSON.stringify(input)),new Set(['e']),true,new Set(['float']))).toThrow('relationship_invalid');
  });
  it('gives targeted spelling the same authoring authority and no fixed spine', () => {
    const prompt = buildAssignmentPlannerPrompt({discoveryEvidence:{},plannerInstruction:'',childId:'synthetic'} as any);
    expect(prompt).toContain('boardDefinition');
    expect(prompt).toContain('singlePathReason');
    expect(prompt).not.toContain('exclusive node');
  });
});

it('never invents an activity or theory to repair an incomplete Planner response',()=>{
 const input:any=draft();delete input.activeSessionPlan.boardDefinition;delete input.activeSessionPlan.nodePlan;
 expect(()=>parseAssignmentPlannerJson(JSON.stringify(input))).toThrow();
});

it('returns unauthorized encounter errors to the Planner instead of silently dropping portals',()=>{
 const input:any=draft();input.activeSessionPlan.nodePlan.find((node:any)=>node.id==='learn').type='quest';
 expect(()=>validateAssignmentPlannerRelationships(parseAssignmentPlannerJson(JSON.stringify(input)),new Set(['e']),true,new Set(['float']))).toThrow('planner_encounter_not_authorized');
 expect(input.activeSessionPlan.boardDefinition.portals.some((portal:any)=>portal.activityNodeId==='learn')).toBe(true);
});

it('validates checkpoint exposure against the chosen branch, preserving both alternative interventions',()=>{
 const input=draft();input.activeSessionPlan.boardDefinition=choiceJourneyFixture([{id:'learn',label:'Learn',nodeIds:['learn']},{id:'play',label:'Play',nodeIds:['play']}],[],['check']) as any;
 expect(()=>validateAssignmentPlannerRelationships(parseAssignmentPlannerJson(JSON.stringify(input)),new Set(['e']),true,new Set(['float']))).not.toThrow();
});

// Captured assignment truth replaces source re-extraction after Discovery.
it('does not resend source images or duplicate instructions for targeted planning',()=>{
 const packet:any={childId:'synthetic',sourceDocument:{pages:[{imagePath:'goldens/visual-explainer/erosion/erosion-reveal.png'}]},discoveryEvidence:{observations:[{observationId:'attempt-1',childResponse:'nite'}]},capturedHomework:{words:['night']},plannerInstruction:'UNIQUE_INSTRUCTION'};
 expect(assignmentPlannerSourceImages(packet)).toEqual([]);
 const prompt=buildAssignmentPlannerPrompt(packet);
 expect(prompt.split('UNIQUE_INSTRUCTION')).toHaveLength(2);
 expect(prompt).toContain('attempt-1');expect(prompt).toContain('nite');expect(prompt).toContain('night');
 expect(packet.plannerInstruction).toBe('UNIQUE_INSTRUCTION');
});
