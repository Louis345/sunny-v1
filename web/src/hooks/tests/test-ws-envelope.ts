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
  let micProcessor: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onaudioprocess: ((event: AudioProcessingEvent) => void) | null;
  } | null;

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
    micProcessor = null;
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
        micProcessor = {
          connect: vi.fn(),
          disconnect: vi.fn(),
          onaudioprocess: null,
        };
        return micProcessor;
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
      close = vi.fn(() => Promise.resolve());
    }

    globalThis.AudioContext = TestAudioContext as unknown as typeof AudioContext;
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getAudioTracks: () => [{
            enabled: true,
            stop: vi.fn(),
            label: "BlackHole 2ch",
            getSettings: () => ({ deviceId: "virtual-input" }),
          }],
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

  it("turns sustained silent microphone frames into a visible recovery message and one logged diagnostic", async () => {
    // Human caught this by speaking and hearing no response. The old lab only
    // asserted stream creation and packet flow, so a silent virtual input passed.
    vi.useFakeTimers();
    const { result } = renderHook(() => useSession());
    act(() => result.current.startSession("ila"));
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });

    expect(micProcessor?.onaudioprocess).toBeTypeOf("function");
    const silentFrame = {
      inputBuffer: { getChannelData: () => new Float32Array(4096) },
    } as unknown as AudioProcessingEvent;
    act(() => {
      for (let frame = 0; frame < 72; frame += 1) {
        micProcessor?.onaudioprocess?.(silentFrame);
      }
    });

    expect(result.current.state.warning).toMatch(/not hearing any sound/i);
    expect(result.current.state.warning).toMatch(/BlackHole 2ch/i);
    const statuses = wsInstances[0]!.send.mock.calls
      .map(([raw]) => JSON.parse(String(raw)))
      .filter((message) => message.type === "client_audio_status");
    expect(statuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "capture_started", reason: "BlackHole 2ch" }),
      expect.objectContaining({ event: "silent_input", reason: "BlackHole 2ch" }),
    ]));
    expect(statuses.filter((message) => message.event === "silent_input")).toHaveLength(1);
  });

  it("clears Sunny's silent-input warning when the selected microphone produces audio", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSession());
    act(() => result.current.startSession("ila"));
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });

    const silentFrame = {
      inputBuffer: { getChannelData: () => new Float32Array(4096) },
    } as unknown as AudioProcessingEvent;
    act(() => {
      for (let frame = 0; frame < 72; frame += 1) {
        micProcessor?.onaudioprocess?.(silentFrame);
      }
    });
    expect(result.current.state.warning).toMatch(/not hearing any sound/i);

    const audibleSamples = new Float32Array(4096).fill(0.05);
    const audibleFrame = {
      inputBuffer: { getChannelData: () => audibleSamples },
    } as unknown as AudioProcessingEvent;
    act(() => {
      for (let frame = 0; frame < 3; frame += 1) {
        micProcessor?.onaudioprocess?.(audibleFrame);
      }
    });

    expect(result.current.state.warning).toBeNull();
    const statuses = wsInstances[0]!.send.mock.calls
      .map(([raw]) => JSON.parse(String(raw)))
      .filter((message) => message.type === "client_audio_status");
    expect(statuses.filter((message) => message.event === "input_detected")).toHaveLength(1);
  });

  it("does not mistake a quiet built-in microphone for a broken input", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce({
      getAudioTracks: () => [{
        enabled: true,
        stop: vi.fn(),
        label: "MacBook Air Microphone",
        getSettings: () => ({ deviceId: "builtin-input" }),
      }],
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream);
    vi.useFakeTimers();
    const { result } = renderHook(() => useSession());
    act(() => result.current.startSession("ila"));
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });

    const silentFrame = {
      inputBuffer: { getChannelData: () => new Float32Array(4096) },
    } as unknown as AudioProcessingEvent;
    act(() => {
      for (let frame = 0; frame < 72; frame += 1) {
        micProcessor?.onaudioprocess?.(silentFrame);
      }
    });

    expect(result.current.state.warning).toBeNull();
    const statuses = wsInstances[0]!.send.mock.calls
      .map(([raw]) => JSON.parse(String(raw)))
      .filter((message) => message.type === "client_audio_status");
    expect(statuses.filter((message) => message.event === "silent_input")).toHaveLength(0);
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

  it("keeps the server progression snapshot for the level path", async () => {
    const { result } = renderHook(() => useSession());

    act(() => result.current.startSession("reina"));
    const ws = wsInstances[0]!;
    await act(async () => Promise.resolve());

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "progression",
          childId: "reina",
          level: 7,
          currentXP: 42,
          xpToNextLevel: 58,
          totalXP: 642,
          wordsMastered: 12,
          totalWords: 20,
          streakRecord: 3,
          recentTrend: "stable",
        }),
      } as MessageEvent);
    });

    expect(result.current.state.progression).toMatchObject({
      childId: "reina",
      level: 7,
      currentXP: 42,
      xpToNextLevel: 58,
      totalXP: 642,
    });
  });

  it("rejects another child's progression and accepts the scoped end-of-session update", async () => {
    const { result } = renderHook(() => useSession());

    act(() => result.current.startSession("reina"));
    const ws = wsInstances[0]!;
    await act(async () => Promise.resolve());

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "progression",
          childId: "ila",
          level: 9,
          currentXP: 90,
          xpToNextLevel: 10,
          totalXP: 890,
        }),
      } as MessageEvent);
    });
    expect(result.current.state.progression).toBeNull();

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "progression_end",
          childId: "reina",
          level: 4,
          currentXP: 5,
          xpToNextLevel: 95,
          totalXP: 305,
          wordsMastered: 2,
          totalWords: 4,
          streakRecord: 1,
          recentTrend: "improving",
        }),
      } as MessageEvent);
    });
    expect(result.current.state.progression).toMatchObject({
      childId: "reina",
      level: 4,
      totalXP: 305,
      recentTrend: "improving",
    });
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
