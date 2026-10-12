import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { StrictMode, type MutableRefObject } from "react";

vi.mock("../../components/Canvas", () => ({
  gameIframeRef: { current: null },
}));

import { useSession } from "../useSession";

/** Minimal valid base64 for one Int16 sample (2 bytes) — PCM silence. */
const ONE_SAMPLE_PCM_BASE64 = "AAA=";

const OPEN = 1;
const CONNECTING = 0;

let createBufferSourceCallCount = 0;
let playbackContextCreateCount = 0;
let playbackSources: Array<{onended:(()=>void)|null}> = [];

describe("useSession companion audio gate", () => {
  let wsInstances: MockWebSocket[];
  let OriginalWebSocket: typeof WebSocket;
  let OriginalAudioContext: typeof AudioContext;

  class MockWebSocket {
    static OPEN = OPEN;
    static CONNECTING = CONNECTING;
    readyState = CONNECTING;
    onopen: (() => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    send = vi.fn();
    close = vi.fn(async () => {});

    constructor(_url: string) {
      wsInstances.push(this);
      queueMicrotask(() => {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.();
      });
    }
  }

  beforeEach(() => {
    wsInstances = [];
    createBufferSourceCallCount = 0;
    playbackContextCreateCount = 0;
    playbackSources = [];
    OriginalWebSocket = globalThis.WebSocket;
    OriginalAudioContext = globalThis.AudioContext;

    class TestAudioContext {
      state: AudioContextState = "running";
      sampleRate = 24000;
      destination = {} as AudioDestinationNode;
      constructor(options?: AudioContextOptions) {
        this.sampleRate = options?.sampleRate ?? 24000;
        if (this.sampleRate === 24000) playbackContextCreateCount += 1;
      }
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      createScriptProcessor() {
        return {
          connect: vi.fn(),
          disconnect: vi.fn(),
          onaudioprocess: null,
        };
      }
      createGain() {
        return {
          gain: { value: 1 },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
      }
      createAnalyser() {
        return {
          context: this,
          fftSize: 2048,
          connect: () => this as unknown as AudioNode,
          disconnect: () => {},
          getByteTimeDomainData: () => {},
        } as unknown as AnalyserNode;
      }
      createBufferSource() {
        createBufferSourceCallCount += 1;
        const src = {
          buffer: null as AudioBuffer | null,
          connect: () => src as unknown as AudioNode,
          start: vi.fn(),
          stop: vi.fn(),
          onended: null as (() => void) | null,
        };
        playbackSources.push(src);
        return src as unknown as AudioBufferSourceNode;
      }
      createBuffer(_ch: number, len: number, sr: number) {
        return {
          sampleRate: sr,
          length: len,
          duration: len / sr,
          getChannelData: () => new Float32Array(len),
        } as unknown as AudioBuffer;
      }
      resume = vi.fn(() => Promise.resolve());
      close = vi.fn(async () => {});
    }

    globalThis.AudioContext = TestAudioContext as unknown as typeof AudioContext;

    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getAudioTracks: () => [{ enabled: true, stop: vi.fn() }],
          getTracks: () => [{ stop: vi.fn() }],
        } as unknown as MediaStream),
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    globalThis.WebSocket = OriginalWebSocket;
    globalThis.AudioContext = OriginalAudioContext;
    vi.restoreAllMocks();
  });

  function deliverJson(ws: MockWebSocket, obj: Record<string, unknown>) {
    const ev = { data: JSON.stringify(obj) } as MessageEvent;
    ws.onmessage?.(ev);
  }

  it.each([
    ["I couldn't play that word. Tap Hear the word again.", null],
    ["Sunny lost connection. Reconnecting…", "Sunny lost connection. Reconnecting…"],
  ])("clears only the resolved word-playback warning: %s", async (warning, expected) => {
    // Lab catch: final5 monkey retry was acknowledged, but its failure banner remained.
    // Logs proved recovery; prior hook tests omitted warning lifecycle after retry.
    vi.useFakeTimers();
    const { result } = renderHook(() => useSession());
    await act(async () => { result.current.startSession("ila"); await Promise.resolve(); });
    const ws = wsInstances[0]!;
    await act(async () => { await vi.advanceTimersByTimeAsync(101); });
    act(() => deliverJson(ws, { type: "error", fatal: false, message: warning }));
    await act(async () => {
      deliverJson(ws, { type: "audio_start", requestId: "retry", itemId: "monkey", requiresAudio: true, source: "activity" });
      deliverJson(ws, { type: "audio", requestId: "retry", data: ONE_SAMPLE_PCM_BASE64 });
      deliverJson(ws, { type: "audio_done", requestId: "retry", itemId: "monkey", requiresAudio: true });
    });
    expect(result.current.state.warning).toBe(warning);
    await act(async () => { playbackSources[0].onended?.(); await vi.advanceTimersByTimeAsync(151); });
    expect(ws.send.mock.calls.map(([m]) => JSON.parse(m))).toContainEqual(expect.objectContaining({ type: "playback_done", requestId: "retry", audible: true }));
    expect(result.current.state.warning).toBe(expected);
  });

  it("acknowledges the word after a trailing PCM chunk instead of leaving replay blocked", async () => {
    // Live run: synthesized words repeatedly timed out awaiting playback proof.
    // Earlier tests never delivered PCM after the stream-done marker.
    vi.useFakeTimers();
    const {result}=renderHook(()=>useSession());
    await act(async()=>{result.current.startSession("ila");await Promise.resolve();});
    const ws=wsInstances[0]!;
    await act(async()=>{deliverJson(ws,{type:"audio",data:ONE_SAMPLE_PCM_BASE64});});
    act(()=>deliverJson(ws,{type:"audio_done",requiresAudio:true,requestId:"word-1",itemId:"either"}));
    await act(async()=>{deliverJson(ws,{type:"audio",data:ONE_SAMPLE_PCM_BASE64});});
    await act(async()=>{playbackSources[0].onended?.();});
    await act(async()=>{playbackSources[1].onended?.();await vi.advanceTimersByTimeAsync(151);});
    const sent=ws.send.mock.calls.map(([message])=>JSON.parse(message));
    expect(sent.filter(message=>message.type==="playback_done")).toEqual([
      expect.objectContaining({audible:true,requestId:"word-1",itemId:"either"}),
    ]);
  });

  it("plays PCM arriving during the inter-chunk grace period before acknowledging the word", async () => {
    vi.useFakeTimers();
    const {result}=renderHook(()=>useSession());
    await act(async()=>{result.current.startSession("ila");await Promise.resolve();});
    const ws=wsInstances[0]!;
    await act(async()=>{
      deliverJson(ws,{type:"audio_start",requestId:"word-gap",itemId:"medium",source:"activity",requiresAudio:true});
      deliverJson(ws,{type:"audio",requestId:"word-gap",data:ONE_SAMPLE_PCM_BASE64});
    });
    await act(async()=>{playbackSources[0].onended?.();await vi.advanceTimersByTimeAsync(50);});
    await act(async()=>{
      deliverJson(ws,{type:"audio",requestId:"word-gap",data:ONE_SAMPLE_PCM_BASE64});
      deliverJson(ws,{type:"audio_done",requestId:"word-gap",itemId:"medium",requiresAudio:true});
      await vi.advanceTimersByTimeAsync(101);
    });
    expect(playbackSources).toHaveLength(2);
    expect(ws.send.mock.calls.map(([m])=>JSON.parse(m)).filter(m=>m.type==="playback_done")).toHaveLength(0);
    await act(async()=>{playbackSources[1].onended?.();await vi.advanceTimersByTimeAsync(151);});
    expect(ws.send.mock.calls.map(([m])=>JSON.parse(m)).filter(m=>m.type==="playback_done")).toEqual([
      expect.objectContaining({requestId:"word-gap",itemId:"medium",audible:true})
    ]);
  });

  it("retires old audio when the next word takes ownership and ignores its late completion", async () => {
    vi.useFakeTimers();
    const {result}=renderHook(()=>useSession());
    await act(async()=>{result.current.startSession("ila");await Promise.resolve();});
    const ws=wsInstances[0]!;
    await act(async()=>{
      deliverJson(ws,{type:"audio_start",requestId:"old",itemId:"either"});
      deliverJson(ws,{type:"audio",requestId:"old",data:ONE_SAMPLE_PCM_BASE64});
    });
    await act(async()=>{
      deliverJson(ws,{type:"audio_start",requestId:"new",itemId:"cheese"});
      deliverJson(ws,{type:"audio",requestId:"old",data:ONE_SAMPLE_PCM_BASE64});
      deliverJson(ws,{type:"audio",requestId:"new",data:ONE_SAMPLE_PCM_BASE64});
    });
    act(()=>{
      deliverJson(ws,{type:"audio_done",requiresAudio:true,requestId:"new",itemId:"cheese"});
      deliverJson(ws,{type:"audio_done",requestId:"old",itemId:"either"});
    });
    expect(createBufferSourceCallCount).toBe(2);
    await act(async()=>{playbackSources[1].onended?.();await vi.advanceTimersByTimeAsync(151);});
    const sent=ws.send.mock.calls.map(([message])=>JSON.parse(message));
    expect(sent.filter(message=>message.type==="playback_done")).toEqual([
      expect.objectContaining({audible:true,requestId:"new",itemId:"cheese"}),
    ]);
  });

  it("does not resurrect canceled speech from late PCM or completion", async () => {
    vi.useFakeTimers();
    const {result}=renderHook(()=>useSession());
    await act(async()=>{result.current.startSession("ila");await Promise.resolve();});
    const ws=wsInstances[0]!;
    await act(async()=>{
      deliverJson(ws,{type:"audio_start",requestId:"retired"});
      deliverJson(ws,{type:"audio",requestId:"retired",data:ONE_SAMPLE_PCM_BASE64});
    });
    act(()=>result.current.bargeIn());
    await act(async()=>{
      deliverJson(ws,{type:"audio",requestId:"retired",data:ONE_SAMPLE_PCM_BASE64});
      deliverJson(ws,{type:"audio_done",requestId:"retired"});
      await vi.advanceTimersByTimeAsync(151);
    });
    expect(createBufferSourceCallCount).toBe(1);
    expect(ws.send.mock.calls.map(([message])=>JSON.parse(message)).filter(message=>message.type==="playback_done")).toEqual([]);
  });

  it("records quiet controls and first browser playback once per response", async () => {
    const {result}=renderHook(()=>useSession(), {wrapper:StrictMode});
    await act(async()=>{result.current.startSession("ila");await Promise.resolve();});
    const ws=wsInstances[0]!;
    act(()=>result.current.toggleCompanionSpeechMute());
    act(()=>result.current.toggleCompanionSpeechMute());
    await act(async()=>{
      deliverJson(ws,{type:"audio_start",requestId:"measured",source:"companion"});
      deliverJson(ws,{type:"audio",requestId:"measured",data:ONE_SAMPLE_PCM_BASE64});
    });
    const events=ws.send.mock.calls.map(([message])=>JSON.parse(message));
    expect(events.filter(e=>e.event==="companion_speech_mute").map(e=>e.muted)).toEqual([true,false]);
    expect(events.filter(e=>e.event==="playback_started")).toEqual([expect.objectContaining({requestId:"measured"})]);
  });

  it("plays an explicitly requested practice word while Elli is quiet", async () => {
    const {result}=renderHook(()=>useSession());
    await act(async()=>{result.current.startSession("ila");await Promise.resolve();});
    act(()=>result.current.toggleCompanionSpeechMute());
    const ws=wsInstances[0]!;
    await act(async()=>{
      deliverJson(ws,{type:"audio_start",requestId:"practice",source:"activity",requiresAudio:false});
      deliverJson(ws,{type:"audio",requestId:"practice",data:ONE_SAMPLE_PCM_BASE64});
    });
    expect(createBufferSourceCallCount).toBe(1);
  });

  it("plays first audio immediately even while loading curtain is active", async () => {
    const gateRef: MutableRefObject<boolean> = { current: true };

    const { result } = renderHook(() =>
      useSession({
        gateCompanionAudioUntilCurtainRef: gateRef,
      }),
    );

    act(() => {
      result.current.startSession("ila");
    });

    const ws = wsInstances[0]!;
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      deliverJson(ws, {
        type: "session_started",
        childName: "Ila",
        child: "ila",
        companionName: "Elli",
        companion: "elli",
        emoji: "🌟",
        accentColor: "#7C3AED",
        accentBg: "#F3E8FF",
        voiceId: "v1",
        openingLine: "Hi!",
        goodbye: "Bye",
      });
    });

    act(() => {
      deliverJson(ws, { type: "session_boot_ready" });
    });

    await act(async () => {
      deliverJson(ws, { type: "audio", data: ONE_SAMPLE_PCM_BASE64 });
    });

    expect(result.current.state.firstAudioChunkReceived).toBe(true);
    expect(createBufferSourceCallCount).toBeGreaterThan(0);
  });

  it("primes playback audio on session start before gated PCM is released", async () => {
    const gateRef: MutableRefObject<boolean> = { current: true };
    const { result } = renderHook(() =>
      useSession({
        gateCompanionAudioUntilCurtainRef: gateRef,
      }),
    );

    act(() => {
      result.current.startSession("ila");
    });

    expect(playbackContextCreateCount).toBeGreaterThan(0);
    expect(createBufferSourceCallCount).toBe(0);
  });

  it("resets firstAudioChunkReceived on session_started", async () => {
    const gateRef: MutableRefObject<boolean> = { current: false };
    const { result } = renderHook(() =>
      useSession({ gateCompanionAudioUntilCurtainRef: gateRef }),
    );

    act(() => {
      result.current.startSession("ila");
    });
    const ws = wsInstances[0]!;
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      deliverJson(ws, {
        type: "session_started",
        childName: "Ila",
        child: "ila",
        companionName: "Elli",
        companion: "elli",
        emoji: "🌟",
        accentColor: "#7C3AED",
        accentBg: "#F3E8FF",
        voiceId: "v1",
        openingLine: "Hi!",
        goodbye: "Bye",
      });
    });
    expect(result.current.state.firstAudioChunkReceived).toBe(false);

    await act(async () => {
      deliverJson(ws, { type: "audio", data: ONE_SAMPLE_PCM_BASE64 });
    });
    expect(result.current.state.firstAudioChunkReceived).toBe(true);

    act(() => {
      deliverJson(ws, {
        type: "session_started",
        childName: "Ila",
        child: "ila",
        companionName: "Elli",
        companion: "elli",
        emoji: "🌟",
        accentColor: "#7C3AED",
        accentBg: "#F3E8FF",
        voiceId: "v1",
        openingLine: "Hi!",
        goodbye: "Bye",
      });
    });
    expect(result.current.state.firstAudioChunkReceived).toBe(false);
  });

  it("keeps the session active when the server reports a non-fatal transport error", async () => {
    const gateRef: MutableRefObject<boolean> = { current: false };
    const { result } = renderHook(() =>
      useSession({ gateCompanionAudioUntilCurtainRef: gateRef }),
    );

    act(() => {
      result.current.startSession("ila");
    });
    const ws = wsInstances[0]!;
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      deliverJson(ws, {
        type: "session_started",
        childName: "Ila",
        child: "ila",
        companionName: "Elli",
        companion: "elli",
        emoji: "🌟",
        accentColor: "#7C3AED",
        accentBg: "#F3E8FF",
        voiceId: "v1",
        openingLine: "Hi!",
        goodbye: "Bye",
      });
    });
    expect(result.current.state.phase).toBe("active");

    act(() => {
      deliverJson(ws, {
        type: "error",
        fatal: false,
        message: "Unknown type: karaoke",
      });
    });

    expect(result.current.state.phase).toBe("active");
    expect(result.current.state.warning).toBe("Unknown type: karaoke");
  });

  it("cancels pending session-start timers when the hook unmounts", () => {
    vi.useFakeTimers();
    try {
      const { result, unmount } = renderHook(() => useSession());

      act(() => {
        result.current.startSession("ila");
      });
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      unmount();
      act(() => {
        vi.advanceTimersByTime(0);
      });

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

});
