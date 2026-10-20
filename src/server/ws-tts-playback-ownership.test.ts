import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
const fixtures=vi.hoisted(()=>({sockets:[] as any[]}));
vi.mock("../profiles/childChart",()=>({getChildChart:vi.fn()}));
vi.mock("ws",()=>({default:class extends EventEmitter {
  static OPEN=1; static CONNECTING=0;
  readyState=0; send=vi.fn();
  constructor(){super();fixtures.sockets.push(this);}
  close(){this.readyState=3;this.emit("close");}
  terminate(){this.close();}
}}));
import { WsTtsBridge } from "./ws-tts-bridge";
afterEach(()=>{vi.unstubAllEnvs();fixtures.sockets=[];});
describe("TTS socket and playback packet ownership",()=>{
  it("tags only the current socket's PCM and preserves the next connection through old callbacks",async()=>{
    vi.stubEnv("TTS_ENABLED","true");vi.stubEnv("ELEVENLABS_API_KEY","test-only");
    const browser:any={readyState:1,OPEN:1,send:vi.fn()};
    const bridge=new WsTtsBridge(browser,"test-voice");
    bridge.beginPlayback("old","either",true,true);
    const first=bridge.connect();
    const old=fixtures.sockets[0];old.readyState=1;old.emit("open");await first;
    old.emit("message",Buffer.from(JSON.stringify({audio:Buffer.from([1,0]).toString("base64"),isFinal:true})));
    bridge.beginPlayback("new","cheese",false,true);
    const next=bridge.connect();
    old.emit("message",Buffer.from(JSON.stringify({audio:"retired"})));
    old.emit("error",new Error("retired socket"));
    const current=fixtures.sockets[1];current.readyState=1;current.emit("open");await next;
    current.emit("message",Buffer.from(JSON.stringify({audio:Buffer.from([2,0]).toString("base64")})));
    const packets=browser.send.mock.calls.map(([message]:[string])=>JSON.parse(message));
    expect(packets.filter((packet:any)=>packet.type==="audio")).toEqual([
      expect.objectContaining({requestId:"old",itemId:"either",data:Buffer.from([1,0]).toString("base64")}),
      expect.objectContaining({requestId:"new",itemId:"cheese",data:Buffer.from([2,0]).toString("base64")}),
    ]);
    expect(packets.filter((packet:any)=>packet.type==="audio_start")).toEqual([
      expect.objectContaining({requestId:"old",source:"activity",requiresAudio:true}),
      expect.objectContaining({requestId:"new",source:"activity",requiresAudio:false}),
    ]);
    bridge.stop();
    expect(bridge.currentPlaybackIdentity()).toBeUndefined();
  });
});

it("reopens a primed stream at the AI-selected rate, preserving playback identity",async()=>{
 vi.stubEnv("ELEVENLABS_API_KEY","fixture");vi.stubEnv("TTS_ENABLED","true");
 const browser:any={readyState:1,OPEN:1,send:vi.fn()};const bridge=new WsTtsBridge(browser,"voice");
 bridge.beginPlayback("speech","current");
 const connected=bridge.connect();const first=fixtures.sockets.at(-1);first.readyState=1;first.emit("open");await connected;
 const rate=bridge.setSpeechRate(0.7);
 const second=fixtures.sockets.at(-1);
 expect(second).not.toBe(first);
 second.readyState=1;second.emit("open");await expect(rate).resolves.toEqual({speed:0.7});
 expect(bridge.currentPlaybackIdentity()).toEqual({requestId:"speech",itemId:"current"});
 expect(JSON.parse(second.send.mock.calls[0][0]).voice_settings.speed).toBe(0.7);
 bridge.sendText("Dissatisfied.");
 const packets=second.send.mock.calls.map(([m]:[string])=>JSON.parse(m));
 expect(packets.find((p:any)=>p.text.trim()==="Dissatisfied.").voice_settings).toBeUndefined();
 const unchanged=bridge.setSpeechRate(0.7);await expect(unchanged).resolves.toEqual({speed:0.7});
 expect(fixtures.sockets).toHaveLength(2);
 bridge.stop();bridge.beginPlayback("next","current");const next=bridge.connect();const third=fixtures.sockets.at(-1);third.readyState=1;third.emit("open");await next;
 expect(JSON.parse(third.send.mock.calls[0][0]).voice_settings.speed).toBe(0.7);
 bridge.close();
});

