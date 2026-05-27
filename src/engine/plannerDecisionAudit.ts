import type {
  ActiveSessionPlan,
  GeneratedExperienceBrief,
  PlannedMeasurement,
  PlanTheory,
} from "../context/schemas/learningProfile";

export type PlannerDecisionTargetPurpose =
  | "spell_from_memory"
  | "recognize"
  | "read_fluently"
  | "pronounce"
  | "define"
  | "unknown"
  | "preference"
  | "transfer"
  | "mastery";

export type PlannerDecisionSourceGroup = {
  id: string;
  label: string;
  purpose: PlannerDecisionTargetPurpose;
  words: string[];
  evidence: string[];
};

export type PlannerDecisionAuditInput = {
  childId: string;
  activeSessionPlan: ActiveSessionPlan;
  sourceGroups: PlannerDecisionSourceGroup[];
  planTheory: PlanTheory;
  plannedMeasurements: PlannedMeasurement[];
  generatedExperienceBriefs: GeneratedExperienceBrief[];
  questEvidence: unknown[];
  algorithmFeeds: Array<{
    id: string;
    status: string;
    summary: string;
  }>;
};

export type PlannerDecisionAuditFindingSeverity = "warning" | "blocker";

export type PlannerDecisionAuditFindingCode =
  | "target_purpose_activity_mismatch"
  | "preference_node_as_academic_intervention"
  | "quest_playable_without_validated_artifact"
  | "boss_playable_without_quest_evidence"
  | "missing_support_revise_falsify_criteria";

export type PlannerDecisionAuditFinding = {
  code: PlannerDecisionAuditFindingCode;
  severity: PlannerDecisionAuditFindingSeverity;
  message: string;
  nodeId?: string;
  activityId?: string;
};

export type PlannerDecisionAuditRow = {
  nodeId: string;
  nodeType: ActiveSessionPlan["nodePlan"][number]["type"];
  activityId: string;
  activityMode: string;
  targetPurpose: PlannerDecisionTargetPurpose;
  evidenceRole: "baseline" | "preference" | "transfer" | "mastery";
  sourceEvidence: string[];
  algorithmFeeds: string[];
  expectedSignal: string;
  supportCriteria: string;
  reviseCriteria: string;
  falsifyCriteria: string;
  severity: "ok" | "warning" | "blocker";
  findings: PlannerDecisionAuditFinding[];
};

export type PlannerDecisionAuditReport = {
  childId: string;
  planId: string;
  summary: {
    nodeCount: number;
    warningCount: number;
    blockerCount: number;
  };
  rows: PlannerDecisionAuditRow[];
  reportFindings: PlannerDecisionAuditFinding[];
};

type PlanNode = ActiveSessionPlan["nodePlan"][number];

function key(value: string): string {
  return value.trim().toLowerCase();
}

function nodeTargets(node: PlanNode): Set<string> {
  return new Set(node.targets.map(key).filter(Boolean));
}

function sourceGroupForNode(
  node: PlanNode,
  sourceGroups: PlannerDecisionSourceGroup[],
): PlannerDecisionSourceGroup | undefined {
  if (node.targetLane) {
    const lane = sourceGroups.find((group) => group.id === node.targetLane);
    if (lane) return lane;
  }
  const targets = nodeTargets(node);
  return sourceGroups.find((group) =>
    group.words.length > 0 &&
    group.words.every((word) => targets.has(key(word))));
}

function purposeForNode(
  node: PlanNode,
  group: PlannerDecisionSourceGroup | undefined,
): PlannerDecisionTargetPurpose {
  if (node.type === "mystery") return "preference";
  if (node.type === "quest") return "transfer";
  if (node.type === "boss") return "mastery";
  return group?.purpose ?? "unknown";
}

function roleForPurpose(
  purpose: PlannerDecisionTargetPurpose,
): PlannerDecisionAuditRow["evidenceRole"] {
  if (purpose === "preference") return "preference";
  if (purpose === "transfer") return "transfer";
  if (purpose === "mastery") return "mastery";
  return "baseline";
}

