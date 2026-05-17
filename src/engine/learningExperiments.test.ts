import { describe, expect, it } from "vitest";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import { recordLearningExperimentResult } from "./learningExperiments";

function profile(): LearningProfile {
  const p = initializeLearningProfile({
    childId: "ila",
    age: 7,
    grade: 1,
    diagnoses: [],
    learningGoals: ["reading"],
  });
  p.learningExperiments = [
    {
      experimentId: "experiment-reading-collab",
      childId: "ila",
      createdAt: "2026-05-14T12:00:00.000Z",
      updatedAt: "2026-05-14T12:00:00.000Z",
      status: "active",
      hypothesis: "Collaborative companion decoding improves persistence.",
      intervention: "Companion takes turns decoding hard words.",
      comparison: "Straight pronunciation drill.",
      successCriteria: ["accuracy >= 0.85"],
      stopConditions: ["high frustration"],
      assignedActivityIds: ["quest"],
      generatedArtifactIds: ["artifact-1"],
      metricsToCollect: ["accuracy", "frustration"],
      results: [],
    },
  ];
  p.activeSessionPlan = {
    planId: "plan-ila",
    childId: "ila",
    createdAt: "2026-05-14T12:00:00.000Z",
    source: "ingest_human_loop",
    domain: "reading",
    testDate: null,
    wordPlan: { cohortSize: 0, orderStrategy: "homework_order", words: [] },
    nodePlan: [],
    variationPolicy: {
      avoidExactPreviousNodeOrder: false,
      avoidExactPreviousWordOrder: false,
      seed: "seed",
      previousCompletedNodeCount: 0,
    },
    companionPolicy: {
      companionId: "elli",
      displayName: "Elli",
      openingLinePolicy: "context_start_short",
      verbosity: "low",
      maxMicroProbes: 1,
    },
    evidenceUsed: [],
    openQuestions: [],
    learningExperiments: p.learningExperiments,
  };
  return p;
}

describe("learning experiments", () => {
  it("records a supported conclusion when a generated intervention meets success criteria", () => {
    const updated = recordLearningExperimentResult(profile(), {
      experimentId: "experiment-reading-collab",
      source: "quest",
      accuracy: 0.92,
      completed: true,
      wordsAttempted: 6,
      timeSpent_ms: 120000,
      recordedAt: "2026-05-14T12:10:00.000Z",
    });

    expect(updated.learningExperiments?.[0]).toMatchObject({
      status: "supported",
      conclusion: {
        status: "supported",
        nextAction: "reuse or cautiously increase difficulty",
      },
    });
    expect(updated.activeSessionPlan?.learningExperiments?.[0]?.status).toBe("supported");
  });

  it("revises or falsifies theories when generated interventions underperform", () => {
    const revised = recordLearningExperimentResult(profile(), {
      experimentId: "experiment-reading-collab",
      source: "quest",
      accuracy: 0.7,
      completed: true,
      wordsAttempted: 6,
      timeSpent_ms: 120000,
    });
    const falsified = recordLearningExperimentResult(profile(), {
      experimentId: "experiment-reading-collab",
      source: "quest",
      accuracy: 0.4,
      completed: true,
      wordsAttempted: 6,
      timeSpent_ms: 120000,
    });

    expect(revised.learningExperiments?.[0]?.status).toBe("revised");
    expect(falsified.learningExperiments?.[0]?.status).toBe("falsified");
  });
});
