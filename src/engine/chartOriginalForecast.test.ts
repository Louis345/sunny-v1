import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {openChart,type ChartDatabase} from '../chart/db';import {recordAssignment,recordFact,recordPresentation,recordResponse} from '../chart/spelling/record';import {exportEvents} from '../chart/exportEvents';
import {forecastOriginalSpelling} from '../chart/spelling/originalForecast';
let root:string,db:ChartDatabase;
beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'original-forecast-'));db=openChart('synthetic-forecast',{chartDir:root});recordAssignment(db,{assignmentId:'a',words:['knee'],testDate:null,sourcePhotoHash:'a'.repeat(64)});const item=recordPresentation(db,{assignmentId:'a',sessionId:'s',itemId:'i',word:'knee',acceptedForms:['knee'],instrument:'recall_check',role:'measure',protocolVersion:1,shown:{lettersVisible:false,hint:false,companionHelp:false}});recordResponse(db,{assignmentId:'a',sessionId:'s',itemId:'i',attempt:1,rawResponse:'knee',status:'answered',support:{audioReplays:0,spellingShown:false,hint:false,companionHelp:false}},{cites:[item.event_id]});});
afterEach(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});
const provider=()=>vi.fn(async(_stage:any,packet:any)=>({assignmentId:'a',probabilities:[{word:'knee',pCorrect:.7}],uncertainty:'Immediate recall only',missingEvidence:[],responseIds:packet.assignment.recallChecks.map((r:any)=>r.eventId)}));
it('forecasts without a replacement-app plan, freezes parent schedule citation and does not call again',async()=>{
 const schedule=recordFact(db,'test_schedule.set',{changeId:'one',kind:'assignment',assignmentId:'a',testDate:'2026-10-09'});
 const model=provider();await forecastOriginalSpelling(db,'a',model);await forecastOriginalSpelling(db,'a',model);
 expect(model).toHaveBeenCalledTimes(1);const forecast=exportEvents(db).find(e=>e.type==='readiness.forecast')!;
 expect(forecast.payload).toMatchObject({scheduledTestDate:'2026-10-09',scheduleFactId:schedule.event_id});expect(forecast.cites).toContain(schedule.event_id);
 expect(exportEvents(db).some(e=>e.type==='plan.decided')).toBe(false);
});
it('retains missing schedule and requires explicit recovery after provider failure',async()=>{
 const model=provider().mockRejectedValueOnce(Error('fixture failure'));
 await expect(forecastOriginalSpelling(db,'a',model)).rejects.toThrow('fixture failure');
 await expect(forecastOriginalSpelling(db,'a',model)).rejects.toThrow();expect(model).toHaveBeenCalledTimes(1);
 await forecastOriginalSpelling(db,'a',model,true);expect(model).toHaveBeenCalledTimes(2);
 expect(exportEvents(db).find(e=>e.type==='readiness.forecast')?.payload).toMatchObject({scheduledTestDate:null,scheduleFactId:null});
});
it('rejects forged schedule provenance and rejects forecasts after actual school results',async()=>{
 const response=exportEvents(db).find(e=>e.type==='response.observed')!;
 const base={assignmentId:'a',probabilities:[{word:'knee',pCorrect:.7}],uncertainty:'Unknown retention',missingEvidence:[],responseIds:[response.event_id]};
 expect(()=>recordFact(db,'readiness.forecast',{...base,scheduledTestDate:'2026-10-09',scheduleFactId:null},{cites:[response.event_id]})).toThrow('forecast_schedule');
 recordFact(db,'school_test.recorded',{assignmentId:'a',testDate:'2026-10-09',photoHash:'b'.repeat(64),results:[{word:'knee',correct:true,writtenResponse:'knee'}]});
 const model=provider();await expect(forecastOriginalSpelling(db,'a',model)).rejects.toThrow('forecast_after_result');expect(model).not.toHaveBeenCalled();
});
it('reports a running forecast as pending while preserving one provider request',async()=>{
 const {originalForecastStatus}=await import('../chart/spelling/originalForecast');
 let release!:()=>void;const held=new Promise<void>(r=>{release=r;});
 const model=vi.fn(async(stage:any,packet:any)=>{await held;return provider()(stage,packet);});
 const work=forecastOriginalSpelling(db,'a',model);
 const during=originalForecastStatus(db,'a');
 release();await work;expect(during).toMatchObject({pending:true});expect(originalForecastStatus(db,'a')).toMatchObject({pending:false});
});

// 2026-11-01 Ila's Teaching check: the Planner cited her Discovery answers beside her recall checks, the rule
// refused the whole forecast (a paid answer thrown away, issue #41), and that one failure then stopped every
// later forecast on the homework. The human saw the error line; the board never showed it.
const answer=(itemId:string,instrument:string,rawResponse:string)=>{const shown=recordPresentation(db,{assignmentId:'a',sessionId:'s',itemId,word:'knee',acceptedForms:['knee'],instrument,role:'measure',protocolVersion:1,shown:{lettersVisible:false,hint:false,companionHelp:false}} as never);return recordResponse(db,{assignmentId:'a',sessionId:'s',itemId,attempt:1,rawResponse,status:'answered',support:{audioReplays:0,spellingShown:false,hint:false,companionHelp:false}} as never,{cites:[shown.event_id]}).event_id;};
it('keeps only the recall checks a forecast cites, so a good answer is not thrown away',async()=>{
 const discovery=answer('d1','discovery','nee');
 const model=vi.fn(async(_stage:any,packet:any)=>({assignmentId:'a',probabilities:[{word:'knee',pCorrect:.7}],uncertainty:'Immediate recall only',missingEvidence:[],responseIds:[discovery,...packet.assignment.recallChecks.map((row:any)=>row.eventId)]}));
 await forecastOriginalSpelling(db,'a',model);
 const forecast=exportEvents(db).find(e=>e.type==='readiness.forecast')!;
 expect((forecast.payload as {responseIds:string[]}).responseIds).not.toContain(discovery);
 expect((forecast.payload as {responseIds:string[]}).responseIds.length).toBeGreaterThan(0);
});
it('lets a later recall check try again after a failure, without buying a call for the same evidence',async()=>{
 const model=provider().mockRejectedValueOnce(Error('fixture failure'));
 await expect(forecastOriginalSpelling(db,'a',model)).rejects.toThrow('fixture failure');
 await expect(forecastOriginalSpelling(db,'a',model)).rejects.toThrow('forecast_needs_attention');
 expect(model).toHaveBeenCalledTimes(1);
 answer('later','recall_check','knee');
 await forecastOriginalSpelling(db,'a',model);
 expect(model).toHaveBeenCalledTimes(2);
 expect(exportEvents(db).some(e=>e.type==='readiness.forecast')).toBe(true);
});
