import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { resolveChildContextDir } from "../utils/contextRoot";
import {
  createLearningCycle,
  getLearningCycle,
  transitionLearningCycle,
  type AcademicPrediction,
  type LearningAssumption,
  type LearningCycleAgencyExperiment,
  type LearningCycleNodeContract,
  type LearningCycleRecordV2,
  type LearningObservation,
} from "./learningCycleRepository";

export type MathDiscoveryEvaluationItem = {
  itemId: string;
  constructId: string;
  prompt: string;
  responseContract: string;
  correctAnswerContract: { acceptedValues: string[] };
  difficultyBoundary: string;
  exposureId: string;
  possibleConfounds: string[];
  falsifyingEvidence: string[];
  measurementKeys: string[];
};

export type MathDiscoveryEvaluationContract = {
  evaluationId: string;
  title: string;
  assignmentEvidenceIds: string[];
  constructs: Array<{ constructId: string; prerequisiteIds: string[] }>;
  items: MathDiscoveryEvaluationItem[];
  artifact: {
    artifactId: string;
    htmlPath: string;
    artworkPath: string;
    contractHash: string;
    artifactHash: string;
  };
};

export type MathDiscoveryAttempt = {
  attemptId: string;
  itemId: string;
  constructId: string;
  result: "correct" | "incorrect" | "assisted" | "unresolved" | "instrument_ambiguous";
  assistance: "unassisted" | "assisted" | "unknown";
  exposure: "unseen" | "previously_taught" | "previously_practiced" | "unknown";
  responseMode: string;
  attemptedValue?: string;
  possibleConfounds: string[];
  observedAt: string;
};

export type TargetedMathNode = {
  nodeId: string;
  title: string;
  academicTarget: string;
  algorithmOwner: string;
  theoryId: string;
  experimentId: string;
  mechanic: string;
  theme: string;
  routeId?: string;
};

export type MathGenerationNodeStatus = "preparing" | "ready" | "evidence_locked" | "completed" | "failed_resumable";

export type MathGenerationJob = {
  version: 1;
  childId: string;
  homeworkId: string;
  phase: "targeted_planning" | "board_designing" | "board_generating" | "board_ready";
  programHash: string;
  designHash: string;
  startedAt: string;
  updatedAt: string;
  nodes: Array<{
    nodeId: string;
    status: MathGenerationNodeStatus;
    artifactHash?: string;
    error?: string;
    updatedAt: string;
  }>;
};

type RootOptions = { rootDir?: string };

function generationJobPath(childId: string, homeworkId: string, opts: RootOptions): string {
  return path.join(
    resolveChildContextDir(childId, { rootDir: opts.rootDir }),
    "homework",
    "direct-drafts",
    homeworkId,
    "adaptive-generation-job.json",
  );
}

function atomicJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

