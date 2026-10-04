import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {ChartDatabase} from '../chart/db';
import {eventId} from '../chart/eventId';
import {recordOriginalSpellingResponse,recordPresentedEngagement} from '../chart/spelling/originalResponses';
import {recordSpellingDiscoveryAttempt} from '../engine/learningCycleRuntime';

type Request = {launchToken?:string;attemptId:string;itemId:string;attemptedValue:string;observedAt:string;supportEventIds:string[];instrumentSignals:string[];skipped:boolean;sessionId:string};
type Prepared = {response:Parameters<typeof recordOriginalSpellingResponse>[1];legacy:Parameters<typeof recordSpellingDiscoveryAttempt>[0]};
/** Operational delivery receipt: preserves validated input, never invents observations on recovery. */
export function commitOriginalSpellingAttempt<T>(db:ChartDatabase,homeworkId:string,request:Request,prepare:()=>Prepared,writeLegacy:(input:Prepared['legacy'])=>T):T {
 const directory=path.join(path.dirname(db.path),db.childId,'original-discovery-delivery');
 const file=path.join(directory,eventId('original-delivery',[homeworkId,request.sessionId,request.attemptId])+'.json');
 // Explicit field order makes equivalent JSON deliveries compare identically.
 const identity=JSON.stringify([homeworkId,request.sessionId,request.attemptId,request.itemId,request.attemptedValue,request.observedAt,request.skipped,request.launchToken ?? null,request.supportEventIds,request.instrumentSignals]);
 if(!fs.existsSync(file)){
  const prepared=prepare();
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const temporary=path.join(directory,randomUUID()+'.tmp');
  const fd=fs.openSync(temporary,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify({version:1,identity,prepared}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  try{fs.linkSync(temporary,file);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}finally{fs.unlinkSync(temporary);}
  const directoryFd=fs.openSync(directory,'r');try{fs.fsyncSync(directoryFd);}finally{fs.closeSync(directoryFd);}
 }
 const receipt=JSON.parse(fs.readFileSync(file,'utf8')) as {version:number;identity:string;prepared:Prepared};
 if(receipt.version!==1 || receipt.identity!==identity)throw Error('original_attempt_receipt_conflict');
 recordOriginalSpellingResponse(db,receipt.prepared.response);
 if(receipt.prepared.response.status==='skipped')recordPresentedEngagement(db,{sessionId:receipt.prepared.response.sessionId,itemId:receipt.prepared.response.itemId,observationId:'skip:'+request.attemptId,metric:'skipped',value:1});
 const result=writeLegacy(receipt.prepared.legacy);
 console.log(' 🎮 [spelling] [delivery] [committed] attempt='+request.attemptId);
 return result;
}

/** Explicit parent recovery of frozen deliveries, including native answers whose live launch is gone. */
export function recoverOriginalSpellingDeliveries(db:ChartDatabase,homeworkId:string,writeLegacy:(input:Prepared['legacy'])=>unknown=recordSpellingDiscoveryAttempt){
 const directory=path.join(path.dirname(db.path),db.childId,'original-discovery-delivery');
 const files=fs.existsSync(directory)?fs.readdirSync(directory).filter(name=>name.endsWith('.json')):[];
 let recovered=0;
 for(const name of files){
  const receipt=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8')) as {version:number;identity:string;prepared:Prepared};
  if(receipt.version!==1||receipt.prepared.legacy.childId!==db.childId)throw Error('original_attempt_receipt_conflict');
  const [assignmentId,sessionId,attemptId,itemId,attemptedValue,observedAt,skipped,launchToken,supportEventIds,instrumentSignals]=JSON.parse(receipt.identity);
  if(assignmentId!==homeworkId)continue;
  if(receipt.prepared.legacy.homeworkId!==homeworkId||receipt.prepared.response.assignmentId!==homeworkId)throw Error('original_attempt_receipt_conflict');
  commitOriginalSpellingAttempt(db,homeworkId,{sessionId,attemptId,itemId,attemptedValue,observedAt,skipped,launchToken:launchToken??undefined,supportEventIds,instrumentSignals},()=>{throw Error('original_attempt_receipt_missing');},writeLegacy);
  recovered++;
 }
 console.log(` 🎮 [spelling] [delivery-recovery] [complete] assignment=${homeworkId} receipts=${recovered}`);
 return {recovered};
}
