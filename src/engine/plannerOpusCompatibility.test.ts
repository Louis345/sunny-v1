import {expect,it,vi} from 'vitest';
const create=vi.hoisted(()=>vi.fn());
vi.mock('@anthropic-ai/sdk',()=>({default:class{messages={create,stream:(...args:unknown[])=>({finalMessage:()=>create(...args as [unknown])})};}}));
import {requestAssignmentPlannerTool, ASSIGNMENT_PLANNER_TOOL_NAME} from './assignmentPlanner';

// 2026-10-24: the spelling intake that carried these checks moved to small locked tools (stop reasons:
// plannerTransport.test.ts; text-only replies: plannerToolLoop.test.ts). The single-form request is
// still used by the older Teaching planner, so its model compatibility is checked here directly.
it.each(['claude-opus-5-5','claude-sonnet-4-5'])('sends a request %s accepts',async(model)=>{
 create.mockResolvedValue({content:[{type:'thinking',thinking:''},{type:'tool_use',name:ASSIGNMENT_PLANNER_TOOL_NAME,input:{}}],usage:{input_tokens:10,output_tokens:20}});
 await requestAssignmentPlannerTool({prompt:'Plan.',model});
 const request=create.mock.lastCall![0];
 expect(request.tool_choice).toEqual(model==='claude-opus-5-5'?{type:'auto'}:{type:'tool',name:ASSIGNMENT_PLANNER_TOOL_NAME});
 if(model==='claude-opus-5-5')expect(request.system).toContain(ASSIGNMENT_PLANNER_TOOL_NAME);
 expect(request.thinking).toBeUndefined();
 expect(create).toHaveBeenCalledTimes(1);
 create.mockClear();
});
