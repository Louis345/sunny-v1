import { describe, expect, it } from "vitest";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { NodeConfig } from "../shared/adventureTypes";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import { buildMysteryChoiceNodeData } from "./mysteryChoicePlanner";

function profile(childId = "reina"): LearningProfile {
  return initializeLearningProfile({
    childId,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: ["spelling"],
  });
}

function node(type: NodeConfig["type"]): NodeConfig {
  return {
    id: `n-${type}`,
    type,
    isLocked: false,
    isCompleted: false,
    isGoal: false,
    difficulty: 2,
    words: ["above", "about"],
    gameFile: `${type}.html`,
  };
}

describe("mystery choice planner", () => {
  it("uses choice_lab with three options when preference evidence is thin", () => {
    const out = buildMysteryChoiceNodeData({
      childId: "reina",
      nodeId: "n-mystery",
      domain: "spelling",
      words: ["above", "about"],
      profile: profile(),
      dopamineGames: ["asteroid", "space-invaders", "space-frogger"],
      domainValidNodes: [node("pronunciation"), node("monster-stampede")],
      now: new Date("2026-05-12T12:00:00.000Z"),
    });

    expect(out.mysteryMode).toBe("choice_lab");
    expect(out.choiceSetId).toMatch(/^choice_set_/);
    expect(out.choiceOptions).toHaveLength(3);
    expect(out.choiceOptions?.some((option) => option.activityKind === "dopamine_game")).toBe(true);
    expect(out.choiceOptions?.some((option) => option.activityId === "pronunciation")).toBe(true);
    expect(out.choiceSource).toBe("child_choice");
  });

  it("can use surprise_drop when preference and load evidence are strong", () => {
    const p = profile();
    p.activityModel = {
      pronunciation: {
        activityId: "pronunciation",
        plays: 4,
        completions: 4,
        completionRate: 1,
        averageAccuracy: 0.95,
        engagementScore: 0.9,
        frustrationScore: 0.05,
        likedCount: 3,
        dislikedCount: 0,
        lastRating: "like",
        lastPlayed: "2026-05-12T10:00:00.000Z",
        domains: { spelling: 4 },
        missedWords: [],
      },
    };
    p.adaptiveLoadState = {
      spelling: {
        domain: "spelling",
        currentCohortSize: 10,
        maxRecentSuccessfulCohort: 10,
        challengeRecommendation: "expand_cohort",
        lastLoadEvidence: {
          activityId: "spell-check",
          completed: true,
          accuracy: 0.95,
          targetCount: 10,
          frustrationScore: 0.05,
          strongEvidence: true,
          occurredAt: "2026-05-12T10:00:00.000Z",
        },
      },
    };

    const out = buildMysteryChoiceNodeData({
      childId: "reina",
      nodeId: "n-mystery",
      domain: "spelling",
      words: ["above", "about"],
      profile: p,
      dopamineGames: ["asteroid", "space-invaders"],
      domainValidNodes: [node("pronunciation"), node("monster-stampede")],
      allowSurpriseDrop: true,
      now: new Date("2026-05-12T12:05:00.000Z"),
    });

    expect(out.mysteryMode).toBe("surprise_drop");
    expect(out.surpriseOption?.activityId).toBe("pronunciation");
    expect(out.choiceSource).toBe("system_recommendation");
  });

  it("does not convert homework mystery into a surprise drop from forced activity evidence alone", () => {
    const p = profile();
    p.activityModel = {
      "spell-check": {
        activityId: "spell-check",
        plays: 4,
        completions: 4,
        completionRate: 1,
        averageAccuracy: 0.95,
        engagementScore: 0.9,
        frustrationScore: 0.05,
        likedCount: 3,
        dislikedCount: 0,
        lastRating: "like",
        lastPlayed: "2026-05-12T10:00:00.000Z",
        domains: { spelling: 4 },
        missedWords: [],
      },
    };
    p.adaptiveLoadState = {
      spelling: {
        domain: "spelling",
        currentCohortSize: 10,
        maxRecentSuccessfulCohort: 10,
        challengeRecommendation: "expand_cohort",
        lastLoadEvidence: {
          activityId: "spell-check",
          completed: true,
          accuracy: 0.95,
          targetCount: 10,
          frustrationScore: 0.05,
          strongEvidence: true,
          occurredAt: "2026-05-12T10:00:00.000Z",
        },
      },
    };

    const out = buildMysteryChoiceNodeData({
      childId: "reina",
      nodeId: "n-mystery",
      domain: "spelling",
      words: ["above", "about"],
      profile: p,
      dopamineGames: ["space-frogger"],
      domainValidNodes: [
        node("spell-check"),
        node("word-radar"),
        node("monster-stampede"),
        node("pronunciation"),
      ],
      now: new Date("2026-05-12T12:06:00.000Z"),
    });

    expect(out.mysteryMode).toBe("choice_lab");
    expect(out.choiceSource).toBe("child_choice");
  });

  it("mixes a reward option into spelling mystery instead of showing only baseline drills", () => {
    const out = buildMysteryChoiceNodeData({
      childId: "reina",
      nodeId: "n-mystery",
      domain: "spelling",
      words: ["above", "about"],
      profile: profile(),
      dopamineGames: ["space-frogger"],
      domainValidNodes: [
        node("spell-check"),
        node("word-radar"),
        node("monster-stampede"),
        node("pronunciation"),
      ],
      now: new Date("2026-05-12T12:07:00.000Z"),
    });

    expect(out.choiceOptions).toHaveLength(3);
    expect(out.choiceOptions.some((option) => option.activityKind === "dopamine_game")).toBe(true);
    expect(out.choiceOptions.map((option) => option.activityId)).toContain("wheel-of-fortune");
  });

  it("rotates mystery options across sessions instead of replaying the same first choice", () => {
    const base = {
      childId: "reina",
      nodeId: "n-mystery",
      domain: "spelling",
      words: ["above", "about"],
      profile: profile(),
      dopamineGames: ["asteroid", "space-frogger"],
      domainValidNodes: [
        node("spell-check"),
        node("word-radar"),
        node("monster-stampede"),
        node("pronunciation"),
      ],
    };

    const first = buildMysteryChoiceNodeData({
      ...base,
      now: new Date("2026-05-12T12:07:00.000Z"),
    });
    const second = buildMysteryChoiceNodeData({
      ...base,
      now: new Date("2026-05-13T12:07:00.000Z"),
    });

    expect(second.choiceOptions.map((option) => option.activityId)).not.toEqual(
      first.choiceOptions.map((option) => option.activityId),
    );
    expect(second.choiceOptions.some((option) => option.activityKind === "dopamine_game")).toBe(true);
  });

  it("keeps generated learning content out unless it is cataloged and evidence-gated", () => {
    const out = buildMysteryChoiceNodeData({
      childId: "reina",
      nodeId: "n-mystery",
      domain: "spelling",
      words: ["above", "about"],
      profile: profile(),
      dopamineGames: ["asteroid"],
      domainValidNodes: [node("pronunciation")],
      generatedContentOptions: [
        {
          activityId: "quest",
          nodeType: "quest",
          label: "Generated Quest",
          purposeLabel: "Custom Mission",
          gameFile: "quest.html",
          activityKind: "generated_learning",
          contentId: "content-1",
          catalogStatus: "candidate",
          evidenceGated: false,
        },
      ],
      now: new Date("2026-05-12T12:10:00.000Z"),
    });

    expect(out.choiceOptions?.map((option) => option.activityId)).not.toContain("quest");
  });

  it("filters learning activities that do not belong to the current domain", () => {
    const out = buildMysteryChoiceNodeData({
      childId: "reina",
      nodeId: "n-mystery",
      domain: "reading",
      words: ["chapter", "infer"],
      profile: profile(),
      dopamineGames: ["asteroid"],
      domainValidNodes: [
        node("spell-check"),
        node("coin-counter"),
        node("concept-check"),
        node("karaoke"),
      ],
      now: new Date("2026-05-12T12:15:00.000Z"),
    });

    const activityIds = out.choiceOptions.map((option) => option.activityId);
    expect(activityIds).toContain("concept-check");
    expect(activityIds).toContain("karaoke");
    expect(activityIds).not.toContain("spell-check");
    expect(activityIds).not.toContain("coin-counter");
  });
});
