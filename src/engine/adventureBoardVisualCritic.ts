export type AdventureBoardVisualCriticDecisionInput = {
  plannerConfidence?: number;
  semanticAuditIssues: Array<{ code: string; severity: "error" | "warning" }>;
  choiceOptionCount: number;
  force?: boolean;
};

export type AdventureBoardVisualCriticDecision = {
  shouldRun: boolean;
  reasons: string[];
};

export function shouldRunAdventureBoardVisualCritic(
  input: AdventureBoardVisualCriticDecisionInput,
): AdventureBoardVisualCriticDecision {
  const reasons: string[] = [];
  if (input.force) reasons.push("forced_by_cli");
  if ((input.plannerConfidence ?? 1) < 0.7) reasons.push("planner_confidence_low");
  if (input.semanticAuditIssues.some((issue) => issue.severity === "error")) {
    reasons.push("semantic_audit_failed");
  }
  if (input.choiceOptionCount > 10) reasons.push("complex_choice_graph");
  return {
    shouldRun: reasons.length > 0,
    reasons,
  };
}
