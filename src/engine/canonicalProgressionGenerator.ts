import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { generateQuestGameHtml } from "../scripts/generateGame";
import { validateGeneratedGame } from "../scripts/validateGeneratedGame";
import { resolveChildContextDir } from "../utils/contextRoot";
import { validateGeneratedArtifactRuntime } from "./generatedArtifactRuntimeValidator";
import {
  getLearningCycle,
  transitionLearningCycle,
  type LearningCycleNodeContract,
  type LearningCycleRecordV2,
  type LearningCycleRepositoryOptions,
} from "./learningCycleRepository";

export type CanonicalProgressionGeneratorInput = {
  childId: string;
  homeworkId: string;
  generateHtml?: (input: { prompt: string; node: LearningCycleNodeContract; cycle: LearningCycleRecordV2 }) => Promise<string>;
  validate?: (input: { html: string; node: LearningCycleNodeContract; cycle: LearningCycleRecordV2 }) => Promise<{ passed: boolean; failures: string[] }>;
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "artifact";
}

async function productionGenerate(input: { prompt: string; node: LearningCycleNodeContract; cycle: LearningCycleRecordV2 }): Promise<string> {
  return generateQuestGameHtml({
    client: new Anthropic(),
    extractedJsonPretty: JSON.stringify({ assignment: input.cycle.assignment, nodeContract: input.node }, null, 2),
    homeworkType: input.cycle.domain,
    learningTheory: `${input.prompt}\nThe first visible H1 must be exactly "${input.node.openingScreen.title}" (decorative emoji allowed). Do not reuse a baseline activity title.`,
    model: process.env.SUNNY_GENERATION_MODEL ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5",
  });
}

function openingIdentityFailures(html: string, node: LearningCycleNodeContract): string[] {
  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    ?.replace(/<[^>]+>/g, " ")
    .replace(/&[^;]+;/g, " ")
    .replace(/[^a-z0-9 ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const expected = node.openingScreen.title.trim().toLowerCase();
  return heading === expected ? [] : [`opening_title_mismatch:expected=${expected}:actual=${heading || "missing"}`];
}

async function productionValidate(input: { html: string; node: LearningCycleNodeContract; cycle: LearningCycleRecordV2 }, rootDir: string): Promise<{ passed: boolean; failures: string[] }> {
  const staticReport = validateGeneratedGame(input.html, {
    words: input.node.academicTarget.targets,
    homeworkType: input.cycle.domain,
    childId: input.cycle.childId,
    generationStage: input.node.role === "boss" ? "boss" : "quest",
  });
  if (!staticReport.passed) return { passed: false, failures: staticReport.failures };
  const runtime = await validateGeneratedArtifactRuntime({
    html: input.html,
    childId: input.cycle.childId,
    stage: input.node.role === "boss" ? "boss" : "quest",
    homeworkType: input.cycle.domain,
    words: input.node.academicTarget.targets,
    outputDir: path.join(resolveChildContextDir(input.cycle.childId, { rootDir }), "homework", "games", ".validation", input.node.nodeId),
  });
  return { passed: runtime.passed, failures: runtime.failures };
}

export async function generateCanonicalProgressionArtifact(
  input: CanonicalProgressionGeneratorInput,
  opts: LearningCycleRepositoryOptions = {},
): Promise<LearningCycleRecordV2> {
  const rootDir = opts.rootDir ?? process.cwd();
  const cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  const role = cycle.lifecycle === "quest_generating" ? "quest" : cycle.lifecycle === "boss_generating" ? "boss" : null;
  if (!role) return cycle;
  const node = cycle.nodes.find((candidate) => candidate.role === role);
  if (!node?.generationPrompt) throw new Error(`learning_cycle_${role}_prompt_missing`);
  const generate = input.generateHtml ?? productionGenerate;
  let html = "";
  let failures: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const prompt = attempt === 1
      ? node.generationPrompt.text
      : `${node.generationPrompt.text}\nRepair these rejected artifact failures:\n${failures.join("\n")}`;
    html = await generate({ prompt, node, cycle });
    const identityFailures = openingIdentityFailures(html, node);
    const validation = input.validate
      ? await input.validate({ html, node, cycle })
      : await productionValidate({ html, node, cycle }, rootDir);
    failures = [...identityFailures, ...validation.failures];
    if (validation.passed && identityFailures.length === 0) break;
  }
  if (failures.length > 0) throw new Error(`learning_cycle_${role}_validation_failed:${failures.join("|")}`);
  const filename = `${slug(cycle.homeworkId)}-${role}-${slug(node.experimentId)}.html`;
  const file = path.join(resolveChildContextDir(cycle.childId, { rootDir }), "homework", "games", filename);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html, "utf8");
  const contractFingerprint = createHash("sha256").update(JSON.stringify({
    title: node.title,
    academicTarget: node.academicTarget,
    mechanic: node.mechanic,
    theme: node.theme,
    openingScreen: node.openingScreen,
    sfxContract: node.sfxContract,
    companionContract: node.companionContract,
    evidenceContract: node.evidenceContract,
  })).digest("hex").slice(0, 24);
  return transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, {
    type: "artifact_bound",
    nodeId: node.nodeId,
    artifact: {
      contentId: `${cycle.homeworkId}:${role}:${node.experimentId}`,
      artifactId: `${node.generationPrompt.promptId}:artifact`,
      localArtifactPath: `/api/homework/game/${cycle.childId}/${filename}`,
      localArtworkPath: node.artwork.localPath ?? (role === "quest" ? "/generated/adventure-board-demo/quest.jpeg" : "/generated/adventure-board-demo/boss.jpeg"),
      contractFingerprint,
      validationStatus: "passed",
    },
  }, opts);
}
