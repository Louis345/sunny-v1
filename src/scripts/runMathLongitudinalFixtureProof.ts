import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createLearningCycle,
  getLearningCycle,
  type CreateLearningCycleInput,
  type LearningCycleRecordV2,
} from "../engine/learningCycleRepository";
import {
  buildLongitudinalLearningHistory,
  interpretReturnedWorkBatch,
  recordConfirmedReturnedWork,
  type ConfirmedReturnedWork,
} from "../engine/longitudinalLearning";
import { existingAssignmentIngestionOutcome } from "./ingestMathDirect";

export type ManifestRound = {
  round: number;
  assignmentCode: string;
  original: string;
  returned: string;
  constructs: string[];
  factualEngagementEvents: Array<Record<string, unknown>>;
  returnedFacts: {
    score: { correct: number; total: number };
    assistance: "unassisted" | "assisted" | "unknown";
    errorPattern: string;
  };
  expectedBehavior: string[];
};

export type FixtureManifest = {
  schemaVersion: number;
  seriesId: string;
  syntheticChildId: string;
  rounds: ManifestRound[];
};

export type LongitudinalRoundSummary = {
  round: number;
  assignmentCode: string;
  homeworkId: string;
  originalHash: string;
  returnedHash: string;
  sameAssignmentReingestionPreserved: boolean;
  returnedWorkLinkedToOriginal: boolean;
  plannerContextDecisionIds: string[];
  plannerContextEvaluationIds: string[];
  decisionId: string;
  evaluationIds: string[];
  assumptionOutcome: "supported" | "rejected" | "uncertain";
  readiness: "ready_independent" | "ready_with_support" | "not_yet_ready" | "insufficient_evidence";
  readinessConstructs: string[];
  lifecycle: string;
  engagementEventCount: number;
  predictionErrors: Array<{ predictionId: string; error: number | null }>;
};

export type MathLongitudinalFixtureSummary = {
  status: "PASS" | "FAIL";
  seriesId: string;
  rounds: LongitudinalRoundSummary[];
  correctionReachedNextPlanner: boolean;
  sameAssignmentIdentityPreserved: boolean;
  returnedWorkLinkagePreserved: boolean;
  scopedReadinessPreserved: boolean;
  engagementContaminatedMastery: boolean;
  realChildDataChanged: boolean;
  paidCalls: number;
  estimatedCost: number;
  outputDir: string;
};

type RunInput = {
  repoRoot: string;
  fixtureDir: string;
  outputDir: string;
};

const ITEM_CONSTRUCTS: Record<string, string[]> = {
  "LAB-MATH-A": [
    "math.multiplication.equal_groups",
    "math.multiplication.arrays",
    "math.multiplication.equal_groups",
    "math.multiplication.arrays",
    "math.multiplication.word_problem_interpretation",
    "math.multiplication.word_problem_interpretation",
  ],
  "LAB-MATH-B": [
    "math.multiplication.missing_factor",
    "math.multiplication.missing_factor",
    "math.multiplication.word_problem_interpretation",
    "math.multiplication.arrays",
    "math.multiplication.equal_sharing",
    "math.multiplication.missing_factor",
    "math.multiplication.word_problem_interpretation",
  ],
  "LAB-MATH-C": [
    "math.multiplication.equal_groups",
    "math.multiplication.word_problem_interpretation",
    "math.multiplication.missing_factor",
    "math.multiplication.arrays",
    "math.multiplication.word_problem_interpretation",
    "math.multiplication.word_problem_interpretation",
    "math.multiplication.equal_groups",
    "math.multiplication.factor_pairs",
  ],
};

const ROUND_TITLES: Record<string, string> = {
  "LAB-MATH-A": "Lantern Market Arrays",
  "LAB-MATH-B": "Garden Row Mysteries",
  "LAB-MATH-C": "Festival Team Challenge",
};