it("drains already submitted speech before applying a new rate without losing its owner",async()=>{
 vi.stubEnv("ELEVENLABS_API_KEY","fixture");vi.stubEnv("TTS_ENABLED","true");
 const bridge=new WsTtsBridge({readyState:1,send:vi.fn()} as any,"voice");bridge.beginPlayback("speech");
 const connected=bridge.connect();const first=fixtures.sockets.at(-1);first.readyState=1;first.emit("open");await connected;
 bridge.sendText("Existing speech.");const rate=bridge.setSpeechRate(0.8);
 expect(JSON.parse(first.send.mock.calls.at(-1)[0])).toEqual({text:""});
 expect(fixtures.sockets).toHaveLength(1);
 first.emit("message",Buffer.from(JSON.stringify({audio:Buffer.from([1,0]).toString("base64"),isFinal:true})));
 await new Promise(resolve=>setTimeout(resolve,0));
 const next=fixtures.sockets.at(-1);next.readyState=1;next.emit("open");await rate;
 expect(JSON.parse(next.send.mock.calls[0][0]).voice_settings.speed).toBe(0.8);
 expect(bridge.currentPlaybackIdentity()).toEqual({requestId:"speech"});bridge.close();
});

it("does not revive speech after barge-in; only the selected configuration remains",async()=>{
 vi.stubEnv("ELEVENLABS_API_KEY","fixture");vi.stubEnv("TTS_ENABLED","true");
 const bridge=new WsTtsBridge({readyState:1,send:vi.fn()} as any,"voice");bridge.beginPlayback("old");
 const connected=bridge.connect();const first=fixtures.sockets.at(-1);first.readyState=1;first.emit("open");await connected;
 bridge.sendText("Existing speech.");const rate=bridge.setSpeechRate(0.8);
 bridge.stop();
 await expect(rate).resolves.toEqual({speed:0.8});
 expect(fixtures.sockets).toHaveLength(1);expect(bridge.currentPlaybackIdentity()).toBeUndefined();
});

it("keeps delivered-audio proof across a rate reconnect",async()=>{
 vi.stubEnv("ELEVENLABS_API_KEY","fixture");vi.stubEnv("TTS_ENABLED","true");
 const bridge=new WsTtsBridge({readyState:1,send:vi.fn()} as any,"voice");bridge.beginPlayback("speech");
 const connected=bridge.connect();const first=fixtures.sockets.at(-1);first.readyState=1;first.emit("open");await connected;
 bridge.sendText("First sentence.");first.emit("message",Buffer.from(JSON.stringify({audio:Buffer.from([1,0]).toString("base64")})));
 const rate=bridge.setSpeechRate(0.7);first.emit("message",Buffer.from(JSON.stringify({isFinal:true})));
 await new Promise(resolve=>setTimeout(resolve,0));const second=fixtures.sockets.at(-1);second.readyState=1;second.emit("open");await rate;
 expect(bridge.hadAudioThisTurn()).toBe(true);bridge.close();
});
it("applies a concurrently selected rate to the next replay even while old speech drains",async()=>{
 vi.stubEnv("ELEVENLABS_API_KEY","fixture");vi.stubEnv("TTS_ENABLED","true");
 const bridge=new WsTtsBridge({readyState:1,send:vi.fn()} as any,"voice");bridge.beginPlayback("speech","item");
 const connected=bridge.connect();const first=fixtures.sockets.at(-1);first.readyState=1;first.emit("open");await connected;
 bridge.sendText("Here it comes.");const rate=bridge.setSpeechRate(0.7);
 bridge.beginPlayback("replay","item",true,true);const replay=bridge.connect();const next=fixtures.sockets.at(-1);next.readyState=1;next.emit("open");await replay;
 await expect(rate).resolves.toEqual({speed:0.7});
 expect(JSON.parse(next.send.mock.calls[0][0]).voice_settings.speed).toBe(0.7);bridge.close();
});
it("changes a connecting stream before initialization without losing buffered text",async()=>{
 vi.stubEnv("ELEVENLABS_API_KEY","fixture");vi.stubEnv("TTS_ENABLED","true");
 const bridge=new WsTtsBridge({readyState:1,send:vi.fn()} as any,"voice");const connected=bridge.connect();bridge.sendText("Buffered speech.");const rate=bridge.setSpeechRate(0.7);
 const ws=fixtures.sockets[0];ws.readyState=1;ws.emit("open");await connected;await expect(rate).resolves.toEqual({speed:0.7});
 expect(JSON.parse(ws.send.mock.calls[0][0]).voice_settings.speed).toBe(0.7);
 expect(ws.send.mock.calls.map(([m]:[string])=>JSON.parse(m)).some((p:any)=>p.text.trim()==="Buffered speech.")).toBe(true);bridge.close();
});

