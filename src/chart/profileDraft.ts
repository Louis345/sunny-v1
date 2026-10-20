import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {chartPath,type ChartOptions} from './guard';
import type {ChartDatabase} from './db';
import {exportEvents} from './exportEvents';
import {recordFact} from './spelling/record';
import {schemas,factId} from './spelling/schemas';
const profileSchema=schemas['child.profile_set'];
const envelope=z.strictObject({childId:z.string(),draftId:z.string(),profile:profileSchema});
const confirmation=z.strictObject({draftId:z.string(),profile:profileSchema,confirmed:z.literal(true)});
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const fileFor=(dbPath:string,child:string)=>path.join(path.dirname(dbPath),child,'profile-draft.json');
const strings=(value:unknown)=>Array.isArray(value)?[...new Set(value.filter((v):v is string=>typeof v==='string'&&!!v.trim()).map(s=>s.trim()))]:undefined;
/** One-time low-level adapter. Never invoked by a Planner or an ordinary chart read. */
export function prepareProfileDraft(sourceFile:string,childId:string,options:ChartOptions){
 const source=JSON.parse(fs.readFileSync(sourceFile,'utf8'));
 if(source.childId && source.childId!==childId)throw Error('profile_child_mismatch');
 const profile=profileSchema.parse({
  displayName:source.displayName??source.identity?.displayName??(childId[0].toUpperCase()+childId.slice(1)),
  interests:strings(source.interests??source.bondPatterns?.topics),
  supportNeeds:strings(source.supportNeeds),
  companion:typeof source.companion==='string'?source.companion:source.companion?.companionId,
  readingLevel:source.readingLevel??source.readingProfile?.currentReadingLevel,
 });
 const draft=envelope.parse(JSON.parse(JSON.stringify({childId,profile,draftId:hash(JSON.stringify({childId,profile}))})));
 const file=fileFor(chartPath(childId,options),childId);
 if(fs.existsSync(file)){
  const saved=envelope.parse(JSON.parse(fs.readFileSync(file,'utf8')));
  if(saved.draftId!==draft.draftId)throw Error('profile_draft_already_exists');
  return saved;
 }
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(draft,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 console.error(` 🎮 [profile-draft] [prepare] [saved] child=${childId}`);return draft;
}
function loadDraft(db:ChartDatabase){const file=fileFor(db.path,db.childId);if(!fs.existsSync(file))return null;const draft=envelope.parse(JSON.parse(fs.readFileSync(file,'utf8')));if(draft.childId!==db.childId)throw Error('profile_child_mismatch');return draft;}
export function readProfileDraft(db:ChartDatabase){return exportEvents(db).some(e=>e.type==='child.profile_set')?null:loadDraft(db);}
export function confirmProfileDraft(db:ChartDatabase,input:unknown){
 const body=confirmation.parse(input);
 return db.sql.transaction(()=>{
  const draft=loadDraft(db);if(!draft||draft.draftId!==body.draftId)throw Error('profile_draft_mismatch');
  const previous=exportEvents(db).find(e=>e.type==='child.profile_set');
  if(previous){if(previous.event_id===factId('child.profile_set',body.profile))return previous;throw Error('profile_seed_already_confirmed');}
  return recordFact(db,'child.profile_set',body.profile);
 }).immediate();
}
