import type {ChartEvent} from '../eventTypes';
import {orderedFacts} from './projections';
/** A parent-set weekday applies after the ingestion date; printed dates are proposals only. */
export function projectTestSchedule(input:readonly ChartEvent[],assignmentId:string,through=Infinity){
 const facts=orderedFacts(input,through);
 const assignment=facts.find(e=>e.type==='assignment.ingested'&&e.payload.assignmentId===assignmentId);
 const changes=facts.filter(e=>e.type==='test_schedule.set');
 const usual=changes.filter(e=>e.payload.kind==='weekday').at(-1);
 const exception=changes.filter(e=>e.payload.kind==='assignment'&&e.payload.assignmentId===assignmentId).at(-1);
 const source=exception??usual;
 let testDate:string|null=null;
 if(assignment&&source){
  if(source.payload.kind==='assignment')testDate=source.payload.testDate as string|null;
  else if(typeof source.payload.weekday==='number'){
   const date=new Date(assignment.occurred_at.slice(0,10)+'T00:00:00.000Z');
   const offset=(source.payload.weekday-date.getUTCDay()+7)%7||7;
   date.setUTCDate(date.getUTCDate()+offset);testDate=date.toISOString().slice(0,10);
  }
 }
 return {assignmentId,testDate,scheduleFactId:source?.event_id??null,defaultWeekday:typeof usual?.payload.weekday==='number'?usual.payload.weekday:null,proposedDate:assignment?.payload.testDate as string|null??null};
}
