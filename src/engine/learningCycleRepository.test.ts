import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { getChildChart } from "../profiles/childChart";
import {
  createLearningCycle,
  getLearningCycle,
  repairHistoricalLearningCycleBeforePlanning,
  projectLearningCycle,
  recordLearningCycleCalibration,
  transitionLearningCycle,
  assertLearningCycleProjectionWrite,
} from "./learningCycleRepository";

function root(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-learning-cycle-"));
}

function input() {
  return {
    childId: "reina",
    homeworkId: "hw-math-cycle",
    domain: "math",
    assignment: {
      title: "Multiplication facts and equal groups",
      contentFingerprint: "fingerprint-1",
      capturedEvidenceIds: ["assignment:pdf:1"],
      targets: ["5x2", "5x5", "pencils-word-problem"],
    },
    academicTheory: {
      theoryId: "academic-theory-1",
      revision: 1,
      hypothesis: "Reina recalls x2 facts but needs equal-groups transfer evidence.",
      supportCriteria: ["accuracy >= 0.8"],
      reviseCriteria: ["frustration >= 0.5"],
      falsifyCriteria: ["accuracy < 0.5"],
    },
    engagementTheory: null,
    nodes: [
      {
        nodeId: "baseline-facts",
        role: "baseline" as const,
        title: "Fact Blaster",
        state: "ready" as const,
        academicTarget: { domain: "math", skill: "multiplication_fluency", targets: ["5x2", "5x5"] },
        algorithmOwner: "retrieval-practice",
        theoryId: "academic-theory-1",
        experimentId: "experiment-facts",
        mechanic: "fact-retrieval-speed",
        theme: "space arcade",
        openingScreen: {
          title: "Fact Blaster",
          purpose: "Solve multiplication facts to charge the blaster.",
        },
        generationPrompt: {
          promptId: "prompt-baseline-facts",
          createdFromEvidenceIds: ["assignment:pdf:1"],
          text: "Build a multiplication fact-retrieval activity.",
        },
        artifactBinding: null,
        artwork: { status: "pending" as const, localPath: null, prompt: "fact blaster icon" },
        sfxContract: ["tap", "correct", "incorrect", "progress", "complete"],
        companionContract: { events: ["correct_answer", "wrong_answer", "session_complete"] },
        evidenceContract: { academic: true, engagement: true, companionObservations: true },
        evidenceIds: [],
      },
      {
        nodeId: "quest",
        role: "quest" as const,
        title: "Quest",
        state: "locked" as const,
        academicTarget: { domain: "math", skill: "multiplication_transfer", targets: [] },
        algorithmOwner: "mastery-gating",
        theoryId: "academic-theory-1",
        experimentId: "experiment-quest",
        mechanic: "generated-after-baseline",
        theme: "pending",
        openingScreen: { title: "Quest", purpose: "Locked until baseline evidence is ready." },
        generationPrompt: null,
        artifactBinding: null,
        artwork: { status: "placeholder" as const, localPath: "/thumbnails/quest.svg", prompt: null },
        sfxContract: ["tap", "complete"],
        companionContract: { events: ["session_complete"] },
        evidenceContract: { academic: true, engagement: true, companionObservations: true },
        evidenceIds: [],
      },
      {
        nodeId: "boss",
        role: "boss" as const,
        title: "Boss",
        state: "locked" as const,
        academicTarget: { domain: "math", skill: "multiplication_mastery", targets: [] },
        algorithmOwner: "mastery-gating",
        theoryId: "academic-theory-1",
        experimentId: "experiment-boss",
        mechanic: "generated-after-quest",
        theme: "pending",
        openingScreen: { title: "Boss", purpose: "Locked until Quest evidence is ready." },
        generationPrompt: null,
        artifactBinding: null,
        artwork: { status: "placeholder" as const, localPath: "/thumbnails/boss.svg", prompt: null },
        sfxContract: ["tap", "complete"],
        companionContract: { events: ["session_complete"] },
        evidenceContract: { academic: true, engagement: true, companionObservations: true },
        evidenceIds: [],
      },
    ],
  };
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function minimalProfile(): LearningProfile {
  return {
    demographics: { age: 8, grade: "3", dyslexia: false, adhd: false, languages: ["en"] },
    name: "Reina",
    interests: [],
    goals: [],
    sessionStats: { totalSessions: 0, totalWordsMastered: 0, currentStreak: 0 },
    moodHistory: [],
    pendingHomework: {
      weekOf: "2026-07-11",
      homeworkId: "hw-math-cycle",
      testDate: null,
      wordList: [],
      generatedAt: "2026-07-11T20:00:00.000Z",
      nodes: [],
    },
  } as unknown as LearningProfile;
}

describe("canonical learning cycle repository", () => {
  it("records returned graded work as fact without interpreting or changing lifecycle", () => {
    const rootDir = root();
    createLearningCycle(input(), { rootDir, now: new Date("2026-07-17T12:00:00.000Z") });
    const updated = recordLearningCycleCalibration("reina", "hw-math-cycle", {
      calibrationId: "calibration-returned-1",
      gradedAt: "2026-07-24T12:00:00.000Z",
      score: 0.8,
      status: "supported",
      gradedItems: [
        { target: "5x2", correct: true },
        { target: "pencils-word-problem", correct: false, note: "added groups" },
      ],
      sourceFile: "returned-math.pdf",
      reason: "Returned assignment broadly supported the preregistered theory.",
      nextAction: "Preserve fact practice and revise story translation support.",
    }, { rootDir, now: new Date("2026-07-24T12:00:00.000Z") });

    expect(updated.homeworkId).toBe("hw-math-cycle");
    expect(updated.calibrations).toHaveLength(1);
    expect(updated.calibrations?.[0]?.gradedItems).toHaveLength(2);
    expect(updated.lifecycle).toBe("baseline_ready");
    expect(updated.decisionHistory.at(-1)).toMatchObject({
      eventType: "graded_work_received",
      evidenceIds: ["calibration-returned-1"],
    });
    expect(updated.decisionHistory.at(-1)).not.toHaveProperty("status");
  });

  it("repairs impossible historical progression before child-chart planning begins", () => {
    const rootDir = root();
    const created = createLearningCycle(input(), { rootDir });
    const file = path.join(rootDir, "src/context/reina/homework/cycles/hw-math-cycle.json");
    const corrupted = structuredClone(created);
    corrupted.lifecycle = "quest_generating";
    corrupted.nodes.find((node) => node.role === "quest")!.state = "generating";
    corrupted.nodes.find((node) => node.role === "boss")!.state = "completed";
    fs.writeFileSync(file, JSON.stringify(corrupted, null, 2), "utf8");

    const repaired = repairHistoricalLearningCycleBeforePlanning("reina", "hw-math-cycle", { rootDir });

    expect(repaired?.lifecycle).toBe("baseline_ready");
    expect(repaired?.nodes.find((node) => node.role === "quest")?.state).toBe("locked");
    expect(repaired?.nodes.find((node) => node.role === "boss")?.state).toBe("locked");
  });

  it("creates and reads one versioned canonical cycle file", () => {
    const rootDir = root();
    const cycle = createLearningCycle(input(), { rootDir, now: new Date("2026-07-11T20:00:00.000Z") });
    const file = path.join(rootDir, "src/context/reina/homework/cycles/hw-math-cycle.json");

    expect(fs.existsSync(file)).toBe(true);
    expect(cycle.schemaVersion).toBe(2);
    expect(cycle.revision).toBe(1);
    expect(getLearningCycle("reina", "hw-math-cycle", { rootDir })).toEqual(cycle);
  });

  it("rejects a cycle whose Boss has progressed before Quest evidence exists", () => {
    const rootDir = root();
    const invalid = input();
    const boss = invalid.nodes.find((node) => node.role === "boss");
    if (!boss) throw new Error("test fixture is missing Boss");
    (boss as { state: "locked" | "completed" }).state = "completed";

    expect(() => createLearningCycle(invalid, { rootDir })).toThrow(
      "learning_cycle_boss_progress_requires_quest_evidence",
    );
  });

  it("treats a legacy V1 homework cycle as not yet canonical", () => {
    const rootDir = root();
    const file = path.join(rootDir, "src/context/reina/homework/cycles/hw-math-cycle.json");
    writeJson(file, { homeworkId: "hw-math-cycle", subject: "math", nodes: [] });
    expect(getLearningCycle("reina", "hw-math-cycle", { rootDir })).toBeNull();
  });

  it("backs up a legacy V1 file before creating the canonical cycle", () => {
    const rootDir = root();
    const file = path.join(rootDir, "src/context/reina/homework/cycles/hw-math-cycle.json");
    writeJson(file, { homeworkId: "hw-math-cycle", subject: "math", nodes: [{ id: "old" }] });

    const cycle = createLearningCycle(input(), { rootDir });

    expect(cycle.schemaVersion).toBe(2);
    expect(getLearningCycle("reina", "hw-math-cycle", { rootDir })).toEqual(cycle);
    expect(JSON.parse(fs.readFileSync(`${file}.v1.backup`, "utf8"))).toMatchObject({ homeworkId: "hw-math-cycle" });
  });

  it("derives deterministic compatibility projections with static Quest and Boss names", () => {
    const rootDir = root();
    const cycle = createLearningCycle(input(), { rootDir });
    const first = projectLearningCycle(cycle);
    const second = projectLearningCycle(cycle);

    expect(second).toEqual(first);
    expect(first.activeSessionPlan.nodePlan.map((node) => node.title)).toEqual([
      "Fact Blaster",
      "Quest",
      "Boss",
    ]);
    expect(first.adventureBoard.nodes.find((node) => node.id === "quest")?.label).toBe("Quest");
    expect(first.adventureBoard.nodes.find((node) => node.id === "boss")?.label).toBe("Boss");
  });

  it("projects completed canonical nodes as replayable completed board nodes", () => {
    const rootDir = root();
    const cycle = createLearningCycle(input(), { rootDir });
    const completed = transitionLearningCycle("reina", "hw-math-cycle", cycle.revision, {
      type: "baseline_completed",
      nodeId: "baseline-facts",
      academicEvidence: [{ evidenceId: "attempt:complete", summary: "Completed", accuracy: 1 }],
      engagementEvidence: [],
      companionObservations: [],
      decision: {
        status: "supported",
        reason: "The activity was completed.",
        nextAction: "Wait for the next instrument.",
      },
    }, { rootDir });

    const boardNode = projectLearningCycle(completed).adventureBoard.nodes
      .find((node) => node.id === "baseline-facts");

    expect(boardNode?.state).toBe("completed");
    expect(boardNode?.action?.type).toBe("launch-activity");
  });

  it("rejects a compatibility plan that drifts from the canonical projection", () => {
    const rootDir = root();
    const cycle = createLearningCycle(input(), { rootDir });
    const projection = projectLearningCycle(cycle).activeSessionPlan;
    expect(() => assertLearningCycleProjectionWrite("reina", projection, { rootDir })).not.toThrow();
    expect(() => assertLearningCycleProjectionWrite("reina", {
      ...projection,
      nodePlan: projection.nodePlan.map((node, index) => index === 0 ? { ...node, title: "Rocket Launch Countdown" } : node),
    }, { rootDir })).toThrow("learning_cycle_compatibility_projection_drift");
  });

  it("records engagement mirror updates as canonical versioned transitions", () => {
    const rootDir = root();
    const cycle = createLearningCycle(input(), { rootDir });
    const theory = { theoryId: "engagement-1", childId: "reina", domain: "math", hypothesis: "Reina may prefer puzzles", dimensions: {}, promptDirectives: { prefer: ["puzzle"], avoid: [], vary: [], holdConstant: ["targets"] }, evidence: [], nextExperiment: null, updatedAt: "2026-07-11T20:30:00.000Z" } as unknown as NonNullable<typeof cycle.engagementTheory>;
    const next = transitionLearningCycle("reina", "hw-math-cycle", cycle.revision, { type: "engagement_theory_updated", theory, reason: "Choice and completion evidence revised preference theory." }, { rootDir });
    expect(next.engagementTheory).toEqual(theory);
    expect(next.decisionHistory.at(-1)?.eventType).toBe("engagement_theory_updated");
  });

  it("retires a bound artifact that fails a later semantic audit", () => {
    const rootDir = root();
    const cycle = createLearningCycle(input(), { rootDir });
    const bound = transitionLearningCycle("reina", "hw-math-cycle", cycle.revision, { type: "artifact_bound", nodeId: "baseline-facts", artifact: { contentId: "bad", artifactId: "bad", localArtifactPath: "/games/bad.html", localArtworkPath: "/generated/bad.png", contractFingerprint: "bad", validationStatus: "passed" } }, { rootDir });
    const rejected = transitionLearningCycle("reina", "hw-math-cycle", bound.revision, { type: "artifact_rejected", nodeId: "baseline-facts", reason: "Rendered title did not match the node contract." }, { rootDir });
    expect(rejected.nodes.find((node) => node.nodeId === "baseline-facts")?.artifactBinding).toBeNull();
    expect(rejected.nodes.find((node) => node.nodeId === "baseline-facts")?.state).toBe("blocked");
  });

  it("preserves browser validation proof through the canonical plan projection", () => {
    const rootDir = root();
    const cycle = createLearningCycle(input(), { rootDir });
    const proof = {
      engine: "playwright" as const,
      passed: true,
      worldStateChanged: true,
      screenshotPaths: ["/tmp/open.png", "/tmp/play.png", "/tmp/complete.png"],
    };
    const bound = transitionLearningCycle("reina", "hw-math-cycle", cycle.revision, {
      type: "artifact_bound",
      nodeId: "baseline-facts",
      artifact: {
        contentId: "content:fact:1",
        artifactId: "artifact:fact:1",
        localArtifactPath: "/games/fact.html",
        localArtworkPath: "/generated/fact.png",
        contractFingerprint: "fact-contract-1",
        validationStatus: "passed",
        validationProof: proof,
      },
    }, { rootDir });

    expect(projectLearningCycle(bound).activeSessionPlan.nodePlan[0]?.validationProof).toEqual(proof);
    expect(projectLearningCycle(bound).activeSessionPlan.nodePlan[0]?.date).toBe("hw-math-cycle");
  });

  it("turns baseline evidence into the Quest prompt without mixing evidence streams", () => {
    const rootDir = root();
    const cycle = createLearningCycle(input(), { rootDir });
    const next = transitionLearningCycle("reina", "hw-math-cycle", cycle.revision, {
      type: "baseline_completed",
      nodeId: "baseline-facts",
      academicEvidence: [{ evidenceId: "attempt:1", summary: "4/5 correct", accuracy: 0.8 }],
      engagementEvidence: [{ evidenceId: "choice:1", summary: "selected and completed speed route" }],
      companionObservations: [{ evidenceId: "companion:1", summary: "asked for one hint" }],
      decision: {
        status: "supported",
        reason: "Fact retrieval is strong enough to test transfer.",
        nextAction: "Generate Quest from baseline evidence.",
      },
    }, { rootDir, now: new Date("2026-07-11T20:10:00.000Z") });

    expect(next.lifecycle).toBe("quest_generating");
    expect(next.evidence.academic.map((item) => item.evidenceId)).toEqual(["attempt:1"]);
    expect(next.evidence.engagement.map((item) => item.evidenceId)).toEqual(["choice:1"]);
    expect(next.evidence.companionObservations.map((item) => item.evidenceId)).toEqual(["companion:1"]);
    const quest = next.nodes.find((node) => node.role === "quest");
    expect(quest?.title).toBe("Quest");
    expect(quest?.state).toBe("generating");
    expect(quest?.generationPrompt?.createdFromEvidenceIds).toEqual(["attempt:1", "choice:1"]);
    expect(quest?.generationPrompt?.text).toContain("Fact retrieval is strong enough to test transfer");
    expect(quest?.generationPrompt?.text).not.toContain("asked for one hint");
  });

  it("requires Quest evidence before creating a Boss prompt and awaits calibration after Boss", () => {
    const rootDir = root();
    const cycleInput = input();
    const initialQuest = cycleInput.nodes.find((node) => node.role === "quest");
    if (initialQuest) (initialQuest.academicTarget as { targets: string[] }).targets = ["5x2", "5x5"];
    const initialBoss = cycleInput.nodes.find((node) => node.role === "boss");
    if (initialBoss) initialBoss.academicTarget.targets = [];
    const created = createLearningCycle(cycleInput, { rootDir });
    const baseline = transitionLearningCycle("reina", "hw-math-cycle", created.revision, {
      type: "baseline_completed",
      nodeId: "baseline-facts",
      academicEvidence: [{ evidenceId: "attempt:1", summary: "4/5 correct", accuracy: 0.8 }],
      engagementEvidence: [],
      companionObservations: [],
      decision: { status: "supported", reason: "Ready for transfer.", nextAction: "Generate Quest." },
    }, { rootDir });
    const questReady = transitionLearningCycle("reina", "hw-math-cycle", baseline.revision, {
      type: "artifact_bound",
      nodeId: "quest",
      artifact: {
        contentId: "content:quest:1",
        artifactId: "artifact:quest:1",
        localArtifactPath: "/tmp/quest.html",
        localArtworkPath: "/generated/quest.png",
        contractFingerprint: "quest-contract-1",
        validationStatus: "passed",
      },
    }, { rootDir });
    const questBoardNode = projectLearningCycle(questReady).adventureBoard.nodes
      .find((node) => node.id === "quest");
    expect(questBoardNode?.state).toBe("available");
    expect(questBoardNode?.action?.type).toBe("launch-activity");
    const bossGenerating = transitionLearningCycle("reina", "hw-math-cycle", questReady.revision, {
      type: "quest_completed",
      nodeId: "quest",
      academicEvidence: [{ evidenceId: "attempt:quest:1", summary: "Transfer remained fragile", accuracy: 0.65 }],
      engagementEvidence: [],
      companionObservations: [],
      decision: {
        status: "revised",
        reason: "Transfer is still fragile under context change.",
        nextAction: "Generate Boss clarification probe.",
        bossRequired: true,
      },
    }, { rootDir });

    expect(bossGenerating.lifecycle).toBe("boss_generating");
    expect(bossGenerating.nodes.find((node) => node.role === "boss")?.generationPrompt?.createdFromEvidenceIds)
      .toEqual(["attempt:quest:1"]);
    expect(bossGenerating.nodes.find((node) => node.role === "boss")?.academicTarget.targets)
      .toEqual(questReady.nodes.find((node) => node.role === "quest")?.academicTarget.targets);

    const bossReady = transitionLearningCycle("reina", "hw-math-cycle", bossGenerating.revision, {
      type: "artifact_bound",
      nodeId: "boss",
      artifact: {
        contentId: "content:boss:1",
        artifactId: "artifact:boss:1",
        localArtifactPath: "/tmp/boss.html",
        localArtworkPath: "/generated/boss.png",
        contractFingerprint: "boss-contract-1",
        validationStatus: "passed",
      },
    }, { rootDir });
    const awaiting = transitionLearningCycle("reina", "hw-math-cycle", bossReady.revision, {
      type: "boss_completed",
      nodeId: "boss",
      academicEvidence: [{ evidenceId: "attempt:boss:1", summary: "Boss completed", accuracy: 0.9 }],
      engagementEvidence: [],
      companionObservations: [],
      decision: {
        status: "awaiting_calibration",
        reason: "In-app mastery requires delayed or graded confirmation.",
        nextAction: "Wait for calibration evidence.",
      },
    }, { rootDir });

    expect(awaiting.lifecycle).toBe("awaiting_calibration");
  });

  it("rejects stale writers", () => {
    const rootDir = root();
    const cycle = createLearningCycle(input(), { rootDir });
    expect(() => transitionLearningCycle("reina", "hw-math-cycle", 0, {
      type: "block",
      reason: "stale writer test",
    }, { rootDir })).toThrow("learning_cycle_revision_conflict");
    expect(getLearningCycle("reina", "hw-math-cycle", { rootDir })?.revision).toBe(cycle.revision);
  });

  it("makes the child chart expose and project the canonical cycle over stale legacy plans", () => {
    const rootDir = root();
    writeJson(path.join(rootDir, "children.config.json"), {
      defaultCompanionId: "elli",
      childCompanionIds: { reina: "elli" },
      childProfiles: {},
      companions: {
        elli: {
          name: "Elli",
          vrmUrl: "/companions/sample.vrm",
          expressions: {},
          faceCamera: { position: [0, 1.4, 0.8], target: [0, 1.4, 0] },
          dopamineGames: [],
        },
      },
    });
    writeJson(path.join(rootDir, "src/context/reina/learning_profile.json"), minimalProfile());
    writeJson(path.join(rootDir, "src/context/reina/plans/active_session_plan.json"), {
      version: 1,
      childId: "reina",
      current: { planId: "stale-legacy-plan", nodePlan: [] },
      activeByDomain: {},
      updatedAt: "2026-07-11T19:00:00.000Z",
    });
    const cycle = createLearningCycle(input(), { rootDir });

    const chart = getChildChart("reina", { rootDir });
    expect(chart.learningCycle).toEqual(cycle);
    expect(chart.learningHistory.childId).toBe("reina");
    expect(chart.activeSessionPlan?.planId).toContain("learning-cycle:hw-math-cycle");
    expect(chart.activeSessionPlan?.nodePlan.map((node) => node.title)).toEqual([
      "Fact Blaster",
      "Quest",
      "Boss",
    ]);
  });

  it("reconciles re-ingestion without erasing accumulated evidence", () => {
    const rootDir = root();
    const created = createLearningCycle(input(), { rootDir });
    const measured = transitionLearningCycle("reina", "hw-math-cycle", created.revision, {
      type: "baseline_completed",
      nodeId: "baseline-facts",
      academicEvidence: [{ evidenceId: "attempt:keep", summary: "evidence survives", accuracy: 0.8 }],
      engagementEvidence: [],
      companionObservations: [],
      decision: { status: "supported", reason: "ready", nextAction: "generate quest" },
    }, { rootDir });
    const replannedNodes = input().nodes.map((node) =>
      node.nodeId === "baseline-facts" ? { ...node, theme: "new controlled theme" } : node,
    );
    const reconciled = transitionLearningCycle("reina", "hw-math-cycle", measured.revision, {
      type: "plan_reconciled",
      assignment: input().assignment,
      academicTheory: { ...input().academicTheory, revision: 2 },
      engagementTheory: null,
      nodes: replannedNodes,
      reason: "Re-ingestion refreshed the plan without restarting the cycle.",
    }, { rootDir });

    expect(reconciled.revision).toBe(measured.revision + 1);
    expect(reconciled.evidence.academic.map((item) => item.evidenceId)).toContain("attempt:keep");
    expect(reconciled.nodes.find((node) => node.nodeId === "baseline-facts")?.theme).toBe("new controlled theme");
    expect(reconciled.lifecycle).toBe("baseline_ready");
    expect(reconciled.nodes.find((node) => node.role === "quest")?.state).toBe("locked");
    expect(reconciled.nodes.find((node) => node.role === "boss")?.state).toBe("locked");
  });

  it("rejects changing a preregistered prediction after real observations exist", () => {
    const rootDir = root();
    const initial = input();
    const prediction = {
      predictionId: "prediction:equal-groups",
      theoryId: initial.academicTheory.theoryId,
      constructId: "math.multiplication.equal_groups",
      context: "returned work",
      horizon: "within_7_days",
      expectedMetric: { key: "academic.accuracy", min: 0.7, max: 0.9 },
      predictedErrorPatterns: [],
      confidence: 0.6,
      evidenceIds: ["assignment:pdf:1"],
      intervention: "equal-groups practice",
      evidenceLimit: "calibrated_mastery" as const,
      createdAt: "2026-07-18T12:00:00.000Z",
      lockedAt: "2026-07-18T12:00:00.000Z",
    };
    const cycle = createLearningCycle({ ...initial, academicPredictions: [prediction] }, { rootDir });
    const withObservation = structuredClone(cycle);
    withObservation.observations.push({
      observationId: "obs:1", sourceId: "source:1", itemId: "item:1",
      constructLinks: [{ constructId: prediction.constructId, role: "primary", confidence: 1 }],
      result: { correct: true }, assistance: { status: "unassisted", scaffolds: [] },
      exposure: "unseen", provenance: "graded_work", observedAt: "2026-07-24T12:00:00.000Z", confounds: [],
    });
    const file = path.join(rootDir, "src/context/reina/homework/cycles/hw-math-cycle.json");
    fs.writeFileSync(file, JSON.stringify(withObservation, null, 2), "utf8");

    expect(() => transitionLearningCycle("reina", "hw-math-cycle", cycle.revision, {
      type: "plan_reconciled",
      assignment: initial.assignment,
      academicTheory: initial.academicTheory,
      engagementTheory: null,
      nodes: initial.nodes,
      academicPredictions: [{ ...prediction, expectedMetric: { ...prediction.expectedMetric, min: 0.9 } }],
      reason: "Attempted retrospective rewrite.",
    }, { rootDir })).toThrow("learning_cycle_prediction_immutable:prediction:equal-groups");
  });
});
