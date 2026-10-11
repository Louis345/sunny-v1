import { z } from 'zod';

const id = z.string().min(1).regex(/^\S(?:[\s\S]*\S)?$/, 'Leading/trailing whitespace is not an authored identity or label.');
const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
const geometry = z.object({ landscape: z.array(point).max(8), portrait: z.array(point).max(8) }).strict();
const palette = z.object({ path:id, completed:id, available:id, locked:id, current:id, preview:id, text:id, panel:id }).strict();
/** The same schema describes the authoring tool and validates its immutable output. */
export const adventureBoardDefinitionSchema = z.object({
  version: z.literal(2), title: id, rationale: id, rootPathId: id,
  portals: z.array(z.object({
    id, label:id, kind:z.enum(['start','activity','choice','endpoint']), activityNodeId:id.optional(),
    icon:id.optional(), thumbnailUrl:id.optional(),
    position:z.object({ landscape:point, portrait:point }).strict(),
  }).strict()).min(1).max(128),
  paths:z.array(z.object({ id, portalIds:z.array(id).min(1).max(128) }).strict()).min(1).max(32),
  choices:z.array(z.object({ id, portalId:id, purpose:id, options:z.array(z.object({ id, label:id, pathId:id, hypothesis:id }).strict()).min(2).max(8) }).strict()).max(12),
  edges:z.array(z.object({ id, from:id, to:id, style:z.enum(['solid','dashed','glow']).optional(), controlPoints:geometry.optional() }).strict()).max(256),
  theme:z.object({ background:z.object({type:z.enum(['image','gradient','solid']),value:id}).strict(), palette }).strict(),
  singlePathReason:id.optional(),
}).strict();
export type AdventureBoardDefinition = z.infer<typeof adventureBoardDefinitionSchema>;
export type JourneyExecution = { id:string; selections:Record<string,string>; portalIds:string[]; activityNodeIds:string[] };
export type BoardDefinitionIssue = { code:string; message:string; id?:string };

/** Enumerate declared executions, never infer a branch from an activity inventory.
 * At most 64 executions / 4096 expansions; repeating a choice is a cycle.
 */
