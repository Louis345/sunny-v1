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
  it('rejects missing bindings and edges without deleting the authored choice', () => {
    const definition = authoredJourney(); definition.edges.pop();
    const issues = validateBoardDefinition(definition, ['learn','check']);
    expect(issues.some(issue => issue.code === 'activity_binding_missing')).toBe(true);
    expect(issues.some(issue => issue.code === 'path_edge_missing')).toBe(true);
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
  it('rejects disconnected authored edges and requests a reason for a single path', () => {
    const definition = authoredJourney();
    definition.edges.push({id:'false-shortcut',from:'start',to:'end'});
    expect(validateBoardDefinition(definition,inventory).some(issue => issue.code === 'edge_not_traversable')).toBe(true);
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

it('requires explicit single-path intent and rejects orphan paths and repeated presentation identities',()=>{
 const definition:any=linearJourneyFixture(['learn']);delete definition.singlePathReason;
 expect(validateBoardDefinition(definition,['learn']).some(issue=>issue.code==='single_path_reason_missing')).toBe(true);
 definition.singlePathReason='One short measurement';definition.paths.push({id:'orphan',portalIds:['learn']});
 definition.paths[0].portalIds.splice(1,0,'start');
 const codes=validateBoardDefinition(definition,['learn']).map(issue=>issue.code);
 expect(codes).toContain('path_unreachable');expect(codes).toContain('repeated_portal');
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
