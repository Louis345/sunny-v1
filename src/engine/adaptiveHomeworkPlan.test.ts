import { describe, expect, it } from "vitest";
import {
  buildAdaptiveActivityPlan,
  buildAdaptiveHomeworkPlan,
} from "./adaptiveHomeworkPlan";

describe("adaptive homework plan", () => {
  it("plans spelling from child/context/tool assertions instead of a fixed game chain", () => {
    const plan = buildAdaptiveHomeworkPlan({
      childId: "reina",
      homeworkId: "hw-spelling-week-5",
      type: "spelling_test",
      topic: "Week 5 spelling",
      words: ["farmer", "sailor", "teacher", "doctor"],
      targetGroups: [
        {
          id: "spelling-production",
          label: "Words with -y or -ly Endings",
          purpose: "spell_from_memory",
          words: ["farmer", "sailor", "teacher", "doctor"],
          confidence: 0.92,
          evidence: ["Column heading says spelling words."],
        },
        {
          id: "high-frequency",
          label: "High-Frequency Words",
          purpose: "read_fluently",
          words: ["able", "behind"],
          confidence: 0.86,
          evidence: ["Column heading says high-frequency words."],
          scheduleAfter: "spelling_measured",
        },
      ],
      childSignals: ["likes arcade streaks", "needs spelling evidence before practice"],
    });

    expect(plan.schemaVersion).toBe(1);
    expect(plan.domain).toBe("spelling");
    expect(plan.assertions.map((assertion) => assertion.id)).toContain("baseline-before-practice");
    expect(plan.nodes.map((node) => node.activityId)).toEqual([
      "letter-rush",
      "letter-rush",
      "letter-rush",
    ]);
    expect(plan.nodes.map((node) => node.mode)).toEqual([
      "type-and-spell",
      "trap-the-imposter",
      "mastery-run",
    ]);
    expect(plan.nodes[0]?.purpose).toBe("evaluate");
    expect(plan.nodes[1]?.purpose).toBe("practice");
    expect(plan.nodes[2]?.purpose).toBe("evaluate");
    expect(plan.nodes[0]?.configFilename).toBe("letter-rush-baseline.json");
    expect(plan.nodes[1]?.configFilename).toBe("letter-rush-pattern-practice.json");
    expect(plan.nodes[2]?.configFilename).toBe("letter-rush-mastery-check.json");
    expect(plan.dopamineBreak.status).toBe("eligible-after-evidence");
    expect(plan.strongBaselinePolicy).toMatchObject({
      minAccuracy: 0.9,
      minimumAttempts: 5,
      nextMove: "reward-or-quest-prep",
    });
    expect(plan.questGate.contentGenerationConfidenceThreshold).toBeGreaterThanOrEqual(0.8);
    expect(plan.heldTargets).toContainEqual(
      expect.objectContaining({
        label: "High-Frequency Words",
        purpose: "read_fluently",
        scheduleAfter: "spelling_measured",
        words: ["able", "behind"],
      }),
    );
    expect(plan.assertions.map((assertion) => assertion.id)).toContain(
      "non-spelling-groups-held-until-baseline",
    );
  });

  it("plans reading comprehension through concept-check evaluators from the same conductor", () => {
    const plan = buildAdaptiveActivityPlan({
      childId: "ila",
      homeworkId: "hw-reading-erosion",
      type: "reading",
      topic: "erosion",
      words: ["erosion", "soil", "water"],
      contentProfile: {
        practiceDomain: "reading",
        contentDomain: "science",
        primarySkill: "reading_comprehension",
      },
      childSignals: ["needs pronunciation support for academic words"],
    });

    expect(plan.schemaVersion).toBe(1);
    expect(plan.domain).toBe("reading");
    expect(plan.assertions.map((assertion) => assertion.id)).toContain(
      "comprehension-baseline-before-story",
    );
    expect(plan.nodes.map((node) => node.activityId)).toEqual([
      "concept-check",
      "karaoke",
      "pronunciation",
      "word-builder",
      "concept-check",
    ]);
    expect(plan.nodes[0]?.purpose).toBe("evaluate");
    expect(plan.nodes[0]?.configFilename).toBe("concept-check-baseline.json");
    expect(plan.nodes[4]?.configFilename).toBe("concept-check-exit.json");
    expect(plan.questGate.requires).toContain("concept_check_exit_results");
  });
});
