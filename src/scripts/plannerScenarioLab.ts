import fs from "fs";
import path from "path";
import {
  planAssignmentFromSourceWithTelemetry,
  type AssignmentMasteryContext,
  type AssignmentPlanningPacket,
} from "../engine/assignmentPlanner";
import {
  DEFAULT_BASELINE_PLANNER_MODEL,
  DEFAULT_STRONGER_PLANNER_MODEL,
  buildPlannerScenarioBatchMetadata,
  buildPlannerScenarioLabReport,
  comparePlannerScenarioRunSets,
  estimatePlannerCostUsd,
  filterPlannerScenarioPaidFixtures,
  plannerScenarioResultFilename,
  selectPlannerScenarioRunSet,
  type PlannerScenarioBatchMetadata,
  type PlannerScenarioRun,
} from "../engine/plannerScenarioLab";
import { plannerEvidenceFieldsForActivity } from "../engine/activityEvidenceContract";

const DEFAULT_RUNS_DIR = path.join(process.cwd(), "src", "fixtures", "planner-scenario-lab", "runs");
const DEFAULT_PACKETS_DIR = path.join(process.cwd(), "src", "fixtures", "planner-scenario-lab", "packets");
const DEFAULT_RESULTS_DIR = path.join(process.cwd(), "logs", "planner-scenario-lab");
const DEFAULT_PROMPT_VERSION = "spelling-recall-center-v1";
const SPELLING_TEST_READINESS_PROOF: NonNullable<AssignmentMasteryContext["readinessProof"]> = {
  centralQuestion: "Can the child spell the test words from memory without seeing the word?",
  proofStandard: "Fresh unaided spelling production or clean recall evidence is the readiness proof for spelling-test targets.",
  supportEvidence: [
    "scaffolded spelling practice",
    "letter construction support",
    "recognition fluency",
    "pronunciation or read-aloud fluency",
  ],
  notEnoughEvidence: [
    "visible-word recognition alone",
    "pronunciation alone",
    "preference choice alone",
    "completion alone",
  ],
};

type PlannerScenarioLabCliOptions = {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
};

function parseArg(argv: string[], name: string): string | undefined {
  const direct = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

function parseNumberArg(argv: string[], name: string): number | undefined {
  const value = parseArg(argv, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`planner_scenario_lab_invalid_number_arg:${name}=${value}`);
  }
  return parsed;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function jsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...jsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      out.push(fullPath);
    }
  }
  return out.sort();
}

