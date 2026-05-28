import fs from "fs";
import path from "path";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import {
  auditActivityToolContracts,
  buildInstructionalActivityPlan,
  listActivityToolContracts,
  type ActivityToolAudit,
  type InstructionalActivityPlan,
  type InstructionalActivityPlanInput,
} from "../engine/activityToolCatalog";
import { getChildChart } from "../profiles/childChart";

type InspectActivityToolsArgs = {
  mode: "audit" | "plan";
  childId: string;
  homeworkId?: string;
  json: boolean;
};

type Logger = {
  log: (line: string) => void;
};

type RunInspectActivityToolsOptions = {
  rootDir?: string;
  logger?: Logger;
};

type ActivityToolAuditPayload = ActivityToolAudit & {
  contracts: ReturnType<typeof listActivityToolContracts>;
};

function valueAfterFlag(argv: string[], index: number, inline: string | undefined): string | undefined {
  if (inline != null) return inline;
  return argv[index + 1]?.startsWith("--") ? undefined : argv[index + 1];
}

export function parseInspectActivityToolsArgs(argv: string[]): InspectActivityToolsArgs {
  let mode: "audit" | "plan" = "audit";
  let childId = "";
  let homeworkId: string | undefined;
  let json = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "--audit") {
      mode = "audit";
      continue;
    }
    if (arg === "--plan") {
      mode = "plan";
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const [flag, inline] = arg.split("=", 2);
    if (flag === "--child") {
      childId = String(valueAfterFlag(argv, i, inline) ?? "").trim().toLowerCase();
      if (inline == null) i += 1;
      continue;
    }
    if (flag === "--homework-id") {
      homeworkId = String(valueAfterFlag(argv, i, inline) ?? "").trim();
      if (inline == null) i += 1;
    }
  }

  if (mode === "plan" && !childId) {
    throw new Error("Missing --child=<childId>");
  }

  return {
    mode,
    childId,
    ...(homeworkId ? { homeworkId } : {}),
    json,
  };
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function readHomeworkCycle(rootDir: string, childId: string, homeworkId: string | null): HomeworkCycle | null {
  if (!homeworkId) return null;
  return readJson<HomeworkCycle>(
    path.join(rootDir, "src", "context", childId, "homework", "cycles", `${homeworkId}.json`),
  );
}

function selectedHomeworkId(args: InspectActivityToolsArgs, pendingHomeworkId?: string): string | null {
  return args.homeworkId ?? pendingHomeworkId ?? null;
}

function planInputFromHomework(args: InspectActivityToolsArgs, rootDir: string): InstructionalActivityPlanInput {
  const chart = getChildChart(args.childId, { rootDir });
  const homeworkId = selectedHomeworkId(args, chart.learningProfile.pendingHomework?.homeworkId);
  const cycle = readHomeworkCycle(rootDir, chart.childId, homeworkId);
  const pending = chart.learningProfile.pendingHomework ?? null;
  const captured = cycle?.capturedContent ?? pending?.capturedContent ?? null;
  const contentProfile = cycle?.contentProfile ?? captured?.contentProfile ?? pending?.contentProfile ?? null;
  const words = captured?.words ?? cycle?.wordList ?? pending?.wordList ?? [];
  const questionCount = captured?.questions?.length ?? 0;

  if (!homeworkId) {
    throw new Error(`No pending homework found for child: ${chart.childId}`);
  }
  if (args.homeworkId && !cycle && pending?.homeworkId !== args.homeworkId) {
    throw new Error(`Homework cycle not found for child=${chart.childId} homeworkId=${args.homeworkId}`);
  }

  return {
    childId: chart.childId,
    homeworkId,
    practiceDomain: contentProfile?.practiceDomain ?? cycle?.subject ?? captured?.type ?? null,
    contentDomain: contentProfile?.contentDomain ?? cycle?.subject ?? captured?.type ?? null,
    primarySkill: contentProfile?.primarySkill ?? null,
    topic: contentProfile?.topic ?? captured?.title ?? cycle?.subject ?? null,
    learnerState: "unknown",
    words,
    concepts: contentProfile?.concepts ?? [],
    questionCount,
  };
}

export function formatActivityToolAuditReport(payload: ActivityToolAuditPayload): string {
  const lines = [
    "Activity Tool Audit",
    `Contracts: ${payload.contracts.length}`,
    `Blockers: ${payload.blockers.length ? payload.blockers.join(", ") : "none"}`,
    `Warnings: ${payload.warnings.length ? payload.warnings.join(", ") : "none"}`,
    "",
    "Tools:",
    ...payload.rows.map((row) => [
      `- ${row.id} (${row.label})`,
      `  domains: ${row.domains.join(", ")}`,
      `  purposes: ${row.purposes.join(", ")}`,
      `  writesMasteryEvidence: ${row.evidencePolicy === "mastery-eligible" ? "true" : "false"}`,
      `  evidencePolicy: ${row.evidencePolicy}`,
      `  scaffolds: ${row.scaffolds.length ? row.scaffolds.join(", ") : "none"}`,
      `  issues: ${row.issues.length ? row.issues.join(", ") : "none"}`,
    ].join("\n")),
  ];
  return lines.join("\n");
}

export function formatInstructionalActivityPlanReport(plan: InstructionalActivityPlan): string {
  const domain = plan.domainSummary.split(/\s+/)[0] ?? plan.domainSummary;
  const lines = [
    "Instructional Activity Plan",
    `Child: ${plan.childId ?? "unknown"}`,
    `Homework: ${plan.homeworkId ?? "none"}`,
    `Domain: ${domain}`,
    `Topic: ${plan.topic}`,
    `Learner state: ${plan.learnerState}`,
    "",
    "Steps:",
    ...plan.steps.map((step) =>
      `Step ${step.step}: ${step.toolId} (${step.purpose}, ${step.evidencePolicy}, writesMasteryEvidence=${step.writesMasteryEvidence}) - ${step.reason}`,
    ),
    "",
    "Notes:",
    ...plan.notes.map((note) => `- ${note}`),
  ];
  return lines.join("\n");
}

export async function runInspectActivityTools(
  argv: string[],
  opts: RunInspectActivityToolsOptions = {},
): Promise<ActivityToolAuditPayload | InstructionalActivityPlan> {
  const args = parseInspectActivityToolsArgs(argv);
  const logger = opts.logger ?? console;
  const rootDir = opts.rootDir ?? process.cwd();

  if (args.mode === "audit") {
    const audit = auditActivityToolContracts();
    const payload: ActivityToolAuditPayload = {
      ...audit,
      contracts: listActivityToolContracts(),
    };
    logger.log(args.json ? JSON.stringify(payload, null, 2) : formatActivityToolAuditReport(payload));
    return payload;
  }

  const plan = buildInstructionalActivityPlan(planInputFromHomework(args, rootDir));
  logger.log(args.json ? JSON.stringify(plan, null, 2) : formatInstructionalActivityPlanReport(plan));
  return plan;
}

if (typeof require !== "undefined" && require.main === module) {
  runInspectActivityTools(process.argv.slice(2)).catch((err) => {
    console.error("🎮 [activity-tools] failed", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
