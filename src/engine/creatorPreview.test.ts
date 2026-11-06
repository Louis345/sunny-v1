import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import * as canvas from './adventureBoardCanvas';
// The Creator placed portals without seeing their size, and code rejected the overlap.
// It now sees the real render and code accepts what it submits.
vi.mock('./adventureBoardCanvas',async original=>({...await original<typeof import('./adventureBoardCanvas')>(),
 verifyAuthoredBoardCanvas:vi.fn(async()=>{throw new Error('board_canvas_invalid:["must not be consulted"]');}),
 measureBoardPortals:vi.fn(async()=>[{viewport:'1280x720',id:'check',width:123,height:187},{viewport:'768x1024',id:'check',width:123,height:211}]),
 renderBoardPreview:vi.fn(async(input:{directory:string})=>{
  fs.mkdirSync(input.directory,{recursive:true});
  const screenshots=['1280x720','768x1024'].map(viewport=>{const file=path.join(input.directory,`preview-${viewport}.png`);fs.writeFileSync(file,'png');return {viewport,file};});
  return {screenshots,portals:[{viewport:'1280x720',id:'check',x:10,y:20,width:123,height:187}],overlaps:[{viewport:'768x1024',portals:['learn-a','play-a']}],crowded:[{viewport:'1280x720',portals:['check','end'],gap:6}],artworkLoaded:true};
 })}));
import * as creator from './directMathExperience';
import {authoredJourney} from '../scripts/fixtures/authoredJourney';
import {journeyFromBoardDefinition} from '../shared/adventureBoardDefinition';
import {THEME_PRESETS} from '../shared/boardLayout';

const roots:string[]=[];
afterEach(()=>{vi.clearAllMocks();roots.splice(0).forEach(root=>fs.rmSync(root,{recursive:true,force:true}));});
const board=authoredJourney(),journey=journeyFromBoardDefinition(board);
// The artist's own map, in its tool's shape: free positions, a named pattern, a theme preset, a curve per path.
const placed=board.portals.map(portal=>({id:portal.id,landscape:portal.position.landscape,portrait:portal.position.portrait}));
const composition={pattern:'two-lane fork',theme:'illustrated-night',portals:placed,edges:board.edges.map(edge=>({id:edge.id,curve:'straight',style:'dashed'}))};
const positionsOf=(definition:any)=>definition.portals.map((portal:any)=>({id:portal.id,landscape:portal.position.landscape,portrait:portal.position.portrait}));
const reply=(name:string,input:unknown,index:number)=>({id:`creator-${index}`,stop_reason:'tool_use',usage:{input_tokens:1,output_tokens:1},content:[{type:'tool_use',id:`tool-${index}`,name,input}]});
function design(turns:Array<[string,unknown]>|((call:number)=>[string,unknown])) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-creator-preview-'));roots.push(root);
 const stream=vi.fn((_request:unknown)=>({finalMessage:async()=>{const index=stream.mock.calls.length;const [name,input]=typeof turns==='function'?turns(index):turns[index-1];return reply(name,input,index);}}));
 const plan:any={planId:'preview',childId:'lab',domain:'spelling',journey,nodePlan:['learn','play','check'].map(id=>({id,type:'word-radar',activityId:'word-radar',targets:['piece']}))};
 const paint=vi.fn(async(scene:string)=>`/generated/board-scenes/${scene.length}.jpeg`);
 const input:any={childId:'lab',program:{domain:'spelling',planId:plan.planId,journey,plan},childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),rawResponseDir:path.join(root,'diagnostics'),client:{messages:{stream}},paint};
 return {stream,paint,input,run:()=>creator.askLearningExperienceDesigner(input)};
}
const requests=(stream:ReturnType<typeof design>['stream'])=>stream.mock.calls.map(call=>call[0] as any);