function slug(value: string): string {
  return value.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function stamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function loadFixtureRuns(runsDir: string, scenarioFilter?: string): PlannerScenarioRun[] {
  return jsonFiles(runsDir)
    .flatMap((filePath) => {
      const parsed = readJson<PlannerScenarioRun | PlannerScenarioRun[]>(filePath);
      return Array.isArray(parsed) ? parsed : [parsed];
    })
    .filter((run) => !scenarioFilter || run.scenarioId === scenarioFilter);
}

type PacketFixture = {
  scenarioId: string;
  childId?: string;
  expectedEvidenceTerms?: string[];
  scenarioExpectations?: PlannerScenarioRun["scenarioExpectations"];
  tokenEstimate?: PlannerScenarioRun["tokenEstimate"];
  packet: AssignmentPlanningPacket;
};

type PacketFixtureSet = {
  scenarioId: string;
  tokenEstimate?: PlannerScenarioRun["tokenEstimate"];
  basePacket: AssignmentPlanningPacket;
  cases: Array<{
    childId: string;
    displayName?: string;
    recentEvidence: string[];
    expectedEvidenceTerms?: string[];
    scenarioExpectations?: PlannerScenarioRun["scenarioExpectations"];
    masteryContext?: Partial<AssignmentMasteryContext>;
  }>;
};

function expandPacketFixtureSet(set: PacketFixtureSet): PacketFixture[] {
  return set.cases.map((fixtureCase) => ({
    scenarioId: set.scenarioId,
    childId: fixtureCase.childId,
    expectedEvidenceTerms: fixtureCase.expectedEvidenceTerms,
    scenarioExpectations: fixtureCase.scenarioExpectations,
    tokenEstimate: set.tokenEstimate,
    packet: enrichPacketActivityEvidence({
      ...set.basePacket,
      childId: fixtureCase.childId,
      masteryContext: {
        ...set.basePacket.masteryContext,
        ...fixtureCase.masteryContext,
        readinessProof:
          fixtureCase.masteryContext?.readinessProof ??
          set.basePacket.masteryContext.readinessProof ??
          SPELLING_TEST_READINESS_PROOF,
      },
      childChart: {
        ...set.basePacket.childChart,
        childId: fixtureCase.childId,
        displayName: fixtureCase.displayName ?? fixtureCase.childId,
        recentEvidence: fixtureCase.recentEvidence,
      },
      plannerInstruction: [
        set.basePacket.plannerInstruction,
        "Use activityCatalog evidenceRole, proofStrength, bestFor, contaminationRisks, and modeEvidenceNotes as the activity evidence truth table.",
        "Choose the necessary evidence roles first, cover them with the smallest launchable activity set, and remove redundant academic nodes before removing Mystery, Quest, or Boss.",
        "For mastered targets, do not stack hidden recall, pronunciation, and spell-check to prove the same mastered target.",
        "Use masteryContext.readinessProof as the domain center; for this spelling scenario, practice can vary, but readiness proof is unaided spelling production unless fresh clean recall evidence already proves the test targets.",
        `Scenario child case: ${fixtureCase.childId}.`,
        `Recent evidence: ${fixtureCase.recentEvidence.join(" ")}`,
      ].join(" "),
    }),
  }));
}

function enrichPacketActivityEvidence(packet: AssignmentPlanningPacket): AssignmentPlanningPacket {
  return {
    ...packet,
    activityCatalog: packet.activityCatalog.map((card) => ({
      ...card,
      ...plannerEvidenceFieldsForActivity(card.activityId),
    })),
  };
}

function loadPacketFixtures(packetDir: string): PacketFixture[] {
  return jsonFiles(packetDir)
    .flatMap((filePath) => {
      const parsed = readJson<PacketFixture | PacketFixture[] | PacketFixtureSet>(filePath);
      if (!Array.isArray(parsed) && "basePacket" in parsed && "cases" in parsed) {
        return expandPacketFixtureSet(parsed);
      }
      return Array.isArray(parsed) ? parsed : [parsed];
    });
}

function estimatePacketFixtureCost(fixture: PacketFixture, model: string): number {
  const inputTokens =
    fixture.tokenEstimate?.inputTokens ??
    Math.ceil(JSON.stringify(fixture.packet).length / 4) + 10_000;
  const outputTokens = fixture.tokenEstimate?.outputTokens ?? 4_000;
  return estimatePlannerCostUsd({ model, inputTokens, outputTokens });
}

function resolvePlannerModel(model?: string): string {
  if (!model) return DEFAULT_BASELINE_PLANNER_MODEL;
  const normalized = slug(model);
  if (normalized === "stronger" || normalized === "opus") return DEFAULT_STRONGER_PLANNER_MODEL;
  if (normalized === "baseline" || normalized === "sonnet") return DEFAULT_BASELINE_PLANNER_MODEL;
  return model;
}

async function runPaidPlanner(args: {
  packetDir: string;
  resultsDir: string;
  model?: string;
  scenarioFilter?: string;
  childFilter?: string;
  limit?: number;
  maxCostUsd?: number;
  batchId: string;
}): Promise<{ runs: PlannerScenarioRun[]; runPaths: string[] }> {
  const model = resolvePlannerModel(args.model);
  const fixtures = filterPlannerScenarioPaidFixtures({
    fixtures: loadPacketFixtures(args.packetDir)
      .map((fixture) => ({
        ...fixture,
        childId: fixture.childId ?? fixture.packet.childId,
        estimatedCostUsd: estimatePacketFixtureCost(fixture, model),
      })),
    scenarioFilter: args.scenarioFilter,
    childFilter: args.childFilter,
    limit: args.limit,
    maxCostUsd: args.maxCostUsd,
  });
  const runs: PlannerScenarioRun[] = [];
  const runPaths: string[] = [];
  for (const fixture of fixtures) {
    const started = Date.now();
    const { output, telemetry } = await planAssignmentFromSourceWithTelemetry(
      enrichPacketActivityEvidence(fixture.packet),
      { model },
    );
    const createdAt = new Date().toISOString();
    const run: PlannerScenarioRun = {
      scenarioId: fixture.scenarioId,
      childId: fixture.childId ?? fixture.packet.childId,
      model: telemetry.model,
      batchId: args.batchId,
      createdAt,
      latencyMs: Date.now() - started,
      telemetry,
      preflight: { status: "pass", issues: [] },
      expectedEvidenceTerms: fixture.expectedEvidenceTerms ?? [],
      scenarioExpectations: fixture.scenarioExpectations,
      output,
    };
    const relative = plannerScenarioResultFilename({
      scenarioId: run.scenarioId,
      childId: run.childId,
      model: run.model,
      createdAt,
    });
    const outPath = path.join(args.resultsDir, "runs", relative);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    runPaths.push(relative);
    runs.push(run);
  }
  return { runs, runPaths };
}

function writeBatchMetadata(args: {
  resultsDir: string;
  batchId: string;
  createdAt: string;
  model: string;
  scenarioId?: string;
  runs: PlannerScenarioRun[];
  report: ReturnType<typeof buildPlannerScenarioLabReport>;
  runPaths?: string[];
}): PlannerScenarioBatchMetadata {
  const metadata = buildPlannerScenarioBatchMetadata({
    batchId: args.batchId,
    createdAt: args.createdAt,
    model: args.model,
    scenarioId: args.scenarioId,
    promptVersion: DEFAULT_PROMPT_VERSION,
    runs: args.runs,
    report: args.report,
    runPaths: args.runPaths,
  });
  const outPath = path.join(args.resultsDir, "batches", `${slug(args.batchId)}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return metadata;
}

function loadBatchRuns(args: {
  resultsDir: string;
  batchId: string;
}): PlannerScenarioRun[] {
  const metadata = readJson<PlannerScenarioBatchMetadata>(
    path.join(args.resultsDir, "batches", `${slug(args.batchId)}.json`),
  );
  if (!metadata.runPaths.length) {
    return loadFixtureRuns(path.join(args.resultsDir, "runs"))
      .filter((run) => run.batchId === args.batchId);
  }
  return metadata.runPaths.map((relativePath) =>
    readJson<PlannerScenarioRun>(path.join(args.resultsDir, "runs", relativePath))
  );
}

function loadRunSetForSelector(args: {
  resultsDir: string;
  scenarioId: string;
  selector: string;
}): PlannerScenarioRun[] {
  if (args.selector.startsWith("batch:")) {
    return loadBatchRuns({
      resultsDir: args.resultsDir,
      batchId: args.selector.slice("batch:".length),
    }).filter((run) => run.scenarioId === args.scenarioId);
  }
  const runs = loadFixtureRuns(path.join(args.resultsDir, "runs"), args.scenarioId);
  return selectPlannerScenarioRunSet({
    runs,
    scenarioId: args.scenarioId,
    selector: args.selector,
  });
}

function writeComparison(args: {
  resultsDir: string;
  baseline: string;
  candidate: string;
  comparison: ReturnType<typeof comparePlannerScenarioRunSets>;
}): void {
  const filename = `${slug(args.baseline)}__vs__${slug(args.candidate)}`;
  const dir = path.join(args.resultsDir, "comparisons", slug(args.comparison.scenarioId));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${filename}.json`), `${JSON.stringify(args.comparison, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(dir, `${filename}.md`), args.comparison.markdown, "utf8");
}

export async function runPlannerScenarioLabCli(
  argv: string[],
  opts: PlannerScenarioLabCliOptions = {},
): Promise<void> {
  const paid = argv.includes("--paid");
  const compare = argv.includes("--compare");
  const runsDir = parseArg(argv, "runs-dir") ?? DEFAULT_RUNS_DIR;
  const packetDir = parseArg(argv, "packet-dir") ?? DEFAULT_PACKETS_DIR;
  const resultsDir = parseArg(argv, "results-dir") ?? DEFAULT_RESULTS_DIR;
  const model = parseArg(argv, "model");
  const scenarioFilter = parseArg(argv, "scenario");
  const childFilter = parseArg(argv, "child");
  const baseline = parseArg(argv, "baseline");
  const candidate = parseArg(argv, "candidate");
  const limit = parseNumberArg(argv, "limit");
  const maxCostUsd = parseNumberArg(argv, "max-cost-usd");
  const createdAt = new Date().toISOString();
  const batchId = parseArg(argv, "batch-id") ??
    `${slug(scenarioFilter ?? "all")}-${slug(model ?? "fixture")}-${stamp(createdAt)}`;

  if (compare) {
    if (!scenarioFilter) throw new Error("planner_scenario_lab_compare_missing_scenario");
    if (!baseline) throw new Error("planner_scenario_lab_compare_missing_baseline");
    if (!candidate) throw new Error("planner_scenario_lab_compare_missing_candidate");
    const baselineRuns = loadRunSetForSelector({ resultsDir, scenarioId: scenarioFilter, selector: baseline });
    const candidateRuns = loadRunSetForSelector({ resultsDir, scenarioId: scenarioFilter, selector: candidate });
    if (baselineRuns.length === 0) throw new Error(`planner_scenario_lab_compare_empty_baseline:${baseline}`);
    if (candidateRuns.length === 0) throw new Error(`planner_scenario_lab_compare_empty_candidate:${candidate}`);
    const comparison = comparePlannerScenarioRunSets({
      scenarioId: scenarioFilter,
      baselineLabel: baseline,
      candidateLabel: candidate,
      baselineRuns,
      candidateRuns,
    });
    writeComparison({ resultsDir, baseline, candidate, comparison });
    (opts.stdout ?? process.stdout.write.bind(process.stdout))(comparison.markdown);
    return;
  }

  const resolvedModel = paid ? resolvePlannerModel(model) : model;
  const paidResult = paid
    ? await runPaidPlanner({ packetDir, resultsDir, model: resolvedModel, scenarioFilter, childFilter, limit, maxCostUsd, batchId })
    : null;
  const runs = paidResult?.runs ?? loadFixtureRuns(runsDir, scenarioFilter);

  if (runs.length === 0) {
    throw new Error(
      paid
        ? `planner_scenario_lab_no_paid_packet_fixtures:${packetDir}`
        : `planner_scenario_lab_no_saved_runs:${runsDir}`,
    );
  }

  const report = buildPlannerScenarioLabReport(runs);
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, "planner-scenario-lab-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(resultsDir, "planner-scenario-lab-report.md"), report.markdown, "utf8");
  writeBatchMetadata({
    resultsDir,
    batchId,
    createdAt,
    model: resolvedModel ?? runs[0]?.telemetry?.model ?? runs[0]?.model ?? "fixture",
    scenarioId: scenarioFilter,
    runs,
    report,
    runPaths: paidResult?.runPaths ?? [],
  });
  (opts.stdout ?? process.stdout.write.bind(process.stdout))(report.markdown);
  if (!report.pass) process.exitCode = 1;
}

if (typeof require !== "undefined" && require.main === module) {
  runPlannerScenarioLabCli(process.argv.slice(2)).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`planner_scenario_lab_failed:${message}`);
  process.exitCode = 1;
  });
}
