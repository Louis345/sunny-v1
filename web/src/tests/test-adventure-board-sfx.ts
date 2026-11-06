import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GAME_SFX,
  playAdventureBoardSfx,
  playUnlockCeremonySfx,
} from "../utils/gameSfx";

describe("Adventure Board sound", () => {
  it("uses short recorded cues for launch, replay, and locked feedback", () => {
    expect(GAME_SFX.adventureBoard).toEqual({
      launch: "/sfx/pronunciation/replay_start.wav",
      replay: "/sfx/pronunciation/combo.wav",
      locked: "/sfx/pronunciation/miss_thunk.wav",
    });
    expect(Object.values(GAME_SFX.adventureBoard).every((src) => !src.startsWith("synth:"))).toBe(true);
    expect(typeof playAdventureBoardSfx).toBe("function");
  });

  // The approved unlock ceremony (owner, 2026-11-03) uses its recorded sounds on its own timeline:
  // rumble, riser, the boom as the node bursts out, coins along the path, then the fanfare (Quest) or the boss hit.
  describe("approved unlock ceremony sound", () => {
    const played: string[] = [];
    afterEach(() => { played.length = 0; vi.useRealTimers(); vi.unstubAllGlobals(); });
    const stubAudio = () => vi.stubGlobal("Audio", class { volume = 1; playbackRate = 1; constructor(src: string) { played.push(src); } play() { return Promise.resolve(); } });

    it("plays the Quest timeline with its fanfare", () => {
      vi.useFakeTimers(); stubAudio();
      expect(playUnlockCeremonySfx("quest")).toBe(true);
      expect(played).toEqual(["/sfx/unlock/rumble.mp3"]);
      vi.advanceTimersByTime(3500);
      expect(played).toContain("/sfx/unlock/riser.mp3");
      expect(played).toContain("/sfx/unlock/boom.mp3");
      expect(played.filter((src) => src === "/sfx/unlock/coin.mp3")).toHaveLength(12);
      expect(played).toContain("/sfx/unlock/fanfare.mp3");
      expect(played).not.toContain("/sfx/unlock/boss.mp3");
    });

    it("plays the Boss timeline with its boss hit instead of the fanfare", () => {
      vi.useFakeTimers(); stubAudio();
      playUnlockCeremonySfx("boss");
      vi.advanceTimersByTime(3500);
      expect(played).toContain("/sfx/unlock/boss.mp3");
      expect(played).toContain("/sfx/unlock/boom.mp3");
      expect(played).not.toContain("/sfx/unlock/fanfare.mp3");
    });
  });
});
