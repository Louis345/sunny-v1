import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateCanonicalProgressionArtifact } from "./canonicalProgressionGenerator";
import {
  createLearningCycle,
  getLearningCycle,
  type CreateLearningCycleInput,
  type LearningCycleNodeContract,
} from "./learningCycleRepository";
import { advanceCanonicalCycleFromEvidence, recordCanonicalNodeCompletion } from "./learningCycleRuntime";
import {
  buildLongitudinalLearningHistory,
  interpretReturnedWorkBatch,
  recordConfirmedReturnedWork,
} from "./longitudinalLearning";

function root(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-closed-loop-"));
}

function item(id: string, expected: number, measurementRole: "practice" | "fresh_checkpoint" = "fresh_checkpoint") {
 return { id, prompt: `Lab ${id}`, lineage: {sourceEvidenceIds:["assignment:school-pdf"],exposure: "unseen" as const,measurementRole}, response:{mode:"numeric" as const,expected} };
}
function prescription(nodeId: string, id: string, expected: number) { return {nodeId,title:nodeId==="quest"?"Quest":"Boss",academicTarget:"math.multiplication.equal_groups",mechanic:"lab",theme:"harbor",openingPurpose:"Measure transfer",creatorPrompt:"Build frozen items",items:[item(id,expected)]}; }
function node(
  nodeId: string,
  role: "baseline" | "quest" | "boss",
  state: "ready" | "locked",
): LearningCycleNodeContract {
  const title = role === "quest" ? "Quest" : role === "boss" ? "Boss" : "Array Harbor";
  return {
    nodeId,
    routeId: role === "baseline" ? "visual-route" : undefined,
    predictionId: role === "baseline" ? "prediction:equal-groups" : undefined,
    role,
    title,
    state,
    academicTarget: {
      domain: "math",
      skill: role === "baseline" ? "equal groups and arrays" : role === "quest" ? "novel transfer" : "novel synthesis",
      targets: role === "baseline" ? ["assignment-item-1"] : [],
    },
    algorithmOwner: "ai_tutor",
    theoryId: "theory:equal-groups",
    experimentId: `experiment:${nodeId}`,
    mechanic: role === "baseline" ? "visual construction" : "evidence-generated",
    theme: "AI-authored harbor world",
    openingScreen: { title, purpose: role === "baseline" ? "Connect equal groups to multiplication." : `Test ${role}.` },
    generationPrompt: null,
    artifactBinding: role === "baseline" ? {
      contentId: "content:baseline",
      artifactId: "artifact:baseline",
      localArtifactPath: "/games/baseline.html",
      localArtworkPath: "/generated/baseline.png",
      contractFingerprint: "baseline-contract",
      validationStatus: "passed",
    } : null,
    artwork: { status: "ready", localPath: `/generated/${nodeId}.png`, prompt: null },
    sfxContract: ["interaction", "recovery", "progress", "completion"],
    companionContract: { events: ["completion", "frustration"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true, ...(role === "baseline" ? {itemContracts:Object.fromEntries([item("practice-array-3x4",12,"practice"),item("practice-array-5x2",10,"practice"),item("checkpoint-array-4x4",16)].map(item=>[item.id,item]))} : {}) },
    evidenceIds: [],
  };
}

function cycleInput(): CreateLearningCycleInput {
  return {
    childId: "reina",
    homeworkId: "hw-school-equal-groups",
    domain: "math",
    assignment: {
      title: "School multiplication assignment",
      contentFingerprint: "school-pdf-fingerprint",
      capturedEvidenceIds: ["assignment:school-pdf"],
      targets: ["math.multiplication.equal_groups"],
      returnTag: "#sunny_reina_hw_school_equal_groups",
    },
    academicTheory: {
      theoryId: "theory:equal-groups",
      revision: 1,
      hypothesis: "Reina can build equal groups and may need help connecting them to notation.",
      supportCriteria: ["Unassisted transfer matches the predicted range."],
      reviseCriteria: ["Errors cluster around translating representations."],
      falsifyCriteria: ["Independent work contradicts the hypothesis."],
    },
    engagementTheory: null,
    nodes: [node("array-harbor", "baseline", "ready"), node("quest", "quest", "locked"), node("boss", "boss", "locked")],
    academicPredictions: [{
      predictionId: "prediction:equal-groups",
      theoryId: "theory:equal-groups",
      constructId: "math.multiplication.equal_groups",
      context: "returned school assignment completed without Sunny",
      horizon: "within_7_days",
      eligibility: {sources:["graded_work"],maxDelayDays:7},
      expectedMetric: { key: "academic.accuracy", min: 0.7, max: 0.9 },
      predictedErrorPatterns: ["representation_to_notation"],
      confidence: 0.65,
      evidenceIds: ["assignment:school-pdf"],
      intervention: "AI-authored visual equal-groups intervention",
      evidenceLimit: "practice_only",
      createdAt: "2026-07-21T12:00:00.000Z",
      lockedAt: "2026-07-21T12:00:00.000Z",
    }],
  };
}

describe("math closed learning loop acceptance", () => {
  it("connects assignment prediction through Boss and returned work to the improved next intervention", async () => {
    const rootDir = root();
    createLearningCycle(cycleInput(), { rootDir, now: new Date("2026-07-21T12:00:00.000Z") });

    const baselineObserved = recordCanonicalNodeCompletion({
      childId: "reina",
      homeworkId: "hw-school-equal-groups",
      sessionId: "session:baseline",
      nodeId: "array-harbor",
      result: {
        completed: true,
        accuracy: 0.8,
        timeSpent_ms: 90_000,
        targetResults: [
          { target: "practice-array-3x4", correct: true, attemptedValue: "12", responseTime_ms: 15_000 },
          { target: "practice-array-5x2", correct: false, attemptedValue: "7", responseTime_ms: 20_000 },
          { target: "checkpoint-array-4x4", correct: true, attemptedValue: "16", responseTime_ms: 10_000 },
        ],
      },
    }, { rootDir, now: new Date("2026-07-21T12:10:00.000Z") });
    expect(baselineObserved?.lifecycle).toBe("baseline_evaluating");

    const questGenerating = await advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-school-equal-groups",
      decide: async () => ({
        status: "supported",
        reason: "A fresh independent checkpoint supports testing transfer but cannot establish mastery.",
        progressionAction: "generate_quest",
        nextInstrument: prescription("quest","unseen-transfer-garden",18),
        preserve: ["visual grouping"],
        change: ["remove worked examples"],
        testNext: ["unseen equal-groups transfer"],
        nextEvidenceRequired: ["unassisted Quest scorecard"],
      }),
    }, { rootDir, now: new Date("2026-07-21T12:11:00.000Z") });
    expect(questGenerating.nodes.find((entry) => entry.role === "quest")?.generationPrompt?.text)
      .toContain("practice-array-3x4");

    const questReady = await generateCanonicalProgressionArtifact({
      childId: "reina",
      homeworkId: "hw-school-equal-groups",
      generateHtml: async ({ node: generatedNode }) => `<!doctype html><html><body><h1>${generatedNode.title}</h1></body></html>`,
      validate: async () => ({
        passed: true,
        failures: [],
        screenshotPaths: ["/tmp/open.png", "/tmp/recovery.png", "/tmp/mid.png", "/tmp/complete.png"],
      }),
    }, { rootDir, now: new Date("2026-07-21T12:12:00.000Z") });
    expect(questReady.lifecycle).toBe("quest_ready");

    recordCanonicalNodeCompletion({
      childId: "reina",
      homeworkId: "hw-school-equal-groups",
      sessionId: "session:quest",
      nodeId: "quest",
      result: { completed: true, accuracy: 1, timeSpent_ms: 70_000, targetResults: [{ target: "unseen-transfer-garden", correct: true, attemptedValue: "18" }] },
    }, { rootDir, now: new Date("2026-07-21T12:20:00.000Z") });
    await advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-school-equal-groups",
      decide: async () => ({
        status: "supported",
        reason: "Unseen transfer held; test synthesis next.",
        progressionAction: "generate_boss",
        nextInstrument: prescription("boss","unseen-synthesis-market",24),
        preserve: ["independent response"],
        change: ["combine representations"],
        testNext: ["unseen synthesis"],
        nextEvidenceRequired: ["Boss scorecard"],
      }),
    }, { rootDir, now: new Date("2026-07-21T12:21:00.000Z") });
    const bossReady = await generateCanonicalProgressionArtifact({
      childId: "reina",
      homeworkId: "hw-school-equal-groups",
      generateHtml: async ({ node: generatedNode }) => `<!doctype html><html><body><h1>${generatedNode.title}</h1></body></html>`,
      validate: async () => ({
        passed: true,
        failures: [],
        screenshotPaths: ["/tmp/open.png", "/tmp/recovery.png", "/tmp/mid.png", "/tmp/complete.png"],
      }),
    }, { rootDir, now: new Date("2026-07-21T12:22:00.000Z") });
    expect(bossReady.lifecycle).toBe("boss_ready");

    recordCanonicalNodeCompletion({
      childId: "reina",
      homeworkId: "hw-school-equal-groups",
      sessionId: "session:boss",
      nodeId: "boss",
      result: { completed: true, accuracy: 1, timeSpent_ms: 80_000, targetResults: [{ target: "unseen-synthesis-market", correct: true, attemptedValue: "24" }] },
    }, { rootDir, now: new Date("2026-07-21T12:30:00.000Z") });
    const awaiting = await advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-school-equal-groups",
      decide: async () => ({
        status: "awaiting_calibration",
        reason: "Strong in-app synthesis remains provisional until schoolwork returns.",
        progressionAction: "await_calibration",
        preserve: ["visual-to-symbol connection"],
        change: [],
        testNext: [],
        nextEvidenceRequired: ["returned graded work"],
      }),
    }, { rootDir, now: new Date("2026-07-21T12:31:00.000Z") });
    expect(awaiting.lifecycle).toBe("awaiting_calibration");

    const factual = recordConfirmedReturnedWork({
      childId: "reina",
      homeworkId: "hw-school-equal-groups",
      source: {
        sourceId: "returned-work:school-1",
        type: "graded_work",
        fileFingerprint: "marked-school-pdf",
        sourceFile: "/uploads/marked-school-work.pdf",
        provenance: "caregiver",
        capturedAt: "2026-07-25T12:00:00.000Z",
        assignmentLink: { homeworkId: "hw-school-equal-groups", method: "explicit_selection", confidence: 1, confirmedBy: "caregiver" },
        status: "confirmed",
      },
      score: { earned: 4, possible: 5 },
      items: [{
        itemId: "school-item-1",
        prompt: "There are 4 bags with 3 apples each. How many apples?",
        childResponse: "12",
        correct: true,
        extractionConfidence: 1,
        constructLinks: [{ constructId: "math.multiplication.equal_groups", role: "primary", confidence: 1 }],
      }],
    }, { rootDir, now: new Date("2026-07-25T12:00:00.000Z") });
    expect(factual.predictionEvaluations).toHaveLength(1);
    expect(factual.lifecycle).toBe("awaiting_calibration");

    const returnedObservationIds = factual.observations
      .filter((observation) => observation.sourceId === "returned-work:school-1")
      .map((observation) => observation.observationId);
    const evaluationIds = factual.predictionEvaluations
      .filter((evaluation) => evaluation.sourceId === "returned-work:school-1")
      .map((evaluation) => evaluation.evaluationId);
    const interpreted = await interpretReturnedWorkBatch({
      childId: "reina",
      homeworkId: "hw-school-equal-groups",
      sourceId: "returned-work:school-1",
      rootDir,
      now: new Date("2026-07-25T12:01:00.000Z"),
      interpret: async () => ({
        status: "supported",
        reason: "Returned independent work matched the preregistered range.",
        nextAction: "Preserve visual-to-symbol bridges and test generalization on the next assignment.",
        evidenceIds: returnedObservationIds,
        predictionEvaluationIds: evaluationIds,
        preserve: ["visual-to-symbol bridges"],
        change: ["reduce scaffolding sooner"],
        testNext: ["generalization to a new multiplication context"],
        nextEvidenceRequired: ["next independent assignment"],
      }),
    });
    expect(interpreted.cycle.lifecycle).toBe("complete");

    const history = buildLongitudinalLearningHistory("reina", { rootDir });
    expect(history.constructs["math.multiplication.equal_groups"]?.evaluations).toHaveLength(1);
    expect(history.recentDecisions[0]).toMatchObject({
      preserve: ["visual-to-symbol bridges"],
      change: ["reduce scaffolding sooner"],
      testNext: ["generalization to a new multiplication context"],
    });
    expect(getLearningCycle("reina", "hw-school-equal-groups", { rootDir })?.lifecycle).toBe("complete");
  });
});
