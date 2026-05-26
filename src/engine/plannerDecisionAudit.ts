import type { AssignmentPlannerOutput } from "./assignmentPlanner";
import {
  validateAdventureBoardJson,
  type AdventureBoardValidationIssue,
} from "../shared/adventureBoardValidation";
import type { AdventureBoardNode } from "../shared/adventureBoardJson";

export type PlannerDecisionAuditIssueCode =
  | AdventureBoardValidationIssue["code"]
  | "preference_claims_mastery"
  | "quest_unlocked_without_required_evidence"
  | "boss_unlocked_without_required_evidence";

export type PlannerDecisionAuditIssue = {
  code: PlannerDecisionAuditIssueCode;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
};

export type PlannerDecisionAuditRow = {
  node: string;
  sourceEvidence: string;
  targetPurpose: string;
  activityMode: string;
  algorithmFeed: string;
  expectedSignal: string;
  status: "ok" | "issue";
};

export type PlannerDecisionAudit = {
  rows: PlannerDecisionAuditRow[];
  issues: PlannerDecisionAuditIssue[];
  markdown: string;
};

export function buildPlannerDecisionAudit(output: AssignmentPlannerOutput): PlannerDecisionAudit {
  const board = output.activeSessionPlan.adventureBoard;
  const activityIds = new Set(output.activeSessionPlan.nodePlan.map((node) => node.activityId));
  const boardIssues: PlannerDecisionAuditIssue[] = board
    ? validateAdventureBoardJson(board, activityIds).map((issue) => ({
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
        nodeId: issue.nodeId,
      }))
    : [];
  const semanticIssues = board ? semanticBoardIssues(output, board.nodes) : [];
  const issues = [...boardIssues, ...semanticIssues];
  const issueNodeIds = new Set(issues.map((issue) => issue.nodeId).filter(Boolean));
  const groups = new Map(
    output.assignmentInterpretation.wordGroups.map((group) => [group.id, group]),
  );

  const rows: PlannerDecisionAuditRow[] = output.activeSessionPlan.nodePlan.map((node) => {
    const group = node.targetLane ? groups.get(node.targetLane) : undefined;
    const boardNode = board?.nodes.find((candidate) => candidate.id === node.id);
    return {
      node: node.id,
      sourceEvidence: group?.evidence.join("; ") ?? "assignment/source packet",
      targetPurpose: group?.purpose ?? purposeForBoardNode(boardNode),
      activityMode: activityModeForNode(node),
      algorithmFeed: algorithmFeedForNode(node.activityId, boardNode),
      expectedSignal: expectedSignalForNode(node.activityId, boardNode),
      status: issueNodeIds.has(node.id) ? "issue" : "ok",
    };
  });

  return {
    rows,
    issues,
    markdown: renderPlannerDecisionAuditMarkdown(rows, issues),
  };
}

function semanticBoardIssues(
  output: AssignmentPlannerOutput,
  nodes: AdventureBoardNode[],
): PlannerDecisionAuditIssue[] {
  const issues: PlannerDecisionAuditIssue[] = [];
  for (const node of nodes) {
    if (
      (node.kind === "reward" || node.kind === "choice-gate" || node.kind === "mystery") &&
      node.evidenceRole === "mastery"
    ) {
      issues.push({
        code: "preference_claims_mastery",
        severity: "error",
        nodeId: node.id,
        message: `Preference node ${node.id} claims mastery evidence.`,
      });
    }
  }
  for (const node of output.activeSessionPlan.nodePlan) {
    if (node.activityId === "quest" && !node.locked) {
      issues.push({
        code: "quest_unlocked_without_required_evidence",
        severity: "error",
        nodeId: node.id,
        message: `Quest node ${node.id} is unlocked before baseline evidence can justify generated transfer.`,
      });
    }
    if (node.activityId === "boss" && !node.locked) {
      issues.push({
        code: "boss_unlocked_without_required_evidence",
        severity: "error",
        nodeId: node.id,
        message: `Boss node ${node.id} is unlocked before Quest transfer evidence exists.`,
      });
    }
  }
  return issues;
}

function purposeForBoardNode(node?: AdventureBoardNode): string {
  if (!node) return "unknown";
  if (node.evidenceRole === "preference") return "preference";
  if (node.evidenceRole === "transfer") return "transfer";
  if (node.evidenceRole === "mastery") return "mastery";
  return node.target?.skill ?? "baseline";
}

function activityModeForNode(node: AssignmentPlannerOutput["activeSessionPlan"]["nodePlan"][number]): string {
  if (node.activityId === "word-radar" && node.wordRadarConfig) {
    return `${node.activityId}:${node.wordRadarConfig.recallMode}`;
  }
  return node.activityId;
}

function algorithmFeedForNode(activityId: string, boardNode?: AdventureBoardNode): string {
  if (boardNode?.evidenceRole === "preference" || activityId === "mystery") return "choicePolicy";
  if (activityId === "quest") return "questReadiness";
  if (activityId === "boss") return "masteryGate";
  return "spacedRepetition";
}

function expectedSignalForNode(activityId: string, boardNode?: AdventureBoardNode): string {
  if (boardNode?.evidenceRole === "preference" || activityId === "mystery") {
    return "shown/chosen/skipped/outcome; preference is not mastery";
  }
  if (activityId === "quest") return "transfer result after baseline theory";
  if (activityId === "boss") return "mastery/transfer proof after quest evidence";
  return "target results, retries, skips, help, latency";
}

export function renderPlannerDecisionAuditMarkdown(
  rows: PlannerDecisionAuditRow[],
  issues: PlannerDecisionAuditIssue[],
): string {
  const lines = [
    "| node | source evidence | target purpose | activity/mode | algorithm feed | expected signal | status |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) =>
      `| ${escapeCell(row.node)} | ${escapeCell(row.sourceEvidence)} | ${escapeCell(row.targetPurpose)} | ${escapeCell(row.activityMode)} | ${escapeCell(row.algorithmFeed)} | ${escapeCell(row.expectedSignal)} | ${row.status} |`,
    ),
  ];
  if (issues.length) {
    lines.push("", "Issues:");
    for (const issue of issues) {
      lines.push(`- ${issue.severity}: ${issue.code}${issue.nodeId ? ` (${issue.nodeId})` : ""} — ${issue.message}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
