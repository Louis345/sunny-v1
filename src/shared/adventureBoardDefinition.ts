import { z } from 'zod';

const id = z.string().min(1).regex(/^\S(?:[\s\S]*\S)?$/, 'Leading/trailing whitespace is not an authored identity or label.');
const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
const geometry = z.object({ landscape: z.array(point).max(8), portrait: z.array(point).max(8) }).strict();
const palette = z.object({ path:id, completed:id, available:id, locked:id, current:id, preview:id, text:id, panel:id }).strict();
/** The same schema describes the authoring tool and validates its immutable output. */
export const adventureBoardDefinitionSchema = z.object({
  version: z.literal(2), title: id, rationale: id, rootPathId: id.describe("Shared opening and closing sequence. Options name separate insertion paths, never this root path."),
  portals: z.array(z.object({
    id, label:id, kind:z.enum(['start','activity','choice','endpoint']), activityNodeId:id.optional(),
    icon:id.optional(), thumbnailUrl:id.optional(),
    position:z.object({ landscape:point, portrait:point }).strict(),
  }).strict()).min(1).max(128),
  paths:z.array(z.object({ id, portalIds:z.array(id).min(1).max(128).describe("Ordered portals. An option path contains only its branch segment after the choice: omit already-visited start/choice portals and shared closing portals resumed from the root.") }).strict()).min(1).max(32),
  choices:z.array(z.object({ id, portalId:id, purpose:id, options:z.array(z.object({ id, label:id, pathId:id, hypothesis:id }).strict()).min(2).max(8) }).strict()).max(12),
  edges:z.array(z.object({ id, from:id, to:id, style:z.enum(['solid','dashed','glow']).optional(), controlPoints:geometry.optional() }).strict()).max(256),
  theme:z.object({ background:z.object({type:z.enum(['image','gradient','solid']),value:id}).strict(), palette }).strict(),
  singlePathReason:id.optional(),
}).strict();
export type AdventureBoardDefinition = z.infer<typeof adventureBoardDefinitionSchema>;
/** Planner authors semantics; the existing Creator supplies presentation only. */
const adventureJourneyInputSchema = adventureBoardDefinitionSchema.omit({theme:true,portals:true,edges:true}).extend({
  portals:z.array(adventureBoardDefinitionSchema.shape.portals.element.omit({position:true,icon:true,thumbnailUrl:true}).strict()).min(1).max(128),
  edges:z.array(adventureBoardDefinitionSchema.shape.edges.element.omit({style:true,controlPoints:true}).strict()).max(256).optional(),
}).strict();
/** New authoring has one chronology. Existing saved edge identities remain read-only. */
export const ADVENTURE_JOURNEY_TOOL_SCHEMA=z.toJSONSchema(adventureJourneyInputSchema.omit({edges:true}),{io:'input'});
export const adventureJourneySchema=adventureJourneyInputSchema.transform((journey,ctx)=>{
  if(journey.edges)return {...journey,edges:journey.edges};
  const semantic={...journey,edges:[] as Array<{id:string;from:string;to:string}>};
  try{
    const connections=new Map<string,{id:string;from:string;to:string}>();
    for(const execution of journeyExecutions(semantic))for(let i=1;i<execution.portalIds.length;i++){
      const from=execution.portalIds[i-1],to=execution.portalIds[i],key=`${from}\0${to}`;
      connections.set(key,{id:`connection:${encodeURIComponent(from)}:${encodeURIComponent(to)}`,from,to});
    }
    if(connections.size>256)throw new Error('journey_capacity_exceeded');
    return {...journey,edges:[...connections.values()]};
  }catch(error){ctx.addIssue({code:'custom',path:['paths'],message:error instanceof Error?error.message:String(error)});return z.NEVER;}
});
/** The Planner's only journey: one sequence it cannot contradict. Code expands it. */
export const journeySequenceSchema=z.object({
  title:id, opening:z.array(id).max(32).describe("Activity ids every child plays first, in order."),
  choice:z.object({purpose:id.describe("The question she reads on the choice screen, written to her in a few friendly words, for example: Which way do you want to practice? It is never about her and never explains your reasoning; put that in each option's hypothesis."),label:id.describe("Short name of the choice portal on the map."),options:z.array(z.object({id,label:id,hypothesis:id,nodeIds:z.array(id).min(1).max(32)}).strict()).min(2).max(8)}).strict().optional(),
  closing:z.array(id).max(32).describe("Activity ids every child plays after the choice, in order."),
  singlePathReason:id.optional(), endpointLabel:id,
}).strict();
export type JourneySequence=z.infer<typeof journeySequenceSchema>;
export const JOURNEY_SEQUENCE_TOOL_SCHEMA=z.toJSONSchema(journeySequenceSchema,{io:'input'});
/** Mechanical and deterministic: start, activity, choice and endpoint portals, paths and connections.
 * Nothing here rejects the plan; an activity that cannot be placed is logged and left off. */
