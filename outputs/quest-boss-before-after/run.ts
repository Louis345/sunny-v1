import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { generateAdaptiveProgressionActivityHtml } from "../../src/engine/directMathExperience";
import { validateGeneratedArtifactRuntime } from "../../src/engine/generatedArtifactRuntimeValidator";
import type { LearningCycleNodeContract, LearningCycleRecordV2 } from "../../src/engine/learningCycleRepository";
import { validateGeneratedGame } from "../../src/scripts/validateGeneratedGame";

const repoRoot = process.cwd();
const beforeRoot = path.join(repoRoot, "outputs", "quest-boss-production-proof", "2026-08-06T22-15-32-721Z");
const outputRoot = path.join(repoRoot, "outputs", "quest-boss-before-after", new Date().toISOString().replace(/[:.]/g, "-"));
const cycleFile = path.join(beforeRoot, "strong", "src", "context", "reina", "homework", "cycles", "hw-math-quest-boss-isolated-proof.json");
const beforeHtmlFile = path.join(beforeRoot, "strong", "src", "context", "reina", "homework", "games", "hw-math-quest-boss-isolated-proof-quest-experiment-quest.html");
const beforeShots = [1, 2, 3, 4].map((index) => path.join(beforeRoot, "screenshots", `quest-${index}.png`));
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Usage = { stage: string; model: string; inputTokens: number; outputTokens: number; elapsedMs: number; estimatedCostUsd: number };
const usage: Usage[] = [];

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function cost(model: string, input: number, output: number): number {
  const rates = model.includes("fable") ? { input: 10, output: 50 } : { input: 5, output: 25 };
  return Number(((input * rates.input + output * rates.output) / 1_000_000).toFixed(4));
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

async function createDesignArtifact(contract: unknown): Promise<Record<string, unknown>> {
  const model = "claude-fable-5";
  const prompt = `You are the experience architect for one evidence-gated math Quest for a nine-year-old child.

Create a design artifact only. Do not write HTML. The academic contract and evidence boundary are immutable.

The current implementation technically works but behaves like a question placed beneath decorative artwork. Design a substantially stronger experience where multiplication is the action that changes the world. The first action must be obvious within three seconds. Challenge may increase, but controls must not create upfront cognitive load.

Independently choose the world, mission, core interaction, stakes, reachable consequences, recovery, progression, payoff, visual direction, motion, sound moments, and replay variation. Do not prescribe a named existing game. Do not infer unsupported child preferences. Do not reuse the exposed baseline items.

Academic contract:
${JSON.stringify(contract, null, 2)}

Return the artifact through the supplied tool.`;
  fs.writeFileSync(path.join(outputRoot, "fable-prompt.txt"), prompt);
  const started = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: 10000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    tools: [{
      name: "submit_experience_design",
      description: "Submit one frozen design artifact and no implementation.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["title", "openingPromise", "firstThreeSeconds", "firstAction", "coreInteraction", "mathAsPower", "stakes", "consequences", "recovery", "progression", "worldReaction", "payoff", "replayVariation", "visualDirection", "motionDirection", "soundDirection"],
        properties: {
          title: { type: "string" }, openingPromise: { type: "string" }, firstThreeSeconds: { type: "string" }, firstAction: { type: "string" },
          coreInteraction: { type: "string" }, mathAsPower: { type: "string" }, stakes: { type: "string" }, consequences: { type: "string" }, recovery: { type: "string" },
          progression: { type: "array", items: { type: "string" }, minItems: 3 }, worldReaction: { type: "string" }, payoff: { type: "string" }, replayVariation: { type: "string" },
          visualDirection: { type: "string" }, motionDirection: { type: "string" }, soundDirection: { type: "string" }, usefulLibraries: { type: "array", items: { type: "string" } },
        },
      },
    }],
    tool_choice: { type: "tool", name: "submit_experience_design" },
    messages: [{ role: "user", content: prompt }],
  } as never);
  const artifact = response.content.find((block) => block.type === "tool_use" && block.name === "submit_experience_design");
  if (!artifact || artifact.type !== "tool_use") throw new Error("fable_design_artifact_missing");
  const inputTokens = Number(response.usage.input_tokens ?? 0);
  const outputTokens = Number(response.usage.output_tokens ?? 0);
  usage.push({ stage: "design", model, inputTokens, outputTokens, elapsedMs: Date.now() - started, estimatedCostUsd: cost(model, inputTokens, outputTokens) });
  return artifact.input as Record<string, unknown>;
}

function sanitizedQuestCycle(source: LearningCycleRecordV2, artifact: Record<string, unknown>): { cycle: LearningCycleRecordV2; node: LearningCycleNodeContract } {
  const cycle = structuredClone(source);
  cycle.lifecycle = "quest_generating";
  cycle.observations = cycle.observations.filter((item) => item.nodeId === "baseline");
  cycle.evidence.academic = cycle.evidence.academic.filter((item) => item.nodeId === "baseline");
  cycle.evidence.engagement = cycle.evidence.engagement.filter((item) => item.nodeId === "baseline");
  const original = cycle.nodes.find((item) => item.role === "quest");
  if (!original?.generationPrompt) throw new Error("quest_contract_missing");
  const node = {
    ...original,
    state: "generating" as const,
    artifactBinding: null,
    mechanic: String(artifact.coreInteraction),
    theme: String(artifact.visualDirection),
    design: {
      mechanicSpec: String(artifact.coreInteraction),
      stakes: String(artifact.stakes),
      failureMode: `${String(artifact.consequences)} Recovery: ${String(artifact.recovery)}`,
      escalation: (artifact.progression as string[]).join(" → "),
      mathematicalHook: String(artifact.mathAsPower),
    },
    experienceDesignArtifact: artifact,
  } as LearningCycleNodeContract & { experienceDesignArtifact: Record<string, unknown> };
  cycle.nodes = cycle.nodes.map((item) => item.role === "quest" ? node : item);
  return { cycle, node };
}

