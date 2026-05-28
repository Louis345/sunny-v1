import type { AssignmentPlannerOutput, AssignmentPlannerTelemetry } from "./assignmentPlanner";
import {
  evidenceContractForPlannerNode,
  type ActivityEvidenceContract,
  type ActivityEvidenceRole,
  type ActivityProofStrength,
} from "./activityEvidenceContract";

type PlannerNode = AssignmentPlannerOutput["activeSessionPlan"]["nodePlan"][number];

export type PlannerScenarioPreflight = {
  status: "pass" | "warn" | "fail";
  issues: Array<{ code?: string; message: string; severity?: string }>;
};

export type PlannerScenarioRun = {
  scenarioId: string;
  childId: string;
  model: string;
  batchId?: string;
  createdAt?: string;
  latencyMs?: number;
  telemetry?: Partial<AssignmentPlannerTelemetry>;
  tokenEstimate?: {
    inputTokens: number;
    outputTokens: number;
  };
  expectedEvidenceTerms?: string[];
  scenarioExpectations?: PlannerScenarioExpectations;
  preflight?: PlannerScenarioPreflight;
  output: AssignmentPlannerOutput;
};

export type PlannerScenarioExpectations = {
  requiredActivities?: string[];
  requiredEvidenceRoles?: ActivityEvidenceRole[];
  forbiddenEvidenceRoles?: ActivityEvidenceRole[];
  requiredProofStrengths?: ActivityProofStrength[];
  discouragedActivities?: string[];
  discouragedFirstActivities?: string[];
  expectedWordRadarModes?: string[];
  forbiddenWordRadarModes?: string[];
  expectedTargetLanes?: string[];
  missingInstrumentSignals?: string[];
  maximumAcademicNodeCount?: number;
};

export type PlannerScenarioRunSummary = {
  scenarioId: string;
  childId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number | null;
  nodeCount: number;
  nodeMix: Record<string, number>;
  evidenceRoles: string[];
  proofStrengths: string[];
  wordRadarModes: string[];
  targetLanes: string[];
  routeChoiceCount: number;
  mysteryStatus: "missing" | "available" | "locked" | "preview";
  questStatus: "missing" | "available" | "locked" | "preview";
  bossStatus: "missing" | "available" | "locked" | "preview";
  adventureSpineComplete: boolean;
  preflightStatus: PlannerScenarioPreflight["status"];
  evidenceMatches: string[];
  learningSignature: string;
};

export type PlannerScenarioComparison = {
  scenarioId: string;
  childIds: string[];
  learningRelevantDifferenceCount: number;
  collapsed: boolean;
};

export type PlannerScenarioLabFailure = {
  code:
    | "adventure_spine_missing"
    | "child_plans_collapsed"
    | "child_difference_not_evidence_tied"
    | "preflight_failed"
    | "expected_instrument_missing"
    | "unsafe_first_instrument"
    | "word_radar_mode_mismatch"
    | "missing_activity_gap_not_reported"
    | "redundant_baseline_for_mastered_targets"
    | "mastery_shortcut";
  scenarioId: string;
  childId?: string;
  message: string;
};

export type PlannerScenarioInstrumentFinding = {
  status: "pass" | "fail";
  code: PlannerScenarioLabFailure["code"] | "scenario_expectations_met";
  scenarioId: string;
  childId: string;
  message: string;
};

export type PlannerScenarioLabReport = {
  pass: boolean;
  failures: PlannerScenarioLabFailure[];
  runSummaries: PlannerScenarioRunSummary[];
  comparisons: PlannerScenarioComparison[];
  instrumentFindings: PlannerScenarioInstrumentFinding[];
  markdown: string;
};

export type PlannerScenarioBatchMetadata = {
  batchId: string;
  scenarioId?: string;
  model: string;
  createdAt: string;
  promptVersion: string;
  runCount: number;
  pass: boolean;
  totalEstimatedCostUsd: number;
  totalLatencyMs: number;
  childIds: string[];
  runPaths: string[];
};

export type PlannerScenarioQualityScore = {
  score: number;
  maxScore: number;
  percent: number;
};

export type PlannerScenarioChildComparison = {
  childId: string;
  baselineScore: PlannerScenarioQualityScore;
  candidateScore: PlannerScenarioQualityScore;
  scoreDelta: number;
  fixedFailures: PlannerScenarioLabFailure[];
  newFailures: PlannerScenarioLabFailure[];
  baselineNodeMix: Record<string, number>;
  candidateNodeMix: Record<string, number>;
  baselineWordRadarModes: string[];
  candidateWordRadarModes: string[];
  baselineEvidenceRoles: string[];
  candidateEvidenceRoles: string[];
  baselineCostUsd: number;
  candidateCostUsd: number;
  baselineLatencyMs: number | null;
  candidateLatencyMs: number | null;
};

