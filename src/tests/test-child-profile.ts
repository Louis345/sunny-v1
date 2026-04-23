import { describe, it, expect } from "vitest";
import { buildProfile } from "../profiles/buildProfile";
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

  it("companionContext contains no hardcoded child names", async () => {
    const profile = await buildProfile("ila");
    expect(profile).not.toBeNull();
    if (!profile) return;
    expect(profile.companionContext).not.toMatch(/\bIla\b/);
    expect(profile.companionContext).not.toMatch(/\bReina\b/);
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
});