function hashBytes(value: Buffer | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashFile(file: string): string {
  return hashBytes(fs.readFileSync(file));
}

function hashTree(root: string): string {
  if (!fs.existsSync(root)) return hashBytes("missing");
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

function stable(value: unknown): string {
  return hashBytes(JSON.stringify(value));
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function loadManifest(fixtureDir: string): FixtureManifest {
  const manifest = JSON.parse(fs.readFileSync(path.join(fixtureDir, "scenario-manifest.json"), "utf8")) as FixtureManifest;
  if (manifest.schemaVersion !== 1 || manifest.rounds.length !== 3) {
    throw new Error("math_longitudinal_fixture_manifest_invalid");
  }
  const identities = new Set<string>();
  for (const round of manifest.rounds) {
    if (identities.has(round.assignmentCode)) throw new Error(`math_longitudinal_fixture_duplicate:${round.assignmentCode}`);
    identities.add(round.assignmentCode);
    for (const file of [round.original, round.returned]) {
      if (!fs.existsSync(path.join(fixtureDir, file))) throw new Error(`math_longitudinal_fixture_missing:${file}`);
    }
  }
  return manifest;
}

export function priorHistoryIds(childId: string, rootDir: string): { decisions: string[]; evaluations: string[] } {
  const history = buildLongitudinalLearningHistory(childId, { rootDir });
  return {
    decisions: [...new Set(Object.values(history.constructs).flatMap((construct) => construct.decisions.map((item) => item.decisionId)))],
    evaluations: [...new Set(Object.values(history.constructs).flatMap((construct) => construct.evaluations.map((item) => item.evaluationId)))],
  };
}

export function cycleInput(round: ManifestRound, childId: string, homeworkId: string, originalHash: string, priorIds: string[]): CreateLearningCycleInput {
  const title = ROUND_TITLES[round.assignmentCode] ?? round.assignmentCode;
  const at = `2026-08-0${round.round}T12:00:00.000Z`;
  const assumptionId = `${homeworkId}:assumption:transfer`;
  return {
    childId,
    homeworkId,
    domain: "math",
    assignment: {
      title,
      contentFingerprint: originalHash,
      capturedEvidenceIds: [`assignment:${round.assignmentCode}`, ...priorIds],
      targets: [...round.constructs],
      returnTag: `#sunny_${round.assignmentCode.toLowerCase().replaceAll("-", "_")}`,
    },
    academicTheory: {
      theoryId: `${homeworkId}:theory`,
      revision: 1,
      hypothesis: `The learner will transfer the targeted ${round.assignmentCode} constructs to independent returned work.`,
      supportCriteria: ["Confirmed unassisted returned work supports the expected range."],
      reviseCriteria: ["Returned work exposes a scoped error or uncertainty."],
      falsifyCriteria: ["Repeated independent errors contradict the expected transfer."],
    },
    engagementTheory: null,
    assumptions: [{
      assumptionId,
      claim: `Independent transfer will be adequate for the scoped ${round.assignmentCode} constructs.`,
      evidenceIds: [`assignment:${round.assignmentCode}`, ...priorIds],
      confidence: round.round === 1 ? 0.55 : 0.65,
      uncertainty: round.round === 1 ? "No prior returned work exists in this series." : "Prior evidence may not generalize to this assignment.",
      createdAt: at,
      lockedAt: at,
    }],
    nodes: [{
      nodeId: `${homeworkId}:baseline`,
      role: "baseline",
      title,
      state: "ready",
      academicTarget: { domain: "math", skill: title, targets: [...round.constructs] },
      algorithmOwner: "ai_tutor",
      theoryId: `${homeworkId}:theory`,
      experimentId: `${homeworkId}:experiment`,
      mechanic: "AI-owned",
      theme: "AI-owned",
      openingScreen: { title, purpose: "Collect target-aligned evidence." },
      generationPrompt: null,
      artifactBinding: null,
      artwork: { status: "placeholder", localPath: null, prompt: null },
      sfxContract: [],
      companionContract: { events: [] },
      evidenceContract: { academic: true, engagement: true, companionObservations: true },
      evidenceIds: [],
    }],
    academicPredictions: [...new Set(round.constructs)].map((constructId) => ({
      predictionId: `${homeworkId}:prediction:${constructId.split(".").at(-1)}`,
      theoryId: `${homeworkId}:theory`,
      constructId,
      context: "confirmed unassisted returned work",
      horizon: "within_7_days",
      expectedMetric: { key: "academic.accuracy", min: 0.7, max: 1 },
      predictedErrorPatterns: [round.returnedFacts.errorPattern],
      confidence: 0.6,
      evidenceIds: [`assignment:${round.assignmentCode}`, ...priorIds],
      intervention: `${title} learning program`,
      evidenceLimit: "calibrated_mastery",
      createdAt: at,
      lockedAt: at,
    })),
  };
}

export function returnedWork(round: ManifestRound, childId: string, homeworkId: string, returnedHash: string): ConfirmedReturnedWork {
  const constructs = ITEM_CONSTRUCTS[round.assignmentCode];
  if (!constructs || constructs.length !== round.returnedFacts.score.total) {
    throw new Error(`math_longitudinal_item_contract_missing:${round.assignmentCode}`);
  }
  const wrongCount = round.returnedFacts.score.total - round.returnedFacts.score.correct;
  const wrongIndexes = new Set<number>();
  for (let index = constructs.length - wrongCount; index < constructs.length; index += 1) wrongIndexes.add(index);
  if (round.assignmentCode === "LAB-MATH-A") {
    wrongIndexes.clear();
    wrongIndexes.add(4);
  }
  if (round.assignmentCode === "LAB-MATH-B") {
    wrongIndexes.clear();
    wrongIndexes.add(0);
    wrongIndexes.add(1);
    wrongIndexes.add(4);
  }
  return {
    childId,
    homeworkId,
    source: {
      sourceId: `returned-work:${returnedHash.slice(0, 20)}`,
      type: "graded_work",
      fileFingerprint: returnedHash,
      sourceFile: round.returned,
      provenance: "caregiver",
      capturedAt: `2026-08-0${round.round}T15:00:00.000Z`,
      assignmentLink: { homeworkId, method: "explicit_selection", confidence: 1, confirmedBy: "caregiver" },
      status: "confirmed",
    },
    score: { earned: round.returnedFacts.score.correct, possible: round.returnedFacts.score.total },
    items: constructs.map((constructId, index) => ({
      itemId: `${round.assignmentCode}:item:${index + 1}`,
      prompt: `${round.assignmentCode} returned item ${index + 1}`,
      childResponse: wrongIndexes.has(index) ? "incorrect synthetic response" : "correct synthetic response",
      correct: !wrongIndexes.has(index),
      assistanceStatus: round.returnedFacts.assistance,
      ...(wrongIndexes.has(index) ? { observedErrorType: round.returnedFacts.errorPattern } : {}),
      extractionConfidence: 1,
      constructLinks: [{ constructId, role: "primary", confidence: 1 }],
    })),
  };
}

function decisionForRound(round: ManifestRound, cycle: LearningCycleRecordV2, sourceId: string) {
  const observations = cycle.observations.filter((item) => item.sourceId === sourceId);
  const evaluations = cycle.predictionEvaluations.filter((item) => item.sourceId === sourceId);
  const evidenceIds = observations.map((item) => item.observationId);
  const predictionEvaluationIds = evaluations.map((item) => item.evaluationId);
  const assumptionId = cycle.assumptions[0]!.assumptionId;
  if (round.round === 3) {
    const readinessConstructs = round.constructs.filter((construct) => construct !== "math.multiplication.factor_pairs");
    return {
      status: "supported" as const,
      reason: "Confirmed unassisted transfer supports readiness for the corrected core constructs; factor-pair generalization remains scoped out.",
      nextAction: "Complete this cycle while preserving the factor-pair uncertainty.",
      evidenceIds,
      predictionEvaluationIds,
      preserve: ["missing-factor support", "word-problem interpretation support"],
      change: [],
      testNext: ["multiple factor pairs on a later assignment"],
      nextEvidenceRequired: ["independent factor-pair evidence"],
      assumptionAssessments: [{ assumptionId, outcome: "supported" as const, reason: "The corrected core skills transferred independently.", observationIds: evidenceIds }],
      readinessAssessment: {
        status: "ready_independent" as const,
        scope: { homeworkId: cycle.homeworkId, assignmentTitle: cycle.assignment.title, constructIds: readinessConstructs },
        reason: "Confirmed unassisted returned work supports the listed core constructs.",
        evidenceIds,
        predictionEvaluationIds,
        uncertainty: "The incorrect factor-pair item prevents a broader claim.",
        nextAction: "Proceed independently on the scoped constructs.",
      },
      continuationAction: "complete" as const,
    };
  }
  const rejected = round.round === 2;
  return {
    status: "revised" as const,
    reason: rejected
      ? "Repeated missing-factor and equal-sharing errors contradict the expected transfer."
      : "Arrays transferred, while operation selection remains uncertain.",
    nextAction: "Generate targeted support for the next session.",
    evidenceIds,
    predictionEvaluationIds,
    preserve: rejected ? ["direct multiplication facts", "array construction"] : ["arrays", "equal-groups construction"],
    change: rejected ? ["explicit missing-factor and equal-sharing support"] : ["operation-selection support"],
    testNext: rejected ? ["fresh missing-factor and equal-sharing items"] : ["fresh multiplication story"],
    nextEvidenceRequired: ["next unassisted returned response"],
    assumptionAssessments: [{
      assumptionId,
      outcome: rejected ? "rejected" as const : "uncertain" as const,
      reason: rejected ? "Independent returned work contradicted transfer." : "Evidence was mixed across representations.",
      observationIds: evidenceIds,
    }],
    readinessAssessment: {
      status: rejected ? "not_yet_ready" as const : "ready_with_support" as const,
      scope: { homeworkId: cycle.homeworkId, assignmentTitle: cycle.assignment.title, constructIds: [...round.constructs] },
      reason: rejected ? "Repeated independent errors require targeted support." : "Most work was correct, but one scoped interpretation error remains.",
      evidenceIds,
      predictionEvaluationIds,
      uncertainty: rejected ? "The error spans missing factors and equal sharing." : "One word-problem error limits certainty.",
      nextAction: "Complete targeted support before an independent readiness claim.",
    },
    continuationAction: "generate_support" as const,
    nextInstrument: {
      nodeId: `${cycle.homeworkId}:support`,
      title: `${cycle.assignment.title} Support`,
      academicTarget: rejected ? "missing factors and equal sharing" : "word-problem operation selection",
      mechanic: "AI-selected support interaction",
      theme: "AI-selected support world",
      openingPurpose: "Address the cited returned-work contradiction.",
      creatorPrompt: "Create one targeted support chapter from the cited factual evidence.",
    },
    nextPrediction: {
      claim: "Targeted support will improve the cited error on a fresh unassisted item.",
      constructId: rejected ? "math.multiplication.missing_factor" : "math.multiplication.word_problem_interpretation",
      context: "next targeted support session",
      horizon: "next_session",
      expectedMetric: { key: "academic.accuracy", min: 0.7, max: 1 },
      predictedErrorPatterns: [round.returnedFacts.errorPattern],
      confidence: 0.55,
      evidenceLimit: "independent_performance" as const,
    },
  };
}

function reportHtml(summary: MathLongitudinalFixtureSummary): string {
  const verdictClass = summary.status === "PASS" ? "pass" : "fail";
  const rows = summary.rounds.map((round) => `
    <tr>
      <td><strong>${escapeHtml(round.assignmentCode)}</strong><br><small>${escapeHtml(round.homeworkId)}</small></td>
      <td>${round.sameAssignmentReingestionPreserved ? "Yes" : "No"}</td>
      <td>${round.returnedWorkLinkedToOriginal ? "Yes" : "No"}</td>
      <td>${escapeHtml(round.assumptionOutcome)}</td>
      <td>${escapeHtml(round.readiness)}</td>
      <td>${round.plannerContextDecisionIds.length}</td>
    </tr>`).join("");
  const timelines = summary.rounds.map((round) => `
    <article class="card">
      <div class="round">ROUND ${round.round}</div>
      <h3>${escapeHtml(round.assignmentCode)}</h3>
      <p><strong>Prior decisions available:</strong> ${round.plannerContextDecisionIds.length ? round.plannerContextDecisionIds.map(escapeHtml).join(", ") : "none (first assignment)"}</p>
      <p><strong>Returned evidence:</strong> ${round.evaluationIds.length} prediction evaluation(s)</p>
      <p><strong>Assessment:</strong> ${escapeHtml(round.assumptionOutcome)} → ${escapeHtml(round.readiness)}</p>
      <p><strong>After reingestion:</strong> ${round.sameAssignmentReingestionPreserved ? "same cycle preserved" : "cycle changed unexpectedly"}</p>
    </article>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sunny longitudinal math proof</title><style>
    :root{font-family:Inter,ui-sans-serif,system-ui;background:#eef4fb;color:#17233b}body{margin:0}.hero{padding:42px;background:#17233b;color:white}.eyebrow{letter-spacing:.15em;color:#63d5c6;font-weight:800}.verdict{display:inline-block;margin-top:18px;padding:10px 18px;border-radius:999px;font-weight:900}.pass{background:#bff4d5;color:#0b6237}.fail{background:#ffd0d0;color:#8b1c1c}.wrap{max-width:1120px;margin:auto;padding:28px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card,table{background:white;border:1px solid #d8e2ef;border-radius:16px;box-shadow:0 8px 24px #20304a12}.card{padding:20px}.round{font-size:12px;font-weight:900;color:#2d7d78;letter-spacing:.12em}table{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;margin-top:24px}th,td{text-align:left;padding:14px;border-bottom:1px solid #e6edf5}th{background:#f6f9fd}small{color:#64748b}.checks{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:24px 0}.check{background:white;padding:14px;border-radius:12px;border:1px solid #d8e2ef}@media(max-width:850px){.grid,.checks{grid-template-columns:1fr}}
  </style></head><body><section class="hero"><div class="eyebrow">SUNNY RELEASE CONFIDENCE</div><h1>Three-assignment longitudinal proof</h1><div class="verdict ${verdictClass}">${summary.status}</div><p>Belief → contradiction → correction → transfer confirmation</p></section><main class="wrap">
    <section class="checks">
      <div class="check"><strong>Same-assignment reingestion preserved:</strong> ${summary.sameAssignmentIdentityPreserved ? "Yes" : "No"}</div>
      <div class="check"><strong>Returned work linked correctly:</strong> ${summary.returnedWorkLinkagePreserved ? "Yes" : "No"}</div>
      <div class="check"><strong>Correction reached next Planner:</strong> ${summary.correctionReachedNextPlanner ? "Yes" : "No"}</div>
      <div class="check"><strong>Readiness remained scoped:</strong> ${summary.scopedReadinessPreserved ? "Yes" : "No"}</div>
      <div class="check"><strong>Engagement contaminated mastery:</strong> ${summary.engagementContaminatedMastery ? "Yes" : "No"}</div>
      <div class="check"><strong>Real child data changed:</strong> ${summary.realChildDataChanged ? "Yes" : "No"}</div>
    </section>
    <section class="grid">${timelines}</section>
    <table><thead><tr><th>Assignment</th><th>Reingestion</th><th>Return linked</th><th>Assumption</th><th>Readiness</th><th>Prior decisions</th></tr></thead><tbody>${rows}</tbody></table>
    <p><strong>Cost:</strong> ${summary.paidCalls} paid calls / $${summary.estimatedCost.toFixed(2)}. This proof exercises canonical mechanics with synthetic facts; the bounded live-Planner run is the next layer.</p>
  </main></body></html>`;
}

export async function runMathLongitudinalFixtureProof(input: RunInput): Promise<MathLongitudinalFixtureSummary> {
  const manifest = loadManifest(input.fixtureDir);
  const childId = manifest.syntheticChildId;
  const rootDir = path.join(input.outputDir, "isolated-context");
  const realRoots = [path.join(input.repoRoot, "src/context/reina"), path.join(input.repoRoot, "src/context/ila")];
  const realBefore = stable(realRoots.map(hashTree));
  fs.mkdirSync(input.outputDir, { recursive: true });
  const rounds: LongitudinalRoundSummary[] = [];

  for (const round of manifest.rounds.sort((a, b) => a.round - b.round)) {
    const originalFile = path.join(input.fixtureDir, round.original);
    const returnedFile = path.join(input.fixtureDir, round.returned);
    const originalHash = hashFile(originalFile);
    const returnedHash = hashFile(returnedFile);
    const homeworkId = `hw-${originalHash.slice(0, 16)}`;
    const prior = priorHistoryIds(childId, rootDir);
    const seed = createLearningCycle(cycleInput(round, childId, homeworkId, originalHash, [...prior.decisions, ...prior.evaluations]), {
      rootDir,
      now: new Date(`2026-08-0${round.round}T12:00:00.000Z`),
    });
    const returned = returnedWork(round, childId, homeworkId, returnedHash);
    const factual = recordConfirmedReturnedWork(returned, { rootDir, now: new Date(`2026-08-0${round.round}T15:00:00.000Z`) });
    const linked = factual.evidenceSources.some((source) => source.sourceId === returned.source.sourceId
      && source.assignmentLink.homeworkId === homeworkId
      && source.assignmentLink.method === "explicit_selection");
    const interpreted = await interpretReturnedWorkBatch({
      childId,
      homeworkId,
      sourceId: returned.source.sourceId,
      rootDir,
      now: new Date(`2026-08-0${round.round}T15:01:00.000Z`),
      interpret: async (cycle, sourceId) => decisionForRound(round, cycle, sourceId),
    });
    const cycleBeforeReingestion = getLearningCycle(childId, homeworkId, { rootDir });
    if (!cycleBeforeReingestion) throw new Error(`math_longitudinal_cycle_missing:${homeworkId}`);
    const beforeHash = stable(cycleBeforeReingestion);
    const outcome = existingAssignmentIngestionOutcome(cycleBeforeReingestion, originalHash);
    const cycleAfterReingestion = getLearningCycle(childId, homeworkId, { rootDir });
    const afterHash = stable(cycleAfterReingestion);
    const decision = interpreted.cycle.decisionHistory.at(-1);
    const assessment = decision?.assumptionAssessments?.[0];
    const readiness = decision?.readinessAssessment;
    const evaluationIds = interpreted.cycle.predictionEvaluations
      .filter((item) => item.sourceId === returned.source.sourceId)
      .map((item) => item.evaluationId);
    rounds.push({
      round: round.round,
      assignmentCode: round.assignmentCode,
      homeworkId,
      originalHash,
      returnedHash,
      sameAssignmentReingestionPreserved: outcome.shouldGenerate === false && beforeHash === afterHash,
      returnedWorkLinkedToOriginal: linked,
      plannerContextDecisionIds: prior.decisions,
      plannerContextEvaluationIds: prior.evaluations,
      decisionId: decision?.decisionId ?? "missing",
      evaluationIds,
      assumptionOutcome: assessment?.outcome ?? "uncertain",
      readiness: readiness?.status === "predicted_ready" || !readiness ? "insufficient_evidence" : readiness.status,
      readinessConstructs: readiness?.scope.constructIds ?? [],
      lifecycle: interpreted.cycle.lifecycle,
      engagementEventCount: round.factualEngagementEvents.length,
      predictionErrors: interpreted.cycle.predictionEvaluations
        .filter((item) => item.sourceId === returned.source.sourceId)
        .map((item) => ({ predictionId: item.predictionId, error: item.predictionError })),
    });
  }

  const realAfter = stable(realRoots.map(hashTree));
  const correctionReachedNextPlanner = Boolean(
    rounds[0] && rounds[1] && rounds[2]
    && rounds[1].plannerContextDecisionIds.includes(rounds[0].decisionId)
    && rounds[2].plannerContextDecisionIds.includes(rounds[1].decisionId),
  );
  const engagementIds = new Set(manifest.rounds.flatMap((round) => round.factualEngagementEvents.map((_, index) => `engagement:${round.assignmentCode}:${index + 1}`)));
  const cycles = rounds.map((round) => getLearningCycle(childId, round.homeworkId, { rootDir })).filter(Boolean) as LearningCycleRecordV2[];
  const engagementContaminatedMastery = cycles.some((cycle) =>
    cycle.observations.some((observation) => engagementIds.has(observation.observationId))
    || cycle.decisionHistory.some((decision) => decision.readinessAssessment?.evidenceIds.some((id) => engagementIds.has(id))),
  );
  const sameAssignmentIdentityPreserved = rounds.every((round) => round.sameAssignmentReingestionPreserved);
  const returnedWorkLinkagePreserved = rounds.every((round) => round.returnedWorkLinkedToOriginal);
  const scopedReadinessPreserved = rounds[2]?.readiness === "ready_independent"
    && !rounds[2].readinessConstructs.includes("math.multiplication.factor_pairs")
    && rounds[1]?.readiness === "not_yet_ready";
  const realChildDataChanged = realBefore !== realAfter;
  const pass = rounds.length === 3
    && new Set(rounds.map((round) => round.homeworkId)).size === 3
    && sameAssignmentIdentityPreserved
    && returnedWorkLinkagePreserved
    && correctionReachedNextPlanner
    && rounds[1]?.assumptionOutcome === "rejected"
    && scopedReadinessPreserved
    && !engagementContaminatedMastery
    && !realChildDataChanged;
  const summary: MathLongitudinalFixtureSummary = {
    status: pass ? "PASS" : "FAIL",
    seriesId: manifest.seriesId,
    rounds,
    correctionReachedNextPlanner,
    sameAssignmentIdentityPreserved,
    returnedWorkLinkagePreserved,
    scopedReadinessPreserved,
    engagementContaminatedMastery,
    realChildDataChanged,
    paidCalls: 0,
    estimatedCost: 0,
    outputDir: input.outputDir,
  };
  fs.writeFileSync(path.join(input.outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(input.outputDir, "report.html"), reportHtml(summary), "utf8");
  return summary;
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const fixtureDir = path.join(repoRoot, "output/pdf/math-release-confidence");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = process.argv.find((item) => item.startsWith("--output="))?.slice("--output=".length)
    ?? path.join(repoRoot, "outputs/math-release-confidence", stamp);
  const summary = await runMathLongitudinalFixtureProof({ repoRoot, fixtureDir, outputDir });
  console.log(` 🎮 [math-longitudinal-proof] [${summary.status.toLowerCase()}] report=${path.join(outputDir, "report.html")}`);
  if (summary.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error: unknown) => {
    console.error(" 🎮 [math-longitudinal-proof] [failed]", error);
    process.exitCode = 1;
  });
}
