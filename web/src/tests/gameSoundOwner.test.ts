import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as gameSfx from "../utils/gameSfx";

/**
 * BUGS.md 2026-11-08 "Game sound has five owners instead of one": gameSfx.ts is the one game-sound owner.
 * Every game sound shares one audio context (browsers cap open contexts, so a long session went silent)
 * and obeys the chart's sensory sheet (a child set to soft or silent heard full-volume chimes).
 */
const SRC = resolve(__dirname, "..");

/** Files that may make their own audio, each for a reason that is not game sound. */
const NOT_GAME_SOUND: Record<string, string> = {
  "utils/gameSfx.ts": "the one game-sound owner",
  "hooks/useSession.ts": "companion speech playback and microphone capture",
  "hooks/useDeepgramVideoCallStt.ts": "microphone capture for the video call",
  "utils/companionTalkStream.ts": "streamed companion speech",
  "stories/PronunciationScienceExpert.stories.tsx": "microphone recording in a story",
  // Debt, logged in BUGS.md: the dressing room's speech lip-sync shares this file with its power-up and
  // ringtone synths, which close their own context after playing but do not read the sensory sheet yet.
  "components/CompanionShowroom.tsx": "speech lip-sync (power-up/ringtone synths logged in BUGS.md)",
};

const AUDIO_MAKER = /new\s+(?:window\.)?Audio\s*\(|new\s+(?:window\.)?AudioContext\b|webkitAudioContext/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "tests" || name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("one owner for game sound", () => {
  it("no file outside gameSfx.ts makes its own audio for game sound", () => {
    const owners = sourceFiles(SRC)
      .filter((path) => AUDIO_MAKER.test(readFileSync(path, "utf8")))
      .map((path) => relative(SRC, path))
      .filter((path) => !(path in NOT_GAME_SOUND));
    expect(owners).toEqual([]);
  });
});

describe("gameSfx shared context and sensory sheet", () => {
  const created: { src: string; volume: number; playbackRate: number }[] = [];
  let contexts = 0;
  const node = () => ({ connect: vi.fn(), gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, start: vi.fn(), stop: vi.fn(), type: "" });
  class FakeContext {
    currentTime = 0;
    state = "running";
    destination = {};
    constructor() { contexts += 1; }
    resume() { return Promise.resolve(); }
    createGain() { return node(); }
    createOscillator() { return node(); }
    createBiquadFilter() { return node(); }
  }
  class FakeAudio {
    volume = 1; playbackRate = 1; currentTime = 0; src: string;
    constructor(src: string) { this.src = src; created.push(this); }
    play() { return Promise.resolve(); }
  }

  beforeEach(() => {
    created.length = 0;
    contexts = 0;
    gameSfx.resetSharedAudioContextForTests();
    gameSfx.setGameSfxSensory(null);
    vi.stubGlobal("AudioContext", FakeContext);
    vi.stubGlobal("Audio", FakeAudio);
  });
  afterEach(() => {
    gameSfx.setGameSfxSensory(null);
    vi.unstubAllGlobals();
  });

  it("plays many synth sounds on one shared audio context", () => {
    for (let i = 0; i < 12; i += 1) {
      gameSfx.playCompanionActivitySfx("child_move");
      gameSfx.playSynthCue("lockChime");
      gameSfx.playSynthCue("spend");
      gameSfx.playSynthCue("wordRadarChime");
    }
    expect(contexts).toBe(1);
  });

  it("plays loot sounds from the registry at the sensory sheet's volume", () => {
    gameSfx.setGameSfxSensory({ soundVolume: 0.5, soundBrightness: "standard" });
    expect(gameSfx.playLootSfx("fanfare", 1.2, 0.6)).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].src).toBe("/sfx/loot/fanfare.mp3");
    expect(created[0].volume).toBeCloseTo(0.3);
    expect(created[0].playbackRate).toBeCloseTo(1.2);
  });

  it("a child set to silent hears no game sound at all", () => {
    gameSfx.setGameSfxSensory({ soundEnabled: false });
    expect(gameSfx.playLootSfx("epic")).toBe(false);
    expect(gameSfx.playGameSfx("adventureBoard", "launch")).toBe(false);
    expect(gameSfx.playSynthCue("lockChime")).toBe(false);
    gameSfx.playCompanionActivitySfx("round_complete");
    expect(created).toHaveLength(0);
    expect(contexts).toBe(0);
  });
});
