import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createLearningCycle,
  getLearningCycle,
  transitionLearningCycle,
  type CreateLearningCycleInput,
  type LearningCycleRecordV2,
} from "../engine/learningCycleRepository";
import { baselineQuestEvidenceEligibility, questBossEvidenceEligibility, advanceCanonicalCycleFromEvidence, recordCanonicalNodeCompletion } from "../engine/learningCycleRuntime";
import { askDirectMathPlanner, mathPlannerChartContext } from "../engine/directMathExperience";
import {
  buildLongitudinalLearningHistory,
  interpretReturnedWorkBatch,
  recordConfirmedReturnedWork,
  type ConfirmedReturnedWork,
} from "../engine/longitudinalLearning";
import { getAssignmentLearningReport } from "../engine/returnedWorkPipeline";
import { existingAssignmentIngestionOutcome } from "./ingestMathDirect";

type ContinuationResult = {
  lifecycle: string;
  readiness: string;
  decisionId: string;
  evaluationId: string;
  nextNodeId: string | null;
  nextPredictionId: string | null;
  priorEvidenceIds: string[];
};

export type MathFeedbackLoopReleaseSummary = {
  status: "PASS" | "FAIL" | "INCOMPLETE";
  completeSessionEvidenceReachedDecisions: boolean;
  weakEvidenceBlockedFromQuestBoss: boolean;
  sameAssignmentReingestionPreservedProgress: boolean;
  returnedWorkControlledReadiness: boolean;
  multipleSessionsPreservedOneHistory: boolean;
  nextPlannerUsedPriorPredictionError: boolean;
  plannerApiPromptIncludedCalibration: boolean;
  currentCodeQuestBossBoundariesPassed: boolean;
  strongBossAwaitedCalibration: boolean;
  productionQuestBossTransitionProof: boolean;
  currentCodeReingestionStatesPassed: boolean;
  plannerContextEvidenceIds: string[];
  plannerContextHash: string;
  realChildDataChanged: boolean;
  identicalStartingHash: boolean;
  startingHash: string;
  strong: ContinuationResult;
  weak: ContinuationResult;
  baselineScenarios: Array<{ name: string; rating: number; lifecycle: string; decisionId: string; nextAction: string }>;
  predictionRows: ReturnType<typeof getAssignmentLearningReport>["predictionAccuracy"];
  calibrationMessage: string;
  canonicalFilesChanged: string[];
  priorProofFiles: string[];
  audit: { contractVersion: number; branch: string; startingCommit: string; productCodeDiff: string[] };
};

function stable(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function treeHash(root: string): string {
  if (!fs.existsSync(root)) return stable([]);
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files.push(file);
    }
  };
  walk(root);
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(root, file));
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function cycleInput(): CreateLearningCycleInput {
  return {
    childId: "proof-child",
    homeworkId: "hw-release-proof-equal-groups",
    domain: "math",
    assignment: {
      title: "Equal groups release proof",
      contentFingerprint: "release-proof-source-v1",
      capturedEvidenceIds: ["assignment:release-proof"],
      targets: ["math.multiplication.equal_groups"],
      returnTag: "#sunny_proof_equal_groups",
    },
    academicTheory: {
      theoryId: "theory:release-proof",
      revision: 1,
      hypothesis: "The child can independently transfer equal-groups reasoning.",
      supportCriteria: ["Confirmed independent accuracy falls within the prediction."],
      reviseCriteria: ["Confirmed work falls below the prediction."],
      falsifyCriteria: ["Repeated independent operation-selection errors."],
    },
    engagementTheory: null,
    assumptions: [{
      assumptionId: "assumption:equal-groups-transfer",
      claim: "Equal-groups reasoning will transfer to returned work.",
      evidenceIds: ["assignment:release-proof"],
      confidence: 0.7,
      uncertainty: "No confirmed returned work existed at launch.",
      createdAt: "2026-08-07T12:00:00.000Z",
      lockedAt: "2026-08-07T12:00:00.000Z",
    }],
    nodes: [{
      nodeId: "baseline-equal-groups",
      role: "baseline",
      title: "Equal Groups Lab",
      state: "ready",
      academicTarget: { domain: "math", skill: "equal groups", targets: ["fresh equal-groups items"] },
      algorithmOwner: "ai_tutor",
      theoryId: "theory:release-proof",
      experimentId: "experiment:release-proof",
      mechanic: "AI-authored construction",
      theme: "AI-authored world",
      openingScreen: { title: "Equal Groups Lab", purpose: "Test equal-groups reasoning." },
      generationPrompt: null,
      artifactBinding: null,
      artwork: { status: "placeholder", localPath: null, prompt: null },
      sfxContract: [],
      companionContract: { events: [] },
      evidenceContract: { academic: true, engagement: true, companionObservations: true },
      evidenceIds: [],
    }, {
      nodeId: "quest",
      role: "quest",
      title: "Quest",
      state: "locked",
      academicTarget: { domain: "math", skill: "unseen transfer", targets: [] },
      algorithmOwner: "ai_tutor",
      theoryId: "theory:release-proof",
      experimentId: "experiment:quest",
      mechanic: "evidence-generated",
      theme: "AI-authored",
      openingScreen: { title: "Quest", purpose: "Test unseen transfer." },
      generationPrompt: null,
      artifactBinding: null,
      artwork: { status: "placeholder", localPath: null, prompt: null },
      sfxContract: [],
      companionContract: { events: [] },
      evidenceContract: { academic: true, engagement: true, companionObservations: true },
      evidenceIds: [],
    }, {
      nodeId: "boss",
      role: "boss",
      title: "Boss",
      state: "locked",
      academicTarget: { domain: "math", skill: "unseen synthesis", targets: [] },
      algorithmOwner: "ai_tutor",
      theoryId: "theory:release-proof",
      experimentId: "experiment:boss",
      mechanic: "evidence-generated",
      theme: "AI-authored",
      openingScreen: { title: "Boss", purpose: "Test unseen synthesis." },
      generationPrompt: null,
      artifactBinding: null,
      artwork: { status: "placeholder", localPath: null, prompt: null },
      sfxContract: [],
      companionContract: { events: [] },
      evidenceContract: { academic: true, engagement: true, companionObservations: true },
      evidenceIds: [],
    }],
    academicPredictions: [{
      predictionId: "prediction:release-proof",
      theoryId: "theory:release-proof",
      constructId: "math.multiplication.equal_groups",
      context: "confirmed unassisted returned work",
      horizon: "within_7_days",
      expectedMetric: { key: "academic.accuracy", min: 0.7, max: 0.9 },
      predictedErrorPatterns: ["operation_selection"],
      confidence: 0.7,
      evidenceIds: ["assignment:release-proof"],
      intervention: "AI-authored equal-groups lesson",
      evidenceLimit: "calibrated_mastery",
      createdAt: "2026-08-07T12:00:00.000Z",
      lockedAt: "2026-08-07T12:00:00.000Z",
    }],
  };
}

