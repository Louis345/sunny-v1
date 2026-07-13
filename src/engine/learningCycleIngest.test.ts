import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import {
  buildLearningCycleInputFromPlan,
  persistIngestedLearningCycle,
} from "./learningCycleIngest";
import { getLearningCycle, transitionLearningCycle } from "./learningCycleRepository";

function plan(): ActiveSessionPlan {
  return {
    planId: "plan-1",
    childId: "reina",
    createdAt: "2026-07-11T20:00:00.000Z",
    source: "ingest_human_loop",
    activeHomeworkId: "hw-math-cycle",
    domain: "math",
    testDate: null,
    nodePlan: [
      {
        id: "facts",
        type: "generated-baseline",
        activityId: "generated-baseline",
        targets: ["5x2", "5x5"],
        difficulty: 1,
        source: "chart_planner",
        title: "Fact Blaster",
        targetLane: "multiplication_fluency",
        theoryId: "theory-1",
        experimentId: "experiment-1",
        mechanic: "fact-retrieval-speed",
        theme: "space arcade",
        contentId: "content:facts",
        gameHtmlPath: "/tmp/facts.html",
        activityConfigPath: "/api/activity-config/reina/hw-math-cycle/facts.json",
        thumbnailUrl: "/generated/reina/hw-math-cycle/facts.png",
        sfxProfile: "tap-correct-wrong-progress-complete",
        companionPolicy: "cycle-contract",
      },
      {
        id: "quest-custom-name",
        type: "quest",
        activityId: "quest",
        targets: [],
        difficulty: 1,
        source: "chart_planner",
        title: "Multiplication Quest",
        theoryId: "theory-1",
        experimentId: "experiment-quest",
        locked: true,
      },
      {
        id: "boss-custom-name",
        type: "boss",
        activityId: "boss",
        targets: [],
        difficulty: 1,
        source: "chart_planner",
        title: "Multiplication Boss",
        theoryId: "theory-1",
        experimentId: "experiment-boss",
        locked: true,
      },
    ],
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: "fingerprint",
      previousCompletedNodeCount: 0,
    },
    companionPolicy: {
      companionId: "elli",
      displayName: "Elli",
      openingLinePolicy: "context_start_short",
      verbosity: "low",
      maxMicroProbes: 1,
    },
    evidenceUsed: [{ id: "assignment:pdf:1", type: "assignment", summary: "Pashley PDF" }],
    openQuestions: [],
    planTheory: {
      hypothesis: "Measure facts before transfer.",
      evidenceSummary: ["captured multiplication worksheet"],
      intervention: "Run fact baseline, then generate Quest.",
      supportCriteria: ["accuracy >= 0.8"],
      reviseCriteria: ["accuracy < 0.8"],
      falsifyCriteria: ["accuracy < 0.5"],
    },
  };
}

function input() {
  return {
    childId: "reina",
    homeworkId: "hw-math-cycle",
    domain: "math",
    title: "Multiplication facts",
    contentFingerprint: "fingerprint-1",
    capturedEvidenceIds: ["assignment:pdf:1"],
    targets: ["5x2", "5x5"],
    plan: plan(),
    engagementTheory: null,
  };
}