export function journeyExecutions(definition:AdventureBoardDefinition):JourneyExecution[] {
  const paths = new Map(definition.paths.map(path => [path.id,path.portalIds]));
  const portals = new Map(definition.portals.map(portal => [portal.id,portal]));
  const choices = new Map(definition.choices.map(choice => [choice.portalId,choice]));
  const root = paths.get(definition.rootPathId);
  if (!root) throw new Error(`path_missing:${definition.rootPathId}`);
  const pending = [{ portalIds:[...root], selections:{} as Record<string,string>, cursor:0 }];
  const results:JourneyExecution[] = [];
  let steps = 0;
  while (pending.length) {
    if (++steps > 4096 || pending.length + results.length > 64) throw new Error('journey_capacity_exceeded');
    const candidate = pending.pop()!;
    let expanded = false;
    for (let index = candidate.cursor; index < candidate.portalIds.length; index++) {
      const portalId = candidate.portalIds[index];
      if (!portals.has(portalId)) throw new Error(`portal_missing:${portalId}`);
      const choice = choices.get(portalId);
      if (!choice) continue;
      if (choice.id in candidate.selections) throw new Error(`path_cycle:${choice.id}`);
      for (const option of [...choice.options].reverse()) {
        const branch = paths.get(option.pathId);
        if (!branch) throw new Error(`path_missing:${option.pathId}`);
        pending.push({
          portalIds:[...candidate.portalIds.slice(0,index + 1),...branch,...candidate.portalIds.slice(index + 1)],
          selections:{...candidate.selections,[choice.id]:option.id}, cursor:index + 1,
        });
      }
      expanded = true;
      break;
    }
    if (!expanded) results.push({ id:Object.entries(candidate.selections).map(([key,value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&') || definition.rootPathId,
      selections:candidate.selections, portalIds:candidate.portalIds,
      activityNodeIds:candidate.portalIds.flatMap(id => { const nodeId = portals.get(id)?.activityNodeId; return nodeId ? [nodeId] : []; }),
    });
  }
  return results;
}

export function validateBoardDefinition(definition:AdventureBoardDefinition, activityNodeIds:readonly string[]):BoardDefinitionIssue[] {
  const issues:BoardDefinitionIssue[] = [];
  const add = (code:string,id:string,message:string) => issues.push({code,id,message});
  for (const [kind, values] of [['portal',definition.portals],['path',definition.paths],['choice',definition.choices],['edge',definition.edges]] as const) {
    const seen = new Set<string>();
    for (const value of values) { if (seen.has(value.id)) add('duplicate_id',value.id,`Duplicate ${kind} identity.`); seen.add(value.id); }
  }
  if(!definition.choices.length&&!definition.singlePathReason)add('single_path_reason_missing',definition.rootPathId,'Explain why this journey uses one path.');
  const referencedPaths=new Set([definition.rootPathId,...definition.choices.flatMap(choice=>choice.options.map(option=>option.pathId))]);
  for(const path of definition.paths)if(!referencedPaths.has(path.id))add('path_unreachable',path.id,'Path is not the root or a declared alternative.');
  const portals = new Map(definition.portals.map(portal => [portal.id,portal]));
  const inventory = new Set(activityNodeIds);
  const represented = new Set<string>();
  for (const portal of definition.portals) {
    if (portal.kind === 'activity' || (portal.kind === 'endpoint' && portal.activityNodeId)) {
      if (!portal.activityNodeId || !inventory.has(portal.activityNodeId)) add('activity_binding_missing',portal.id,'Bind this portal to an existing activity node.');
      else represented.add(portal.activityNodeId);
    } else if (portal.activityNodeId) add('non_activity_binding',portal.id,'Only activity and endpoint portals can bind an instrument.');
    if (portal.kind === 'choice' && !definition.choices.some(choice => choice.portalId === portal.id)) add('choice_missing',portal.id,'Choice portal has no options.');
  }
  for (const nodeId of inventory) if (!represented.has(nodeId)) add('activity_portal_missing',nodeId,'Declared activity is absent from the journey.');
  const choicePortals = new Set<string>();
  for (const choice of definition.choices) {
    if (portals.get(choice.portalId)?.kind !== 'choice' || choicePortals.has(choice.portalId)) add('choice_portal_invalid',choice.id,'Each choice needs its own declared choice portal.');
    choicePortals.add(choice.portalId);
    if (new Set(choice.options.map(option => option.id)).size !== choice.options.length) add('duplicate_option',choice.id,'Option identities must be unique within a choice.');
  }
  const edges = new Set(definition.edges.map(edge => `${edge.from}\0${edge.to}`));
  for (const edge of definition.edges) if (!portals.has(edge.from) || !portals.has(edge.to)) add('edge_endpoint_missing',edge.id,'Both edge endpoints must exist.');
  try {
    const executions = journeyExecutions(definition);
    const reached = new Set<string>();
    const traversedEdges = new Set<string>();
    for (const execution of executions) {
      execution.portalIds.forEach(id => reached.add(id));
      if(new Set(execution.portalIds).size!==execution.portalIds.length)add('repeated_portal',execution.id,'Each presentation identity can occur once per execution.');
      if(execution.portalIds.slice(1,-1).some(id=>['start','endpoint'].includes(portals.get(id)?.kind??'')))add('interior_terminal',execution.id,'Start and endpoint identify the boundaries of an execution.');
      if (portals.get(execution.portalIds[0])?.kind !== 'start' || portals.get(execution.portalIds.at(-1)!)?.kind !== 'endpoint') add('path_endpoints_invalid',execution.id,'Each execution must lead from a start to an explicit endpoint.');
      if (new Set(execution.activityNodeIds).size !== execution.activityNodeIds.length) add('repeated_instrument',execution.id,'Repeated measurements require distinct canonical activity nodes.');
      for (let i=1;i<execution.portalIds.length;i++) {
        const key = `${execution.portalIds[i-1]}\0${execution.portalIds[i]}`;
        traversedEdges.add(key);
        if (!edges.has(key)) add('path_edge_missing',execution.id,`Missing declared edge ${execution.portalIds[i-1]} -> ${execution.portalIds[i]}.`);
      }
    }
    for (const edge of definition.edges) if (!traversedEdges.has(`${edge.from}\0${edge.to}`)) add('edge_not_traversable',edge.id,'This connection is absent from every executable path.');
    for (const portal of definition.portals) if (!reached.has(portal.id)) add('portal_unreachable',portal.id,'Portal is unreachable from the declared root path.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    add(message.split(':')[0],definition.rootPathId,message);
  }
  return issues;
}

/** Sole interpretation of selected order; completed instruments survive a route switch. */
export function journeyFrontier(definition:AdventureBoardDefinition, selections:Readonly<Record<string,string>>, completed:readonly string[]):{activityNodeId?:string;portalId?:string;choiceId?:string;complete:boolean} {
  const choices = new Map(definition.choices.map(choice => [choice.portalId,choice]));
  for (const [choiceId,optionId] of Object.entries(selections)) if (!definition.choices.some(choice => choice.id === choiceId && choice.options.some(option => option.id === optionId))) throw new Error(`choice_option_missing:${choiceId}:${optionId}`);
  const execution = journeyExecutions(definition).find(candidate => Object.entries(selections).every(([key,value]) => candidate.selections[key] === undefined || candidate.selections[key] === value));
  if (!execution) throw new Error('journey_selection_incompatible');
  const done = new Set(completed);
  const portals = new Map(definition.portals.map(portal => [portal.id,portal]));
  for (const portalId of execution.portalIds) {
    const choice = choices.get(portalId);
    if (choice && !selections[choice.id]) return {portalId,choiceId:choice.id,complete:false};
    const activityNodeId = portals.get(portalId)?.activityNodeId;
    if (activityNodeId && !done.has(activityNodeId)) return {portalId,activityNodeId,complete:false};
  }
  return {complete:true};
}

/** A remembered selection on an unchosen branch remains history, not a visible fork. */
export function journeyChoiceAvailable(definition:AdventureBoardDefinition,selections:Record<string,string>,completed:readonly string[],choiceId:string):boolean {
  const frontier=journeyFrontier(definition,selections,completed);
  if(frontier.complete)return false;
  if(frontier.choiceId===choiceId)return true;
  if(!selections[choiceId])return false;
  const execution=journeyExecutions(definition).find(candidate=>Object.entries(selections).every(([key,value])=>candidate.selections[key]===undefined||candidate.selections[key]===value));
  const choice=definition.choices.find(candidate=>candidate.id===choiceId);
  const index=choice&&execution?.portalIds.indexOf(choice.portalId);
  return typeof index==='number'&&index>=0&&index<execution!.portalIds.indexOf(frontier.portalId!);
}

export type BoardRuntimeActivity = { id:string; activityId?:string; type?:string; state?:string; verified?:boolean; thumbnailUrl?:string; gameHtmlPath?:string; activityConfigPath?:string; targets?:string[]; wordRadarConfig?:import('./adventureBoardJson').AdventureBoardWordRadarConfig };
/** Pure projection: presentation comes from the definition, operational facts from runtime. */
export function renderBoardDefinition(definition:AdventureBoardDefinition, input:{boardId:string;planId:string;childId:string;domain:string;activities:readonly BoardRuntimeActivity[];completedNodeIds?:readonly string[];selections?:Record<string,string>;companion?:import('./adventureBoardJson').AdventureBoardCompanion}):import('./adventureBoardJson').AdventureBoardJson {
  const activities = new Map(input.activities.map(activity => [activity.id,activity]));
  const completed = input.completedNodeIds ?? input.activities.filter(activity => activity.state === 'completed').map(activity => activity.id);
  const frontier = journeyFrontier(definition,input.selections ?? {},completed);
  const done = new Set(completed);
  const availableChoices=new Set(definition.choices.filter(choice=>!input.activities.some(item=>item.state==='active')&&journeyChoiceAvailable(definition,input.selections??{},completed,choice.id)).map(choice=>choice.id));
  const choiceByPortal = new Map(definition.choices.map(choice => [choice.portalId,choice]));
  const nodes:import('./adventureBoardJson').AdventureBoardNode[] = definition.portals.map(portal => {
    const activity = portal.activityNodeId ? activities.get(portal.activityNodeId) : undefined;
    const choice = choiceByPortal.get(portal.id);
    const verified = !portal.activityNodeId || (activity?.verified === true && ['ready','active','completed'].includes(activity.state ?? ''));
    const state = portal.kind === 'start' || (portal.activityNodeId && done.has(portal.activityNodeId)) ? 'completed'
      : (portal.id === frontier.portalId && !choice && verified) || (choice && availableChoices.has(choice.id)) ? 'available'
      : portal.kind === 'endpoint' && frontier.complete ? 'completed' : 'locked';
    return { id:portal.id, activityNodeId:portal.activityNodeId, label:portal.label,
      kind:portal.kind === 'choice' ? 'choice-gate' : portal.kind === 'endpoint' ? (portal.activityNodeId ? 'activity' : 'reward') : portal.kind,
      position:portal.position.landscape, portraitPosition:portal.position.portrait,
      icon:portal.icon, thumbnailUrl:portal.thumbnailUrl ?? activity?.thumbnailUrl,
      activityId:activity?.activityId ?? activity?.type, state,
      ...(activity ? {target:{laneId:activity.id,skill:activity.id,words:activity.targets},wordRadarConfig:activity.wordRadarConfig} : {}),
      ...(choice ? {choiceSetId:choice.id,action:{type:'open-choice-set' as const,payloadId:choice.id}} : portal.activityNodeId ? {action:{type:'launch-activity' as const,payloadId:portal.activityNodeId}} : {}),
      ...(state === 'locked' ? {lock:frontier.complete && portal.activityNodeId ? {reason:'route-not-taken',label:'Not taken'} : {reason:verified ? 'planner-sequence' : 'artifact-not-ready',label:verified ? 'Keep going' : 'Locked'}} : {}),
    };
  });
  const states = new Map(nodes.map(node => [node.id,node.state]));
  return {schemaVersion:1, definition, boardId:input.boardId,planId:input.planId,childId:input.childId,
    domain:(['spelling','math','reading','science'].includes(input.domain) ? input.domain : 'generic') as import('./adventureBoardJson').AdventureBoardDomain,
    title:definition.title,theme:definition.theme,companion:input.companion,nodes,
    edges:definition.edges.map(edge => ({...edge,state:states.get(edge.to) === 'completed' ? 'completed' : states.get(edge.to) === 'available' ? 'available' : 'locked'})),
    choiceSets:definition.choices.map(choice => ({id:choice.id,kind:'baseline-route',title:choice.purpose,options:choice.options.map(option => {
      const next = journeyFrontier(definition,{...input.selections,[choice.id]:option.id},completed);
      const portal = definition.portals.find(portal => portal.id === next.portalId);
      return {id:option.id,label:option.label,description:option.hypothesis,journeyChoiceId:choice.id,journeyOptionId:option.id,
        nodeId:portal?.id,launchNodeId:portal?.activityNodeId,
        state:availableChoices.has(choice.id) ? 'available' : 'locked',
        experimentId:choice.id,choiceSignal:{algorithmFeed:'choicePolicy',traits:[],expectedEvidence:option.hypothesis,preferenceNotMastery:true}};
    })})),
    progress:{currentNodeId:frontier.portalId,completedNodeIds:nodes.filter(node=>node.state==='completed').map(node=>node.id),activeChoiceSetId:frontier.choiceId},
  };
}

/** A new executable board must be explicit. Legacy reading never calls this authoring boundary. */
export function requireBoardDefinition(value: unknown, activityIds: readonly string[]): AdventureBoardDefinition {
  if (!value) throw new Error('board_definition_missing');
  const parsed=adventureBoardDefinitionSchema.safeParse(value);
  if(!parsed.success)throw new Error(`board_definition_invalid:${JSON.stringify(parsed.error.issues)}`);
  const definition=parsed.data;
  const issues = validateBoardDefinition(definition, activityIds);
  if (issues.length) throw new Error(`board_definition_invalid:${JSON.stringify(issues)}`);
  return definition;
}
export const BOARD_DEFINITION_TOOL_SCHEMA = z.toJSONSchema(adventureBoardDefinitionSchema, {io:'input'});
export const BOARD_CANVAS_AUTHORING_CONSTRAINTS = `At 1280x720 its safe composition area is 980x400 pixels; at 768x1024 it is 608x714. Portal controls are 116 pixels wide, with up to 160 pixels of height including wrapped labels. Coordinates scale within this safe area; reserve separation for the full labeled control.`;

export const BOARD_AUTHORING_INSTRUCTION = `Author boardDefinition as the immutable journey. Bind activity portals to canonical inventory IDs. An endpoint may bind the final activity; an unbound endpoint marks completion after the preceding activities. Start and choice portals cannot bind activities. Portal IDs are presentation identities: the same activity may appear on alternative paths with distinct portal IDs, and those alternatives may order shared activities differently. The root path is the shared sequence; each choice inserts the selected option path then resumes its parent's remaining sequence. Declare every connection, all labels, positions and optional edge control points for both landscape and portrait. Use the available canvas thoughtfully with readable spacing and coherent direction. ${BOARD_CANVAS_AUTHORING_CONSTRAINTS} Give a meaningful choice when academically valid alternatives exist; otherwise state singlePathReason. Code must not invent a route or change your composition. Do not declare readiness, completion or mastery. The Experience Creator implements activities and artwork without changing this journey.`;