function returnedWork(correct: boolean): ConfirmedReturnedWork {
  return {
    childId: "proof-child",
    homeworkId: "hw-release-proof-equal-groups",
    source: {
      sourceId: "source:returned-work",
      type: "graded_work",
      fileFingerprint: correct ? "returned-strong" : "returned-weak",
      sourceFile: correct ? "strong-returned-work.pdf" : "weak-returned-work.pdf",
      provenance: "caregiver",
      capturedAt: "2026-08-08T12:00:00.000Z",
      assignmentLink: { homeworkId: "hw-release-proof-equal-groups", method: "explicit_selection", confidence: 1, confirmedBy: "caregiver" },
      status: "confirmed",
    },
    score: { earned: correct ? 1 : 0, possible: 1 },
    items: [{
      itemId: "returned:item:equal-groups",
      prompt: "Four groups of three",
      childResponse: correct ? "12" : "7",
      correct,
      assistanceStatus: "unassisted",
      observedErrorType: correct ? undefined : "operation_selection",
      extractionConfidence: 1,
      constructLinks: [{ constructId: "math.multiplication.equal_groups", role: "primary", confidence: 1 }],
    }],
  };
}

function writeCycle(rootDir: string, cycle: LearningCycleRecordV2): void {
  const file = path.join(rootDir, "src/context/proof-child/homework/cycles", `${cycle.homeworkId}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(cycle, null, 2)}\n`, "utf8");
}

