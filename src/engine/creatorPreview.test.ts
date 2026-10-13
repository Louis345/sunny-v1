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
  return {screenshots,portals:[{viewport:'1280x720',id:'check',x:10,y:20,width:123,height:187}],artworkLoaded:true};
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
  expect(first.tools.map((tool:{name:string})=>tool.name).sort()).toEqual(['preview_board','submit_board']);
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

 it('stops after 3 previews and publishes what the Creator last showed (Law 2 guard)',async()=>{
  expect((creator as any).MAX_BOARD_PREVIEWS).toBe(3);
  const {stream,run}=design(()=>['preview_board',{composition}]);
  const result=await run();
  expect((canvas as any).renderBoardPreview).toHaveBeenCalledTimes(3);
  expect(stream).toHaveBeenCalledTimes(4);
  expect(requests(stream)[3].tool_choice).toEqual({type:'tool',name:'submit_board'});
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
});
