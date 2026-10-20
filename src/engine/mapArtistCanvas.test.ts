import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import * as canvas from './adventureBoardCanvas';
vi.mock('./adventureBoardCanvas',async original=>({...await original<typeof import('./adventureBoardCanvas')>(),
 verifyAuthoredBoardCanvas:vi.fn(async()=>{throw new Error('board_canvas_invalid:["must not be consulted"]');}),
 measureBoardPortals:vi.fn(async()=>[{viewport:'1280x720',id:'check',width:123,height:187},{viewport:'768x1024',id:'check',width:123,height:211}]),
 renderBoardPreview:vi.fn(async(input:{directory:string})=>{
  fs.mkdirSync(input.directory,{recursive:true});
  const screenshots=['1280x720','768x1024'].map(viewport=>{const file=path.join(input.directory,`preview-${viewport}.png`);fs.writeFileSync(file,'png');return {viewport,file};});
  return {screenshots,portals:[],overlaps:[],crowded:[],artworkLoaded:true};
 })}));
import * as creator from './directMathExperience';
import * as transport from './plannerTransport';
import {authoredJourney} from '../scripts/fixtures/authoredJourney';
import {journeyFromBoardDefinition} from '../shared/adventureBoardDefinition';

// Human review 2026-10-19: Ila loved the 2026-10-18 map ("Mommy it's an octagon design"). The goal
// is a new design on every board, painted by the AI. Code fills in only what the artist left out,
// so an artist refusal (2026-10-14 L548; 2026-10-19 demo 21b4cc) still gives her a board.
const roots:string[]=[];
afterEach(()=>{vi.clearAllMocks();vi.restoreAllMocks();roots.splice(0).forEach(root=>fs.rmSync(root,{recursive:true,force:true}));});
const journey=journeyFromBoardDefinition(authoredJourney());
const fallback=async()=>((await import('../shared/boardLayout')) as unknown as {layoutJourney:(j:typeof journey)=>{positions:Record<string,{landscape:{x:number;y:number};portrait:{x:number;y:number}}>}}).layoutJourney(journey).positions;
/** A free-form map in the artist's own coordinates: a ring, nothing like a grid. */
const ring=journey.portals.map((portal,i)=>{const a=(2*Math.PI*i)/journey.portals.length;
 return {id:portal.id,landscape:{x:+(0.5+0.42*Math.cos(a)).toFixed(3),y:+(0.5+0.42*Math.sin(a)).toFixed(3)},portrait:{x:+(0.5+0.35*Math.sin(a)).toFixed(3),y:+(0.5+0.42*Math.cos(a)).toFixed(3)}};});
const map={pattern:'octagon ring',theme:'illustrated-dusk',portals:ring,edges:journey.edges.map(edge=>({id:edge.id,curve:'arc',style:'glow'}))};
const refused=(stop_details:unknown={type:'refusal',category:'cyber',explanation:'Declined by a safety classifier.'})=>({id:'refused',stop_reason:'refusal',stop_details,usage:{input_tokens:1,output_tokens:0},content:[]});
const reply=(name:string,input:unknown,index:number)=>({id:`creator-${index}`,stop_reason:'tool_use',usage:{input_tokens:1,output_tokens:1},content:[{type:'tool_use',id:`tool-${index}`,name,input}]});
function design(turns:Array<unknown>,extra:Record<string,unknown>={}) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-map-artist-'));roots.push(root);
 const stream=vi.fn((_request:unknown)=>({finalMessage:async()=>turns[stream.mock.calls.length-1]}));
 const plan:any={planId:'artist',childId:'lab',domain:'spelling',journey,nodePlan:['learn','play','check'].map(id=>({id,type:'word-radar',activityId:'word-radar',targets:['piece']}))};
 const input:any={childId:'lab',program:{domain:'spelling',planId:plan.planId,journey,plan},childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),rawResponseDir:path.join(root,'diagnostics'),client:{messages:{stream}},...extra};
 return {root,stream,run:()=>creator.askLearningExperienceDesigner(input)};
}
const requests=(stream:ReturnType<typeof design>['stream'])=>stream.mock.calls.map(call=>call[0] as any);
const positions=(definition:any)=>Object.fromEntries(definition.portals.map((portal:any)=>[portal.id,portal.position]));

