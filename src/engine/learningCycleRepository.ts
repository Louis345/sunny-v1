import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import type {
  ActiveSessionPlan,
  EngagementTheory,
  LearningTheoryDecisionStatus,
} from "../context/schemas/learningProfile";
import type { AdventureBoardJson } from "../shared/adventureBoardJson";
import {
  buildAdventureBoardFromActiveSessionPlan,
  type ActiveSessionPlanBoardSnapshot,
} from "../shared/adventureBoardFromPlan";
import { resolveChildContextDir } from "../utils/contextRoot";

export type LearningCycleLifecycle =
  | "planning"
  | "baseline_ready"
  | "baseline_active"
  | "baseline_evaluating"
  | "baseline_generating"
  | "quest_generating"
  | "quest_ready"
  | "quest_active"
  | "quest_evaluating"
  | "boss_generating"
  | "boss_ready"
  | "boss_evaluating"
  | "awaiting_calibration"
  | "complete"
  | "blocked";

export type LearningCycleNodeRole = "baseline" | "mystery" | "quest" | "boss";
export type LearningCycleNodeState = "locked" | "generating" | "ready" | "active" | "completed" | "blocked";

export type LearningCycleEvidenceSummary = {
  evidenceId: string;
  summary: string;
  accuracy?: number;
};

export type LearningCyclePrompt = {
  promptId: string;
  createdFromEvidenceIds: string[];
  text: string;
};

export type LearningCycleArtifactBinding = {
  contentId: string;
  artifactId: string;
  localArtifactPath: string;
  localArtworkPath: string;
  activityConfigPath?: string;
  contractFingerprint: string;
  validationStatus: "passed" | "failed";
  creativeProvenance?: {
    rationale: string;
    qualityPrediction: string;
    creatorPromptHash: string;
    artworkPromptHash: string;
    plannerModel?: string;
    architectModel?: string;
    builderProvider?: "anthropic" | "openai";
    builderModel?: string;
    academicContractHash?: string;
    designArtifactHash?: string;
    generatedHtmlHash?: string;
    externalLibraryUrls?: string[];
    generationElapsedMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    postBuildReview?: {
      verdict: "approve" | "revise" | "pivot";
      designQuality: number;
      originality: number;
      craft: number;
      functionality: number;
      genericPatternEvidence: string[];
      strongestMoment: string;
      weakestMoment: string;
      promiseViolations: string[];
      critique: string;
      iteration: number;
      screenshotPaths: string[];
    };
  };
  validationProof?: {
    engine: "playwright";
    passed: boolean;
    worldStateChanged: boolean;
    screenshotPaths: string[];
  };
};

export type LearningCycleNodeContract = {
  nodeId: string;
  routeId?: string;
  predictionId?: string;
  role: LearningCycleNodeRole;
  title: string;
  state: LearningCycleNodeState;
  academicTarget: {
    domain: string;
    skill: string;
    targets: string[];
  };
  algorithmOwner: string;
  theoryId: string;
  experimentId: string;
  mechanic: string;
  theme: string;
  /**
   * The design decisions the Planner made for this node, kept so a later cycle
   * can ask "which design produced replay?" rather than only "which node id did
   * she finish?". This is the independent variable of the feedback loop.
   */
  design?: {
    stakes?: string;
    failureMode?: string;
    escalation?: string;
    mechanicSpec?: string;
    mathematicalHook?: string;
  };
  openingScreen: {
    title: string;
    purpose: string;
  };
  generationPrompt: LearningCyclePrompt | null;
  prediction?: {
    claim: string;
    createdAt: string;
    evidenceLimit: "practice_only" | "independent_performance" | "provisional_transfer" | "calibrated_mastery";
  };
  artifactBinding: LearningCycleArtifactBinding | null;
  artwork: {
    status: "pending" | "placeholder" | "ready" | "failed";
    localPath: string | null;
    prompt: string | null;
  };
  sfxContract: string[];
  companionContract: { events: string[] };
  evidenceContract: {
    academic: boolean;
    engagement: boolean;
    companionObservations: boolean;
  };
  evidenceIds: string[];
};

export type LearningCycleAcademicTheory = {
  theoryId: string;
  revision: number;
  hypothesis: string;
  supportCriteria: string[];
  reviseCriteria: string[];
  falsifyCriteria: string[];
};

export type LearningCycleCalibration = {
  calibrationId: string;
  gradedAt: string;
  score: number | null;
  status: Extract<LearningTheoryDecisionStatus, "supported" | "falsified" | "inconclusive">;
  gradedItems: Array<{
    target: string;
    correct: boolean;
    observedErrorType?: string;
    note?: string;
  }>;
  sourceFile: string;
  reason: string;
  nextAction: string;
};

export type LearningEvidenceSourceType =
  | "assignment"
  | "graded_work"
  | "delayed_reassessment"
  | "teacher_note"
  | "school_report"
  | "caregiver_observation";

export type LearningEvidenceSourceRef = {
  sourceId: string;
  type: LearningEvidenceSourceType;
  fileFingerprint: string;
  sourceFile: string;
  provenance: "real_child" | "caregiver" | "teacher" | "school" | "system";
  capturedAt: string;
  assignmentLink: {
    homeworkId: string;
    method: "explicit_selection" | "return_tag" | "fingerprint" | "content_match";
    confidence: number;
    confirmedBy?: "caregiver" | "teacher" | "system";
  };
  status: "pending_confirmation" | "confirmed";
};

export type LearningConstructLink = {
  constructId: string;
  role: "primary" | "secondary";
  confidence: number;
};

export type LearningObservation = {
  observationId: string;
  sourceId: string;
  itemId: string;
  prompt?: string;
  childResponse?: string;
  constructLinks: LearningConstructLink[];
  result: { correct?: boolean; score?: number; observedErrorType?: string; teacherNote?: string };
  assistance: { status: "unassisted" | "assisted" | "unknown"; scaffolds: string[] };
  exposure: "unseen" | "previously_taught" | "previously_practiced" | "unknown";
  provenance: "graded_work" | "delayed_reassessment" | "independent_probe" | "practice" | "teacher_note";
  observedAt: string;
  confounds: string[];
};

export type AcademicPrediction = {
  predictionId: string;
  theoryId: string;
  constructId: string;
  context: string;
  horizon: string;
  expectedMetric: { key: string; min: number; max: number };
  predictedErrorPatterns: string[];
  confidence: number;
  evidenceIds: string[];
  intervention: string;
  evidenceLimit: "practice_only" | "independent_performance" | "provisional_transfer" | "calibrated_mastery";
  createdAt: string;
  lockedAt?: string;
};

export type PredictionEvaluation = {
  evaluationId: string;
  predictionId: string;
  sourceId: string;
  observationIds: string[];
  predictedMetric: { min: number; max: number };
  observedMetric: number | null;
  predictionError: number | null;
  observedErrorPatterns: string[];
  sufficiency: "sufficient" | "insufficient";
  evaluatedAt: string;
};

export type LearningAssumption = {
  assumptionId: string;
  claim: string;
  evidenceIds: string[];
  confidence: number;
  uncertainty: string;
  createdAt: string;
  lockedAt: string;
};

export type AssumptionAssessment = {
  assumptionId: string;
  outcome: "supported" | "rejected" | "uncertain";
  reason: string;
  observationIds: string[];
};

export type LearningCycleDecision = {
  decisionId: string;
  eventType: LearningCycleEvent["type"];
  status?: LearningTheoryDecisionStatus;
  reason: string;
  nextAction?: string;
  evidenceIds: string[];
  fromLifecycle: LearningCycleLifecycle;
  toLifecycle: LearningCycleLifecycle;
  createdAt: string;
  preserve?: string[];
  change?: string[];
  testNext?: string[];
  nextEvidenceRequired?: string[];
  predictionEvaluationIds?: string[];
  assumptionAssessments?: AssumptionAssessment[];
};

export type LearningCycleAgencyExperiment = {
  experimentId: string;
  sharedNodeIds: string[];
  routes: Array<{ routeId: string; nodeIds: string[] }>;
};

export type LearningCycleRouteSelection = {
  experimentId: string;
  selectedRouteId: string;
  selectedAt: string;
  choiceEventId: string;
  history: Array<{
    routeId: string;
    selectedAt: string;
    choiceEventId: string;
    switchedFromRouteId?: string;
  }>;
};

