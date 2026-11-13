import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import {
  adaptiveProgressionAcademicContractHash,
  designAdaptiveProgressionExperience,
  experienceDesignArtifactHash,
  generateAdaptiveProgressionActivityHtml,
} from "../src/engine/directMathExperience";
import { validateGeneratedArtifactRuntime } from "../src/engine/generatedArtifactRuntimeValidator";
import type { LearningCycleNodeContract, LearningCycleRecordV2 } from "../src/engine/learningCycleRepository";
import { validateGeneratedGame } from "../src/scripts/validateGeneratedGame";

const root = process.cwd();
const sourceRoot = path.join(root, "outputs/quest-boss-production-proof/2026-08-06T22-15-32-721Z");
const sourceCycleFile = path.join(sourceRoot, "strong/src/context/reina/homework/cycles/hw-math-quest-boss-isolated-proof.json");
const beforeHtml = path.join(sourceRoot, "strong/src/context/reina/homework/games/hw-math-quest-boss-isolated-proof-quest-experiment-quest.html");
const outputRoot = path.join(root, "outputs/quest-boss-integrated-before-after", new Date().toISOString().replace(/[:.]/g, "-"));

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function comparison(beforeShots: string[], afterShots: string[], summary: unknown): string {
  const labels = ["Opening", "Incorrect response and recovery", "Mid-progression", "Completion and payoff"];
  const rows = labels.map((label, index) => `<section><h2>${label}</h2><div class="pair"><figure><img src="file://${beforeShots[index]}"><figcaption>Before · direct one-shot generator</figcaption></figure><figure><img src="file://${afterShots[index]}"><figcaption>After · production Fable artifact → Opus builder</figcaption></figure></div></section>`).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Integrated Quest before/after</title><style>body{margin:0;padding:28px;background:#091426;color:#f5f8ff;font:16px system-ui}main{max-width:1500px;margin:auto}h1{font-size:42px}.play{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:24px 0}.play a{padding:18px;background:#274dff;color:white;border-radius:14px;text-align:center;font-weight:800;text-decoration:none}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}figure,pre{margin:0;background:#15233a;padding:12px;border-radius:16px}img{width:100%;aspect-ratio:16/9;object-fit:contain;background:#03070e;border-radius:10px}figcaption{padding-top:10px;font-weight:800}pre{white-space:pre-wrap}@media(max-width:900px){.pair,.play{grid-template-columns:1fr}}</style></head><body><main><h1>Quest architecture before/after</h1><p>Same academic contract. Only the creative handoff changed.</p><div class="play"><a href="./before.html">Play before</a><a href="./after.html">Play after</a></div><pre>${JSON.stringify(summary, null, 2)}</pre>${rows}</main></body></html>`;
}

async function main(): Promise<void> {
  fs.mkdirSync(outputRoot, { recursive: true });
  const cycle = JSON.parse(fs.readFileSync(sourceCycleFile, "utf8")) as LearningCycleRecordV2;
  const sourceNode = cycle.nodes.find((node) => node.role === "quest");
  if (!sourceNode?.generationPrompt) throw new Error("quest_contract_missing");
  const node: LearningCycleNodeContract = { ...sourceNode, state: "generating", artifactBinding: null };
  const childContext = {
    demographics: { age: 9, grade: 3 },
    evidenceNotice: "Factual context only. Do not infer durable preferences.",
  };
  const designStarted = Date.now();
  const designArtifact = await designAdaptiveProgressionExperience({ cycle, node, childContext });
  const designElapsedMs = Date.now() - designStarted;
  writeJson(path.join(outputRoot, "design-artifact.json"), designArtifact);
  const buildStarted = Date.now();
  const html = await generateAdaptiveProgressionActivityHtml({ cycle, node, childContext, designArtifact });
  const buildElapsedMs = Date.now() - buildStarted;
  fs.copyFileSync(beforeHtml, path.join(outputRoot, "before.html"));
  fs.writeFileSync(path.join(outputRoot, "after.html"), html, "utf8");

  const staticReport = validateGeneratedGame(html, {
    words: node.academicTarget.targets,
    homeworkType: cycle.domain,
    childId: cycle.childId,
    generationStage: "quest",
  });
  const runtime = staticReport.passed ? await validateGeneratedArtifactRuntime({
    html,
    childId: cycle.childId,
    stage: "quest",
    homeworkType: cycle.domain,
    words: node.academicTarget.targets,
    outputDir: path.join(outputRoot, "validation"),
  }) : null;
  const sourceBeforeShots = [1, 2, 3, 4].map((index) => path.join(sourceRoot, `screenshots/quest-${index}.png`));
  const beforeShots = sourceBeforeShots.map((source, index) => {
    const destination = path.join(outputRoot, `screenshots/before-${index + 1}.png`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    return destination;
  });
  const afterShots = (runtime?.runtimeValidation?.screenshotPaths ?? []).slice(0, 4).map((source, index) => {
    const destination = path.join(outputRoot, `screenshots/after-${index + 1}.png`);
    fs.copyFileSync(source, destination);
    return destination;
  });
  const summary = {
    status: staticReport.passed && runtime?.passed && afterShots.length === 4 ? "READY_FOR_HUMAN_JUDGMENT" : "AFTER_FAILED_VALIDATION",
    frozenAcademicContractHash: adaptiveProgressionAcademicContractHash(cycle, node),
    designArtifactHash: experienceDesignArtifactHash(designArtifact),
    architectModel: process.env.SUNNY_ARCHITECT_MODEL ?? "claude-fable-5",
    builderModel: process.env.SUNNY_QUEST_BOSS_BUILDER_MODEL ?? "claude-opus-5",
    designElapsedMs,
    buildElapsedMs,
    staticValidation: staticReport,
    runtimeValidation: runtime ? { passed: runtime.passed, failures: runtime.failures } : null,
    question: "Does the after experience materially improve interaction, visible stakes, world reaction, progression, and payoff—not only styling?",
  };
  writeJson(path.join(outputRoot, "summary.json"), summary);
  fs.writeFileSync(path.join(outputRoot, "comparison.html"), comparison(beforeShots, afterShots, summary), "utf8");
  console.log(`OUTPUT_ROOT=${outputRoot}`);
  console.log(`STATUS=${summary.status}`);
  if (summary.status !== "READY_FOR_HUMAN_JUDGMENT") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
