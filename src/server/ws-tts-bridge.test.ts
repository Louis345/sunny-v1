import { describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { EventEmitter } from "node:events";
import { WsTtsBridge } from "./ws-tts-bridge";

describe("WsTtsBridge turn ownership", () => {
  it("does not let a retired stream completion erase its successor socket", async () => {
    const old = Object.assign(new EventEmitter(), {readyState:WebSocket.OPEN,send:vi.fn()});
    const next = {readyState:WebSocket.OPEN};
    const bridge=Object.assign(Object.create(WsTtsBridge.prototype),{
      stopped:false,disabled:false,buffer:"",flushTimer:null,elevenWs:old,wsReady:true,terminals:new WeakMap(),streamDeadlineMs:1000,
    }) as WsTtsBridge;
    const finished=bridge.finish();
    (bridge as any).elevenWs=next;
    old.emit("close");
    await finished;
    expect((bridge as any).elevenWs).toBe(next);
    expect((bridge as any).wsReady).toBe(true);
  });

  it("does not erase an active turn when a second caller reuses the open socket", async () => {
    // Human catch: Ila heard repeated/overlapping words while game narration and
    // Elli shared one bridge. Logs showed successful calls, but connect() silently
    // reset the first caller's text/audio counters. Prior tests mocked the bridge.
    const bridge = Object.assign(Object.create(WsTtsBridge.prototype), {
      stopped: false,
      disabled: false,
      buffer: "first owner text",
      hasFlushedThisTurn: true,
      audioChunksThisTurn: 3,
      flushTimer: null,
      wsReady: true,
      connectingPromise: null,
      elevenWs: { readyState: WebSocket.OPEN },
    }) as WsTtsBridge;

    await bridge.connect("another caller");

    expect((bridge as unknown as { buffer: string }).buffer).toBe("first owner text");
    expect((bridge as unknown as { hasFlushedThisTurn: boolean }).hasFlushedThisTurn).toBe(true);
    expect((bridge as unknown as { audioChunksThisTurn: number }).audioChunksThisTurn).toBe(3);
  });
});

// The real monkey stimulus had no PCM, but finish() could time out as success and
// discarded its socket. Logs lacked terminal facts; old mocks only closed fast.
// This local provider has no paid service or child-data side effects.
describe('WsTtsBridge provider terminal protocol',()=>{
 async function localProvider(timeoutMs=1000){
  const {WebSocketServer}=await import('ws');
  const once=(emitter:EventEmitter,event:string)=>new Promise<any[]>(resolve=>emitter.once(event,(...args:any[])=>resolve(args)));
  const server=new WebSocketServer({host:'127.0.0.1',port:0});
  await once(server,'listening');
  const address=server.address();if(typeof address==='string'||!address)throw Error('provider address missing');
  vi.stubEnv('ELEVENLABS_WS_BASE_URL',`ws://127.0.0.1:${address.port}`);vi.stubEnv('ELEVENLABS_API_KEY','local-fixture');vi.stubEnv('TTS_ENABLED','true');
  const sent:any[]=[];const browser={readyState:WebSocket.OPEN,OPEN:WebSocket.OPEN,send:(data:string)=>sent.push(JSON.parse(data))} as unknown as WebSocket;
  const bridge=new (WsTtsBridge as any)(browser,'fixture-voice',timeoutMs) as WsTtsBridge;
  const peerPromise=once(server,'connection');bridge.beginPlayback('request-old','item-old',true,true);await bridge.connect();const [peer]=await peerPromise;
  let inputs=0;peer.on('message',()=>{if(++inputs>10)throw Error('provider input guard exceeded');});
  return {bridge,peer,server,sent,inputs:()=>inputs,close:async()=>{bridge.close();server.clients.forEach(client=>client.terminate());await new Promise<void>(resolve=>server.close(()=>resolve()));vi.unstubAllEnvs();}};
 }
 it.each(['isFinal','is_final'])('completes on %s after PCM without waiting for provider closure',async terminal=>{
  const f=await localProvider();try{
   f.bridge.sendText('monkey.');const finished=f.bridge.finish();
   f.peer.send(JSON.stringify({audio:Buffer.from('pcm').toString('base64'),[terminal]:true}));
   await expect(Promise.race([finished.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),250))])).resolves.toBe(true);
   expect(f.bridge.hadAudioThisTurn()).toBe(true);expect(f.sent.filter(m=>m.type==='audio')).toHaveLength(1);expect(f.inputs()).toBeLessThanOrEqual(3);
  }finally{await f.close();}
 },10000);
 it('rejects a provider error received after connection opened, before finish',async()=>{
  const f=await localProvider();try{
   const wire=(f.bridge as any).elevenWs as WebSocket;const delivered=new Promise(resolve=>wire.once('message',resolve));
   f.peer.send(JSON.stringify({error:'fixture_generation_failed'}));await delivered;
   await expect(f.bridge.finish()).rejects.toThrow('tts_provider_error');expect(f.bridge.hadAudioThisTurn()).toBe(false);
  }finally{await f.close();}
 },10000);
 it('rejects and closes a nonterminal stream at its bounded deadline',async()=>{
  const f=await localProvider(50);try{
   const closed=new Promise(resolve=>f.peer.once('close',resolve));f.bridge.sendText('monkey.');
   await expect(f.bridge.finish()).rejects.toThrow('tts_stream_timeout');await closed;
   expect(f.bridge.hadAudioThisTurn()).toBe(false);expect((f.bridge as any).elevenWs).toBeNull();expect(f.inputs()).toBeLessThanOrEqual(3);
  }finally{await f.close();}
 },10000);
 it('keeps delayed PCM beyond the old three-second cutoff until actual final',async()=>{
  const f=await localProvider(5000);try{
   f.bridge.sendText('monkey.');let completed=false;const finished=f.bridge.finish().then(()=>{completed=true;});
   await new Promise(resolve=>setTimeout(resolve,3100));expect(completed).toBe(false);
   f.peer.send(JSON.stringify({audio:Buffer.from('late-pcm').toString('base64'),isFinal:true}));await finished;
   expect(f.sent.filter(m=>m.type==='audio')).toHaveLength(1);expect(f.bridge.hadAudioThisTurn()).toBe(true);
  }finally{await f.close();}
 },10000);
 it('cancels a pending stream without retiring the next playback owner',async()=>{
  const f=await localProvider();try{
   f.bridge.sendText('monkey.');const finished=f.bridge.finish();f.bridge.stop();
   f.bridge.beginPlayback('request-next','item-next',true,true);await f.bridge.connect();await finished;
   expect(f.bridge.currentPlaybackIdentity()).toEqual({requestId:'request-next',itemId:'item-next'});
   expect((f.bridge as any).elevenWs.readyState).toBe(WebSocket.OPEN);
   expect(f.sent.filter(m=>m.type==='audio')).toHaveLength(0);expect(f.bridge.hadAudioThisTurn()).toBe(false);
  }finally{await f.close();}
 },10000);

 it.each([null, [], 'invalid-envelope'])('rejects malformed provider envelope %j without an uncaught callback',async payload=>{
  const f=await localProvider(100);try{
   const wire=(f.bridge as any).elevenWs as WebSocket;const delivered=new Promise(resolve=>wire.once('message',resolve));
   f.peer.send(JSON.stringify(payload));await delivered;
   await expect(f.bridge.finish()).rejects.toThrow('tts_provider_error');expect((f.bridge as any).elevenWs).toBeNull();
  }finally{await f.close();}
 },10000);

 it.each([1000,1011])('records provider close %i instead of silently timing out',async code=>{
  const f=await localProvider();try{
   f.bridge.sendText('monkey.');const finished=f.bridge.finish();
   const assertion=code===1000?expect(finished).resolves.toBeUndefined():expect(finished).rejects.toThrow('tts_provider_error');
   f.peer.close(code);await assertion;expect((f.bridge as any).elevenWs).toBeNull();expect(f.bridge.hadAudioThisTurn()).toBe(false);
  }finally{await f.close();}
 },10000);

});
