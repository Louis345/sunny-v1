import {expect,it,vi} from 'vitest';
const create=vi.hoisted(()=>vi.fn());
vi.mock('@anthropic-ai/sdk',()=>({default:class{messages={create};}}));
import {planSpellingIntakeFromSource, ASSIGNMENT_PLANNER_TOOL_NAME, type AssignmentPlanningPacket} from './assignmentPlanner';
const packet = {
  childId: "lab-child", sourceDocument: { filename: "school.txt", sourcePath: "/missing/school.txt", mediaType: "text/plain", sourceKind: "text_assignment", extractionMethod: "text", fullText: "Spelling\nnight\nlight\ncan't", fileHash: "source-hash", pages: [{ pageNumber: 1, text: "Spelling\nnight\nlight\ncan't" }], warnings: [] },
  childChart: { childId: "lab-child", displayName: "Lab child", recentEvidence: [] },
} as unknown as AssignmentPlanningPacket;
const intake = { title: "School spelling", words: [{ word: "night", pageNumber: 1 }, { word: "light", pageNumber: 1 }, { word: "can't", pageNumber: 1 }], uncertainty: [] };


it.each(['claude-opus-5-5','claude-sonnet-4-5'])('preserves validated intake using %s',async(model)=>{
 create.mockResolvedValue({content:[{type:'thinking',thinking:''},{type:'tool_use',name:ASSIGNMENT_PLANNER_TOOL_NAME,input:intake}],usage:{input_tokens:10,output_tokens:20}});
 expect((await planSpellingIntakeFromSource(packet,{model})).output).toEqual(intake);
 const request=create.mock.lastCall![0];
 expect(request.tool_choice).toEqual(model==='claude-opus-5-5'?{type:'auto'}:{type:'tool',name:ASSIGNMENT_PLANNER_TOOL_NAME});
 if(model==='claude-opus-5-5')expect(request.system).toContain(ASSIGNMENT_PLANNER_TOOL_NAME);
 expect(request.thinking).toBeUndefined();
});
it('rejects missing tool output with one call instead of inventing a plan',async()=>{
 create.mockClear();create.mockResolvedValue({content:[{type:'text',text:'I cannot decide'}],usage:{input_tokens:10,output_tokens:20}});
 await expect(planSpellingIntakeFromSource(packet,{model:'claude-opus-5-5'})).rejects.toThrow();
 expect(create).toHaveBeenCalledTimes(1);
});