async function buildAfter(cycle: LearningCycleRecordV2, node: LearningCycleNodeContract): Promise<string> {
  const model = "claude-opus-5";
  const started = Date.now();
  const html = await generateAdaptiveProgressionActivityHtml({
    cycle,
    node,
    childContext: { age: 9, instruction: "Use factual child context only; do not infer preferences." },
    client,
    model,
  });
  usage.push({ stage: "implementation", model, inputTokens: 0, outputTokens: 0, elapsedMs: Date.now() - started, estimatedCostUsd: 0 });
  return html;
}

function comparisonHtml(summary: Record<string, unknown>, before: string[], after: string[]): string {
  const rows = [0, 1, 2, 3].map((index) => `<section><h2>${["Opening", "Recovery", "Mid-play", "Completion"][index]}</h2><div class="pair"><figure><img src="file://${before[index]}"><figcaption>Before · direct HTML generation</figcaption></figure><figure><img src="file://${after[index]}"><figcaption>After · Fable artifact → Opus</figcaption></figure></div></section>`).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Quest Before/After</title><style>body{margin:0;background:#091426;color:#f4f8ff;font:16px system-ui;padding:28px}main{max-width:1500px;margin:auto}h1{font-size:42px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}figure{margin:0;background:#15233a;padding:12px;border-radius:16px}img{width:100%;aspect-ratio:16/9;object-fit:contain;background:#03070e;border-radius:10px}figcaption{padding-top:10px;font-weight:800}pre{white-space:pre-wrap;background:#15233a;padding:16px;border-radius:12px}</style></head><body><main><h1>Quest before/after</h1><pre>${JSON.stringify(summary, null, 2)}</pre>${rows}</main></body></html>`;
}

async function main(): Promise<void> {
  fs.mkdirSync(outputRoot, { recursive: true });
  const sourceCycle = JSON.parse(fs.readFileSync(cycleFile, "utf8")) as LearningCycleRecordV2;
  const originalNode = sourceCycle.nodes.find((item) => item.role === "quest");
  const contract = {
    title: originalNode?.title,
    academicTarget: originalNode?.academicTarget,
    openingScreen: originalNode?.openingScreen,
    plannerPrescription: originalNode?.generationPrompt?.text,
    evidenceLimit: "unseen transfer; practice cannot establish mastery",
  };
  writeJson(path.join(outputRoot, "frozen-academic-contract.json"), contract);
  const artifact = await createDesignArtifact(contract);
  writeJson(path.join(outputRoot, "design-artifact.json"), artifact);
  const { cycle, node } = sanitizedQuestCycle(sourceCycle, artifact);
  const afterHtml = await buildAfter(cycle, node);
  const afterHtmlFile = path.join(outputRoot, "after.html");
  fs.writeFileSync(afterHtmlFile, afterHtml);
  fs.copyFileSync(beforeHtmlFile, path.join(outputRoot, "before.html"));

  const staticReport = validateGeneratedGame(afterHtml, { words: node.academicTarget.targets, homeworkType: "math", childId: "reina", generationStage: "quest" });
  const runtime = staticReport.passed ? await validateGeneratedArtifactRuntime({
    html: afterHtml, childId: "reina", stage: "quest", homeworkType: "math", words: node.academicTarget.targets, outputDir: path.join(outputRoot, "validation"),
  }) : null;
  const afterShots = runtime?.runtimeValidation?.screenshotPaths ?? [];
  const copiedAfter = afterShots.map((source, index) => {
    const destination = path.join(outputRoot, "screenshots", `after-${index + 1}.png`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    return destination;
  });
  const copiedBefore = beforeShots.map((source, index) => {
    const destination = path.join(outputRoot, "screenshots", `before-${index + 1}.png`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    return destination;
  });
  const summary = {
    status: staticReport.passed && runtime?.passed && copiedAfter.length >= 4 ? "READY_FOR_HUMAN_JUDGMENT" : "AFTER_FAILED_VALIDATION",
    academicContractHash: hash(JSON.stringify(contract)),
    beforeHtmlHash: hash(fs.readFileSync(beforeHtmlFile, "utf8")),
    afterHtmlHash: hash(afterHtml),
    staticValidation: staticReport,
    runtimeValidation: runtime ? { passed: runtime.passed, failures: runtime.failures } : null,
    usage,
    estimatedKnownCostUsd: Number(usage.reduce((sum, item) => sum + item.estimatedCostUsd, 0).toFixed(4)),
    costCaveat: "The current streamed Opus helper does not expose usage to this experiment, so implementation cost is not included in the known-cost total.",
    humanQuestion: "Does the after version improve clarity, mathematical embodiment, world reaction, progression, and payoff—not merely styling?",
  };
  writeJson(path.join(outputRoot, "summary.json"), summary);
  fs.writeFileSync(path.join(outputRoot, "comparison.html"), comparisonHtml(summary, copiedBefore, copiedAfter));
  writeJson(path.join(outputRoot, "usage.json"), usage);
  console.log(`OUTPUT_ROOT=${outputRoot}`);
  console.log(`STATUS=${summary.status}`);
  if (summary.status !== "READY_FOR_HUMAN_JUDGMENT") process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
