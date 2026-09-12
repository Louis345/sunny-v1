import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { validateGeneratedGame } from "../scripts/validateGeneratedGame";
import { getChildChart } from "../profiles/childChart";
import { resolveChildContextDir } from "../utils/contextRoot";
import { hashDiscoveryContract, runMathProviderStage } from "./adaptiveMathDiscovery";
import {
  createDirectArtwork, runDirectBrowserSmokeCheck, MATH_BROWSER_VERIFIER_VERSION,
  generateAdaptiveProgressionActivityHtml,
} from "./directMathExperience";
import { engagementTheoryEvidenceContext } from "./engagementTheory";
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
  nodeId?: string;
  generateArtwork?: (input: {
    prompt: string;
    node: LearningCycleNodeContract;
    cycle: LearningCycleRecordV2;
  }) => Promise<string>;
  generateHtml?: (input: { prompt: string; node: LearningCycleNodeContract; cycle: LearningCycleRecordV2 }) => Promise<string>;
  validate?: (input: { html: string; node: LearningCycleNodeContract; cycle: LearningCycleRecordV2 }) => Promise<ProgressionValidationResult>;
};

type ProgressionValidationResult = {
  passed: boolean;
  failures: string[];
  screenshotPaths?: string[];
  interactionTrace?: unknown;
  htmlHash?: string;
  verifierVersion?: number;
};

async function productionArtwork(input: {
  prompt: string;
  node: LearningCycleNodeContract;
  cycle: LearningCycleRecordV2;
}, rootDir: string): Promise<string> {
  const promptHash = createHash("sha256").update(input.prompt).digest("hex").slice(0, 10);
  const filename = [
    slug(input.cycle.homeworkId),
    input.node.role,
    slug(input.node.experimentId),
    promptHash,
  ].join("-") + ".jpeg";
  const protectedPrompt = input.prompt.toLowerCase().includes("without words, letters, numbers, equations, labels")
    ? input.prompt
    : `${input.prompt}. without words, letters, numbers, equations, labels.`;
  return createDirectArtwork(protectedPrompt, path.join(rootDir, "web", "public"), filename);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "artifact";
}

function creatorChildContext(childId: string, rootDir: string): unknown {
  const chart = getChildChart(childId, { rootDir });
  return { identity: chart.identity, demographics: chart.demographics, engagementEvidence: engagementTheoryEvidenceContext(chart.engagementTheory) };
}

async function productionGenerate(input: { prompt: string; node: LearningCycleNodeContract; cycle: LearningCycleRecordV2; childContext?: unknown }, rootDir: string): Promise<string> {
  return generateAdaptiveProgressionActivityHtml({
    cycle: input.cycle,
    node: { ...input.node, generationPrompt: { ...input.node.generationPrompt!, text: input.prompt } },
    childContext: input.childContext ?? creatorChildContext(input.cycle.childId, rootDir),
  });
}

/**
 * Both sides must be normalised the same way. The rendered heading has its
 * punctuation stripped, so comparing it against a raw title rejected every
 * correct render of a title containing an apostrophe or dash — which only
 * became reachable once the Planner started naming these nodes itself.
 */
