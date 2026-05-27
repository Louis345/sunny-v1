import fs from "fs";
import path from "path";
import {
  planAssignmentFromSourceWithTelemetry,
  type AssignmentPlanningPacket,
} from "../engine/assignmentPlanner";
import {
  buildPlannerScenarioLabReport,
  plannerScenarioResultFilename,
  type PlannerScenarioRun,
} from "../engine/plannerScenarioLab";

const DEFAULT_RUNS_DIR = path.join(process.cwd(), "src", "fixtures", "planner-scenario-lab", "runs");
const DEFAULT_PACKETS_DIR = path.join(process.cwd(), "src", "fixtures", "planner-scenario-lab", "packets");
const DEFAULT_RESULTS_DIR = path.join(process.cwd(), "logs", "planner-scenario-lab");

function parseArg(argv: string[], name: string): string | undefined {
  const direct = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 ? argv[idx + 1] : undefined;
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

function loadFixtureRuns(runsDir: string, scenarioFilter?: string): PlannerScenarioRun[] {
  return jsonFiles(runsDir)
    .map((filePath) => readJson<PlannerScenarioRun>(filePath))
    .filter((run) => !scenarioFilter || run.scenarioId === scenarioFilter);
}

type PacketFixture = {
  scenarioId: string;
  childId?: string;
  expectedEvidenceTerms?: string[];
  packet: AssignmentPlanningPacket;
};

async function runPaidPlanner(args: {
  packetDir: string;
  resultsDir: string;
  model?: string;
  scenarioFilter?: string;
}): Promise<PlannerScenarioRun[]> {
  const packetFiles = jsonFiles(args.packetDir);
  const runs: PlannerScenarioRun[] = [];
  for (const filePath of packetFiles) {
    const fixture = readJson<PacketFixture>(filePath);
    if (args.scenarioFilter && fixture.scenarioId !== args.scenarioFilter) continue;
    const started = Date.now();
    const { output, telemetry } = await planAssignmentFromSourceWithTelemetry(
      fixture.packet,
      args.model ? { model: args.model } : {},
    );
    const createdAt = new Date().toISOString();
    const run: PlannerScenarioRun = {
      scenarioId: fixture.scenarioId,
      childId: fixture.childId ?? fixture.packet.childId,
      model: telemetry.model,
      createdAt,
      latencyMs: Date.now() - started,
      telemetry,
      preflight: { status: "pass", issues: [] },
      expectedEvidenceTerms: fixture.expectedEvidenceTerms ?? [],
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
    runs.push(run);
  }
  return runs;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const paid = argv.includes("--paid");
  const runsDir = parseArg(argv, "runs-dir") ?? DEFAULT_RUNS_DIR;
  const packetDir = parseArg(argv, "packet-dir") ?? DEFAULT_PACKETS_DIR;
  const resultsDir = parseArg(argv, "results-dir") ?? DEFAULT_RESULTS_DIR;
  const model = parseArg(argv, "model");
  const scenarioFilter = parseArg(argv, "scenario");
  const runs = paid
    ? await runPaidPlanner({ packetDir, resultsDir, model, scenarioFilter })
    : loadFixtureRuns(runsDir, scenarioFilter);

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
  process.stdout.write(report.markdown);
  if (!report.pass) process.exitCode = 1;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`planner_scenario_lab_failed:${message}`);
  process.exitCode = 1;
});
