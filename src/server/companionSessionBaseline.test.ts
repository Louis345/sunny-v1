import {describe,it,expect} from 'vitest';
import {buildCompanionSessionBaseline,renderCompanionSessionBaseline} from './companionSessionBaseline';
describe('human companion baseline',()=>{
 it('pairs response identities and reports missing coverage rather than synthetic zeros',()=>{
 const result=buildCompanionSessionBaseline([
 {ts:'2026-10-11T12:00:00Z',component:'companion_timing',action:'response_started',requestId:'a'},
 {ts:'2026-10-11T12:00:02Z',component:'client_audio',event:'playback_started',requestId:'a'},
 {ts:'2026-10-11T12:00:03Z',component:'client_audio',event:'playback_started',requestId:'a'},
 {component:'client_audio',event:'companion_speech_mute',muted:true},
 {component:'client_audio',event:'microphone_mute',muted:true},
 {component:'transcript',action:'ambient_ignored'}]);
 expect(result.playbackLatency).toEqual({samples:1,p50Ms:2000,p95Ms:2000});
 expect(result.companionMutes).toBe(1);expect(result.microphoneMutes).toBe(1);
 expect(renderCompanionSessionBaseline(result)).toContain('Deepgram delay: not measured');
 expect(buildCompanionSessionBaseline([]).playbackLatency.samples).toBe(0);
 });
});

it('writes human and machine baseline when a session finalizes, without changing raw events', async()=>{
 const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');
 const {SessionDebugRecorder}=await import('./session-debug-recorder');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-baseline-'));
 try {
 const recorder=new SessionDebugRecorder({rootDir:root,sessionId:'sandbox',childName:'sandbox',subject:'spelling',mode:'test'});
 recorder.recordEvent('client_audio','status',{event:'companion_speech_mute',muted:true,phase:'build'});
 const raw=fs.readFileSync(path.join(recorder.sessionDir,'events.ndjson'),'utf8');
 recorder.finalize({result:'stopped',finalState:{},artifacts:{}});
 expect(JSON.parse(fs.readFileSync(path.join(recorder.sessionDir,'companion-baseline.json'),'utf8')).companionMutes).toBe(1);
 expect(fs.readFileSync(path.join(recorder.sessionDir,'companion-baseline.md'),'utf8')).toContain('not measured');
 expect(fs.readFileSync(path.join(recorder.sessionDir,'events.ndjson'),'utf8')).toBe(raw);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
