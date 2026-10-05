import {openChart,type ChartDatabase} from '../db';
import {shouldPersistSessionData} from '../../utils/runtimeMode';
import {decodeRow} from '../exportEvents';
import {eventId} from '../eventId';
import {factId,type Payloads} from './schemas';
import {recordPresentation,recordResponse,recordFact} from './record';

type Presentation = Pick<Payloads['item.presented'],'assignmentId'|'sessionId'|'word'|'instrument'|'shown'> & {nodeId:string;launchId:string;sourceItemId:string};
/** Caller supplies the validated server launch and frozen contract, never a game label. */
export function presentOriginalSpellingItem(db:ChartDatabase,input:Presentation){
 const {nodeId,launchId,sourceItemId, ...item}=input;
 if(Object.values(item.shown).some(value=>value===null))item.instrument='practice';
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

/** Low-level IO adapter shared by the original session and HTTP boundary. */
export function withOriginalSpellingChart<T>(childId:string,write:(db:ChartDatabase)=>T):T|undefined {
 if(!process.env.SUNNY_CHART_DIR?.trim() || !shouldPersistSessionData() || process.env.SUNNY_CERTIFICATION_RUN_ID)return undefined;
 const db=openChart(childId);
 try{return write(db);}catch(error){console.error(' 🎮 [spelling-chart] [write] [failed]',error);throw error;}finally{db.close();}
}

/** Engagement cites an already-presented item and never supplies academic outcomes. */
export function recordPresentedEngagement(db:ChartDatabase,input:Pick<Payloads['engagement.observed'],'sessionId'|'observationId'|'metric'|'value'> & {itemId:string}) {
 const row=db.sql.prepare('SELECT * FROM events WHERE event_id=?').get(factId('item.presented',input));
 if(!row)throw Error('chart_engagement_presentation_missing');
 const presentation=decodeRow(row);const p=presentation.payload as Payloads['item.presented'];
 if(!p.provenance)throw Error('chart_engagement_launch_missing');
 return recordFact(db,'engagement.observed',{...input,assignmentId:p.assignmentId,nodeId:p.provenance.nodeId},{actor:'system',cites:[presentation.event_id]});
}
