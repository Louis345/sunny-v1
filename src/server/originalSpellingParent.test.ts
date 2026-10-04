import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {openChart,type ChartDatabase} from '../chart/db';
import {recordAssignment} from '../chart/spelling/record';
import {exportEvents} from '../chart/exportEvents';
import {setupOriginalSpellingParentRoutes,spellingParentSnapshot} from './originalSpellingParent';
let root:string,db:ChartDatabase,server:ReturnType<ReturnType<typeof express>['listen']>,url:string;
beforeEach(async()=>{
 root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-parent-chart-'));db=openChart('synthetic-parent',{chartDir:root});
 recordAssignment(db,{assignmentId:'hw-1',words:['knee','know'],testDate:null,sourcePhotoHash:'a'.repeat(64)});
 const app=express();app.use(express.json());setupOriginalSpellingParentRoutes(app,child=>child==='synthetic-parent',(child,fn)=>fn(db));
 server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));url=`http://127.0.0.1:${(server.address() as any).port}/api/parent/spelling/synthetic-parent`;
});
afterEach(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));db?.close();fs.rmSync(root,{recursive:true,force:true});});
it('records parent-transcribed school outcomes without fabricating missing forecasts or requiring the deleted app plan',async()=>{
 const body={testDate:'2026-10-09',results:[{word:'knee',correct:true,writtenResponse:'knee'},{word:'know',correct:false,writtenResponse:'no'}],confirmed:true};
 const send=(b:unknown)=>fetch(url+'/assignments/hw-1/school',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
 expect((await send({...body,confirmed:false})).status).toBe(409);
 expect((await send(body)).status).toBe(200);expect((await send(body)).status).toBe(200);
 expect(exportEvents(db).filter(e=>e.type==='school_test.recorded')).toHaveLength(1);
 const snapshot=await fetch(url).then(r=>r.json()) as ReturnType<typeof spellingParentSnapshot>;
 expect(snapshot.assignments[0].schoolResult).toMatchObject({sourceKind:'parent_transcription',testDate:'2026-10-09'});
 expect(snapshot.report.weeks[0].forecast).toMatchObject({brier:null,coverage:{matched:0}});
 expect((await send({...body,results:[body.results[0]]})).status).toBe(409);
 expect((await fetch(url.replace('synthetic-parent','unknown'))).status).toBe(404);
});
it('writes parent schedule revisions and returns the effective assignment date',async()=>{
 const send=(body:unknown)=>fetch(url+'/schedule',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 expect((await send({changeId:'weekday-1',kind:'weekday',weekday:5,confirmed:true})).status).toBe(200);
 expect((await send({changeId:'override-1',kind:'assignment',assignmentId:'hw-1',testDate:'2026-10-12',confirmed:true})).status).toBe(200);
 const snapshot=await fetch(url).then(r=>r.json()) as ReturnType<typeof spellingParentSnapshot>;
 expect(snapshot.schedules[0]).toMatchObject({testDate:'2026-10-12',defaultWeekday:5});
 expect((await send({changeId:'bad',kind:'weekday',weekday:5,confirmed:false})).status).toBe(409);
});
it('returns activity limitations separately from spelling performance',async()=>{
 const {recordFact}=await import('../chart/spelling/record');
 recordFact(db,'activity.limited',{assignmentId:'hw-1',sessionId:'s',nodeId:'n',launchId:'l',sourceEventId:'choice',reason:'non_spelling_response',rawChoice:'kn',aggregateAccuracy:null});
 const snapshot=await fetch(url).then(r=>r.json()) as ReturnType<typeof spellingParentSnapshot>;
 expect(snapshot.limitations).toHaveLength(1);expect(snapshot.limitations[0]).toMatchObject({assignmentId:'hw-1',rawChoice:'kn'});
 expect(snapshot.assignments[0].coverage.eligible).toBe(0);
});
