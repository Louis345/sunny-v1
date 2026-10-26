import { describe, expect, it } from 'vitest';
import { adventureBoardDefinitionSchema, validateBoardDefinition, journeyExecutions, journeyFrontier, renderBoardDefinition } from '../shared/adventureBoardDefinition';

// Human found a missing fork: the model selected two sequences through the same
// instruments, but normalization discarded both. Logs warned without preventing
// publication. Earlier labs tested exclusive-node fixtures, not authored intent.
import { authoredJourney,linearJourneyFixture } from '../scripts/fixtures/authoredJourney';

const inventory = ['check', 'play', 'learn'];
describe('Planner-authored journey authority', () => {
  it('keeps engagement hypotheses in evidence metadata rather than child-facing descriptions', () => {
    const definition = authoredJourney();
    definition.choices[0].options[0].hypothesis = 'Internal learner-trait hypothesis';
    const board = renderBoardDefinition(definition, {
      boardId:'board', planId:'plan', childId:'synthetic', domain:'spelling',
      activities:inventory.map(id => ({id,state:'ready',verified:true})),
    });
    const option = board.choiceSets![0].options[0];
    expect(option.label).toBe(definition.choices[0].options[0].label);
    expect(option.description).toBeUndefined();
    expect(option.choiceSignal?.expectedEvidence).toBe('Internal learner-trait hypothesis');
    expect(board.definition).toEqual(definition);
  });
  it('preserves different orders of shared activities and every authored visual fact', () => {
    const definition = authoredJourney();
    expect(adventureBoardDefinitionSchema.parse(definition)).toEqual(definition);
    expect(validateBoardDefinition(definition, inventory)).toEqual([]);
    expect(journeyExecutions(definition).map(path => path.activityNodeIds)).toEqual([['learn','play','check'],['play','learn','check']]);
  });
  it('stops at the unresolved choice and follows selected chronology, independent of inventory order', () => {
    const definition = authoredJourney();
    expect(journeyFrontier(definition, {}, []).choiceId).toBe('order');
    expect(journeyFrontier(definition, {order:'play'}, []).activityNodeId).toBe('play');
    expect(journeyFrontier(definition, {order:'play'}, ['play']).activityNodeId).toBe('learn');
    expect(journeyFrontier(definition, {order:'learn'}, ['play']).activityNodeId).toBe('learn');
    expect(journeyFrontier(definition, {order:'play'}, ['play','learn','check']).complete).toBe(true);
  });
  it('rejects a missing binding, reports a missing edge, and keeps the authored choice', () => {
    const definition = authoredJourney(); definition.edges.pop();
    const issues = validateBoardDefinition(definition, ['learn','check']);
    expect(issues.some(issue => issue.code === 'activity_binding_missing')).toBe(true);
    expect(issues.some(issue => issue.code === 'path_edge_missing')).toBe(false);
    expect(definition.choices).toHaveLength(1);
  });
  it('rejects path recursion and unknown selected options with finite traversal', () => {
    const definition = authoredJourney(); definition.choices[0].options[0].pathId = 'main';
    expect(validateBoardDefinition(definition, inventory).some(issue => issue.code === 'path_cycle')).toBe(true);
    expect(() => journeyFrontier(authoredJourney(), {order:'invented'}, [])).toThrow('choice_option_missing');
  });
  it('launches the first unfinished activity in the selected authored order, never portal inventory order', () => {
    const definition = authoredJourney();
    definition.portals.reverse();
    const project = (completedNodeIds: string[] = []) => renderBoardDefinition(definition, {
      boardId:'board', planId:'plan', childId:'synthetic', domain:'spelling',
      activities:inventory.map(id => ({id,state:'ready',verified:true})), completedNodeIds,
    });
    expect(project().choiceSets![0].options.map(option => option.launchNodeId)).toEqual(['learn','play']);
    expect(project(['play']).choiceSets![0].options[1].launchNodeId).toBe('learn');
  });
  it('never infers verified readiness from absent or arbitrary runtime state', () => {
    const project = (state?: string, verified?: boolean) => renderBoardDefinition(authoredJourney(), {
      boardId:'board', planId:'plan', childId:'synthetic', domain:'spelling', selections:{order:'learn'},
      activities:[{id:'learn', state, verified}],
    }).nodes.find(node => node.id === 'learn-a')!.state;
    expect(project()).toBe('locked');
    expect(project('unknown')).toBe('locked');
    expect(project('ready', false)).toBe('locked');
    expect(project('ready', true)).toBe('available');
  });
  it('reports, never rejects, a disconnected authored edge', () => {
    const definition = authoredJourney();
    definition.edges.push({id:'false-shortcut',from:'start',to:'end'});
    expect(validateBoardDefinition(definition,inventory)).toEqual([]);
  });
  it('rejects model-authored completion and readiness in the immutable contract', () => {
    const definition = authoredJourney();
    expect(() => adventureBoardDefinitionSchema.parse({...definition, completed: true})).toThrow();
    expect(() => adventureBoardDefinitionSchema.parse({...definition, portals: definition.portals.map(portal => ({...portal, state:'completed'}))})).toThrow();
  });
});

