import type {ChartDatabase} from '../db';
import {decodeRow} from '../exportEvents';
import {eventId} from '../eventId';
import {factId,type Payloads} from './schemas';
import {recordPresentation,recordResponse} from './record';

type Presentation = Pick<Payloads['item.presented'],'assignmentId'|'sessionId'|'word'|'instrument'|'shown'> & {nodeId:string;launchId:string;sourceItemId:string};
/** Caller supplies the validated server launch and frozen contract, never a game label. */
export function presentOriginalSpellingItem(db:ChartDatabase,input:Presentation){
 const {nodeId,launchId,sourceItemId, ...item}=input;
 return recordPresentation(db,{...item,itemId:eventId('original-spelling-item',[input.sessionId,launchId,sourceItemId]),acceptedForms:[item.word],role:item.instrument==='practice'?'practice':'measure',protocolVersion:1,provenance:{nodeId,launchId,sourceItemId}});
}

type Response = Omit<Payloads['response.observed'],'attempt'|'sourceResponseId'> & {sourceResponseId:string};
/** Missing presentations fail; the adapter never invents presentation/exposure after an answer. */
export function recordOriginalSpellingResponse(db:ChartDatabase,input:Response){
 return db.sql.transaction(()=>{
  const row=db.sql.prepare("SELECT * FROM events WHERE event_id=?").get(factId('item.presented',input));
  if(!row)throw Error('chart_presentation_missing');
  const presentation=decodeRow(row);
  const previous=db.sql.prepare("SELECT * FROM events WHERE type='response.observed' AND json_extract(payload,'$.assignmentId')=? AND json_extract(payload,'$.sessionId')=? AND json_extract(payload,'$.sourceResponseId')=? LIMIT 1").get(input.assignmentId,input.sessionId,input.sourceResponseId);
  const old=previous ? decodeRow(previous).payload : undefined;
  if(old && old.itemId!==input.itemId)throw Error('chart_response_identity_conflict');
  const count=db.sql.prepare("SELECT count(*) AS n FROM events WHERE type='response.observed' AND json_extract(payload,'$.sessionId')=? AND json_extract(payload,'$.itemId')=?").get(input.sessionId,input.itemId) as {n:number};
  return recordResponse(db,{...input,attempt:old ? Number(old.attempt) : count.n+1},{cites:[presentation.event_id]});
 }).immediate();
}