async function runContinuation(rootDir: string, seed: LearningCycleRecordV2, correct: boolean): Promise<ContinuationResult> {
  writeCycle(rootDir, structuredClone(seed));
  const factual = recordConfirmedReturnedWork(returnedWork(correct), { rootDir, now: new Date("2026-08-08T12:00:00.000Z") });
  const evidenceIds = factual.observations.filter((item) => item.sourceId === "source:returned-work").map((item) => item.observationId);
  const evaluationIds = factual.predictionEvaluations.filter((item) => item.sourceId === "source:returned-work").map((item) => item.evaluationId);
  const interpreted = await interpretReturnedWorkBatch({
    childId: "proof-child",
    homeworkId: seed.homeworkId,
    sourceId: "source:returned-work",
    rootDir,
    now: new Date("2026-08-08T12:01:00.000Z"),
    interpret: async () => correct ? ({
      status: "supported",
      reason: "Confirmed independent returned work supports the prediction.",
      nextAction: "Complete this learning cycle.",
      evidenceIds,
      predictionEvaluationIds: evaluationIds,
      preserve: ["equal-groups representation"],
      change: [],
      testNext: ["related multiplication assignment"],
      nextEvidenceRequired: ["next independently completed assignment"],
      assumptionAssessments: [{ assumptionId: "assumption:equal-groups-transfer", outcome: "supported", reason: "Independent work transferred.", observationIds: evidenceIds }],
      readinessAssessment: {
        status: "ready_independent",
        scope: { homeworkId: seed.homeworkId, assignmentTitle: seed.assignment.title, constructIds: ["math.multiplication.equal_groups"] },
        reason: "Confirmed independent work supports assignment readiness.",
        evidenceIds,
        predictionEvaluationIds: evaluationIds,
        uncertainty: "Conclusion is limited to equal groups.",
        nextAction: "Complete the assignment independently.",
      },
      continuationAction: "complete",
    }) : ({
      status: "revised",
      reason: "Confirmed returned work contradicts the expected independent range.",
      nextAction: "Generate targeted support for the next session.",
      evidenceIds,
      predictionEvaluationIds: evaluationIds,
      preserve: ["concrete equal groups"],
      change: ["add operation-selection support"],
      testNext: ["fresh unassisted equal-groups item"],
      nextEvidenceRequired: ["next-session independent response"],
      assumptionAssessments: [{ assumptionId: "assumption:equal-groups-transfer", outcome: "rejected", reason: "Independent work did not transfer.", observationIds: evidenceIds }],
      readinessAssessment: {
        status: "not_yet_ready",
        scope: { homeworkId: seed.homeworkId, assignmentTitle: seed.assignment.title, constructIds: ["math.multiplication.equal_groups"] },
        reason: "The independent response shows an operation-selection error.",
        evidenceIds,
        predictionEvaluationIds: evaluationIds,
        uncertainty: "One returned item is not enough to localize every error.",
        nextAction: "Run targeted support in the next session.",
      },
      continuationAction: "generate_support",
      nextInstrument: {
        nodeId: "support:equal-groups-operation-selection",
        title: "Equal Groups Support",
        academicTarget: "select multiplication for equal groups",
        mechanic: "AI-selected support interaction",
        theme: "AI-selected support world",
        openingPurpose: "Reconnect equal groups to multiplication.",
        creatorPrompt: "Create one targeted support experience from the cited evidence.",
      },
      nextPrediction: {
        claim: "Targeted support will improve operation selection on a fresh independent item.",
        constructId: "math.multiplication.equal_groups",
        context: "next targeted-support session",
        horizon: "next_session",
        expectedMetric: { key: "academic.accuracy", min: 0.7, max: 0.9 },
        predictedErrorPatterns: ["operation_selection"],
        confidence: 0.55,
        evidenceLimit: "independent_performance",
      },
    }),
  });
  const decision = interpreted.cycle.decisionHistory.at(-1)!;
  const nextNode = interpreted.cycle.nodes.find((item) => item.routeId === "adaptive-support");
  const nextPrediction = interpreted.cycle.academicPredictions.find((item) => item.predictionId === nextNode?.predictionId);
  return {
    lifecycle: interpreted.cycle.lifecycle,
    readiness: decision.readinessAssessment?.status ?? "missing",
    decisionId: decision.decisionId,
    evaluationId: evaluationIds[0] ?? "missing",
    nextNodeId: nextNode?.nodeId ?? null,
    nextPredictionId: nextPrediction?.predictionId ?? null,
    priorEvidenceIds: nextPrediction?.evidenceIds ?? decision.evidenceIds,
  };
}

async function runBaselineScenario(input: {
  rootDir: string;
  seed: LearningCycleRecordV2;
  name: string;
  correct: boolean;
  assisted: boolean;
  rating: number;
}): Promise<{ name: string; rating: number; lifecycle: string; decisionId: string; nextAction: string }> {
  writeCycle(input.rootDir, structuredClone(input.seed));
  const observed = recordCanonicalNodeCompletion({
    childId: "proof-child",
    homeworkId: input.seed.homeworkId,
    sessionId: `session:${input.name}`,
    nodeId: "baseline-equal-groups",
    result: {
      completed: true,
      accuracy: input.correct ? 1 : 0,
      timeSpent_ms: 60_000,
      targetResults: [{
        target: `fresh:${input.name}`,
        correct: input.correct,
        ...(input.assisted ? { scaffoldLevel: 1 } : {}),
      }],
    },
  }, { rootDir: input.rootDir, now: new Date("2026-08-07T13:00:00.000Z") });
  if (!observed) throw new Error(`release_proof_baseline_observation_missing:${input.name}`);
  const finalized = transitionLearningCycle("proof-child", input.seed.homeworkId, observed.revision, {
    type: "session_finalized",
    nodeId: "baseline-equal-groups",
    choiceEventId: `modal:${input.name}`,
    engagement: { funRating: input.rating, postActivityAction: "back_to_map" },
  }, { rootDir: input.rootDir, now: new Date("2026-08-07T13:01:00.000Z") });
  const eligible = input.correct && !input.assisted;
  const advanced = await advanceCanonicalCycleFromEvidence({
    childId: "proof-child",
    homeworkId: input.seed.homeworkId,
    decide: async () => eligible ? ({
      status: "supported",
      reason: "Fresh independent evidence permits a transfer test; the low rating remains separate engagement evidence.",
      progressionAction: "generate_quest",
      preserve: ["academic approach"],
      change: ["presentation hypothesis"],
      testNext: ["unseen transfer"],
      nextEvidenceRequired: ["Quest scorecard"],
    }) : ({
      status: "revised",
      reason: "High enjoyment cannot substitute for correct independent academic evidence.",
      progressionAction: "generate_support",
      preserve: ["engaging presentation"],
      change: ["academic support"],
      testNext: ["fresh unassisted response"],
      nextEvidenceRequired: ["support scorecard"],
      nextInstrument: {
        nodeId: `support:${input.name}`,
        title: "Targeted Equal Groups Support",
        academicTarget: "equal-groups operation selection",
        mechanic: "AI-selected support",
        theme: "AI-selected support world",
        openingPurpose: "Reconnect groups to multiplication.",
        creatorPrompt: "Create the evidence-prescribed support chapter.",
      },
    }),
  }, { rootDir: input.rootDir, now: new Date("2026-08-07T13:02:00.000Z") });
  const decision = advanced.decisionHistory.at(-1)!;
  if (finalized.sessionFinalizations.at(-1)?.funRating !== input.rating) {
    throw new Error(`release_proof_rating_missing:${input.name}`);
  }
  return { name: input.name, rating: input.rating, lifecycle: advanced.lifecycle, decisionId: decision.decisionId, nextAction: decision.nextAction ?? "missing" };
}

