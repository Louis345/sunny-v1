import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  buildAssignmentPlanningPacket,
  planAssignmentFromSource,
  summarizeAssignmentPlanForReview,
  validateAssignmentPlannerOutput,
  type AssignmentPlannerDialogueTurn,
  type AssignmentPlannerOutput,
  type AssignmentPlanningPacket,
  type AssignmentSourceExtraction,
} from "../engine/assignmentPlanner";
import { extractAssignmentSource } from "../engine/assignmentSourceExtraction";
import { getChildChart } from "../profiles/childChart";
import type { ChildChart } from "../profiles/childChart";
import type { RewardWrapperConfig } from "../shared/adventureTypes";

export type SparkOrbPlannerLabScenario =
  | "baseline-first"
  | "reward-bridge"
  | "domain-wrapper"
  | "contraindication";

export type SparkOrbPlannerSelection =
  | "not_available"
  | "available_not_selected"
  | "selected_as_wrapper"
  | "invalid_standalone_node";

export type SparkOrbPlannerAudit = {
  scenario: string;
  sparkOrbAvailable: boolean;
  sparkOrbSelection: SparkOrbPlannerSelection;
  wrapperModes: string[];
  wrapperNodes: string[];
  standaloneNodes: string[];
  packetActivityIds: string[];
  validationStatus: "valid" | "invalid";
  validationIssues: Array<{ code: string; severity: string; message: string }>;
  proof: string;
};

type Logger = Pick<typeof console, "log" | "error">;

export type SparkOrbPlannerVisibilityLabArgs = {
  childId: string;
  sourceFile: string;
  scenario: SparkOrbPlannerLabScenario | string;
  outputDir?: string;
  extraction?: AssignmentSourceExtraction;
  childChart?: ChildChart;
  parentDialogue?: AssignmentPlannerDialogueTurn[];
  now?: () => string;
  planAssignment?: (packet: AssignmentPlanningPacket) => Promise<AssignmentPlannerOutput>;
  logger?: Logger;
};

export type SparkOrbPlannerVisibilityLabResult = {
  runDir: string;
  packet: AssignmentPlanningPacket;
  output: AssignmentPlannerOutput;
  audit: SparkOrbPlannerAudit;
};

function readArg(argv: string[], flag: string): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index] ?? "";
    if (part === flag) {
      const next = argv[index + 1];
      return next && !next.startsWith("--") ? next : "";
    }
    if (part.startsWith(`${flag}=`)) return part.slice(flag.length + 1);
  }
  return null;
}

function defaultSpellingPdf(): string {
  return path.join(process.env.HOME ?? process.cwd(), "Downloads", "5_18 spelling .pdf");
}

function safeSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "lab";
}

function scenarioDialogue(
  scenario: string,
  createdAt: string,
): AssignmentPlannerDialogueTurn[] {
  if (scenario === "reward-bridge") {
    return [{
      role: "parent",
      createdAt,
      message:
        "After valid spelling evidence, she needs a short exciting reward bridge. Do not weaken the spelling evidence.",
    }];
  }
  if (scenario === "domain-wrapper") {
    return [{
      role: "parent",
      createdAt,
      message:
        "Use an engaging wrapper only if the spelling payload still owns exact per-word evidence.",
    }];
  }
  if (scenario === "contraindication") {
    return [{
      role: "parent",
      createdAt,
      message:
        "Today needs a clean cold baseline and calm session. Avoid arcade rewards unless the assignment truly needs one.",
    }];
  }
  return [];
}

function rewardWrapperForNode(node: AssignmentPlannerOutput["activeSessionPlan"]["nodePlan"][number]): RewardWrapperConfig | undefined {
  return "rewardWrapper" in node ? node.rewardWrapper : undefined;
}

