import { describe, expect, it } from "vitest";
import {
  asGestureProfile,
  asVoiceOptions,
} from "../scripts/ingestCompanions";

describe("ingestCompanions showroom fields", () => {
  it("emits showroom voice choices and keeps the companion voice as fallback", () => {
    const voices = asVoiceOptions(
      {
        voices: [
          {
            id: "voice_child_pick",
            label: "Sparkly Voice",
            language: "en",
            default: true,
          },
        ],
      },
      { voiceId: "voice_from_companion" },
      "Melty",
    );

    expect(voices).toEqual([
      {
        id: "voice_child_pick",
        label: "Sparkly Voice",
        language: "en",
        default: true,
      },
    ]);
  });

  it("falls back to companion.json voice when showroom voices are missing", () => {
    expect(asVoiceOptions({}, { voiceId: "voice_from_companion" }, "Towa")).toEqual([
      {
        id: "voice_from_companion",
        label: "Towa Voice",
        language: "en",
        default: true,
      },
    ]);
  });

  it("emits a JSON-controlled special dance with safe fallback", () => {
    expect(
      asGestureProfile({
        meet: "wave",
        intro: ["think"],
        plead: ["wave"],
        specialDance: "salsa_dancing",
      }),
    ).toEqual({
      meet: "wave",
      intro: ["think"],
      plead: ["wave"],
      specialDance: "salsa_dancing",
    });

    expect(asGestureProfile({ specialDance: "" }).specialDance).toBe("dance_victory");
  });
});
