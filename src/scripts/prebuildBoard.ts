/**
 * Experiment (owner, 2026-11-05): build her next board, and her Quest when the Planner chooses one, while she
 * is away, so it opens the moment her current board is done ("a wait will kill it").
 *
 *   SUNNY_CHART_DIR=~/SunnyData npm run sunny:prebuild -- --child ila
 *
 * Her real data is never written by the paid run. Everything runs on a sandbox copy of the repo and of her
 * chart database, as if her current board had just finished. Only the result, one kit file, is written into
 * her real folder; Sunny uses it at her real board's end and checks it like a fresh decision.
 */
import "dotenv/config";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function inner(childId: string, homeworkId: string): Promise<void> {
  const { advanceCanonicalCycleFromEvidence } = await import("../engine/learningCycleRuntime");
  const { prepareSuccessorBoard } = await import("../engine/canonicalProgressionGenerator");
  const started = Date.now();
  const decided = await advanceCanonicalCycleFromEvidence({ childId, homeworkId });
  console.log(` 🎮 [prebuild] [sandbox] [decided] lifecycle=${decided.lifecycle} seconds=${Math.round((Date.now() - started) / 1000)}`);
  const ready = await prepareSuccessorBoard({ childId, homeworkId });
  console.log(` 🎮 [prebuild] [sandbox] [prepared] lifecycle=${ready.lifecycle} seconds=${Math.round((Date.now() - started) / 1000)}`);
  const board = ready.boards?.at(-1);
  for (const nodeId of board?.nodeIds ?? []) {
    const node = ready.nodes.find(row => row.nodeId === nodeId);
    console.log(` 🎮 [prebuild] [sandbox] [step] role=${node?.role} game=${node?.implementationType} title="${node?.title}" ready=${!node?.notReadyReason} path=${node?.artifactBinding?.localArtifactPath ?? "none"}`);
  }
}

async function outer(childId: string): Promise<void> {
  if (childId !== "ila" && childId !== "reina" && !childId.startsWith("demo")) throw new Error(`prebuild_unknown_child:${childId}`);
  const real = process.cwd();
  const chartDir = process.env.SUNNY_CHART_DIR?.trim();
  if (!chartDir) throw new Error("prebuild_requires_SUNNY_CHART_DIR");
  const current = JSON.parse(fs.readFileSync(path.join(real, "src/context", childId, "homework/current.json"), "utf8"));
  const homeworkId = String(current.current?.homeworkId ?? "");
  const cycleFile = (root: string) => path.join(root, "src/context", childId, "homework/cycles", `${homeworkId}.json`);
  const cycle = JSON.parse(fs.readFileSync(cycleFile(real), "utf8"));
  console.log(` 🎮 [prebuild] [start] child=${childId} homework=${homeworkId} lifecycle=${cycle.lifecycle} revision=${cycle.revision}`);
  if (!["baseline_ready", "baseline_active", "board_ready"].includes(cycle.lifecycle)) throw new Error(`prebuild_needs_a_board_in_play:${cycle.lifecycle}`);

  // 1. A sandbox copy of the repo and of her chart, so the paid run cannot touch her real data.
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), `sunny-prebuild-${childId}-`));
  execFileSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", ".git", "--exclude", "dist", `${real}/`, `${sandbox}/`]);
  fs.symlinkSync(path.join(real, "node_modules"), path.join(sandbox, "node_modules"));
  // The board preview needs the web packages, and the builder stamps each game with the code version.
  if (fs.existsSync(path.join(real, "web/node_modules"))) fs.symlinkSync(path.join(real, "web/node_modules"), path.join(sandbox, "web/node_modules"));
  fs.symlinkSync(path.join(real, ".git"), path.join(sandbox, ".git"));
  const sandboxChart = path.join(sandbox, ".prebuild-chart");
  fs.mkdirSync(sandboxChart);
  for (const name of fs.readdirSync(chartDir).filter(file => file.startsWith(`${childId}.db`))) fs.copyFileSync(path.join(chartDir, name), path.join(sandboxChart, name));
  console.log(` 🎮 [prebuild] [sandbox] [created] dir=${sandbox}`);

  // 2. In the sandbox only: her current board counts as finished, with the evidence she has so far.
  const copy = JSON.parse(fs.readFileSync(cycleFile(sandbox), "utf8"));
  copy.lifecycle = "baseline_evaluating";
  fs.writeFileSync(cycleFile(sandbox), JSON.stringify(copy, null, 2));
  // Her saved Planner answers would replay the decision that built the board she has now: ask fresh.
  fs.rmSync(path.join(sandbox, "src/context", childId, "homework/cycles/.planner", homeworkId), { recursive: true, force: true });

  // 3. The paid Planner and game builder run there, with capture on.
  const capture = path.join(sandbox, ".prebuild-capture");
  // The sandbox's own src/context is its default root (cwd); a context-root override for a real child is refused by design.
  const { SUNNY_CONTEXT_ROOT: _ignored, ...inherited } = process.env;
  const env = { ...inherited, SUNNY_CHART_DIR: sandboxChart, SUNNY_PREBUILD_CAPTURE: capture };
  const run = spawnSync("npx", ["tsx", "src/scripts/prebuildBoard.ts", "--inner", "--child", childId, "--homework", homeworkId], { cwd: sandbox, env, stdio: "inherit" });
  if (run.status !== 0) throw new Error(`prebuild_sandbox_failed:exit=${run.status}`);

  // 4. Only the kit goes into her real folder.
  const { kitFromCapture, savePrebuiltKit } = await import("../engine/prebuiltBoard");
  const kit = kitFromCapture(capture, { childId, homeworkId, fromLifecycle: "baseline_evaluating" });
  const file = savePrebuiltKit(kit, { rootDir: real });
  const encounter = JSON.stringify(kit.decision).match(/"encounter":"(quest|boss)"/)?.[1] ?? "none";
  console.log(` 🎮 [prebuild] [done] child=${childId} action=${kit.decision.progressionAction} encounter=${encounter} games=${Object.keys(kit.games).length} kit=${file} sandbox=${sandbox}`);
}

const childId = arg("child");
if (!childId) throw new Error("usage: npm run sunny:prebuild -- --child <ila|reina>");
(process.argv.includes("--inner") ? inner(childId, arg("homework")!) : outer(childId)).catch((error: unknown) => {
  console.error(` 🎮 [prebuild] [failed] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
