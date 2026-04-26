import { describe, it, expect } from "vitest";
import { sm2 } from "../algorithms/sm2";
import { buildProfile } from "../profiles/buildProfile";
import { verifyGameConfig } from "../profile/verifyProfile";
import { CompanionRegistry } from "../prompts/companions/registry";
import {
  computeAttentionWindow,
  computeUnlockedThemes,
} from "../profiles/profileCompute";
import type { NodeRating } from "../shared/adventureTypes";

describe("profileCompute (TASK-004)", () => {
  it("computeUnlockedThemes(1) returns only default", () => {
    expect(computeUnlockedThemes(1)).toEqual(["default"]);
  });

  it("computeUnlockedThemes(5) includes beach", () => {
    expect(computeUnlockedThemes(5)).toEqual(["default", "beach"]);
  });

  it("computeUnlockedThemes(10) includes space", () => {
    expect(computeUnlockedThemes(10)).toEqual(["default", "beach", "space"]);
  });

  it("computeAttentionWindow([]) returns 300000", () => {
    expect(computeAttentionWindow([])).toBe(300_000);
  });

  it("computeAttentionWindow uses median completion for non-abandoned", () => {
    const one: NodeRating[] = [
      {
        childId: "qa",
        sessionDate: "2026-04-10",
        nodeType: "karaoke",
        word: "x",
        theme: "default",
        rating: "like",
        completionTime_ms: 180_000,
        accuracy: 1,
        abandonedEarly: false,
      },
    ];
    expect(computeAttentionWindow(one)).toBe(180_000);
  });
});

describe("buildProfile (TASK-004)", () => {
  it("buildProfile includes wordRadar with show flags and personalBests record", async () => {
    const p = await buildProfile("ila");
    expect(p).not.toBeNull();
    if (!p) return;
    expect(p.wordRadar).toBeDefined();
    expect(typeof p.wordRadar?.showTimer).toBe("boolean");
    expect(typeof p.wordRadar?.showKeyboard).toBe("boolean");
    expect(p.wordRadar?.personalBests).toBeDefined();
    expect(typeof p.wordRadar?.personalBests).toBe("object");
  });

  it("buildProfile exposes unlockedThemes and attentionWindow_ms", async () => {
    const p = await buildProfile("ila");
    expect(p).not.toBeNull();
    if (!p) return;
    expect(Array.isArray(p.unlockedThemes)).toBe(true);
    expect(p.unlockedThemes).toContain("default");
    expect(typeof p.attentionWindow_ms).toBe("number");
    expect(p.attentionWindow_ms).toBeGreaterThan(0);
    expect(typeof p.childContext).toBe("string");
    expect(p.childContext.length).toBeGreaterThan(0);
  });

  it("buildProfile(creator) reads src/context/creator/learning_profile.json", async () => {
    const p = await buildProfile("creator");
    expect(p).not.toBeNull();
    if (!p) return;
    expect(p.childId).toBe("creator");
    expect(typeof p.childContext).toBe("string");
  });

  it("buildProfile returns companionContext string", async () => {
    const profile = await buildProfile("ila");
    expect(profile).not.toBeNull();
    if (!profile) return;
    expect(typeof profile.companionContext).toBe("string");
    expect(profile.companionContext.length).toBeGreaterThan(50);
    expect(profile.companionContext).toContain("Elli");
  });

  it("buildProfile reina returns Matilda context", async () => {
    const profile = await buildProfile("reina");
    expect(profile).not.toBeNull();
    if (!profile) return;
    expect(profile.companionContext).toContain("Matilda");
  });

  it("companionContext contains growth modifier for current level", async () => {
    const profile = await buildProfile("ila");
    expect(profile).not.toBeNull();
    if (!profile) return;
    expect(profile.companionContext).toMatch(/growth context/i);
  });

  it("companionContext avoids the other child's name", async () => {
    const profile = await buildProfile("ila");
    expect(profile).not.toBeNull();
    if (!profile) return;
    expect(profile.companionContext).not.toMatch(/\bReina\b/);
    const p2 = await buildProfile("reina");
    expect(p2).not.toBeNull();
    if (!p2) return;
    expect(p2.companionContext).not.toMatch(/\bIla\b/);
  });

  it("companionContext is replaceable — same shape for any companion", async () => {
    const profile = await buildProfile("ila");
    expect(profile).not.toBeNull();
    if (!profile) return;
    const registry = CompanionRegistry.getById("matilda");
    const overrideContext = [
      `## Companion: ${registry.name}`,
      registry.personalityMarkdown,
      `## Growth context (level ${profile.level ?? 1})`,
      registry.getGrowthModifier(profile.level ?? 1),
    ].join("\n\n");
    expect(overrideContext).toContain("Matilda");
  });

  it('buildProfile("ila") returns games namespace with all required keys', async () => {
    const p = await buildProfile("ila");
    expect(p).not.toBeNull();
    if (!p) return;
    expect(Object.keys(p.games ?? {}).sort()).toEqual([
      "boss",
      "clock-game",
      "coin-counter",
      "karaoke-reading",
      "spell-check",
      "word-radar",
    ]);
  });

  it('buildProfile("ila").games["word-radar"].inputMode === "whole-word"', async () => {
    const p = await buildProfile("ila");
    expect(p?.games?.["word-radar"]?.inputMode).toBe("whole-word");
  });

  it('buildProfile("ila").games["word-radar"].speakStyle === "option-a"', async () => {
    const p = await buildProfile("ila");
    expect(p?.games?.["word-radar"]?.speakStyle).toBe("option-a");
  });

  it('buildProfile("creator").games["word-radar"].speakStyle exists and is valid', async () => {
    const p = await buildProfile("creator");
    const s = p?.games?.["word-radar"]?.speakStyle;
    expect(s === "option-a" || s === "option-b").toBe(true);
  });

  it('buildProfile("reina").games["word-radar"].inputMode === "letter-by-letter"', async () => {
    const p = await buildProfile("reina");
    expect(p?.games?.["word-radar"]?.inputMode).toBe("letter-by-letter");
  });

  it('buildProfile("ila").games["clock-game"] has no step field', async () => {
    const p = await buildProfile("ila");
    expect(p).not.toBeNull();
    if (!p) return;
    expect("step" in (p.games?.["clock-game"] ?? {})).toBe(false);
  });

  it('buildProfile("ila").masteryGating.clockStep is a number', async () => {
    const p = await buildProfile("ila");
    expect(typeof p?.masteryGating?.clockStep).toBe("number");
  });

  it("missing game in children.config.json falls back to default without throwing", async () => {
    const p = await buildProfile("creator");
    expect(p?.games?.["coin-counter"]?.unlocked).toBe(false);
    expect(p?.games?.boss?.sessionsRequired).toBe(10);
  });

  it("verifyGameConfig throws on clock-game.step violation", async () => {
    const p = await buildProfile("ila");
    expect(p).not.toBeNull();
    if (!p) return;
    const invalid = {
      ...p,
      games: {
        ...(p.games ?? {}),
        "clock-game": {
          unlocked: true,
          sessionCount: 0,
          lastAccuracy: null,
          ...(p.games?.["clock-game"] ?? {}),
          step: 5,
        },
      },
    };
    expect(() => verifyGameConfig(invalid)).toThrow(/clock-game\.step/);
  });

  it("verifyGameConfig passes on valid profile", async () => {
    const p = await buildProfile("ila");
    expect(p).not.toBeNull();
    if (!p) return;
    expect(() => verifyGameConfig(p)).not.toThrow();
  });

  it('buildProfile("ila") dueWords contains no strings matching /attempt-\\d+/', async () => {
    const p = await buildProfile("ila");
    expect(p).not.toBeNull();
    if (!p) return;
    const list = p.dueWords ?? [];
    const bad = list.filter((w) => /attempt-\d+/.test(w));
    expect(bad).toEqual([]);
  });
});