export type LearningCycleRecordV2 = {
  schemaVersion: 2;
  revision: number;
  childId: string;
  homeworkId: string;
  domain: string;
  assignment: {
    title: string;
    contentFingerprint: string;
    capturedEvidenceIds: string[];
    targets: string[];
    returnTag?: string;
    rawText?: string;
    sourceFilename?: string;
  };
  lifecycle: LearningCycleLifecycle;
  academicTheory: LearningCycleAcademicTheory;
  engagementTheory: EngagementTheory | null;
  nodes: LearningCycleNodeContract[];
  evidence: {
    academic: LearningCycleEvidenceSummary[];
    engagement: LearningCycleEvidenceSummary[];
    companionObservations: LearningCycleEvidenceSummary[];
  };
  decisionHistory: LearningCycleDecision[];
  calibrations?: LearningCycleCalibration[];
  evidenceSources: LearningEvidenceSourceRef[];
  academicPredictions: AcademicPrediction[];
  assumptions: LearningAssumption[];
  observations: LearningObservation[];
  predictionEvaluations: PredictionEvaluation[];
  agencyExperiment?: LearningCycleAgencyExperiment;
  routeSelection?: LearningCycleRouteSelection;
  createdAt: string;
  updatedAt: string;
};

export type CreateLearningCycleInput = Omit<
  LearningCycleRecordV2,
  | "schemaVersion"
  | "revision"
  | "lifecycle"
  | "evidence"
  | "decisionHistory"
  | "evidenceSources"
  | "academicPredictions"
  | "assumptions"
  | "observations"
  | "predictionEvaluations"
  | "createdAt"
  | "updatedAt"
> & { academicPredictions?: AcademicPrediction[]; assumptions?: LearningAssumption[] };

type OutcomeDecision = {
  status: LearningTheoryDecisionStatus;
  reason: string;
  nextAction: string;
};

type OutcomeEvidence = {
  nodeId: string;
  academicEvidence: LearningCycleEvidenceSummary[];
  engagementEvidence: LearningCycleEvidenceSummary[];
  companionObservations: LearningCycleEvidenceSummary[];
};

export type LearningProgressionAction =
  | "generate_support"
  | "generate_quest"
  | "generate_boss"
  | "collect_more_evidence"
  | "await_calibration";

export type NextInstrumentPrescription = {
  nodeId: string;
  title: string;
  academicTarget: string;
  mechanic: string;
  theme: string;
  openingPurpose: string;
  creatorPrompt: string;
  /**
   * The Planner's design decisions, recorded verbatim so outcomes can later be
   * attributed to them. Without these the loop can only correlate engagement
   * with node names, which is how it came to believe it had learned something
   * about the child when it had only learned about its own labels.
   */
  stakesDesign?: string;
  failureMode?: string;
  escalation?: string;
  mechanicSpec?: string;
  mathematicalHook?: string;
};

export type LearningCycleEvent =
  | {
      type: "plan_reconciled";
      assignment: LearningCycleRecordV2["assignment"];
      academicTheory: LearningCycleAcademicTheory;
      engagementTheory: EngagementTheory | null;
      nodes: LearningCycleNodeContract[];
      academicPredictions?: AcademicPrediction[];
      assumptions?: LearningAssumption[];
      agencyExperiment?: LearningCycleAgencyExperiment;
      reason: string;
    }
  | {
      type: "route_selected";
      experimentId: string;
      routeId: string;
      choiceEventId: string;
    }
  | ({ type: "baseline_completed"; decision: OutcomeDecision } & OutcomeEvidence)
  | ({ type: "quest_completed"; decision: OutcomeDecision & { bossRequired: boolean } } & OutcomeEvidence)
  | ({ type: "boss_completed"; decision: OutcomeDecision } & OutcomeEvidence)
  | ({ type: "instrument_observed"; observations: LearningObservation[] } & OutcomeEvidence)
  | { type: "artifact_bound"; nodeId: string; artifact: LearningCycleArtifactBinding }
  | { type: "artifact_rejected"; nodeId: string; reason: string }
  | { type: "engagement_theory_updated"; theory: EngagementTheory; reason: string }
  | { type: "graded_work_received"; calibration: LearningCycleCalibration }
  | {
      type: "returned_work_confirmed";
      source: LearningEvidenceSourceRef;
      calibration: LearningCycleCalibration;
      observations: LearningObservation[];
      evaluations: PredictionEvaluation[];
    }
  | {
      type: "theory_decided";
      decision: {
        status: LearningTheoryDecisionStatus;
        reason: string;
        nextAction: string;
        evidenceIds: string[];
        predictionEvaluationIds: string[];
        preserve: string[];
        change: string[];
        testNext: string[];
        nextEvidenceRequired: string[];
        assumptionAssessments?: AssumptionAssessment[];
        revisedHypothesis?: string;
        progressionAction?: LearningProgressionAction;
        nextInstrument?: NextInstrumentPrescription;
      };
    }
  | { type: "block"; reason: string };

export type LearningCycleRepositoryOptions = {
  rootDir?: string;
  now?: Date;
};

export type LearningCycleProjection = {
  activeSessionPlan: ActiveSessionPlan;
  adventureBoard: AdventureBoardJson;
  carePlan: {
    version: 2;
    childId: string;
    sourceCycleRevision: number;
    academicTheory: LearningCycleAcademicTheory;
    engagementTheory: EngagementTheory | null;
    decisionHistory: LearningCycleDecision[];
    updatedAt: string;
  };
  engagementTheory: EngagementTheory | null;
};

export type ProjectLearningCycleOptions = {
  /** Static AI-authored visual layout. Canonical cycle state and bindings always win. */
  presentationPlan?: ActiveSessionPlan | null;
};

const BOARD_THEME: AdventureBoardJson["theme"] = {
  background: { type: "image", value: "/generated/adventure-board-demo/silent-letter-world.jpeg" },
  palette: {
    path: "#ffffff",
    completed: "#1f8f68",
    available: "#7c3aed",
    locked: "#aeb7c2",
    current: "#f59e0b",
    preview: "#d5dde5",
    text: "#ffffff",
    panel: "rgba(15, 23, 42, 0.84)",
  },
};

function nowIso(opts: LearningCycleRepositoryOptions): string {
  return (opts.now ?? new Date()).toISOString();
}

function cyclePath(childId: string, homeworkId: string, opts: LearningCycleRepositoryOptions): string {
  return path.join(
    resolveChildContextDir(childId.trim().toLowerCase(), { rootDir: opts.rootDir }),
    "homework",
    "cycles",
    `${homeworkId}.json`,
  );
}

function uniqueEvidence(items: LearningCycleEvidenceSummary[]): LearningCycleEvidenceSummary[] {
  const byId = new Map<string, LearningCycleEvidenceSummary>();
  for (const item of items) byId.set(item.evidenceId, item);
  return [...byId.values()];
}

