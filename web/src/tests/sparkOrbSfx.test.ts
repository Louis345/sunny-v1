import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SENSORY_PROFILE } from "../../../src/shared/sensoryProfile";
import { GAME_SFX, resetSharedAudioContextForTests } from "../utils/gameSfx";
import { playSparkOrbSfx, startSparkOrbPullTone } from "../utils/sparkOrbSfx";

class FakeParam {
  value = 0;
  setValueAtTime = vi.fn((value: number) => {
    this.value = value;
  });
  linearRampToValueAtTime = vi.fn((value: number) => {
    this.value = value;
  });
  exponentialRampToValueAtTime = vi.fn((value: number) => {
    this.value = value;
  });
  setTargetAtTime = vi.fn((value: number) => {
    this.value = value;
  });
  cancelScheduledValues = vi.fn();
}

class FakeNode {
  frequency = new FakeParam();
  gain = new FakeParam();
  Q = new FakeParam();
  type = "";
  buffer: unknown = null;
  connect = vi.fn((next: unknown) => next);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

const fakeContexts: FakeAudioContext[] = [];

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 8_000;
  state = "running";
  destination = new FakeNode();
  oscillators: FakeNode[] = [];
  filters: FakeNode[] = [];
  gains: FakeNode[] = [];
  constructor() {
    fakeContexts.push(this);
  }
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
  createOscillator() {
    const node = new FakeNode();
    this.oscillators.push(node);
    return node;
  }
  createGain() {
    const node = new FakeNode();
    this.gains.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new FakeNode();
    this.filters.push(node);
    return node;
  }
  createBufferSource() {
    return new FakeNode();
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
}

function stubAudioFile() {
  const instances: HTMLAudioElement[] = [];
  const AudioMock = vi.fn(function AudioMock(this: HTMLAudioElement, src: string) {
    this.src = src;
    this.volume = 1;
    this.playbackRate = 1;
    this.currentTime = 0;
    this.play = vi.fn().mockResolvedValue(undefined);
    instances.push(this);
  });
  vi.stubGlobal("Audio", AudioMock);
  return { AudioMock, instances };
}

describe("playSparkOrbSfx", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetSharedAudioContextForTests();
    fakeContexts.length = 0;
  });

  it("shares one audio context across every sound instead of opening one per sound", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("Audio", undefined);
    playSparkOrbSfx("grab");
    playSparkOrbSfx("launch");
    playSparkOrbSfx("chirp");
    playSparkOrbSfx("impact");
    expect(fakeContexts).toHaveLength(1);
    expect(fakeContexts[0].oscillators.length).toBeGreaterThan(3);
  });

  it("plays the recorded big-moment sounds from the shared sound registry by default", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const { AudioMock } = stubAudioFile();
    playSparkOrbSfx("captureLock");
    playSparkOrbSfx("collected");
    playSparkOrbSfx("perfect");
    expect(AudioMock.mock.calls.map((call) => call[0])).toEqual([
      GAME_SFX.sparkOrb.captureLock,
      GAME_SFX.sparkOrb.collected,
      GAME_SFX.sparkOrb.perfect,
    ]);
  });

  it("stays silent when the child's sensory sheet turns sound off", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const { AudioMock } = stubAudioFile();
    const sensory = { ...DEFAULT_SENSORY_PROFILE, soundEnabled: false };
    playSparkOrbSfx("collected", { sensory });
    playSparkOrbSfx("launch", { sensory });
    expect(startSparkOrbPullTone({ sensory })).toBeNull();
    expect(AudioMock).not.toHaveBeenCalled();
    expect(fakeContexts).toHaveLength(0);
  });

  it("scales loudness by the sensory volume and varies pitch slightly each play", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const { instances } = stubAudioFile();
    vi.spyOn(Math, "random").mockReturnValue(1);
    playSparkOrbSfx("collected", { sensory: { ...DEFAULT_SENSORY_PROFILE, soundVolume: 0.5 } });
    expect(instances[0].volume).toBeCloseTo(0.41, 2);
    expect(instances[0].playbackRate).toBeGreaterThan(1);
    expect(instances[0].playbackRate).toBeLessThanOrEqual(1.06);
  });

  it("softens synth sounds with a low-pass filter for a soft sensory sheet", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    playSparkOrbSfx("impact", { sensory: { ...DEFAULT_SENSORY_PROFILE, soundBrightness: "soft" } });
    const lowpassCutoffs = () =>
      fakeContexts[0].filters.filter((filter) => filter.type === "lowpass").map((filter) => filter.frequency.value);
    const softCutoff = lowpassCutoffs()[0];
    playSparkOrbSfx("impact", { sensory: { ...DEFAULT_SENSORY_PROFILE, soundBrightness: "bright" } });
    const brightCutoff = lowpassCutoffs().at(-1)!;
    expect(softCutoff).toBeLessThanOrEqual(2_600);
    expect(brightCutoff).toBeGreaterThan(softCutoff);
  });

  it("pull tone rises with the pull and stops exactly once", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const tone = startSparkOrbPullTone();
    expect(tone).not.toBeNull();
    const oscillator = fakeContexts[0].oscillators[0];
    tone!.update(0.1);
    const low = oscillator.frequency.value;
    tone!.update(1);
    expect(oscillator.frequency.value).toBeGreaterThan(low);
    tone!.stop();
    tone!.stop();
    expect(oscillator.stop).toHaveBeenCalledTimes(1);
  });

  it("plays an optional audio file when a sound asset is configured", () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const audioInstances: HTMLAudioElement[] = [];
    const AudioMock = vi.fn(function AudioMock(this: HTMLAudioElement, src: string) {
      this.src = src;
      this.volume = 1;
      this.currentTime = 0;
      this.play = play;
      audioInstances.push(this);
    });
    vi.stubGlobal("Audio", AudioMock);

    playSparkOrbSfx("collected", {
      audioMode: "file",
      audioAssets: {
        collected: "/encounters/spark-orb/sfx/collection-boom.mp3",
      },
      volume: 0.42,
      sensory: { ...DEFAULT_SENSORY_PROFILE, soundVolume: 1 },
    });

    expect(AudioMock).toHaveBeenCalledWith("/encounters/spark-orb/sfx/collection-boom.mp3");
    expect(audioInstances[0]?.volume).toBe(0.42);
    expect(play).toHaveBeenCalled();
  });

  it("logs optional audio file playback failures instead of swallowing them", async () => {
    const error = new Error("blocked");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const AudioMock = vi.fn(function AudioMock(this: HTMLAudioElement, src: string) {
      this.src = src;
      this.play = vi.fn().mockRejectedValue(error);
    });
    vi.stubGlobal("Audio", AudioMock);

    playSparkOrbSfx("launch", {
      audioMode: "file",
      audioAssets: {
        launch: "/encounters/spark-orb/sfx/orb-launch.mp3",
      },
    });
    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith(
      " 🎮 [spark-orb-sfx] [file] [failed]",
      expect.objectContaining({ id: "launch", error }),
    );
  });
});
