import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {checkpointedAttempt} from './checkpointedAttempt';
export type SpellingVoice = {key:string;speak:(word:string)=>Promise<Buffer>};
export function cachedSpellingAudio(directory:string,voice:SpellingVoice){
 return async(word:string,recover=false)=>{
  const key=createHash('sha256').update(JSON.stringify([voice.key,word])).digest('hex');
  const base=path.join(directory,key);
  if(fs.existsSync(base+'.mp3'))return fs.readFileSync(base+'.mp3');
  // Preserve an older unknown marker rather than silently reissuing it.
  if(fs.existsSync(base+'.requested')&&!fs.existsSync(base+'.attempt-1.request.json'))fs.writeFileSync(base+'.attempt-1.request.json',JSON.stringify({legacyUnknown:true}),{flag:'wx',mode:0o600});
  return checkpointedAttempt(base,{voice:voice.key,word},async()=>{
   const bytes=await voice.speak(word);if(!bytes.length)throw Error('audio_empty');return bytes.toString('base64');
  },raw=>{if(typeof raw!=='string')throw Error('audio_invalid');const bytes=Buffer.from(raw,'base64');if(!bytes.length)throw Error('audio_empty');return bytes;},recover);
 };
}