export function buildSparkOrbPlannerAudit(args: {
  packetActivityIds: string[];
  output: AssignmentPlannerOutput;
  validationIssues: Array<{ code: string; severity: string; message: string }>;
  scenario: string;
}): SparkOrbPlannerAudit {
  const sparkOrbAvailable = args.packetActivityIds.includes("spark-orb-charge");
  const standaloneNodes = args.output.activeSessionPlan.nodePlan
    .filter((node) => node.activityId === "spark-orb-charge")
    .map((node) => node.id);
  const wrappers = args.output.activeSessionPlan.nodePlan
    .map((node) => ({ nodeId: node.id, wrapper: rewardWrapperForNode(node) }))
    .filter((entry): entry is { nodeId: string; wrapper: RewardWrapperConfig } =>
      entry.wrapper?.activityId === "spark-orb-charge");
  const wrapperModes = [...new Set(wrappers.map((entry) => entry.wrapper.mode))];
  const hasErrors = args.validationIssues.some((issue) => issue.severity === "error");
  const sparkOrbSelection: SparkOrbPlannerSelection = !sparkOrbAvailable
    ? "not_available"
    : standaloneNodes.length > 0
      ? "invalid_standalone_node"
      : wrappers.length > 0
        ? "selected_as_wrapper"
        : "available_not_selected";

  return {
    scenario: args.scenario,
    sparkOrbAvailable,
    sparkOrbSelection,
    wrapperModes,
    wrapperNodes: wrappers.map((entry) => entry.nodeId),
    standaloneNodes,
    packetActivityIds: [...args.packetActivityIds],
    validationStatus: hasErrors ? "invalid" : "valid",
    validationIssues: args.validationIssues.map((issue) => ({ ...issue })),
    proof:
      sparkOrbSelection === "selected_as_wrapper"
        ? "Spark Orb was selected organically as a rewardWrapper around a domain-valid activity."
        : sparkOrbSelection === "available_not_selected"
          ? "Spark Orb was available in the packet and the planner organically chose not to use it."
          : sparkOrbSelection === "invalid_standalone_node"
            ? "Spark Orb was misused as a standalone node and validation caught it."
            : "Spark Orb was not available in the planning packet.",
  };
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function runSparkOrbPlannerVisibilityLab(
  args: SparkOrbPlannerVisibilityLabArgs,
): Promise<SparkOrbPlannerVisibilityLabResult> {
  const logger = args.logger ?? console;
  const createdAt = args.now?.() ?? new Date().toISOString();
  const runDir = path.join(
    args.outputDir ?? path.join(process.cwd(), "tmp", "spark-orb-planner-lab"),
    `${createdAt.replace(/[:.]/g, "-")}-${safeSegment(args.scenario)}`,
  );
  fs.mkdirSync(runDir, { recursive: true });

  logger.log(`🎮 [spark-orb-planner-lab] [extract] scenario=${args.scenario} file=${path.basename(args.sourceFile)}`);
  const extraction = args.extraction ?? await extractAssignmentSource(args.sourceFile);
  const parentDialogue = args.parentDialogue ?? scenarioDialogue(args.scenario, createdAt);
  const packet = buildAssignmentPlanningPacket({
    childId: args.childId,
    extraction,
    childChart: args.childChart ?? getChildChart(args.childId),
    ...(parentDialogue.length ? { parentDialogue } : {}),
  });

  logger.log(`🎮 [spark-orb-planner-lab] [plan] activities=${packet.activityCatalog.map((card) => card.activityId).join(",")}`);
  const output = await (args.planAssignment ?? ((planningPacket) =>
    planAssignmentFromSource(planningPacket)))(packet);
  const validationIssues = validateAssignmentPlannerOutput(output, {
    extraction,
    activityCatalog: packet.activityCatalog,
  });
  const audit = buildSparkOrbPlannerAudit({
    packetActivityIds: packet.activityCatalog.map((card) => card.activityId),
    output,
    validationIssues,
    scenario: args.scenario,
  });

  writeJson(path.join(runDir, "assignment-planning-packet.json"), packet);
  writeJson(path.join(runDir, "assignment-planner-output.json"), output);
  fs.writeFileSync(path.join(runDir, "assignment-plan-review.md"), `${summarizeAssignmentPlanForReview(output)}\n`, "utf8");
  writeJson(path.join(runDir, "spark-orb-planner-audit.json"), audit);

  logger.log(`🎮 [spark-orb-planner-lab] [audit] ${audit.sparkOrbSelection} validation=${audit.validationStatus}`);
  logger.log(`🎮 [spark-orb-planner-lab] [artifacts] ${runDir}`);
  return { runDir, packet, output, audit };
}

async function main(argv: string[]): Promise<void> {
  const childId = readArg(argv, "--child") || "ila";
  const sourceFile = readArg(argv, "--file") || defaultSpellingPdf();
  const scenario = readArg(argv, "--scenario") || "baseline-first";
  const outputDir = readArg(argv, "--output-dir") ?? undefined;
  await runSparkOrbPlannerVisibilityLab({
    childId,
    sourceFile,
    scenario,
    outputDir,
  });
}

if (typeof require !== "undefined" && require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error("🎮 [spark-orb-planner-lab] [failed]", error);
    process.exit(1);
  });
}
