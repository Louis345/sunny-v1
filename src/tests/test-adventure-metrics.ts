import { describe, it, expect } from "vitest";
import type { NodeRating, NodeType } from "../shared/adventureTypes";
import {
  computeAttentionWindow,
  computeDifficultySweetSpot,
  computeEngagementScore,
  computeThemeAffinity,
} from "../engine/adventureMetrics";

function base(parts: Partial<NodeRating> & { nodeType: NodeType }): NodeRating {
  return {
    childId: "qa_metrics",
    sessionDate: "2026-04-10T12:00:00.000Z",
    word: "w",
    theme: "default",
    rating: "like",
    completionTime_ms: 60_000,
    accuracy: 1,
    abandonedEarly: false,
    ...parts,
  };
}

describe("adventureMetrics (TASK-016)", () => {
  it("computeEngagementScore is 1 when all likes, completed, accurate", () => {
    const t: NodeType = "word-builder";
    const ratings = [
      base({ nodeType: t, rating: "like", abandonedEarly: false, accuracy: 1 }),
      base({ nodeType: t, rating: "like", abandonedEarly: false, accuracy: 1 }),
    ];
    expect(computeEngagementScore(ratings, t)).toBe(1);
  });

  it("computeEngagementScore is 0 when all dislikes", () => {
    const t: NodeType = "clock-game";
    const ratings = [
      base({ nodeType: t, rating: "dislike", abandonedEarly: false, accuracy: 0 }),
      base({ nodeType: t, rating: "dislike", abandonedEarly: false, accuracy: 0 }),
    ];
    expect(computeEngagementScore(ratings, t)).toBe(0);
  });

  it("computeEngagementScore is between 0 and 1 for mixed", () => {
    const t: NodeType = "riddle";
    const ratings = [
      base({ nodeType: t, rating: "like", accuracy: 1 }),
      base({ nodeType: t, rating: "dislike", accuracy: 0.4 }),
    ];
    const s = computeEngagementScore(ratings, t);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it("computeThemeAffinity is higher for a liked theme", () => {
    const good = [
      base({ theme: "beach", rating: "like", nodeType: "word-builder" }),
      base({ theme: "beach", rating: "like", nodeType: "word-builder" }),
    ];
    const bad = [
      base({ theme: "space", rating: "dislike", nodeType: "spell-check" }),
      base({ theme: "space", rating: "dislike", nodeType: "spell-check" }),
    ];
    expect(computeThemeAffinity(good, "beach")).toBeGreaterThan(
      computeThemeAffinity(bad, "space"),
    );
  });

  it("computeAttentionWindow([]) returns default 300000", () => {
    expect(computeAttentionWindow([])).toBe(300_000);
  });

  it("computeAttentionWindow(all abandoned) uses those completion times", () => {
    const ratings: NodeRating[] = [
      base({
        nodeType: "riddle",
        abandonedEarly: true,
        completionTime_ms: 120_000,
      }),
    ];
    expect(computeAttentionWindow(ratings)).toBe(120_000);
  });

  it("computeDifficultySweetSpot returns 1|2|3", () => {
    const ratings: NodeRating[] = [
      base({ nodeType: "riddle", rating: "like" }),
      base({ nodeType: "word-builder", rating: "dislike" }),
      base({ nodeType: "boss", rating: "like" }),
    ];
    const d = computeDifficultySweetSpot(ratings);
    expect([1, 2, 3].includes(d)).toBe(true);
  });
});