describe("learning cycle ingestion bridge", () => {
  it("converts the final planner/artifact result into canonical node contracts", () => {
    const cycleInput = buildLearningCycleInputFromPlan(input());
    expect(cycleInput.nodes.map((node) => node.title)).toEqual(["Fact Blaster", "Quest", "Boss"]);
    expect(cycleInput.nodes[0]?.openingScreen).toEqual({
      title: "Fact Blaster",
      purpose: "Practice multiplication_fluency through fact-retrieval-speed.",
    });
    expect(cycleInput.nodes[0]?.artifactBinding).toMatchObject({
      contentId: "content:facts",
      localArtifactPath: "/tmp/facts.html",
      localArtworkPath: "/generated/reina/hw-math-cycle/facts.png",
      validationStatus: "passed",
    });
    expect(cycleInput.nodes[1]?.generationPrompt).toBeNull();
    expect(cycleInput.nodes[2]?.generationPrompt).toBeNull();
  });

  it("does not treat a temporary remote image URL as a canonical artwork binding", () => {
    const remote = plan();
    remote.nodePlan[0]!.thumbnailUrl = "https://imgen.x.ai/xai-tmp-image.jpeg";
    const cycleInput = buildLearningCycleInputFromPlan({ ...input(), plan: remote });
    expect(cycleInput.nodes[0]?.artifactBinding).toBeNull();
    expect(cycleInput.nodes[0]?.artwork.status).toBe("failed");
  });

  it("creates once and reconciles subsequent ingestion through a versioned transition", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-cycle-ingest-"));
    const first = persistIngestedLearningCycle(input(), { rootDir });
    const changed = plan();
    changed.nodePlan[0]!.theme = "new theme";
    const second = persistIngestedLearningCycle({ ...input(), plan: changed }, { rootDir });

    expect(first.schemaVersion).toBe(2);
    expect(second.revision).toBe(first.revision + 1);
    expect(second.nodes[0]?.theme).toBe("new theme");
    expect(getLearningCycle("reina", "hw-math-cycle", { rootDir })).toEqual(second);
  });

  it("re-ingestion preserves evidence but resets Quest and Boss to locked teasers", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-cycle-reset-"));
    let cycle = persistIngestedLearningCycle(input(), { rootDir });
    cycle = transitionLearningCycle("reina", "hw-math-cycle", cycle.revision, {
      type: "baseline_completed",
      nodeId: "facts",
      academicEvidence: [{ evidenceId: "real-child:baseline:1", summary: "Baseline complete", accuracy: 0.8 }],
      engagementEvidence: [],
      companionObservations: [],
      decision: { status: "supported", reason: "Ready for Quest", nextAction: "Generate Quest" },
    }, { rootDir });
    cycle = transitionLearningCycle("reina", "hw-math-cycle", cycle.revision, {
      type: "artifact_bound",
      nodeId: "quest-custom-name",
      artifact: { contentId: "quest:1", artifactId: "quest:1", localArtifactPath: "/games/quest.html", localArtworkPath: "/generated/quest.png", contractFingerprint: "quest", validationStatus: "passed" },
    }, { rootDir });
    cycle = transitionLearningCycle("reina", "hw-math-cycle", cycle.revision, {
      type: "quest_completed",
      nodeId: "quest-custom-name",
      academicEvidence: [{ evidenceId: "real-child:quest:1", summary: "Quest complete", accuracy: 0.7 }],
      engagementEvidence: [],
      companionObservations: [],
      decision: { status: "revised", reason: "Boss probe needed", nextAction: "Generate Boss", bossRequired: true },
    }, { rootDir });
    cycle = transitionLearningCycle("reina", "hw-math-cycle", cycle.revision, {
      type: "artifact_bound",
      nodeId: "boss-custom-name",
      artifact: { contentId: "boss:1", artifactId: "boss:1", localArtifactPath: "/games/boss.html", localArtworkPath: "/generated/boss.png", contractFingerprint: "boss", validationStatus: "passed" },
    }, { rootDir });
    cycle = transitionLearningCycle("reina", "hw-math-cycle", cycle.revision, {
      type: "boss_completed",
      nodeId: "boss-custom-name",
      academicEvidence: [{ evidenceId: "real-child:boss:1", summary: "Boss complete", accuracy: 0.9 }],
      engagementEvidence: [],
      companionObservations: [],
      decision: { status: "awaiting_calibration", reason: "Await graded work", nextAction: "Calibrate" },
    }, { rootDir });

    const refreshed = persistIngestedLearningCycle(input(), { rootDir });

    expect(refreshed.evidence.academic.map((item) => item.evidenceId)).toEqual(expect.arrayContaining([
      "real-child:baseline:1", "real-child:quest:1", "real-child:boss:1",
    ]));
    expect(refreshed.nodes.find((node) => node.role === "quest")).toMatchObject({ state: "locked", artifactBinding: null });
    expect(refreshed.nodes.find((node) => node.role === "boss")).toMatchObject({ state: "locked", artifactBinding: null });
    expect(refreshed.lifecycle).toBe("baseline_ready");
  });

  it("repairs an invalid historical Quest/Boss state during re-ingestion", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-cycle-invalid-history-"));
    const created = persistIngestedLearningCycle(input(), { rootDir });
    const file = path.join(rootDir, "src/context/reina/homework/cycles/hw-math-cycle.json");
    const corrupted = structuredClone(created);
    corrupted.lifecycle = "quest_generating";
    const quest = corrupted.nodes.find((node) => node.role === "quest")!;
    const boss = corrupted.nodes.find((node) => node.role === "boss")!;
    quest.state = "generating";
    boss.state = "completed";
    boss.artifactBinding = {
      contentId: "synthetic-boss",
      artifactId: "synthetic-boss",
      localArtifactPath: "/games/synthetic-boss.html",
      localArtworkPath: "/generated/synthetic-boss.png",
      contractFingerprint: "synthetic",
      validationStatus: "passed",
    };
    fs.writeFileSync(file, JSON.stringify(corrupted, null, 2), "utf8");

    const repaired = persistIngestedLearningCycle(input(), { rootDir });

    expect(repaired.lifecycle).toBe("baseline_ready");
    expect(repaired.nodes.find((node) => node.role === "quest")).toMatchObject({ state: "locked", artifactBinding: null });
    expect(repaired.nodes.find((node) => node.role === "boss")).toMatchObject({ state: "locked", artifactBinding: null });
  });
});