function assertLocalPath(value: string, label: string): void {
  if (/^https?:\/\//i.test(value)) throw new Error(`learning_cycle_${label}_must_be_local`);
  if (!value.trim()) throw new Error(`learning_cycle_${label}_missing`);
}

function assertCycle(value: LearningCycleRecordV2): void {
  if (value.schemaVersion !== 2) throw new Error("learning_cycle_schema_version_invalid");
  if (!Number.isInteger(value.revision) || value.revision < 1) throw new Error("learning_cycle_revision_invalid");
  if (!value.childId || !value.homeworkId || !value.assignment.contentFingerprint) {
    throw new Error("learning_cycle_identity_invalid");
  }
  if (!Array.isArray(value.evidenceSources) || !Array.isArray(value.academicPredictions) ||
      !Array.isArray(value.assumptions) ||
      !Array.isArray(value.observations) || !Array.isArray(value.predictionEvaluations)) {
    throw new Error("learning_cycle_longitudinal_evidence_invalid");
  }
  for (const prediction of value.academicPredictions) {
    if (!prediction.predictionId || !prediction.constructId || prediction.confidence < 0 || prediction.confidence > 1) {
      throw new Error("learning_cycle_academic_prediction_invalid");
    }
  }
  const ids = value.nodes.map((node) => node.nodeId);
  if (new Set(ids).size !== ids.length) throw new Error("learning_cycle_duplicate_node_id");
  const titles = value.nodes.filter((node) => node.role !== "quest" && node.role !== "boss").map((node) => node.title);
  if (new Set(titles).size !== titles.length) throw new Error("learning_cycle_duplicate_child_title");
  const quest = value.nodes.find((node) => node.role === "quest");
  const boss = value.nodes.find((node) => node.role === "boss");
  if (boss && boss.state !== "locked") {
    const questEvidenceExists = quest?.state === "completed" && quest.evidenceIds.length > 0;
    if (!questEvidenceExists) throw new Error("learning_cycle_boss_progress_requires_quest_evidence");
  }
  for (const node of value.nodes) {
    // `role` is the machine-readable identity, and the board keys off that.
    // The title is the child's, and the Planner authors it — a payoff node the
    // AI is forbidden from naming can only ever be called "Quest".
    if (!node.title.trim()) throw new Error(`learning_cycle_node_title_missing:${node.nodeId}`);
    if (node.openingScreen.title !== node.title) throw new Error(`learning_cycle_opening_title_mismatch:${node.nodeId}`);
    if (node.artifactBinding) {
      assertLocalPath(node.artifactBinding.localArtifactPath, "artifact_path");
      assertLocalPath(node.artifactBinding.localArtworkPath, "artwork_path");
    }
    if (node.artwork.localPath) assertLocalPath(node.artwork.localPath, "artwork_path");
  }
}

function hydrateLongitudinalFields(value: LearningCycleRecordV2): LearningCycleRecordV2 {
  const baselineNodes = value.nodes.filter((node) => node.role === "baseline" && node.routeId);
  const sharedNodeIds = baselineNodes
    .filter((node) => node.routeId === "route-shared-entry")
    .map((node) => node.nodeId);
  const routeGroups = new Map<string, string[]>();
  for (const node of baselineNodes) {
    if (!node.routeId || node.routeId === "route-shared-entry") continue;
    routeGroups.set(node.routeId, [...(routeGroups.get(node.routeId) ?? []), node.nodeId]);
  }
  const inferredAgencyExperiment = sharedNodeIds.length > 0 && routeGroups.size >= 2
    ? {
        experimentId: `${value.homeworkId}:agency:legacy-route-projection`,
        sharedNodeIds,
        routes: [...routeGroups].map(([routeId, nodeIds]) => ({ routeId, nodeIds })),
      }
    : undefined;
  return {
    ...value,
    evidenceSources: value.evidenceSources ?? [],
    academicPredictions: value.academicPredictions ?? [],
    assumptions: value.assumptions ?? [],
    observations: value.observations ?? [],
    predictionEvaluations: value.predictionEvaluations ?? [],
    agencyExperiment: value.agencyExperiment ?? inferredAgencyExperiment,
  };
}

function agencyNodeIds(experiment: LearningCycleAgencyExperiment): Set<string> {
  return new Set([
    ...experiment.sharedNodeIds,
    ...experiment.routes.flatMap((route) => route.nodeIds),
  ]);
}

function normalizeAgencyNodeStates(cycle: LearningCycleRecordV2): void {
  const experiment = cycle.agencyExperiment;
  if (!experiment) return;
  const knownIds = agencyNodeIds(experiment);
  const firstIncompleteShared = experiment.sharedNodeIds.find((nodeId) =>
    cycle.nodes.find((node) => node.nodeId === nodeId)?.state !== "completed");
  const selectedRoute = experiment.routes.find((route) => route.routeId === cycle.routeSelection?.selectedRouteId);
  const firstIncompleteSelected = selectedRoute?.nodeIds.find((nodeId) =>
    cycle.nodes.find((node) => node.nodeId === nodeId)?.state !== "completed");

  for (const node of cycle.nodes) {
    if (!knownIds.has(node.nodeId) || node.state === "completed") continue;
    if (firstIncompleteShared) {
      node.state = node.nodeId === firstIncompleteShared ? "ready" : "locked";
      continue;
    }
    node.state = node.nodeId === firstIncompleteSelected ? "ready" : "locked";
  }
}

function atomicWrite(file: string, cycle: LearningCycleRecordV2): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(cycle, null, 2)}\n`, "utf8");
  fs.renameSync(temp, file);
}

function appendDecisionTrace(cycle: LearningCycleRecordV2, decision: LearningCycleDecision, opts: LearningCycleRepositoryOptions): void {
  const dir = path.join(
    resolveChildContextDir(cycle.childId, { rootDir: opts.rootDir }),
    "decision_traces",
  );
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${decision.createdAt.slice(0, 10)}.ndjson`);
  fs.appendFileSync(file, `${JSON.stringify({
    traceId: decision.decisionId,
    eventType: "theory_decision",
    evidenceRead: decision.evidenceIds,
    theoryUsed: cycle.academicTheory.theoryId,
    changeSummary: `${decision.fromLifecycle} -> ${decision.toLifecycle}`,
    reason: decision.reason,
    writesTo: [cyclePath(cycle.childId, cycle.homeworkId, opts)],
    createdAt: decision.createdAt,
  })}\n`, "utf8");
}

export function createLearningCycle(
  input: CreateLearningCycleInput,
  opts: LearningCycleRepositoryOptions = {},
): LearningCycleRecordV2 {
  const file = cyclePath(input.childId, input.homeworkId, opts);
  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file, "utf8")) as { schemaVersion?: unknown };
    if (existing.schemaVersion === 2) throw new Error(`learning_cycle_already_exists:${input.homeworkId}`);
    const backup = `${file}.v1.backup`;
    if (fs.existsSync(backup)) throw new Error(`learning_cycle_legacy_backup_already_exists:${input.homeworkId}`);
    fs.renameSync(file, backup);
  }
  const at = nowIso(opts);
  const cycle: LearningCycleRecordV2 = {
    schemaVersion: 2,
    revision: 1,
    ...input,
    lifecycle: "baseline_ready",
    evidence: { academic: [], engagement: [], companionObservations: [] },
    decisionHistory: [],
    evidenceSources: [],
    academicPredictions: structuredClone(input.academicPredictions ?? []),
    assumptions: structuredClone(input.assumptions ?? []),
    observations: [],
    predictionEvaluations: [],
    createdAt: at,
    updatedAt: at,
  };
  normalizeAgencyNodeStates(cycle);
  assertCycle(cycle);
  atomicWrite(file, cycle);
  return cycle;
}

export function getLearningCycle(
  childId: string,
  homeworkId: string,
  opts: LearningCycleRepositoryOptions = {},
): LearningCycleRecordV2 | null {
  const file = cyclePath(childId, homeworkId, opts);
  if (!fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { schemaVersion?: unknown };
  if (parsed.schemaVersion !== 2) return null;
  const cycle = hydrateLongitudinalFields(parsed as LearningCycleRecordV2);
  assertCycle(cycle);
  return cycle;
}

export function resetLearningCycleRuntimeEvidence(
  childId: string,
  homeworkId: string,
  opts: LearningCycleRepositoryOptions = {},
): { cycle: LearningCycleRecordV2; auditPath: string; previousHash: string; previousRevision: number } {
  const file = cyclePath(childId, homeworkId, opts);
  if (!fs.existsSync(file)) throw new Error(`learning_cycle_missing:${homeworkId}`);
  const raw = fs.readFileSync(file, "utf8");
  const previousHash = createHash("sha256").update(raw).digest("hex");
  const previous = getLearningCycle(childId, homeworkId, opts);
  if (!previous) throw new Error(`learning_cycle_missing:${homeworkId}`);
  const auditDir = path.join(path.dirname(file), "audit");
  const auditPath = path.join(
    auditDir,
    `${homeworkId}.runtime-r${previous.revision}.${previousHash.slice(0, 12)}.json`,
  );
  fs.mkdirSync(auditDir, { recursive: true });
  if (!fs.existsSync(auditPath)) fs.writeFileSync(auditPath, raw, { encoding: "utf8", flag: "wx" });

  const reset = structuredClone(previous);
  reset.revision = 1;
  reset.lifecycle = "baseline_ready";
  reset.evidence = { academic: [], engagement: [], companionObservations: [] };
  reset.decisionHistory = [];
  reset.observations = [];
  reset.predictionEvaluations = [];
  reset.routeSelection = undefined;
  for (const node of reset.nodes) {
    node.evidenceIds = [];
    node.state = "locked";
  }
  normalizeAgencyNodeStates(reset);
  if (!reset.agencyExperiment) {
    const firstBaseline = reset.nodes.find((node) => node.role === "baseline");
    if (firstBaseline) firstBaseline.state = "ready";
  }
  reset.updatedAt = nowIso(opts);
  assertCycle(reset);
  atomicWrite(file, reset);
  console.log(
    ` 🎮 [learning-cycle] [runtime-reset] [saved] child=${reset.childId} homework=${reset.homeworkId} priorRevision=${previous.revision} audit=${auditPath}`,
  );
  return { cycle: reset, auditPath, previousHash, previousRevision: previous.revision };
}

export function getLatestLearningCycle(
  childId: string,
  opts: LearningCycleRepositoryOptions = {},
): LearningCycleRecordV2 | null {
  const dir = path.dirname(cyclePath(childId, "placeholder", opts));
  if (!fs.existsSync(dir)) return null;
  const cycles = fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => getLearningCycle(childId, file.replace(/\.json$/, ""), opts))
    .filter((cycle): cycle is LearningCycleRecordV2 => Boolean(cycle))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return cycles[0] ?? null;
}

