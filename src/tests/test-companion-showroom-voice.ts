import { describe, expect, it } from "vitest";
import { resolveAllowedShowroomVoiceId } from "../server/companionShowroomVoice";

describe("companion showroom voice selection", () => {
  const voices = [
    { id: "voice_a", label: "Voice A", language: "en", default: true },
    { id: "voice_b", label: "Voice B", language: "en" },
  ];

  it("uses selected voice when it belongs to that companion", () => {
    expect(resolveAllowedShowroomVoiceId("voice_b", voices, "fallback")).toBe("voice_b");
  });

  it("falls back when no selected voice is sent", () => {
    expect(resolveAllowedShowroomVoiceId(undefined, voices, "fallback")).toBe("voice_a");
  });

  it("rejects a voice id that is not listed for that companion", () => {
    expect(() =>
      resolveAllowedShowroomVoiceId("stranger_voice", voices, "fallback"),
    ).toThrow("voice_not_allowed");
  });
});