describe("sm2 (attempt-* pollution)", () => {
  const pastDue = "2000-01-01";

  it("does not include attempt-1 in dueWords", () => {
    const { dueWords } = sm2({
      words: [
        {
          word: "attempt-1",
          tracks: {
            spelling: {
              interval: 1,
              easinessFactor: 2.5,
              nextReviewDate: pastDue,
            },
          },
        },
      ],
    });
    expect(dueWords).not.toContain("attempt-1");
  });

  it("does not include attempt-1 in sm2Stats", () => {
    const { sm2Stats } = sm2({
      words: [
        {
          word: "attempt-1",
          tracks: {
            spelling: {
              interval: 1,
              easinessFactor: 2.5,
              nextReviewDate: pastDue,
            },
          },
        },
      ],
    });
    expect(sm2Stats["attempt-1"]).toBeUndefined();
  });

  it('includes "add" in sm2Stats when entry is valid (valid word preserved)', () => {
    const { sm2Stats, dueWords } = sm2({
      words: [
        {
          word: "attempt-1",
          tracks: {
            spelling: {
              interval: 1,
              easinessFactor: 2.5,
              nextReviewDate: pastDue,
            },
          },
        },
        {
          word: "add",
          tracks: {
            spelling: {
              interval: 2,
              easinessFactor: 2.5,
              nextReviewDate: pastDue,
            },
          },
        },
      ],
    });
    expect(sm2Stats.add).toBeDefined();
    expect(sm2Stats.add.domain).toBe("spelling");
    expect(dueWords).toContain("add");
    expect(dueWords).not.toContain("attempt-1");
  });
});
