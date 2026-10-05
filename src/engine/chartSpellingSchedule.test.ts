import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {openChart,type ChartDatabase} from '../chart/db';import {recordAssignment,recordFact} from '../chart/spelling/record';import {exportEvents} from '../chart/exportEvents';
import {projectTestSchedule} from '../chart/spelling/schedule';
let root:string,db:ChartDatabase;
beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'spelling-schedule-'));db=openChart('synthetic-schedule',{chartDir:root});recordAssignment(db,{assignmentId:'a',words:['knee'],testDate:'2026-10-08',sourcePhotoHash:'a'.repeat(64)},{occurred_at:'2026-10-02T12:00:00.000Z'});});
afterEach(()=>{db?.close();fs.rmSync(root,{recursive:true,force:true});});
it('keeps printed dates proposals until parent acts and resolves default then exception with cited provenance',()=>{
 expect(projectTestSchedule(exportEvents(db),'a')).toMatchObject({testDate:null,scheduleFactId:null,proposedDate:'2026-10-08'});
 const weekday=recordFact(db,'test_schedule.set',{changeId:'one',kind:'weekday',weekday:5});
 expect(projectTestSchedule(exportEvents(db),'a')).toMatchObject({testDate:'2026-10-09',scheduleFactId:weekday.event_id});
 const exception=recordFact(db,'test_schedule.set',{changeId:'two',kind:'assignment',assignmentId:'a',testDate:'2026-10-08'});
 recordFact(db,'test_schedule.set',{changeId:'three',kind:'weekday',weekday:1});
 expect(projectTestSchedule(exportEvents(db),'a')).toMatchObject({testDate:'2026-10-08',scheduleFactId:exception.event_id});
 const cleared=recordFact(db,'test_schedule.set',{changeId:'four',kind:'assignment',assignmentId:'a',testDate:null});
 expect(projectTestSchedule(exportEvents(db),'a')).toMatchObject({testDate:null,scheduleFactId:cleared.event_id});
});
it('rejects nonparent actors, invalid weekday, extra fields and nonexistent assignment',()=>{
 expect(()=>recordFact(db,'test_schedule.set',{changeId:'a',kind:'weekday',weekday:5},{actor:'planner'})).toThrow();
 expect(()=>recordFact(db,'test_schedule.set',{changeId:'extra',kind:'weekday',weekday:5,untrusted:true} as any)).toThrow();
 expect(()=>recordFact(db,'test_schedule.set',{changeId:'b',kind:'weekday',weekday:7})).toThrow();
 expect(()=>recordFact(db,'test_schedule.set',{changeId:'c',kind:'assignment',assignmentId:'missing',testDate:'2026-10-09'})).toThrow('assignment_missing');
});
