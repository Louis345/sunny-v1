import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { NodeConfig } from "../shared/adventureTypes";
import {
  buildVisualLearnerFeedbackDemoNodes,
  buildVisualLearnerGenerationContext,
  buildVisualLearnerPrompt,
  evaluateVisualLearnerTrigger,
  recordVisualLearnerEngagementReward,
  selectVisualLearnerEngagementWrapper,
} from "./visualLearnerPersonalization";

function makeRoot(profile: LearningProfile): string {
  const root = join(tmpdir(), `sunny-visual-learner-${Date.now()}-${Math.random()}`);
  const childDir = join(root, "src/context/reina");
  mkdirSync(childDir, { recursive: true });
  writeFileSync(
    join(childDir, "child_profile.json"),
    JSON.stringify(
      {
        childId: "reina",
        identity: { displayName: "Reina", ttsName: "Ray-nah" },
        companion: { companionId: "matilda" },
      },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(join(childDir, "learning_profile.json"), JSON.stringify(profile, null, 2), "utf8");
  writeFileSync(join(childDir, "word_bank.json"), JSON.stringify({ childId: "reina", words: [] }), "utf8");
  return root;
}

function baseProfile(overrides: Partial<LearningProfile> = {}): LearningProfile {
  return {
    childId: "reina",
    version: 1,
    createdAt: "2026-05-14T00:00:00.000Z",
    lastUpdated: "2026-05-14T00:00:00.000Z",
    demographics: {
      age: 8,
      grade: 2,
      diagnoses: [],
      learningStyle: "mixed",
      attentionSpan: "moderate",
      iepActive: false,
    },
    algorithmParams: {
      sm2: {
        defaultEasinessFactor: 2.5,
        minEasinessFactor: 1.3,
        intervalModifier: 1,
        maxNewWordsPerSession: 5,
        maxReviewWordsPerSession: 12,
      },
      difficulty: {
        targetAccuracy: 0.7,
        easyThreshold: 0.85,
        hardThreshold: 0.5,
        breakThreshold: 0.4,
        windowSize: 8,
      },
      mastery: {
        gateAccuracy: 0.8,
        gateSessions: 3,
        regressionThreshold: 0.6,
        regressionSessions: 2,
      },
      interleaving: {
        weakestWeight: 0.5,
        secondWeight: 0.3,
        randomWeight: 0.2,
        minTypeExposure: 0.15,
      },
    },
    bondPatterns: {
      topics: [],
      bondStyle: "unknown",
      averageBondTurns: 3,
      lastBondQuality: "moderate",
      topicFrequency: {},
    },
    moodHistory: [],
    moodTrend: "stable",
    moodAdjustment: false,
    iepTargets: [],
    readingProfile: {
      currentReadingLevel: "CVC",
      averageReadingAccuracy: 0,
      comprehensionAccuracy: 0,
      flaggedPatterns: [],
      storiesCompleted: 0,
    },
    sessionStats: {
      totalSessions: 4,
      averageAccuracy: 0.72,
      averageDurationMinutes: 12,
      currentWilsonStep: 1,
      streakRecord: 2,
      totalWordsMastered: 0,
      perfectSessions: 0,
      lastSessionDate: "2026-05-14",
    },
    rewardPreferences: {
      favoriteGames: ["wheel-of-fortune"],
      celebrationStyle: "loud",
      bonusRoundHistory: { triggered: 0, correct: 0 },
    },
    pendingHomework: {
      weekOf: "2026-05-11",
      testDate: null,
      wordList: [],
      homeworkId: "hw-geometry-faces",
      generatedAt: "2026-05-14T00:00:00.000Z",
      nodes: [],
      contentProfile: {
        practiceDomain: "math",
        contentDomain: "math",
        topic: "2D faces of 3D solids",
        primarySkill: "geometry_spatial",
        assignmentFormat: "worksheet",
        concepts: ["flat faces", "curved surfaces", "solid shapes"],
        sourceEvidence: ["5_11 math.pdf asks which solid face makes a square, rectangle, circle, or triangle."],
      },
      capturedContent: {
        title: "5/11 Math",
        type: "math",
        rawText: "Identify the flat faces on cubes, rectangular prisms, cylinders, cones, pyramids, and spheres.",
        words: [],
        questions: ["Which shape has a square face?", "Which shape has no flat face?"],
        sourceDocuments: [{ filename: "5_11 math.pdf", mediaType: "application/pdf" }],
        contentProfile: {
          practiceDomain: "math",
          contentDomain: "math",
          topic: "2D faces of 3D solids",
          primarySkill: "geometry_spatial",
          assignmentFormat: "worksheet",
          concepts: ["flat faces", "curved surfaces", "solid shapes"],
          sourceEvidence: ["The worksheet asks the child to map solids to their flat faces."],
        },
      },
    },
    activityTraitModel: {
      competition: {
        dimension: "competition",
        positiveWeight: 2,
        negativeWeight: 0,
        mixedWeight: 0,
        evidenceCount: 3,
        confidence: 0.7,
        lastUpdated: "2026-05-14T00:00:00.000Z",
        activityCounts: { "wheel-of-fortune": 3 },
      },
      visual: {
        dimension: "visual",
        positiveWeight: 1.5,
        negativeWeight: 0,
        mixedWeight: 0,
        evidenceCount: 2,
        confidence: 0.75,
        lastUpdated: "2026-05-14T00:00:00.000Z",
        activityCounts: { "wheel-of-fortune": 2 },
      },
    },
    ...overrides,
  };
}

describe("Visual Learner personalization context", () => {
  it("starts from the child chart and refuses missing homework evidence", () => {
    const root = makeRoot(baseProfile());

    const context = buildVisualLearnerGenerationContext("reina", {
      rootDir: root,
      conceptCheck: {
        targetConcept: "flat_faces_of_solids",
        state: "partial",
        accuracy: 0.4,
        evidenceId: "concept-check-round-1",
      },
      parentNote: "Make it whimsical and cute, not academic.",
      researchNotes: [
        {
          source: "WWC math intervention",
          summary: "Use visual representations for math intervention.",
        },
      ],
    });

    expect(context.child.displayName).toBe("Reina");
    expect(context.child.age).toBe(8);
    expect(context.companion).toMatchObject({ id: "matilda", role: "hint_only" });
    expect(context.homework.homeworkId).toBe("hw-geometry-faces");
    expect(context.homework.sourceEvidence.join(" ")).toContain("5_11 math.pdf");
    expect(context.trigger.recommendation).toBe("visual-explainer");
    expect(context.engagementWrapper).toMatchObject({
      id: expect.any(String),
      promptLanguage: expect.stringContaining("whimsical"),
    });
    expect(context.assumptions.some((item) => item.includes("visual model"))).toBe(true);
    expect(context.falsifyCriteria).toContain("follow-up co-op recall accuracy below 0.65");

    const missingRoot = makeRoot(baseProfile({ pendingHomework: undefined }));
    expect(() =>
      buildVisualLearnerGenerationContext("reina", {
        rootDir: missingRoot,
        conceptCheck: { targetConcept: "flat_faces_of_solids", state: "unknown" },
      }),
    ).toThrow(/visual_learner_missing_homework_evidence/);
  });

  it("routes only unknown or partial visual-core gaps to the explainer", () => {
    expect(
      evaluateVisualLearnerTrigger({
        hasHomeworkEvidence: true,
        domain: "math",
        skill: "geometry_spatial",
        conceptCheckState: "partial",
        reusableArtifactStatus: "none",
      }),
    ).toMatchObject({ eligible: true, recommendation: "visual-explainer" });

    expect(
      evaluateVisualLearnerTrigger({
        hasHomeworkEvidence: true,
        domain: "math",
        skill: "geometry_spatial",
        conceptCheckState: "mastered",
        reusableArtifactStatus: "none",
      }),
    ).toMatchObject({ eligible: false, recommendation: "skip-mastered" });

    expect(
      evaluateVisualLearnerTrigger({
        hasHomeworkEvidence: true,
        domain: "spelling",
        skill: "spell_from_memory",
        conceptCheckState: "unknown",
        reusableArtifactStatus: "none",
      }),
    ).toMatchObject({ eligible: false, recommendation: "skip-not-visual-core" });
  });

  it("writes a prompt with child taste, quest voice, companion boundaries, assumptions, and falsifiers", () => {
    const root = makeRoot(baseProfile());
    const context = buildVisualLearnerGenerationContext("reina", {
      rootDir: root,
      conceptCheck: {
        targetConcept: "flat_faces_of_solids",
        state: "partial",
        accuracy: 0.4,
      },
    });

    const prompt = buildVisualLearnerPrompt(context);

    expect(prompt).toContain("Reina");
    expect(prompt).toContain("age 8");
    expect(prompt).toContain("whimsical");
    expect(prompt).toContain("cute");
    expect(prompt).toContain("quest narrator speaks");
    expect(prompt).toContain("companion does not narrate");
    expect(prompt).toContain("outer VRM via _contract.js");
    expect(prompt).toContain("hint-only");
    expect(prompt).toContain("Assumptions to write into the artifact");
    expect(prompt).toContain("Falsifiers");
    expect(prompt).toContain("co-op recall game");
  });
});

describe("Visual Learner engagement wrapper bandit", () => {
  it("explores untried wrappers, then rewards learning plus engagement signals", () => {
    const profile = baseProfile({
      visualLearnerEngagementBanditState: {
        counts: {
          "whimsical-quest": 3,
          competition: 2,
        },
        values: {
          "whimsical-quest": 0.42,
          competition: 0.86,
        },
      },
    });
    const random = vi.fn().mockReturnValue(0.99);

    expect(selectVisualLearnerEngagementWrapper(profile, { random }).id).toBe("mystery");

    const next = recordVisualLearnerEngagementReward(profile, "mystery", {
      completed: true,
      recallAccuracy: 0.9,
      frustrationScore: 0.05,
      hintCount: 1,
      replayRequested: true,
      positiveChoiceSignal: true,
    });

    expect(next.visualLearnerEngagementBanditState?.counts.mystery).toBe(1);
    expect(next.visualLearnerEngagementBanditState?.values.mystery).toBeGreaterThan(0.75);
  });
});

describe("Visual Learner full path demo", () => {
  it("builds concept-check, personalized explainer, and co-op recall nodes", () => {
    const root = makeRoot(baseProfile());
    const context = buildVisualLearnerGenerationContext("reina", {
      rootDir: root,
      conceptCheck: {
        targetConcept: "flat_faces_of_solids",
        state: "partial",
        accuracy: 0.4,
      },
    });

    const nodes = buildVisualLearnerFeedbackDemoNodes(context);
    expect(nodes.map((node: NodeConfig) => node.type)).toEqual([
      "concept-check",
      "visual-explainer",
      "visual-recall-quiz",
    ]);
    expect(nodes[1]?.activityConfigPath).toContain("artifact.config.json");
    expect(nodes[2]?.activityConfigPath).toContain("artifact.config.json");
    expect(nodes[2]?.contentId).toBe(context.catalog.contentId);
  });
});
