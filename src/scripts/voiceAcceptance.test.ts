import { describe, expect, it } from "vitest";
import { verifyVoiceAcceptance } from "./voiceAcceptance";
const row = (component: string, fields: Record<string, string>) => ({sessionId:"live",component,...fields});
const chain = [row("client_audio",{event:"input_detected"}),row("client_audio",{event:"speech_recognized"}),row("transcript",{action:"accepted"}),row("client_audio",{event:"playback_started"})];
describe("real voice acceptance evidence", () => {
  it("rejects capture setup without speech or playback", () => {
    expect(verifyVoiceAcceptance([row("client_audio",{event:"capture_started"})],true).ok).toBe(false);
  });
  it("requires the complete ordered path and a human audibility confirmation", () => {
    expect(verifyVoiceAcceptance(chain,false).ok).toBe(false);
    expect(verifyVoiceAcceptance(chain,true).ok).toBe(true);
    for(let i=0;i<chain.length;i++) expect(verifyVoiceAcceptance(chain.filter((_,n)=>n!==i),true).ok).toBe(false);
    expect(verifyVoiceAcceptance([...chain].reverse(),true).ok).toBe(false);
  });
  it("does not combine unrelated sessions to manufacture success", () => {
    expect(verifyVoiceAcceptance(chain.map((e,i)=>({...e,sessionId:String(i)})),true).ok).toBe(false);
  });
  it("does not fill a missing stage with an event that has no session identity", () => {
    for (let missing = 0; missing < chain.length; missing++) {
      expect(verifyVoiceAcceptance(chain.map((event, index) => index === missing ? { ...event, sessionId: undefined } : event), true).ok).toBe(false);
    }
  });
});
