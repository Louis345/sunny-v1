import { describe, it, expect } from "vitest";
import {
  isWordDrivenHomeworkNodeType,
  pendingHomeworkToNodeConfigs,
} from "../server/map-coordinator";
import { BANDIT_POOL } from "../engine/nodeSelection";
import { mergeNormalizedPlan } from "../scripts/ingestHomework";

describe("pipeline audit — word-radar homework wiring", () => {
  it('isWordDrivenHomeworkNodeType("word-radar") returns true', () => {
    expect(isWordDrivenHomeworkNodeType("word-radar")).toBe(true);
  });

  it('BANDIT_POOL includes "word-radar"', () => {
    expect(BANDIT_POOL).toContain("word-radar");
  });

  it("ingestHomework spelling_test merge puts word-radar first with items", () => {
    const words = ["Cat", "dog"];
    const nodes = mergeNormalizedPlan([], words, 2, {
      homeworkType: "spelling_test",
      daysUntilTest: 4,
    });
    expect(nodes[0]?.type).toBe("word-radar");
    expect(nodes[0]?.wordRadarItems).toEqual([
      { display: "Cat", acceptedResponses: ["cat"], label: "Spelling", subject: "spelling" },
      { display: "dog", acceptedResponses: ["dog"], label: "Spelling", subject: "spelling" },
    ]);
  });

  it("pendingHomeworkToNodeConfigs maps word-radar items from profile", () => {
    const hw = {
      weekOf: "2026-04-21",
      testDate: null as string | null,
      wordList: ["sun", "moon"],
      generatedAt: "2026-04-26T00:00:00.000Z",
      nodes: [
        {
          id: "n1",
          type: "word-radar",
          words: ["sun", "moon"],
          difficulty: 2,
          gameFile: null,
          storyFile: null,
          wordRadarItems: [
            { display: "sun", acceptedResponses: ["sun"], label: "Spelling" },
            { display: "moon", acceptedResponses: ["moon"], label: "Spelling" },
          ],
        },
      ],
    };
    const configs = pendingHomeworkToNodeConfigs(hw, ["sun", "moon"]);
    expect(configs[0]?.type).toBe("word-radar");
    expect(configs[0]?.wordRadarItems).toHaveLength(2);
    expect(configs[0]?.wordRadarItems?.[0]).toMatchObject({
      display: "sun",
      acceptedResponses: ["sun"],
    });
  });
});
