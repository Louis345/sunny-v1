import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { generateCanonicalProgressionArtifact } from "../../src/engine/canonicalProgressionGenerator";
import {
  createLearningCycle,
  getLearningCycle,
  type CreateLearningCycleInput,
  type LearningCycleNodeContract,
} from "../../src/engine/learningCycleRepository";
import {
  advanceCanonicalCycleFromEvidence,
  recordCanonicalNodeCompletion,
} from "../../src/engine/learningCycleRuntime";
import { sha256Tree } from "../../src/scripts/runMathFeedbackLoopLab";

const repoRoot = process.cwd();
const outputRoot = path.join(repoRoot, "outputs", "quest-boss-production-proof", new Date().toISOString().replace(/[:.]/g, "-"));
const strongRoot = path.join(outputRoot, "strong");
const weakRoot = path.join(outputRoot, "weak");
const childId = "reina";
const homeworkId = "hw-math-quest-boss-isolated-proof";

function node(nodeId: string, role: "baseline" | "quest" | "boss", state: "ready" | "locked"): LearningCycleNodeContract {
  const title = role === "baseline" ? "Array Harbor" : role === "quest" ? "The Skybridge Rescue" : "The Foundry Finale";
  return {
    nodeId,
    routeId: role === "baseline" ? "visual-build-route" : undefined,
    predictionId: role === "baseline" ? "prediction:equal-groups" : undefined,
    role,
    title,
    state,
    academicTarget: {
      domain: "math",
      skill: role === "baseline"
        ? "represent multiplication with equal groups and arrays"
        : role === "quest"
          ? "transfer equal-groups reasoning to unfamiliar situations"
          : "synthesize arrays, missing factors, and word-problem interpretation",
      targets: role === "baseline"
        ? ["fresh-array-3-by-4", "fresh-equal-groups-5-by-2"]
        : role === "quest"
          ? ["unseen-transfer-targets"]
          : ["unseen-synthesis-targets"],
    },
    algorithmOwner: "ai_tutor",
    theoryId: "theory:equal-groups-transfer",
    experimentId: `experiment:${nodeId}`,
    mechanic: role === "baseline" ? "visual construction" : "AI-designed evidence experience",
    theme: "AI-owned",
    openingScreen: {
      title,
      purpose: role === "baseline"
        ? "Connect equal groups to multiplication."
        : role === "quest"
          ? "Use multiplication to solve a new transfer mission."
          : "Combine multiplication representations in an unseen finale.",
    },
    generationPrompt: null,
    artifactBinding: role === "baseline" ? {
      contentId: "content:isolated-baseline",
      artifactId: "artifact:isolated-baseline",
      localArtifactPath: "/games/baseline.html",
      localArtworkPath: "/generated/adventure-board-demo/background.jpeg",
      contractFingerprint: "isolated-baseline-contract",
      validationStatus: "passed",
    } : null,
    artwork: {
      status: "ready",
      localPath: role === "boss" ? "/generated/adventure-board-demo/boss.jpeg" : "/generated/adventure-board-demo/quest.jpeg",
      prompt: null,
    },
    sfxContract: ["interaction", "recovery", "progress", "completion"],
    companionContract: { events: ["completion", "frustration", "help_requested"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true },
    evidenceIds: [],
  };
}

function cycleInput(): CreateLearningCycleInput {
  return {
    childId,
    homeworkId,
    domain: "math",
    assignment: {
      title: "Isolated multiplication Quest/Boss release proof",
      contentFingerprint: "isolated-math-quest-boss-v1",
      capturedEvidenceIds: ["lab:assignment:equal-groups"],
      targets: ["math.multiplication.equal_groups", "math.multiplication.arrays"],
      returnTag: "#sunny_lab_math_quest_boss",
    },
    academicTheory: {
      theoryId: "theory:equal-groups-transfer",
      revision: 1,
      hypothesis: "Independent equal-groups evidence may support an unseen transfer Quest.",
      supportCriteria: ["Fresh unassisted responses are correct and distinguishable."],
      reviseCriteria: ["Errors cluster around representation-to-notation transfer."],
      falsifyCriteria: ["Fresh independent evidence contradicts the hypothesis."],
    },
    engagementTheory: null,
    nodes: [node("baseline", "baseline", "ready"), node("quest", "quest", "locked"), node("boss", "boss", "locked")],
    academicPredictions: [{
      predictionId: "prediction:equal-groups",
      theoryId: "theory:equal-groups-transfer",
      constructId: "math.multiplication.equal_groups",
      context: "fresh unassisted baseline work",
      horizon: "same_session",
      expectedMetric: { key: "academic.accuracy", min: 0.75, max: 1 },
      predictedErrorPatterns: ["representation_to_notation"],
      confidence: 0.65,
      evidenceIds: ["lab:assignment:equal-groups"],
      intervention: "AI-authored equal-groups experience",
      evidenceLimit: "practice_only",
      createdAt: "2026-08-06T12:00:00.000Z",
      lockedAt: "2026-08-06T12:00:00.000Z",
    }],
  };
}

function stable(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function copyScreenshots(cycleRoot: string, cycleStage: "quest" | "boss"): string[] {
  const cycle = getLearningCycle(childId, homeworkId, { rootDir: cycleRoot });
  const node = cycle?.nodes.find((item) => item.role === cycleStage);
  const shots = node?.artifactBinding?.validationProof?.screenshotPaths ?? [];
  return shots.map((source, index) => {
    const destination = path.join(outputRoot, "screenshots", `${cycleStage}-${index + 1}${path.extname(source) || ".png"}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    return destination;
  });
}

function reportHtml(summary: Record<string, unknown>, screenshots: Record<string, string[]>): string {
  const cards = Object.entries(screenshots).flatMap(([stage, files]) => files.map((file, index) => `
    <figure><img src="file://${file}" alt="${stage} state ${index + 1}"><figcaption>${stage.toUpperCase()} · state ${index + 1}</figcaption></figure>`)).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Math Quest/Boss Release Proof</title><style>
  body{margin:0;background:#081426;color:#eef6ff;font:16px system-ui;padding:32px}main{max-width:1400px;margin:auto}h1{font-size:42px}.pass{color:#66f2a3}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}figure{margin:0;background:#14243c;padding:12px;border-radius:16px}img{width:100%;aspect-ratio:16/9;object-fit:contain;background:#050b14;border-radius:10px}figcaption{padding:10px 2px 2px;font-weight:800}pre{white-space:pre-wrap;background:#14243c;padding:18px;border-radius:14px}</style></head><body><main>
  <h1 class="${summary.status === "PASS" ? "pass" : ""}">Math Quest/Boss proof: ${summary.status}</h1>
  <pre>${JSON.stringify(summary, null, 2)}</pre><div class="grid">${cards}</div></main></body></html>`;
}

async function main(): Promise<void> {
  fs.mkdirSync(outputRoot, { recursive: true });
  const realContext = path.join(repoRoot, "src", "context", childId);
  const realBefore = sha256Tree(realContext);

  const strongInitial = createLearningCycle(cycleInput(), { rootDir: strongRoot, now: new Date("2026-08-06T12:00:00.000Z") });
  const weakInitial = createLearningCycle(cycleInput(), { rootDir: weakRoot, now: new Date("2026-08-06T12:00:00.000Z") });
  const sameStartingHash = stable(strongInitial) === stable(weakInitial);

  recordCanonicalNodeCompletion({
    childId, homeworkId, sessionId: "lab:strong-baseline", nodeId: "baseline",
    result: {
      completed: true,
      accuracy: 1,
      timeSpent_ms: 75_000,
      targetResults: [
        { target: "fresh-array-3-by-4", correct: true, attemptedValue: "12", responseTime_ms: 12_000 },
        { target: "fresh-equal-groups-5-by-2", correct: true, attemptedValue: "10", responseTime_ms: 10_000 },
      ],
    },
  }, { rootDir: strongRoot, now: new Date("2026-08-06T12:05:00.000Z") });
  const questGenerating = await advanceCanonicalCycleFromEvidence({
    childId, homeworkId,
    decide: async () => ({
      status: "supported",
      reason: "Fresh independent baseline evidence supports an unseen transfer test but not mastery.",
      progressionAction: "generate_quest",
      preserve: ["visible equal-group reasoning"],
      change: ["remove familiar baseline examples"],
      testNext: ["unseen equal-groups transfer"],
      nextEvidenceRequired: ["unassisted Quest evidence"],
    }),
  }, { rootDir: strongRoot, now: new Date("2026-08-06T12:06:00.000Z") });
  if (questGenerating.lifecycle !== "quest_generating") throw new Error(`expected_quest_generating:${questGenerating.lifecycle}`);
  const questReady = await generateCanonicalProgressionArtifact({ childId, homeworkId }, { rootDir: strongRoot, now: new Date("2026-08-06T12:07:00.000Z") });
  if (questReady.lifecycle !== "quest_ready") throw new Error(`expected_quest_ready:${questReady.lifecycle}`);

  recordCanonicalNodeCompletion({
    childId, homeworkId, sessionId: "lab:quest", nodeId: "quest",
    result: {
      completed: true,
      accuracy: 1,
      timeSpent_ms: 90_000,
      targetResults: [
        { target: "unseen-transfer-6-groups-of-4", correct: true, attemptedValue: "24", responseTime_ms: 18_000 },
        { target: "unseen-transfer-missing-factor", correct: true, attemptedValue: "5", responseTime_ms: 22_000 },
      ],
    },
  }, { rootDir: strongRoot, now: new Date("2026-08-06T12:20:00.000Z") });
  const bossGenerating = await advanceCanonicalCycleFromEvidence({
    childId, homeworkId,
    decide: async () => ({
      status: "supported",
      reason: "Unseen transfer succeeded independently; test unseen synthesis next.",
      progressionAction: "generate_boss",
      preserve: ["independent mathematical control of the world"],
      change: ["combine arrays, missing factors, and interpretation"],
      testNext: ["unseen multiplication synthesis"],
      nextEvidenceRequired: ["unassisted Boss evidence"],
    }),
  }, { rootDir: strongRoot, now: new Date("2026-08-06T12:21:00.000Z") });
  if (bossGenerating.lifecycle !== "boss_generating") throw new Error(`expected_boss_generating:${bossGenerating.lifecycle}`);
  const bossReady = await generateCanonicalProgressionArtifact({ childId, homeworkId }, { rootDir: strongRoot, now: new Date("2026-08-06T12:22:00.000Z") });
  if (bossReady.lifecycle !== "boss_ready") throw new Error(`expected_boss_ready:${bossReady.lifecycle}`);

  recordCanonicalNodeCompletion({
    childId, homeworkId, sessionId: "lab:boss", nodeId: "boss",
    result: {
      completed: true,
      accuracy: 1,
      timeSpent_ms: 105_000,
      targetResults: [{ target: "unseen-synthesis-market", correct: true, attemptedValue: "36", responseTime_ms: 25_000 }],
    },
  }, { rootDir: strongRoot, now: new Date("2026-08-06T12:35:00.000Z") });
  const awaiting = await advanceCanonicalCycleFromEvidence({
    childId, homeworkId,
    decide: async () => ({
      status: "awaiting_calibration",
      reason: "Strong in-app synthesis remains provisional until independently returned work arrives.",
      progressionAction: "await_calibration",
      preserve: ["visible math-to-world causality"],
      change: [], testNext: [], nextEvidenceRequired: ["returned graded work"],
    }),
  }, { rootDir: strongRoot, now: new Date("2026-08-06T12:36:00.000Z") });

  recordCanonicalNodeCompletion({
    childId, homeworkId, sessionId: "lab:weak-baseline", nodeId: "baseline",
    result: {
      completed: true,
      accuracy: 0,
      timeSpent_ms: 75_000,
      targetResults: [
        { target: "fresh-array-3-by-4", correct: false, attemptedValue: "7", assisted: true },
        { target: "fresh-equal-groups-5-by-2", correct: false, attemptedValue: "5", assisted: true },
      ],
    },
  }, { rootDir: weakRoot, now: new Date("2026-08-06T12:05:00.000Z") });
  const weakDecision = await advanceCanonicalCycleFromEvidence({
    childId, homeworkId,
    decide: async () => ({
      status: "falsified",
      reason: "All observed baseline work was incorrect and assisted; transfer is not eligible.",
      progressionAction: "generate_support",
      preserve: ["concrete equal-group representation"],
      change: ["add targeted representation support next session"],
      testNext: ["fresh unassisted equal-group construction"],
      nextEvidenceRequired: ["distinguishable unassisted baseline evidence"],
    }),
  }, { rootDir: weakRoot, now: new Date("2026-08-06T12:06:00.000Z") });

  const screenshots = { quest: copyScreenshots(strongRoot, "quest"), boss: copyScreenshots(strongRoot, "boss") };
  const realAfter = sha256Tree(realContext);
  const summary = {
    status: sameStartingHash && questReady.lifecycle === "quest_ready" && bossReady.lifecycle === "boss_ready" && awaiting.lifecycle === "awaiting_calibration" && weakDecision.lifecycle !== "quest_generating" && realBefore === realAfter ? "PASS" : "FAIL",
    sameStartingHash,
    strongLifecycle: awaiting.lifecycle,
    weakLifecycle: weakDecision.lifecycle,
    weakQuestLocked: weakDecision.nodes.find((item) => item.role === "quest")?.state === "locked",
    questArtifact: questReady.nodes.find((item) => item.role === "quest")?.artifactBinding,
    bossArtifact: bossReady.nodes.find((item) => item.role === "boss")?.artifactBinding,
    realReinaUnchanged: realBefore === realAfter,
    realContextHashBefore: realBefore,
    realContextHashAfter: realAfter,
    screenshots,
    note: "Planner eligibility was reused from the previously passing math feedback-loop proof; this run spends only on real Quest/Boss implementation and runtime validation.",
  };
  fs.writeFileSync(path.join(outputRoot, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outputRoot, "report.html"), reportHtml(summary, screenshots));
  console.log(`OUTPUT_ROOT=${outputRoot}`);
  console.log(`STATUS=${summary.status}`);
  if (summary.status !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
