import {createHash} from 'node:crypto';
import type {Express,Request} from 'express';
import {z} from 'zod';
import type {ChartDatabase} from '../chart/db';
import {exportEvents} from '../chart/exportEvents';
import {readProfileDraft,confirmProfileDraft} from '../chart/profileDraft';
import {buildReportCard,projectAssignment} from '../chart/spelling/projections';
import {recordSchoolTest} from '../chart/spelling/record';
import {schemas} from '../chart/spelling/schemas';
import {withOriginalSpellingChart} from '../chart/spelling/originalResponses';
const schoolInput=schemas['school_test.recorded'].pick({testDate:true,results:true}).extend({confirmed:z.literal(true)});
export function spellingParentSnapshot(db:ChartDatabase){
 const events=exportEvents(db);
 return {draft:readProfileDraft(db),assignments:events.filter(e=>e.type==='assignment.ingested').map(e=>projectAssignment(events,String(e.payload.assignmentId))),report:buildReportCard(events)};
}
/** Uses the original caregiver surface and its child registry, never opens the child-only replacement journey. */
export function setupOriginalSpellingParentRoutes(app:Express,validChild:(child:string)=>boolean,chart:typeof withOriginalSpellingChart=withOriginalSpellingChart){
 const route=(method:'get'|'post',suffix:string,run:(db:ChartDatabase,req:Request)=>unknown)=>{
  app[method]('/api/parent/spelling/:childId'+suffix,(req,res)=>{
   const child=String(req.params.childId);
   if(!validChild(child)){res.status(404).json({error:'child_not_found'});return;}
   try{
    const result=chart(child,db=>run(db,req));
    if(result===undefined){res.status(503).json({error:'Spelling chart is not connected'});return;}
    res.json(result);
   }catch(error){console.error(' 🎮 [spelling-parent] [request] [failed]',error);res.status(409).json({error:error instanceof Error?error.message:String(error)});}
  });
 };
 route('get','',db=>spellingParentSnapshot(db));
 route('post','/profile/confirm',(db,req)=>confirmProfileDraft(db,req.body));
 route('post','/assignments/:assignmentId/school',(db,req)=>{
  const input=schoolInput.parse(req.body);
  // Hash the confirmed transcription, never claim an image was attached.
  const {confirmed,...transcription}=input;
  const result=recordSchoolTest(db,{...transcription,assignmentId:String(req.params.assignmentId),sourceKind:'parent_transcription',photoHash:createHash('sha256').update(JSON.stringify(transcription)).digest('hex')});
  console.log(` 🎮 [spelling-parent] [school-results] [saved] child=${db.childId} event=${result.event_id}`);
  return {eventId:result.event_id};
 });
}
