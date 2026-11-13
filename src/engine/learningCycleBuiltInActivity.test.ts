import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import { buildLearningCycleInputFromPlan } from "./learningCycleIngest";
import { createLearningCycle, projectLearningCycle } from "./learningCycleRepository";

function plan(): ActiveSessionPlan {
  return {
    planId: "spelling-plan",
    childId: "demo-pashley",
    createdAt: "2026-07-29T00:00:00.000Z",
    source: "ingest_human_loop",
    activeHomeworkId: "hw-spelling",
    domain: "spelling",
    testDate: null,
    nodePlan: [
      {
        id: "silent-letter-radar",
        type: "word-radar",
        activityId: "word-radar",
        targets: ["sign", "know"],
        difficulty: 1,
        source: "chart_planner",
        title: "Silent Letter Search",
        targetLane: "silent_letters",
      },
      {
        id: "custom-practice",
        type: "generated-baseline",
        activityId: "generated-baseline",
        targets: ["write"],
        difficulty: 1,
        source: "chart_planner",
        title: "Custom Recall Lab",
        targetLane: "silent_letters",
      },
    ],
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: "spelling",
      previousCompletedNodeCount: 0,
    },
    companionPolicy: {
      companionId: "elli",
      displayName: "Elli",
      openingLinePolicy: "context_start_short",
      verbosity: "low",
      maxMicroProbes: 1,
    },
    evidenceUsed: [{ id: "assignment:spelling", type: "assignment_source", summary: "Spelling PDF" }],
    openQuestions: [],
  };
}

describe("canonical built-in activity identity", () => {
  it("keeps known spelling activities launchable while generated baselines require artifacts", () => {
    const input = buildLearningCycleInputFromPlan({
      childId: "demo-pashley",
      homeworkId: "hw-spelling",
      domain: "spelling",
      title: "Silent letters",
      contentFingerprint: "spelling-fingerprint",
      capturedEvidenceIds: ["assignment:spelling"],
      targets: ["sign", "know", "write"],
      plan: plan(),
      engagementTheory: null,
    });

    expect(input.nodes[0]).toMatchObject({
      activityType: "word-radar",
      state: "ready",
      generationPrompt: null,
    });
    expect(input.nodes[1]).toMatchObject({
      activityType: "generated-baseline",
      state: "blocked",
    });

    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-built-in-activity-"));
    try {
      const projection = projectLearningCycle(createLearningCycle(input, { rootDir }));
      expect(projection.activeSessionPlan.nodePlan[0]).toMatchObject({
        type: "word-radar",
        activityId: "word-radar",
        locked: false,
        masteryUnlockState: "unlocked",
      });
      expect(projection.activeSessionPlan.nodePlan[1]).toMatchObject({
        type: "generated-baseline",
        activityId: "generated-baseline",
        locked: true,
      });
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
