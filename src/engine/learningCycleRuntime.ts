import {
  getLearningCycle,
  transitionLearningCycle,
  type LearningCycleEvidenceSummary,
  type LearningCycleRecordV2,
  type LearningCycleRepositoryOptions,
} from "./learningCycleRepository";

export type CanonicalCompletionResult = {
  completed: boolean;
  accuracy: number;
  timeSpent_ms: number;
  targetResults?: Array<{ target: string; correct: boolean; responseTime_ms?: number; scaffoldLevel?: number }>;
  frustrationSignals?: string[];
  replay?: boolean;
  companionInteractions?: string[];
};

export function recordCanonicalNodeCompletion(
  input: {
    childId: string;
    homeworkId: string;
    sessionId: string;
    nodeId: string;
    result: CanonicalCompletionResult;
  },
  opts: LearningCycleRepositoryOptions = {},
): LearningCycleRecordV2 | null {
  const cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle || !input.result.completed) return cycle;
  const evidenceId = `${input.sessionId}:${input.nodeId}:completion`;
  const alreadyRecorded = [
    ...cycle.evidence.academic,
    ...cycle.evidence.engagement,
    ...cycle.evidence.companionObservations,
  ].some((item) => item.evidenceId === evidenceId);
  if (alreadyRecorded) return cycle;
  const node = cycle.nodes.find((candidate) => candidate.nodeId === input.nodeId);
  if (!node) throw new Error(`learning_cycle_node_missing:${input.nodeId}`);
  const accuracy = Math.max(0, Math.min(1, Number(input.result.accuracy) || 0));
  const academicEvidence: LearningCycleEvidenceSummary[] = [{
    evidenceId,
    accuracy,
    summary: `${node.title} completed at ${Math.round(accuracy * 100)}% across ${input.result.targetResults?.length ?? 0} target readings.`,
  }];
  const engagementEvidence: LearningCycleEvidenceSummary[] = [{
    evidenceId: `${evidenceId}:engagement`,
    summary: `${node.title} completed in ${Math.max(0, input.result.timeSpent_ms)}ms; replay=${input.result.replay === true}; frustration=${(input.result.frustrationSignals ?? []).join(",") || "none"}.`,
  }];
  const companionObservations: LearningCycleEvidenceSummary[] = (input.result.companionInteractions ?? []).map((summary, index) => ({
    evidenceId: `${evidenceId}:companion:${index + 1}`,
    summary,
  }));
  const supported = accuracy >= 0.8;
  const decision = {
    status: supported ? "supported" as const : "revised" as const,
    reason: supported
      ? `${node.title} met the current evidence threshold.`
      : `${node.title} completed below the current evidence threshold and requires targeted support.`,
    nextAction: supported ? "Advance when all required evidence is complete." : "Use the result to revise the next challenge.",
  };
  if (node.role === "baseline") {
    return transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
      type: "baseline_completed", nodeId: node.nodeId, academicEvidence, engagementEvidence, companionObservations, decision,
    }, opts);
  }
  if (node.role === "quest") {
    return transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
      type: "quest_completed", nodeId: node.nodeId, academicEvidence, engagementEvidence, companionObservations,
      decision: { ...decision, bossRequired: supported },
    }, opts);
  }
  if (node.role === "boss") {
    return transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
      type: "boss_completed", nodeId: node.nodeId, academicEvidence, engagementEvidence, companionObservations, decision,
    }, opts);
  }
  return cycle;
}