describe('step 2: the canvas never stops the board',()=>{
 it('publishes the Planner journey on the fallback layout when the artist refuses, and never buys it again',async()=>{
  const logs=vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(console,'error').mockImplementation(()=>{});
  const {stream,run}=design([refused()]);
  const result=await run();
  expect(stream).toHaveBeenCalledTimes(1);
  expect(positions(result.plan.boardDefinition)).toEqual(await fallback());
  expect(logs.mock.calls.map(call=>call.join(' ')).join('\n')).toMatch(/\[experience-creator\] \[composition\] \[fallback-layout\] reason=refused/);
  await run();
  expect(stream).toHaveBeenCalledTimes(1);
 });

 it('publishes the map the artist last previewed when it refuses after a look (decision 7)',async()=>{
  vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(console,'error').mockImplementation(()=>{});
  const {stream,run}=design([reply('preview_board',{whatISee:'An octagon ring.',...map},1),refused()]);
  const result=await run();
  expect(stream).toHaveBeenCalledTimes(2);
  expect(positions(result.plan.boardDefinition)).toEqual(Object.fromEntries(ring.map(({id,...position})=>[id,position])));
 });

 it('gives only the portals the artist skipped a fallback spot',async()=>{
  const logs=vi.spyOn(console,'log').mockImplementation(()=>{});
  const skipped=journey.portals[3].id;
  const {run}=design([reply('submit_board',{whatISee:'Placed.',...map,portals:ring.filter(portal=>portal.id!==skipped),rationale:'Ring.'},1)]);
  const result=await run(),placed=positions(result.plan.boardDefinition),plain=await fallback();
  expect(placed[skipped]).toEqual(plain[skipped]);
  for(const portal of ring.filter(row=>row.id!==skipped))expect(placed[portal.id]).toEqual({landscape:portal.landscape,portrait:portal.portrait});
  expect(logs.mock.calls.map(call=>call.join(' ')).join('\n')).toContain(`[fallback-position] portal=${skipped}`);
 });
});

