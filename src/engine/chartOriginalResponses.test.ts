import {it,expect} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openChart} from '../chart/db';
import {recordAssignment} from '../chart/spelling/record';
import {exportEvents} from '../chart/exportEvents';
import {projectAssignment} from '../chart/spelling/projections';
import {presentOriginalSpellingItem,recordOriginalSpellingResponse} from '../chart/spelling/originalResponses';
it('preserves launch identity, scores raw answers, isolates help, and retries without duplicate responses',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'original-response-'));const db=openChart('synthetic',{chartDir:root});
 try{
 recordAssignment(db,{assignmentId:'a',words:['night','light'],testDate:null,sourcePhotoHash:'a'.repeat(64)});
 const support={audioReplays:0,spellingShown:false,hint:false,companionHelp:false};
 const base={assignmentId:'a',sessionId:'s',nodeId:'actual-node',launchId:'launch',instrument:'discovery' as const,shown:{lettersVisible:false,hint:false,companionHelp:false}};
 const p=presentOriginalSpellingItem(db,{...base,sourceItemId:'one',word:'night'});
 expect(exportEvents(db).filter(e=>e.type==='response.observed')).toHaveLength(0);
 const input={assignmentId:'a',sessionId:'s',itemId:p.payload.itemId as string,sourceResponseId:'attempt-1',rawResponse:'nite',status:'answered' as const,support:{...support,companionHelp:true}};
 recordOriginalSpellingResponse(db,input);recordOriginalSpellingResponse(db,input);
 const q=presentOriginalSpellingItem(db,{...base,sourceItemId:'two',word:'light'});
 recordOriginalSpellingResponse(db,{...input,itemId:q.payload.itemId as string,sourceResponseId:'attempt-2',rawResponse:'light',support});
 expect(projectAssignment(exportEvents(db),'a').responses.map(r=>[r.result,r.assistance])).toEqual([['incorrect','assisted'],['correct','unassisted']]);
 expect(p.payload.provenance).toEqual({nodeId:'actual-node',launchId:'launch',sourceItemId:'one'});
 expect(()=>recordOriginalSpellingResponse(db,{...input,rawResponse:'night'})).toThrow('conflict');
 expect(()=>recordOriginalSpellingResponse(db,{...input,itemId:'missing',sourceResponseId:'missing'})).toThrow('presentation_missing');
 }finally{db.close();fs.rmSync(root,{recursive:true,force:true});}
});

it('cannot add invented launch provenance to a historical presentation through correction',async()=>{
 const {recordPresentation,recordCorrection}=await import('../chart/spelling/record');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'original-provenance-'));const db=openChart('synthetic',{chartDir:root});
 try{
 recordAssignment(db,{assignmentId:'a',words:['night'],testDate:null,sourcePhotoHash:'a'.repeat(64)});
 const p=recordPresentation(db,{assignmentId:'a',sessionId:'s',itemId:'old',word:'night',acceptedForms:['night'],instrument:'practice',role:'practice',protocolVersion:1,shown:{lettersVisible:true,hint:false,companionHelp:false}});
 expect(()=>recordCorrection(db,{target_event_id:p.event_id,reason:'invent launch',replacement_payload:{...p.payload,provenance:{nodeId:'invented',launchId:'invented',sourceItemId:'old'}}},{cites:[p.event_id]})).toThrow('correction_identity');
 }finally{db.close();fs.rmSync(root,{recursive:true,force:true});}
});
