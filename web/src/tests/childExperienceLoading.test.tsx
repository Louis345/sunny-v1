import {render,renderHook,act,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {useChildExperiencePacket} from '../hooks/useChildExperiencePacket';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('never reports a missing board before its first request has settled',async()=>{
  let finish!:(value:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;})));
  const seen:Array<{loading:boolean;error:string|null}>=[];
  function Probe(){const state=useChildExperiencePacket('ila',true);seen.push(state);return null;}
  render(<Probe/>);
  expect(seen.every(state=>state.loading&&state.error===null)).toBe(true);
  await act(async()=>{finish(new Response('{}',{status:404}));});
  expect(seen.at(-1)).toMatchObject({loading:false,error:'child_experience_404'});
});
it('does not expose the previous child packet during a child switch',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({childId:'ila'}))));
  const seen:Array<{loading:boolean;packet:unknown}>=[];
  function Probe({child}:{child:string}){const state=useChildExperiencePacket(child,true);seen.push(state);return null;}
  const view=render(<Probe child="ila"/>);await act(async()=>{});
  vi.mocked(fetch).mockImplementation(()=>new Promise(()=>{}));seen.length=0;
  view.rerender(<Probe child="reina"/>);
  expect(seen.every(state=>state.loading&&state.packet===null)).toBe(true);
});
it('keeps the last valid board during a temporary refresh failure and can recover',async()=>{
  const packet={childId:'ila',activeSessionPlan:{activeHomeworkId:'hw-1'}};
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(packet))).mockResolvedValueOnce(new Response('{}',{status:503})).mockResolvedValueOnce(new Response(JSON.stringify({...packet,revision:2}))));
  const {result}=renderHook(()=>useChildExperiencePacket('ila',true));
  await act(async()=>{});
  await act(async()=>{await result.current.refreshPacket();});
  expect(result.current.packet).toEqual(packet);
  expect(result.current.error).toBe('child_experience_503');
  await act(async()=>{await result.current.refreshPacket();});
  expect(result.current.packet).toMatchObject({revision:2});
  expect(result.current.error).toBeNull();
});
