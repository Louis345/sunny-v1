import type { ChildChart } from "../profiles/childChart";
import type { NodeType } from "../shared/adventureTypes";
import {
  detectBaselineShellGap,
  formatBaselineShellGapMessage,
  resolveBaselineShellMatches,
  type BaselineShellMatch,
} from "./baselineShellGap";
import type { BaselineShellGapRequest } from "./baselineMechanicBrief";

export type BaselinePlannerDecision = {
  decision: "reuse_baseline" | "generate_new" | "revise_existing" | "retire_existing" | "blocked_missing_evidence";
  decisionReason: string;
  evidenceUsed: string[];
  theoryId?: string;
  experimentId?: string;
  gap: BaselineShellGapRequest;
  message: string;
  matchedShells: BaselineShellMatch[];
  preferredNodeTypes: NodeType[];
};

export function planBaselineShellsForHomework(input: {
  chart: ChildChart;
  homeworkId: string;
  domain: string;
  title: string;
  conceptText: string;
}): BaselinePlannerDecision {
  const gap = detectBaselineShellGap({
    chart: input.chart,
    homeworkId: input.homeworkId,
    domain: input.domain,
    title: input.title,
    conceptText: input.conceptText,
  });
  const matchedShells = resolveBaselineShellMatches({ chart: input.chart, gap });
  const preferredNodeTypes = matchedShells.map((shell) => shell.nodeType as NodeType);
  const decision = gap.needsGeneration ? "generate_new" : "reuse_baseline";
  const decisionReason = gap.needsGeneration
    ? `No approved artifact matched ${gap.skillTarget}; generate a domain-valid experiment artifact.`
    : `Approved artifacts matched ${gap.skillTarget}; reuse only when mechanic and evidence contracts match.`;
  const theoryId = input.chart.engagementTheory?.theoryId ?? input.chart.learningProfile.engagementTheory?.theoryId;
  const experimentId = input.chart.activeSessionPlan?.nodePlan.find((node) => node.type === "generated-baseline")?.experimentId;
  return {
    decision,
    decisionReason,
    evidenceUsed: [input.homeworkId, ...matchedShells.map((shell) => shell.contentId).filter(Boolean) as string[]],
    theoryId,
    experimentId,
    gap,
    message: formatBaselineShellGapMessage(gap),
    matchedShells,
    preferredNodeTypes,
  };
}

export function shouldTriggerBaselineGeneration(decision: BaselinePlannerDecision): boolean {
  return decision.gap.needsGeneration;
}