export type PlannerScenarioRunSetComparison = {
  scenarioId: string;
  baselineLabel: string;
  candidateLabel: string;
  status: "improved" | "regressed" | "mixed" | "unchanged";
  baselineScore: PlannerScenarioQualityScore;
  candidateScore: PlannerScenarioQualityScore;
  scoreDelta: number;
  baselineTotalCostUsd: number;
  candidateTotalCostUsd: number;
  baselineTotalLatencyMs: number;
  candidateTotalLatencyMs: number;
  fixedFailures: PlannerScenarioLabFailure[];
  newFailures: PlannerScenarioLabFailure[];
  childComparisons: PlannerScenarioChildComparison[];
  baselineReport: PlannerScenarioLabReport;
  candidateReport: PlannerScenarioLabReport;
  markdown: string;
};

export type PlannerScenarioPaidFixtureSummary = {
  scenarioId: string;
  childId?: string;
  estimatedCostUsd?: number;
};

type CostRate = {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
};

export const DEFAULT_BASELINE_PLANNER_MODEL = "claude-sonnet-4-5";
export const DEFAULT_STRONGER_PLANNER_MODEL = "claude-opus-4-5";

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function slug(value: string): string {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function statusForNode(node?: { state?: string; locked?: boolean; masteryUnlockState?: string }): PlannerScenarioRunSummary["mysteryStatus"] {
  if (!node) return "missing";
  if (node.state === "preview" || node.masteryUnlockState === "preparing") return "preview";
  if (node.state === "locked" || node.locked === true) return "locked";
  return "available";
}

function costRateForModel(model: string): CostRate {
  const name = normalize(model);
  if (name.includes("haiku")) return { inputUsdPerMTok: 1, outputUsdPerMTok: 5 };
  if (name.includes("opus-4-1") || name.includes("opus-4.1") || name === "claude-opus-4") {
    return { inputUsdPerMTok: 15, outputUsdPerMTok: 75 };
  }
  if (name.includes("opus")) return { inputUsdPerMTok: 5, outputUsdPerMTok: 25 };
  return { inputUsdPerMTok: 3, outputUsdPerMTok: 15 };
}

export function estimatePlannerCostUsd(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  const rate = costRateForModel(args.model);
  const cost =
    (Math.max(0, args.inputTokens) / 1_000_000) * rate.inputUsdPerMTok +
    (Math.max(0, args.outputTokens) / 1_000_000) * rate.outputUsdPerMTok;
  return Math.round(cost * 100_000) / 100_000;
}

function usageTokens(run: PlannerScenarioRun): { inputTokens: number; outputTokens: number } {
  const usage = run.telemetry?.usage as
    | {
        inputTokens?: number;
        outputTokens?: number;
        input_tokens?: number;
        output_tokens?: number;
      }
    | undefined;
  return {
    inputTokens: usage?.inputTokens ?? usage?.input_tokens ?? run.tokenEstimate?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? usage?.output_tokens ?? run.tokenEstimate?.outputTokens ?? 0,
  };
}

function nodeActivity(node: PlannerNode): string {
  return node.activityId || node.type;
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) {
    out[value] = (out[value] ?? 0) + 1;
  }
  return out;
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
    .sort();
}

function nonAcademicActivity(activityId: string | undefined, type: string | undefined): boolean {
  const value = normalize(activityId || type);
  return value === "start" || value === "mystery" || value === "quest" || value === "boss";
}

function wordRadarMode(node: PlannerNode): string | null {
  if (node.activityId !== "word-radar" && node.type !== "word-radar") return null;
  if (!node.wordRadarConfig) return "missing-config";
  return `${node.wordRadarConfig.recallMode}/${node.wordRadarConfig.inputMode}`;
}

function evidenceContractsForRun(run: PlannerScenarioRun): ActivityEvidenceContract[] {
  return academicNodes(run)
    .map(evidenceContractForPlannerNode)
    .filter((contract): contract is ActivityEvidenceContract => Boolean(contract));
}

function academicNodes(run: PlannerScenarioRun): PlannerNode[] {
  return run.output.activeSessionPlan.nodePlan
    .filter((node) => !nonAcademicActivity(node.activityId, node.type));
}

function evidenceText(output: AssignmentPlannerOutput): string {
  const plan = output.activeSessionPlan;
  return [
    output.planTheory?.hypothesis,
    output.planTheory?.intervention,
    ...(output.planTheory?.evidenceSummary ?? []),
    ...(output.reviewQuestions ?? []),
    plan.planTheory?.hypothesis,
    plan.planTheory?.intervention,
    ...(plan.planTheory?.evidenceSummary ?? []),
    ...(plan.evidenceUsed ?? []).map((item) => item.summary),
  ].join(" ").toLowerCase();
}

function evidenceMatches(run: PlannerScenarioRun): string[] {
  const text = evidenceText(run.output);
  return (run.expectedEvidenceTerms ?? []).filter((term) => text.includes(normalize(term)));
}

