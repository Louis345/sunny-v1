import {it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {linearJourneyFixture} from '../scripts/fixtures/authoredJourney';
import {journeyFromBoardDefinition,compositionFromBoardDefinition} from '../shared/adventureBoardDefinition';
const verify=vi.hoisted(()=>vi.fn());
vi.mock('./adventureBoardCanvas',async importOriginal=>({...await importOriginal<typeof import('./adventureBoardCanvas')>(),verifyAuthoredBoardCanvas:verify}));
import {askLearningExperienceDesigner} from './directMathExperience';
// Spelling boards no longer repair geometry: the map artist previews and its submission is
// accepted (see creatorPreview.test.ts). Math keeps this path until it gets the preview tool.
it('preserves successful geometry during a math continuation with unfinished activity designs',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-math-geometry-'));
 const definition=linearJourneyFixture(['teach','check']),composition=compositionFromBoardDefinition(definition),journey=journeyFromBoardDefinition(definition);
 const program={domain:'math',planId:'math-preserve',journey,activities:[{id:'teach'},{id:'check'}],fork:{routes:[{id:'route',nodeIds:['teach','check']}]}} as never;
 const spine={title:'World',narrative:'World',openingChoice:'Begin',backgroundDirection:'Illustrated',routeDirections:[{routeId:'route',label:'Route',promise:'Learn',childFacingActionCue:'Tap',previewNodeId:'teach',engagementVariable:'pace'}]};
 verify.mockReset().mockRejectedValueOnce(new Error('board_canvas_invalid:["768x1024:teach:overlaps:check:normalized_center_separation"]')).mockResolvedValue({});
 const stream=vi.fn(()=>({finalMessage:async()=>({content:[{type:'tool_use',name:'create_math_design_packet',input:{composition:stream.mock.calls.length===1?composition:{...composition,theme:{...composition.theme,background:{type:'solid',value:'#000'}}},boardCreativeSpine:spine,artifacts:[],rationale:'Preserve'}}],usage:{input_tokens:1,output_tokens:1},stop_reason:'tool_use'})}));
 try{await expect(askLearningExperienceDesigner({childId:'synthetic',program,childContext:{},priorOutcomes:{},checkpointFile:path.join(root,'design.json'),client:{messages:{stream}} as never})).rejects.toThrow('composition_correction_changed_protected_fields');expect(stream).toHaveBeenCalledTimes(2);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