/** The form above is what the Planner is asked for; reading its answer is forgiving, because a
 * plan is never thrown away over an empty option or a missing list. */
const journeySequenceReadSchema=journeySequenceSchema.extend({opening:z.array(id).max(32).default([]),closing:z.array(id).max(32).default([]),
  choice:z.object({purpose:id,label:id,options:z.array(z.object({id,label:id,hypothesis:id,nodeIds:z.array(id).max(32).default([])})).max(8).default([])}).optional()});
export function expandJourneySequence(input:unknown,nodes:ReadonlyArray<{id:string;title?:string}>):AdventureJourneyDefinition {
  const sequence=journeySequenceReadSchema.parse(input),titles=new Map(nodes.map(node=>[node.id,node.title?.trim()||node.id]));
  const placed=new Set<string>(),portals:Array<{id:string;label:string;kind:'start'|'activity'|'choice'|'endpoint';activityNodeId?:string}>=[{id:'start',label:'Start',kind:'start'}];
  const place=(nodeIds:readonly string[],prefix:string,seen:Set<string>)=>nodeIds.flatMap(nodeId=>{
    if(!titles.has(nodeId)||seen.has(nodeId)){console.log(` 🎮 [planner] [journey] [${titles.has(nodeId)?'node-repeated':'node-missing'}] node=${nodeId}`);return [];}
    seen.add(nodeId);placed.add(nodeId);
    const portalId=`${prefix}${nodeId}`;portals.push({id:portalId,label:titles.get(nodeId)!,kind:'activity',activityNodeId:nodeId});return [portalId];
  });
  const shared=new Set<string>(),opening=place(sequence.opening,'p:',shared);
  const optionIds=new Set<string>(),branchNodeIds=new Set<string>();
  let options=(sequence.choice?.options??[]).filter(option=>!optionIds.has(option.id)&&optionIds.add(option.id)).map(option=>{
    const seen=new Set(shared),portalIds=place(option.nodeIds,`p:${option.id}:`,seen);
    return {option,portalIds,nodeIds:[...seen].filter(nodeId=>!shared.has(nodeId))};
  }).filter(row=>row.portalIds.length);
  // One surviving option is not a choice: its activities join the shared path.
  const inline=options.length===1?options[0].portalIds:[];if(options.length<2)options=[];
  options.forEach(row=>row.nodeIds.forEach(nodeId=>branchNodeIds.add(nodeId)));
  if(inline.length)portals.filter(portal=>inline.includes(portal.id)).forEach(portal=>shared.add(portal.activityNodeId!));
  if(options.length)portals.push({id:'choice',label:sequence.choice!.label,kind:'choice'});
  const closing=place(sequence.closing,'p:',new Set([...shared,...branchNodeIds]));
  portals.push({id:'end',label:sequence.endpointLabel,kind:'endpoint'});
  for(const nodeId of titles.keys())if(!placed.has(nodeId))console.log(` 🎮 [planner] [journey] [node-unused] node=${nodeId}`);
  return adventureJourneySchema.parse({version:2,title:sequence.title,rationale:sequence.singlePathReason??sequence.choice?.purpose??sequence.title,rootPathId:'root',portals,
    paths:[{id:'root',portalIds:['start',...opening,...inline,...(options.length?['choice']:[]),...closing,'end']},...options.map(row=>({id:`option:${row.option.id}`,portalIds:row.portalIds}))],
    choices:options.length?[{id:'choice',portalId:'choice',purpose:sequence.choice!.purpose,options:options.map(({option})=>({id:option.id,label:option.label,pathId:`option:${option.id}`,hypothesis:option.hypothesis}))}]:[],
    ...(options.length?{}:{singlePathReason:sequence.singlePathReason??'The Planner authored one path.'}),
  });
}
export const adventureCompositionSchema = z.object({
  portals:z.array(adventureBoardDefinitionSchema.shape.portals.element.pick({id:true,position:true,icon:true,thumbnailUrl:true}).strict()).min(1).max(128),
  edges:z.array(adventureBoardDefinitionSchema.shape.edges.element.pick({id:true,style:true,controlPoints:true}).strict()).max(256),
  theme:adventureBoardDefinitionSchema.shape.theme,
}).strict();
export type AdventureJourneyDefinition=z.infer<typeof adventureJourneySchema>;
export type AdventureBoardComposition=z.infer<typeof adventureCompositionSchema>;
/** Geometry repair applies to the received candidate, never a replacement world. */
export function adventureCompositionCorrectionTool(composition:AdventureBoardComposition,journey:Pick<AdventureJourneyDefinition,'edges'>,error:Error) {
  let defects:string[];try{defects=JSON.parse(error.message.slice('board_canvas_invalid:'.length));}catch{throw new Error('composition_correction_scope_unavailable');}
  if(!error.message.startsWith('board_canvas_invalid:')||!Array.isArray(defects))throw new Error('composition_correction_scope_unavailable');
  const fields:string[]=[];
  for(const orientation of ['landscape','portrait'] as const){
    const failures=defects.filter(defect=>typeof defect==='string'&&(orientation==='portrait'?defect.startsWith('768x1024:'):defect.startsWith('1280x720:')||defect.startsWith('1470x956:')));
    const ids=new Set<string>(),known=[...composition.portals].sort((a,b)=>b.id.length-a.id.length);
    for(const failure of failures){
      const detail=failure.slice(failure.indexOf(':')+1),first=known.find(portal=>detail.startsWith(`${portal.id}:`));
      if(!first)continue;const kind=detail.slice(first.id.length+1);
      if(kind.startsWith('overlaps:')){const target=kind.slice('overlaps:'.length),other=known.find(portal=>target===portal.id||target.startsWith(`${portal.id}:`));ids.add(first.id);if(other)ids.add(other.id);}
      else if(kind==='clipped_or_control_rail_overlap')ids.add(first.id);
    }
    composition.portals.forEach((portal,index)=>{if(ids.has(portal.id))fields.push(`/portals/${index}/position/${orientation}`);});
    composition.edges.forEach((edge,index)=>{const semantic=journey.edges.find(row=>row.id===edge.id);if(edge.controlPoints&&semantic&&(ids.has(semantic.from)||ids.has(semantic.to)))fields.push(`/edges/${index}/controlPoints/${orientation}`);});
  }
  if(!fields.length)throw new Error('composition_correction_scope_unavailable');
  return {name:'repair_board_geometry',description:'Patch only diagnosed geometry on the supplied candidate. Preserve all other fields.',input_schema:{type:'object',additionalProperties:false,properties:{patches:{type:'array',minItems:1,maxItems:fields.length,items:{type:'object',additionalProperties:false,properties:{path:{type:'string',enum:fields},value:{anyOf:[z.toJSONSchema(point),z.toJSONSchema(z.array(point).max(8))]}},required:['path','value']}}},required:['patches']}};
}
export function applyAdventureCompositionCorrection(composition:AdventureBoardComposition,journey:Pick<AdventureJourneyDefinition,'edges'>,reply:unknown,error:Error):AdventureBoardComposition {
  const tool=adventureCompositionCorrectionTool(composition,journey,error),allowed=new Set(tool.input_schema.properties.patches.items.properties.path.enum);
  const raw=reply as {patches?:Array<{path:string;value:unknown}>};
  if(!raw||typeof raw!=='object'||Object.keys(raw).some(key=>key!=='patches')||!Array.isArray(raw.patches)||!raw.patches.length||raw.patches.length>allowed.size)throw new Error('composition_correction_changed_protected_fields');
  const result=structuredClone(composition),seen=new Set<string>();
  for(const patch of raw.patches){
    if(!patch||typeof patch!=='object'||Object.keys(patch).some(key=>!['path','value'].includes(key))||!allowed.has(patch.path)||seen.has(patch.path))throw new Error('composition_correction_changed_protected_fields');
    seen.add(patch.path);const parts=patch.path.slice(1).split('/');
    const value=parts[0]==='portals'?point.parse(patch.value):z.array(point).max(8).parse(patch.value);
    let parent:unknown=result;for(const part of parts.slice(0,-1))parent=(parent as Record<string,unknown>)[part];
    (parent as Record<string,unknown>)[parts.at(-1)!]=value;
  }
  return adventureCompositionSchema.parse(result);
}
export function journeyFromBoardDefinition(board:AdventureBoardDefinition):AdventureJourneyDefinition {
  const {theme:_theme,portals,edges,...journey}=board;
  return adventureJourneySchema.parse({...journey,portals:portals.map(({position:_position,icon:_icon,thumbnailUrl:_thumbnail,...portal})=>portal),edges:edges.map(({style:_style,controlPoints:_points,...edge})=>edge)});
}
export function compositionFromBoardDefinition(board:AdventureBoardDefinition):AdventureBoardComposition {
  return adventureCompositionSchema.parse({theme:board.theme,portals:board.portals.map(({id,position,icon,thumbnailUrl})=>({id,position,...(icon?{icon}:{}),...(thumbnailUrl?{thumbnailUrl}:{})})),edges:board.edges.map(({id,style,controlPoints})=>({id,...(style?{style}:{}),...(controlPoints?{controlPoints}:{})}))});
}
export function assembleAdventureBoardDefinition(journey:AdventureJourneyDefinition,composition:AdventureBoardComposition):AdventureBoardDefinition {
  const semantic=adventureJourneySchema.parse(journey),visual=adventureCompositionSchema.parse(composition);
  const match=(a:readonly {id:string}[],b:readonly {id:string}[])=>a.length===b.length&&new Set(a.map(v=>v.id)).size===a.length&&new Set(b.map(v=>v.id)).size===b.length&&a.every(v=>b.some(other=>other.id===v.id));
  if(!match(semantic.portals,visual.portals)||!match(semantic.edges,visual.edges))throw new Error('board_composition_identity_invalid');
  return adventureBoardDefinitionSchema.parse({...semantic,theme:visual.theme,portals:semantic.portals.map(portal=>({...portal,...visual.portals.find(v=>v.id===portal.id)!})),edges:semantic.edges.map(edge=>({...edge,...visual.edges.find(v=>v.id===edge.id)!}))});
}