function learningSignature(run: PlannerScenarioRun): string {
  const plan = run.output.activeSessionPlan;
  const board = plan.adventureBoard;
  const nodeSignature = plan.nodePlan.map((node) => ({
    type: node.type,
    activityId: node.activityId,
    targetLane: node.targetLane ?? null,
    targets: [...(node.targets ?? [])].map(normalize).sort(),
    locked: node.locked === true,
    recallMode: node.wordRadarConfig?.recallMode ?? null,
    inputMode: node.wordRadarConfig?.inputMode ?? null,
  }));
  const choices = (board?.choiceSets ?? []).map((choiceSet) => ({
    kind: choiceSet.kind,
    optionTargets: choiceSet.options.map((option) => option.nodeId ?? option.id).sort(),
  }));
  return JSON.stringify({ nodeSignature, choices });
}

function adventureStatus(run: PlannerScenarioRun, kind: "mystery" | "quest" | "boss"): PlannerScenarioRunSummary["mysteryStatus"] {
  const planNode = run.output.activeSessionPlan.nodePlan.find((node) => node.type === kind || node.activityId === kind);
  const boardNode = run.output.activeSessionPlan.adventureBoard?.nodes.find((node) => node.kind === kind || node.activityId === kind);
  return statusForNode(boardNode ?? planNode);
}

function hasRouteChoice(run: PlannerScenarioRun): boolean {
  return (run.output.activeSessionPlan.adventureBoard?.choiceSets ?? [])
    .some((choiceSet) => choiceSet.kind === "baseline-route" && choiceSet.options.length >= 2);
}

export function summarizePlannerScenarioRun(run: PlannerScenarioRun): PlannerScenarioRunSummary {
  const plan = run.output.activeSessionPlan;
  const nodes = plan.nodePlan;
  const { inputTokens, outputTokens } = usageTokens(run);
  const wordRadarModes = uniqueSorted(nodes
    .filter((node) => node.activityId === "word-radar" || node.type === "word-radar")
    .map((node) =>
      node.wordRadarConfig
        ? `${node.wordRadarConfig.recallMode}/${node.wordRadarConfig.inputMode}`
        : "missing-config"
    ));
  const targetLanes = uniqueSorted(nodes.map((node) => node.targetLane));
  const evidenceContracts = evidenceContractsForRun(run);
  const evidenceRoles = uniqueSorted(evidenceContracts.map((contract) => contract.evidenceRole));
  const proofStrengths = uniqueSorted(evidenceContracts.map((contract) => contract.proofStrength));
  const mysteryStatus = adventureStatus(run, "mystery");
  const questStatus = adventureStatus(run, "quest");
  const bossStatus = adventureStatus(run, "boss");
  const routeChoiceCount = (plan.adventureBoard?.choiceSets ?? [])
    .filter((choiceSet) => choiceSet.kind === "baseline-route").length;
  return {
    scenarioId: run.scenarioId,
    childId: run.childId,
    model: run.telemetry?.model ?? run.model,
    inputTokens,
    outputTokens,
    estimatedCostUsd: estimatePlannerCostUsd({
      model: run.telemetry?.model ?? run.model,
      inputTokens,
      outputTokens,
    }),
    latencyMs: run.telemetry?.latencyMs ?? run.latencyMs ?? null,
    nodeCount: nodes.length,
    nodeMix: countBy(nodes.map(nodeActivity)),
    evidenceRoles,
    proofStrengths,
    wordRadarModes,
    targetLanes,
    routeChoiceCount,
    mysteryStatus,
    questStatus,
    bossStatus,
    adventureSpineComplete:
      mysteryStatus !== "missing" &&
      questStatus !== "missing" &&
      questStatus !== "available" &&
      bossStatus !== "missing" &&
      bossStatus !== "available" &&
      hasRouteChoice(run),
    preflightStatus: run.preflight?.status ?? "pass",
    evidenceMatches: evidenceMatches(run),
    learningSignature: learningSignature(run),
  };
}

