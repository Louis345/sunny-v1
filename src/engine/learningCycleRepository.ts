import fs from "fs";
import path from "path";
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
  | "quest_generating"
  | "quest_ready"
  | "quest_active"
  | "boss_generating"
  | "boss_ready"
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
  validationProof?: {
    engine: "playwright";
    passed: boolean;
    worldStateChanged: boolean;
    screenshotPaths: string[];
  };
};

export type LearningCycleNodeContract = {
  nodeId: string;
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
  openingScreen: {
    title: string;
    purpose: string;
  };
  generationPrompt: LearningCyclePrompt | null;
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
  createdAt: string;
  updatedAt: string;
};

export type CreateLearningCycleInput = Omit<
  LearningCycleRecordV2,
  "schemaVersion" | "revision" | "lifecycle" | "evidence" | "decisionHistory" | "createdAt" | "updatedAt"
>;

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

export type LearningCycleEvent =
  | {
      type: "plan_reconciled";
      assignment: LearningCycleRecordV2["assignment"];
      academicTheory: LearningCycleAcademicTheory;
      engagementTheory: EngagementTheory | null;
      nodes: LearningCycleNodeContract[];
      reason: string;
    }
  | ({ type: "baseline_completed"; decision: OutcomeDecision } & OutcomeEvidence)
  | ({ type: "quest_completed"; decision: OutcomeDecision & { bossRequired: boolean } } & OutcomeEvidence)
  | ({ type: "boss_completed"; decision: OutcomeDecision } & OutcomeEvidence)
  | { type: "artifact_bound"; nodeId: string; artifact: LearningCycleArtifactBinding }
  | { type: "artifact_rejected"; nodeId: string; reason: string }
  | { type: "engagement_theory_updated"; theory: EngagementTheory; reason: string }
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
    if (node.role === "quest" && node.title !== "Quest") throw new Error("learning_cycle_quest_title_must_be_static");
    if (node.role === "boss" && node.title !== "Boss") throw new Error("learning_cycle_boss_title_must_be_static");
    if (node.openingScreen.title !== node.title) throw new Error(`learning_cycle_opening_title_mismatch:${node.nodeId}`);
    if (node.artifactBinding) {
      assertLocalPath(node.artifactBinding.localArtifactPath, "artifact_path");
      assertLocalPath(node.artifactBinding.localArtworkPath, "artwork_path");
    }
    if (node.artwork.localPath) assertLocalPath(node.artwork.localPath, "artwork_path");
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
    createdAt: at,
    updatedAt: at,
  };
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
  const cycle = parsed as LearningCycleRecordV2;
  assertCycle(cycle);
  return cycle;
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
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as LearningCycleRecordV2;
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
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as LearningCycleRecordV2;
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

function generationPrompt(
  cycle: LearningCycleRecordV2,
  role: "quest" | "boss",
  evidenceIds: string[],
  reason: string,
  at: string,
): LearningCyclePrompt {
  return {
    promptId: `${cycle.homeworkId}:${role}:prompt:r${cycle.revision + 1}`,
    createdFromEvidenceIds: evidenceIds,
    text: [
      `Generate the ${role === "quest" ? "Quest" : "Boss"} for ${cycle.assignment.title}.`,
      `Academic theory: ${cycle.academicTheory.hypothesis}`,
      `Decision: ${reason}`,
      `Evidence references: ${evidenceIds.join(", ") || "none"}.`,
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
    next.assignment = structuredClone(event.assignment);
    next.academicTheory = structuredClone(event.academicTheory);
    next.engagementTheory = structuredClone(event.engagementTheory);
    next.nodes = event.nodes.map((planned) => {
      const previous = previousById.get(planned.nodeId);
      if (!previous) return structuredClone(planned);
      return {
        ...structuredClone(planned),
        evidenceIds: [...new Set([...planned.evidenceIds, ...previous.evidenceIds])],
      };
    });
    next.lifecycle = "baseline_ready";
    reason = event.reason;
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
  };
  next.decisionHistory.push(decision);
  assertCycle(next);
  atomicWrite(cyclePath(next.childId, next.homeworkId, opts), next);
  appendDecisionTrace(next, decision, opts);
  return next;
}

function nodeActivityType(node: LearningCycleNodeContract): ActiveSessionPlan["nodePlan"][number]["type"] {
  if (node.role === "quest") return "quest";
  if (node.role === "boss") return "boss";
  if (node.role === "mystery") return "mystery";
  return "generated-baseline";
}

export function projectLearningCycle(cycle: LearningCycleRecordV2): LearningCycleProjection {
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
    labelForNode: (node) => node.title,
    thumbnailForNode: (node) => node.thumbnailUrl,
  });
  activeSessionPlan.adventureBoard = adventureBoard;
  return {
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
  const expected = projectLearningCycle(cycle).activeSessionPlan;
  if (JSON.stringify(plan) !== JSON.stringify(expected)) {
    throw new Error(`learning_cycle_compatibility_projection_drift:${homeworkId}:r${cycle.revision}`);
  }
}