export function repairInvalidLearningCycleForReingestion(
  input: CreateLearningCycleInput,
  opts: LearningCycleRepositoryOptions = {},
): LearningCycleRecordV2 {
  const file = cyclePath(input.childId, input.homeworkId, opts);
  if (!fs.existsSync(file)) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  const raw = hydrateLongitudinalFields(JSON.parse(fs.readFileSync(file, "utf8")) as LearningCycleRecordV2);
  if (raw.schemaVersion !== 2 || raw.childId !== input.childId || raw.homeworkId !== input.homeworkId) {
    throw new Error("learning_cycle_reingestion_repair_identity_invalid");
  }
  try {
    assertCycle(raw);
    return raw;
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "learning_cycle_boss_progress_requires_quest_evidence") {
      throw error;
    }
  }

  const at = nowIso(opts);
  const previousById = new Map(raw.nodes.map((node) => [node.nodeId, node]));
  const repaired: LearningCycleRecordV2 = {
    ...raw,
    revision: raw.revision + 1,
    assignment: structuredClone(input.assignment),
    academicTheory: structuredClone(input.academicTheory),
    engagementTheory: structuredClone(input.engagementTheory),
    lifecycle: "baseline_ready",
    nodes: input.nodes.map((node) => ({
      ...structuredClone(node),
      evidenceIds: [...new Set([...node.evidenceIds, ...(previousById.get(node.nodeId)?.evidenceIds ?? [])])],
    })),
    updatedAt: at,
    decisionHistory: [...raw.decisionHistory, {
      decisionId: `${raw.homeworkId}:decision:r${raw.revision + 1}`,
      eventType: "plan_reconciled",
      reason: "Re-ingestion repaired an impossible historical Quest/Boss progression and restored evidence-gated locks.",
      evidenceIds: [
        ...raw.evidence.academic.map((item) => item.evidenceId),
        ...raw.evidence.engagement.map((item) => item.evidenceId),
      ],
      fromLifecycle: raw.lifecycle,
      toLifecycle: "baseline_ready",
      createdAt: at,
    }],
  };
  assertCycle(repaired);
  atomicWrite(file, repaired);
  appendDecisionTrace(repaired, repaired.decisionHistory.at(-1)!, opts);
  return repaired;
}

export function repairHistoricalLearningCycleBeforePlanning(
  childId: string,
  homeworkId: string,
  opts: LearningCycleRepositoryOptions = {},
): LearningCycleRecordV2 | null {
  const file = cyclePath(childId, homeworkId, opts);
  if (!fs.existsSync(file)) return null;
  const raw = hydrateLongitudinalFields(JSON.parse(fs.readFileSync(file, "utf8")) as LearningCycleRecordV2);
  try {
    assertCycle(raw);
    return raw;
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "learning_cycle_boss_progress_requires_quest_evidence") {
      throw error;
    }
  }
  const at = nowIso(opts);
  const repaired = structuredClone(raw);
  repaired.revision += 1;
  repaired.lifecycle = "baseline_ready";
  repaired.updatedAt = at;
  for (const node of repaired.nodes) {
    if (node.role !== "quest" && node.role !== "boss") continue;
    node.state = "locked";
    node.artifactBinding = null;
    node.generationPrompt = null;
  }
  const decision: LearningCycleDecision = {
    decisionId: `${repaired.homeworkId}:decision:r${repaired.revision}`,
    eventType: "plan_reconciled",
    reason: "Pre-planning migration restored evidence-gated Quest/Boss locks from an impossible historical state.",
    evidenceIds: [],
    fromLifecycle: raw.lifecycle,
    toLifecycle: "baseline_ready",
    createdAt: at,
  };
  repaired.decisionHistory.push(decision);
  assertCycle(repaired);
  atomicWrite(file, repaired);
  appendDecisionTrace(repaired, decision, opts);
  return repaired;
}

export function repairLatestHistoricalLearningCycleBeforePlanning(
  childId: string,
  opts: LearningCycleRepositoryOptions = {},
): LearningCycleRecordV2 | null {
  const dir = path.dirname(cyclePath(childId, "placeholder", opts));
  if (!fs.existsSync(dir)) return null;
  const candidates = fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const homeworkId = name.replace(/\.json$/, "");
      const file = path.join(dir, name);
      try {
        const cycle = JSON.parse(fs.readFileSync(file, "utf8")) as LearningCycleRecordV2;
        return { homeworkId, updatedAt: cycle.updatedAt ?? "" };
      } catch {
        return null;
      }
    })
    .filter((item): item is { homeworkId: string; updatedAt: string } => item !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const latest = candidates[0];
  return latest ? repairHistoricalLearningCycleBeforePlanning(childId, latest.homeworkId, opts) : null;
}

function nodeOrThrow(cycle: LearningCycleRecordV2, nodeId: string, role?: LearningCycleNodeRole): LearningCycleNodeContract {
  const node = cycle.nodes.find((candidate) => candidate.nodeId === nodeId);
  if (!node) throw new Error(`learning_cycle_node_missing:${nodeId}`);
  if (role && node.role !== role) throw new Error(`learning_cycle_node_role_mismatch:${nodeId}:${role}`);
  return node;
}

function appendOutcomeEvidence(cycle: LearningCycleRecordV2, event: OutcomeEvidence): string[] {
  cycle.evidence.academic = uniqueEvidence([...cycle.evidence.academic, ...event.academicEvidence]);
  cycle.evidence.engagement = uniqueEvidence([...cycle.evidence.engagement, ...event.engagementEvidence]);
  cycle.evidence.companionObservations = uniqueEvidence([
    ...cycle.evidence.companionObservations,
    ...event.companionObservations,
  ]);
  return [...event.academicEvidence, ...event.engagementEvidence].map((item) => item.evidenceId);
}

function appendObservations(cycle: LearningCycleRecordV2, observations: LearningObservation[]): void {
  const known = new Set(cycle.observations.map((observation) => observation.observationId));
  cycle.observations.push(...observations
    .filter((observation) => !known.has(observation.observationId))
    .map((observation) => structuredClone(observation)));
}

function baselineFrontierComplete(cycle: LearningCycleRecordV2, completed: LearningCycleNodeContract): boolean {
  if (cycle.agencyExperiment) {
    const selectedRoute = cycle.agencyExperiment.routes.find(
      (route) => route.routeId === cycle.routeSelection?.selectedRouteId,
    );
    if (!selectedRoute) return false;
    const requiredIds = [...cycle.agencyExperiment.sharedNodeIds, ...selectedRoute.nodeIds];
    return requiredIds.length > 0 && requiredIds.every((nodeId) =>
      cycle.nodes.find((node) => node.nodeId === nodeId)?.state === "completed");
  }
  const baselines = cycle.nodes.filter((node) => node.role === "baseline");
  const sameLegacyExperiment = baselines.filter((node) => node.experimentId === completed.experimentId);
  const frontier = completed.routeId
    ? baselines.filter((node) => node.routeId === completed.routeId)
    : sameLegacyExperiment.length > 1
      ? sameLegacyExperiment
      : baselines;
  return frontier.length > 0 && frontier.every((node) => node.state === "completed");
}

function prescriptionDesign(
  prescription: NextInstrumentPrescription,
): LearningCycleNodeContract["design"] {
  const design = {
    ...(prescription.stakesDesign ? { stakes: prescription.stakesDesign } : {}),
    ...(prescription.failureMode ? { failureMode: prescription.failureMode } : {}),
    ...(prescription.escalation ? { escalation: prescription.escalation } : {}),
    ...(prescription.mechanicSpec ? { mechanicSpec: prescription.mechanicSpec } : {}),
    ...(prescription.mathematicalHook ? { mathematicalHook: prescription.mathematicalHook } : {}),
  };
  return Object.keys(design).length > 0 ? design : undefined;
}

/**
 * The constraint footer appended after the Planner's own creator prompt. It
 * carries academic truth and evidence limits only — the things Sunny owns.
 * Evidence ids and standards citations used to dominate this text and consumed
 * Creator budget without helping anyone build anything.
 */
