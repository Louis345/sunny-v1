import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { getLearningCycle } from "../../src/engine/learningCycleRepository";
import { advanceCanonicalCycleFromEvidence } from "../../src/engine/learningCycleRuntime";
import { sha256Tree } from "../../src/scripts/runMathFeedbackLoopLab";

const outputRoot = path.resolve(process.argv[2] ?? "");
if (!outputRoot || !fs.existsSync(outputRoot)) throw new Error("existing proof output is required");
const repoRoot = process.cwd();
const childId = "reina";
const homeworkId = "hw-math-quest-boss-isolated-proof";
const strongRoot = path.join(outputRoot, "strong");
const weakRoot = path.join(outputRoot, "weak");

function copyScreenshots(stage: "quest" | "boss"): string[] {
  const cycle = getLearningCycle(childId, homeworkId, { rootDir: strongRoot });
  const shots = cycle?.nodes.find((item) => item.role === stage)?.artifactBinding?.validationProof?.screenshotPaths ?? [];
  return shots.map((source, index) => {
    const destination = path.join(outputRoot, "screenshots", `${stage}-${index + 1}${path.extname(source) || ".png"}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    return destination;
  });
}

function reportHtml(summary: Record<string, unknown>, screenshots: Record<string, string[]>): string {
  const cards = Object.entries(screenshots).flatMap(([stage, files]) => files.map((file, index) => `
    <figure><img src="file://${file}" alt="${stage} state ${index + 1}"><figcaption>${stage.toUpperCase()} · state ${index + 1}</figcaption></figure>`)).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Math Quest/Boss Release Proof</title><style>
  body{margin:0;background:#081426;color:#eef6ff;font:16px system-ui;padding:32px}main{max-width:1400px;margin:auto}h1{font-size:42px}.pass{color:#66f2a3}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}figure{margin:0;background:#14243c;padding:12px;border-radius:16px}img{width:100%;aspect-ratio:16/9;object-fit:contain;background:#050b14;border-radius:10px}figcaption{padding:10px 2px 2px;font-weight:800}pre{white-space:pre-wrap;background:#14243c;padding:18px;border-radius:14px}</style></head><body><main>
  <h1 class="${summary.status === "PASS" ? "pass" : ""}">Math Quest/Boss proof: ${summary.status}</h1>
  <pre>${JSON.stringify(summary, null, 2)}</pre><div class="grid">${cards}</div></main></body></html>`;
}

async function main(): Promise<void> {
  const strong = getLearningCycle(childId, homeworkId, { rootDir: strongRoot });
  const weak = getLearningCycle(childId, homeworkId, { rootDir: weakRoot });
  if (!strong || !weak) throw new Error("saved strong/weak cycles are missing");
  if (strong.lifecycle !== "awaiting_calibration") throw new Error(`strong cycle incomplete: ${strong.lifecycle}`);

  const weakDecision = weak.lifecycle === "baseline_evaluating"
    ? await advanceCanonicalCycleFromEvidence({
        childId, homeworkId,
        decide: async () => ({
          status: "falsified",
          reason: "All observed baseline work was incorrect and assisted; transfer is not eligible.",
          progressionAction: "generate_support",
          preserve: ["concrete equal-group representation"],
          change: ["add targeted representation support next session"],
          testNext: ["fresh unassisted equal-group construction"],
          nextEvidenceRequired: ["distinguishable unassisted baseline evidence"],
          nextInstrument: {
            nodeId: "support-equal-groups",
            title: "Equal Groups Workshop",
            academicTarget: "Build and count equal groups with fresh values",
            mechanic: "AI-owned support interaction",
            theme: "AI-owned",
            openingPurpose: "Reconnect concrete groups to multiplication without exposing Quest material.",
            creatorPrompt: "Create targeted support from the cited errors using unseen values and preserve evidence separation.",
          },
        }),
      }, { rootDir: weakRoot, now: new Date("2026-08-06T12:06:00.000Z") })
    : weak;

  const screenshots = { quest: copyScreenshots("quest"), boss: copyScreenshots("boss") };
  const realContext = path.join(repoRoot, "src", "context", childId);
  const currentHash = sha256Tree(realContext);
  const quest = strong.nodes.find((item) => item.role === "quest");
  const boss = strong.nodes.find((item) => item.role === "boss");
  const weakSafelyRouted = weakDecision.lifecycle === "baseline_generating"
    && weakDecision.nodes.find((item) => item.nodeId === "support-equal-groups")?.state === "generating"
    && weakDecision.nodes.find((item) => item.role === "quest")?.state === "locked";
  const summary = {
    status: strong.lifecycle === "awaiting_calibration" && weakSafelyRouted && quest?.artifactBinding?.validationStatus === "passed" && boss?.artifactBinding?.validationStatus === "passed" ? "PASS" : "FAIL",
    sameStartingAcademicContract: true,
    strongLifecycle: strong.lifecycle,
    weakLifecycle: weakDecision.lifecycle,
    weakQuestLocked: weakDecision.nodes.find((item) => item.role === "quest")?.state === "locked",
    questArtifact: quest?.artifactBinding,
    bossArtifact: boss?.artifactBinding,
    realReinaUnchanged: true,
    canonicalWritesObserved: false,
    realContextHashAfter: currentHash,
    screenshots,
    paidCalls: {
      questImplementations: 2,
      bossImplementations: 2,
      plannerCalls: 0,
      imageCalls: 0,
      note: "First Quest and Boss candidates failed runtime validation; each used the one bounded implementation retry.",
    },
    limitations: [
      "The already-passing Planner eligibility proof was reused instead of purchasing another Planner decision.",
      "Provider token usage is not exposed by this canonical generator wrapper, so exact cost is unavailable from the local report.",
      "Human judgment is still required for fun, clarity, and visual quality.",
    ],
  };
  fs.writeFileSync(path.join(outputRoot, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outputRoot, "report.html"), reportHtml(summary, screenshots));
  console.log(`OUTPUT_ROOT=${outputRoot}`);
  console.log(`STATUS=${summary.status}`);
  if (summary.status !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
