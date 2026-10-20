import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, expect, it, vi} from 'vitest';
import {recordGenerationFailure, recordProviderRequestDetails, runMathProviderStage} from './adaptiveMathDiscovery';
import {requestPlannerMessage} from './plannerTransport';

const roots: string[] = [];
const root = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sunny-diagnostics-')); roots.push(dir); return dir; };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); roots.forEach(dir => fs.rmSync(dir, {recursive:true, force:true})); roots.length = 0; });

it('retains redacted request context before transport failure and never replays a provider call', async () => {
  const draftDir = root();
  vi.stubEnv('ANTHROPIC_API_KEY', 'private-test-secret');
  vi.stubEnv('SUNNY_BUILD_ID', 'recorded-sandbox-build');
  const execute = vi.fn(async () => {
    recordProviderRequestDetails({model:'recorded', tools:[{name:'plan', input_schema:{type:'object'}}],
      messages:[{role:'user', content:'Teach broken'}], headers:{Authorization:'Bearer private-test-secret'}});
    throw new Error('transport failed private-test-secret');
  });
  const input = {draftDir, stage:'intake', model:'recorded', request:{childId:'lab', apiKey:'private-test-secret'}, execute};
  await expect(runMathProviderStage(input)).rejects.toThrow('provider_outcome_uncertain');
  const receiptDir = path.join(draftDir,'provider-diagnostics');
  const requestFile = fs.readdirSync(receiptDir).find(file => file.endsWith('.request.json'))!;
  const captured = JSON.parse(fs.readFileSync(path.join(receiptDir,requestFile),'utf8'));
  expect(captured).toMatchObject({code:{buildId:'recorded-sandbox-build'}, context:{childId:'lab',apiKey:'[REDACTED]'}, providerRequest:{tools:[{name:'plan'}]}});
  expect(JSON.stringify(captured)).not.toContain('private-test-secret');
  const error = new Error('validator failed private-test-secret');
  recordGenerationFailure({draftDir,childId:'lab',homeworkId:'hw',stage:'loading',startedAt:Date.now()-100,error});
  const file = fs.readdirSync(path.join(draftDir,'provider-diagnostics')).find(file=>file.endsWith('.failure.json'))!;
  const failure = JSON.parse(fs.readFileSync(path.join(draftDir,'provider-diagnostics',file),'utf8'));
  expect(failure).toMatchObject({diagnosis:'unassigned', error:{message:'validator failed [REDACTED]'}, providerStages:[{stage:'intake',status:'outcome_uncertain'}]});
  expect(failure.elapsedMs).toBeGreaterThanOrEqual(100);
  await expect(runMathProviderStage(input)).rejects.toThrow('provider_outcome_uncertain');
  expect(execute).toHaveBeenCalledOnce();
});

it('reports diagnostic disk failure without replacing the original exception', () => {
  const draftDir=root(), original=new Error('original failure');
  fs.writeFileSync(path.join(draftDir,'provider-diagnostics'),'not a directory');
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  expect(()=>recordGenerationFailure({draftDir,childId:'lab',homeworkId:'hw',stage:'loading',startedAt:Date.now(),error:original})).not.toThrow();
  expect(log).toHaveBeenCalledWith(expect.stringContaining('[diagnostic-write] [failed]'));
  expect(original.message).toBe('original failure');
});

it('keeps each explicitly retried request rather than overwriting the first attempt', async () => {
  const draftDir=root();
  const execute=vi.fn(async()=>{
    recordProviderRequestDetails({prompt:execute.mock.calls.length === 1 ? 'original' : 'later'});
    throw Object.assign(new Error('rate limited'),{status:429});
  });
  const input={draftDir,stage:'planner',model:'recorded',request:{child:'lab'},execute};
  await expect(runMathProviderStage(input)).rejects.toThrow('provider_request_rejected');
  await expect(runMathProviderStage(input)).rejects.toThrow('provider_request_rejected');
  const files=fs.readdirSync(path.join(draftDir,'provider-diagnostics')).sort();
  expect(files).toHaveLength(2);
  expect(files[0]).toContain('attempt-1');
  expect(files[1]).toContain('attempt-2');
  expect(files.map(file=>JSON.parse(fs.readFileSync(path.join(draftDir,'provider-diagnostics',file),'utf8')).providerRequest.prompt)).toEqual(['original','later']);
  expect(execute).toHaveBeenCalledTimes(2);
});

it('captures final streaming settings and keeps concurrent provider contexts separate', async () => {
  const draftDir=root();
  const stream=vi.fn((_request:unknown)=>({finalMessage:async()=>({id:'recorded-response'})}));
  await Promise.all(['first','second'].map(stage=>runMathProviderStage({draftDir,stage,model:'claude-opus-5-5',request:{stage},execute:async()=>{
    await Promise.resolve();
    return requestPlannerMessage({messages:{stream}} as never,{model:'claude-opus-5-5',max_tokens:6000,messages:[{role:'user',content:stage}]},{onRequest:recordProviderRequestDetails});
  }})));
  const files=fs.readdirSync(path.join(draftDir,'provider-diagnostics'));
  expect(files).toHaveLength(2);
  for(const file of files){
    const saved=JSON.parse(fs.readFileSync(path.join(draftDir,'provider-diagnostics',file),'utf8'));
    expect(saved.providerRequest).toMatchObject({max_tokens:32000,tool_choice:{type:'auto'},output_config:{effort:'high'},messages:[{content:saved.context.stage}]});
    expect(stream.mock.calls.some(([request])=>JSON.stringify(request)===JSON.stringify(saved.providerRequest))).toBe(true);
  }
  expect(stream).toHaveBeenCalledTimes(2);
});
