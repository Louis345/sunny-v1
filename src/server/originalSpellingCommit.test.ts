import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openChart} from '../chart/db';
import {recordAssignment} from '../chart/spelling/record';
import {presentOriginalSpellingItem} from '../chart/spelling/originalResponses';
import {exportEvents} from '../chart/exportEvents';
import {commitOriginalSpellingAttempt} from './originalSpellingCommit';
it('repairs a failed legacy write after restart using frozen support without a live session',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'original-recovery-'));
 const db=openChart('lab-child',{chartDir:dir});
 try{
 recordAssignment(db,{assignmentId:'a',words:['night'],testDate:null,sourcePhotoHash:'a'.repeat(64)});
 const p=presentOriginalSpellingItem(db,{assignmentId:'a',sessionId:'s',nodeId:'n',launchId:'l',sourceItemId:'i',word:'night',instrument:'discovery',shown:{lettersVisible:false,hint:false,companionHelp:false}});
 const request={attemptId:'r',itemId:'i',attemptedValue:'nite',observedAt:'2026-10-03T12:00:00Z',supportEventIds:['help'],instrumentSignals:[],skipped:false,sessionId:'s'};
 const prepare=vi.fn(()=>({response:{assignmentId:'a',sessionId:'s',itemId:String(p.payload.itemId),sourceResponseId:'r',rawResponse:'nite',status:'answered' as const,support:{audioReplays:1,spellingShown:false,hint:false,companionHelp:true}},legacy:{childId:'lab-child',homeworkId:'a',attempt:request,support:{status:'assisted' as const,scaffolds:['help']},artifactHash:'frozen',sessionId:'s',instrumentSignals:[]}}));
 const fail=vi.fn(()=>{throw Error('disk unavailable');});
 expect(()=>commitOriginalSpellingAttempt(db,'a',request,prepare,fail)).toThrow('disk unavailable');
 expect(exportEvents(db).filter(e=>e.type==='response.observed')).toHaveLength(1);
 db.close();const reopened=openChart('lab-child',{chartDir:dir});
 try{
 const missing=vi.fn(()=>{throw Error('live session gone');});const repaired=vi.fn(()=> 'repaired');
 expect(commitOriginalSpellingAttempt(reopened,'a',request,missing,repaired)).toBe('repaired');
 expect(missing).not.toHaveBeenCalled();expect(repaired).toHaveBeenCalledWith(prepare.mock.results[0].value.legacy);
 expect(exportEvents(reopened).filter(e=>e.type==='response.observed')).toHaveLength(1);
 expect(()=>commitOriginalSpellingAttempt(reopened,'a',{...request,attemptedValue:'night'},missing,repaired)).toThrow('original_attempt_receipt_conflict');
 expect(repaired).toHaveBeenCalledTimes(1);
 }finally{reopened.close();}
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