async function runProductionQuestBossPath(rootDir: string, seed: LearningCycleRecordV2, questCorrect: boolean): Promise<{
  boundaryPassed: boolean;
  awaitedCalibration: boolean;
}> {
  writeCycle(rootDir, structuredClone(seed));
  const baselineObserved = recordCanonicalNodeCompletion({
    childId: "proof-child", homeworkId: seed.homeworkId, sessionId: "production:baseline", nodeId: "baseline-equal-groups",
    result: { completed: true, accuracy: 1, timeSpent_ms: 1_000, targetResults: [{ target: "baseline-fresh", correct: true }] },
  }, { rootDir, now: new Date("2026-08-07T14:00:00.000Z") });
  if (!baselineObserved) throw new Error("release_proof_production_baseline_missing");
  const baselineFinalized = transitionLearningCycle("proof-child", seed.homeworkId, baselineObserved.revision, {
    type: "session_finalized", nodeId: "baseline-equal-groups", choiceEventId: "modal:production:baseline",
    engagement: { funRating: 3, postActivityAction: "back_to_map" },
  }, { rootDir, now: new Date("2026-08-07T14:01:00.000Z") });
  if (baselineFinalized.lifecycle !== "baseline_evaluating") throw new Error("release_proof_baseline_not_evaluating");
  const questGenerating = await advanceCanonicalCycleFromEvidence({
    childId: "proof-child", homeworkId: seed.homeworkId,
    decide: async () => ({
      status: "supported", reason: "Fresh independent baseline evidence supports an unseen transfer test.",
      progressionAction: "generate_quest", preserve: [], change: [], testNext: ["unseen transfer"], nextEvidenceRequired: ["Quest scorecard"],
    }),
  }, { rootDir, now: new Date("2026-08-07T14:02:00.000Z") });
  const questReady = transitionLearningCycle("proof-child", seed.homeworkId, questGenerating.revision, {
    type: "artifact_bound", nodeId: "quest", artifact: {
      contentId: "proof-quest", artifactId: "proof-quest", localArtifactPath: "/proof/quest.html",
      localArtworkPath: "/proof/quest.png", contractFingerprint: "proof-quest", validationStatus: "passed",
    },
  }, { rootDir, now: new Date("2026-08-07T14:03:00.000Z") });
  if (questReady.lifecycle !== "quest_ready") throw new Error("release_proof_quest_not_ready");
  const questObserved = recordCanonicalNodeCompletion({
    childId: "proof-child", homeworkId: seed.homeworkId, sessionId: "production:quest", nodeId: "quest",
    result: { completed: true, accuracy: questCorrect ? 1 : 0, timeSpent_ms: 1_000, targetResults: [{ target: "quest-unseen-transfer", correct: questCorrect }] },
  }, { rootDir, now: new Date("2026-08-07T14:04:00.000Z") });
  if (!questObserved) throw new Error("release_proof_production_quest_missing");
  transitionLearningCycle("proof-child", seed.homeworkId, questObserved.revision, {
    type: "session_finalized", nodeId: "quest", choiceEventId: "modal:production:quest",
    engagement: { funRating: 4, postActivityAction: "back_to_map" },
  }, { rootDir, now: new Date("2026-08-07T14:05:00.000Z") });
  const questCycle = getLearningCycle("proof-child", seed.homeworkId, { rootDir });
  if (!questCycle) throw new Error("release_proof_quest_cycle_missing");
  const eligibility = questBossEvidenceEligibility(questCycle);
  if (!questCorrect) {
    let rejected = false;
    try {
      await advanceCanonicalCycleFromEvidence({
        childId: "proof-child", homeworkId: seed.homeworkId,
        decide: async () => ({
          status: "supported", reason: "Attempt Boss despite wrong transfer evidence.", progressionAction: "generate_boss",
          preserve: [], change: [], testNext: ["synthesis"], nextEvidenceRequired: ["Boss scorecard"],
        }),
      }, { rootDir, now: new Date("2026-08-07T14:06:00.000Z") });
    } catch (error) {
      rejected = error instanceof Error && /canonical_progression_boss_requires_/.test(error.message);
    }
    return { boundaryPassed: !eligibility.eligible && rejected, awaitedCalibration: false };
  }
  const bossGenerating = await advanceCanonicalCycleFromEvidence({
    childId: "proof-child", homeworkId: seed.homeworkId,
    decide: async () => ({
      status: "supported", reason: "Fresh correct unassisted Quest evidence supports unseen synthesis.",
      progressionAction: "generate_boss", preserve: [], change: [], testNext: ["unseen synthesis"], nextEvidenceRequired: ["Boss scorecard"],
    }),
  }, { rootDir, now: new Date("2026-08-07T14:06:00.000Z") });
  const bossReady = transitionLearningCycle("proof-child", seed.homeworkId, bossGenerating.revision, {
    type: "artifact_bound", nodeId: "boss", artifact: {
      contentId: "proof-boss", artifactId: "proof-boss", localArtifactPath: "/proof/boss.html",
      localArtworkPath: "/proof/boss.png", contractFingerprint: "proof-boss", validationStatus: "passed",
    },
  }, { rootDir, now: new Date("2026-08-07T14:07:00.000Z") });
  const bossObserved = recordCanonicalNodeCompletion({
    childId: "proof-child", homeworkId: seed.homeworkId, sessionId: "production:boss", nodeId: "boss",
    result: { completed: true, accuracy: 1, timeSpent_ms: 1_000, targetResults: [{ target: "boss-unseen-synthesis", correct: true }] },
  }, { rootDir, now: new Date("2026-08-07T14:08:00.000Z") });
  if (!bossObserved || bossReady.lifecycle !== "boss_ready") throw new Error("release_proof_production_boss_missing");
  transitionLearningCycle("proof-child", seed.homeworkId, bossObserved.revision, {
    type: "session_finalized", nodeId: "boss", choiceEventId: "modal:production:boss",
    engagement: { funRating: 5, postActivityAction: "back_to_map" },
  }, { rootDir, now: new Date("2026-08-07T14:09:00.000Z") });
  const awaiting = await advanceCanonicalCycleFromEvidence({
    childId: "proof-child", homeworkId: seed.homeworkId,
    decide: async () => ({
      status: "awaiting_calibration", reason: "In-app synthesis is provisional until external returned work.",
      progressionAction: "await_calibration", preserve: [], change: [], testNext: [], nextEvidenceRequired: ["confirmed returned work"],
    }),
  }, { rootDir, now: new Date("2026-08-07T14:10:00.000Z") });
  return {
    boundaryPassed: eligibility.eligible && bossGenerating.lifecycle === "boss_generating",
    awaitedCalibration: awaiting.lifecycle === "awaiting_calibration"
      && awaiting.decisionHistory.at(-1)?.readinessAssessment?.status === "predicted_ready",
  };
}

