import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {it,expect,vi} from 'vitest';
import {openChart} from '../chart/db';import {exportEvents} from '../chart/exportEvents';
import {buildSpellingRecallItems,createSpellingDiscoveryCycle} from './learningCycleIngest';
import {getLearningCycle,transitionLearningCycle} from './learningCycleRepository';
import {prepareExistingOriginalSpelling} from '../chart/spelling/originalPreparation';
it('prepares the existing unobserved list without changing its original cycle, date or observations',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'original-preparation-'));const db=openChart('synthetic-prepare',{chartDir:path.join(root,'charts')});
 const identity={childId:'synthetic-prepare',homeworkId:'existing'};
 const items=buildSpellingRecallItems({homeworkId:'existing',words:['night','light'],evidenceIds:['source:fixture'],measurementRole:'fresh_checkpoint'});
 createSpellingDiscoveryCycle({...identity,title:'Words',contentFingerprint:'a'.repeat(64),items},{rootDir:root});
 const before=JSON.stringify(getLearningCycle(identity.childId,identity.homeworkId,{rootDir:root}));
 const provider=vi.fn(async(stage:any,packet:any)=>{expect(stage).toBe('prior');const a=packet.assignment.assignment;return {tags:{assignmentId:a.assignmentId,taxonomyVersion:1,tags:a.words.map((word:string)=>({word,patterns:['spelling.irregular']}))},priors:a.words.map((word:string)=>({assignmentId:a.assignmentId,word,pCorrect:.5,confidence:.2,expectedError:'unknown'}))};});
 try{
  await prepareExistingOriginalSpelling(db,'existing',provider,{rootDir:root});await prepareExistingOriginalSpelling(db,'existing',provider,{rootDir:root});
  expect(provider).toHaveBeenCalledTimes(1);expect(JSON.stringify(getLearningCycle(identity.childId,identity.homeworkId,{rootDir:root}))).toBe(before);
  expect(exportEvents(db).map(e=>e.type)).toEqual(['assignment.ingested','words.tagged','prediction.prior','prediction.prior']);
  expect(exportEvents(db)[0].payload).toMatchObject({testDate:null,sourcePhotoHash:'a'.repeat(64),words:['night','light']});
 }finally{db.close();fs.rmSync(root,{recursive:true,force:true});}
});
it('refuses an active original session before calling the provider or creating chart history',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'original-preparation-'));const db=openChart('synthetic-prepare',{chartDir:path.join(root,'charts')});
 const items=buildSpellingRecallItems({homeworkId:'active',words:['night'],evidenceIds:['source:fixture'],measurementRole:'fresh_checkpoint'});
 createSpellingDiscoveryCycle({childId:db.childId,homeworkId:'active',title:'Words',contentFingerprint:'a'.repeat(64),items},{rootDir:root});
 transitionLearningCycle(db.childId,'active',getLearningCycle(db.childId,'active',{rootDir:root})!.revision,{type:'evaluation_started',evaluationId:'active:discovery'},{rootDir:root});
 const provider=vi.fn();
 try{await expect(prepareExistingOriginalSpelling(db,'active',provider,{rootDir:root})).rejects.toThrow('original_preparation_requires_unstarted_discovery');expect(provider).not.toHaveBeenCalled();expect(exportEvents(db)).toEqual([]);}finally{db.close();fs.rmSync(root,{recursive:true,force:true});}
});
