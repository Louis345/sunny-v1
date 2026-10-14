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
import {journeyFromBoardDefinition,compositionFromBoardDefinition} from '../shared/adventureBoardDefinition';

const roots:string[]=[];
afterEach(()=>{vi.clearAllMocks();roots.splice(0).forEach(root=>fs.rmSync(root,{recursive:true,force:true}));});
const board=authoredJourney(),journey=journeyFromBoardDefinition(board),composition=compositionFromBoardDefinition(board);
const reply=(name:string,input:unknown,index:number)=>({id:`creator-${index}`,stop_reason:'tool_use',usage:{input_tokens:1,output_tokens:1},content:[{type:'tool_use',id:`tool-${index}`,name,input}]});
function design(turns:Array<[string,unknown]>|((call:number)=>[string,unknown])) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-creator-preview-'));roots.push(root);
 const stream=vi.fn((_request:unknown)=>({finalMessage:async()=>{const index=stream.mock.calls.length;const [name,input]=typeof turns==='function'?turns(index):turns[index-1];return reply(name,input,index);}}));
 const plan:any={planId:'preview',childId:'lab',domain:'spelling',journey,nodePlan:['learn','play','check'].map(id=>({id,type:'word-radar',activityId:'word-radar',targets:['piece']}))};
 const input:any={childId:'lab',program:{domain:'spelling',planId:plan.planId,journey,plan},childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),rawResponseDir:path.join(root,'diagnostics'),client:{messages:{stream}}};
 return {stream,run:()=>creator.askLearningExperienceDesigner(input)};
}
const requests=(stream:ReturnType<typeof design>['stream'])=>stream.mock.calls.map(call=>call[0] as any);

