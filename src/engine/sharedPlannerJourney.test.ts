import {it, expect} from 'vitest';
import {MATH_LEARNING_PROGRAM_TOOL_SCHEMA} from './directMathExperience';
import {parseCanonicalProgressionDecision} from './learningCycleRuntime';
import {buildDiscoveryActiveSessionPlan} from './adaptiveMathDiscovery';
import {authoredJourney} from '../scripts/fixtures/authoredJourney';
it('math authors the same definition instead of a second fork contract',()=>{
  expect((MATH_LEARNING_PROGRAM_TOOL_SCHEMA as any).properties.boardDefinition).toBeDefined();
  expect((MATH_LEARNING_PROGRAM_TOOL_SCHEMA as any).properties.fork).toBeUndefined();
});
it('a new successor cannot silently synthesize a board from its inventory',()=>{
  expect(()=>parseCanonicalProgressionDecision({status:'revised',reason:'more evidence',progressionAction:'collect_more_evidence',nextInstruments:[{nodeId:'one',title:'One',academicTarget:'recall',mechanic:'keyboard',theme:'calm',openingPurpose:'try',creatorPrompt:'measure'}]})).toThrow('board_definition');
});
it('a probe projection must preserve authored portals rather than distributing inventory positions',()=>{
 const d=authoredJourney();
 const evaluation:any={evaluationId:'eval',title:'Opening',boardDefinition:d,assignmentEvidenceIds:['source'],items:[],probeActivities:['learn','play','check'].map(nodeId=>({nodeId,title:nodeId,itemIds:[]})),artifact:{htmlPath:'/x',artworkPath:'/x.png'}};
 // Empty items are rejected by the academic instrument before the presentation can be projected.
 expect(()=>buildDiscoveryActiveSessionPlan({childId:'synthetic',homeworkId:'h',evaluation,companion:{id:'elli',name:'Elli'}})).toThrow();
});