it('keeps a dormant nested fork unavailable after switching its parent path',()=>{
 const definition=authoredJourney();
 definition.portals.push({...definition.portals[1],id:'nested'});
 definition.paths.find(path=>path.id==='learn-first')!.portalIds=['nested','play-a'];
 definition.paths.push({id:'nested-a',portalIds:['learn-a']},{id:'nested-b',portalIds:['learn-b']});
 definition.choices.push({id:'nested',portalId:'nested',purpose:'Nested options',options:[{id:'a',label:'A',pathId:'nested-a',hypothesis:'A'},{id:'b',label:'B',pathId:'nested-b',hypothesis:'B'}]});
 const board=renderBoardDefinition(definition,{boardId:'b',planId:'p',childId:'test',domain:'spelling',activities:inventory.map(id=>({id,state:'ready',verified:true})),selections:{order:'play',nested:'a'}});
 expect(board.nodes.find(node=>node.id==='nested')!.state).toBe('locked');
 expect(board.choiceSets!.find(choice=>choice.id==='nested')!.options.every(option=>option.state==='locked')).toBe(true);
});

it('keeps a nested fork closed until its parent is chosen, even on a board played in any order',()=>{
 const definition=authoredJourney();
 definition.portals.push({...definition.portals[1],id:'nested'});
 definition.paths.find(path=>path.id==='learn-first')!.portalIds=['nested','play-a'];
 definition.paths.push({id:'nested-a',portalIds:['learn-a']},{id:'nested-b',portalIds:['learn-b']});
 definition.choices.push({id:'nested',portalId:'nested',purpose:'Nested options',options:[{id:'a',label:'A',pathId:'nested-a',hypothesis:'A'},{id:'b',label:'B',pathId:'nested-b',hypothesis:'B'}]});
 const board=renderBoardDefinition(definition,{boardId:'b',planId:'p',childId:'test',domain:'spelling',allowReadyActivitySelection:true,activities:inventory.map(id=>({id,state:'ready',verified:true})),selections:{}});
 expect(board.nodes.find(node=>node.id==='choose')!.state).toBe('available');
 expect(board.nodes.find(node=>node.id==='nested')!.state).toBe('locked');
});

it('reports a missing single-path reason and orphan paths, but rejects repeated presentation identities',()=>{
 const definition:any=linearJourneyFixture(['learn']);delete definition.singlePathReason;
 expect(validateBoardDefinition(definition,['learn'])).toEqual([]);
 definition.paths.push({id:'orphan',portalIds:['learn']});
 definition.paths[0].portalIds.splice(1,0,'start');
 const codes=validateBoardDefinition(definition,['learn']).map(issue=>issue.code);
 expect(codes).not.toContain('path_unreachable');expect(codes).toContain('repeated_portal');
});


it('executes an authored final assessment at the endpoint without adding another portal', () => {
  const definition = linearJourneyFixture(['learn', 'check']);
  definition.portals = definition.portals.filter(portal => portal.id !== 'end');
  definition.portals.find(portal => portal.id === 'check')!.kind = 'endpoint';
  definition.paths[0].portalIds = ['start', 'learn', 'check'];
  definition.edges = definition.edges.filter(edge => edge.to !== 'end');
  const frozen = JSON.stringify(definition);
  expect(validateBoardDefinition(definition, ['learn', 'check'])).toEqual([]);
  expect(journeyFrontier(definition, {}, ['learn'])).toMatchObject({ activityNodeId:'check', complete:false });
  const board = renderBoardDefinition(definition, {boardId:'board', planId:'plan', childId:'sandbox', domain:'spelling',
    activities:['learn','check'].map(id => ({id, activityId:'word-radar', state:'ready', verified:true})), completedNodeIds:['learn']});
  expect(board.nodes.find(node => node.id === 'check')).toMatchObject({kind:'activity', state:'available', activityNodeId:'check', action:{type:'launch-activity', payloadId:'check'}});
  expect(journeyFrontier(definition, {}, ['learn','check']).complete).toBe(true);
  expect(JSON.stringify(definition)).toBe(frozen);
});

