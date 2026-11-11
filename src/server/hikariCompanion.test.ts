import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CompanionRegistry } from "../prompts/companions/registry";
import { readShowroomPersonality } from "./routes";
import { buildShowroomTalkSystemPrompt } from "./companionShowroomTalk";

// Owner-reported 2026-11-09: in FaceTime the angel (silver-blue hair, halo, pink jacket) was shown as "Matilda",
// the name of Reina's homework companion. Ila calls the angel and picked her own voice. Why the human caught it:
// Ila hears and sees the name; the logs only carried companion=matilda, which looked correct. The lab had no rule
// that one showroom character is not another child's homework companion. Rule now: the angel is Hikari, her own
// companion with her own voice, and Reina's Matilda is untouched.
const HIKARI_VOICE = "d8WcCpplp8meHt10UhL8";
const ANGEL_MODEL = "/companions/673852811403133503.vrm";

describe("Hikari, the angel companion", () => {
  it("is her own companion with her own name, voice and the angel model", () => {
    const hikari = CompanionRegistry.getById("hikari");
    expect(hikari.name).toBe("Hikari");
    expect(hikari.voiceId).toBe(HIKARI_VOICE);
    expect(hikari.vrmPath).toBe(ANGEL_MODEL);
    expect(hikari.ttsName).toBeTruthy();
    expect(hikari.unlockCost).toBe(0);
    expect(hikari.showInShowroom).toBe(true);
    expect(hikari.personalityMarkdown).toContain("Hikari");
    expect(hikari.personalityMarkdown).not.toMatch(/Matilda|Reina/);
    expect(hikari.getGrowthModifier(1)).toBeTruthy();
  });

  // Owner decision 2026-11-10: Matilda is Hikari (matildaIsHikari.test.ts). Reina's companion is Hikari now.
  it("is Reina's companion, and the old id matilda reaches her", () => {
    expect(CompanionRegistry.getById("matilda").id).toBe("hikari");
    expect(CompanionRegistry.getAll().filter(c => c.defaultFor === "reina").map(c => c.id)).toEqual(["hikari"]);
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "children.config.json"), "utf8")) as {
      childCompanionIds: Record<string, string>;
    };
    expect(config.childCompanionIds.reina).toBe("hikari");
  });

  it("offers Hikari's chosen voice as her default FaceTime voice", () => {
    const showroom = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "src/prompts/companions/hikari/showroom.json"), "utf8"),
    ) as { voices: { id: string; default?: boolean }[]; scripts: { en: { intro: string } } };
    expect(showroom.voices.filter(v => v.default).map(v => v.id)).toEqual([HIKARI_VOICE]);
    expect(showroom.scripts.en.intro).toMatch(/^Hi! I'm Hikari/);
  });

  it("introduces herself as Hikari in a FaceTime talk turn, never as Matilda", () => {
    const hikari = CompanionRegistry.getById("hikari");
    const showroomPersonality = readShowroomPersonality(hikari.id, hikari.personalityMarkdown);
    expect(showroomPersonality).not.toMatch(/Matilda|Reina/);
    const system = buildShowroomTalkSystemPrompt({
      companionId: hikari.id,
      companionName: hikari.name,
      showroomTheme: "sky",
      personality: [hikari.personalityMarkdown.trim(), showroomPersonality].join("\n"),
      mode: "video_call",
      callSource: "showroom",
      relationshipState: "previewing",
    });
    expect(system).toContain("You are Hikari");
    expect(system).not.toMatch(/Matilda|Reina/);
  });
});