function normalizeHeading(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&[^;]+;/g, " ")
    .replace(/[^a-z0-9 ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function openingIdentityFailures(html: string, node: LearningCycleNodeContract): string[] {
  const rawHeading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const heading = rawHeading ? normalizeHeading(rawHeading) : "";
  const expected = normalizeHeading(node.openingScreen.title);
  return heading === expected ? [] : [`opening_title_mismatch:expected=${expected}:actual=${heading || "missing"}`];
}

async function productionValidate(input: { html: string; node: LearningCycleNodeContract; cycle: LearningCycleRecordV2 }, rootDir: string): Promise<ProgressionValidationResult> {
  const stage = input.node.role === "boss" ? "boss" : input.node.role === "quest" ? "quest" : "baseline";
  const staticReport = validateGeneratedGame(input.html, {
    words: input.node.academicTarget.targets,
    homeworkType: input.cycle.domain,
    childId: input.cycle.childId,
    generationStage: stage,
  });
  if (!staticReport.passed) return { passed: false, failures: staticReport.failures };
  const dir = input.cycle.domain === "spelling"
    ? qualityDiagnosticsDir(rootDir, input.cycle, input.node)
    : path.join(resolveChildContextDir(input.cycle.childId, { rootDir }), "homework/games/.validation", input.node.nodeId);
  if (input.cycle.domain === "math" || input.cycle.domain === "spelling") {
    fs.mkdirSync(dir, {recursive:true});
    const htmlPath = path.join(dir, "candidate.html"); fs.writeFileSync(htmlPath, input.html);
    const htmlHash = createHash("sha256").update(input.html).digest("hex");
    const report = await runDirectBrowserSmokeCheck({rootDir, artifacts:[{nodeId:input.node.nodeId,childId:input.cycle.childId,homeworkId:input.cycle.homeworkId,title:input.node.title,htmlPath,htmlHash,artworkUrl:input.node.artwork.localPath??"",creatorPrompt:input.node.generationPrompt?.text??"",promptHash:input.node.generationPrompt?.promptId??"",plannerModel:"canonical",creatorModel:"canonical",...(input.node.evidenceContract.itemRoles?{itemIds:Object.keys(input.node.evidenceContract.itemRoles)}:{})}]});
    return {passed:report.passed,failures:report.failures,screenshotPaths:report.screenshots,htmlHash,verifierVersion:MATH_BROWSER_VERIFIER_VERSION};
  }
  const runtime = await validateGeneratedArtifactRuntime({
    html: input.html,
    childId: input.cycle.childId,
    stage,
    homeworkType: input.cycle.domain,
    words: input.node.academicTarget.targets,
    outputDir: dir,
  });
  return {
    passed: runtime.passed,
    failures: runtime.failures,
    screenshotPaths: runtime.runtimeValidation?.screenshotPaths ?? [],
    interactionTrace: runtime.runtimeValidation ?? null,
  };
}

function progressionContractFingerprint(node: LearningCycleNodeContract): string {
  return createHash("sha256").update(JSON.stringify({
    generationPrompt: node.generationPrompt,
    prediction: node.prediction,
    title: node.title,
    academicTarget: node.academicTarget,
    mechanic: node.mechanic,
    theme: node.theme,
    openingScreen: node.openingScreen,
    sfxContract: node.sfxContract,
    companionContract: node.companionContract,
    evidenceContract: node.evidenceContract,
  })).digest("hex").slice(0, 24);
}

function qualityDiagnosticsDir(
  rootDir: string,
  cycle: LearningCycleRecordV2,
  node: LearningCycleNodeContract,
): string {
  return path.join(
    resolveChildContextDir(cycle.childId, { rootDir }),
    "homework",
    "games",
    ".validation",
    ...(cycle.domain === "spelling" ? ["assignments", cycle.homeworkId] : []),
    node.nodeId,
    "quality",
  );
}

/** Adopt only identity-matching legacy checkpoints; never rewrite either copy. */
function copyLegacyCheckpoint(source: string, destination: string): void {
  if (fs.existsSync(destination)) {
    if (!fs.readFileSync(source).equals(fs.readFileSync(destination))) throw new Error("spelling_legacy_checkpoint_conflict");
    return;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  console.log(" 🎮 [canonical-progression] [legacy-checkpoint] [preserved]");
}

function preserveLegacySpellingSnapshots(legacyDir: string, directory: string, cycle: LearningCycleRecordV2, node: LearningCycleNodeContract): void {
  // The existing Creator has at most two attempts; no directory-wide migration.
  for (const attempt of [1, 2]) {
    const name = `creator-${attempt}.input.json`, source = path.join(legacyDir, name);
    if (!fs.existsSync(source)) continue;
    const saved = JSON.parse(fs.readFileSync(source, "utf8"));
    if (saved.input?.cycle?.childId !== cycle.childId || saved.input?.cycle?.homeworkId !== cycle.homeworkId || saved.input?.node?.nodeId !== node.nodeId) continue;
    if (saved.hash !== hashDiscoveryContract(saved.input) || saved.input.cycle.domain !== cycle.domain
      || progressionContractFingerprint(saved.input.node) !== progressionContractFingerprint(node)) throw new Error("spelling_creator_snapshot_changed");
    copyLegacyCheckpoint(source, path.join(directory, name));
  }
}

function preserveLegacySpellingReceipt(legacyDir: string, directory: string, stage: string, model: string, request: unknown): void {
  const stageName = `provider-receipts/${stage}.stage.json`, source = path.join(legacyDir, stageName);
  const saved = fs.existsSync(source) ? JSON.parse(fs.readFileSync(source, "utf8")) : undefined;
  if (saved && !/^[a-f0-9]{64}$/.test(saved.requestHash)) throw new Error(`provider_receipt_invalid:${source}`);
  const currentProvider = model.startsWith("gpt-") ? "openai" : "anthropic";
  // Preserve the original provider/model/status bytes. The shared receipt gate
  // still validates them and refuses uncertain outcomes instead of calling again.
  // Both existing providers are checked so a missing pointer or changed setting
  // cannot hide a completed request. No receipt directory scan is needed.
  for (const provider of [currentProvider, currentProvider === "openai" ? "anthropic" : "openai"]) {
    const requestHash = hashDiscoveryContract({ provider, request });
    const receiptName = `provider-receipts/${requestHash}.json`, receipt = path.join(legacyDir, receiptName);
    if (!fs.existsSync(receipt)) {
      if (saved?.requestHash === requestHash) throw new Error(`provider_receipt_invalid:${receipt}`);
      continue;
    }
    if (provider !== currentProvider) throw new Error(`provider_stage_request_changed:${stage}`);
    copyLegacyCheckpoint(receipt, path.join(directory, receiptName));
    if (saved?.requestHash === requestHash) copyLegacyCheckpoint(source, path.join(directory, stageName));
    return;
  }
}

function persistQualityCandidate(input: {
  rootDir: string;
  cycle: LearningCycleRecordV2;
  node: LearningCycleNodeContract;
  iteration: number;
  html?: string;
  validation?: ProgressionValidationResult;
  error?: string;
}): void {
  const dir = qualityDiagnosticsDir(input.rootDir, input.cycle, input.node);
  fs.mkdirSync(dir, { recursive: true });
  if (input.html) fs.writeFileSync(path.join(dir, `iteration-${input.iteration}.html`), input.html, "utf8");
  fs.writeFileSync(path.join(dir, `iteration-${input.iteration}.json`), `${JSON.stringify({
    iteration: input.iteration,
    validation: input.validation ?? null,
    error: input.error ?? null,
  }, null, 2)}\n`, "utf8");
}

export async function generateCanonicalProgressionArtifact(
  input: CanonicalProgressionGeneratorInput,
  opts: LearningCycleRepositoryOptions = {},
): Promise<LearningCycleRecordV2> {
  const rootDir = opts.rootDir ?? process.cwd();
  const cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  const node = cycle.nodes.find((candidate) => (!input.nodeId || candidate.nodeId === input.nodeId) && candidate.state === "generating" && candidate.generationPrompt);
  if (!node?.generationPrompt) return cycle;
  const stage = node.role === "quest" ? "quest" : node.role === "boss" ? "boss" : "baseline";
  // Quest and Boss get a second attempt because a single generation failure there
  // costs the whole payoff; baselines fail loudly instead.
  const retryableStage = node.role === "quest" || node.role === "boss";
  const directory = qualityDiagnosticsDir(rootDir, cycle, node);
  const legacyDir = path.join(resolveChildContextDir(cycle.childId, { rootDir }), "homework/games/.validation", node.nodeId, "quality");
  if (cycle.domain === "spelling") preserveLegacySpellingSnapshots(legacyDir, directory, cycle, node);
  const spellingStage = <T>(stage: string, model: string, request: unknown, execute: () => Promise<T>) => {
    preserveLegacySpellingReceipt(legacyDir, directory, stage, model, request);
    return runMathProviderStage({ draftDir: directory, stage, model, request, execute });
  };
  const artworkInput = { prompt: node.artwork.prompt ?? "", node, cycle };
  const createArtwork = () => (input.generateArtwork ?? ((value) => productionArtwork(value, rootDir)))(artworkInput);
  const artworkPath = !node.artwork.localPath && node.artwork.prompt
    ? cycle.domain === "spelling"
      ? await spellingStage("artwork", "existing-artwork-provider", { prompt: artworkInput.prompt, contractHash: progressionContractFingerprint(node) }, createArtwork)
      : await createArtwork()
    : node.artwork.localPath;
  const nodeForGeneration: LearningCycleNodeContract = artworkPath
    ? { ...node, artwork: { ...node.artwork, status: "ready", localPath: artworkPath } }
    : node;
  const generationPrompt = node.generationPrompt.text;
  const generate = input.generateHtml ?? ((creatorInput) => productionGenerate(creatorInput, rootDir));
  const validate = input.validate ?? ((validationInput) => productionValidate(validationInput, rootDir));
  const maxAttempts = retryableStage ? 2 : 1;
  let prompt = generationPrompt;
  let html = "";
  let validation: ProgressionValidationResult = { passed: false, failures: [] };
  let approved = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      let creatorInput: { prompt: string; node: LearningCycleNodeContract; cycle: LearningCycleRecordV2; childContext?: unknown } = { prompt, node: nodeForGeneration, cycle };
      if (cycle.domain === "spelling") {
        const file = path.join(directory, `creator-${attempt}.input.json`);
        const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
        if (fs.existsSync(file)) {
          const saved = JSON.parse(fs.readFileSync(file, "utf8"));
          if (saved.hash !== digest(saved.input) || saved.input.prompt !== prompt || saved.input.cycle.childId !== cycle.childId
            || saved.input.cycle.homeworkId !== cycle.homeworkId || saved.input.cycle.domain !== cycle.domain || saved.input.node.nodeId !== node.nodeId
            || progressionContractFingerprint(saved.input.node) !== progressionContractFingerprint(nodeForGeneration)) throw new Error("spelling_creator_snapshot_changed");
          creatorInput = saved.input;
        } else {
          creatorInput.childContext = input.generateHtml ? {} : creatorChildContext(cycle.childId, rootDir);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          const temporary = `${file}.${process.pid}.tmp`;
          fs.writeFileSync(temporary, JSON.stringify({ hash: digest(creatorInput), input: creatorInput })); fs.renameSync(temporary, file);
        }
      }
      html = cycle.domain === "spelling"
        ? await spellingStage(`creator-${attempt}`, process.env.SUNNY_GENERATION_MODEL ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5", creatorInput, () => generate(creatorInput))
        : await generate(creatorInput);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // Receipt/snapshot failures are not broken HTML: another attempt would
      // bypass the frozen request or its uncertain/completed provider outcome.
      if (!retryableStage || (cycle.domain === "spelling" && /^(provider_|spelling_)/.test(reason))) throw error;
      persistQualityCandidate({ rootDir, cycle, node, iteration: attempt, error: reason });
      console.warn(` 🎮 [canonical-progression] [candidate-invalid] node=${node.nodeId} iteration=${attempt} reason=${reason}`);
      if (attempt < maxAttempts) {
        prompt = `${generationPrompt}

The previous implementation did not produce a complete runnable document:
${reason}

Produce a tighter complete implementation. Preserve the Planner's academic target, evidence limit, unseen-item requirement, node identity, and runtime contract. Return complete self-contained HTML under 24,000 characters.`;
      }
      continue;
    }

    validation = await validate({ html, node: nodeForGeneration, cycle });
    const failures = [...openingIdentityFailures(html, nodeForGeneration), ...validation.failures];
    if (failures.length > 0) {
      if (!retryableStage) {
        throw new Error(`learning_cycle_${stage}_validation_failed:${failures.join("|")}`);
      }
      persistQualityCandidate({
        rootDir,
        cycle,
        node,
        iteration: attempt,
        html,
        validation: { ...validation, passed: false, failures },
      });
      console.warn(` 🎮 [canonical-progression] [candidate-invalid] node=${node.nodeId} iteration=${attempt} reason=${failures.join("|")}`);
      if (attempt < maxAttempts) {
        prompt = `${generationPrompt}

The previous implementation failed technical runtime validation:
${failures.join("\n")}

Existing implementation to correct:
${html}

Correct only the implementation while preserving the Planner's academic target, evidence limit, unseen-item requirement, node identity, and runtime contract. Return complete self-contained HTML under 24,000 characters.`;
      }
      continue;
    }

    if (retryableStage) {
      persistQualityCandidate({ rootDir, cycle, node, iteration: attempt, html, validation });
    }
    approved = true;
    break;
  }

  if (!approved) {
    console.warn(` 🎮 [canonical-progression] [human-review-required] node=${node.nodeId} candidates=${maxAttempts} published=unchanged`);
    return cycle;
  }

  const filename = `${slug(cycle.homeworkId)}-${stage}-${slug(node.experimentId)}.html`;
  const contractFingerprint = progressionContractFingerprint(node);
  const latest = getLearningCycle(cycle.childId, cycle.homeworkId, opts);
  const currentNode = latest?.nodes.find(candidate => candidate.nodeId === node.nodeId);
  if (!latest || !currentNode || currentNode.state !== "generating" || progressionContractFingerprint(currentNode) !== contractFingerprint) {
    throw new Error(`canonical_generation_contract_changed:${node.nodeId}`);
  }
  const gamesDir = path.join(resolveChildContextDir(cycle.childId, { rootDir }), "homework", "games");
  const file = node.role === "baseline"
    ? path.join(gamesDir, cycle.homeworkId, filename)
    : path.join(gamesDir, filename);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html, "utf8");
  return transitionLearningCycle(cycle.childId, cycle.homeworkId, latest.revision, {
    type: "artifact_bound",
    nodeId: node.nodeId,
    artifact: {
      contentId: `${cycle.homeworkId}:${stage}:${node.experimentId}`,
      artifactId: `${node.generationPrompt.promptId}:artifact`,
      localArtifactPath: node.role === "baseline"
        ? `/api/homework/game/${cycle.childId}/${cycle.homeworkId}/${filename}`
        : `/api/homework/game/${cycle.childId}/${filename}`,
      localArtworkPath: artworkPath ?? (stage === "boss" ? "/generated/adventure-board-demo/boss.jpeg" : "/generated/adventure-board-demo/quest.jpeg"),
      contractFingerprint,
      validationStatus: "passed",
      ...(retryableStage ? {
        creativeProvenance: {
          rationale: "Technical runtime validation only; creative judgement is the human review of the captured screenshots.",
          qualityPrediction: "No automated quality score is recorded.",
          creatorPromptHash: createHash("sha256").update(generationPrompt).digest("hex"),
          artworkPromptHash: createHash("sha256").update(node.artwork.prompt ?? "").digest("hex"),
        },
      } : {}),
      ...(validation.screenshotPaths?.length ? {
        validationProof: {
          engine: "playwright" as const,
          passed: true,
          worldStateChanged: true,
          screenshotPaths: validation.screenshotPaths,
          ...(validation.htmlHash ? {htmlHash:validation.htmlHash,verifierVersion:validation.verifierVersion} : {}),
        },
      } : {}),
    },
  }, opts);
}
