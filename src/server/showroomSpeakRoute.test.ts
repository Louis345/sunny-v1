import { describe, expect, it } from "vitest";
import {
  normalizeShowroomBanterSpeechText,
  shouldUseShowroomBanterSpeech,
} from "./routes";

describe("showroom companion speak route", () => {
  it("allows only short explicit video-game banter text through the voice route", () => {
    expect(
      shouldUseShowroomBanterSpeech({
        source: "video_game_banter",
        text: "Nice corner move. I need to think.",
      }),
    ).toBe(true);
    expect(
      shouldUseShowroomBanterSpeech({
        source: "showroom_intro",
        text: "Nice corner move. I need to think.",
      }),
    ).toBe(false);
    expect(
      shouldUseShowroomBanterSpeech({
        source: "video_game_banter",
        text: "",
      }),
    ).toBe(false);
  });

  it("normalizes and caps voiced game banter so arbitrary text cannot balloon TTS cost", () => {
    expect(normalizeShowroomBanterSpeechText("  my   turn, tiny sparkle.  ")).toBe(
      "my turn, tiny sparkle.",
    );
    expect(normalizeShowroomBanterSpeechText("x".repeat(220))).toHaveLength(180);
    expect(normalizeShowroomBanterSpeechText(42)).toBe("");
  });
});
