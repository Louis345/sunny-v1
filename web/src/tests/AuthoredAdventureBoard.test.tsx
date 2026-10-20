import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AdventureBoard } from '../components/AdventureBoard';
import { authoredJourney } from '../../../src/scripts/fixtures/authoredJourney';
import { renderBoardDefinition } from '../../../src/shared/adventureBoardDefinition';
import { resolvePlannerBoardChoiceLaunchNode } from '../utils/adventureBoardLaunch';

function board() { return renderBoardDefinition(authoredJourney(),{boardId:'board',planId:'plan',childId:'synthetic',domain:'spelling',activities:['learn','play','check'].map(id=>({id,type:'word-radar',state:'ready',verified:true,targets:['float']}))}); }
it('opens the authored fork as an addressed interaction and shows the real alternatives', () => {
  const opened=vi.fn(); const selected=vi.fn();
  render(<AdventureBoard board={board()} onNodeClick={opened} onChoiceClick={selected}/>);
  fireEvent.click(screen.getByRole('button',{name:'choose'}));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByText('Learn first')).toBeTruthy();
  expect(screen.getByText('Play first')).toBeTruthy();
  expect(opened.mock.calls[0][0].choiceSetId).toBe('order');
  fireEvent.click(screen.getByText('Play first'));
  expect(selected.mock.calls[0][0].journeyOptionId).toBe('play');
});
it('launches the canonical activity identity, not its alternative presentation portal', () => {
  const rendered=board();
  const packet={activeSessionPlan:{adventureBoard:rendered,boardDefinition:rendered.definition,nodePlan:['learn','play','check'].map(id=>({id,type:'word-radar',activityId:'word-radar',targets:['float']}))}} as any;
  expect(resolvePlannerBoardChoiceLaunchNode(packet,rendered.choiceSets![0].options[1])?.id).toBe('play');
});
it('retains the declared portrait position and edge control points', () => {
  const definition=authoredJourney();
  Object.assign(definition.edges[0],{controlPoints:{landscape:[{x:.12,y:.3}],portrait:[{x:.6,y:.15}]}});
  const rendered=renderBoardDefinition(definition,{boardId:'b',planId:'p',childId:'synthetic',domain:'spelling',activities:[]});
  const {container}=render(<AdventureBoard board={rendered}/>);
  const start=screen.getAllByRole('button',{name:'start'})[0];
  expect(start.style.getPropertyValue('--narrow-x')).toBe(`${definition.portals.find(portal => portal.id === 'start')!.position.portrait.x * 100}%`);
  expect(container.querySelector('polyline')?.getAttribute('points')).toContain('12,30');
});

it('opens a fully verified board with an unresolved fork and holds any unfinished sibling',async()=>{
 const {shouldHoldTargetedBoardForPreparation}=await import('../utils/adventureBoardLaunch');
 const rendered=board();
 const packet:any={activeSessionPlan:{domain:'spelling',planId:'plan',adventureBoard:rendered},childChart:{learningCycle:{lifecycle:'board_ready'}}};
 expect(shouldHoldTargetedBoardForPreparation(packet)).toBe(false);
 const unfinished=renderBoardDefinition(authoredJourney(),{boardId:'b',planId:'p',childId:'synthetic',domain:'spelling',activities:[{id:'learn',state:'ready',verified:true},{id:'play',state:'generating',verified:false},{id:'check',state:'ready',verified:true}]});
 expect(shouldHoldTargetedBoardForPreparation({...packet,activeSessionPlan:{...packet.activeSessionPlan,adventureBoard:unfinished}})).toBe(true);
});

it('records shown options and explicit dismissal without selecting an alternative',()=>{
 const visibility=vi.fn();const selected=vi.fn();
 render(<AdventureBoard board={board()} onChoiceVisibilityChange={visibility} onChoiceClick={selected}/>);
 fireEvent.click(screen.getAllByRole('button',{name:'choose'}).at(-1)!);
 expect(visibility).toHaveBeenCalledWith(expect.objectContaining({id:'order'}),true);
 fireEvent.click(screen.getByRole('button',{name:'Back to map'}));
 expect(visibility).toHaveBeenLastCalledWith(expect.objectContaining({id:'order'}),false);
 expect(selected).not.toHaveBeenCalled();
});
