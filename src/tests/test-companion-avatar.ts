import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { buildProfile } from "../profiles/buildProfile";
import {
  clearChildrenConfigCache,
  companionConfigFromPreset,
  readChildrenConfig,
} from "../profiles/childrenConfig";
import { isDopamineGameUrl } from "../shared/companionIframeGuards";
import { buildNodeUrlSearchParams } from "../shared/nodeRegistry";

describe("companion VRM / children.config (TASK companion-avatar)", () => {
  beforeEach(() => {
    clearChildrenConfigCache();
  });

  it("companion vrmUrl comes from children.config preset (not learning_profile legacy path)", async () => {
    const p = await buildProfile("reina");
    expect(p?.companion.vrmUrl).toBe("/companions/sample.vrm");
    const cfg = readChildrenConfig();
    const matilda = companionConfigFromPreset("matilda", cfg.companions.matilda);
    expect(matilda.vrmUrl).toBe("/companions/sample.vrm");
  });

  it("dopamine games skip predicate matches launched URL substrings", () => {
    const games = ["space-invaders", "asteroid", "space-frogger"];
    expect(isDopamineGameUrl("/games/space-invaders.html?x=1", games)).toBe(true);
    expect(isDopamineGameUrl("/games/word-builder.html", games)).toBe(false);
    expect(isDopamineGameUrl(null, games)).toBe(false);
  });

  it("buildNodeUrlSearchParams sets companionVrmUrl once (URLSearchParams encodes in toString)", () => {
    const params = buildNodeUrlSearchParams(
      { id: "n1", words: ["a"], difficulty: 1 },
      {
        childId: "ila",
        companion: "elli",
        previewParam: "false",
        vrmUrl: "/companions/sample.vrm",
        companionMuted: false,
      },
    );
    expect(params.get("companionVrmUrl")).toBe("/companions/sample.vrm");
    expect(params.get("companionMuted")).toBe("false");
  });

  it("no hardcoded /characters/ paths in web/src components (PNG avatars removed)", () => {
    const root = path.join(process.cwd(), "web", "src");
    const bad: string[] = [];
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === "node_modules") continue;
          walk(full);
        } else if (/\.(tsx|ts|jsx|js)$/.test(ent.name)) {
          const text = fs.readFileSync(full, "utf8");
          if (text.includes("/characters/") && text.includes(".png")) {
            bad.push(path.relative(process.cwd(), full));
          }
        }
      }
    };
    walk(root);
    expect(bad, `Remove PNG character paths from: ${bad.join(", ")}`).toEqual([]);
  });
});
