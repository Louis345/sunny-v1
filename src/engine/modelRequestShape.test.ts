import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {expect,it} from 'vitest';
import {requestForModel} from './plannerTransport';

// Every model id Sunny's code names today that accepts a forced tool (seen in src on 2026-10-27).
const TODAYS_MODELS=['claude-sonnet-5','claude-opus-5','claude-fable-5','claude-sonnet-4-5','claude-opus-4-5','claude-haiku-4-5-20251001'];
const NO_FORCED_TOOL=['claude-opus-5-5','claude-sonnet-5-5','claude-fable-5-1'];
const forced=(model:string,tool_choice:unknown):any=>({model,max_tokens:6000,messages:[{role:'user',content:'fixture'}],tools:[{name:'submit',input_schema:{type:'object'}}],tool_choice});

it.each(TODAYS_MODELS)('sends %s exactly the request it is given, the same object',model=>{
 for(const choice of [{type:'tool',name:'submit'},{type:'any'},{type:'auto'}]){
  const request=forced(model,choice);
  const bytes=JSON.stringify(request);
  expect(requestForModel(request)).toBe(request);
  expect(JSON.stringify(request)).toBe(bytes);
 }
});

it.each(NO_FORCED_TOOL)('asks %s to choose the tool itself, since it refuses a forced tool, and changes nothing else',model=>{
 for(const choice of [{type:'tool',name:'submit'},{type:'any'}]){
  const request=forced(model,choice);
  const bytes=JSON.stringify(request);
  const sent=requestForModel(request);
  expect(sent).toEqual({...request,tool_choice:{type:'auto'}});
  expect(JSON.stringify(request)).toBe(bytes);
 }
 const free=forced(model,{type:'auto'});
 expect(requestForModel(free)).toBe(free);
 const noTools={model,max_tokens:10,messages:[]};
 expect(requestForModel(noTools)).toBe(noTools);
});

// The one door: a source file that forces a tool may only send through requestForModel or
// requestPlannerMessage, so a new model's rules live in plannerTransport.ts and nowhere else.
it('sends every forced-tool request through the one place that knows each model',()=>{
 const root=path.resolve(__dirname,'../..');
 const files=execSync('git ls-files src',{cwd:root}).toString().split('\n').filter(file=>file.endsWith('.ts')&&!/\.test\.ts$/.test(file)&&file!=='src/engine/plannerTransport.ts');
 const bypasses=files.flatMap(file=>{
  const source=fs.readFileSync(path.join(root,file),'utf8');
  if(!/tool_choice\s*:\s*(?:\w+\s*\?\s*)?\{\s*type\s*:\s*["'](?:tool|any)["']/.test(source))return [];
  return [...source.matchAll(/messages\.(?:create|stream)\(\s*(?!requestForModel\()/g)].map(match=>`${file}:${source.slice(0,match.index).split('\n').length}`);
 });
 expect(bypasses).toEqual([]);
});
