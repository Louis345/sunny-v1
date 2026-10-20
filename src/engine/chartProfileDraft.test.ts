import {expect,it} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openChart} from '../chart/db';import {exportEvents} from '../chart/exportEvents';
import {prepareProfileDraft,readProfileDraft,confirmProfileDraft} from '../chart/profileDraft';
it('prepares only permitted profile attributes without opening a chart or changing the source',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'profile-draft-'));const source=path.join(root,'legacy.json'),chartDir=path.join(root,'charts');
 const raw=JSON.stringify({childId:'synthetic-profile',displayName:'Sam',bondPatterns:{topics:['puzzles'],topicFrequency:{puzzles:999}},companion:{companionId:'elli'},supportNeeds:['large text'],readingProfile:{currentReadingLevel:'parent review needed',averageReadingAccuracy:99},wordBank:['SECRET'],sessionNotes:['SECRET'],xp:9000});fs.writeFileSync(source,raw);
 try{const draft=prepareProfileDraft(source,'synthetic-profile',{chartDir});
 expect(draft.profile).toEqual({displayName:'Sam',interests:['puzzles'],companion:'elli',supportNeeds:['large text'],readingLevel:'parent review needed'});
 expect(JSON.stringify(draft)).not.toContain('SECRET');expect(fs.readFileSync(source,'utf8')).toBe(raw);expect(fs.existsSync(path.join(chartDir,'synthetic-profile.db'))).toBe(false);
 expect(prepareProfileDraft(source,'synthetic-profile',{chartDir})).toEqual(draft);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
it('writes one parent-confirmed profile and no other legacy evidence, with retry safety',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'profile-confirm-'));const source=path.join(root,'legacy.json');fs.writeFileSync(source,JSON.stringify({childId:'synthetic-profile',displayName:'Sam',interests:['puzzles']}));
 const draft=prepareProfileDraft(source,'synthetic-profile',{chartDir:root});const db=openChart('synthetic-profile',{chartDir:root});
 try{expect(readProfileDraft(db)).toEqual(draft);expect(exportEvents(db)).toEqual([]);
 expect(()=>confirmProfileDraft(db,{draftId:draft.draftId,profile:draft.profile,confirmed:false})).toThrow();
 const input={draftId:draft.draftId,profile:{...draft.profile,interests:['mazes']},confirmed:true};
 expect(()=>confirmProfileDraft(db,{...input,extra:'not allowed'})).toThrow();
 const saved=confirmProfileDraft(db,input);expect(confirmProfileDraft(db,input).event_id).toBe(saved.event_id);
 expect(()=>confirmProfileDraft(db,{...input,profile:{displayName:'Changed'}})).toThrow('already_confirmed');
 expect(exportEvents(db)).toHaveLength(1);expect(saved.actor).toBe('parent');expect(saved.type).toBe('child.profile_set');expect(readProfileDraft(db)).toBe(null);
 }finally{db.close();fs.rmSync(root,{recursive:true,force:true});}
});
it('rejects a mismatched child and unknown confirmation fields',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'profile-mismatch-'));const source=path.join(root,'legacy.json');fs.writeFileSync(source,JSON.stringify({childId:'another-child',displayName:'Sam'}));
 try{expect(()=>prepareProfileDraft(source,'synthetic-profile',{chartDir:root})).toThrow('child_mismatch');}finally{fs.rmSync(root,{recursive:true,force:true});}
});
