/**
 * Human-caught 2026-11-20 15:30 UTC (owner, Ila's math board 9): "one of the nodes is locked ... then she can never
 * finish". She played both fork games straight from the board (any order is allowed), never tapped the fork, and the
 * Quest behind the fork stayed locked: the frontier still waited for a fork card nobody needed any more.
 * Why the human caught it: only a child plays the fork's games without the fork. Why logs missed it: every completion
 * saved fine and no line reports the frontier. Why the lab missed it: frontier tests always chose before playing.
 * The rule: a fork whose option she already played counts as decided.
 */
import {describe,expect,it} from 'vitest';
import * as board from '../shared/adventureBoardDefinition';
import {choiceJourneyFixture} from '../scripts/fixtures/authoredJourney';

const routes=(...ids:string[])=>ids.map(id=>({id,label:`Go ${id}`,nodeIds:[id]}));
const definition=()=>choiceJourneyFixture(routes('x','y'),['a'],['quest','gift']) as board.AdventureBoardDefinition;

describe('a fork she played past counts as decided',()=>{
 it('moves on to the Quest when both fork games are done without a fork card',()=>{
  expect(board.journeyFrontier(definition(),{},['a','x','y'])).toMatchObject({activityNodeId:'quest',complete:false});
 });

 it('moves on when only one fork game is done',()=>{
  expect(board.journeyFrontier(definition(),{},['a','y'])).toMatchObject({activityNodeId:'quest',complete:false});
 });

 it('still asks at the fork when no fork game is done',()=>{
  expect(board.journeyFrontier(definition(),{},['a'])).toMatchObject({choiceId:'choice',complete:false});
 });

 it('keeps her own fork card over a game played another way',()=>{
  expect(board.journeyFrontier(definition(),{choice:'x'},['a','y'])).toMatchObject({activityNodeId:'x'});
 });
});
