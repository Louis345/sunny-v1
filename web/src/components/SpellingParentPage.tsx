import {useCallback,useEffect,useState} from 'react';
import type {buildReportCard,projectAssignment} from '../../../src/chart/spelling/projections';
type Snapshot={assignments:ReturnType<typeof projectAssignment>[];report:ReturnType<typeof buildReportCard>;draft:null|{draftId:string;profile:{displayName:string;interests?:string[];supportNeeds?:string[];companion?:string;readingLevel?:string}}};
async function request<T>(url:string,body?:unknown):Promise<T>{
 const response=await fetch(url,body===undefined?undefined:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const value=await response.json();if(!response.ok)throw Error(value.error??'Request failed');return value;
}
export function SpellingParentPage({childId}:{childId:string}){
 const base=`/api/parent/spelling/${encodeURIComponent(childId)}`;
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(()=>request<Snapshot>(base).then(setData),[base]);
 useEffect(()=>{void load().catch(e=>setError(String(e)));},[load]);
 const save=async(url:string,body:unknown)=>{setBusy(true);setError('');try{await request(url,body);await load();}catch(e){setError(String(e));}finally{setBusy(false);}};
 return <main style={{padding:24,maxWidth:960,margin:'auto',fontFamily:'system-ui',color:'#211a3c',background:'#fff',minHeight:'100vh'}}>
  <a href={`/parent/learning-report?child=${encodeURIComponent(childId)}`}>← Learning report</a><h1 style={{fontSize:28,fontWeight:700,margin:'16px 0'}}>Spelling report and school results</h1>
  {error&&<p role="alert">{error}</p>}{!data&&!error&&<p>Loading spelling chart…</p>}
  {data?.draft&&<section><h2>Confirm profile</h2><p>{data.draft.profile.displayName}</p><p>Interests: {data.draft.profile.interests?.join(', ')||'Not provided'}</p><p>Support needs: {data.draft.profile.supportNeeds?.join(', ')||'Not provided'}</p><p>Companion: {data.draft.profile.companion||'Not provided'} · Reading level: {data.draft.profile.readingLevel||'Not provided'}</p><button disabled={busy} onClick={()=>{void save(base+'/profile/confirm',{draftId:data.draft!.draftId,profile:data.draft!.profile,confirmed:true});}}>Confirm this profile</button></section>}
  {data?.assignments.length===0&&<p>No spelling assignments recorded in the chart.</p>}
  {data?.assignments.map(assignment=><SchoolAssignment key={assignment.assignmentId} assignment={assignment} week={data.report.weeks.find(w=>w.assignmentId===assignment.assignmentId)} busy={busy} save={body=>save(base+`/assignments/${encodeURIComponent(assignment.assignmentId)}/school`,body)}/>)}
  {!!data?.report.patternHistory.length&&<section><h2>Pattern history</h2><table style={{borderCollapse:'separate',borderSpacing:'12px 8px',textAlign:'left'}}><thead><tr><th>Pattern</th><th>Word</th><th>Independent readings</th><th>School mark</th></tr></thead><tbody>{data.report.patternHistory.map(row=><tr key={row.assignmentId+row.word+row.pattern}><td>{row.pattern}</td><td>{row.word}</td><td>{row.readings.length}</td><td>{row.schoolResult?(row.schoolResult.result?.correct?'Correct':'Incorrect'):'Not entered'}</td></tr>)}</tbody></table></section>}
 </main>;
}
function SchoolAssignment({assignment:a,week,busy,save}:{assignment:Snapshot['assignments'][number];week:Snapshot['report']['weeks'][number]|undefined;busy:boolean;save:(body:unknown)=>Promise<void>}){
 const [date,setDate]=useState(''),[marks,setMarks]=useState<Record<string,string>>({}),[confirmed,setConfirmed]=useState(false);
 const words=a.assignment?.words??[];
 return <section style={{borderTop:'1px solid #ddd',padding:'20px 0'}}><h2>{words.join(', ')}</h2>
  <p>Discovery coverage: {a.coverage.discovery}/{a.coverage.assigned}. Independent readings: {a.coverage.eligible}. Recall checks: {a.coverage.recall}.</p>
  <p>Prior prediction error: {week?.prior.brier==null?'Not enough matched evidence':week.prior.brier.toFixed(3)} ({week?.prior.coverage.matched??0} matched words).</p>
  <p>{a.forecast?`Forecast error: ${week?.forecast.brier==null?'Awaiting matched school marks':week.forecast.brier.toFixed(3)}`:'No readiness forecast recorded'}</p>
  <p>Prediction error uses a 0–1 scale; lower is better. Missing evidence is not a zero error.</p>
  {a.schoolResult?<><h3>School results saved</h3><p>{a.schoolResult.testDate} · Parent transcription</p><ul>{a.schoolResult.results.map(r=><li key={r.word}>{r.word}: {r.correct?'Correct':'Incorrect'}</li>)}</ul></>:<form onSubmit={e=>{e.preventDefault();void save({testDate:date,confirmed,results:words.map(word=>({word,correct:marks[word]==='correct',writtenResponse:null}))});}}>
   <h3>Enter returned school results</h3><label>School test date <input type="date" aria-label="School test date" value={date} onChange={e=>setDate(e.target.value)}/></label>
   {words.map(word=><p key={word}><label>{word} <select aria-label={`Mark for ${word}`} value={marks[word]??''} onChange={e=>setMarks({...marks,[word]:e.target.value})}><option value="">Choose mark</option><option value="correct">Correct</option><option value="incorrect">Incorrect</option></select></label></p>)}
   <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I checked these marks against the returned school work</label><p><button disabled={busy||!date||!confirmed||words.some(w=>!marks[w])}>Save school results</button></p>
  </form>}
 </section>;
}
