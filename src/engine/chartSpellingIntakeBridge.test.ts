import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openChart} from '../chart/db';
import {exportEvents} from '../chart/exportEvents';
import {prepareSpellingChartAssignment} from '../chart/spelling/intakeBridge';
it('records the existing assignment once and registers priors before Discovery can publish',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'chart-intake-'));
 const db=openChart('synthetic-intake',{chartDir:root});
 const provider=vi.fn(async(stage,packet)=>{
  expect(stage).toBe('prior');expect(packet.assignment.assignment.words).toEqual(['night','light']);
  expect(packet.assignment.responses).toEqual([]);
  return {tags:{assignmentId:'hw-existing',taxonomyVersion:1,tags:['night','light'].map(word=>({word,patterns:['spelling.irregular']}))},priors:['night','light'].map(word=>({assignmentId:'hw-existing',word,pCorrect:0.6,confidence:0.4,expectedError:'unknown'}))};
 });
 try{
 const assignment={assignmentId:'hw-existing',words:['night','light'],testDate:null,sourcePhotoHash:'a'.repeat(64),sourceKind:'image' as const};
 await prepareSpellingChartAssignment(db,assignment,provider);
 await prepareSpellingChartAssignment(db,assignment,provider);
 expect(provider).toHaveBeenCalledTimes(1);
 expect(exportEvents(db).map(e=>e.type)).toEqual(['assignment.ingested','words.tagged','prediction.prior','prediction.prior']);
 await expect(prepareSpellingChartAssignment(db,{...assignment,words:['other']},provider)).rejects.toThrow('conflict');
 }finally{db.close();fs.rmSync(root,{recursive:true,force:true});}
});
it('propagates Planner failure and preserves the captured assignment without invented priors',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'chart-intake-'));const db=openChart('synthetic-intake',{chartDir:root});
 try{
 await expect(prepareSpellingChartAssignment(db,{assignmentId:'failed',words:['night'],testDate:null,sourcePhotoHash:'b'.repeat(64)},async()=>{throw Error('recorded_failure');})).rejects.toThrow('recorded_failure');
 expect(exportEvents(db).map(e=>e.type)).toEqual(['assignment.ingested']);
 }finally{db.close();fs.rmSync(root,{recursive:true,force:true});}
});
