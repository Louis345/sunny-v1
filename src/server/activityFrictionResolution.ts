export type ActivityFrictionCause =
  | "conceptual"
  | "prompt_ambiguity"
  | "response_mode"
  | "scoring_disagreement"
  | "speech_failure"
  | "unknown";

export type ActivityFrictionAction =
  | "clarify"
  | "offer_alternative"
  | "advance_current_item";

export type ActivityFrictionDecision = {
  likelyCause: ActivityFrictionCause;
  confidence: number;
  action: ActivityFrictionAction;
  rationale: string;
};

export type ActivityFrictionResolutionContext = {
  childId: string;
  companionId: string;
  sessionId: string;
  homeworkId: string;
  nodeId: string;
  itemId: string;
  artifactHash: string;
  attemptId: string;
  device: string;
  answerVisibility: "hidden" | "visible" | "revealed" | "unknown";
  companionPresence: "collapsed" | "summoned";
  runtimeMode: "real" | "preview";
  frictionSignal: string;
  provenanceAuthority: "server_verified";
};

export type ActivityFrictionEvidence = ActivityFrictionDecision & {
  resolutionId: string;
  childId: string;
  companionId: string;
  sessionId: string;
  homeworkId: string;
  nodeId: string;
  itemId: string;
  artifactHash: string;
  device: string;
  evidenceIds: string[];
  observedErrorType: "instrument_ambiguous" | "conceptual_uncertainty" | "unresolved";
  assistance: "assisted";
  masteryEligible: false;
  correct?: never;
  uncertainty: string;
  nextEvidenceNeeded: string;
};

type ActivityFrictionResolutionDependencies = {
  sendAndConfirm(message: Record<string, unknown>): void | Promise<void>;
  persist(evidence: ActivityFrictionEvidence): void | Promise<void>;
};

type FrictionSnapshot = Pick<
  ActivityFrictionResolutionContext,
  "homeworkId" | "nodeId" | "itemId" | "artifactHash" | "attemptId" | "device" | "answerVisibility" | "frictionSignal"
> & { latestAttemptId?: string };

type CanonicalFrictionCycle = {
  homeworkId: string;
  domain: string;
  nodes: Array<{
    nodeId: string;
    artifactBinding: null | {
      contractFingerprint: string;
      creativeProvenance?: { designArtifactHash?: string };
    };
  }>;
};

export function verifyActivityFrictionProvenance(input: {
  childId: string;
  sessionId: string;
  snapshot: Partial<FrictionSnapshot>;
  cycle: CanonicalFrictionCycle | null;
}): ActivityFrictionResolutionContext {
  const cycle = input.cycle;
  if (!cycle || cycle.domain !== "math") throw new Error("activity_friction_active_math_cycle_missing");
  if (input.snapshot.homeworkId !== cycle.homeworkId) {
    throw new Error("activity_friction_homework_binding_mismatch");
  }
  const node = cycle.nodes.find((candidate) => candidate.nodeId === input.snapshot.nodeId);
  if (!node?.artifactBinding) throw new Error("activity_friction_node_binding_missing");
  const artifactHash = node.artifactBinding.creativeProvenance?.designArtifactHash
    ?? node.artifactBinding.contractFingerprint;
  if (!artifactHash || input.snapshot.artifactHash !== artifactHash) {
    throw new Error("activity_friction_artifact_binding_mismatch");
  }
  return {
    childId: input.childId,
    companionId: "",
    sessionId: input.sessionId,
    homeworkId: cycle.homeworkId,
    nodeId: node.nodeId,
    itemId: String(input.snapshot.itemId ?? "").trim(),
    artifactHash,
    attemptId: String(input.snapshot.latestAttemptId ?? input.snapshot.attemptId ?? "").trim(),
    device: String(input.snapshot.device ?? "").trim(),
    answerVisibility: input.snapshot.answerVisibility ?? "unknown",
    companionPresence: "collapsed",
    runtimeMode: "preview",
    frictionSignal: String(input.snapshot.frictionSignal ?? "").trim(),
    provenanceAuthority: "server_verified",
  };
}

function requiredProvenance(context: ActivityFrictionResolutionContext): void {
  for (const key of ["childId", "companionId", "sessionId", "homeworkId", "nodeId", "itemId", "artifactHash", "attemptId", "device"] as const) {
    if (!context[key]?.trim()) throw new Error(`activity_friction_missing_provenance:${key}`);
  }
}

function resolutionId(context: ActivityFrictionResolutionContext): string {
  return `friction:${context.sessionId}:${context.nodeId}:${context.itemId}`;
}