function inspectScenarioExpectations(run: PlannerScenarioRun): PlannerScenarioInstrumentFinding[] {
  const expectations = run.scenarioExpectations;
  if (!expectations) return [];

  const findings: PlannerScenarioInstrumentFinding[] = [];
  const nodes = academicNodes(run);
  const activities = new Set(nodes.map((node) => normalize(nodeActivity(node))));
  const firstActivity = nodes[0] ? normalize(nodeActivity(nodes[0])) : "";
  const modes = new Set(nodes.map(wordRadarMode).filter((mode): mode is string => Boolean(mode)));
  const evidenceContracts = nodes
    .map(evidenceContractForPlannerNode)
    .filter((contract): contract is ActivityEvidenceContract => Boolean(contract));
  const evidenceRoles = new Set(evidenceContracts.map((contract) => contract.evidenceRole));
  const proofStrengths = new Set(evidenceContracts.map((contract) => contract.proofStrength));
  const targetLanes = new Set(nodes.map((node) => normalize(node.targetLane)).filter(Boolean));

  for (const activity of expectations.requiredActivities ?? []) {
    if (!activities.has(normalize(activity))) {
      findings.push({
        status: "fail",
        code: "expected_instrument_missing",
        scenarioId: run.scenarioId,
        childId: run.childId,
        message: `Expected academic instrument ${activity} was not selected.`,
      });
    }
  }

  for (const evidenceRole of expectations.requiredEvidenceRoles ?? []) {
    if (!evidenceRoles.has(evidenceRole)) {
      findings.push({
        status: "fail",
        code: "expected_instrument_missing",
        scenarioId: run.scenarioId,
        childId: run.childId,
        message: `Expected evidence role ${evidenceRole} was not represented.`,
      });
    }
  }

  for (const evidenceRole of expectations.forbiddenEvidenceRoles ?? []) {
    if (evidenceRoles.has(evidenceRole)) {
      findings.push({
        status: "fail",
        code: "expected_instrument_missing",
        scenarioId: run.scenarioId,
        childId: run.childId,
        message: `Forbidden evidence role ${evidenceRole} appeared in the plan.`,
      });
    }
  }

  for (const proofStrength of expectations.requiredProofStrengths ?? []) {
    if (!proofStrengths.has(proofStrength)) {
      findings.push({
        status: "fail",
        code: "expected_instrument_missing",
        scenarioId: run.scenarioId,
        childId: run.childId,
        message: `Expected proof strength ${proofStrength} was not represented.`,
      });
    }
  }

  for (const lane of expectations.expectedTargetLanes ?? []) {
    if (!targetLanes.has(normalize(lane))) {
      findings.push({
        status: "fail",
        code: "expected_instrument_missing",
        scenarioId: run.scenarioId,
        childId: run.childId,
        message: `Expected target lane ${lane} was not represented.`,
      });
    }
  }

  for (const activity of expectations.discouragedFirstActivities ?? []) {
    if (firstActivity && firstActivity === normalize(activity)) {
      findings.push({
        status: "fail",
        code: "unsafe_first_instrument",
        scenarioId: run.scenarioId,
        childId: run.childId,
        message: `First academic instrument ${activity} conflicts with this learner scenario.`,
      });
    }
  }

  const discouragedActivities = (expectations.discouragedActivities ?? [])
    .filter((activity) => activities.has(normalize(activity)));
  if (discouragedActivities.length > 0) {
    findings.push({
      status: "fail",
      code: "redundant_baseline_for_mastered_targets",
      scenarioId: run.scenarioId,
      childId: run.childId,
      message: `Discouraged scaffolding appeared in the plan: ${discouragedActivities.join(", ")}.`,
    });
  }

  if (
    typeof expectations.maximumAcademicNodeCount === "number" &&
    nodes.length > expectations.maximumAcademicNodeCount
  ) {
    findings.push({
      status: "fail",
      code: "redundant_baseline_for_mastered_targets",
      scenarioId: run.scenarioId,
      childId: run.childId,
      message: `Expected at most ${expectations.maximumAcademicNodeCount} academic nodes, saw ${nodes.length}.`,
    });
  }

  for (const mode of expectations.expectedWordRadarModes ?? []) {
    if (!modes.has(mode)) {
      findings.push({
        status: "fail",
        code: "word_radar_mode_mismatch",
        scenarioId: run.scenarioId,
        childId: run.childId,
        message: `Expected Word Radar mode ${mode} was not selected.`,
      });
    }
  }

  for (const mode of expectations.forbiddenWordRadarModes ?? []) {
    if (modes.has(mode)) {
      findings.push({
        status: "fail",
        code: "word_radar_mode_mismatch",
        scenarioId: run.scenarioId,
        childId: run.childId,
        message: `Forbidden Word Radar mode ${mode} was selected.`,
      });
    }
  }

  for (const signal of expectations.missingInstrumentSignals ?? []) {
    findings.push({
      status: "fail",
      code: "missing_activity_gap_not_reported",
      scenarioId: run.scenarioId,
      childId: run.childId,
      message: `Scenario exposes unsupported or unproven instrument signal: ${signal}.`,
    });
  }

  if (findings.length === 0) {
    findings.push({
      status: "pass",
      code: "scenario_expectations_met",
      scenarioId: run.scenarioId,
      childId: run.childId,
      message: "Planner output matched the scenario's instrument expectations.",
    });
  }

  return findings;
}

function compareScenarioRuns(scenarioId: string, summaries: PlannerScenarioRunSummary[]): PlannerScenarioComparison {
  const signatures = new Set(summaries.map((summary) => summary.learningSignature));
  return {
    scenarioId,
    childIds: summaries.map((summary) => summary.childId).sort(),
    learningRelevantDifferenceCount: signatures.size,
    collapsed: summaries.length > 1 && signatures.size === 1,
  };
}

