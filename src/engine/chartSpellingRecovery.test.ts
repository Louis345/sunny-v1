import {expect,it} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {checkpointedAttempt} from '../chart/spelling/checkpointedAttempt';
async function isolated(work:(base:string)=>Promise<void>){const root=fs.mkdtempSync(path.join(os.tmpdir(),'spelling-recovery-'));try{await work(path.join(root,'request'));}finally{fs.rmSync(root,{recursive:true,force:true});}}
it('preserves a known failure and permits an explicit retry, capped at three attempts',()=>isolated(async base=>{
 let calls=0;const fail=async()=>{calls++;throw Error('overloaded');};
 for(let n=0;n<3;n++)await expect(checkpointedAttempt(base,{model:'fixture'},fail,x=>x)).rejects.toThrow(n===2?'attempt_limit':'overloaded');
 await expect(checkpointedAttempt(base,{},fail,x=>x)).rejects.toThrow('attempt_limit');expect(calls).toBe(3);
 expect(fs.existsSync(base+'.attempt-3.error.json')).toBe(true);
}));
it('reuses saved output, and recovers from saved invalid output without duplicate acceptance',()=>isolated(async base=>{
 let calls=0,accepted=0;const produce=async()=>++calls===1?'bad':'{"ok":true}';
 const accept=(x:unknown)=>{const p=JSON.parse(String(x));accepted++;return p;};
 await expect(checkpointedAttempt(base,{},produce,accept)).rejects.toThrow();
 expect(await checkpointedAttempt(base,{},produce,accept)).toEqual({ok:true});
 expect(calls).toBe(2);expect(accepted).toBe(1);
 expect(fs.readFileSync(base+'.attempt-1.response.json','utf8')).toBe('"bad"');
}));
it('leaves a crashed request uncertain until explicit parent recovery',()=>isolated(async base=>{
 fs.writeFileSync(base+'.attempt-1.request.json','{}');let calls=0;
 const produce=async()=>{calls++;return 'ok';};
 await expect(checkpointedAttempt(base,{},produce,x=>x)).rejects.toThrow('needs_attention');expect(calls).toBe(0);
 expect(await checkpointedAttempt(base,{},produce,x=>x,true)).toBe('ok');expect(calls).toBe(1);
 expect(fs.existsSync(base+'.attempt-1.error.json')).toBe(true);
}));
it('cannot recover or repeat an actively running call',()=>isolated(async base=>{
 let release!:(x:string)=>void;let calls=0;
 const produce=async()=>{calls++;return new Promise<string>(r=>release=r);};
 const first=checkpointedAttempt(base,{},produce,x=>x);
 await expect(checkpointedAttempt(base,{},produce,x=>x,true)).rejects.toThrow('in_progress');
 release('ok');expect(await first).toBe('ok');expect(calls).toBe(1);
}));

it('opens a new bounded batch only after explicit parent recovery and keeps all old files',()=>isolated(async base=>{
 let calls=0;const produce=async()=>{if(++calls<=3)throw Error('outage');return 'ok';};
 for(let n=0;n<3;n++)await expect(checkpointedAttempt(base,{},produce,x=>x)).rejects.toThrow();
 const old=fs.readdirSync(path.dirname(base)).map(f=>[f,fs.readFileSync(path.join(path.dirname(base),f),'utf8')]);
 await expect(checkpointedAttempt(base,{},produce,x=>x)).rejects.toThrow('attempt_limit');expect(calls).toBe(3);
 expect(await checkpointedAttempt(base,{},produce,x=>x,true)).toBe('ok');expect(calls).toBe(4);
 for(const [f,raw] of old)expect(fs.readFileSync(path.join(path.dirname(base),f),'utf8')).toBe(raw);
 expect(fs.existsSync(base+'.batch-2.opened.json')).toBe(true);
 expect(await checkpointedAttempt(base,{},produce,x=>x)).toBe('ok');expect(calls).toBe(4);
}));
it('enforces the three-attempt bound again within each reopened batch',()=>isolated(async base=>{
 let calls=0;const fail=async()=>{calls++;throw Error('outage');};
 for(let n=0;n<3;n++)await expect(checkpointedAttempt(base,{},fail,x=>x)).rejects.toThrow();
 for(let n=0;n<3;n++)await expect(checkpointedAttempt(base,{},fail,x=>x,n===0)).rejects.toThrow();
 await expect(checkpointedAttempt(base,{},fail,x=>x)).rejects.toThrow('attempt_limit');expect(calls).toBe(6);
}));
