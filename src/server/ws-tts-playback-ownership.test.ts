import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
const fixtures=vi.hoisted(()=>({sockets:[] as any[]}));
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
