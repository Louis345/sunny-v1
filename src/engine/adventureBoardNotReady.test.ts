import {describe,it,expect} from 'vitest';
import * as board from '../shared/adventureBoardDefinition';
import {linearJourneyFixture} from '../scripts/fixtures/authoredJourney';

// A failed truth check degrades one portal. It never regenerates the plan, never
// blocks publication, and never strands the child behind it.
const definition=()=>linearJourneyFixture(['a','b','c']) as board.AdventureBoardDefinition;
const activities=['a','b','c'].map(id=>({id,verified:id!=='b',state:id==='b'?'needs_attention':'ready'}));
const render=(completedNodeIds:string[])=>(board.renderBoardDefinition as any)(definition(),{boardId:'board',planId:'plan',childId:'synthetic',domain:'spelling',activities,completedNodeIds,notReady:{b:'unknown_target_word'}}) as ReturnType<typeof board.renderBoardDefinition>;

describe('a not-ready portal is shown truthfully and passed over',()=>{
 it('shows the portal as not ready with its reason',()=>{
  const node=render(['a']).nodes.find(candidate=>candidate.activityNodeId==='b')!;
  expect(node.state).toBe('locked');
  expect(node.lock).toEqual({reason:'not-ready',label:'Not ready'});
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