function evaluationNode(contract: MathDiscoveryEvaluationContract): LearningCycleNodeContract {
  return {
    nodeId: contract.evaluationId,
    role: "evaluation",
    title: contract.title,
    state: "ready",
    academicTarget: {
      domain: "math",
      skill: "independent_discovery",
      targets: contract.constructs.map((construct) => construct.constructId),
    },
    algorithmOwner: "independent-probe",
    theoryId: `${contract.evaluationId}:opening-theory`,
    experimentId: contract.evaluationId,
    mechanic: "ai-authored-independent-evaluation",
    theme: "ai-authored",
    openingScreen: { title: contract.title, purpose: "Show Sunny what you already understand." },
    generationPrompt: null,
    prediction: {
      claim: "The opening evaluation will distinguish prior understanding from interface or support effects.",
      createdAt: new Date().toISOString(),
      evidenceLimit: "independent_performance",
    },
    artifactBinding: {
      contentId: `${contract.evaluationId}:content`,
      artifactId: contract.artifact.artifactId,
      localArtifactPath: contract.artifact.htmlPath,
      localArtworkPath: contract.artifact.artworkPath,
      contractFingerprint: contract.artifact.contractHash,
      validationStatus: "passed",
      creativeProvenance: {
        rationale: "AI-authored independent evaluation.",
        qualityPrediction: "The evaluation will reveal prerequisite evidence without teaching first.",
        creatorPromptHash: contract.artifact.contractHash,
        artworkPromptHash: contract.artifact.artifactHash,
        generatedHtmlHash: contract.artifact.artifactHash,
      },
    },
    artwork: { status: "ready", localPath: contract.artifact.artworkPath, prompt: null },
    sfxContract: ["interaction", "recovery", "completion"],
    companionContract: { events: ["help_requested", "evaluation_complete"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true },
    evidenceIds: [],
  };
}

export function createDiscoveryLearningCycle(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  assignment: LearningCycleRecordV2["assignment"];
  evaluation: MathDiscoveryEvaluationContract;
}): LearningCycleRecordV2 {
  const theoryId = `${input.homeworkId}:discovery-theory`;
  return createLearningCycle({
    childId: input.childId,
    homeworkId: input.homeworkId,
    domain: "math",
    assignment: input.assignment,
    academicTheory: {
      theoryId,
      revision: 1,
      hypothesis: "Independent Discovery evidence is required before Sunny selects instruction.",
      supportCriteria: ["Fresh, unassisted observations identify existing understanding."],
      reviseCriteria: ["Assistance, reading, interface, or response-mode confounds limit interpretation."],
      falsifyCriteria: ["The evaluation cannot distinguish conceptual evidence from instrument friction."],
    },
    engagementTheory: null,
    nodes: [evaluationNode(input.evaluation)],
    academicPredictions: input.evaluation.constructs.map((construct) => ({
      predictionId: `${input.evaluation.evaluationId}:prediction:${construct.constructId}`,
      theoryId,
      constructId: construct.constructId,
      context: "independent opening evaluation",
      horizon: "current discovery session",
      expectedMetric: { key: "independent_observation_count", min: 1, max: input.evaluation.items.length },
      predictedErrorPatterns: [],
      confidence: 0.5,
      evidenceIds: input.evaluation.assignmentEvidenceIds,
      intervention: "independent evaluation",
      evidenceLimit: "independent_performance",
      createdAt: new Date().toISOString(),
    })),
    assumptions: [],
    initialLifecycle: "evaluation_ready",
  }, { rootDir: input.rootDir });
}

export function recordDiscoveryAttempt(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  attempt: MathDiscoveryAttempt;
}): LearningCycleRecordV2 {
  let cycle = getLearningCycle(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  const evaluation = cycle.nodes.find((node) => node.role === "evaluation");
  if (!evaluation) throw new Error("learning_cycle_evaluation_node_missing");
  if (cycle.lifecycle === "evaluation_ready") {
    cycle = transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
      type: "evaluation_started",
      evaluationId: evaluation.nodeId,
    }, { rootDir: input.rootDir });
  }
  const ambiguous = input.attempt.result === "instrument_ambiguous" || input.attempt.result === "unresolved";
  const assisted = input.attempt.assistance !== "unassisted" || input.attempt.result === "assisted";
  const observation: LearningObservation = {
    observationId: input.attempt.attemptId,
    sourceId: `evaluation:${evaluation.nodeId}`,
    itemId: input.attempt.itemId,
    ...(input.attempt.attemptedValue ? { childResponse: input.attempt.attemptedValue } : {}),
    constructLinks: [{ constructId: input.attempt.constructId, role: "primary", confidence: 1 }],
    result: ambiguous
      ? { correct: undefined, observedErrorType: "instrument_ambiguous" }
      : { correct: input.attempt.result === "correct", score: input.attempt.result === "correct" ? 1 : 0 },
    assistance: {
      status: assisted ? "assisted" : input.attempt.assistance,
      scaffolds: assisted ? ["discovery_support"] : [],
    },
    exposure: input.attempt.exposure,
    provenance: assisted || input.attempt.exposure !== "unseen" ? "practice" : "independent_probe",
    observedAt: input.attempt.observedAt,
    confounds: [...new Set([
      ...input.attempt.possibleConfounds,
      ...(ambiguous ? ["instrument_ambiguous"] : []),
      ...(assisted ? ["assistance_present"] : []),
      `response_mode:${input.attempt.responseMode}`,
    ])],
  };
  return transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
    type: "evaluation_attempted",
    evaluationId: evaluation.nodeId,
    nodeId: evaluation.nodeId,
    observations: [observation],
    academicEvidence: [{
      evidenceId: observation.observationId,
      summary: `${observation.itemId}: ${ambiguous ? "instrument ambiguous" : observation.result.correct ? "independent correct" : "incorrect"}; assistance=${observation.assistance.status}.`,
      ...(typeof observation.result.score === "number" ? { accuracy: observation.result.score } : {}),
    }],
    engagementEvidence: input.attempt.possibleConfounds.length > 0
      ? [{ evidenceId: `${observation.observationId}:interaction`, summary: input.attempt.possibleConfounds.join(", ") }]
      : [],
    companionObservations: [],
  }, { rootDir: input.rootDir });
}