export type JourneyExecution = { id:string; selections:Record<string,string>; portalIds:string[]; activityNodeIds:string[] };
export type BoardDefinitionIssue = { code:string; message:string; id?:string };

/** Enumerate declared executions, never infer a branch from an activity inventory.
 * At most 64 executions / 4096 expansions; repeating a choice is a cycle.
 */
export function journeyExecutions(definition:AdventureJourneyDefinition):JourneyExecution[] {
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
      activityNodeIds:candidate.portalIds.flatMap((id,index) => { const portal=portals.get(id),nodeId=portal?.activityNodeId; return nodeId && !(portal?.kind==='endpoint'&&index>0&&portals.get(candidate.portalIds[index-1])?.activityNodeId===nodeId) ? [nodeId] : []; }),
    });
  }
  return results;
}

export function validateBoardDefinition(definition:AdventureJourneyDefinition, activityNodeIds:readonly string[]):BoardDefinitionIssue[] {
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
export function journeyFrontier(definition:AdventureJourneyDefinition, selections:Readonly<Record<string,string>>, completed:readonly string[], notReady:readonly string[]=[]):{activityNodeId?:string;portalId?:string;choiceId?:string;complete:boolean} {
  const choices = new Map(definition.choices.map(choice => [choice.portalId,choice]));
  for (const [choiceId,optionId] of Object.entries(selections)) if (!definition.choices.some(choice => choice.id === choiceId && choice.options.some(option => option.id === optionId))) throw new Error(`choice_option_missing:${choiceId}:${optionId}`);
  const execution = journeyExecutions(definition).find(candidate => Object.entries(selections).every(([key,value]) => candidate.selections[key] === undefined || candidate.selections[key] === value));
  if (!execution) throw new Error('journey_selection_incompatible');
  // A not-ready activity is never played, so the path passes over it.
  const done = new Set([...completed,...notReady]);
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
export function journeyChoiceAvailable(definition:AdventureJourneyDefinition,selections:Record<string,string>,completed:readonly string[],choiceId:string,notReady:readonly string[]=[]):boolean {
  const frontier=journeyFrontier(definition,selections,completed,notReady);
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
export function renderBoardDefinition(definition:AdventureBoardDefinition, input:{boardId:string;planId:string;childId:string;domain:string;activities:readonly BoardRuntimeActivity[];completedNodeIds?:readonly string[];selections?:Record<string,string>;companion?:import('./adventureBoardJson').AdventureBoardCompanion;notReady?:Readonly<Record<string,string>>}):import('./adventureBoardJson').AdventureBoardJson {
  const activities = new Map(input.activities.map(activity => [activity.id,activity]));
  const completed = input.completedNodeIds ?? input.activities.filter(activity => activity.state === 'completed').map(activity => activity.id);
  const notReady = Object.keys(input.notReady ?? {}).filter(id => !completed.includes(id));
  const frontier = journeyFrontier(definition,input.selections ?? {},completed,notReady);
  const done = new Set(completed);
  const availableChoices=new Set(definition.choices.filter(choice=>!input.activities.some(item=>item.state==='active')&&journeyChoiceAvailable(definition,input.selections??{},completed,choice.id,notReady)).map(choice=>choice.id));
  const choiceByPortal = new Map(definition.choices.map(choice => [choice.portalId,choice]));
  const nodes:import('./adventureBoardJson').AdventureBoardNode[] = definition.portals.map(portal => {
    const activity = portal.activityNodeId ? activities.get(portal.activityNodeId) : undefined;
    const choice = choiceByPortal.get(portal.id);
    const verified = !portal.activityNodeId || (activity?.verified === true && ['ready','active','completed'].includes(activity.state ?? ''));
    const blocked = Boolean(portal.activityNodeId && notReady.includes(portal.activityNodeId));
    const state = blocked ? 'locked' : portal.kind === 'start' || (portal.activityNodeId && done.has(portal.activityNodeId)) ? 'completed'
      : (portal.id === frontier.portalId && !choice && verified) || (choice && availableChoices.has(choice.id)) ? 'available'
      : portal.kind === 'endpoint' && frontier.complete ? 'completed' : 'locked';
    return { id:portal.id, activityNodeId:portal.activityNodeId, label:portal.label,
      kind:portal.kind === 'choice' ? 'choice-gate' : portal.kind === 'endpoint' ? (portal.activityNodeId ? 'activity' : 'reward') : portal.kind,
      position:portal.position.landscape, portraitPosition:portal.position.portrait,
      icon:portal.icon, thumbnailUrl:portal.thumbnailUrl ?? activity?.thumbnailUrl,
      activityId:activity?.activityId ?? activity?.type, state,
      ...(activity ? {target:{laneId:activity.id,skill:activity.id,words:activity.targets},wordRadarConfig:activity.wordRadarConfig} : {}),
      ...(choice ? {choiceSetId:choice.id,action:{type:'open-choice-set' as const,payloadId:choice.id}} : portal.activityNodeId ? {action:{type:'launch-activity' as const,payloadId:portal.activityNodeId}} : {}),
      ...(state === 'locked' ? {lock:blocked ? {reason:'not-ready',label:'Not ready'} : frontier.complete && portal.activityNodeId ? {reason:'route-not-taken',label:'Not taken'} : {reason:verified ? 'planner-sequence' : 'artifact-not-ready',label:verified ? 'Keep going' : 'Locked'}} : {}),
    };
  });
  const states = new Map(nodes.map(node => [node.id,node.state]));
  return {schemaVersion:1, definition, boardId:input.boardId,planId:input.planId,childId:input.childId,
    domain:(['spelling','math','reading','science'].includes(input.domain) ? input.domain : 'generic') as import('./adventureBoardJson').AdventureBoardDomain,
    title:definition.title,theme:definition.theme,companion:input.companion,nodes,
    edges:definition.edges.map(edge => ({...edge,state:states.get(edge.to) === 'completed' ? 'completed' : states.get(edge.to) === 'available' ? 'available' : 'locked'})),
    choiceSets:definition.choices.map(choice => ({id:choice.id,kind:'baseline-route',title:choice.purpose,options:choice.options.map(option => {
      const next = journeyFrontier(definition,{...input.selections,[choice.id]:option.id},completed,notReady);
      const portal = definition.portals.find(portal => portal.id === next.portalId);
      return {id:option.id,label:option.label,journeyChoiceId:choice.id,journeyOptionId:option.id,
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
export const BOARD_CANVAS_AUTHORING_CONSTRAINTS = `At 1280x720 its safe composition area is 980x400 pixels; at 768x1024 it is 608x714. Portal controls are 116 pixels wide. Their height depends on wrapped labels and status text; it can exceed 186 pixels. Coordinates scale within this safe area; reserve separation for the full labeled control.`;

export const BOARD_AUTHORING_INSTRUCTION = `Author boardDefinition as the immutable journey. Bind activity portals to canonical inventory IDs. An endpoint may bind the final activity; an unbound endpoint marks completion after the preceding activities. Start and choice portals cannot bind activities. Portal IDs are presentation identities: the same activity may appear on alternative paths with distinct portal IDs, and those alternatives may order shared activities differently. The root path is the shared sequence; each choice inserts the selected option path then resumes its parent's remaining sequence. Declare every connection, all labels, positions and optional edge control points for both landscape and portrait. Use the available canvas thoughtfully with readable spacing and coherent direction. Sunny's visual brief: an inviting illustrated adventure world, vivid portals, animated dashed or glow paths, a readable left-to-right journey and separately composed portrait. Available Grok artwork: /generated/adventure-board-demo/silent-letter-world.jpeg; use this image or other available illustrated artwork, not a plain gradient. Choose readable text. After independent evaluation, on Teaching boards only, use the available catalog for varied practice addressing her gaps; activity count remains your decision. For that Teaching journey, consider learn first versus play first through shared activities, converging on the check. Background values must be executable image URLs or CSS, not symbolic names. ${BOARD_CANVAS_AUTHORING_CONSTRAINTS} Give a meaningful choice when academically valid alternatives exist; otherwise state singlePathReason. Code must not invent a route or change your composition. Do not declare readiness, completion or mastery. The Experience Creator implements activities and artwork without changing this journey.`;

/** Education belongs to the Planner; visual constraints are supplied to the Creator. */
export const JOURNEY_AUTHORING_INSTRUCTION = `Author journey as immutable educational intent. Bind activity portals to canonical inventory IDs. Start and choice portals have no activity binding; an endpoint may bind the final activity. Portal IDs identify presentations; alternative sequences may reuse canonical activities with distinct portals. The root path is the shared opening; a choice inserts its selected path then resumes the parent path. Declare labels, ordered paths, option purposes and engagement hypotheses. Give a meaningful choice when academically valid alternatives exist; otherwise explain singlePathReason. After independent evaluation, on Teaching boards only, use the catalog for varied practice addressing measured gaps; activity count remains your decision. Connections are derived from those paths; do not author a second edge list. The existing Experience Creator owns visual composition, artwork, palette and geometry. Do not declare readiness, completion or mastery.`;

/** The Planner is the teacher: one sequence, no portals, paths or edges. */
export const JOURNEY_SEQUENCE_INSTRUCTION = `Author journey as one sequence of activity ids from your activities list. opening is what every child plays first, in order. choice is optional: give its purpose, a short label, and two or more options, each with its own label, engagement hypothesis and ordered nodeIds; options may order the same activities differently. closing is what every child plays after the choice, in order. Without a choice, put the whole order in opening and closing and explain singlePathReason. endpointLabel is what she sees when she finishes. Give a meaningful choice when academically valid alternatives exist. Code draws the start, portals, paths and connections from this sequence exactly as written and works out which earlier activities each checkpoint follows; do not author portals, paths, edges or exposure lineage. An activity you do not place in the journey is left off the map. Use the catalog for varied practice addressing measured gaps; activity count remains your decision. A fact about the canvas: the kiosk map is a grid 7 columns wide, so each path from start to finish, counting the start, the choice and the finish, fits in 7 steps; a longer path wraps and crowds the map. The map artist owns artwork, palette and placement. Do not declare readiness, completion or mastery.`;