describe('the map artist can see its work',()=>{
 it('is briefed as the map artist and told the real portal sizes before placing anything',async()=>{
  const {stream,run}=design([['submit_board',{composition,rationale:'Placed once.'}]]);
  await run();
  const first=requests(stream)[0],text=JSON.stringify(first.messages[0]);
  expect(text).toContain("You are Sunny's map artist");
  expect(text).toContain('You never change the lesson');
  expect(canvas).toHaveProperty('measureBoardPortals');
  expect(text).toContain('187');expect(text).toContain('211');
  expect(first.tools.map((tool:{name:string})=>tool.name).sort()).toEqual(['adjust_board','preview_board','submit_board']);
 });

 it('previews the real board at kiosk and portrait size, then submits',async()=>{
  const {stream,run}=design([['preview_board',{composition}],['submit_board',{composition,rationale:'Looked once, kept it.'}]]);
  const result=await run();
  expect(stream).toHaveBeenCalledTimes(2);
  expect((canvas as any).renderBoardPreview).toHaveBeenCalledTimes(1);
  const followUp=JSON.stringify(requests(stream)[1].messages);
  expect(followUp).toContain('tool_result');expect(followUp).toContain('1280x720');expect(followUp).toContain('768x1024');
  expect(followUp).toContain('"type":"image"');
  expect(result.plan.boardDefinition).toEqual(board);
 });

 it('stops after 2 previews and publishes what the Creator last showed (Law 2 guard)',async()=>{
  expect((creator as any).MAX_BOARD_PREVIEWS).toBe(2);
  const {stream,run}=design(()=>['preview_board',{composition}]);
  const result=await run();
  expect((canvas as any).renderBoardPreview).toHaveBeenCalledTimes(2);
  expect(stream).toHaveBeenCalledTimes(3);
  expect(requests(stream)[2].tool_choice).toEqual({type:'tool',name:'submit_board'});
  expect(result.plan.boardDefinition).toEqual(board);
 });

 it('accepts an overlapping map as submitted and never asks for a geometry repair',async()=>{
  const stacked=structuredClone(composition);
  stacked.portals.forEach(portal=>{portal.position={landscape:{x:.5,y:.5},portrait:{x:.5,y:.5}};});
  const {stream,run}=design([['submit_board',{composition:stacked,rationale:'Everything in one spot.'}]]);
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
  const {stream,run}=design([['submit_board',{whatISee:'First placement.',composition,rationale:'Placed once.'}]]);
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
  const {stream,run}=design([['preview_board',{whatISee:'First placement.',composition}],['submit_board',{whatISee:'Two portals touch in portrait; leaving it.',rationale:'Kept.'}]]);
  const result=await run();
  const followUp=JSON.stringify(requests(stream)[1].messages);
  expect(followUp).toContain('learn-a');expect(followUp).toContain('play-a');expect(followUp).toContain('overlap');
  expect(result.plan.boardDefinition).toEqual(board);
 });

 it('adjusts only what it changes and can submit the last look without re-sending the map',async()=>{
  const moved={landscape:{x:.31,y:.12},portrait:{x:.2,y:.33}};
  const {stream,run}=design([['preview_board',{whatISee:'First placement.',composition}],['adjust_board',{whatISee:'learn-a crowds play-a.',portals:[{id:'learn-a',position:moved}],theme:{palette:{text:'#ffffff'}}}],['submit_board',{whatISee:'Readable now.',rationale:'Moved one portal and lightened the text.'}]]);
  const result=await run();
  expect(stream).toHaveBeenCalledTimes(3);
  expect((canvas as any).renderBoardPreview).toHaveBeenCalledTimes(2);
  const definition=result.plan.boardDefinition!;
  expect(definition.portals.find(portal=>portal.id==='learn-a')!.position).toEqual(moved);
  expect(definition.theme.palette.text).toBe('#ffffff');
  expect(definition.theme.palette.panel).toBe(board.theme.palette.panel);
  expect(definition.portals.filter(portal=>portal.id!=='learn-a').map(portal=>portal.position)).toEqual(board.portals.filter(portal=>portal.id!=='learn-a').map(portal=>portal.position));
  expect(requests(stream)[0].tools.map((tool:{name:string})=>tool.name).sort()).toEqual(['adjust_board','preview_board','submit_board']);
 });

 // Live run 6: with readable plates in hand, the artist swapped the illustrated world for a
 // plain dark gradient. The approved Sunny look is the illustrated world, so the artist's
 // form only offers the available artwork as the background.
 it('can only choose the illustrated world as the background',async()=>{
  const {stream,run}=design([['submit_board',{whatISee:'First placement.',composition,rationale:'Placed once.'}]]);
  await run();
  for(const tool of requests(stream)[0].tools){
   const background=(tool.input_schema.properties.composition??tool.input_schema).properties.theme.properties.background;
   expect(background.properties.type.const).toBe('image');
   expect(background.properties.value.enum).toEqual(['/generated/adventure-board-demo/silent-letter-world.jpeg']);
  }
 });

 // Human review 2026-10-13: readable now, but portals sit too close together and the map does
 // not look designed. The artist was never told which parts of the screen are already taken
 // or how much air to leave, and "no overlap" was the only spacing fact it was given.
 it('is told which screen areas are taken, how much air to leave, and which portals sit too close',async()=>{
  const {stream,run}=design([['preview_board',{whatISee:'First placement.',composition}],['submit_board',{whatISee:'Check and end are tight; leaving it.',rationale:'Kept.'}]]);
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
  const {stream,run}=design(call=>call<3?['preview_board',{whatISee:'Looking.',composition}]:['submit_board',{whatISee:'One last nudge.',rationale:'Done.',portals:[{id:'end',position:moved}]}]);
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
  const {stream,run}=design([['submit_board',{whatISee:'First placement.',composition,rationale:'Placed once.'}]]);
  await run();
  const brief=String(requests(stream)[0].messages[0].content);
  expect(brief).not.toContain('nodePlan');expect(brief).not.toContain('measurement');
  for(const portal of journey.portals)expect(brief).toContain(portal.label);
  expect(brief.length).toBeLessThan(6000);
 });

 // Human review 2026-10-14: stops should line up on the trail, be spread out, and the choice
 // should read as a fork. Free 0..1 coordinates let the artist scatter them.
 it('places stops on a grid of columns and rows, and lays a choice out as two lanes',async()=>{
  const cell=(col:number,row:number,pcol:number,prow:number)=>({landscape:{col,row},portrait:{col:pcol,row:prow}});
  const gridComposition={theme:composition.theme,edges:composition.edges,portals:board.portals.map((portal,index)=>({id:portal.id,cell:cell(index%7,index<7?1:2,index%3,Math.floor(index/3))}))};
  const {stream,run}=design([['submit_board',{whatISee:'Placed on the grid.',composition:gridComposition,rationale:'Grid.'}]]);
  const result=await run();
  const tool=requests(stream)[0].tools.find((candidate:{name:string})=>candidate.name==='submit_board');
  const portalShape=tool.input_schema.properties.composition.properties.portals.items;
  expect(portalShape.properties).toHaveProperty('cell');expect(portalShape.properties).not.toHaveProperty('position');
  expect(portalShape.properties.cell.properties.landscape.properties.col.maximum).toBe(6);
  expect(portalShape.properties.cell.properties.landscape.properties.row.maximum).toBe(2);
  const brief=String(requests(stream)[0].messages[0].content);
  expect(brief).toContain('lane');expect(brief).toContain('7 columns');
  const placed=result.plan.boardDefinition!.portals;
  expect(placed[0].position.landscape).toEqual({x:0,y:.5});
  expect(placed[6].position.landscape).toEqual({x:1,y:.5});
  expect(placed[7].position.landscape).toEqual({x:0,y:1});
 });
});
