import { describe, it, expect } from "vitest";
import {
  isKaraokeReadingAssistSilence,
  type KaraokeAssistSilenceInput,
} from "../hooks/karaokeAssistSilence";

function stateWithCanvas(
  canvas: KaraokeAssistSilenceInput["canvas"],
): KaraokeAssistSilenceInput {
  return {
    phase: "active",
    canvas,
    karaokeStoryComplete: false,
  };
}

describe("isKaraokeReadingAssistSilence", () => {
  it("is false when not karaoke or no words or story complete", () => {
    expect(isKaraokeReadingAssistSilence(stateWithCanvas({ mode: "idle" }))).toBe(
      false,
    );
    expect(
      isKaraokeReadingAssistSilence(
        stateWithCanvas({ mode: "karaoke", karaokeWords: [] }),
      ),
    ).toBe(false);
    expect(
      isKaraokeReadingAssistSilence(
        stateWithCanvas({
          mode: "karaoke",
          karaokeWords: ["a"],
        }),
      ),
    ).toBe(true);
    expect(
      isKaraokeReadingAssistSilence({
        ...stateWithCanvas({ mode: "karaoke", karaokeWords: ["a"] }),
        karaokeStoryComplete: true,
      }),
    ).toBe(false);
  });

  it("is false when phase is not active", () => {
    expect(
      isKaraokeReadingAssistSilence({
        ...stateWithCanvas({ mode: "karaoke", karaokeWords: ["hi"] }),
        phase: "picker",
      }),
    ).toBe(false);
  });

  it("is true for active karaoke with words and story not complete", () => {
    expect(
      isKaraokeReadingAssistSilence(
        stateWithCanvas({ mode: "karaoke", karaokeWords: ["once", "upon"] }),
      ),
    ).toBe(true);
  });
});
