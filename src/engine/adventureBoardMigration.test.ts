import {it,expect} from 'vitest';
import {buildAdventureBoardFromActiveSessionPlan} from '../shared/adventureBoardFromPlan';
import {authoredJourney} from '../scripts/fixtures/authoredJourney';
import {renderBoardDefinition} from '../shared/adventureBoardDefinition';
const definition=authoredJourney();
const plan={planId:'p',childId:'synthetic',domain:'spelling',nodePlan:['play','check','learn'].map(id=>({id,type:'word-radar'}))};
it('refuses to reconstruct missing historical topology from a node inventory',()=>{
  expect(()=>buildAdventureBoardFromActiveSessionPlan({plan,boardId:'b',theme:definition.theme})).toThrow('board_definition_missing');
});
it('reads a saved legacy board without rebuilding its topology or mutating its source',()=>{
  const saved=renderBoardDefinition(definition,{boardId:'saved',planId:'p',childId:'synthetic',domain:'spelling',activities:[]});
  delete saved.definition;
  const result=buildAdventureBoardFromActiveSessionPlan({plan:{...plan,adventureBoard:saved},boardId:'ignored',theme:definition.theme});
  expect(result).toEqual(saved); expect(result).not.toBe(saved);
});
it('new production projection is exactly the authored journey, never inferred routes',()=>{
  const result=buildAdventureBoardFromActiveSessionPlan({plan:{...plan,boardDefinition:definition},boardId:'b',theme:definition.theme} as any);
  expect(result.definition).toEqual(definition);
  expect(result.edges.map(({id,from,to})=>({id,from,to}))).toEqual(definition.edges);
  expect(result.nodes.map(n=>n.label)).toEqual(definition.portals.map(p=>p.label));
});