export async function resolveActivityFriction(
  input: {
    context: ActivityFrictionResolutionContext;
    decision: ActivityFrictionDecision;
    alreadyAdvanced: boolean;
  },
  deps: ActivityFrictionResolutionDependencies,
): Promise<{ resolutionId: string; advanced: boolean; persisted: boolean; masteryEligible: false }> {
  requiredProvenance(input.context);
  if (input.context.companionPresence !== "summoned") {
    throw new Error("activity_friction_requires_summoned_companion");
  }
  if (input.context.answerVisibility !== "hidden") {
    throw new Error("activity_friction_requires_answer_hidden_item");
  }
  if (input.context.provenanceAuthority !== "server_verified") {
    throw new Error("activity_friction_provenance_unverified");
  }
  if (!input.context.frictionSignal.trim()) throw new Error("activity_friction_signal_required");
  if (!Number.isFinite(input.decision.confidence) || input.decision.confidence < 0 || input.decision.confidence > 1) {
    throw new Error("activity_friction_confidence_invalid");
  }
  if (!input.decision.rationale.trim()) throw new Error("activity_friction_rationale_required");
  const advanced = input.decision.action === "advance_current_item";
  if (advanced && input.alreadyAdvanced) throw new Error("activity_friction_already_advanced");

  // Clarification and alternatives remain ordinary Elli conversation. Only a
  // progression override creates canonical friction evidence or consumes the
  // one-per-item advancement guard.
  if (!advanced) {
    return { resolutionId: resolutionId(input.context), advanced: false, persisted: false, masteryEligible: false };
  }

  const id = resolutionId(input.context);
  const observedErrorType: ActivityFrictionEvidence["observedErrorType"] =
    input.decision.likelyCause === "conceptual"
      ? "conceptual_uncertainty"
      : input.decision.likelyCause === "unknown"
        ? "unresolved"
        : "instrument_ambiguous";
  const evidence: ActivityFrictionEvidence = {
    ...input.decision,
    resolutionId: id,
    childId: input.context.childId,
    companionId: input.context.companionId,
    sessionId: input.context.sessionId,
    homeworkId: input.context.homeworkId,
    nodeId: input.context.nodeId,
    itemId: input.context.itemId,
    artifactHash: input.context.artifactHash,
    device: input.context.device,
    evidenceIds: [input.context.attemptId],
    observedErrorType,
    assistance: "assisted",
    masteryEligible: false,
    correct: undefined,
    uncertainty: "The interaction instrument may not distinguish conceptual understanding from response friction.",
    nextEvidenceNeeded: "Test the same construct later with a fresh, lower-burden response instrument.",
  };

  if (input.context.runtimeMode === "real") {
    await deps.persist(evidence);
  }
  await deps.sendAndConfirm({
    type: "sunny_activity_resolution",
    resolutionId: id,
    action: "advance_current_item",
    nodeId: input.context.nodeId,
    itemId: input.context.itemId,
    supersedesAttemptId: input.context.attemptId,
    observedErrorType: evidence.observedErrorType,
    masteryEligible: false,
  });
  return { resolutionId: id, advanced, persisted: input.context.runtimeMode === "real", masteryEligible: false };
}

export async function persistActivityFrictionEvidence(input: {
  evidence: ActivityFrictionEvidence;
  attemptedValue?: string;
  activityId?: string;
}): Promise<void> {
  const evidence = input.evidence;
  recordCanonicalActivityFriction({
    childId: evidence.childId,
    homeworkId: evidence.homeworkId,
    sessionId: evidence.sessionId,
    nodeId: evidence.nodeId,
    itemId: evidence.itemId,
    resolutionId: evidence.resolutionId,
    attemptedValue: input.attemptedValue,
    likelyCause: evidence.likelyCause,
    confidence: evidence.confidence,
    action: evidence.action,
    observedErrorType: evidence.observedErrorType,
    supportSummary: `Elli assessed ${evidence.likelyCause} and chose ${evidence.action}; confidence=${evidence.confidence.toFixed(2)}.`,
  });
  recordCompanionInteractionEvent({
    childId: evidence.childId,
    companionId: evidence.companionId,
    callSource: "activity_help",
    relationshipState: "selected",
    eventType: "activity_friction_resolved",
    questionText: "",
    companionText: "",
    commandCount: 1,
    visionUsed: false,
    idempotencyKey: evidence.resolutionId,
    activityContext: {
      activityId: input.activityId ?? evidence.nodeId,
      eventType: "activity_friction_resolved",
      homeworkId: evidence.homeworkId,
      sessionId: evidence.sessionId,
      nodeId: evidence.nodeId,
      itemId: evidence.itemId,
      artifactHash: evidence.artifactHash,
      supportType: "friction_resolution",
      likelyCause: evidence.likelyCause,
      confidence: evidence.confidence,
      resolutionAction: evidence.action,
      evidenceIds: evidence.evidenceIds,
      uncertainty: evidence.uncertainty,
      nextEvidenceNeeded: evidence.nextEvidenceNeeded,
    },
  });
  await maybeCompactCompanionInteractionMemory({
    childId: evidence.childId,
    companionId: evidence.companionId,
  }, { minEvents: 1 });
}
import { recordCanonicalActivityFriction } from "../engine/learningCycleRepository";
import {
  maybeCompactCompanionInteractionMemory,
  recordCompanionInteractionEvent,
} from "./companionInteractionMemory";