it.each(["rate_first","replay_first"])("uses the selected rate in the real narration adapter with concurrent tools: %s",async order=>{
 vi.stubEnv("ELEVENLABS_API_KEY","fixture");vi.stubEnv("TTS_ENABLED","true");
 const {narrateGameStimulus}=await import("./game-event-handler");
 const {createSpeechTools}=await import("./companionSpeechTools");const {createReplayWordTools}=await import("./companionReplayTool");
 const {buildCurrentBoardSnapshot}=await import("./currentBoardSnapshot");
 const bridge=new WsTtsBridge({readyState:1,send:vi.fn()} as any,"voice");bridge.beginPlayback("companion","i1");
 const connected=bridge.connect();const old=fixtures.sockets.at(-1);old.readyState=1;old.emit("open");await connected;bridge.sendText("Here it comes.");
 const snapshot=buildCurrentBoardSnapshot({childId:"synthetic",sessionId:"s",assessment:{itemId:"i1",word:"night"},state:{game:"word-radar",nodeId:"node",itemId:"i1",phase:"response",assessmentMode:true,answerVisibility:"hidden"}});
 let narration:Promise<boolean>|undefined;
 const replay:any=createReplayWordTools({snapshot:()=>snapshot,playbackBusy:()=>false,assessmentItemId:()=>"i1",requestNarration:metadata=>{
  bridge.beginPlayback("replay","i1",true,true);
  narration=narrateGameStimulus({text:"night.",metadata:{...metadata,assessmentMode:true,itemId:"i1"},childName:"Lab" as any,ttsLabel:"Lab",bridge,assessment:{itemId:"i1",word:"night",audioDelivered:false},record:vi.fn()});
 }});
 const speech:any=createSpeechTools(bridge,vi.fn());
 const calls=order==="rate_first"?[speech.setSpeechRate.execute({speed:0.7}),replay.replayWord.execute({})]:[replay.replayWord.execute({}),speech.setSpeechRate.execute({speed:0.7})];
 const ws=fixtures.sockets.at(-1);ws.readyState=1;ws.emit("open");await Promise.all(calls);
 await vi.waitFor(()=>expect(ws.send.mock.calls.map(([m]:[string])=>JSON.parse(m)).some((p:any)=>p.text.trim()==="night.")).toBe(true));
 expect(JSON.parse(ws.send.mock.calls[0][0]).voice_settings.speed).toBe(0.7);
 ws.emit("message",Buffer.from(JSON.stringify({audio:Buffer.from([1,0]).toString("base64"),isFinal:true})));
 await expect(narration).resolves.toBe(true);expect(bridge.getAudioRatesThisTurn()).toEqual([0.7]);bridge.close();
});

it("scopes pace to an item and launch without a snapshot-driven audio teardown",async()=>{
 vi.stubEnv("ELEVENLABS_API_KEY","fixture");vi.stubEnv("TTS_ENABLED","true");
 const bridge=new WsTtsBridge({readyState:1,send:vi.fn()} as any,"voice");
 bridge.beginPlayback("practice","i1",false,false,"practice-launch");
 const rate=(bridge as any).setSpeechRate(0.7,{itemId:"i1",launchToken:"practice-launch"});const first=fixtures.sockets.at(-1);first.readyState=1;first.emit("open");await rate;
 expect((bridge as any).getSpeechRate({itemId:"i2",launchToken:"check-launch"})).toBe(1);
 bridge.beginPlayback("check","i2",true,true,"check-launch");const connected=bridge.connect();const check=fixtures.sockets.at(-1);check.readyState=1;check.emit("open");await connected;
 expect(JSON.parse(check.send.mock.calls[0][0]).voice_settings.speed).toBe(1);
 expect(bridge.currentPlaybackIdentity()).toMatchObject({requestId:"check",itemId:"i2"});bridge.close();
});