function generationPrompt(
  cycle: LearningCycleRecordV2,
  role: "quest" | "boss",
  evidenceIds: string[],
  reason: string,
  at: string,
): LearningCyclePrompt {
  const exposedItemIds = [...new Set(cycle.observations.map((observation) => observation.itemId).filter(Boolean))];
  return {
    promptId: `${cycle.homeworkId}:${role}:prompt:r${cycle.revision + 1}`,
    createdFromEvidenceIds: evidenceIds,
    text: [
      `Assignment: ${cycle.assignment.title}.`,
      `Academic construct to preserve: ${cycle.academicTheory.hypothesis}`,
      role === "quest"
        ? "This node must test unseen transfer: change the context while preserving the construct."
        : "This node must test unseen synthesis: combine the construct in a context not practised before.",
      exposedItemIds.length > 0
        ? `Author fresh items. These have already been seen and must not be reused verbatim: ${exposedItemIds.join(", ")}.`
        : "Author fresh items.",
      `Planner decision behind this node: ${reason}`,
      `Created at: ${at}.`,
    ].join(" "),
  };
}

export function transitionLearningCycle(
  childId: string,
  homeworkId: string,
  expectedVersion: number,
  event: LearningCycleEvent,
  opts: LearningCycleRepositoryOptions = {},
): LearningCycleRecordV2 {
  const current = getLearningCycle(childId, homeworkId, opts);
  if (!current) throw new Error(`learning_cycle_missing:${homeworkId}`);
  if (current.revision !== expectedVersion) {
    throw new Error(`learning_cycle_revision_conflict:expected=${expectedVersion}:actual=${current.revision}`);
  }
  const next = structuredClone(current);
  const at = nowIso(opts);
  const fromLifecycle = current.lifecycle;
  let reason = "";
  let nextAction: string | undefined;
  let status: LearningTheoryDecisionStatus | undefined;
  let evidenceIds: string[] = [];

  if (event.type === "plan_reconciled") {
    const previousById = new Map(next.nodes.map((node) => [node.nodeId, node]));
    if (event.academicPredictions) {
      const priorById = new Map(next.academicPredictions.map((prediction) => [prediction.predictionId, prediction]));
      next.academicPredictions = event.academicPredictions.map((prediction) =>
        structuredClone(priorById.get(prediction.predictionId) ?? prediction));
    }
    if (event.assumptions) {
      const priorById = new Map(next.assumptions.map((assumption) => [assumption.assumptionId, assumption]));
      next.assumptions = event.assumptions.map((assumption) =>
        structuredClone(priorById.get(assumption.assumptionId) ?? assumption));
    }
    next.assignment = structuredClone(event.assignment);
    next.academicTheory = structuredClone(event.academicTheory);
    next.engagementTheory = structuredClone(event.engagementTheory);
    next.agencyExperiment = event.agencyExperiment
      ? structuredClone(event.agencyExperiment)
      : next.agencyExperiment;
    next.nodes = event.nodes.map((planned) => {
      const previous = previousById.get(planned.nodeId);
      if (!previous) return structuredClone(planned);
      return {
        ...structuredClone(planned),
        evidenceIds: [...new Set([...planned.evidenceIds, ...previous.evidenceIds])],
      };
    });
    next.lifecycle = "baseline_ready";
    normalizeAgencyNodeStates(next);
    reason = event.reason;
  } else if (event.type === "route_selected") {
    const experiment = next.agencyExperiment;
    if (!experiment || experiment.experimentId !== event.experimentId) {
      throw new Error(`learning_cycle_agency_experiment_missing:${event.experimentId}`);
    }
    const route = experiment.routes.find((candidate) => candidate.routeId === event.routeId);
    if (!route) throw new Error(`learning_cycle_agency_route_missing:${event.routeId}`);
    const sharedComplete = experiment.sharedNodeIds.every((nodeId) =>
      next.nodes.find((node) => node.nodeId === nodeId)?.state === "completed");
    if (!sharedComplete) throw new Error("learning_cycle_route_choice_not_ready");
    const previousRouteId = next.routeSelection?.selectedRouteId;
    const previousRouteCompleted = previousRouteId
      ? experiment.routes.find((candidate) => candidate.routeId === previousRouteId)?.nodeIds.every((nodeId) =>
          next.nodes.find((node) => node.nodeId === nodeId)?.state === "completed") === true
      : false;
    if (previousRouteCompleted) throw new Error("learning_cycle_route_choice_finalized");
    const historyEntry = {
      routeId: route.routeId,
      selectedAt: at,
      choiceEventId: event.choiceEventId,
      ...(previousRouteId && previousRouteId !== route.routeId
        ? { switchedFromRouteId: previousRouteId }
        : {}),
    };
    next.routeSelection = {
      experimentId: experiment.experimentId,
      selectedRouteId: route.routeId,
      selectedAt: at,
      choiceEventId: event.choiceEventId,
      history: [...(next.routeSelection?.history ?? []), historyEntry],
    };
    normalizeAgencyNodeStates(next);
    next.lifecycle = "baseline_active";
    reason = previousRouteId && previousRouteId !== route.routeId
      ? `Child switched the active agency route from ${previousRouteId} to ${route.routeId}.`
      : `Child selected agency route ${route.routeId}.`;
    evidenceIds = [event.choiceEventId];
  } else if (event.type === "instrument_observed") {
    const node = nodeOrThrow(next, event.nodeId);
    if (node.role === "quest" || node.role === "boss") {
      if (!node.artifactBinding || node.artifactBinding.validationStatus !== "passed") {
        throw new Error(`learning_cycle_${node.role}_artifact_not_ready`);
      }
    }
    evidenceIds = appendOutcomeEvidence(next, event);
    appendObservations(next, event.observations);
    node.state = "completed";
    node.evidenceIds = uniqueEvidence([
      ...node.evidenceIds.map((evidenceId) => ({ evidenceId, summary: evidenceId })),
      ...event.academicEvidence,
      ...event.engagementEvidence,
      ...event.companionObservations,
    ]).map((item) => item.evidenceId);
    if (node.role === "baseline") {
      const frontierComplete = baselineFrontierComplete(next, node);
      if (frontierComplete) {
        for (const candidate of next.nodes) {
          if (
            candidate.role === "baseline" &&
            (
              node.routeId
                ? candidate.routeId !== node.routeId
                : candidate.experimentId !== node.experimentId
            ) &&
            candidate.state !== "completed"
          ) {
            candidate.state = "locked";
          }
        }
      }
      normalizeAgencyNodeStates(next);
      next.lifecycle = frontierComplete ? "baseline_evaluating" : "baseline_active";
    } else if (node.role === "quest") {
      next.lifecycle = "quest_evaluating";
    } else if (node.role === "boss") {
      next.lifecycle = "boss_evaluating";
    }
    reason = `${node.title} factual scorecard recorded; one Planner decision is required.`;
    nextAction = "Evaluate the preregistered prediction against this evidence.";
  } else if (event.type === "baseline_completed") {
    const node = nodeOrThrow(next, event.nodeId, "baseline");
    evidenceIds = appendOutcomeEvidence(next, event);
    node.state = "completed";
    node.evidenceIds = uniqueEvidence([
      ...node.evidenceIds.map((evidenceId) => ({ evidenceId, summary: evidenceId })),
      ...event.academicEvidence,
      ...event.engagementEvidence,
      ...event.companionObservations,
    ]).map((item) => item.evidenceId);
    const remainingBaseline = next.nodes.some((candidate) => candidate.role === "baseline" && candidate.state !== "completed");
    if (remainingBaseline) {
      next.lifecycle = "baseline_active";
    } else {
      const quest = next.nodes.find((candidate) => candidate.role === "quest");
      if (!quest) throw new Error("learning_cycle_quest_node_missing");
      const promptEvidenceIds = [
        ...next.evidence.academic.map((item) => item.evidenceId),
        ...next.evidence.engagement.map((item) => item.evidenceId),
      ];
      quest.state = "generating";
      quest.generationPrompt = generationPrompt(next, "quest", promptEvidenceIds, event.decision.reason, at);
      next.lifecycle = "quest_generating";
    }
    ({ reason, nextAction, status } = event.decision);
  } else if (event.type === "quest_completed") {
    const node = nodeOrThrow(next, event.nodeId, "quest");
    if (!node.artifactBinding || node.artifactBinding.validationStatus !== "passed") {
      throw new Error("learning_cycle_quest_artifact_not_ready");
    }
    evidenceIds = appendOutcomeEvidence(next, event);
    node.state = "completed";
    node.evidenceIds = uniqueEvidence([
      ...node.evidenceIds.map((evidenceId) => ({ evidenceId, summary: evidenceId })),
      ...event.academicEvidence,
      ...event.engagementEvidence,
      ...event.companionObservations,
    ]).map((item) => item.evidenceId);
    if (event.decision.bossRequired) {
      const boss = next.nodes.find((candidate) => candidate.role === "boss");
      if (!boss) throw new Error("learning_cycle_boss_node_missing");
      boss.academicTarget.targets = [...node.academicTarget.targets];
      boss.state = "generating";
      boss.generationPrompt = generationPrompt(next, "boss", evidenceIds, event.decision.reason, at);
      next.lifecycle = "boss_generating";
    } else {
      next.lifecycle = "awaiting_calibration";
    }
    ({ reason, nextAction, status } = event.decision);
  } else if (event.type === "boss_completed") {
    const node = nodeOrThrow(next, event.nodeId, "boss");
    if (!node.artifactBinding || node.artifactBinding.validationStatus !== "passed") {
      throw new Error("learning_cycle_boss_artifact_not_ready");
    }
    evidenceIds = appendOutcomeEvidence(next, event);
    node.state = "completed";
    node.evidenceIds = uniqueEvidence([
      ...node.evidenceIds.map((evidenceId) => ({ evidenceId, summary: evidenceId })),
      ...event.academicEvidence,
      ...event.engagementEvidence,
      ...event.companionObservations,
    ]).map((item) => item.evidenceId);
    next.lifecycle = "awaiting_calibration";
    ({ reason, nextAction, status } = event.decision);
  } else if (event.type === "artifact_bound") {
    const node = nodeOrThrow(next, event.nodeId);
    if (event.artifact.validationStatus !== "passed") throw new Error("learning_cycle_artifact_validation_failed");
    assertLocalPath(event.artifact.localArtifactPath, "artifact_path");
    assertLocalPath(event.artifact.localArtworkPath, "artwork_path");
    node.artifactBinding = event.artifact;
    node.artwork = { ...node.artwork, status: "ready", localPath: event.artifact.localArtworkPath };
    node.state = "ready";
    if (node.role === "quest") next.lifecycle = "quest_ready";
    else if (node.role === "boss") next.lifecycle = "boss_ready";
    else next.lifecycle = "baseline_ready";
    reason = `Validated ${node.role} artifact bound to canonical node contract.`;
    evidenceIds = node.generationPrompt?.createdFromEvidenceIds ?? [];
  } else if (event.type === "returned_work_confirmed") {
    if (!next.evidenceSources.some((source) => source.sourceId === event.source.sourceId)) {
      next.evidenceSources.push(structuredClone(event.source));
    }
    const observationIds = new Set(next.observations.map((observation) => observation.observationId));
    next.observations.push(...event.observations.filter((observation) => !observationIds.has(observation.observationId)).map((observation) => structuredClone(observation)));
    const evaluationIds = new Set(next.predictionEvaluations.map((evaluation) => evaluation.evaluationId));
    next.predictionEvaluations.push(...event.evaluations.filter((evaluation) => !evaluationIds.has(evaluation.evaluationId)).map((evaluation) => structuredClone(evaluation)));
    next.calibrations = [...(next.calibrations ?? []), structuredClone(event.calibration)];
    next.evidence.academic = uniqueEvidence([...next.evidence.academic, ...event.observations.map((observation) => ({
      evidenceId: observation.observationId,
      summary: `Returned work item ${observation.itemId}: ${observation.result.correct === true ? "correct" : observation.result.correct === false ? "incorrect" : "observed"}.`,
      ...(typeof observation.result.score === "number" ? { accuracy: observation.result.score } : {}),
    }))]);
    evidenceIds = event.observations.map((observation) => observation.observationId);
    reason = "Confirmed returned work was recorded as factual evidence pending one Planner interpretation.";
    nextAction = "Interpret the prediction evaluations without changing the observations.";
  } else if (event.type === "graded_work_received") {
    next.calibrations = [...(next.calibrations ?? []), structuredClone(event.calibration)];
    next.evidence.academic = uniqueEvidence([...next.evidence.academic, {
      evidenceId: event.calibration.calibrationId,
      summary: `Returned graded work: ${event.calibration.status} (${event.calibration.score ?? "score unavailable"}).`,
      ...(event.calibration.score != null ? { accuracy: event.calibration.score } : {}),
    }]);
    evidenceIds = [event.calibration.calibrationId];
    reason = event.calibration.reason;
    nextAction = event.calibration.nextAction;
  } else if (event.type === "theory_decided") {
    ({ status, reason, nextAction } = event.decision);
    evidenceIds = [...event.decision.evidenceIds];
    if (event.decision.revisedHypothesis && event.decision.revisedHypothesis !== next.academicTheory.hypothesis) {
      next.academicTheory = {
        ...next.academicTheory,
        revision: next.academicTheory.revision + 1,
        hypothesis: event.decision.revisedHypothesis,
      };
    }
    if (event.decision.progressionAction === "generate_quest") {
      const quest = next.nodes.find((node) => node.role === "quest");
      if (!quest) throw new Error("learning_cycle_quest_node_missing");
      const prescription = event.decision.nextInstrument;
      if (prescription) {
        quest.academicTarget.skill = prescription.academicTarget;
        quest.mechanic = prescription.mechanic;
        quest.theme = prescription.theme;
        // `role` stays "quest" for the machine; the child sees the name the
        // Planner chose, exactly as support nodes already do.
        quest.title = prescription.title;
        quest.openingScreen = { title: prescription.title, purpose: prescription.openingPurpose };
        quest.design = prescriptionDesign(prescription);
      }
      quest.state = "generating";
      quest.generationPrompt = generationPrompt(next, "quest", evidenceIds, event.decision.reason, at);
      if (prescription) {
        quest.generationPrompt.text = `${prescription.creatorPrompt} ${quest.generationPrompt.text}`;
      }
      next.lifecycle = "quest_generating";
    } else if (event.decision.progressionAction === "generate_boss") {
      const quest = next.nodes.find((node) => node.role === "quest");
      if (quest?.state !== "completed" || quest.evidenceIds.length === 0) {
        throw new Error("learning_cycle_boss_progress_requires_quest_evidence");
      }
      const boss = next.nodes.find((node) => node.role === "boss");
      if (!boss) throw new Error("learning_cycle_boss_node_missing");
      const prescription = event.decision.nextInstrument;
      boss.academicTarget.targets = [...quest.academicTarget.targets];
      if (prescription) {
        boss.academicTarget.skill = prescription.academicTarget;
        boss.mechanic = prescription.mechanic;
        boss.theme = prescription.theme;
        boss.title = prescription.title;
        boss.openingScreen = { title: prescription.title, purpose: prescription.openingPurpose };
        boss.design = prescriptionDesign(prescription);
      }
      boss.state = "generating";
      boss.generationPrompt = generationPrompt(next, "boss", evidenceIds, event.decision.reason, at);
      if (prescription) {
        boss.generationPrompt.text = `${prescription.creatorPrompt} ${boss.generationPrompt.text}`;
      }
      next.lifecycle = "boss_generating";
    } else if (event.decision.progressionAction === "generate_support") {
      const prescription = event.decision.nextInstrument;
      if (!prescription) throw new Error("learning_cycle_support_instrument_missing");
      if (next.nodes.some((node) => node.nodeId === prescription.nodeId)) {
        throw new Error(`learning_cycle_duplicate_node_id:${prescription.nodeId}`);
      }
      const reference = [...next.nodes].reverse().find((node) => node.state === "completed");
      next.nodes.push({
        nodeId: prescription.nodeId,
        routeId: "adaptive-support",
        role: "baseline",
        title: prescription.title,
        state: "generating",
        academicTarget: {
          domain: next.domain,
          skill: prescription.academicTarget,
          targets: [],
        },
        algorithmOwner: "ai_tutor",
        theoryId: next.academicTheory.theoryId,
        experimentId: `${next.homeworkId}:support:r${next.revision + 1}`,
        mechanic: prescription.mechanic,
        theme: prescription.theme,
        ...(prescriptionDesign(prescription) ? { design: prescriptionDesign(prescription) } : {}),
        openingScreen: { title: prescription.title, purpose: prescription.openingPurpose },
        generationPrompt: {
          promptId: `${next.homeworkId}:support:prompt:r${next.revision + 1}`,
          createdFromEvidenceIds: evidenceIds,
          text: [
            prescription.creatorPrompt,
            `Decision: ${event.decision.reason}`,
            `Evidence references: ${evidenceIds.join(", ") || "none"}.`,
            `Do not reuse these exposed item identities or their exact prompts: ${[...new Set(next.observations.map((observation) => observation.itemId))].join(", ") || "none recorded"}.`,
          ].join(" "),
        },
        prediction: {
          claim: `This support instrument will resolve: ${event.decision.reason}`,
          createdAt: at,
          evidenceLimit: "practice_only",
        },
        artifactBinding: null,
        artwork: {
          status: reference?.artwork.localPath ? "ready" : "placeholder",
          localPath: reference?.artwork.localPath ?? "/generated/adventure-board-demo/quest.jpeg",
          prompt: null,
        },
        sfxContract: ["interaction", "recovery", "progress", "completion"],
        companionContract: { events: ["completion", "frustration"] },
        evidenceContract: { academic: true, engagement: true, companionObservations: true },
        evidenceIds: [],
      });
      const quest = next.nodes.find((node) => node.role === "quest");
      const boss = next.nodes.find((node) => node.role === "boss");
      if (quest) {
        quest.state = "locked";
        quest.generationPrompt = null;
        quest.artifactBinding = null;
      }
      if (boss) {
        boss.state = "locked";
        boss.generationPrompt = null;
        boss.artifactBinding = null;
      }
      next.lifecycle = "baseline_generating";
    } else if (event.decision.progressionAction === "await_calibration") {
      next.lifecycle = "awaiting_calibration";
    } else if (event.decision.progressionAction === "collect_more_evidence") {
      next.lifecycle = fromLifecycle === "quest_evaluating" ? "quest_active" : "baseline_active";
    } else if (fromLifecycle === "awaiting_calibration") {
      const calibratedObservationIds = new Set(next.observations
        .filter((observation) => observation.provenance === "graded_work" || observation.provenance === "delayed_reassessment")
        .map((observation) => observation.observationId));
      if (event.decision.evidenceIds.some((id) => calibratedObservationIds.has(id))) {
        next.lifecycle = "complete";
      }
    }
  } else if (event.type === "engagement_theory_updated") {
    next.engagementTheory = structuredClone(event.theory);
    reason = event.reason;
    evidenceIds = event.theory.evidence.map((item) => item.id);
  } else if (event.type === "artifact_rejected") {
    const node = nodeOrThrow(next, event.nodeId);
    node.artifactBinding = null;
    if (node.role === "boss" && node.academicTarget.targets.length === 0) {
      const quest = next.nodes.find((candidate) => candidate.role === "quest");
      node.academicTarget.targets = [...(quest?.academicTarget.targets ?? [])];
    }
    node.state = node.role === "quest" || node.role === "boss" ? "generating" : "blocked";
    next.lifecycle = node.role === "quest"
      ? "quest_generating"
      : node.role === "boss"
        ? "boss_generating"
        : "baseline_ready";
    reason = event.reason;
  } else {
    next.lifecycle = "blocked";
    reason = event.reason;
  }

  next.revision += 1;
  next.updatedAt = at;
  const decision: LearningCycleDecision = {
    decisionId: `${next.homeworkId}:decision:r${next.revision}`,
    eventType: event.type,
    ...(status ? { status } : {}),
    reason,
    ...(nextAction ? { nextAction } : {}),
    evidenceIds,
    fromLifecycle,
    toLifecycle: next.lifecycle,
    createdAt: at,
    ...(event.type === "theory_decided" ? {
      preserve: event.decision.preserve,
      change: event.decision.change,
      testNext: event.decision.testNext,
      nextEvidenceRequired: event.decision.nextEvidenceRequired,
      predictionEvaluationIds: event.decision.predictionEvaluationIds,
      assumptionAssessments: event.decision.assumptionAssessments,
    } : {}),
  };
  next.decisionHistory.push(decision);
  assertCycle(next);
  atomicWrite(cyclePath(next.childId, next.homeworkId, opts), next);
  appendDecisionTrace(next, decision, opts);
  return next;
}