describe('step 2: a free canvas aimed at a new design every time',()=>{
 it('places portals anywhere, with no grid, lanes or prescribed rows',async()=>{
  const {stream,run}=design([reply('submit_board',{whatISee:'A ring.',...map,rationale:'Ring.'},1)]);
  const result=await run();
  expect(positions(result.plan.boardDefinition)).toEqual(Object.fromEntries(ring.map(({id,...position})=>[id,position])));
  const first=requests(stream)[0],brief=String(first.messages[0].content);
  for(const rule of ['7 columns','middle row','top row','bottom row','grid'])expect(brief).not.toContain(rule);
  const portalShape=first.tools.find((tool:{name:string})=>tool.name==='preview_board').input_schema.properties.portals.items;
  expect(Object.keys(portalShape.properties).sort()).toEqual(['id','landscape','portrait']);
 });

 it('names its pattern, and the pattern is kept with the board',async()=>{
  const logs=vi.spyOn(console,'log').mockImplementation(()=>{});
  const {stream,run}=design([reply('submit_board',{whatISee:'A ring.',...map,rationale:'Ring.'},1)]);
  const result=await run();
  expect((result.plan.boardDefinition as any).pattern).toBe('octagon ring');
  for(const tool of requests(stream)[0].tools.filter((tool:{name:string})=>tool.name!=='adjust_board'))expect(tool.input_schema.required).toContain('pattern');
  expect(logs.mock.calls.map(call=>call.join(' ')).join('\n')).toContain('[experience-creator] [pattern] octagon ring');
 });

 it("is told the patterns of her earlier boards and asked for a design she has not seen",async()=>{
  const {stream,run}=design([reply('submit_board',{whatISee:'A spiral this time.',...map,pattern:'spiral',rationale:'New.'},1)],
   {previousDesigns:[{pattern:'octagon ring',theme:'illustrated-dusk'},{pattern:'mountain climb',theme:'illustrated-dawn'}]});
  await run();
  const brief=String(requests(stream)[0].messages[0].content);
  expect(brief).toContain('octagon ring');expect(brief).toContain('mountain climb');
  expect(brief).toMatch(/new design/i);
 });

 it('reads earlier board designs from published board instances, newest first, as presentation history',async()=>{
  const {boardDesignHistory}=await import('./learningBoardInstances') as unknown as {boardDesignHistory:(cycles:unknown[])=>Array<{pattern:string;theme:string|null}>};
  const definition=(pattern:string|undefined,at:string)=>({publishedAt:at,definition:{...authoredJourney(),...(pattern?{pattern}:{})}});
  const cycles=[{boards:[definition('octagon ring','2026-10-18T20:00:00Z'),{publishedAt:null,definition:{...authoredJourney(),pattern:'unpublished'}}]},{boards:[definition('mountain climb','2026-10-12T20:00:00Z'),definition(undefined,'2026-10-01T20:00:00Z')]}];
  expect(boardDesignHistory(cycles).map(row=>row.pattern)).toEqual(['octagon ring','mountain climb']);
 });

 it('draws the curve the artist chooses for each path',async()=>{
  const curved={...map,edges:journey.edges.map((edge,i)=>({id:edge.id,curve:i===0?'straight':'arc',style:'dashed'}))};
  const {run}=design([reply('submit_board',{whatISee:'Arcs.',...curved,rationale:'Arcs.'},1)]);
  const edges=(await run()).plan.boardDefinition!.edges;
  expect(edges[0].controlPoints).toBeUndefined();
  for(const edge of edges.slice(1)){
   expect(edge.style).toBe('dashed');
   expect(edge.controlPoints!.landscape.length).toBeGreaterThan(0);expect(edge.controlPoints!.portrait.length).toBeGreaterThan(0);
  }
 });

 it('chooses a theme preset, which becomes the board theme',async()=>{
  const {THEME_PRESETS}=await import('../shared/boardLayout') as unknown as {THEME_PRESETS:Array<{id:string;background:unknown;palette:unknown}>};
  const {stream,run}=design([reply('submit_board',{whatISee:'Dusk.',...map,rationale:'Dusk.'},1)]);
  const theme=(await run()).plan.boardDefinition!.theme;
  const preset=THEME_PRESETS.find(row=>row.id==='illustrated-dusk')!;
  expect(theme).toEqual({background:preset.background,palette:preset.palette});
  const offered=requests(stream)[0].tools.find((tool:{name:string})=>tool.name==='submit_board').input_schema.properties.theme;
  expect(offered.enum).toEqual(THEME_PRESETS.map(row=>row.id));
 });

 it('sends strict tools whose portal and edge names come from the journey',async()=>{
  const {stream,run}=design([reply('submit_board',{whatISee:'Ring.',...map,rationale:'Ring.'},1)]);
  await run();
  const tools=requests(stream)[0].tools;
  for(const tool of tools){
   expect(tool.strict).toBe(true);
   if(tool.input_schema.properties.portals)expect(tool.input_schema.properties.portals.items.properties.id.enum.sort()).toEqual(journey.portals.map(portal=>portal.id).sort());
   if(tool.input_schema.properties.edges)expect(tool.input_schema.properties.edges.items.properties.id.enum.sort()).toEqual(journey.edges.map(edge=>edge.id).sort());
  }
  const budget=transport.strictBudget(tools);
  expect(budget.unsupported).toEqual([]);expect(budget.optional).toBeLessThanOrEqual(24);expect(budget.unions).toBeLessThanOrEqual(16);
 });
});
