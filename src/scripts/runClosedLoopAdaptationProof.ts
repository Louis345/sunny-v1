import path from "path";
import {
  runClosedLoopAdaptationProof,
  type ClosedLoopAdaptationProofReport,
} from "../engine/closedLoopAdaptationProof";

function argValue(argv: string[], name: string): string | null {
  const eq = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1] ?? null;
  return null;
}

function render(report: ClosedLoopAdaptationProofReport): string {
  return [
    "# Sunny Closed-Loop Adaptation Proof",
    "",
    `childId: ${report.childId}`,
    `proved: ${report.proved ? "yes" : "no"}`,
    `labDir: ${report.labDir}`,
    `sessionDir: ${report.sessionDir}`,
    "",
    "## Evidence",
    `- completed: ${report.nodeCompleted.type}`,
    `- correct: ${report.evidence.correctTargets.join(", ") || "(none)"}`,
    `- missed: ${report.evidence.missedTargets.join(", ") || "(none)"}`,
    "",
    "## Adaptation",
    `- changed nodes: ${report.runtimeDiff.changedNodeIds.join(", ") || "(none)"}`,
    `- next targets: ${report.runtimeDiff.nextTargets.join(", ") || "(none)"}`,
    `- post-session status: ${report.postSessionTruth.adaptationDecision.status}`,
    `- reason: ${report.postSessionTruth.adaptationDecision.reason}`,
    "",
    report.proved
      ? "CLOSED LOOP: PROVED"
      : `CLOSED LOOP: BLOCKED\n${report.failures.map((failure) => `- ${failure}`).join("\n")}`,
  ].join("\n");
}

export async function runClosedLoopAdaptationProofCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const outRoot = argValue(argv, "out-root");
  const report = await runClosedLoopAdaptationProof({
    rootDir: outRoot ? path.resolve(outRoot) : process.cwd(),
  });
  process.stdout.write(`${render(report)}\n`);
  console.log(`🎮 [closed-loop-proof] [written] ${report.labDir}`);
  if (!report.proved) {
    console.log(`🎮 [closed-loop-proof] [blocked] failures=${report.failures.length}`);
    process.exitCode = 1;
  } else {
    console.log("🎮 [closed-loop-proof] [proved] assignment evidence changed the next board");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runClosedLoopAdaptationProofCli().catch((error: unknown) => {
    console.error("🎮 [closed-loop-proof] [failed]", error);
    process.exitCode = 1;
  });
}
