import { describe, expect, it } from "vitest";
import {
  asGestureProfile,
  asVoiceOptions,
  buildManifestCompanionConfig,
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

  it("uses the diag preset companion config when a showroom companion shares that id", () => {
    const config = buildManifestCompanionConfig(
      "elli",
      "/companions/showroom-elli.vrm",
      {
        companions: {
          elli: {
            id: "elli",
            vrmUrl: "/companions/diag-elli.vrm",
            expressions: { idle: "neutral", happy: "joy" },
            faceCamera: { position: [0, 1.4, 0.8], target: [0, 1.4, 0] },
            dopamineGames: ["asteroid"],
          },
        },
      },
    );

    expect(config.companionId).toBe("elli");
    expect(config.vrmUrl).toBe("/companions/diag-elli.vrm");
    expect(config.expressions.happy).toBe("joy");
  });

  it("falls back to the showroom VRM path when no diag preset exists", () => {
    const config = buildManifestCompanionConfig(
      "melty",
      "/companions/melty.vrm",
      {
        companions: {},
      },
    );

    expect(config.companionId).toBe("melty");
    expect(config.vrmUrl).toBe("/companions/melty.vrm");
    expect(config.expressions.idle).toBe("neutral");
  });
});