export function completeDiscoveryEvaluation(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  completedAt: string;
}): LearningCycleRecordV2 {
  const cycle = getLearningCycle(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  const evaluation = cycle.nodes.find((node) => node.role === "evaluation");
  if (!evaluation) throw new Error("learning_cycle_evaluation_node_missing");
  return transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
    type: "evaluation_completed",
    evaluationId: evaluation.nodeId,
    completedAt: input.completedAt,
  }, { rootDir: input.rootDir });
}

function targetedNode(node: TargetedMathNode): LearningCycleNodeContract {
  return {
    nodeId: node.nodeId,
    ...(node.routeId ? { routeId: node.routeId } : {}),
    role: "baseline",
    title: node.title,
    state: "generating",
    academicTarget: { domain: "math", skill: node.academicTarget, targets: [node.academicTarget] },
    algorithmOwner: node.algorithmOwner,
    theoryId: node.theoryId,
    experimentId: node.experimentId,
    mechanic: node.mechanic,
    theme: node.theme,
    openingScreen: { title: node.title, purpose: "Targeted from committed Discovery evidence." },
    generationPrompt: null,
    artifactBinding: null,
    artwork: { status: "pending", localPath: null, prompt: null },
    sfxContract: ["interaction", "recovery", "progress", "completion"],
    companionContract: { events: ["help_requested", "completion", "frustration"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true },
    evidenceIds: [],
  };
}

export function revealTargetedBoard(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  programHash: string;
  designHash: string;
  nodes: TargetedMathNode[];
  academicTheory?: LearningCycleRecordV2["academicTheory"];
  academicPredictions?: AcademicPrediction[];
  assumptions?: LearningAssumption[];
  agencyExperiment?: LearningCycleAgencyExperiment;
}): LearningCycleRecordV2 {
  let cycle = getLearningCycle(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  if (cycle.lifecycle === "evidence_ready") {
    cycle = transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
      type: "targeted_planning_started",
      evaluationId: cycle.nodes.find((node) => node.role === "evaluation")?.nodeId ?? "missing",
    }, { rootDir: input.rootDir });
  }
  if (cycle.lifecycle === "targeted_planning") {
    cycle = transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
      type: "board_design_started",
      programHash: input.programHash,
    }, { rootDir: input.rootDir });
  }
  return transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
    type: "targeted_board_revealed",
    programHash: input.programHash,
    designHash: input.designHash,
    nodes: input.nodes.map(targetedNode),
    academicTheory: input.academicTheory ?? {
      theoryId: `${input.homeworkId}:targeted-theory`,
      revision: 1,
      hypothesis: "The targeted program should address the evidence observed during Discovery.",
      supportCriteria: ["Fresh checkpoint evidence improves after the intervention."],
      reviseCriteria: ["Checkpoint evidence is mixed or confounded."],
      falsifyCriteria: ["Fresh independent evidence does not improve."],
    },
    academicPredictions: input.academicPredictions ?? [],
    assumptions: input.assumptions ?? [],
    ...(input.agencyExperiment ? { agencyExperiment: input.agencyExperiment } : {}),
  }, { rootDir: input.rootDir });
}

