import Anthropic from '@anthropic-ai/sdk';
import {expect,it,vi} from 'vitest';
import {requestPlannerMessage,readPlannerToolReceipt} from './plannerTransport';
const params={model:'claude-opus-5-5',max_tokens:6000,messages:[{role:'user' as const,content:'fixture'}],tools:[{name:'submit',input_schema:{type:'object' as const}}],tool_choice:{type:'tool' as const,name:'submit'}};
it.each(['claude-opus-5-5','claude-sonnet-5-5','claude-fable-5-1'])('streams %s with an explicit reasoning budget and no automatic retry',async(model)=>{
 const message={stop_reason:'tool_use',content:[{type:'tool_use',name:'submit',input:{ok:true}}]};
 const finalMessage=vi.fn(async()=>message),stream=vi.fn((_args:unknown,_options?:unknown)=>({finalMessage})),create=vi.fn();
 expect(await requestPlannerMessage({messages:{stream,create}} as never,{...params,model})).toBe(message);
 expect(create).not.toHaveBeenCalled();expect(stream).toHaveBeenCalledTimes(1);expect(finalMessage).toHaveBeenCalledTimes(1);
 expect(stream.mock.calls[0]).toMatchObject([{model,max_tokens:32000,output_config:{effort:'high'},tool_choice:{type:'auto'}},{timeout:300000,maxRetries:0}]);
});
it('preserves legacy model request settings',async()=>{
 const create=vi.fn(async()=>({content:[]})),stream=vi.fn();
 await requestPlannerMessage({messages:{create,stream}} as never,{...params,model:'claude-sonnet-4-5'},{timeout:120000});
 expect(stream).not.toHaveBeenCalled();expect(create.mock.calls[0]).toMatchObject([{max_tokens:6000,tool_choice:params.tool_choice},{timeout:120000,maxRetries:0}]);
});
it.each(['max_tokens','refusal','model_context_window_exceeded'])('names known %s results before reading even a plausible tool',reason=>{
 expect(()=>readPlannerToolReceipt({plannerMessage:{stop_reason:reason,content:[{type:'tool_use',name:'submit',input:{ok:true}}]}},'submit')).toThrow('planner_response_'+reason);
});
it('supports preserved legacy proposals and thinking before the requested tool',()=>{
 expect(readPlannerToolReceipt({ok:true},'submit')).toEqual({ok:true});
 expect(readPlannerToolReceipt({plannerMessage:{stop_reason:'tool_use',content:[{type:'thinking',thinking:''},{type:'tool_use',name:'submit',input:{ok:true}}]}},'submit')).toEqual({ok:true});
});
it('allows configured effort and budget, refuses invalid settings before a call',async()=>{
 const stream=vi.fn((_args:unknown,_options?:unknown)=>({finalMessage:async()=>({content:[]})}));
 try{
 vi.stubEnv('SUNNY_PLANNER_EFFORT','medium');vi.stubEnv('SUNNY_PLANNER_MAX_TOKENS','48000');
 await requestPlannerMessage({messages:{stream}} as never,params);
 expect(stream.mock.calls[0]?.[0]).toMatchObject({max_tokens:48000,output_config:{effort:'medium'}});
 vi.stubEnv('SUNNY_PLANNER_EFFORT','nonsense');
 await expect(requestPlannerMessage({messages:{stream}} as never,params)).rejects.toThrow('planner_effort_invalid');
 expect(stream).toHaveBeenCalledTimes(1);
 }finally{vi.unstubAllEnvs();}
});
it('does not retry a timed-out stream or turn its unknown outcome into a refusal',async()=>{
 const stream=vi.fn((_args:unknown,_options?:unknown)=>({finalMessage:async()=>{throw Error('timeout');}}));
 await expect(requestPlannerMessage({messages:{stream}} as never,params)).rejects.toThrow('timeout');expect(stream).toHaveBeenCalledTimes(1);
});

it.each(['max_tokens','refusal'])('receives %s through the real SDK SSE parser with no network',async(reason)=>{
 const events=[
  {type:'message_start',message:{id:'fixture',type:'message',role:'assistant',model:params.model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:1,output_tokens:0}}},
  {type:'message_delta',delta:{stop_reason:reason,stop_sequence:null},usage:{output_tokens:32000}},
  {type:'message_stop'},
 ];
 const fetch=vi.fn(async(_url:unknown,init?:RequestInit)=>{
  expect(JSON.parse(String(init?.body))).toMatchObject({stream:true,max_tokens:32000,output_config:{effort:'high'},tool_choice:{type:'auto'}});
  return new Response(events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}});
 });
 const client=new Anthropic({apiKey:'synthetic-unused',fetch});
 const message=await requestPlannerMessage(client,params);
 expect(()=>readPlannerToolReceipt({plannerMessage:message},'submit')).toThrow('planner_response_'+reason);expect(fetch).toHaveBeenCalledTimes(1);
});
