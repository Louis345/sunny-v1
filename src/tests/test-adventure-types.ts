import { describe, it, expect } from "vitest";
import { z } from "zod";
import type {
  NodeConfig,
  NodeRating,
  SessionTheme,
} from "../shared/adventureTypes";

const nodeRatingSchema = z.object({
  childId: z.string(),
  sessionDate: z.string(),
  nodeType: z.string(),
  word: z.string(),
  theme: z.string(),
  rating: z.enum(["like", "dislike"]),
  completionTime_ms: z.number(),
  accuracy: z.number(),
  abandonedEarly: z.boolean(),
});

describe("adventure types (TASK-003)", () => {
  it("NodeRating shape validates with zod", () => {
    const sample: NodeRating = {
      childId: "qa",
      sessionDate: "2026-04-10T12:00:00.000Z",
      nodeType: "karaoke",
      word: "cat",
      theme: "default",
      rating: "like",
      completionTime_ms: 120_000,
      accuracy: 0.9,
      abandonedEarly: false,
    };
    expect(() => nodeRatingSchema.parse(sample)).not.toThrow();
  });

  it("NodeConfig does not include words or isCastle", () => {
    const cfg: NodeConfig = {
      id: "n1",
      type: "riddle",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 2,
    };
    expect("words" in cfg).toBe(false);
    expect("isCastle" in cfg).toBe(false);
  });

  it("SessionTheme with no URLs (canvas-only) is valid", () => {
    const theme: SessionTheme = {
      name: "default",
      palette: {
        sky: "#87ceeb",
        ground: "#22c55e",
        accent: "#f97316",
        particle: "#fef08a",
        glow: "#fde047",
      },
      ambient: { type: "none", count: 0, speed: 0, color: "#fff" },
      nodeStyle: "rounded",
      pathStyle: "curve",
      castleVariant: "stone",
    };
    expect(theme.backgroundUrl).toBeUndefined();
    expect(theme.castleUrl).toBeUndefined();
  });
});