export function recordLearningCycleCalibration(
  childId: string,
  homeworkId: string,
  calibration: LearningCycleCalibration,
  opts: LearningCycleRepositoryOptions = {},
): LearningCycleRecordV2 {
  const cycle = getLearningCycle(childId, homeworkId, opts);
  if (!cycle) throw new Error(`learning_cycle_missing:${homeworkId}`);
  if ((cycle.calibrations ?? []).some((entry) => entry.calibrationId === calibration.calibrationId)) {
    return cycle;
  }
  return transitionLearningCycle(childId, homeworkId, cycle.revision, {
    type: "graded_work_received",
    calibration,
  }, opts);
}

function nodeActivityType(node: LearningCycleNodeContract): ActiveSessionPlan["nodePlan"][number]["type"] {
  if (node.role === "quest") return "quest";
  if (node.role === "boss") return "boss";
  if (node.role === "mystery") return "mystery";
  return "generated-baseline";
}

function presentationProjectionPlanId(planId: string, revision: number): string {
  const suffix = `:cycle-r${revision}`;
  return planId.endsWith(suffix) ? planId : `${planId}${suffix}`;
}

export function projectLearningCycle(
  cycle: LearningCycleRecordV2,
  options: ProjectLearningCycleOptions = {},
): LearningCycleProjection {
  assertCycle(cycle);
  const planId = `learning-cycle:${cycle.homeworkId}:r${cycle.revision}`;
  const nodePlan: ActiveSessionPlan["nodePlan"] = cycle.nodes.map((node) => {
    const type = nodeActivityType(node);
    return {
      id: node.nodeId,
      type,
      activityId: type,
      targets: [...node.academicTarget.targets],
      difficulty: 1,
      source: "chart_planner",
      targetLane: node.academicTarget.skill,
      locked: node.state === "locked" || node.state === "generating" || node.state === "blocked",
      masteryUnlockState: node.state === "ready" || node.state === "active" || node.state === "completed"
        ? "unlocked"
        : "preparing",
      title: node.role === "quest" ? "Quest" : node.role === "boss" ? "Boss" : node.title,
      theoryId: node.theoryId,
      experimentId: node.experimentId,
      contentId: node.artifactBinding?.contentId ?? `${cycle.homeworkId}:node:${node.nodeId}`,
      mechanic: node.mechanic,
      theme: node.theme,
      sfxProfile: node.sfxContract.join("-"),
      companionPolicy: "cycle-contract",
      gameHtmlPath: node.artifactBinding?.localArtifactPath,
      date: node.artifactBinding?.localArtifactPath ? cycle.homeworkId : undefined,
      activityConfigPath: node.artifactBinding?.activityConfigPath,
      validationProof: node.artifactBinding?.validationProof,
      thumbnailUrl: node.artwork.localPath ?? node.artifactBinding?.localArtworkPath ?? undefined,
      thumbnailPrompt: node.artwork.prompt ?? undefined,
    };
  });
  const activeSessionPlan: ActiveSessionPlan = {
    planId,
    childId: cycle.childId,
    createdAt: cycle.createdAt,
    source: "ingest_human_loop",
    activeHomeworkId: cycle.homeworkId,
    domain: cycle.domain,
    testDate: null,
    nodePlan,
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: cycle.assignment.contentFingerprint.slice(0, 12),
      previousCompletedNodeCount: cycle.nodes.filter((node) => node.state === "completed").length,
    },
    companionPolicy: {
      companionId: "elli",
      displayName: "Elli",
      openingLinePolicy: "context_start_short",
      verbosity: "low",
      maxMicroProbes: 1,
    },
    evidenceUsed: cycle.assignment.capturedEvidenceIds.map((id) => ({
      id,
      type: "captured_assignment",
      summary: `Canonical cycle evidence ${id}`,
    })),
    openQuestions: [],
    approvalStatus: "approved",
    planTheory: {
      hypothesis: cycle.academicTheory.hypothesis,
      evidenceSummary: cycle.evidence.academic.map((item) => item.summary),
      intervention: "Follow the canonical learning-cycle node contracts.",
      supportCriteria: cycle.academicTheory.supportCriteria,
      reviseCriteria: cycle.academicTheory.reviseCriteria,
      falsifyCriteria: cycle.academicTheory.falsifyCriteria,
    },
  };
  const adventureBoard = buildAdventureBoardFromActiveSessionPlan({
    plan: activeSessionPlan as unknown as ActiveSessionPlanBoardSnapshot,
    boardId: `cycle-board:${cycle.homeworkId}`,
    title: cycle.assignment.title,
    theme: BOARD_THEME,
    layout: { preset: "horizontal-adventure-spine", companionSlot: "right" },
    plannerRationale: {
      agencyDesign: "The canonical cycle owns every visible node contract.",
      evidenceDesign: "Quest and Boss unlock only from recorded evidence transitions.",
      layoutChoice: "Render the canonical intervention sequence without semantic rewrites.",
    },
    companion: { id: "elli", name: "Elli" },
    progress: {
      completedNodeIds: cycle.nodes
        .filter((node) => node.state === "completed")
        .map((node) => node.nodeId),
      currentNodeId: cycle.nodes.find(
        (node) => node.state === "active" || node.state === "ready",
      )?.nodeId,
    },
    labelForNode: (node) => node.title,
    thumbnailForNode: (node) => node.thumbnailUrl,
  });
  activeSessionPlan.adventureBoard = adventureBoard;
  const canonicalProjection: LearningCycleProjection = {
    activeSessionPlan,
    adventureBoard,
    carePlan: {
      version: 2,
      childId: cycle.childId,
      sourceCycleRevision: cycle.revision,
      academicTheory: cycle.academicTheory,
      engagementTheory: cycle.engagementTheory,
      decisionHistory: cycle.decisionHistory,
      updatedAt: cycle.updatedAt,
    },
    engagementTheory: cycle.engagementTheory,
  };

  const presentationPlan = options.presentationPlan;
  if (!presentationPlan || presentationPlan.activeHomeworkId !== cycle.homeworkId) {
    return canonicalProjection;
  }

  const canonicalPlanNodeById = new Map(
    canonicalProjection.activeSessionPlan.nodePlan.map((node) => [node.id, node]),
  );
  const mergedNodePlan = presentationPlan.nodePlan.map((presented) => {
    const canonical = canonicalPlanNodeById.get(presented.id);
    if (!canonical) return presented;
    canonicalPlanNodeById.delete(presented.id);
    const canonicalOwnsArtwork = canonical.type === "quest" || canonical.type === "boss";
    return {
      ...presented,
      ...canonical,
      title: canonical.title,
      thumbnailUrl: canonicalOwnsArtwork
        ? canonical.thumbnailUrl ?? presented.thumbnailUrl
        : presented.thumbnailUrl ?? canonical.thumbnailUrl,
      thumbnailPrompt: canonical.thumbnailPrompt ?? presented.thumbnailPrompt,
    };
  });
  mergedNodePlan.push(...canonicalPlanNodeById.values());

  const presentedBoard = presentationPlan.adventureBoard;
  if (!presentedBoard) {
    const mergedPlan = {
      ...presentationPlan,
      planId: presentationProjectionPlanId(presentationPlan.planId, cycle.revision),
      nodePlan: mergedNodePlan,
      activeHomeworkId: cycle.homeworkId,
      adventureBoard: canonicalProjection.adventureBoard,
    };
    return {
      ...canonicalProjection,
      activeSessionPlan: mergedPlan,
      adventureBoard: canonicalProjection.adventureBoard,
    };
  }

  const canonicalBoardNodeById = new Map(
    canonicalProjection.adventureBoard.nodes.map((node) => [node.id, node]),
  );
  const mergedBoardNodes = presentedBoard.nodes.map((presented) => {
    const canonical = canonicalBoardNodeById.get(presented.id);
    if (!canonical) return presented;
    canonicalBoardNodeById.delete(presented.id);
    const canonicalOwnsArtwork = canonical.kind === "quest" || canonical.kind === "boss";
    return {
      ...presented,
      label: canonical.label,
      shortLabel: canonical.shortLabel ?? presented.shortLabel,
      state: canonical.state,
      action: canonical.action,
      lock: canonical.lock,
      thumbnailUrl: canonicalOwnsArtwork
        ? canonical.thumbnailUrl ?? presented.thumbnailUrl
        : presented.thumbnailUrl ?? canonical.thumbnailUrl,
      thumbnailPrompt: canonical.thumbnailPrompt ?? presented.thumbnailPrompt,
      theoryId: canonical.theoryId,
      experimentId: canonical.experimentId,
      contentId: canonical.contentId,
      mechanic: canonical.mechanic,
      sfxProfile: canonical.sfxProfile,
      companionPolicy: canonical.companionPolicy,
    };
  });
  const appendedCanonicalBoardNodes = [...canonicalBoardNodeById.values()];
  const appendedCanonicalNodeIds = new Set(appendedCanonicalBoardNodes.map((node) => node.id));
  mergedBoardNodes.push(...appendedCanonicalBoardNodes);
  const mergedBoardNodeById = new Map(mergedBoardNodes.map((node) => [node.id, node]));
  const canonicalEdgeById = new Map(
    canonicalProjection.adventureBoard.edges.map((edge) => [edge.id, edge]),
  );
  const mergedEdges: AdventureBoardJson["edges"] = presentedBoard.edges.map((edge) => {
    canonicalEdgeById.delete(edge.id);
    const destination = mergedBoardNodeById.get(edge.to);
    const state = destination?.state === "completed"
      ? "completed" as const
      : destination?.state === "available" || destination?.state === "current"
        ? "available" as const
        : "locked" as const;
    return { ...edge, state };
  });
  const mergedEdgePairs = new Set(mergedEdges.map((edge) => `${edge.from}->${edge.to}`));
  for (const edge of canonicalEdgeById.values()) {
    const pair = `${edge.from}->${edge.to}`;
    const introducesAdaptiveNode = appendedCanonicalNodeIds.has(edge.from) || appendedCanonicalNodeIds.has(edge.to);
    if (
      introducesAdaptiveNode
      && !mergedEdgePairs.has(pair)
      && mergedBoardNodeById.has(edge.from)
      && mergedBoardNodeById.has(edge.to)
    ) {
      mergedEdges.push(edge);
      mergedEdgePairs.add(pair);
    }
  }
  const mergedChoiceSets = presentedBoard.choiceSets?.map((choiceSet) => ({
    ...choiceSet,
    options: choiceSet.options.map((option) => {
      const node = option.nodeId ? mergedBoardNodeById.get(option.nodeId) : undefined;
      const planNode = option.nodeId ? mergedNodePlan.find((candidate) => candidate.id === option.nodeId) : undefined;
      if (!node) return option;
      return {
        ...option,
        state: node.state === "completed" ? "completed" as const : node.state === "locked" ? "locked" as const : "available" as const,
        gameHtmlPath: planNode?.gameHtmlPath,
        activityConfigPath: planNode?.activityConfigPath,
      };
    }),
  }));
  const mergedBoard: AdventureBoardJson = {
    ...presentedBoard,
    planId: presentationProjectionPlanId(presentationPlan.planId, cycle.revision),
    nodes: mergedBoardNodes,
    edges: mergedEdges,
    ...(mergedChoiceSets ? { choiceSets: mergedChoiceSets } : {}),
    progress: {
      ...presentedBoard.progress,
      completedNodeIds: cycle.nodes.filter((node) => node.state === "completed").map((node) => node.nodeId),
      currentNodeId: cycle.nodes.find((node) => node.state === "active" || node.state === "ready")?.nodeId,
    },
  };
  const mergedPlan: ActiveSessionPlan = {
    ...presentationPlan,
    planId: presentationProjectionPlanId(presentationPlan.planId, cycle.revision),
    activeHomeworkId: cycle.homeworkId,
    nodePlan: mergedNodePlan,
    adventureBoard: mergedBoard,
  };
  return {
    ...canonicalProjection,
    activeSessionPlan: mergedPlan,
    adventureBoard: mergedBoard,
  };
}

