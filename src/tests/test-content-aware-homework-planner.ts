import { describe, expect, it } from "vitest";
import {
  buildContentAwareHomeworkNodes,
  normalizeContentProfile,
} from "../scripts/contentAwareHomeworkPlanner";

describe("content-aware homework planner", () => {
  it("keeps practice domain separate from content domain", () => {
    const profile = normalizeContentProfile({
      title: "Benchmark Advance Spelling Unit 8 Week 3",
      type: "spelling_test",
      words: ["faster", "fastest", "slower", "slowest"],
      questions: [],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "science",
        topic: "erosion",
        primarySkill: "comparative_and_superlative_adjectives",
        assignmentFormat: "picture_code_decode",
        concepts: ["erosion", "water", "wind", "landforms"],
      },
    });

    expect(profile.practiceDomain).toBe("spelling");
    expect(profile.contentDomain).toBe("science");
    expect(profile.topic).toBe("erosion");
    expect(profile.primarySkill).toBe("comparative_and_superlative_adjectives");
  });

  it("creates a karaoke concept-builder before spelling drills for erosion spelling homework", () => {
    const nodes = buildContentAwareHomeworkNodes({
      homeworkId: "hw-spelling_test-erosion",
      childId: "reina",
      type: "spelling_test",
      words: ["faster", "fastest", "slower", "slowest", "covered"],
      testDate: "2026-05-06",
      contentProfile: normalizeContentProfile({
        title: "Erosion spelling",
        type: "spelling_test",
        words: ["faster", "fastest", "slower", "slowest", "covered"],
        questions: [],
        contentProfile: {
          practiceDomain: "spelling",
          contentDomain: "science",
          topic: "erosion",
          primarySkill: "comparative_and_superlative_adjectives",
          assignmentFormat: "picture_code_decode",
          concepts: ["erosion", "water", "wind", "rocks", "soil"],
        },
      }),
    });

    expect(nodes.map((n) => n.type)).toEqual([
      "karaoke",
      "word-radar",
      "spell-check",
      "wheel-of-fortune",
    ]);
    expect(nodes[0]?.storyText?.toLowerCase()).toContain("erosion");
    expect(nodes[0]?.storyText?.toLowerCase()).toContain("water");
    expect(nodes[0]?.storyText?.toLowerCase()).toContain("faster");
    expect(nodes[0]?.words.length).toBeGreaterThan(10);
    expect(nodes[1]?.words).toEqual([
      "faster",
      "fastest",
      "slower",
      "slowest",
      "covered",
    ]);
  });
});
