import {describe,it,expect,vi,afterEach} from 'vitest';
import * as board from '../shared/adventureBoardDefinition';
import {authoredJourney} from '../scripts/fixtures/authoredJourney';

// The Planner wrote the plan twice (inventory plus a portal/path grammar) and code
// rejected every mismatch between them. One sequence cannot contradict itself.
const nodes=[{id:'warm',title:'Warm up'},{id:'learn',title:'Learn the pattern'},{id:'play',title:'Play with it'},{id:'check',title:'Final check'},{id:'spare',title:'Never used'}];
const sequence={title:'Choose your spelling adventure',opening:['warm'],
 choice:{purpose:'Which way would you like to begin?',label:'Pick your path',options:[
  {id:'learn-first',label:'Learn first',hypothesis:'Explanation first may help engagement.',nodeIds:['learn','play']},
  {id:'play-first',label:'Play first',hypothesis:'Play first may help engagement.',nodeIds:['play','learn']}]},
 closing:['check'],endpointLabel:'You finished!'};
const expand=(input:unknown=sequence,inventory=nodes)=>(board as any).expandJourneySequence(input,inventory) as board.AdventureJourneyDefinition;
afterEach(()=>vi.restoreAllMocks());

describe('the Planner authors the journey in one place',()=>{
 it('expands opening, choice and closing into portals, paths and connections',()=>{
  expect(board).toHaveProperty('expandJourneySequence');
  const journey=expand();
  expect(journey.title).toBe(sequence.title);
  expect(journey.portals.filter(portal=>portal.kind==='start')).toHaveLength(1);
  expect(journey.portals.filter(portal=>portal.kind==='choice').map(portal=>portal.label)).toEqual(['Pick your path']);
  expect(journey.portals.filter(portal=>portal.kind==='endpoint').map(portal=>portal.label)).toEqual(['You finished!']);
  // A shared activity on two options is two presentations of one instrument.
  expect(journey.portals.filter(portal=>portal.kind==='activity').map(portal=>portal.activityNodeId).sort()).toEqual(['check','learn','learn','play','play','warm']);
  expect(journey.portals.find(portal=>portal.activityNodeId==='learn')!.label).toBe('Learn the pattern');
  expect(journey.choices).toHaveLength(1);
  expect(journey.choices[0].purpose).toBe(sequence.choice.purpose);
  expect(journey.choices[0].options.map(option=>[option.id,option.label,option.hypothesis])).toEqual(sequence.choice.options.map(option=>[option.id,option.label,option.hypothesis]));
  expect(board.journeyExecutions(journey).map(execution=>execution.activityNodeIds)).toEqual([['warm','learn','play','check'],['warm','play','learn','check']]);
  expect(journey.edges.length).toBeGreaterThan(0);
 });

 it('cannot produce a topology defect, so nothing is sent back to the Planner',()=>{
  expect(board.validateBoardDefinition(expand(),['warm','learn','play','check'])).toEqual([]);
  const single=expand({title:'One path',opening:['learn','play'],closing:['check'],singlePathReason:'One academically valid order.',endpointLabel:'Done'});
  expect(board.validateBoardDefinition(single,['learn','play','check'])).toEqual([]);
  expect(board.journeyExecutions(single).map(execution=>execution.activityNodeIds)).toEqual([['learn','play','check']]);
 });

 it('expands the same sequence the same way every time',()=>{
  expect(JSON.stringify(expand())).toBe(JSON.stringify(expand(structuredClone(sequence),structuredClone(nodes))));
 });

 it('leaves an unreferenced activity off the board and logs it instead of rejecting the plan',()=>{
  const log=vi.spyOn(console,'log').mockImplementation(()=>{});
  const journey=expand();
  expect(journey.portals.some(portal=>portal.activityNodeId==='spare')).toBe(false);
  expect(log.mock.calls.map(call=>String(call[0])).some(line=>line.includes('🎮 [planner] [journey] [node-unused]')&&line.includes('spare'))).toBe(true);
 });

 it('gives the Planner tool the sequence and not the portal/path/edge grammar',()=>{
  expect(board).toHaveProperty('JOURNEY_SEQUENCE_TOOL_SCHEMA');
  const properties=(board as any).JOURNEY_SEQUENCE_TOOL_SCHEMA.properties;
  expect(Object.keys(properties).sort()).toEqual(['choice','closing','endpointLabel','opening','singlePathReason','title']);
 });

 // Guard, green before and after: published v2 boards stay readable and render as before.
 it('still reads and renders a saved v2 definition unchanged',()=>{
  const saved=authoredJourney();
  expect(board.adventureBoardDefinitionSchema.parse(saved)).toEqual(saved);
  const rendered=board.renderBoardDefinition(saved,{boardId:'b',planId:'p',childId:'synthetic',domain:'spelling',activities:['learn','play','check'].map(id=>({id,verified:true,state:'ready'}))});
  expect(rendered.nodes.map(node=>node.id)).toEqual(saved.portals.map(portal=>portal.id));
  expect(rendered.definition).toEqual(saved);
 });

 // Kiosk run 2026-10-13: the choice screen's headline read "Let Sunny choose which practice
 // style she wants to reinforce..." because the form asked for a "purpose" and showed it to her.
 it('asks for the choice question in words spoken to the child',()=>{
  const purpose=(board as any).JOURNEY_SEQUENCE_TOOL_SCHEMA.properties.choice.properties.purpose.description as string;
  expect(purpose).toContain('she reads');
  expect(purpose).toContain('never about her');
 });

 // Live run 12: thirteen portals cannot fit the kiosk canvas with air between them, and the
 // artist spent three looks failing to pack them. The Planner was never told the canvas size.
 it('tells the Planner how many stops the map holds comfortably, as a fact and not a limit',()=>{
  const instruction=(board as any).JOURNEY_SEQUENCE_INSTRUCTION as string;
  expect(instruction).toContain('7 steps');
  expect(instruction).toContain('your decision');
 });
});