async function liveManager() {
 const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'real-bridge-replay-'));
 vi.stubEnv('ELEVENLABS_API_KEY','fixture');vi.stubEnv('TTS_ENABLED','true');vi.stubEnv('SUNNY_CHART_DIR',root);vi.stubEnv('SUNNY_MODE','real');vi.stubEnv('ADVENTURE_MAP','true');vi.stubEnv('SUNNY_SESSION_LOG_ROOT',root);
 const {getChildChart}=await import('../profiles/childChart');vi.mocked(getChildChart).mockReturnValue({learningCycle:{domain:'spelling',homeworkId:'hw',nodes:[{nodeId:'n',role:'evaluation',state:'ready',artifactBinding:{contractFingerprint:'frozen'},evidenceContract:{spellingItems:{i1:{id:'i1',word:'night',lineage:{measurementRole:'fresh_checkpoint'}},i2:{id:'i2',word:'light',lineage:{measurementRole:'fresh_checkpoint'}}}}}]}} as any);
 const {openChart}=await import('../chart/db');const {recordAssignment}=await import('../chart/spelling/record');const {exportEvents}=await import('../chart/exportEvents');const db=openChart('lab-child');
 recordAssignment(db,{assignmentId:'hw',words:['night','light'],testDate:null,sourcePhotoHash:'a'.repeat(64)});
 const bridge=new WsTtsBridge({readyState:1,send:vi.fn()} as any,'voice');const {SessionManager}=await import('./session-manager');
 const s:any=Object.assign(Object.create(SessionManager.prototype),{chartChildId:'lab-child',childName:'Lab',sessionTtsLabel:'Lab',sessionId:'voice',companion:{name:'Elli'},companionPresence:'summoned',worksheetMode:false,ctx:{sessionType:'homework'},ttsBridge:bridge,send:vi.fn(),debugRecorder:{recordEvent:vi.fn(),recordGameTrace:vi.fn()},turnSM:{getState:()=> 'IDLE',clearGameTtsHold:vi.fn(),onInterrupt:vi.fn(),onPlaybackComplete:vi.fn(),consumePendingTranscript:vi.fn(),clearPendingTranscript:vi.fn()},flushPendingRoundComplete:vi.fn()});
 s.updateCurrentBoardSnapshot({nodeId:'n',phase:'launched',launchToken:'token'});s.updateCurrentBoardSnapshot({game:'word-radar',nodeId:'n',itemId:'i1',assessmentMode:true,phase:'response',answerVisibility:'hidden',launchToken:'token'});
 return {s,bridge,events:()=>exportEvents(db),close:()=>{clearTimeout(s.gameNarrationPlaybackTimer);s.activeGameNarrationRequestId=null;s.pendingGameNarrationPlayback=null;bridge.close();db.close();fs.rmSync(root,{recursive:true,force:true});}};
}

