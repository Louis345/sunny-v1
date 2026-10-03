import {useEffect,useState} from 'react';
type Profile={displayName:string;interests?:string[];supportNeeds?:string[];companion?:string;readingLevel?:string};
type State={draft:{draftId:string;profile:Profile}|null;profile:Profile|null};
export function ProfileSetup({child,request}:{child:string;request:<T>(url:string,body?:unknown)=>Promise<T>}){
 const [state,setState]=useState<State|null>(null),[profile,setProfile]=useState<Profile>({displayName:child});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const base=`/api/spelling/${encodeURIComponent(child)}`;
 useEffect(()=>{let alive=true;request<State>(base+'/profile-draft').then(s=>{if(alive){setState(s);setProfile(s.draft?.profile??s.profile??{displayName:child});}}).catch(e=>{console.error(' 🎮 [profile-ui] [load] [failed]',e);if(alive)setError('Profile details could not load. Reopen the parent area to retry.');});return()=>{alive=false;};},[base,child,request]);
 if(!state)return <section className="spelling-card"><p role="status">{error||'Loading profile details…'}</p></section>;
 if(state.profile)return <section className="spelling-card"><h2>Profile saved</h2><p>{state.profile.displayName} · {state.profile.interests?.join(', ')||'No interests added'}</p></section>;
 const set=(key:keyof Profile,value:string)=>setProfile(p=>({...p,[key]:key==='interests'||key==='supportNeeds'?value.split(','):value}));
 const save=()=>{
  if(busy)return;setBusy(true);setError('');
  const cleaned:Profile={displayName:profile.displayName.trim()};
  for(const key of ['interests','supportNeeds'] as const)if(profile[key])cleaned[key]=profile[key].map(s=>s.trim()).filter(Boolean);
  for(const key of ['companion','readingLevel'] as const)if(profile[key]?.trim())cleaned[key]=profile[key].trim();
  request(base+(state.draft?'/profile-draft/confirm':'/profile'),state.draft?{draftId:state.draft.draftId,profile:cleaned,confirmed:true}:cleaned)
   .then(()=>setState({draft:null,profile:cleaned})).catch(e=>{console.error(' 🎮 [profile-ui] [confirm] [failed]',e);setError('Profile could not save. Please try again.');}).finally(()=>setBusy(false));
 };
 return <section className="spelling-card"><h2>{state.draft?'Review profile details':'Help Sunny know your child'}</h2><p>{state.draft?'These details are a draft from the earlier profile. Edit or remove anything outdated, then confirm. No old scores or learning history are carried over.':'Add details you want Sunny to use when planning practice.'}</p><form onSubmit={e=>{e.preventDefault();save();}}>
  <label>Display name<input required value={profile.displayName} onChange={e=>set('displayName',e.target.value)}/></label>
  <label>Profile interests<input value={profile.interests?.join(',')??''} onChange={e=>set('interests',e.target.value)}/></label>
  <label>Support needs<input value={profile.supportNeeds?.join(',')??''} onChange={e=>set('supportNeeds',e.target.value)}/></label>
  <label>Companion<input value={profile.companion??''} onChange={e=>set('companion',e.target.value)}/></label>
  <label>Reading level<input value={profile.readingLevel??''} onChange={e=>set('readingLevel',e.target.value)}/></label>
  {error&&<p role="alert">{error}</p>}<button disabled={busy}>{busy?'Saving…':'Confirm profile'}</button>
 </form></section>;
}
