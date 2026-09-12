import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

vi.mock("../../components/Canvas", () => ({
  gameIframeRef: { current: null },
}));

import { useSession } from "../useSession";
import { useAdventureState } from "../useAdventureState";

const OPEN = 1;
const CONNECTING = 0;

describe("WS envelope vs canvas payload type", () => {
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
    close = vi.fn();

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
    OriginalWebSocket = globalThis.WebSocket;
    OriginalAudioContext = globalThis.AudioContext;

    class TestAudioContext {
      state: AudioContextState = "running";
      sampleRate = 24000;
      destination = {} as AudioDestinationNode;
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
        const src = {
          buffer: null as AudioBuffer | null,
          connect: () => src as unknown as AudioNode,
          start: vi.fn(),
          stop: vi.fn(),
          onended: null as (() => void) | null,
        };
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
      close = vi.fn();
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
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    globalThis.WebSocket = OriginalWebSocket;
    globalThis.AudioContext = OriginalAudioContext;
    vi.restoreAllMocks();
    cleanup();
  });

  it.each(["math", "spelling"])("keeps %s homework identity and controls available when microphone permission is dismissed", async (homeworkDomain) => {
    vi.stubEnv("VITE_SUNNY_RUNTIME_CONFIG", JSON.stringify({ subject: "homework", childId: "lab-child", homeworkDomain, sessionMode: "real", previewMode: "off", voiceMode: "normal" }));
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new DOMException("Permission dismissed", "NotAllowedError"));
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      const session = useSession();
      return { session, adventure: useAdventureState(session.state, true) };
    });
    act(() => result.current.session.startSession("lab-child"));
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    expect(wsInstances[0]!.send.mock.calls.map(([raw]) => JSON.parse(String(raw))).filter(message => message.type === "start_session")).toHaveLength(1);
    expect(result.current.session.state.errorFatal).toBe(false);
    expect(result.current.session.state.error).toBeNull();
    expect(result.current.session.state.warning).toMatch(/microphone unavailable/i);
    expect(result.current.session.state.microphoneAvailable).toBe(false);
    expect(result.current.adventure.adventureChildId).toBe("lab-child");
  });

  it("still reports microphone denial as fatal for a normal voice-only review", async () => {
    vi.stubEnv("VITE_SUNNY_RUNTIME_CONFIG", JSON.stringify({ subject: "review", sessionMode: "real", previewMode: "off", voiceMode: "normal" }));
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new DOMException("Permission dismissed", "NotAllowedError"));
    vi.useFakeTimers();
    const { result } = renderHook(() => useSession());
    act(() => result.current.startSession("lab-child"));
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(result.current.state.errorFatal).toBe(true);
    expect(result.current.state.error).toBe("Microphone access denied");
  });

  it("keeps wire message type when sendMessage payload has type: karaoke", async () => {
    const { result } = renderHook(() => useSession());

    act(() => {
      result.current.startSession("ila");
    });

    const ws = wsInstances[0]!;
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.sendMessage("canvas_show", {
        type: "karaoke",
        storyText: "Hello",
        words: ["Hello"],
      });
    });

    const raw = ws.send.mock.calls.at(-1)?.[0];
    expect(typeof raw).toBe("string");
    expect(JSON.parse(String(raw))).toMatchObject({
      type: "canvas_show",
      canvasType: "karaoke",
      storyText: "Hello",
      words: ["Hello"],
    });
  });

  it("surfaces server-owned companion summon and dismiss state", async () => {
    const { result } = renderHook(() => useSession());

    act(() => result.current.startSession("reina"));
    const ws = wsInstances[0]!;
    await act(async () => Promise.resolve());

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "companion_presence",
          state: "summoned",
          reason: "read_instruction",
        }),
      } as MessageEvent);
    });
    expect(result.current.state.companionPresence).toBe("summoned");

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({ type: "companion_presence", state: "collapsed" }),
      } as MessageEvent);
    });
    expect(result.current.state.companionPresence).toBe("collapsed");
  });

  it("lets the child summon and dismiss the companion through the existing socket", async () => {
    const { result } = renderHook(() => useSession());
    act(() => result.current.startSession("reina"));
    const ws = wsInstances[0]!;
    await act(async () => Promise.resolve());

    act(() => result.current.setCompanionPresence("summoned"));
    expect(result.current.state.companionPresence).toBe("summoned");
    expect(JSON.parse(String(ws.send.mock.calls.at(-1)?.[0]))).toEqual({
      type: "companion_presence",
      state: "summoned",
    });

    act(() => result.current.setCompanionPresence("collapsed"));
    expect(result.current.state.companionPresence).toBe("collapsed");
  });
});
