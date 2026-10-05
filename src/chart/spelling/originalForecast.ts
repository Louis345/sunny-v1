import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {openChart,type ChartDatabase} from '../db';
import {getChildChart} from '../../profiles/childChart';
import {shouldPersistSessionData} from '../../utils/runtimeMode';
import {readPlannerToolReceipt} from '../../engine/plannerTransport';
import {exportEvents} from '../exportEvents';
import {buildPlannerPacket,projectAssignment} from './projections';
import {projectTestSchedule} from './schedule';
import {schemas} from './schemas';
import {recordForecast} from './record';
import {checkpointedAttempt,isCheckpointAttemptActive} from './checkpointedAttempt';
import {spellingPlanner} from './provider';
import type {SpellingProvider,SpellingPacket} from './journey';
const baseFor=(db:ChartDatabase,id:string)=>path.join(path.dirname(db.path),db.childId,'requests',createHash('sha256').update(`${id}:original-forecast`).digest('hex'));
export function originalForecastStatus(db:ChartDatabase,id:string){
 const base=baseFor(db,id),dir=path.dirname(base),prefix=path.basename(base);
 const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.startsWith(prefix+'.')):[];
 return {pending:isCheckpointAttemptActive(base),attempted:files.some(f=>f.endsWith('.request.json')),needsAttention:files.some(f=>f.endsWith('.error.json'))};
}
/** Original checkpoint uses the same chart doorway, receipt transport and fact validation, without inventing a plan. */
export async function forecastOriginalSpelling(db:ChartDatabase,id:string,provider:SpellingProvider,recover=false){
 const chart=getChildChart(db.childId,{department:'spelling',database:db});
 const view=projectAssignment(chart.events,id);
 if(view.forecast)return view.forecast;
 if(view.schoolResult)throw Error('forecast_after_result');
 if(!view.assignment || !view.recallChecks.length)throw Error('forecast_recall_required');
 const status=originalForecastStatus(db,id);
 if(recover&&!status.attempted)throw Error('forecast_recovery_not_started');
 if(status.needsAttention&&!recover)throw Error('forecast_needs_attention');
 const schedule=projectTestSchedule(chart.events,id);
 const packet:SpellingPacket={...buildPlannerPacket(chart.events,id),profile:chart.profile,schedule};
 // The captured document date is a proposal, never the forecast's confirmed schedule.
 packet.assignment.assignment={...view.assignment,testDate:schedule.testDate};
 const base=baseFor(db,id);
 return checkpointedAttempt(base,{packet,stage:'forecast',model:provider.modelId??'injected-fixture'},()=>provider('forecast',packet),(raw,metadata)=>{
  let proposal=readPlannerToolReceipt(raw,'submit_spelling_proposal');
  if(typeof proposal==='string')proposal=JSON.parse(proposal.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
  const request=metadata as {packet:SpellingPacket};
  return db.sql.transaction(()=>{
   if(Math.max(0,...exportEvents(db).map(e=>e.sequence))!==request.packet.asOfSequence)throw Error('planner_stale_chart');
   const p=schemas['readiness.forecast'].parse(proposal);
   if(p.assignmentId!==id)throw Error('forecast_assignment');
   const frozen=request.packet.schedule!;
   return recordForecast(db,{...p,scheduledTestDate:frozen.testDate,scheduleFactId:frozen.scheduleFactId},{cites:[...p.responseIds,...(frozen.scheduleFactId?[frozen.scheduleFactId]:[])]});
  }).immediate();
 },recover);
}
export async function runOriginalSpellingForecast(child:string,id:string,recover=false,provider:SpellingProvider=spellingPlanner){
 if(!process.env.SUNNY_CHART_DIR?.trim()||!shouldPersistSessionData()||process.env.SUNNY_CERTIFICATION_RUN_ID)return;
 const db=openChart(child);
 try{return await forecastOriginalSpelling(db,id,provider,recover);}finally{db.close();}
}