describe('the map artist can see its work',()=>{
 // Ila's 2026-10-14 session stopped after a partial preview tool call marked refusal.
 // The lab supplied only successful tool calls; production sent the refusal back for
 // another paid turn and finally mislabeled it composition_missing.
 it.each([false,true])('preserves and reports provider refusal without a follow-up call, and still publishes a board (prior preview=%s)',async(priorPreview)=>{
  const {stream,run}=design([['preview_board',{whatISee:'Looking.',...composition}]]);
  stream.mockImplementation(()=>({finalMessage:async()=>{
   if(priorPreview&&stream.mock.calls.length===1)return reply('preview_board',{whatISee:'Looking.',...composition},1);
   return {id:'refused',stop_reason:'refusal',usage:{input_tokens:1,output_tokens:0},content:[]} as any;
  }}));
  // Contract 39 (human review 2026-10-19): the refusal is never sent back for another turn, and
  // the board still publishes: the artist's last look, or the plain fallback layout.
  const first=await run();
  const calls=priorPreview?2:1;
  expect(stream).toHaveBeenCalledTimes(calls);
  if(priorPreview)expect(positionsOf(first.plan.boardDefinition)).toEqual(placed);
  // Reopening reuses the saved result; it neither hides the refusal nor repurchases it.
  expect((await run()).plan.boardDefinition).toEqual(first.plan.boardDefinition);
  expect(stream).toHaveBeenCalledTimes(calls);
 });

 it('is briefed as the map artist and told the real portal sizes before placing anything',async()=>{
  const {stream,run}=design([['submit_board',{...composition,rationale:'Placed once.'}]]);
  await run();
  const first=requests(stream)[0],text=JSON.stringify(first.messages[0]);
  expect(text).toContain("You are Sunny's map artist");
  expect(text).toContain('the teacher owns the lesson');
  expect(canvas).toHaveProperty('measureBoardPortals');
  expect(text).toContain('187');expect(text).toContain('211');
  expect(first.tools.map((tool:{name:string})=>tool.name).sort()).toEqual(['adjust_board','preview_board','submit_board']);
 });

 it('previews the real board at kiosk and portrait size, then submits',async()=>{
  const {stream,run}=design([['preview_board',{whatISee:'Looking.',...composition}],['submit_board',{...composition,rationale:'Looked once, kept it.'}]]);
  const result=await run();
  expect(stream).toHaveBeenCalledTimes(2);
  expect((canvas as any).renderBoardPreview).toHaveBeenCalledTimes(1);
  const followUp=JSON.stringify(requests(stream)[1].messages);
  expect(followUp).toContain('tool_result');expect(followUp).toContain('1280x720');expect(followUp).toContain('768x1024');
  expect(followUp).toContain('"type":"image"');
  expect(positionsOf(result.plan.boardDefinition)).toEqual(placed);
 });

 it('stops after 2 previews and publishes what the Creator last showed (Law 2 guard)',async()=>{
  expect((creator as any).MAX_BOARD_PREVIEWS).toBe(2);
  const {stream,run}=design(()=>['preview_board',{whatISee:'Looking.',...composition}]);
  const result=await run();
  expect((canvas as any).renderBoardPreview).toHaveBeenCalledTimes(2);
  expect(stream).toHaveBeenCalledTimes(3);
  expect(requests(stream)[2].tool_choice).toEqual({type:'tool',name:'submit_board'});
  expect(positionsOf(result.plan.boardDefinition)).toEqual(placed);
 });

 it('accepts an overlapping map as submitted and never asks for a geometry repair',async()=>{
  const stacked={...composition,portals:placed.map(portal=>({id:portal.id,landscape:{x:.5,y:.5},portrait:{x:.5,y:.5}}))};
  const {stream,run}=design([['submit_board',{whatISee:'All together.',...stacked,rationale:'Everything in one spot.'}]]);
  const result=await run();
  expect(stream).toHaveBeenCalledTimes(1);
  expect(result.plan.boardDefinition!.portals.every(portal=>portal.position.landscape.x===.5)).toBe(true);
  expect(canvas.verifyAuthoredBoardCanvas).not.toHaveBeenCalled();
  expect(JSON.stringify(requests(stream))).not.toContain('repair_board_geometry');
 });

 // Kiosk run 2026-10-13: the artist kept dark text on a dark scene through three looks and
 // wrote nothing about what it saw. It was forced straight into a tool call, never asked
 // about readability, and told colours sat on a panel the board did not draw. The lab only
 // checked that previews happened, not that the artist had room to look.
 it('must say what it sees before it places, adjusts or submits',async()=>{
  const {stream,run}=design([['submit_board',{whatISee:'First placement.',...composition,rationale:'Placed once.'}]]);
  await run();
  for(const tool of requests(stream)[0].tools){
   expect(tool.input_schema.required).toContain('whatISee');
   expect(Object.keys(tool.input_schema.properties)[0]).toBe('whatISee');
  }
  const brief=JSON.stringify(requests(stream)[0].messages[0]);
  expect(brief).toContain('read every label');
  expect(brief).toContain('plate');
 });

 it('is told as a plain fact which portals overlap, and nothing is rejected',async()=>{
  const {stream,run}=design([['preview_board',{whatISee:'First placement.',...composition}],['submit_board',{whatISee:'Two portals touch in portrait; leaving it.',pattern:'two-lane fork',rationale:'Kept.'}]]);
  const result=await run();
  const followUp=JSON.stringify(requests(stream)[1].messages);
  expect(followUp).toContain('learn-a');expect(followUp).toContain('play-a');expect(followUp).toContain('overlap');
  expect(positionsOf(result.plan.boardDefinition)).toEqual(placed);
 });

 it('adjusts only what it changes and can submit the last look without re-sending the map',async()=>{
  const moved={landscape:{x:.31,y:.12},portrait:{x:.2,y:.33}};
  const {stream,run}=design([['preview_board',{whatISee:'First placement.',...composition}],['adjust_board',{whatISee:'learn-a crowds play-a.',portals:[{id:'learn-a',...moved}],theme:'illustrated-dawn'}],['submit_board',{whatISee:'Readable now.',pattern:'two-lane fork',rationale:'Moved one portal and warmed the look.'}]]);
  const result=await run();
  expect(stream).toHaveBeenCalledTimes(3);
  expect((canvas as any).renderBoardPreview).toHaveBeenCalledTimes(2);
  const definition=result.plan.boardDefinition!;
  expect(definition.portals.find(portal=>portal.id==='learn-a')!.position).toEqual(moved);
  expect(definition.theme.palette).toEqual(THEME_PRESETS.find(preset=>preset.id==='illustrated-dawn')!.palette);
  expect(definition.portals.filter(portal=>portal.id!=='learn-a').map(portal=>portal.position)).toEqual(board.portals.filter(portal=>portal.id!=='learn-a').map(portal=>portal.position));
  expect(requests(stream)[0].tools.map((tool:{name:string})=>tool.name).sort()).toEqual(['adjust_board','preview_board','submit_board']);
 });

 // Live run 6: with readable plates in hand, the artist swapped the illustrated world for a
 // plain dark gradient. The approved Sunny look is the illustrated world, so the artist's
 // form only offers the available artwork as the background.
 it('can only choose looks set on the illustrated world',async()=>{
  const {stream,run}=design([['submit_board',{whatISee:'First placement.',...composition,rationale:'Placed once.'}]]);
  await run();
  // Contract 39: the artist picks one of the closed theme presets; every preset is the illustrated world.
  for(const tool of requests(stream)[0].tools)expect(tool.input_schema.properties.theme.enum).toEqual(THEME_PRESETS.map(preset=>preset.id));
  for(const preset of THEME_PRESETS)expect(preset.background).toEqual({type:'image',value:'/generated/adventure-board-demo/silent-letter-world.jpeg'});
 });

 // Human review 2026-10-13: readable now, but portals sit too close together and the map does
 // not look designed. The artist was never told which parts of the screen are already taken
 // or how much air to leave, and "no overlap" was the only spacing fact it was given.
 it('is told which screen areas are taken, how much air to leave, and which portals sit too close',async()=>{
  const {stream,run}=design([['preview_board',{whatISee:'First placement.',...composition}],['submit_board',{whatISee:'Check and end are tight; leaving it.',pattern:'two-lane fork',rationale:'Kept.'}]]);
  await run();
  const brief=JSON.stringify(requests(stream)[0].messages[0]);
  expect(brief).toContain('bottom-right');expect(brief).toContain('Elli');
  expect(brief).toContain('whole canvas');
  const followUp=JSON.stringify(requests(stream)[1].messages);
  expect(followUp).toContain('closer than');expect(followUp).toContain('gap');expect(followUp).toContain('end');
 });

 // Live run 12 (2026-10-13): after its last look the artist re-sent the whole 13-portal map,
 // 8,196 tokens and 123 seconds, while the child waited. The final turn only takes changes.
 it('finishes with changes only, never a full redraw, once its looks are used',async()=>{
  const moved={landscape:{x:.9,y:.2},portrait:{x:.5,y:.9}};
  const {stream,run}=design(call=>call<3?['preview_board',{whatISee:'Looking.',...composition}]:['submit_board',{whatISee:'One last nudge.',pattern:'two-lane fork',rationale:'Done.',portals:[{id:'end',...moved}]}]);
  const result=await run();
  const last=requests(stream)[2];
  expect(last.tools).toHaveLength(1);
  expect(last.tools[0].name).toBe('submit_board');
  expect(last.tools[0].input_schema.properties).not.toHaveProperty('composition');
  expect(result.plan.boardDefinition!.portals.find(portal=>portal.id==='end')!.position).toEqual(moved);
 });

 // 2026-10-14: each artist call read about 40,000 tokens, mostly the teacher's full plan and
 // her whole evaluation record, which it never needs to place stops on a map.
 it('reads only the journey, the stop sizes and the world, not the evaluation record',async()=>{
  const {stream,run}=design([['submit_board',{whatISee:'First placement.',...composition,rationale:'Placed once.'}]]);
  await run();
  const brief=String(requests(stream)[0].messages[0].content);
  expect(brief).not.toContain('nodePlan');expect(brief).not.toContain('measurement');
  for(const portal of journey.portals)expect(brief).toContain(portal.label);
  expect(brief.length).toBeLessThan(6000);
 });

 // Human review 2026-10-14 asked for a trail on a 7x3 grid; human review 2026-10-19 replaced it with
 // a free canvas so every map can be a new design (see mapArtistCanvas.test.ts).
 it('reads stops sent as JSON text',async()=>{
  const {run}=design([['submit_board',{whatISee:'Placed.',...composition,portals:JSON.stringify(placed),rationale:'Text.'}]]);
  expect(positionsOf((await run()).plan.boardDefinition)).toEqual(placed);
 });
});

