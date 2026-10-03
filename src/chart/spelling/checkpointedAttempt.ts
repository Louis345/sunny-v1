import fs from 'node:fs';
import path from 'node:path';
const active = new Set<string>();
function save(file:string,value:unknown){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
/** Explicit invocations only: no automatic retries, no erased outcomes. */
export async function checkpointedAttempt<T>(base:string, metadata:Record<string,unknown>, produce:()=>Promise<unknown>, accept:(value:unknown,request:Record<string,unknown>)=>T,recover=false):Promise<T>{
 if(active.has(base))throw Error('request_in_progress');
 active.add(base);
 try{
  for(let attempt=1;attempt<=3;attempt++){
   // Earlier checkpoints remain readable; never delete them to recover.
   const stem=attempt===1&&fs.existsSync(base+'.request.json')?base:base+`.attempt-${attempt}`;
   const request=stem+'.request.json',response=stem+'.response.json',errorFile=stem+'.error.json';
   if(fs.existsSync(errorFile))continue;
   const existing=fs.existsSync(request);
   if(existing&&!fs.existsSync(response)){
    if(!recover)throw Error('request_needs_attention: outcome unknown; parent recovery required');
    save(errorFile,{reason:'parent_acknowledged_unknown_outcome',at:new Date().toISOString()});
    console.error(` 🎮 [spelling-request] [recovery] [acknowledged] attempt=${attempt}`);continue;
   }
   if(!existing)save(request,{...metadata,attempt,requestedAt:new Date().toISOString()});
   try{
    if(!fs.existsSync(response))save(response,await produce());
    if(fs.existsSync(errorFile))throw Error('request_superseded');
    const result=accept(JSON.parse(fs.readFileSync(response,'utf8')),JSON.parse(fs.readFileSync(request,'utf8')));
    console.error(` 🎮 [spelling-request] [attempt] [accepted] attempt=${attempt}`);return result;
   }catch(error){
    if(!fs.existsSync(errorFile))save(errorFile,{reason:error instanceof Error?error.message:String(error),at:new Date().toISOString()});
    console.error(` 🎮 [spelling-request] [attempt] [failed] attempt=${attempt}`,error);
    if(attempt===3)throw Error('request_attempt_limit: three attempts exhausted; operator attention required');
    throw error;
   }
  }
  throw Error('request_attempt_limit: three attempts exhausted; operator attention required');
 }finally{active.delete(base);}
}
