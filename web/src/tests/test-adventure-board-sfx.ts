import { describe, expect, it } from "vitest";

import {
  GAME_SFX,
  playAdventureBoardSfx,
  playAdventureBoardUnlockSfx,
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

  it("owns the rotating unlock motifs in the shared sound system", () => {
    expect(typeof playAdventureBoardUnlockSfx).toBe("function");
  });
});