function activityModeForNode(node: PlanNode): string {
  if (node.type === "word-radar" && node.wordRadarConfig) {
    return node.wordRadarConfig.recallMode;
  }
  if (node.type === "mystery") return node.choiceMode ?? "choice_lab";
  if (node.type === "quest" || node.type === "boss") {
    return node.masteryUnlockState ?? (node.locked ? "preparing" : "unlocked");
  }
  return node.activityId;
}

function algorithmFeedsForNode(
  node: PlanNode,
  purpose: PlannerDecisionTargetPurpose,
): string[] {
  if (node.type === "mystery" || purpose === "preference") {
    return ["activity-affinity", "variable-reward"];
  }
  if (node.type === "quest" || purpose === "transfer") {
    return ["retrieval-practice", "desirable-difficulty", "activity-affinity"];
  }
  if (node.type === "boss" || purpose === "mastery") {
    return ["mastery-gating", "retrieval-practice"];
  }
  const feeds = ["retrieval-practice"];
  if (purpose === "spell_from_memory") feeds.push("spaced-repetition");
  if (purpose === "read_fluently" || purpose === "recognize" || purpose === "pronounce") {
    feeds.push("activity-affinity");
  }
  return feeds;
}

function expectedSignalForNode(
  node: PlanNode,
  purpose: PlannerDecisionTargetPurpose,
): string {
  if (node.type === "mystery") {
    return "choice selected, avoided options, replay request, completion, frustration, and sentiment.";
  }
  if (node.type === "quest") {
    return "validated generated transfer artifact with per-target results after baseline evidence.";
  }
  if (node.type === "boss") {
    return "quest-supported mastery gate with independent captured responses.";
  }
  if (node.type === "word-radar" && node.wordRadarConfig?.recallMode === "visible_read") {
    return "visible read response with captured pronunciation/recognition signal, hesitation, and completion.";
  }
  if (node.type === "word-radar") {
    return "scaffolded target response, misses, retries, help requests, and completion.";
  }
  if (node.type === "spell-check") {
    return "hidden spelling-production attempt with per-target correctness and retry evidence.";
  }
  if (purpose === "read_fluently") {
    return "fluent reading, hesitation, recovery, and low-friction completion.";
  }
  return "per-target result, completion, accuracy, pacing, help, and frustration evidence.";
}

function plannedMeasurementForNode(
  node: PlanNode,
  measurements: PlannedMeasurement[],
): PlannedMeasurement | undefined {
  return measurements.find((measurement) =>
    measurement.id === `measure-${node.id}` ||
    measurement.id.includes(node.id) ||
    measurement.activityId === node.activityId && (
      node.targetLane == null ||
      measurement.target === node.targetLane ||
      measurement.target.includes(node.targetLane)
    ));
}

function criteriaForNode(
  node: PlanNode,
  measurements: PlannedMeasurement[],
): Pick<PlannerDecisionAuditRow, "supportCriteria" | "reviseCriteria" | "falsifyCriteria"> {
  const measurement = plannedMeasurementForNode(node, measurements);
  return {
    supportCriteria: measurement?.supportCriteria ?? "",
    reviseCriteria: measurement?.reviseCriteria ?? "",
    falsifyCriteria: measurement?.falsifyCriteria ?? "",
  };
}

function targetPurposeMismatch(
  node: PlanNode,
  purpose: PlannerDecisionTargetPurpose,
): PlannerDecisionAuditFinding | null {
  const fluencyPurpose =
    purpose === "recognize" ||
    purpose === "read_fluently" ||
    purpose === "pronounce";
  if (fluencyPurpose && node.activityId === "spell-check") {
    return {
      code: "target_purpose_activity_mismatch",
      severity: "warning",
      nodeId: node.id,
      activityId: node.activityId,
      message: `${node.activityId} measures spelling production, but ${purpose} asks for recognition or fluency evidence.`,
    };
  }
  return null;
}

function missingCriteriaFinding(
  node: PlanNode,
  criteria: Pick<PlannerDecisionAuditRow, "supportCriteria" | "reviseCriteria" | "falsifyCriteria">,
): PlannerDecisionAuditFinding | null {
  if (criteria.supportCriteria && criteria.reviseCriteria && criteria.falsifyCriteria) {
    return null;
  }
  return {
    code: "missing_support_revise_falsify_criteria",
    severity: "blocker",
    nodeId: node.id,
    activityId: node.activityId,
    message: `Node ${node.id} is missing support, revise, or falsify criteria.`,
  };
}