export function assertLearningCycleProjectionWrite(
  childId: string,
  plan: ActiveSessionPlan,
  opts: LearningCycleRepositoryOptions = {},
): void {
  const homeworkId = plan.activeHomeworkId;
  if (!homeworkId) return;
  const cycle = getLearningCycle(childId, homeworkId, opts);
  if (!cycle) return;
  const canonical = projectLearningCycle(cycle).activeSessionPlan;
  if (JSON.stringify(plan) === JSON.stringify(canonical)) return;
  const expected = projectLearningCycle(cycle, { presentationPlan: plan }).activeSessionPlan;
  if (JSON.stringify(plan) !== JSON.stringify(expected)) {
    throw new Error(`learning_cycle_compatibility_projection_drift:${homeworkId}:r${cycle.revision}`);
  }
}

export function projectLearningCyclePlanForWrite(
  childId: string,
  plan: ActiveSessionPlan,
  opts: LearningCycleRepositoryOptions = {},
): ActiveSessionPlan {
  const homeworkId = plan.activeHomeworkId;
  if (!homeworkId) return plan;
  const cycle = getLearningCycle(childId, homeworkId, opts);
  if (!cycle) return plan;
  return projectLearningCycle(cycle, { presentationPlan: plan }).activeSessionPlan;
}
