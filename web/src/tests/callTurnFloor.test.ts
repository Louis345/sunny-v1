import { describe, expect, it, vi } from "vitest";
import { createCallTurnFloor, isOnlyStopWords } from "../utils/callTurnFloor";
import { streamCompanionTalk } from "../utils/companionTalkStream";

// Ila 11/22 on FaceTime with Princess: "she doesn't listen when I say stop, she says 'oh you want to hear more?'…
// I want to speak." Why the human caught it: a child hears a companion keep talking over "stop". Why logs missed it:
// the call logs only finished replies, never a stop that did nothing. Why the lab missed it: no test barged in before
// a streamed reply had finished arriving (the stop handle only existed after the last frame), and none said "stop".
describe("call turn floor (XState): her stop wins", () => {
  it("her stop while the companion is speaking or thinking stops the turn, and the stop itself is not a question", () => {
    const floor = createCallTurnFloor();
    const stopTurn = vi.fn();
    floor.companionTurnStarted(stopTurn);
    floor.companionSpeaking();
    expect(floor.childSpokeOver()).toBe(true);
    expect(stopTurn).toHaveBeenCalledTimes(1);
    expect(floor.current()).toBe("interrupted");
    expect(floor.childFinal("stop")).toBe("listen");
    expect(floor.childFinal("Stop, wait.")).toBe("listen");
    expect(floor.childFinal("I want to tell you about my pet")).toBe("answer");
    expect(floor.current()).toBe("listening");
  });

  it("a stop word while the companion is still thinking cancels that reply; other talk then is dropped as before", () => {
    const floor = createCallTurnFloor();
    const stopTurn = vi.fn();
    floor.companionTurnStarted(stopTurn);
    expect(floor.childFinal("what is that")).toBe("busy");
    expect(stopTurn).not.toHaveBeenCalled();
    expect(floor.childFinal("wait wait")).toBe("listen");
    expect(stopTurn).toHaveBeenCalledTimes(1);
    expect(floor.current()).toBe("listening");
  });

  it("a finished turn hands the floor back; an old turn's end cannot take the floor from a newer one", () => {
    const floor = createCallTurnFloor();
    const first = floor.companionTurnStarted(() => undefined);
    floor.childSpokeOver();
    floor.childFinal("tell me a joke");
    floor.companionTurnStarted(() => undefined);
    floor.companionTurnEnded(first);
    expect(floor.current()).toBe("thinking");
  });

  it("knows a stop from a sentence", () => {
    expect(isOnlyStopWords("Stop!")).toBe(true);
    expect(isOnlyStopWords("okay stop")).toBe(true);
    expect(isOnlyStopWords("hold on")).toBe(true);
    expect(isOnlyStopWords("shh")).toBe(true);
    expect(isOnlyStopWords("stop the music and dance")).toBe(false);
    expect(isOnlyStopWords("")).toBe(false);
  });
});

describe("a streamed reply can be stopped before it finishes arriving", () => {
  it("the stop handle is given at the start, and a stopped stream ends as interrupted, not as a failure", async () => {
    const encoder = new TextEncoder();
    let pull!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(controller) { pull = controller; } });
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      init.signal?.addEventListener("abort", () => pull.error(new DOMException("aborted", "AbortError")));
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    }));
    const context = { currentTime: 0, createBuffer: vi.fn(), createBufferSource: vi.fn(), resume: vi.fn(async () => undefined) } as unknown as AudioContext;
    let stopNow: (() => void) | undefined;
    const result = streamCompanionTalk({ url: "/x", payload: {}, context, sink: {} as AudioNode, onStart: (stop) => { stopNow = stop; } });
    await vi.waitFor(() => expect(stopNow).toBeDefined());
    pull.enqueue(encoder.encode("event: text_delta\ndata: {\"delta\":\"Oh, you want\"}\n\n"));
    stopNow!();
    await expect(result).resolves.toMatchObject({ interrupted: true });
    vi.unstubAllGlobals();
  });
});
