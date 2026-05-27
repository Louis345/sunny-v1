import type { AssignmentPlannerOutput, AssignmentPlannerTelemetry } from "./assignmentPlanner";

type PlannerNode = AssignmentPlannerOutput["activeSessionPlan"]["nodePlan"][number];

export type PlannerScenarioPreflight = {
  status: "pass" | "warn" | "fail";
  issues: Array<{ code?: string; message: string; severity?: string }>;
};

export type PlannerScenarioRun = {
  scenarioId: string;
  childId: string;
  model: string;
  createdAt?: string;
  latencyMs?: number;
  telemetry?: Partial<AssignmentPlannerTelemetry>;
  tokenEstimate?: {
    inputTokens: number;
    outputTokens: number;
  };
  expectedEvidenceTerms?: string[];
  preflight?: PlannerScenarioPreflight;
  output: AssignmentPlannerOutput;
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
    | "preflight_failed";
  scenarioId: string;
  childId?: string;
  message: string;
};

export type PlannerScenarioLabReport = {
  pass: boolean;
  failures: PlannerScenarioLabFailure[];
  runSummaries: PlannerScenarioRunSummary[];
  comparisons: PlannerScenarioComparison[];
  markdown: string;
};

type CostRate = {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
};

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

export function buildPlannerScenarioLabReport(runs: PlannerScenarioRun[]): PlannerScenarioLabReport {
  const runSummaries = runs.map(summarizePlannerScenarioRun);
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
  };
  return {
    ...withoutMarkdown,
    markdown: renderMarkdown(withoutMarkdown),
  };
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