function yes(value: boolean): string { return value ? "Yes" : "No"; }

function reportHtml(summary: MathFeedbackLoopReleaseSummary): string {
  const rows = summary.predictionRows.map((row) => `<tr>${[row.assignment, row.construct, row.prediction, row.actual, row.error, row.evidenceType, row.assistance, row.adjustment].map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Math feedback loop release proof</title><style>body{font:16px/1.45 system-ui;background:#f5f2ea;color:#211a3c;margin:0}main{max-width:1180px;margin:auto;padding:32px}.hero,.card{background:white;border-radius:18px;padding:24px;margin:14px 0;box-shadow:0 8px 30px #251b4512}.pass{color:#087a55}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}.metric{display:flex;justify-content:space-between;border-bottom:1px solid #eee7f2;padding:9px 0}.mono{font:12px ui-monospace;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}th,td{padding:9px;text-align:left;border-bottom:1px solid #eee7f2}summary{cursor:pointer;font-weight:700}</style></head><body><main><section class="hero"><p>SUNNY RELEASE EVIDENCE</p><h1 class="${summary.status === "PASS" ? "pass" : ""}">MATH FEEDBACK LOOP: ${summary.status}</h1>
  <div class="metric"><span>Complete session evidence reached decisions: ${yes(summary.completeSessionEvidenceReachedDecisions)}</span></div>
  <div class="metric"><span>Weak evidence was blocked from Quest/Boss: ${yes(summary.weakEvidenceBlockedFromQuestBoss)}</span></div>
  <div class="metric"><span>Same-assignment reingestion preserved progress: ${yes(summary.sameAssignmentReingestionPreservedProgress)}</span></div>
  <div class="metric"><span>Returned work controlled readiness: ${yes(summary.returnedWorkControlledReadiness)}</span></div>
  <div class="metric"><span>Multiple sessions preserved one learning history: ${yes(summary.multipleSessionsPreservedOneHistory)}</span></div>
  <div class="metric"><span>Next Planner used prior prediction error: ${yes(summary.nextPlannerUsedPriorPredictionError)}</span></div>
  <div class="metric"><span>Actual Planner API prompt included calibration: ${yes(summary.plannerApiPromptIncludedCalibration)}</span></div>
  <div class="metric"><span>Current Quest/Boss boundaries passed: ${yes(summary.currentCodeQuestBossBoundariesPassed)}</span></div>
  <div class="metric"><span>Strong Boss ended awaiting external calibration: ${yes(summary.strongBossAwaitedCalibration)}</span></div>
  <div class="metric"><span>Quest/Boss proof used production transitions: ${yes(summary.productionQuestBossTransitionProof)}</span></div>
  <div class="metric"><span>Current reingestion states preserved progress: ${yes(summary.currentCodeReingestionStatesPassed)}</span></div>
  <div class="metric"><span>Real child data changed: ${yes(summary.realChildDataChanged)}</span></div></section>
  <section class="card"><h2>Engagement never replaces learning evidence</h2><div class="grid">${summary.baselineScenarios.map((scenario) => `<article><h3>${escapeHtml(scenario.name)}</h3><p>Rating ${scenario.rating}/5 → <b>${escapeHtml(scenario.nextAction)}</b></p><p>${escapeHtml(scenario.lifecycle)} · <span class="mono">${escapeHtml(scenario.decisionId)}</span></p></article>`).join("")}</div></section>
  <section class="card"><h2>Same belief, different returned reality</h2><p>Both branches began with hash <span class="mono">${summary.startingHash}</span>.</p><div class="grid"><article><h3>Independent success</h3><p><b>${summary.strong.readiness}</b> → ${summary.strong.lifecycle}</p><p>Decision <span class="mono">${summary.strong.decisionId}</span></p><p>Evaluation <span class="mono">${summary.strong.evaluationId}</span></p></article><article><h3>Persistent misunderstanding</h3><p><b>${summary.weak.readiness}</b> → ${summary.weak.lifecycle}</p><p>Next chapter <span class="mono">${summary.weak.nextNodeId}</span></p><p>New locked prediction <span class="mono">${summary.weak.nextPredictionId}</span></p><p>Decision <span class="mono">${summary.weak.decisionId}</span></p></article></div></section>
  <section class="card"><h2>Prediction accountability</h2><table><thead><tr><th>Assignment</th><th>Construct</th><th>Prediction</th><th>Actual</th><th>Error</th><th>Evidence</th><th>Assistance</th><th>Adjustment</th></tr></thead><tbody>${rows}</tbody></table><p>${escapeHtml(summary.calibrationMessage)}</p></section>
  <section class="card"><h2>What this proves</h2><p>Confirmed returned work—not completion, rating, or companion help—controlled readiness. Strong work completed the cycle. Weak work created a separately predicted support chapter under the same homework identity. The longitudinal history supplied the resulting evaluation and decision to the next Planner context.</p></section>
  <details class="card"><summary>Audit</summary><p>Contract v${summary.audit.contractVersion} · ${escapeHtml(summary.audit.branch)} · <span class="mono">${escapeHtml(summary.audit.startingCommit)}</span></p><p>Product-code diff:</p><ul>${summary.audit.productCodeDiff.map((file) => `<li class="mono">${escapeHtml(file)}</li>`).join("")}</ul><p>Canonical files changed in isolated roots only:</p><ul>${summary.canonicalFilesChanged.map((file) => `<li class="mono">${escapeHtml(file)}</li>`).join("")}</ul><p>Prior production proof packets:</p><ul>${summary.priorProofFiles.map((file) => `<li class="mono">${escapeHtml(file)}</li>`).join("")}</ul></details></main></body></html>`;
}

export async function runMathFeedbackLoopReleaseProof(input: { repoRoot: string; outputDir: string }): Promise<MathFeedbackLoopReleaseSummary> {
  const childRoots = [path.join(input.repoRoot, "src/context/reina"), path.join(input.repoRoot, "src/context/ila")];
  const realBefore = stable(childRoots.map(treeHash));
  const seedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-loop-seed-"));
  const seed = createLearningCycle(cycleInput(), { rootDir: seedRoot, now: new Date("2026-08-07T12:00:00.000Z") });
  const startingHash = stable(seed);
  const strongRoot = path.join(input.outputDir, "scenarios/strong");
  const weakRoot = path.join(input.outputDir, "scenarios/weak");
  const baselineScenarios = await Promise.all([
    runBaselineScenario({ rootDir: path.join(input.outputDir, "scenarios/strong-low-rating"), seed, name: "Strong learning + low rating", correct: true, assisted: false, rating: 1 }),
    runBaselineScenario({ rootDir: path.join(input.outputDir, "scenarios/weak-high-rating"), seed, name: "Weak learning + high rating", correct: false, assisted: false, rating: 5 }),
    runBaselineScenario({ rootDir: path.join(input.outputDir, "scenarios/assisted-success"), seed, name: "Assisted success", correct: true, assisted: true, rating: 5 }),
  ]);
  const strong = await runContinuation(strongRoot, seed, true);
  const weak = await runContinuation(weakRoot, seed, false);
  const report = getAssignmentLearningReport("proof-child", seed.homeworkId, { rootDir: weakRoot });
  if (!report) throw new Error("release_proof_parent_report_missing");
  const history = buildLongitudinalLearningHistory("proof-child", { rootDir: weakRoot });
  const historyConstruct = history.constructs["math.multiplication.equal_groups"];
  const plannerContext = mathPlannerChartContext({
    identity: { displayName: "Proof Child", ttsName: "Proof Child" },
    demographics: { age: 9, grade: 3 },
    learningProfile: { sessionStats: {} }, engagementTheory: { evidence: [], dimensions: {} },
    factBankSummary: { totalFacts: 0, dueFacts: 0 }, decisionTrace: { latest: null },
    learningHistory: history, companionCare: { plan: { economy: { coins: 0 } } }, economy: { coinBalance: 0 },
  } as never);
  const plannerContextJson = JSON.stringify(plannerContext);
  const plannerContextEvidenceIds = [weak.evaluationId, weak.decisionId].filter((id) => plannerContextJson.includes(id));
  let plannerApiPayload = "";
  try {
    await askDirectMathPlanner({
      childId: "proof-child",
      chart: {
        identity: { displayName: "Proof Child", ttsName: "Proof Child" }, demographics: { age: 9, grade: 3 },
        learningProfile: { sessionStats: {}, rewardPreferences: [], activityModel: {}, activityTraitModel: {} },
        engagementTheory: { evidence: [], dimensions: {} }, factBankSummary: { totalFacts: 0, dueFacts: 0 },
        decisionTrace: { latest: null }, learningHistory: history,
      } as never,
      extraction: { fullText: "A fresh equal-groups assignment for the next cycle." } as never,
      client: { messages: { stream: (payload: unknown) => ({
        finalMessage: async () => {
          plannerApiPayload = JSON.stringify(payload);
          return { content: [], stop_reason: "end_turn", usage: {} };
        },
      }) } } as never,
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "direct_planner_tool_output_missing") throw error;
  }
  const weakEvaluation = historyConstruct?.evaluations.find((item) => item.evaluationId === weak.evaluationId);
  const weakDecision = historyConstruct?.decisions.find((item) => item.decisionId === weak.decisionId);
  const plannerApiPromptIncludedCalibration = plannerApiPayload.includes(weak.evaluationId)
    && plannerApiPayload.includes(weak.decisionId)
    && plannerApiPayload.includes(String(weakEvaluation?.predictionError))
    && Boolean(weakDecision?.change?.every((item) => plannerApiPayload.includes(item)));
  const nextPlannerUsedPriorPredictionError = plannerContextEvidenceIds.length === 2
    && Boolean(weakEvaluation)
    && plannerApiPromptIncludedCalibration;

  const strongBaseline = getLearningCycle("proof-child", seed.homeworkId, { rootDir: path.join(input.outputDir, "scenarios/strong-low-rating") })!;
  const weakBaseline = getLearningCycle("proof-child", seed.homeworkId, { rootDir: path.join(input.outputDir, "scenarios/weak-high-rating") })!;
  const assistedBaseline = getLearningCycle("proof-child", seed.homeworkId, { rootDir: path.join(input.outputDir, "scenarios/assisted-success") })!;
  const strongQuestBossPath = await runProductionQuestBossPath(path.join(input.outputDir, "scenarios/production-quest-boss-strong"), seed, true);
  const weakQuestBossPath = await runProductionQuestBossPath(path.join(input.outputDir, "scenarios/production-quest-boss-weak"), seed, false);
  const currentCodeQuestBossBoundariesPassed = baselineQuestEvidenceEligibility(strongBaseline).eligible
    && !baselineQuestEvidenceEligibility(weakBaseline).eligible
    && !baselineQuestEvidenceEligibility(assistedBaseline).eligible
    && strongQuestBossPath.boundaryPassed
    && weakQuestBossPath.boundaryPassed;
  const strongBossAwaitedCalibration = strongQuestBossPath.awaitedCalibration;
  const productionQuestBossTransitionProof = strongQuestBossPath.boundaryPassed
    && strongQuestBossPath.awaitedCalibration
    && weakQuestBossPath.boundaryPassed;

  const lifecycleStates = ["baseline_generating", "baseline_ready", "baseline_active", "baseline_evaluating", "quest_generating", "quest_ready", "quest_active", "quest_evaluating", "boss_generating", "boss_ready", "boss_active", "boss_evaluating", "awaiting_calibration", "complete"] as const;
  const currentCodeReingestionStatesPassed = lifecycleStates.every((lifecycle) => {
    const existing = { homeworkId: seed.homeworkId, lifecycle, assignment: { contentFingerprint: seed.assignment.contentFingerprint } };
    const before = stable(existing);
    const outcome = existingAssignmentIngestionOutcome(existing, seed.assignment.contentFingerprint);
    return outcome.shouldGenerate === false && stable(existing) === before;
  });
  const sameAssignmentReingestionPreservedProgress = currentCodeReingestionStatesPassed;
  const realAfter = stable(childRoots.map(treeHash));
  const git = (...args: string[]): string => execFileSync("git", args, { cwd: input.repoRoot, encoding: "utf8" }).trim();
  const productCodeDiff = git("status", "--short").split("\n").filter(Boolean).map((line) => line.replace(/^\s*[?MADRCU!]{1,2}\s+/, "")).filter((file) =>
    !file.startsWith("src/context/") && !file.startsWith("outputs/"));
  const summary: MathFeedbackLoopReleaseSummary = {
    status: "INCOMPLETE",
    completeSessionEvidenceReachedDecisions: baselineScenarios.every((item) => Boolean(item.decisionId)),
    weakEvidenceBlockedFromQuestBoss: currentCodeQuestBossBoundariesPassed,
    sameAssignmentReingestionPreservedProgress,
    returnedWorkControlledReadiness: strong.readiness === "ready_independent" && weak.readiness === "not_yet_ready",
    multipleSessionsPreservedOneHistory: strong.lifecycle === "complete" && weak.lifecycle === "baseline_generating" && Boolean(weak.nextNodeId && weak.nextPredictionId),
    nextPlannerUsedPriorPredictionError,
    plannerApiPromptIncludedCalibration,
    currentCodeQuestBossBoundariesPassed,
    strongBossAwaitedCalibration,
    productionQuestBossTransitionProof,
    currentCodeReingestionStatesPassed,
    plannerContextEvidenceIds,
    plannerContextHash: stable(plannerContext),
    realChildDataChanged: realBefore !== realAfter,
    identicalStartingHash: startingHash === stable(structuredClone(seed)),
    startingHash,
    strong,
    weak,
    baselineScenarios,
    predictionRows: report.predictionAccuracy,
    calibrationMessage: report.calibrationSummary.message,
    canonicalFilesChanged: [
      path.join(strongRoot, "src/context/proof-child/homework/cycles", `${seed.homeworkId}.json`),
      path.join(weakRoot, "src/context/proof-child/homework/cycles", `${seed.homeworkId}.json`),
    ],
    priorProofFiles: [],
    audit: {
      contractVersion: 11,
      branch: git("branch", "--show-current"),
      startingCommit: git("rev-parse", "HEAD"),
      productCodeDiff,
    },
  };
  const baselineSeparation = baselineScenarios[0]?.nextAction === "generate_quest" && baselineScenarios.slice(1).every((item) => item.nextAction === "generate_support");
  const pass = baselineSeparation && summary.completeSessionEvidenceReachedDecisions && summary.weakEvidenceBlockedFromQuestBoss && summary.strongBossAwaitedCalibration &&
    summary.productionQuestBossTransitionProof && summary.plannerApiPromptIncludedCalibration &&
    summary.sameAssignmentReingestionPreservedProgress && summary.returnedWorkControlledReadiness &&
    summary.multipleSessionsPreservedOneHistory && summary.nextPlannerUsedPriorPredictionError &&
    !summary.realChildDataChanged && summary.identicalStartingHash;
  summary.status = pass ? "PASS" : "FAIL";
  fs.mkdirSync(input.outputDir, { recursive: true });
  fs.writeFileSync(path.join(input.outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(input.outputDir, "report.html"), reportHtml(summary), "utf8");
  return summary;
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = process.argv.find((item) => item.startsWith("--output="))?.slice("--output=".length)
    ?? path.join(repoRoot, "outputs/math-feedback-loop-release-proof", stamp);
  const summary = await runMathFeedbackLoopReleaseProof({ repoRoot, outputDir });
  console.log(` 🎮 [math-feedback-loop] [${summary.status.toLowerCase()}] report=${path.join(outputDir, "report.html")}`);
  if (summary.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error: unknown) => {
    console.error(" 🎮 [math-feedback-loop] [failed]", error);
    process.exitCode = 1;
  });
}