function hasValidatedQuestBrief(briefs: GeneratedExperienceBrief[]): boolean {
  return briefs.some((brief) =>
    brief.kind === "quest" &&
    (brief.artifactStatus === "validated" || brief.artifactStatus === "generated"));
}

function gateFindingForNode(
  node: PlanNode,
  input: PlannerDecisionAuditInput,
): PlannerDecisionAuditFinding | null {
  const playable = node.locked === false || node.masteryUnlockState === "unlocked";
  if (node.type === "quest" && playable && !hasValidatedQuestBrief(input.generatedExperienceBriefs)) {
    return {
      code: "quest_playable_without_validated_artifact",
      severity: "blocker",
      nodeId: node.id,
      activityId: node.activityId,
      message: "Quest cannot be playable before a generated artifact has passed validation.",
    };
  }
  if (node.type === "boss" && playable && input.questEvidence.length === 0) {
    return {
      code: "boss_playable_without_quest_evidence",
      severity: "blocker",
      nodeId: node.id,
      activityId: node.activityId,
      message: "Boss cannot be playable before Quest evidence supports a mastery gate.",
    };
  }
  return null;
}

function severityForFindings(findings: PlannerDecisionAuditFinding[]): PlannerDecisionAuditRow["severity"] {
  if (findings.some((finding) => finding.severity === "blocker")) return "blocker";
  if (findings.some((finding) => finding.severity === "warning")) return "warning";
  return "ok";
}

function reportLevelFindings(input: PlannerDecisionAuditInput): PlannerDecisionAuditFinding[] {
  const intervention = input.planTheory.intervention.toLowerCase();
  const namesPreferenceNode =
    /\bmystery\b/.test(intervention) ||
    /\bvariable[- ]reward\b/.test(intervention) ||
    /\bpreference\b/.test(intervention);
  const namesAcademicAction =
    /\bteach|learn|intervention|spelling pattern|mastery|transfer\b/.test(intervention);
  if (!namesPreferenceNode || !namesAcademicAction) return [];
  return [{
    code: "preference_node_as_academic_intervention",
    severity: "blocker",
    message: "Preference/reward nodes can inform the planner, but cannot be the academic intervention.",
  }];
}

export function auditPlannerDecisions(
  input: PlannerDecisionAuditInput,
): PlannerDecisionAuditReport {
  const rows = input.activeSessionPlan.nodePlan.map((node) => {
    const group = sourceGroupForNode(node, input.sourceGroups);
    const targetPurpose = purposeForNode(node, group);
    const criteria = criteriaForNode(node, input.plannedMeasurements);
    const findings = [
      targetPurposeMismatch(node, targetPurpose),
      gateFindingForNode(node, input),
      missingCriteriaFinding(node, criteria),
    ].filter((finding): finding is PlannerDecisionAuditFinding => finding != null);

    return {
      nodeId: node.id,
      nodeType: node.type,
      activityId: node.activityId,
      activityMode: activityModeForNode(node),
      targetPurpose,
      evidenceRole: roleForPurpose(targetPurpose),
      sourceEvidence: group?.evidence ?? input.activeSessionPlan.evidenceUsed.map((item) => item.summary),
      algorithmFeeds: algorithmFeedsForNode(node, targetPurpose),
      expectedSignal: expectedSignalForNode(node, targetPurpose),
      ...criteria,
      severity: severityForFindings(findings),
      findings,
    };
  });
  const reportFindings = [
    ...reportLevelFindings(input),
    ...rows.flatMap((row) => row.findings),
  ];
  return {
    childId: input.childId,
    planId: input.activeSessionPlan.planId,
    summary: {
      nodeCount: rows.length,
      warningCount: reportFindings.filter((finding) => finding.severity === "warning").length,
      blockerCount: reportFindings.filter((finding) => finding.severity === "blocker").length,
    },
    rows,
    reportFindings,
  };
}