function renderMarkdown(report: Omit<PlannerScenarioLabReport, "markdown">): string {
  const lines = [
    "# Planner Scenario Lab",
    "",
    `status: ${report.pass ? "pass" : "fail"}`,
    "",
    "## Runs",
    "",
    "| scenario | child | model | input_tokens | output_tokens | estimated_cost_usd | latency_ms | nodes | node_mix | word_radar_modes | target_lanes | mystery | quest | boss | routes | preflight | evidence_matches |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- | ---: | --- | --- |",
  ];
  for (const summary of report.runSummaries) {
    lines.push([
      summary.scenarioId,
      summary.childId,
      summary.model,
      summary.inputTokens,
      summary.outputTokens,
      summary.estimatedCostUsd.toFixed(5),
      summary.latencyMs ?? "unknown",
      summary.nodeCount,
      Object.entries(summary.nodeMix).map(([key, count]) => `${key}:${count}`).join(", ") || "none",
      summary.wordRadarModes.join(", ") || "none",
      summary.targetLanes.join(", ") || "none",
      summary.mysteryStatus,
      summary.questStatus,
      summary.bossStatus,
      summary.routeChoiceCount,
      summary.preflightStatus,
      summary.evidenceMatches.join(", ") || "none",
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("", "## Comparisons", "");
  if (report.comparisons.length === 0) {
    lines.push("- none");
  } else {
    for (const comparison of report.comparisons) {
      lines.push(
        `- ${comparison.scenarioId}: ${comparison.childIds.join(" vs ")} difference_count=${comparison.learningRelevantDifferenceCount} collapsed=${comparison.collapsed}`,
      );
    }
  }
  lines.push("", "## Instrument QA", "");
  if (report.instrumentFindings.length === 0) {
    lines.push("- none");
  } else {
    for (const finding of report.instrumentFindings) {
      lines.push(
        `- ${finding.status} [${finding.code}] ${finding.scenarioId}/${finding.childId}: ${finding.message}`,
      );
    }
  }
  lines.push("", "## Failures", "");
  if (report.failures.length === 0) {
    lines.push("- none");
  } else {
    for (const failure of report.failures) {
      lines.push(`- [${failure.code}] ${failure.scenarioId}${failure.childId ? `/${failure.childId}` : ""}: ${failure.message}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function failureKey(failure: PlannerScenarioLabFailure): string {
  return [
    failure.scenarioId,
    failure.childId ?? "",
    failure.code,
    failure.message,
  ].join("|");
}

function failuresForChild(report: PlannerScenarioLabReport, childId: string): PlannerScenarioLabFailure[] {
  return report.failures.filter((failure) => (failure.childId ?? childId) === childId);
}

function diffFailures(
  baseline: PlannerScenarioLabFailure[],
  candidate: PlannerScenarioLabFailure[],
): { fixedFailures: PlannerScenarioLabFailure[]; newFailures: PlannerScenarioLabFailure[] } {
  const baselineKeys = new Set(baseline.map(failureKey));
  const candidateKeys = new Set(candidate.map(failureKey));
  return {
    fixedFailures: baseline.filter((failure) => !candidateKeys.has(failureKey(failure))),
    newFailures: candidate.filter((failure) => !baselineKeys.has(failureKey(failure))),
  };
}

function qualityScoreForRun(
  run: PlannerScenarioRun,
  summary: PlannerScenarioRunSummary,
  childFailures: PlannerScenarioLabFailure[],
  childFindings: PlannerScenarioInstrumentFinding[],
): PlannerScenarioQualityScore {
  let score = 0;
  const maxScore = 6;
  if (summary.preflightStatus !== "fail") score += 1;
  if (summary.adventureSpineComplete) score += 1;
  if (!childFindings.some((finding) => finding.status === "fail")) score += 1;
  if (!childFailures.some((failure) => failure.code === "unsafe_first_instrument")) score += 1;
  if (!run.expectedEvidenceTerms?.length || summary.evidenceMatches.length > 0) score += 1;
  if (summary.questStatus !== "available" && summary.bossStatus !== "available") score += 1;
  return {
    score,
    maxScore,
    percent: Math.round((score / maxScore) * 10_000) / 100,
  };
}

function qualityScoreForReport(
  runs: PlannerScenarioRun[],
  report: PlannerScenarioLabReport,
): PlannerScenarioQualityScore {
  const bySummary = new Map(report.runSummaries.map((summary) => [summary.childId, summary]));
  let score = 0;
  let maxScore = 0;
  for (const run of runs) {
    const summary = bySummary.get(run.childId);
    if (!summary) continue;
    const childScore = qualityScoreForRun(
      run,
      summary,
      failuresForChild(report, run.childId),
      report.instrumentFindings.filter((finding) => finding.childId === run.childId),
    );
    score += childScore.score;
    maxScore += childScore.maxScore;
  }
  return {
    score,
    maxScore,
    percent: maxScore > 0 ? Math.round((score / maxScore) * 10_000) / 100 : 0,
  };
}

function sumCost(summaries: PlannerScenarioRunSummary[]): number {
  return Math.round(summaries.reduce((sum, summary) => sum + summary.estimatedCostUsd, 0) * 100_000) / 100_000;
}

function sumLatency(summaries: PlannerScenarioRunSummary[]): number {
  return summaries.reduce((sum, summary) => sum + Math.max(0, summary.latencyMs ?? 0), 0);
}

function comparisonStatus(args: {
  scoreDelta: number;
  fixedFailures: PlannerScenarioLabFailure[];
  newFailures: PlannerScenarioLabFailure[];
}): PlannerScenarioRunSetComparison["status"] {
  if (args.newFailures.length > 0 && args.scoreDelta < 0) return "regressed";
  if (args.newFailures.length > 0 && args.fixedFailures.length > 0) return "mixed";
  if (args.newFailures.length > 0) return "regressed";
  if (args.scoreDelta > 0 || args.fixedFailures.length > 0) return "improved";
  if (args.scoreDelta < 0) return "regressed";
  return "unchanged";
}

function renderComparisonMarkdown(comparison: Omit<PlannerScenarioRunSetComparison, "markdown">): string {
  const lines = [
    "# Planner Scenario Comparison",
    "",
    `scenario: ${comparison.scenarioId}`,
    `baseline: ${comparison.baselineLabel}`,
    `candidate: ${comparison.candidateLabel}`,
    `status: ${comparison.status}`,
    `score: ${comparison.baselineScore.score}/${comparison.baselineScore.maxScore} -> ${comparison.candidateScore.score}/${comparison.candidateScore.maxScore} (${comparison.scoreDelta >= 0 ? "+" : ""}${comparison.scoreDelta})`,
    `cost_usd: ${comparison.baselineTotalCostUsd.toFixed(5)} -> ${comparison.candidateTotalCostUsd.toFixed(5)}`,
    `latency_ms: ${comparison.baselineTotalLatencyMs} -> ${comparison.candidateTotalLatencyMs}`,
    "",
    "## By Child",
    "",
    "| child | score_delta | fixed | new | baseline_mix | candidate_mix | baseline_roles | candidate_roles | baseline_word_radar | candidate_word_radar |",
    "| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const child of comparison.childComparisons) {
    lines.push([
      child.childId,
      child.scoreDelta >= 0 ? `+${child.scoreDelta}` : String(child.scoreDelta),
      child.fixedFailures.map((failure) => failure.code).join(", ") || "none",
      child.newFailures.map((failure) => failure.code).join(", ") || "none",
      Object.entries(child.baselineNodeMix).map(([key, count]) => `${key}:${count}`).join(", ") || "none",
      Object.entries(child.candidateNodeMix).map(([key, count]) => `${key}:${count}`).join(", ") || "none",
      child.baselineEvidenceRoles.join(", ") || "none",
      child.candidateEvidenceRoles.join(", ") || "none",
      child.baselineWordRadarModes.join(", ") || "none",
      child.candidateWordRadarModes.join(", ") || "none",
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("", "## Fixed Failures", "");
  if (comparison.fixedFailures.length === 0) {
    lines.push("- none");
  } else {
    for (const failure of comparison.fixedFailures) {
      lines.push(`- [${failure.code}] ${failure.childId ?? "scenario"}: ${failure.message}`);
    }
  }
  lines.push("", "## New Failures", "");
  if (comparison.newFailures.length === 0) {
    lines.push("- none");
  } else {
    for (const failure of comparison.newFailures) {
      lines.push(`- [${failure.code}] ${failure.childId ?? "scenario"}: ${failure.message}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function buildPlannerScenarioLabReport(runs: PlannerScenarioRun[]): PlannerScenarioLabReport {
  const runSummaries = runs.map(summarizePlannerScenarioRun);
  const instrumentFindings = runs.flatMap(inspectScenarioExpectations);
  const failures: PlannerScenarioLabFailure[] = [];
  for (const summary of runSummaries) {
    if (!summary.adventureSpineComplete) {
      failures.push({
        code: "adventure_spine_missing",
        scenarioId: summary.scenarioId,
        childId: summary.childId,
        message: "Planner omitted a complete route/Mystery/locked Quest/locked Boss adventure spine.",
      });
    }
    if (summary.preflightStatus === "fail") {
      failures.push({
        code: "preflight_failed",
        scenarioId: summary.scenarioId,
        childId: summary.childId,
        message: "Planner run preflight failed.",
      });
    }
    if (summary.questStatus === "available" || summary.bossStatus === "available") {
      failures.push({
        code: "mastery_shortcut",
        scenarioId: summary.scenarioId,
        childId: summary.childId,
        message: "Quest or Boss was available before baseline/quest evidence could gate mastery.",
      });
    }
    const run = runs.find((candidate) =>
      candidate.scenarioId === summary.scenarioId && candidate.childId === summary.childId
    );
    if (run?.expectedEvidenceTerms?.length && summary.evidenceMatches.length === 0) {
      failures.push({
        code: "child_difference_not_evidence_tied",
        scenarioId: summary.scenarioId,
        childId: summary.childId,
        message: `Planner did not cite expected chart evidence: ${run.expectedEvidenceTerms.join(", ")}.`,
      });
    }
  }

  for (const finding of instrumentFindings) {
    if (finding.status === "fail") {
      failures.push({
        code: finding.code as PlannerScenarioLabFailure["code"],
        scenarioId: finding.scenarioId,
        childId: finding.childId,
        message: finding.message,
      });
    }
  }

  const byScenario = new Map<string, PlannerScenarioRunSummary[]>();
  for (const summary of runSummaries) {
    byScenario.set(summary.scenarioId, [...(byScenario.get(summary.scenarioId) ?? []), summary]);
  }
  const comparisons = [...byScenario.entries()]
    .filter(([, summaries]) => summaries.length > 1)
    .map(([scenarioId, summaries]) => compareScenarioRuns(scenarioId, summaries));
  for (const comparison of comparisons) {
    if (comparison.collapsed) {
      failures.push({
        code: "child_plans_collapsed",
        scenarioId: comparison.scenarioId,
        message: `Planner produced the same learning-relevant plan for ${comparison.childIds.join(" and ")}.`,
      });
    }
  }

  const withoutMarkdown = {
    pass: failures.length === 0,
    failures,
    runSummaries,
    comparisons,
    instrumentFindings,
  };
  return {
    ...withoutMarkdown,
    markdown: renderMarkdown(withoutMarkdown),
  };
}

export function buildPlannerScenarioBatchMetadata(args: {
  batchId: string;
  createdAt: string;
  model: string;
  scenarioId?: string;
  promptVersion?: string;
  runs: PlannerScenarioRun[];
  report: PlannerScenarioLabReport;
  runPaths?: string[];
}): PlannerScenarioBatchMetadata {
  return {
    batchId: args.batchId,
    scenarioId: args.scenarioId,
    model: args.model,
    createdAt: args.createdAt,
    promptVersion: args.promptVersion ?? "activity-evidence-contract-v1",
    runCount: args.runs.length,
    pass: args.report.pass,
    totalEstimatedCostUsd: sumCost(args.report.runSummaries),
    totalLatencyMs: sumLatency(args.report.runSummaries),
    childIds: uniqueSorted(args.runs.map((run) => run.childId)),
    runPaths: args.runPaths ?? [],
  };
}

function modelForRun(run: PlannerScenarioRun): string {
  return normalize(run.telemetry?.model ?? run.model);
}

function createdAtMs(run: PlannerScenarioRun): number {
  const value = run.createdAt ? Date.parse(run.createdAt) : 0;
  return Number.isFinite(value) ? value : 0;
}

export function selectPlannerScenarioRunSet(args: {
  runs: PlannerScenarioRun[];
  scenarioId: string;
  selector: string;
}): PlannerScenarioRun[] {
  const [kind, rawModel] = args.selector.split(":", 2);
  const model = normalize(rawModel ?? "");
  const matching = args.runs
    .filter((run) => run.scenarioId === args.scenarioId)
    .filter((run) => !model || modelForRun(run) === model)
    .filter((run) => kind !== "batch" || run.batchId === rawModel);

  if (kind === "batch") {
    return matching.sort((left, right) => left.childId.localeCompare(right.childId));
  }

  if (kind !== "first-full" && kind !== "latest-full" && kind !== "previous-full" && kind !== "model") {
    throw new Error(`planner_scenario_lab_unknown_run_set_selector:${args.selector}`);
  }

  const pickLatest = kind === "latest-full" || kind === "model";
  const byChild = new Map<string, PlannerScenarioRun[]>();
  for (const run of matching) {
    byChild.set(run.childId, [...(byChild.get(run.childId) ?? []), run]);
  }
  return [...byChild.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, childRuns]) => {
      const sorted = [...childRuns].sort((left, right) =>
        pickLatest || kind === "previous-full"
          ? createdAtMs(right) - createdAtMs(left)
          : createdAtMs(left) - createdAtMs(right)
      );
      return kind === "previous-full" ? sorted[1] : sorted[0];
    })
    .filter((run): run is PlannerScenarioRun => Boolean(run));
}

export function comparePlannerScenarioRunSets(args: {
  scenarioId: string;
  baselineLabel: string;
  candidateLabel: string;
  baselineRuns: PlannerScenarioRun[];
  candidateRuns: PlannerScenarioRun[];
}): PlannerScenarioRunSetComparison {
  const baselineReport = buildPlannerScenarioLabReport(args.baselineRuns);
  const candidateReport = buildPlannerScenarioLabReport(args.candidateRuns);
  const baselineScore = qualityScoreForReport(args.baselineRuns, baselineReport);
  const candidateScore = qualityScoreForReport(args.candidateRuns, candidateReport);
  const { fixedFailures, newFailures } = diffFailures(baselineReport.failures, candidateReport.failures);
  const baselineSummaries = new Map(baselineReport.runSummaries.map((summary) => [summary.childId, summary]));
  const candidateSummaries = new Map(candidateReport.runSummaries.map((summary) => [summary.childId, summary]));
  const childIds = uniqueSorted([
    ...baselineReport.runSummaries.map((summary) => summary.childId),
    ...candidateReport.runSummaries.map((summary) => summary.childId),
  ]);
  const childComparisons: PlannerScenarioChildComparison[] = childIds.flatMap((childId) => {
    const baselineSummary = baselineSummaries.get(childId);
    const candidateSummary = candidateSummaries.get(childId);
    const baselineRun = args.baselineRuns.find((run) => run.childId === childId);
    const candidateRun = args.candidateRuns.find((run) => run.childId === childId);
    if (!baselineSummary || !candidateSummary || !baselineRun || !candidateRun) return [];
    const baselineChildFailures = failuresForChild(baselineReport, childId);
    const candidateChildFailures = failuresForChild(candidateReport, childId);
    const childDiff = diffFailures(baselineChildFailures, candidateChildFailures);
    const baselineChildScore = qualityScoreForRun(
      baselineRun,
      baselineSummary,
      baselineChildFailures,
      baselineReport.instrumentFindings.filter((finding) => finding.childId === childId),
    );
    const candidateChildScore = qualityScoreForRun(
      candidateRun,
      candidateSummary,
      candidateChildFailures,
      candidateReport.instrumentFindings.filter((finding) => finding.childId === childId),
    );
    return [{
      childId,
      baselineScore: baselineChildScore,
      candidateScore: candidateChildScore,
      scoreDelta: candidateChildScore.score - baselineChildScore.score,
      fixedFailures: childDiff.fixedFailures,
      newFailures: childDiff.newFailures,
      baselineNodeMix: baselineSummary.nodeMix,
      candidateNodeMix: candidateSummary.nodeMix,
      baselineWordRadarModes: baselineSummary.wordRadarModes,
      candidateWordRadarModes: candidateSummary.wordRadarModes,
      baselineEvidenceRoles: baselineSummary.evidenceRoles,
      candidateEvidenceRoles: candidateSummary.evidenceRoles,
      baselineCostUsd: baselineSummary.estimatedCostUsd,
      candidateCostUsd: candidateSummary.estimatedCostUsd,
      baselineLatencyMs: baselineSummary.latencyMs,
      candidateLatencyMs: candidateSummary.latencyMs,
    }];
  });
  const scoreDelta = candidateScore.score - baselineScore.score;
  const withoutMarkdown = {
    scenarioId: args.scenarioId,
    baselineLabel: args.baselineLabel,
    candidateLabel: args.candidateLabel,
    status: comparisonStatus({ scoreDelta, fixedFailures, newFailures }),
    baselineScore,
    candidateScore,
    scoreDelta,
    baselineTotalCostUsd: sumCost(baselineReport.runSummaries),
    candidateTotalCostUsd: sumCost(candidateReport.runSummaries),
    baselineTotalLatencyMs: sumLatency(baselineReport.runSummaries),
    candidateTotalLatencyMs: sumLatency(candidateReport.runSummaries),
    fixedFailures,
    newFailures,
    childComparisons,
    baselineReport,
    candidateReport,
  };
  return {
    ...withoutMarkdown,
    markdown: renderComparisonMarkdown(withoutMarkdown),
  };
}

export function filterPlannerScenarioPaidFixtures<T extends PlannerScenarioPaidFixtureSummary>(args: {
  fixtures: T[];
  scenarioFilter?: string;
  childFilter?: string;
  limit?: number;
  maxCostUsd?: number;
}): T[] {
  const scenarioFiltered = args.scenarioFilter
    ? args.fixtures.filter((fixture) => fixture.scenarioId === args.scenarioFilter)
    : [...args.fixtures];
  const childFiltered = args.childFilter
    ? scenarioFiltered.filter((fixture) => fixture.childId === args.childFilter)
    : scenarioFiltered;
  const limited = typeof args.limit === "number" && Number.isFinite(args.limit) && args.limit >= 0
    ? childFiltered.slice(0, args.limit)
    : childFiltered;
  const estimatedCost = limited.reduce((sum, fixture) => sum + Math.max(0, fixture.estimatedCostUsd ?? 0), 0);
  if (
    typeof args.maxCostUsd === "number" &&
    Number.isFinite(args.maxCostUsd) &&
    estimatedCost > args.maxCostUsd
  ) {
    throw new Error(
      `planner_scenario_lab_paid_cost_cap:estimated=${estimatedCost.toFixed(5)} max=${args.maxCostUsd.toFixed(5)}`,
    );
  }
  return limited;
}

export function plannerScenarioResultFilename(args: {
  scenarioId: string;
  childId: string;
  model: string;
  createdAt: string;
}): string {
  const stamp = args.createdAt.replace(/[:.]/g, "-");
  return `${slug(args.scenarioId)}/${slug(args.childId)}/${slug(args.model)}/${stamp}.json`;
}