it.each(['rate_first','replay_first'])('delivers and records pace through the slim SessionManager toolkit and actual replay route: %s',async order=>{
 const lab=await liveManager();const {s,bridge}=lab;
 try{
  bridge.beginPlayback('companion','i1',false,false,'token');const connected=bridge.connect();const old=fixtures.sockets.at(-1);old.readyState=1;old.emit('open');await connected;bridge.sendText('Here it comes.');s.currentAbort=new AbortController();
  const tools=s.buildAgentToolkit();expect(tools.canvasShow).toBeUndefined();expect(tools.setSpeechRate).toBeDefined();expect(tools.replayWord).toBeDefined();
  const calls=order==='rate_first'?[tools.setSpeechRate.execute({speed:0.7}),tools.replayWord.execute({})]:[tools.replayWord.execute({}),tools.setSpeechRate.execute({speed:0.7})];
  const current=fixtures.sockets.at(-1);current.readyState=1;current.emit('open');await Promise.all(calls);
  await vi.waitFor(()=>expect(current.send.mock.calls.map(([m]:[string])=>JSON.parse(m)).some((p:any)=>p.text.trim()==='night.')).toBe(true));
  expect(JSON.parse(current.send.mock.calls[0][0]).voice_settings.speed).toBe(0.7);
  current.emit('message',Buffer.from(JSON.stringify({audio:Buffer.from([1,0]).toString('base64'),isFinal:true})));
  await vi.waitFor(()=>expect(s.pendingGameNarrationPlayback).toBeTruthy());
  s.playbackDone({audible:true,itemId:'i1',requestId:s.pendingGameNarrationPlayback.requestId});
  expect(lab.events().find(e=>e.type==='stimulus.played')?.payload).toMatchObject({speechRates:[0.7],delivered:true});
  expect(s.spellingAssessment.audioPlaybacks).toBe(1);expect(s.pendingGameNarrationPlayback).toBeNull();
 }finally{lab.close();}
});

it.each([1,0.7])('does not stop an incoming item stimulus or a node-only snapshot after pace %s',async speed=>{
 const lab=await liveManager();const {s,bridge}=lab;
 try{
  // Configuration belongs to i1; i2 gets normal initialization without a reset action.
  await bridge.setSpeechRate(speed,{itemId:'i1',launchToken:'token'});
  const narration=s.speakGameNarration('light.',{nodeId:'n',itemId:'i2',assessmentMode:false,launchToken:'token'});
  const current=fixtures.sockets.at(-1);current.readyState=1;current.emit('open');
  s.updateCurrentBoardSnapshot({game:'word-radar',nodeId:'n',itemId:'i2',assessmentMode:true,phase:'response',answerVisibility:'hidden',launchToken:'token'});
  expect(bridge.currentPlaybackIdentity()).toMatchObject({itemId:'i2'});
  s.updateCurrentBoardSnapshot({nodeId:'n',phase:'config_audit',launchToken:'token'});
  expect(bridge.currentPlaybackIdentity()).toMatchObject({itemId:'i2'});
  await vi.waitFor(()=>expect(current.send.mock.calls.map(([m]:[string])=>JSON.parse(m)).some((p:any)=>p.text.trim()==='light.')).toBe(true));
  expect(JSON.parse(current.send.mock.calls[0][0]).voice_settings.speed).toBe(1);
  current.emit('message',Buffer.from(JSON.stringify({audio:Buffer.from([1,0]).toString('base64'),isFinal:true})));
  await narration;expect(s.pendingGameNarrationPlayback).toBeTruthy();
  s.playbackDone({audible:true,itemId:'i2',requestId:s.pendingGameNarrationPlayback.requestId});
  expect(lab.events().find(e=>e.type==='stimulus.played')?.payload).toMatchObject({speechRates:[1],delivered:true});
 }finally{lab.close();}
});

it('uses the activity launch token for non-spelling narration pace',async()=>{
 const lab=await liveManager();const {s,bridge}=lab;
 try{
  s.spellingLaunch=undefined;s.spellingAssessment=undefined;
  s.updateCurrentBoardSnapshot({game:'math-cards',nodeId:'math',itemId:'math-1',phase:'response',answerVisibility:'visible',launchToken:'math-launch'});
  await s.buildAgentToolkit().setSpeechRate.execute({speed:0.7});
  const narration=s.speakGameNarration('Count the groups.',{nodeId:'math',itemId:'math-1',launchToken:'math-launch'});
  const ws=fixtures.sockets.at(-1);ws.readyState=1;ws.emit('open');
  await vi.waitFor(()=>expect(ws.send.mock.calls.map(([m]:[string])=>JSON.parse(m)).some((p:any)=>p.text.trim()==='Count the groups.')).toBe(true));
  expect(JSON.parse(ws.send.mock.calls[0][0]).voice_settings.speed).toBe(0.7);
  ws.emit('message',Buffer.from(JSON.stringify({audio:Buffer.from([1,0]).toString('base64'),isFinal:true})));await narration;
  s.playbackDone({audible:true,itemId:'math-1',requestId:s.pendingGameNarrationPlayback.requestId});
 }finally{lab.close();}
});