// 2026-10-21 human catch: a Planner board was rejected for drawing bookkeeping
// (connections, unreachable presentation, a missing explanation) on first boards,
// after successor boards had stopped vetoing. Logs showed board_definition_invalid;
// labs asserted each rejection as correct. A painter's canvas does not reject the painter.
describe('the board never rejects the Planner for drawing or bookkeeping', () => {
  const logged = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.flat().join('\n');
  it('reports connection, reachability, boundary and explanation issues without returning a veto', async () => {
    const { vi } = await import('vitest');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const definition = authoredJourney();
      definition.edges.pop();                                                   // path_edge_missing
      definition.edges.push({id:'false-shortcut',from:'start',to:'end'});       // edge_not_traversable
      definition.edges.push({id:'dangling',from:'start',to:'ghost'});           // edge_endpoint_missing
      definition.paths.push({id:'orphan',portalIds:['check']});                 // path_unreachable
      definition.portals.push({...definition.portals.find(p => p.kind === 'activity')!,id:'off-path'}); // portal_unreachable
      expect(validateBoardDefinition(definition, [...inventory, 'not-on-journey'])).toEqual([]); // + activity_portal_missing
      for (const code of ['path_edge_missing','edge_not_traversable','edge_endpoint_missing','path_unreachable','portal_unreachable','activity_portal_missing'])
        expect(logged(log)).toContain(`[board] [bookkeeping] [${code}]`);
      const single: any = linearJourneyFixture(['learn']); delete single.singlePathReason;
      single.paths[0].portalIds = single.paths[0].portalIds.filter((id: string) => id !== 'end');
      expect(validateBoardDefinition(single, ['learn'])).toEqual([]);
      expect(logged(log)).toContain('[board] [bookkeeping] [single_path_reason_missing]');
      expect(logged(log)).toContain('[board] [bookkeeping] [path_endpoints_invalid]');
    } finally { log.mockRestore(); }
  });
  it('still blocks truth problems that would misbind or repeat a measurement', () => {
    const codes = (definition: any, ids: string[]) => validateBoardDefinition(definition, ids).map(issue => issue.code);
    const duplicate = authoredJourney(); duplicate.portals.push({...duplicate.portals[1]});
    expect(codes(duplicate, inventory)).toContain('duplicate_id');
    expect(codes(authoredJourney(), ['learn','check'])).toContain('activity_binding_missing');
    const cyclic = authoredJourney(); cyclic.choices[0].options[0].pathId = 'main';
    expect(codes(cyclic, inventory)).toContain('path_cycle');
  });
  it('lets requireBoardDefinition accept a board whose only issues are drawing bookkeeping', async () => {
    const { requireBoardDefinition } = await import('../shared/adventureBoardDefinition');
    const definition = authoredJourney(); definition.edges.pop(); definition.edges.push({id:'false-shortcut',from:'start',to:'end'});
    expect(() => requireBoardDefinition(definition, inventory)).not.toThrow();
  });
});

// 2026-10-21 Opus review (PR #22): b960ca6e removed the coordinate bounds from the shared point
// schema, so every authoring tool described positions as bare numbers while the prompt spoke in
// pixels. A pixel answer like {x:640} published with every portal off-screen and no veto to stop it.
describe('board coordinates stay playable without vetoing the author', () => {
  const coordinateBounds = (schema: unknown) => {
    const found: Array<{ minimum?: number; maximum?: number }> = [];
    const walk = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      if (node.properties?.x?.type === 'number' && node.properties?.y?.type === 'number') found.push(node.properties.x, node.properties.y);
      for (const value of Object.values(node)) walk(value);
    };
    walk(schema);
    return found;
  };
  it('tells every authoring tool that positions are fractions from 0 to 1', async () => {
    const module = await import('../shared/adventureBoardDefinition');
    for (const schema of [module.BOARD_DEFINITION_TOOL_SCHEMA, (module as any).COMPOSITION_TOOL_SCHEMA]) {
      const bounds = coordinateBounds(schema);
      expect(bounds.length).toBeGreaterThan(0);
      expect(bounds.every(bound => bound.minimum === 0 && bound.maximum === 1)).toBe(true);
    }
  });
  it('keeps a slightly off-canvas position, but gives an impossible one a playable fallback', async () => {
    const { vi } = await import('vitest');
    const { readSuccessorBoardDefinition } = await import('../shared/adventureBoardDefinition');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const board = authoredJourney();
      const activities = inventory.map(nodeId => ({ nodeId, title: nodeId }));
      board.portals[1].position.landscape = { x: 1.2, y: 0.5 };
      board.portals[2].position.landscape = { x: 640, y: 360 };
      const read = readSuccessorBoardDefinition(board, activities);
      expect(read.portals[1].position.landscape.x).toBe(1.2);
      const fallback = read.portals[2].position.landscape;
      expect(fallback.x).toBeGreaterThanOrEqual(0); expect(fallback.x).toBeLessThanOrEqual(1);
      expect(fallback.y).toBeGreaterThanOrEqual(0); expect(fallback.y).toBeLessThanOrEqual(1);
      const text = log.mock.calls.flat().join('\n');
      expect(text).toContain(`[board] [portal] [off-canvas] portal=${board.portals[1].id}`);
      expect(text).toContain(`[board] [portal] [fallback-position] portal=${board.portals[2].id}`);
    } finally { log.mockRestore(); }
  });
});
