import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { validateGeneratedGame } from "../scripts/validateGeneratedGame";
import { getChildChart } from "../profiles/childChart";
import { resolveChildContextDir } from "../utils/contextRoot";
import {
  adaptiveProgressionAcademicContractHash,
  createDirectArtwork,
  designAdaptiveProgressionExperience,
  experienceDesignArtifactHash,
  generateAdaptiveProgressionActivityHtml,
  type ExperienceDesignArtifactV1,
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
  generateArtwork?: (input: {
    prompt: string;
    node: LearningCycleNodeContract;
    cycle: LearningCycleRecordV2;
  }) => Promise<string>;
  designExperience?: (input: {
    node: LearningCycleNodeContract;
    cycle: LearningCycleRecordV2;
    academicContractHash: string;
  }) => Promise<ExperienceDesignArtifactV1>;
  generateHtml?: (input: {
    prompt: string;
    node: LearningCycleNodeContract;
    cycle: LearningCycleRecordV2;
    designArtifact?: ExperienceDesignArtifactV1;
  }) => Promise<string>;
  validate?: (input: { html: string; node: LearningCycleNodeContract; cycle: LearningCycleRecordV2 }) => Promise<ProgressionValidationResult>;
};

type ProgressionValidationResult = {
  passed: boolean;
  failures: string[];
  screenshotPaths?: string[];
  interactionTrace?: unknown;
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

function progressionChildContext(cycle: LearningCycleRecordV2): unknown {
  const chart = getChildChart(cycle.childId);
  return {
    identity: chart.identity,
    demographics: chart.demographics,
    engagementEvidence: engagementTheoryEvidenceContext(chart.engagementTheory),
  };
}

async function productionDesign(input: {
  node: LearningCycleNodeContract;
  cycle: LearningCycleRecordV2;
  academicContractHash: string;
}): Promise<ExperienceDesignArtifactV1> {
  const artifact = await designAdaptiveProgressionExperience({
    cycle: input.cycle,
    node: input.node,
    childContext: progressionChildContext(input.cycle),
  });
  if (artifact.academicContractHash !== input.academicContractHash) {
    throw new Error(`progression_design_artifact_academic_contract_changed:${input.node.nodeId}`);
  }
  return artifact;
}

async function productionGenerate(input: {
  prompt: string;
  node: LearningCycleNodeContract;
  cycle: LearningCycleRecordV2;
  designArtifact?: ExperienceDesignArtifactV1;
}): Promise<string> {
  return generateAdaptiveProgressionActivityHtml({
    cycle: input.cycle,
    node: { ...input.node, generationPrompt: { ...input.node.generationPrompt!, text: input.prompt } },
    childContext: progressionChildContext(input.cycle),
    designArtifact: input.designArtifact,
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
  const runtime = await validateGeneratedArtifactRuntime({
    html: input.html,
    childId: input.cycle.childId,
    stage,
    homeworkType: input.cycle.domain,
    words: input.node.academicTarget.targets,
    outputDir: path.join(resolveChildContextDir(input.cycle.childId, { rootDir }), "homework", "games", ".validation", input.node.nodeId),
  });
  return {
    passed: runtime.passed,
    failures: runtime.failures,
    screenshotPaths: runtime.runtimeValidation?.screenshotPaths ?? [],
    interactionTrace: runtime.runtimeValidation ?? null,
  };
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
    node.nodeId,
    "quality",
  );
}

function frozenDesignArtifactFile(
  rootDir: string,
  cycle: LearningCycleRecordV2,
  node: LearningCycleNodeContract,
): string {
  return path.join(qualityDiagnosticsDir(rootDir, cycle, node), "design-artifact.json");
}

function readFrozenDesignArtifact(input: {
  rootDir: string;
  cycle: LearningCycleRecordV2;
  node: LearningCycleNodeContract;
  academicContractHash: string;
}): ExperienceDesignArtifactV1 | undefined {
  const file = frozenDesignArtifactFile(input.rootDir, input.cycle, input.node);
  if (!fs.existsSync(file)) return undefined;
  const artifact = JSON.parse(fs.readFileSync(file, "utf8")) as ExperienceDesignArtifactV1;
  if (artifact.nodeId !== input.node.nodeId || artifact.academicContractHash !== input.academicContractHash) {
    throw new Error(`progression_design_checkpoint_contract_mismatch:${input.node.nodeId}`);
  }
  return artifact;
}

function persistFrozenDesignArtifact(input: {
  rootDir: string;
  cycle: LearningCycleRecordV2;
  node: LearningCycleNodeContract;
  artifact: ExperienceDesignArtifactV1;
}): void {
  const file = frozenDesignArtifactFile(input.rootDir, input.cycle, input.node);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(input.artifact, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

function persistQualityCandidate(input: {
  rootDir: string;
  cycle: LearningCycleRecordV2;
  node: LearningCycleNodeContract;
  iteration: number;
  html?: string;
  validation?: ProgressionValidationResult;
  designArtifact?: ExperienceDesignArtifactV1;
  error?: string;
}): void {
  const dir = qualityDiagnosticsDir(input.rootDir, input.cycle, input.node);
  fs.mkdirSync(dir, { recursive: true });
  if (input.html) fs.writeFileSync(path.join(dir, `iteration-${input.iteration}.html`), input.html, "utf8");
  fs.writeFileSync(path.join(dir, `iteration-${input.iteration}.json`), `${JSON.stringify({
    iteration: input.iteration,
    designArtifactHash: input.designArtifact ? experienceDesignArtifactHash(input.designArtifact) : null,
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
  const node = cycle.nodes.find((candidate) => candidate.state === "generating" && candidate.generationPrompt);
  if (!node?.generationPrompt) return cycle;
  const stage = node.role === "quest" ? "quest" : node.role === "boss" ? "boss" : "baseline";
  // Quest and Boss get a second attempt because a single generation failure there
  // costs the whole payoff; baselines fail loudly instead.
  const retryableStage = node.role === "quest" || node.role === "boss";
  const artworkPath = !node.artwork.localPath && node.artwork.prompt
    ? await (input.generateArtwork ?? ((artworkInput) => productionArtwork(artworkInput, rootDir)))({
        prompt: node.artwork.prompt,
        node,
        cycle,
      })
    : node.artwork.localPath;
  const nodeForGeneration: LearningCycleNodeContract = artworkPath
    ? { ...node, artwork: { ...node.artwork, status: "ready", localPath: artworkPath } }
    : node;
  const generationPrompt = node.generationPrompt.text;
  const academicContractHash = adaptiveProgressionAcademicContractHash(cycle, nodeForGeneration);
  const frozenDesignArtifact = retryableStage
    ? readFrozenDesignArtifact({ rootDir, cycle, node: nodeForGeneration, academicContractHash })
    : undefined;
  const designArtifact = retryableStage
    ? frozenDesignArtifact ?? await (input.designExperience ?? productionDesign)({
        node: nodeForGeneration,
        cycle,
        academicContractHash,
      })
    : undefined;
  if (designArtifact && designArtifact.academicContractHash !== academicContractHash) {
    throw new Error(`progression_design_artifact_academic_contract_changed:${node.nodeId}`);
  }
  if (designArtifact && !frozenDesignArtifact) {
    persistFrozenDesignArtifact({ rootDir, cycle, node: nodeForGeneration, artifact: designArtifact });
  }
  if (designArtifact) {
    console.log(` 🎮 [canonical-progression] [design-${frozenDesignArtifact ? "reused" : "frozen"}] node=${node.nodeId} hash=${experienceDesignArtifactHash(designArtifact).slice(0, 12)}`);
    if (!fs.existsSync(frozenDesignArtifactFile(rootDir, cycle, nodeForGeneration))) {
      throw new Error(`progression_design_checkpoint_missing_before_build:${node.nodeId}`);
    }
  }
  const designArtifactHash = designArtifact ? experienceDesignArtifactHash(designArtifact) : undefined;
  const generate = input.generateHtml ?? productionGenerate;
  const validate = input.validate ?? ((validationInput) => productionValidate(validationInput, rootDir));
  const maxAttempts = retryableStage ? 2 : 1;
  let prompt = generationPrompt;
  let html = "";
  let validation: ProgressionValidationResult = { passed: false, failures: [] };
  let approved = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      html = await generate({ prompt, node: nodeForGeneration, cycle, designArtifact });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (!retryableStage) throw error;
      persistQualityCandidate({ rootDir, cycle, node, iteration: attempt, designArtifact, error: reason });
      console.warn(` 🎮 [canonical-progression] [candidate-invalid] node=${node.nodeId} iteration=${attempt} reason=${reason}`);
      if (attempt < maxAttempts) {
        prompt = `${generationPrompt}

The previous implementation did not produce a complete runnable document:
${reason}

Produce a tighter complete implementation. Preserve the Planner's academic target, evidence limit, unseen-item requirement, node identity, and runtime contract. Return complete self-contained HTML under 24,000 characters.`;
      }
      continue;
    }

    try {
      validation = await validate({ html, node: nodeForGeneration, cycle });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (!retryableStage) throw error;
      const failures = [`runtime_validator_error:${reason}`];
      persistQualityCandidate({
        rootDir, cycle, node, iteration: attempt, html, designArtifact,
        validation: { passed: false, failures },
      });
      console.warn(` 🎮 [canonical-progression] [candidate-invalid] node=${node.nodeId} iteration=${attempt} reason=${failures.join("|")}`);
      if (attempt < maxAttempts) {
        prompt = `${generationPrompt}

The previous implementation could not complete technical runtime validation:
${failures.join("\n")}

Existing implementation to correct:
${html}

Correct only the implementation while preserving the frozen design artifact, Planner academic target, evidence limit, unseen-item requirement, node identity, and runtime contract. Return complete self-contained HTML under 24,000 characters.`;
      }
      continue;
    }
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
        designArtifact,
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
      persistQualityCandidate({ rootDir, cycle, node, iteration: attempt, html, validation, designArtifact });
    }
    approved = true;
    break;
  }

  if (!approved) {
    console.warn(` 🎮 [canonical-progression] [human-review-required] node=${node.nodeId} candidates=${maxAttempts} published=unchanged`);
    return cycle;
  }

  const filename = `${slug(cycle.homeworkId)}-${stage}-${slug(node.experimentId)}.html`;
  const gamesDir = path.join(resolveChildContextDir(cycle.childId, { rootDir }), "homework", "games");
  const file = node.role === "baseline"
    ? path.join(gamesDir, cycle.homeworkId, filename)
    : path.join(gamesDir, filename);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html, "utf8");
  const contractFingerprint = createHash("sha256").update(JSON.stringify({
    title: node.title,
    academicTarget: node.academicTarget,
    mechanic: node.mechanic,
    theme: node.theme,
    openingScreen: node.openingScreen,
    designArtifactHash,
    sfxContract: node.sfxContract,
    companionContract: node.companionContract,
    evidenceContract: node.evidenceContract,
  })).digest("hex").slice(0, 24);
  return transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, {
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
          creatorPromptHash: createHash("sha256").update(JSON.stringify({ generationPrompt, designArtifact })).digest("hex"),
          artworkPromptHash: createHash("sha256").update(node.artwork.prompt ?? "").digest("hex"),
          architectModel: process.env.SUNNY_ARCHITECT_MODEL ?? "claude-fable-5",
          builderProvider: "anthropic" as const,
          builderModel: process.env.SUNNY_QUEST_BOSS_BUILDER_MODEL ?? "claude-opus-5",
          academicContractHash,
          designArtifactHash,
          generatedHtmlHash: createHash("sha256").update(html).digest("hex"),
        },
      } : {}),
      ...(validation.screenshotPaths?.length ? {
        validationProof: {
          engine: "playwright" as const,
          passed: true,
          worldStateChanged: true,
          screenshotPaths: validation.screenshotPaths,
        },
      } : {}),
    },
  }, opts);
}
