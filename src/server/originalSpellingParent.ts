import {originalForecastStatus,runOriginalSpellingForecast} from '../chart/spelling/originalForecast';
import {projectTestSchedule} from '../chart/spelling/schedule';
import {createHash} from 'node:crypto';
import type {Express,Request} from 'express';
import {z} from 'zod';
import type {ChartDatabase} from '../chart/db';
import {exportEvents} from '../chart/exportEvents';
import {readProfileDraft,confirmProfileDraft} from '../chart/profileDraft';
import {buildReportCard,projectAssignment} from '../chart/spelling/projections';
import {recordSchoolTest,recordFact} from '../chart/spelling/record';
import {schemas} from '../chart/spelling/schemas';
import {withOriginalSpellingChart} from '../chart/spelling/originalResponses';
const schoolInput=schemas['school_test.recorded'].pick({testDate:true,results:true}).extend({confirmed:z.literal(true)});
export function spellingParentSnapshot(db:ChartDatabase){
 const events=exportEvents(db);
 return {limitations:events.filter(e=>e.type==='activity.limited').map(e=>e.payload),recovery:events.filter(e=>e.type==='assignment.ingested').map(e=>({assignmentId:String(e.payload.assignmentId),...originalForecastStatus(db,String(e.payload.assignmentId))})),schedules:events.filter(e=>e.type==='assignment.ingested').map(e=>projectTestSchedule(events,String(e.payload.assignmentId))),defaultWeekday:events.filter(e=>e.type==='test_schedule.set'&&e.payload.kind==='weekday').at(-1)?.payload.weekday??null,draft:readProfileDraft(db),assignments:events.filter(e=>e.type==='assignment.ingested').map(e=>projectAssignment(events,String(e.payload.assignmentId))),report:buildReportCard(events)};
}
/** Uses the original caregiver surface and its child registry, never opens the child-only replacement journey. */
export function setupOriginalSpellingParentRoutes(app:Express,validChild:(child:string)=>boolean,chart:typeof withOriginalSpellingChart=withOriginalSpellingChart,forecast:typeof runOriginalSpellingForecast=runOriginalSpellingForecast){
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
 app.post('/api/parent/spelling/:childId/assignments/:assignmentId/recover',(req,res)=>{
  const child=String(req.params.childId);
  if(!validChild(child)){res.status(404).json({error:'child_not_found'});return;}
  if(req.body?.acknowledge!==true){res.status(409).json({error:'recovery_acknowledgment_required'});return;}
  void forecast(child,String(req.params.assignmentId),true).then(result=>{
   if(!result){res.status(503).json({error:'Spelling chart is not connected'});return;}
   res.json({ok:true});
  }).catch(error=>{console.error(' 🎮 [spelling-parent] [recovery] [failed]',error);res.status(409).json({error:error instanceof Error?error.message:String(error)});});
 });
 route('get','',db=>spellingParentSnapshot(db));
 route('post','/schedule',(db,req)=>{
  const body=z.strictObject({confirmed:z.literal(true),schedule:schemas['test_schedule.set']}).parse({confirmed:req.body?.confirmed,schedule:Object.fromEntries(Object.entries(req.body??{}).filter(([key])=>key!=='confirmed'))});
  return recordFact(db,'test_schedule.set',body.schedule);
 });
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