// 2026-10-25 owner review: every board had the same background, because the artist was told the background
// is always one illustrated world. The artist now describes the scene for her board, and it is painted.
describe('the artist paints a background made for her',()=>{
 it('paints the scene the artist describes and keeps it on replay at no cost',async()=>{
  const {stream,paint,run}=design([['submit_board',{...composition,scene:'A sunny pottery studio with shelves of glazed mugs',rationale:'Her favourite place.'}]]);
  const first=await run();
  expect(paint).toHaveBeenCalledOnce();
  expect(paint.mock.calls[0][0]).toContain('A sunny pottery studio with shelves of glazed mugs');
  expect(first.plan.boardDefinition!.theme.background).toEqual({type:'image',value:'/generated/board-scenes/'+paint.mock.calls[0][0].length+'.jpeg'});
  expect(JSON.stringify(requests(stream)[0].tools)).toContain('"scene"');
  expect((await run()).plan.boardDefinition).toEqual(first.plan.boardDefinition);
  expect(paint).toHaveBeenCalledOnce();
 });
 it('keeps the illustrated world when no scene is described or the painting fails',async()=>{
  const plain=design([['submit_board',{...composition,rationale:'Placed once.'}]]);
  expect((await plain.run()).plan.boardDefinition!.theme.background).toEqual(THEME_PRESETS[0].background);
  expect(plain.paint).not.toHaveBeenCalled();
  const failing=design([['submit_board',{...composition,scene:'A castle',rationale:'Placed once.'}]]);
  failing.paint.mockRejectedValueOnce(new Error('grok_down'));
  expect((await failing.run()).plan.boardDefinition!.theme.background).toEqual(THEME_PRESETS[0].background);
 });
});
