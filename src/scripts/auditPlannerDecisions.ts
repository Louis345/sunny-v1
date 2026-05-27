import fs from "fs";
import path from "path";
import type {
  ActiveSessionPlan,
  PlanTheory,
  PlannedMeasurement,
  GeneratedExperienceBrief,
} from "../context/schemas/learningProfile";
import {
  auditPlannerDecisions,
  type PlannerDecisionAuditInput,
  type PlannerDecisionAuditReport,
  type PlannerDecisionSourceGroup,
  type PlannerDecisionTargetPurpose,
} from "../engine/plannerDecisionAudit";
import { resolveChildContextDir } from "../utils/contextRoot";

export type PlannerDecisionAuditCliOptions = {
  childId: string;
  rootDir?: string;
};

function safeChildId(childId: string): string {
  return childId.trim().toLowerCase();
}

function readJson(filePath: string): unknown {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing planner audit input file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

function purpose(value: unknown): PlannerDecisionTargetPurpose {
  const raw = String(value ?? "unknown");
  const allowed = new Set<PlannerDecisionTargetPurpose>([
    "spell_from_memory",
    "recognize",
    "read_fluently",
    "pronounce",
    "define",
    "unknown",
    "preference",
    "transfer",
    "mastery",
  ]);
  return allowed.has(raw as PlannerDecisionTargetPurpose)
    ? raw as PlannerDecisionTargetPurpose
    : "unknown";
}

function unwrapActivePlan(value: unknown): ActiveSessionPlan {
  const object = asObject(value);
  const current = object.current;
  return (current ? current : object) as ActiveSessionPlan;
}

function homeworkCurrent(value: unknown): Record<string, unknown> {
  const object = asObject(value);
  return asObject(object.current ?? value);
}

function wordGroupsFromHomework(value: unknown): PlannerDecisionSourceGroup[] {
  const current = homeworkCurrent(value);
  const captured = asObject(current.capturedContent);
  const interpretation = asObject(current.assignmentInterpretation ?? captured.assignmentInterpretation);
  const groups = [
    ...(Array.isArray(interpretation.wordGroups) ? interpretation.wordGroups : []),
    ...(Array.isArray(captured.wordGroups) ? captured.wordGroups : []),
  ];
  const deduped = new Map<string, PlannerDecisionSourceGroup>();

  for (const rawGroup of groups) {
    const group = asObject(rawGroup);
    const id = String(group.id ?? group.wordGroupId ?? "").trim();
    if (!id || deduped.has(id)) continue;
    deduped.set(id, {
      id,
      label: String(group.label ?? id),
      purpose: purpose(group.purpose),
      words: stringArray(group.words),
      evidence: stringArray(group.evidence),
    });
  }

  return [...deduped.values()];
}

function fallbackTheory(plan: ActiveSessionPlan): PlanTheory {
  const evidence = plan.evidenceUsed.map((item) => item.summary);
  return {
    hypothesis: `Planner should produce domain-valid ${plan.domain} practice from captured evidence.`,
    evidenceSummary: evidence.length ? evidence : ["Active session plan did not include detailed evidence."],
    intervention: "Audit each planned node as a measurement or preference signal before refactoring planner logic.",
    supportCriteria: ["Node evidence matches the target purpose and has a named signal."],
    reviseCriteria: ["Node signal is incomplete, indirect, or needs a clarifying activity."],
    falsifyCriteria: ["Node is playable while missing required evidence or tests the wrong skill."],
  };
}

function defaultAlgorithmFeeds(): PlannerDecisionAuditInput["algorithmFeeds"] {
  return [
    {
      id: "spaced-repetition",
      status: "available",
      summary: "Used when target words need retention and delayed recall evidence.",
    },
    {
      id: "activity-affinity",
      status: "available",
      summary: "Used as an engagement signal, not proof of mastery.",
    },
    {
      id: "quest-threshold",
      status: "audit-only",
      summary: "Quest/Boss should stay gated until baseline and generated-content evidence support them.",
    },
  ];
}

export function buildPlannerDecisionAuditInput(
  opts: PlannerDecisionAuditCliOptions,
): PlannerDecisionAuditInput {
  const childId = safeChildId(opts.childId);
  const childDir = resolveChildContextDir(childId, { rootDir: opts.rootDir });
  const activePlan = unwrapActivePlan(readJson(path.join(childDir, "plans", "active_session_plan.json")));
  const homework = readJson(path.join(childDir, "homework", "current.json"));

  return {
    childId,
    activeSessionPlan: activePlan,
    sourceGroups: wordGroupsFromHomework(homework),
    planTheory: activePlan.planTheory ?? fallbackTheory(activePlan),
    plannedMeasurements: activePlan.plannedMeasurements ?? [] as PlannedMeasurement[],
    generatedExperienceBriefs: activePlan.generatedExperienceBriefs ?? [] as GeneratedExperienceBrief[],
    questEvidence: [],
    algorithmFeeds: defaultAlgorithmFeeds(),
  };
}

function cell(value: string | string[]): string {
  const text = Array.isArray(value) ? value.join("; ") : value;
  return text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim() || "-";
}

export function renderPlannerDecisionAuditTable(report: PlannerDecisionAuditReport): string {
  const lines = [
    `# Planner Decision Audit: ${report.childId} / ${report.planId}`,
    "",
    `Nodes: ${report.summary.nodeCount} | Warnings: ${report.summary.warningCount} | Blockers: ${report.summary.blockerCount}`,
    "",
    "| node | source evidence | target purpose | activity/mode | algorithm feed | expected signal | support/revise/falsify | warning/blocker |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const row of report.rows) {
    lines.push([
      cell(row.nodeId),
      cell(row.sourceEvidence),
      cell(row.targetPurpose),
      cell(`${row.activityId}/${row.activityMode}`),
      cell(row.algorithmFeeds),
      cell(row.expectedSignal),
      cell([
        `support: ${row.supportCriteria}`,
        `revise: ${row.reviseCriteria}`,
        `falsify: ${row.falsifyCriteria}`,
      ]),
      cell(row.severity === "ok"
        ? "ok"
        : row.findings.map((finding) => `${finding.severity}:${finding.code}`)),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  return `${lines.join("\n")}\n`;
}

export function runPlannerDecisionAudit(
  opts: PlannerDecisionAuditCliOptions,
): PlannerDecisionAuditReport {
  return auditPlannerDecisions(buildPlannerDecisionAuditInput(opts));
}

function valueAfterFlag(argv: string[], index: number, inline: string | undefined): string | undefined {
  if (inline != null) return inline;
  return argv[index + 1]?.startsWith("--") ? undefined : argv[index + 1];
}

function parseArgs(argv: string[]): PlannerDecisionAuditCliOptions {
  let childId = "reina";
  let rootDir: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const [flag, inline] = arg.split("=", 2);
    const value = valueAfterFlag(argv, i, inline);
    if (flag === "--child") {
      childId = String(value ?? childId).trim().toLowerCase();
      if (inline == null) i += 1;
    }
    if (flag === "--root") {
      rootDir = String(value ?? "").trim() || undefined;
      if (inline == null) i += 1;
    }
  }

  return {
    childId,
    ...(rootDir ? { rootDir } : {}),
  };
}

export function main(argv: string[] = process.argv.slice(2)): void {
  const opts = parseArgs(argv);
  const report = runPlannerDecisionAudit(opts);
  console.log(renderPlannerDecisionAuditTable(report));
}

if (typeof require !== "undefined" && require.main === module) {
  try {
    main();
  } catch (err) {
    console.error("🎮 [planner-audit] [failed]", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
