import {expect,it,vi} from 'vitest';
const create=vi.hoisted(()=>vi.fn(async(_args:unknown)=>({content:[{type:'tool_use',name:'submit_spelling_proposal',input:{fixture:true}}]})));
vi.mock('@anthropic-ai/sdk',()=>({default:class{messages={create};}}));
import {configuredSpellingModel,spellingPlanner} from '../chart/spelling/provider';
it('requires an explicit model and uses a forced schema tool without live calls',async()=>{
 expect(()=>configuredSpellingModel({})).toThrow('planner_model_required');
 const old=process.env.SUNNY_EXPERIENCE_PLANNER_MODEL;process.env.SUNNY_EXPERIENCE_PLANNER_MODEL='synthetic-model';
 const key=process.env.ANTHROPIC_API_KEY;process.env.ANTHROPIC_API_KEY='synthetic-unused';
 try{expect(await spellingPlanner('prior',{} as any)).toEqual({fixture:true});
 expect(spellingPlanner.modelId).toBe('synthetic-model');
 expect(create.mock.calls[0]?.[0]).toMatchObject({model:'synthetic-model',tool_choice:{type:'tool',name:'submit_spelling_proposal'}});
 }finally{if(old===undefined)delete process.env.SUNNY_EXPERIENCE_PLANNER_MODEL;else process.env.SUNNY_EXPERIENCE_PLANNER_MODEL=old;if(key===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=key;}
});