export function getMathGenerationStatus(
  childId: string,
  homeworkId: string,
  opts: RootOptions = {},
): MathGenerationJob | null {
  const file = generationJobPath(childId, homeworkId, opts);
  if (!fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as MathGenerationJob;
  if (parsed.version !== 1 || parsed.childId !== childId || parsed.homeworkId !== homeworkId) {
    throw new Error("math_generation_job_identity_invalid");
  }
  return parsed;
}

export function queueTargetedMathGeneration(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
}): MathGenerationJob {
  const existing = getMathGenerationStatus(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (existing) return existing;
  const now = new Date().toISOString();
  const job: MathGenerationJob = {
    version: 1,
    childId: input.childId,
    homeworkId: input.homeworkId,
    phase: "targeted_planning",
    programHash: "",
    designHash: "",
    startedAt: now,
    updatedAt: now,
    nodes: [],
  };
  atomicJson(generationJobPath(input.childId, input.homeworkId, input), job);
  console.log(` 🎮 [adaptive-math] [targeted-generation] [queued] child=${input.childId} homework=${input.homeworkId}`);
  return job;
}

export function writeMathGenerationJob(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  programHash: string;
  designHash: string;
  nodeIds: string[];
}): MathGenerationJob {
  const now = new Date().toISOString();
  const existing = getMathGenerationStatus(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (existing && (existing.programHash !== input.programHash || existing.designHash !== input.designHash)) {
    throw new Error("math_generation_job_frozen_contract_changed");
  }
  const previous = new Map(existing?.nodes.map((node) => [node.nodeId, node]) ?? []);
  const job: MathGenerationJob = {
    version: 1,
    childId: input.childId,
    homeworkId: input.homeworkId,
    phase: "board_generating",
    programHash: input.programHash,
    designHash: input.designHash,
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
    nodes: input.nodeIds.map((nodeId) => {
      const saved = previous.get(nodeId);
      if (saved?.status === "ready" || saved?.status === "completed" || saved?.status === "evidence_locked") return saved;
      return { nodeId, status: "preparing", updatedAt: now };
    }),
  };
  atomicJson(generationJobPath(input.childId, input.homeworkId, input), job);
  console.log(` 🎮 [adaptive-math] [generation-job] [saved] child=${input.childId} homework=${input.homeworkId} nodes=${job.nodes.length}`);
  return job;
}

export function updateMathGenerationNode(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  nodeId: string;
  status: MathGenerationNodeStatus;
  artifactHash?: string;
  error?: string;
}): MathGenerationJob {
  const job = getMathGenerationStatus(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (!job) throw new Error("math_generation_job_missing");
  const node = job.nodes.find((candidate) => candidate.nodeId === input.nodeId);
  if (!node) throw new Error(`math_generation_job_node_missing:${input.nodeId}`);
  if (node.status === "ready" && input.status !== "completed" && input.artifactHash !== node.artifactHash) {
    throw new Error(`math_generation_ready_artifact_immutable:${input.nodeId}`);
  }
  node.status = input.status;
  node.updatedAt = new Date().toISOString();
  if (input.artifactHash) node.artifactHash = input.artifactHash;
  if (input.error) node.error = input.error;
  else delete node.error;
  job.updatedAt = node.updatedAt;
  if (job.nodes.every((candidate) => ["ready", "completed", "evidence_locked"].includes(candidate.status))) {
    job.phase = "board_ready";
  }
  atomicJson(generationJobPath(input.childId, input.homeworkId, input), job);
  console.log(` 🎮 [adaptive-math] [node-generation] [${input.status}] child=${input.childId} homework=${input.homeworkId} node=${input.nodeId}`);
  return job;
}

export async function buildTargetedNodesResumably(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  firstNodeId: string;
  concurrency: number;
  buildNode: (nodeId: string) => Promise<{ artifactHash: string }>;
  onNodeReady?: (nodeId: string, artifactHash: string) => Promise<void> | void;
}): Promise<MathGenerationJob> {
  const initial = getMathGenerationStatus(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (!initial) throw new Error("math_generation_job_missing");
  const missing = initial.nodes
    .filter((node) => node.status === "preparing" || node.status === "failed_resumable")
    .map((node) => node.nodeId);
  const first = missing.includes(input.firstNodeId) ? input.firstNodeId : undefined;
  const remaining = missing.filter((nodeId) => nodeId !== first);

  const buildOne = async (nodeId: string): Promise<void> => {
    try {
      const built = await input.buildNode(nodeId);
      updateMathGenerationNode({
        rootDir: input.rootDir,
        childId: input.childId,
        homeworkId: input.homeworkId,
        nodeId,
        status: "ready",
        artifactHash: built.artifactHash,
      });
      await input.onNodeReady?.(nodeId, built.artifactHash);
    } catch (error: unknown) {
      updateMathGenerationNode({
        rootDir: input.rootDir,
        childId: input.childId,
        homeworkId: input.homeworkId,
        nodeId,
        status: "failed_resumable",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (first) await buildOne(first);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(input.concurrency), remaining.length || 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < remaining.length) {
      const nodeId = remaining[cursor];
      cursor += 1;
      if (nodeId) await buildOne(nodeId);
    }
  }));
  const final = getMathGenerationStatus(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (!final) throw new Error("math_generation_job_missing_after_build");
  return final;
}

export function hashDiscoveryContract(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
