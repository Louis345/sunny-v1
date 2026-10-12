import {describe,it,expect} from 'vitest';
import {authoredJourney} from '../scripts/fixtures/authoredJourney';
import {adventureJourneySchema,adventureCompositionSchema,journeyFromBoardDefinition,compositionFromBoardDefinition,assembleAdventureBoardDefinition} from '../shared/adventureBoardDefinition';

describe('Planner semantics and Creator composition',()=>{
 it('gives the Planner paths and choices without asking for visual composition',()=>{
  const board=authoredJourney();const journey=journeyFromBoardDefinition(board);
  expect(journey.paths).toEqual(board.paths);expect(journey.choices).toEqual(board.choices);
  expect(journey.portals.map(p=>p.activityNodeId)).toEqual(board.portals.map(p=>p.activityNodeId));
  expect(journey).not.toHaveProperty('theme');expect(journey.portals[0]).not.toHaveProperty('position');
  expect(()=>adventureJourneySchema.parse({...journey,theme:board.theme})).toThrow();
 });
 it('assembles the same canvas losslessly and freezes educational ownership',()=>{
  const board=authoredJourney(),journey=journeyFromBoardDefinition(board),composition=compositionFromBoardDefinition(board);
  const before=JSON.stringify({journey,composition});
  expect(assembleAdventureBoardDefinition(journey,composition)).toEqual(board);
  expect(JSON.stringify({journey,composition})).toBe(before);
  expect(()=>adventureCompositionSchema.parse({...composition,choices:[]})).toThrow();
  expect(()=>adventureCompositionSchema.parse({...composition,portals:composition.portals.map(p=>({...p,activityNodeId:'other'}))})).toThrow();
 });
 it('repairs presentation without changing labels, activities, choices or exposure order',()=>{
  const board=authoredJourney(),journey=journeyFromBoardDefinition(board),composition=compositionFromBoardDefinition(board);
  composition.portals[0].position.portrait={x:.2,y:.1};composition.theme.background={type:'image',value:'/generated/adventure-board-demo/silent-letter-world.jpeg'};
  const assembled=assembleAdventureBoardDefinition(journey,composition);
  expect(journeyFromBoardDefinition(assembled)).toEqual(journey);
  expect(assembled.portals[0].position.portrait).toEqual({x:.2,y:.1});
 });
 it.each(['missing','duplicate','foreign'] as const)('rejects %s presentation identity without silently changing the journey',kind=>{
  const board=authoredJourney(),journey=journeyFromBoardDefinition(board),composition=compositionFromBoardDefinition(board);
  if(kind==='missing')composition.portals.pop();
  if(kind==='duplicate')composition.portals[1]=structuredClone(composition.portals[0]);
  if(kind==='foreign')composition.portals[0].id='unrequested';
  expect(()=>assembleAdventureBoardDefinition(journey,composition)).toThrow('board_composition_identity_invalid');
 });
 it.each(['portals','edges'] as const)('rejects duplicated Planner %s before assembly',field=>{
  const board=authoredJourney(),journey=journeyFromBoardDefinition(board),composition=compositionFromBoardDefinition(board);
  journey[field][1]=structuredClone(journey[field][0]) as never;
  expect(()=>assembleAdventureBoardDefinition(journey,composition)).toThrow('board_composition_identity_invalid');
 });

});
