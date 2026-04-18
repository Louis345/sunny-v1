import { describe, it, expect } from "vitest";
import { buildProfile } from "../profiles/buildProfile";
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
});
