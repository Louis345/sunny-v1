import fs from "fs";
import path from "path";
import { buildExperiencePlannerInput, draftPsychologistExperiencePlan } from "../engine/experiencePlanner";
import {
  activeSessionPlanRefreshReason,
  buildAdventureMapFromSessionPlan,
  writeActiveSessionPlan,
} from "../engine/sessionPlanFromChart";
import { getChildChart } from "../profiles/childChart";
import { buildHomeworkSessionStartPrompt } from "../server/session-bootstrap";

type Issue = {
  severity: "info" | "warning" | "high";
  code: string;
  message: string;
};

type PreflightReport = {
  childId: string;
  activeHomeworkId: string | null;
  activePlanId: string | null;
  repaired: boolean;
  firstNode: string | null;
  firstNodeWords: string[];
  issues: Issue[];
};

function parseArg(argv: string[], name: string): string | undefined {
  const direct = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function uniqueWords(words: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of words) {
    const word = String(raw ?? "").trim();
    const key = normalize(word);
    if (!word || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

function highFrequencyWords(pending: NonNullable<ReturnType<typeof getChildChart>["homework"]["pending"]>): string[] {
  const captured = pending.capturedContent as {
    wordGroups?: Array<{ id?: string; wordGroupId?: string; label?: string; words?: string[] }> | null;
    assignmentInterpretation?: {
      wordGroups?: Array<{ id?: string; wordGroupId?: string; label?: string; words?: string[] }> | null;
    } | null;
  } | null;
  const groups = [
    ...(captured?.assignmentInterpretation?.wordGroups ?? []),
    ...(captured?.wordGroups ?? []),
  ];
  const group = groups.find((entry) =>
    [entry.id, entry.wordGroupId, entry.label]
      .map((value) => normalize(value).replace(/[^a-z0-9]+/g, "_"))
      .some((value) => value.includes("high_frequency")),
  );
  return uniqueWords(group?.words ?? []);
}

function add(issues: Issue[], severity: Issue["severity"], code: string, message: string): void {
  issues.push({ severity, code, message });
}

export function runHomeworkSessionPreflight(input: {
  childId: string;
  repair?: boolean;
  rootDir?: string;
}): PreflightReport {
  const childId = normalize(input.childId);
  let chart = getChildChart(childId, { rootDir: input.rootDir });
  const pending = chart.homework.pending;
  const issues: Issue[] = [];
  let repaired = false;

  if (!pending) {
    add(issues, "high", "missing_pending_homework", "No active homework chart is available.");
    return {
      childId,
      activeHomeworkId: null,
      activePlanId: null,
      repaired,
      firstNode: null,
      firstNodeWords: [],
      issues,
    };
  }

  let plan = chart.activeSessionPlan;
  const refreshReason = activeSessionPlanRefreshReason(plan, pending);
  if (refreshReason) {
    add(issues, "high", "active_plan_refresh_required", refreshReason);
    if (input.repair) {
      const priorPlan = plan;
      const repairedPlan = draftPsychologistExperiencePlan(buildExperiencePlannerInput(chart), {
        parentNote: priorPlan?.parentNote,
      });
      plan = priorPlan?.approvalStatus === "approved" && priorPlan.parentNote?.trim()
        ? { ...repairedPlan, approvalStatus: "approved", parentNote: priorPlan.parentNote }
        : repairedPlan;
      writeActiveSessionPlan(childId, plan, { rootDir: input.rootDir });
      repaired = true;
      chart = getChildChart(childId, { rootDir: input.rootDir });
      plan = chart.activeSessionPlan;
      issues.length = 0;
      add(issues, "info", "active_plan_repaired", "Rebuilt active session plan from chart evidence and parent note.");
      const postRepairReason = activeSessionPlanRefreshReason(plan, pending);
      if (postRepairReason) {
        add(issues, "high", "active_plan_repair_failed", postRepairReason);
      }
    }
  }

  if (!plan) {
    add(issues, "high", "missing_active_plan", "No active session plan exists for this homework.");
    return {
      childId,
      activeHomeworkId: pending.homeworkId ?? pending.weekOf ?? null,
      activePlanId: null,
      repaired,
      firstNode: null,
      firstNodeWords: [],
      issues,
    };
  }

  const nodes = buildAdventureMapFromSessionPlan(chart, plan);
  const firstNode = nodes[0] ?? null;
  const opener = buildHomeworkSessionStartPrompt({
    childName: chart.identity.displayName,
    pendingHomework: pending,
    activeMapFirstNode: firstNode,
  });
  const firstNodeWords = uniqueWords(firstNode?.words ?? []);
  const homeworkWordKeys = new Set(uniqueWords(pending.wordList ?? []).map(normalize));

  if (!firstNode) {
    add(issues, "high", "empty_map", "The active plan produced no adventure map nodes.");
  } else if (!opener.includes(`First map node: ${firstNode.type}`)) {
    add(issues, "high", "opener_map_mismatch", `Opener did not name the launched first node ${firstNode.type}.`);
  }

  const parentNote = plan.parentNote ?? "";
  if (/\bhigh[-\s]?frequency\b/i.test(parentNote)) {
    const expected = highFrequencyWords(pending);
    const expectedKeys = new Set(expected.map(normalize));
    const pronunciation = nodes.find((node) => node.type === "pronunciation");
    const actual = uniqueWords(pronunciation?.words ?? []);
    const actualKeys = new Set(actual.map(normalize));
    if (!pronunciation) {
      add(issues, "high", "missing_pronunciation_node", "Parent note requested pronunciation, but no pronunciation node exists.");
    } else if (expected.length > 0 && actual.some((word) => !expectedKeys.has(normalize(word)))) {
      add(
        issues,
        "high",
        "pronunciation_wrong_target_lane",
        `Pronunciation includes non-high-frequency targets: ${actual.filter((word) => !expectedKeys.has(normalize(word))).join(", ")}.`,
      );
    } else if (/\ball\b/i.test(parentNote) && expected.some((word) => !actualKeys.has(normalize(word)))) {
      add(
        issues,
        "high",
        "pronunciation_missing_high_frequency_targets",
        `Pronunciation is missing high-frequency targets: ${expected.filter((word) => !actualKeys.has(normalize(word))).join(", ")}.`,
      );
    }
  }

  for (const node of nodes) {
    const badWords = uniqueWords(node.words ?? []).filter((word) => !homeworkWordKeys.has(normalize(word)));
    if (badWords.length > 0) {
      add(
        issues,
        "high",
        "non_homework_targets",
        `${node.type} contains target(s) not in active homework: ${badWords.join(", ")}.`,
      );
    }
  }

  return {
    childId,
    activeHomeworkId: pending.homeworkId ?? pending.weekOf ?? null,
    activePlanId: plan.planId,
    repaired,
    firstNode: firstNode?.type ?? null,
    firstNodeWords,
    issues,
  };
}

export function renderHomeworkSessionPreflight(report: PreflightReport): string {
  const lines = [
    "# Sunny Homework Session Preflight",
    "",
    `childId: ${report.childId}`,
    `activeHomeworkId: ${report.activeHomeworkId ?? "none"}`,
    `activePlanId: ${report.activePlanId ?? "none"}`,
    `repaired: ${report.repaired}`,
    `firstNode: ${report.firstNode ?? "none"}`,
    `firstNodeWords: ${report.firstNodeWords.join(", ") || "none"}`,
    "",
    "## Issues",
  ];
  if (report.issues.length === 0) {
    lines.push("- none");
  } else {
    for (const issue of report.issues) {
      lines.push(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const childId = parseArg(process.argv.slice(2), "child") ?? "ila";
  const repair = process.argv.includes("--repair");
  const report = runHomeworkSessionPreflight({ childId, repair });
  const output = renderHomeworkSessionPreflight(report);
  process.stdout.write(output);
  const highIssues = report.issues.filter((issue) => issue.severity === "high");
  if (highIssues.length > 0 && !repair) {
    process.exitCode = 1;
  }
  if (repair) {
    const outDir = path.join(process.cwd(), "logs", "preflight");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, `homework-preflight-${report.childId}.md`),
      output,
      "utf8",
    );
  }
}
