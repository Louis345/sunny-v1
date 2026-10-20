import {describe,it,expect} from 'vitest';
import {buildAdventureBoardFromActiveSessionPlan,getAdventureBoardSelectableRoutes} from '../shared/adventureBoardFromPlan';
import {authoredJourney} from '../scripts/fixtures/authoredJourney';

// Replaces the deleted topology compiler's fixed-slot and inferred-route tests.
// Those tests mandated the transformations that lost the human's shared fork.
describe('authored board projection boundary',()=>{
 const definition=authoredJourney();
 const plan={planId:'p',childId:'synthetic',domain:'spelling',boardDefinition:definition,nodePlan:['check','play','learn'].map(id=>({id,type:'word-radar',title:'Inventory title must not replace portal label',wordRadarConfig:{recallMode:'partial_visual_recall' as const,inputMode:'letter-by-letter' as const}}))};
 it('preserves portal labels, order, positions, paths and edges despite reversed inventory',()=>{
  const board=buildAdventureBoardFromActiveSessionPlan({plan,boardId:'b',theme:definition.theme});
  expect(board.definition).toEqual(definition);
  expect(board.nodes.map(n=>[n.id,n.label,n.position])).toEqual(definition.portals.map(p=>[p.id,p.label,p.position.landscape]));
  expect(board.edges.map(({state,...edge})=>edge)).toEqual(definition.edges);
  expect(board.nodes.find(n=>n.id==='learn-a')!.wordRadarConfig?.inputMode).toBe('letter-by-letter');
 });
 it('derives compatibility sequences losslessly including different orders of shared instruments',()=>{
  expect(getAdventureBoardSelectableRoutes(plan).map(route=>route.nodeIds)).toEqual([['learn','play','check'],['play','learn','check']]);
 });
 it('refuses inventory-only reconstruction and preserves saved legacy topology exactly',()=>{
  const {boardDefinition,...legacy}=plan;
  expect(()=>buildAdventureBoardFromActiveSessionPlan({plan:legacy,boardId:'b',theme:definition.theme})).toThrow('board_definition_missing');
  const saved=buildAdventureBoardFromActiveSessionPlan({plan,boardId:'saved',theme:definition.theme});delete saved.definition;
  expect(buildAdventureBoardFromActiveSessionPlan({plan:{...legacy,adventureBoard:saved},boardId:'different',theme:definition.theme})).toEqual(saved);
 });
 it('does not infer readiness or select an option before canonical verification and choice',()=>{
  const board=buildAdventureBoardFromActiveSessionPlan({plan,boardId:'b',theme:definition.theme});
  expect(board.nodes.filter(n=>n.activityNodeId).every(n=>n.state==='locked')).toBe(true);
  expect(board.progress?.currentNodeId).toBe('choose');
  expect(board.nodes.filter(n=>n.kind==='choice-gate')).toHaveLength(1);
 });
});
