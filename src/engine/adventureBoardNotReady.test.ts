import {describe,it,expect} from 'vitest';
import * as board from '../shared/adventureBoardDefinition';
import {choiceJourneyFixture,linearJourneyFixture} from '../scripts/fixtures/authoredJourney';

// A failed truth check degrades one portal. It never regenerates the plan, never
// blocks publication, and never strands the child behind it.
// 2026-10-24 human catch (#28, #44): a child's board showed two "Not ready" stops and a choice with a
// dead option; picking that option finished the path at once and ended her session. The log named each
// not-ready activity, but the lab only asserted that the portal said "Not ready" truthfully.
// A child now never sees a stop she cannot play: it is left off her screen and the path joins around it.
const definition=()=>linearJourneyFixture(['a','b','c']) as board.AdventureBoardDefinition;
const activities=['a','b','c'].map(id=>({id,verified:id!=='b',state:id==='b'?'needs_attention':'ready'}));
const render=(completedNodeIds:string[])=>(board.renderBoardDefinition as any)(definition(),{boardId:'board',planId:'plan',childId:'synthetic',domain:'spelling',activities,completedNodeIds,notReady:{b:'unknown_target_word'}}) as ReturnType<typeof board.renderBoardDefinition>;

describe('a not-ready portal is left off the child\'s board and passed over',()=>{
 it('hides the portal and joins the path around it',()=>{
  const rendered=render(['a']);
  expect(rendered.nodes.find(candidate=>candidate.activityNodeId==='b')!.state).toBe('hidden');
  expect(rendered.nodes.filter(node=>node.lock?.label==='Not ready')).toEqual([]);
  expect(rendered.edges.filter(edge=>edge.from==='b'||edge.to==='b')).toEqual([]);
  expect(rendered.edges.map(edge=>`${edge.from}>${edge.to}`)).toEqual(['start>a','c>end','a>c']);
 });

 it('opens the next activity on the path instead of waiting behind it',()=>{
  const rendered=render(['a']);
  expect(rendered.nodes.find(candidate=>candidate.activityNodeId==='c')!.state).toBe('available');
  expect(rendered.progress?.currentNodeId).toBe('c');
  expect((board.journeyFrontier as any)(definition(),{},['a'],['b'])).toMatchObject({activityNodeId:'c',complete:false});
 });

 it('lets the chapter finish without the not-ready activity',()=>{
  expect((board.journeyFrontier as any)(definition(),{},['a','c'],['b'])).toEqual({complete:true});
  const rendered=render(['a','c']);
  expect(rendered.nodes.find(candidate=>candidate.id==='end')!.state).toBe('completed');
  // It was never played, so it is never reported as completed.
  expect(rendered.progress?.completedNodeIds).not.toContain('b');
 });
});

describe('a choice keeps only options she can play',()=>{
 const routes=(...ids:string[])=>ids.map(id=>({id,label:`Go ${id}`,nodeIds:[id]}));
 const renderChoice=(definition:board.AdventureBoardDefinition,notReady:string[],completed:string[]=['a'])=>board.renderBoardDefinition(definition,{boardId:'board',planId:'plan',childId:'synthetic',domain:'spelling',allowReadyActivitySelection:true,
  activities:['a','x','y','z','c'].map(id=>({id,verified:!notReady.includes(id),state:completed.includes(id)?'completed':'ready'})),completedNodeIds:completed,notReady:Object.fromEntries(notReady.map(id=>[id,'activity_build_failed']))});

 it('removes an option with nothing playable from the choice',()=>{
  const rendered=renderChoice(choiceJourneyFixture(routes('x','y','z'),['a'],['c']) as board.AdventureBoardDefinition,['z']);
  expect(rendered.choiceSets![0].options.map(option=>option.id)).toEqual(['x','y']);
  expect(rendered.nodes.find(node=>node.id==='choice')!.state).toBe('available');
 });

 it('turns a choice left with one playable option into a straight path',()=>{
  const definition=choiceJourneyFixture(routes('x','y'),['a'],['c']) as board.AdventureBoardDefinition;
  const rendered=renderChoice(definition,['y']);
  expect(rendered.nodes.find(node=>node.id==='choice')!.state).toBe('hidden');
  expect(rendered.nodes.find(node=>node.activityNodeId==='y')!.state).toBe('hidden');
  expect(rendered.choiceSets).toEqual([]);
  expect(rendered.edges.map(edge=>`${edge.from}>${edge.to}`).sort()).toEqual(['a>x:x','start>a','x:x>c','c>end'].sort());
  // The path goes straight on to the one playable option, and the board can finish without a choice.
  expect(board.journeyFrontier(definition,{},['a'],['y'])).toMatchObject({activityNodeId:'x'});
  expect(board.journeyFrontier(definition,{},['a','x','c'],['y'])).toEqual({complete:true});
 });

 it('passes over a choice with no playable option at all',()=>{
  const definition=choiceJourneyFixture(routes('x','y'),['a'],['c']) as board.AdventureBoardDefinition;
  expect(board.journeyFrontier(definition,{},['a'],['x','y'])).toMatchObject({activityNodeId:'c'});
  expect(renderChoice(definition,['x','y']).nodes.filter(node=>node.state!=='hidden').map(node=>node.id)).toEqual(['start','a','c','end']);
 });
});
