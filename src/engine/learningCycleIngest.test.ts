import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import {
  buildLearningCycleInputFromPlan,
  buildSpellingRecallItems,
  buildSpellingTargetedCycleInput,
  persistIngestedLearningCycle,
} from "./learningCycleIngest";
import { getLearningCycle, transitionLearningCycle, type LearningCycleRecordV2 } from "./learningCycleRepository";

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
  it("keeps a Mystery role while launching its academic Concept Check instrument", () => {
    const homeworkId = "hw-spelling-mystery-instrument";
    const sourceEvidenceId = "assignment:spelling-list";
    const spellingItems = buildSpellingRecallItems({
      homeworkId,
      words: ["night", "light"],
      evidenceIds: [sourceEvidenceId],
      measurementRole: "practice",
    });
    const cycle = {
      childId: "lab-child",
      homeworkId,
      domain: "spelling",
      assignment: {
        title: "School words",
        contentFingerprint: "spelling-fingerprint",
        capturedEvidenceIds: [sourceEvidenceId],
        targets: ["night", "light"],
      },
      nodes: [{
        nodeId: `${homeworkId}:discovery`,
        role: "evaluation",
        evidenceContract: {
          spellingItems: Object.fromEntries(spellingItems.map((item) => [item.id, item])),
        },
      }],
      observations: [],
    } as unknown as LearningCycleRecordV2;
    const conceptCheck = {
      schemaVersion: 1,
      activityId: "concept-check",
      engine: { id: "concept-check", mode: "choose" },
      topic: "School words",
      domain: "spelling",
      learningGoal: "Choose the correctly spelled word.",
      gradeBand: "early_elementary",
      targets: [
        { id: "planner-night", label: "night", type: "word" },
        { id: "planner-light", label: "light", type: "word" },
      ],
      rounds: [
        { id: "round-night", mechanic: "choose", targetId: "planner-night", prompt: "Choose night.", options: [{ id: "night", label: "night", correct: true }, { id: "nite", label: "nite", correct: false }], scaffoldLevel: 0 },
        { id: "round-light", mechanic: "choose", targetId: "planner-light", prompt: "Choose light.", options: [{ id: "light", label: "light", correct: true }, { id: "lite", label: "lite", correct: false }], scaffoldLevel: 0 },
      ],
      evidencePolicy: { writesPracticeEvidence: true, writesMasteryEvidence: false, requiresPerTargetResult: true, allowedEvidence: ["practice"] },
    };
    const plan = {
      planId: `targeted:${homeworkId}`,
      childId: "lab-child",
      createdAt: "2026-10-01T12:00:00.000Z",
      source: "ingest_human_loop",
      activeHomeworkId: homeworkId,
      domain: "spelling",
      testDate: null,
      nodePlan: [
        { id: "mystery-check", type: "mystery", activityId: "mystery", title: "Mystery Choice", targets: ["night", "light"], difficulty: 1, source: "chart_planner", activityConfig: conceptCheck },
        { id: "fresh-check", type: "word-radar", activityId: "word-radar", title: "Fresh Check", targets: ["night", "light"], difficulty: 1, source: "chart_planner", wordRadarConfig: { recallMode: "hidden_word_recall", inputMode: "keyboard" } },
      ],
      plannedMeasurements: [
        { id: "measure-mystery-check", activityId: "mystery", target: "night,light", evidenceType: "recall", supportCriteria: "Practice is completed.", reviseCriteria: "Practice is confusing.", falsifyCriteria: "No response is captured.", spelling: { role: "practice", evidenceIds: [sourceEvidenceId], interventionNodeIds: [], reason: "Practice both words.", uncertainty: "No delayed evidence yet.", expectedAccuracy: { min: 0.4, max: 1 }, confidence: 0.5, maxDelayDays: 7 } },
        { id: "measure-fresh-check", activityId: "word-radar", target: "night,light", evidenceType: "recall", supportCriteria: "Fresh recall improves.", reviseCriteria: "Recall remains mixed.", falsifyCriteria: "No improvement.", spelling: { role: "fresh_checkpoint", evidenceIds: [sourceEvidenceId], interventionNodeIds: ["mystery-check"], reason: "Check both words without help.", uncertainty: "One occasion.", expectedAccuracy: { min: 0.6, max: 1 }, confidence: 0.5, maxDelayDays: 7, finalCheck: true } },
      ],
      variationPolicy: { avoidExactPreviousNodeOrder: true, avoidExactPreviousWordOrder: true, seed: "spelling", previousCompletedNodeCount: 0 },
      companionPolicy: { companionId: "elli", displayName: "Elli", openingLinePolicy: "context_start_short", verbosity: "low", maxMicroProbes: 1 },
      evidenceUsed: [{ id: sourceEvidenceId, type: "assignment", summary: "Captured spelling list." }],
      openQuestions: [],
      planTheory: { hypothesis: "Practice may improve recall.", evidenceSummary: [sourceEvidenceId], intervention: "Concept check then fresh recall.", supportCriteria: ["Improvement"], reviseCriteria: ["Mixed"], falsifyCriteria: ["No improvement"] },
    } as unknown as ActiveSessionPlan;

    const contract = buildSpellingTargetedCycleInput({
      cycle,
      plan,
      now: "2026-10-01T12:00:00.000Z",
    });
    const mystery = contract.nodes.find((node) => node.nodeId === "mystery-check")!;

    expect(mystery.role).toBe("mystery");
    expect(mystery.implementationType).toBe("concept-check");
    expect(mystery.evidenceContract.nativeConfig).toMatchObject({
      activityId: "concept-check",
      domain: "spelling",
    });
    expect(Object.keys(mystery.evidenceContract.spellingItems ?? {})).toHaveLength(2);

    const missingInstrument = structuredClone(plan);
    delete missingInstrument.nodePlan[0]!.activityConfig;
    expect(() => buildSpellingTargetedCycleInput({
      cycle,
      plan: missingInstrument,
      now: "2026-10-01T12:00:00.000Z",
    })).toThrow("spelling_mystery_academic_instrument_missing:mystery-check");
  });

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

  it("test 12: creates one opening board and resumes the same unchanged assignment idempotently", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-cycle-ingest-"));
    const first = persistIngestedLearningCycle(input(), { rootDir });
    const changed = plan();
    changed.nodePlan[0]!.theme = "new theme";
    const second = persistIngestedLearningCycle({ ...input(), plan: changed }, { rootDir });

    expect(first.schemaVersion).toBe(2);
    expect(first.boards).toHaveLength(1);
    expect(first.boards![0]).toMatchObject({ kind: "teaching", predecessorBoardId: null });
    expect(first.nodes.some((node) => node.role === "quest" || node.role === "boss")).toBe(false);
    expect(second).toEqual(first);
    expect(getLearningCycle("reina", "hw-math-cycle", { rootDir })).toEqual(first);
  });

  it("test 13: a new assignment creates its own separate cycle and leaves the original untouched", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-cycle-ingest-new-"));
    const original = persistIngestedLearningCycle(input(), { rootDir });
    const next = persistIngestedLearningCycle({ ...input(), homeworkId: "hw-math-next", contentFingerprint: "fingerprint-next" }, { rootDir });
    expect(next.homeworkId).toBe("hw-math-next");
    expect(next.revision).toBe(1);
    expect(next.boards?.[0]?.boardId).toBe("hw-math-next:board:1");
    expect(getLearningCycle("reina", "hw-math-cycle", { rootDir })).toEqual(original);
  });

  it("refuses to mutate a published board when the same assignment id arrives with different content", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-cycle-ingest-changed-"));
    const first = persistIngestedLearningCycle(input(), { rootDir });
    expect(() => persistIngestedLearningCycle({ ...input(), contentFingerprint: "different-content" }, { rootDir }))
      .toThrow("learning_cycle_reingestion_fingerprint_changed:hw-math-cycle");
    expect(getLearningCycle("reina", "hw-math-cycle", { rootDir })).toEqual(first);
  });

  it("re-ingestion preserves evidence and never revokes a prepared successor board", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-cycle-reingest-successor-"));
    let cycle = persistIngestedLearningCycle(input(), { rootDir });
    cycle = transitionLearningCycle("reina", "hw-math-cycle", cycle.revision, {
      type: "instrument_observed", nodeId: "facts", observations: [],
      academicEvidence: [{ evidenceId: "real-child:baseline:1", summary: "Baseline complete", accuracy: 0.8 }],
      engagementEvidence: [], companionObservations: [],
    }, { rootDir });
    cycle = transitionLearningCycle("reina", "hw-math-cycle", cycle.revision, {
      type: "theory_decided",
      decision: {
        status: "supported", reason: "Practice more before transfer.", nextAction: "generate_support",
        evidenceIds: ["real-child:baseline:1"], predictionEvaluationIds: [], preserve: [], change: [], testNext: [], nextEvidenceRequired: [],
        progressionAction: "generate_support",
        successor: { instruments: [{ nodeId: "groups", title: "Group Garden", academicTarget: "equal groups", mechanic: "sort", theme: "garden", openingPurpose: "Sort", creatorPrompt: "Build" }] },
      },
    }, { rootDir });

    const refreshed = persistIngestedLearningCycle(input(), { rootDir });

    expect(refreshed).toEqual(cycle);
    expect(refreshed.boards).toHaveLength(2);
    expect(refreshed.evidence.academic.map((item) => item.evidenceId)).toContain("real-child:baseline:1");
  });

  it("re-ingesting a legacy cycle keeps an existing Quest and its evidence", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-cycle-legacy-quest-"));
    const created = persistIngestedLearningCycle(input(), { rootDir });
    const file = path.join(rootDir, "src/context/reina/homework/cycles/hw-math-cycle.json");
    const legacy = structuredClone(created);
    delete legacy.boards;
    const quest = structuredClone(buildLearningCycleInputFromPlan(input()).nodes.find((node) => node.role === "quest")!);
    quest.state = "completed";
    quest.evidenceIds = ["real-child:quest:1"];
    legacy.nodes.push(quest);
    fs.writeFileSync(file, JSON.stringify(legacy, null, 2), "utf8");

    const refreshed = persistIngestedLearningCycle(input(), { rootDir });

    expect(refreshed.nodes.find((node) => node.nodeId === quest.nodeId)).toMatchObject({ state: "completed", evidenceIds: ["real-child:quest:1"] });
  });

  it("repairs an invalid historical Quest/Boss state during re-ingestion", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-cycle-invalid-history-"));
    const created = persistIngestedLearningCycle(input(), { rootDir });
    const file = path.join(rootDir, "src/context/reina/homework/cycles/hw-math-cycle.json");
    // A pre-contract-21 cycle with impossible legacy Quest/Boss placeholders.
    const corrupted = structuredClone(created);
    delete corrupted.boards;
    corrupted.lifecycle = "quest_generating";
    const legacyBuilt = buildLearningCycleInputFromPlan(input()).nodes;
    const quest = structuredClone(legacyBuilt.find((node) => node.role === "quest")!);
    const boss = structuredClone(legacyBuilt.find((node) => node.role === "boss")!);
    corrupted.nodes.push(quest, boss);
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
    expect(repaired.nodes.some((node) => node.role === "quest" || node.role === "boss")).toBe(false);
  });
});
