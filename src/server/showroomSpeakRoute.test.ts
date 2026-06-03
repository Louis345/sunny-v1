import { describe, expect, it } from "vitest";
import {
  normalizeShowroomBanterSpeechText,
  readShowroomPersonality,
  shouldUseShowroomBanterSpeech,
} from "./routes";

describe("showroom companion speak route", () => {
  it("allows short explicit game banter and video-call greeting text through the voice route", () => {
    expect(
      shouldUseShowroomBanterSpeech({
        source: "video_game_banter",
        text: "Nice corner move. I need to think.",
      }),
    ).toBe(true);
    expect(
      shouldUseShowroomBanterSpeech({
        source: "video_call_greeting",
        text: "Hiii Ila! I was hoping you'd call.",
      }),
    ).toBe(true);
    expect(
      shouldUseShowroomBanterSpeech({
        source: "video_presence_reaction",
        text: "Nice block. I felt that one.",
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

  it("builds companion talk personality from the full showroom profile, not only one sentence", () => {
    const personality = readShowroomPersonality("elli", "");

    expect(personality).toContain("Warm, funny, playful");
    expect(personality).toContain("Tags: sparkly, funny, brave");
    expect(personality).toContain("Likes: riddles, word games, silly ideas");
    expect(personality).toContain("Catchphrases: Let's try it together!");
    expect(personality).toContain("Role: Ila's best friend and learning buddy");
  });
});
