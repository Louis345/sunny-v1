import {verifyPreparingBoardCanvas} from './adventureBoardCanvas';
import { prebuiltGameClient } from "./prebuiltBoard";
import { thumbnailUrlForActivity } from "../shared/activityPresentation";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { validateGeneratedGame } from "../scripts/validateGeneratedGame";
import { getChildChart } from "../profiles/childChart";
import { resolveChildContextDir } from "../utils/contextRoot";
import {
  acquireMathGenerationLease,
  hashDiscoveryContract,
  releaseMathGenerationLease,
  resolveAdaptiveMathDraftDir,
  runMathProviderStage,
} from "./adaptiveMathDiscovery";
import {
  buildMathCreativeChildContext, createDirectArtwork, generateAdaptiveProgressionActivityHtml,
} from "./directMathExperience";
import { engagementTheoryEvidenceContext } from "./engagementTheory";
import {
  CUT_OFF_STOP_REASON,
  getLearningCycle,
  transitionLearningCycle,
  type LearningCycleNodeContract,
  type LearningCycleRecordV2,
  type LearningCycleRepositoryOptions,
} from "./learningCycleRepository";
import { currentBoardInstance, preparingBoardInstance } from "./learningBoardInstances";
import { gameProblems, prepareGeneratedSpellingGame, type SpellingGameClient } from "./spellingGameBuilder";
import { LIBRARY_GAMES, libraryGameHtml } from "./libraryGames";

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
  /** The model client for her generated spelling games; tests pass a recorded one. */
  spellingGameClient?: SpellingGameClient;
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
  return buildMathCreativeChildContext(chart);
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

/** Only the cheap text check runs before an activity opens. There is no browser
 * run and no AI screenshot judge: the child playing it, and her scored answers,
 * are the check. */
function textCheckFailures(html: string, node: LearningCycleNodeContract, cycle: LearningCycleRecordV2): string[] {
  const stage = node.role === "boss" ? "boss" : node.role === "quest" ? "quest" : "baseline";
  return validateGeneratedGame(html, {
    words: node.academicTarget.targets,
    homeworkType: cycle.domain,
    childId: cycle.childId,
    generationStage: stage,
    artifactForm: "self-contained",
  }).failures;
}

async function productionValidate(input: { html: string; node: LearningCycleNodeContract; cycle: LearningCycleRecordV2 }): Promise<ProgressionValidationResult> {
  const failures = textCheckFailures(input.html, input.node, input.cycle);
  return { passed: failures.length === 0, failures };
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
    "assignments",
    cycle.homeworkId,
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
    const diagnostics = path.join(legacyDir, "provider-diagnostics");
    for (const name of fs.existsSync(diagnostics) ? fs.readdirSync(diagnostics) : []) {
      if (name.startsWith(`${requestHash}.attempt-`) && /^[a-f0-9]{64}\.attempt-[1-9]\d*\.request\.json$/.test(name)) {
        copyLegacyCheckpoint(path.join(diagnostics, name), path.join(directory, "provider-diagnostics", name));
      }
    }
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

/** The newest saved build or check failure for a node, so its Not ready portal keeps the real reason. */
function latestQualityFailure(rootDir: string, cycle: LearningCycleRecordV2, node: LearningCycleNodeContract): string | undefined {
  const dir = qualityDiagnosticsDir(rootDir, cycle, node);
  const latest = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).map(name => /^iteration-(\d+)\.json$/.exec(name)).filter(Boolean).sort((a, b) => Number(b![1]) - Number(a![1]))[0];
  if (!latest) return undefined;
  const saved = JSON.parse(fs.readFileSync(path.join(dir, latest[0]), "utf8")) as { validation?: { failures?: string[] } | null; error?: string | null };
  return saved.validation?.failures?.join(" | ") || saved.error || undefined;
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
  if (node.libraryGame) return bindLibraryGame(cycle, node, opts);
  const stage = node.role === "quest" ? "quest" : node.role === "boss" ? "boss" : "baseline";
  // Every generated activity gets one bounded repair from validator evidence.
  // Frozen-request and provider-outcome uncertainty still stop immediately.
  const maxAttempts = 2;
  const directory = qualityDiagnosticsDir(rootDir, cycle, node);
  const legacyDir = path.join(resolveChildContextDir(cycle.childId, { rootDir }), "homework/games/.validation", node.nodeId, "quality");
  preserveLegacySpellingSnapshots(legacyDir, directory, cycle, node);
  const providerStage = <T>(stageName: string, model: string, request: unknown, execute: () => Promise<T>) => {
    preserveLegacySpellingReceipt(legacyDir, directory, stageName, model, request);
    return runMathProviderStage({ draftDir: directory, stage: stageName, model, request, execute });
  };
  const artworkInput = { prompt: node.artwork.prompt ?? "", node, cycle };
  const createArtwork = () => (input.generateArtwork ?? ((value) => productionArtwork(value, rootDir)))(artworkInput);
  const artworkPath = !node.artwork.localPath && node.artwork.prompt
    ? await providerStage("artwork", "existing-artwork-provider", { prompt: artworkInput.prompt, contractHash: progressionContractFingerprint(node) }, createArtwork)
    : node.artwork.localPath;
  const nodeForGeneration: LearningCycleNodeContract = artworkPath
    ? { ...node, artwork: { ...node.artwork, status: "ready", localPath: artworkPath } }
    : node;
  const generationPrompt = node.generationPrompt.text;
  const generate = input.generateHtml ?? ((creatorInput) => productionGenerate(creatorInput, rootDir));
  const creatorModel = process.env.SUNNY_GENERATION_MODEL ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5";
  const validate = input.validate ?? productionValidate;
  let prompt = generationPrompt;
  let html = "";
  let validation: ProgressionValidationResult = { passed: false, failures: [] };
  let approved = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      let creatorInput: { prompt: string; node: LearningCycleNodeContract; cycle: LearningCycleRecordV2; childContext?: unknown } = { prompt, node: nodeForGeneration, cycle };
      const file = path.join(directory, `creator-${attempt}.input.json`);
      const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
      if (fs.existsSync(file)) {
        const saved = JSON.parse(fs.readFileSync(file, "utf8"));
        if (saved.hash !== digest(saved.input) || (attempt === 1 && saved.input.prompt !== prompt) || saved.input.cycle.childId !== cycle.childId
          || saved.input.cycle.homeworkId !== cycle.homeworkId || saved.input.cycle.domain !== cycle.domain || saved.input.node.nodeId !== node.nodeId
          || progressionContractFingerprint(saved.input.node) !== progressionContractFingerprint(nodeForGeneration)) throw new Error(`${cycle.domain}_creator_snapshot_changed`);
        creatorInput = saved.input;
      } else {
        creatorInput.childContext = input.generateHtml ? {} : creatorChildContext(cycle.childId, rootDir);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const temporary = `${file}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify({ hash: digest(creatorInput), input: creatorInput })); fs.renameSync(temporary, file);
      }
      html = await providerStage(`creator-${attempt}`, creatorModel, creatorInput, () => generate(creatorInput));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // Receipt/snapshot failures are not broken HTML: another attempt would
      // bypass the frozen request or its uncertain/completed provider outcome.
      if (/^(provider_|(?:math|spelling)_creator_snapshot_changed)/.test(reason)) throw error;
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

    if (node.role === "quest" || node.role === "boss") {
      persistQualityCandidate({ rootDir, cycle, node, iteration: attempt, html, validation });
    }
    approved = true;
    break;
  }

  if (!approved) {
    console.warn(` 🎮 [canonical-progression] [human-review-required] node=${node.nodeId} candidates=${maxAttempts} published=unchanged`);
    return cycle;
  }

  const latest = getLearningCycle(cycle.childId, cycle.homeworkId, opts);
  const currentNode = latest?.nodes.find(candidate => candidate.nodeId === node.nodeId);
  if (!latest || !currentNode || currentNode.state !== "generating" || progressionContractFingerprint(currentNode) !== progressionContractFingerprint(node)) {
    throw new Error(`canonical_generation_contract_changed:${node.nodeId}`);
  }
  return bindGeneratedHtml({ cycle: latest, node, html, artworkPath, validation }, opts);
}

/**
 * The owner's one approved reveal path (owner, 2026-11-11; approved under the Math Prompt Chain Boundary, Reina's
 * math included): a Quest/Boss stop the Planner put a library game on is the hand-built game, filled with the node's
 * frozen items. No model call; binding, lifecycle and serving are the same as a Creator-built stop.
 */
function bindLibraryGame(cycle: LearningCycleRecordV2, node: LearningCycleNodeContract, opts: LearningCycleRepositoryOptions): LearningCycleRecordV2 {
  const id = node.libraryGame!;
  const answerOf = (item: NonNullable<LearningCycleNodeContract["evidenceContract"]["itemContracts"]>[string]) =>
    item.response.mode === "numeric" ? String(item.response.expected) : item.response.mode === "selection" ? item.response.options.find(option => option.correct)?.label : undefined;
  const items = cycle.domain === "spelling"
    ? Object.values(node.evidenceContract.spellingItems ?? {}).map(item => ({ itemId: item.wordId, prompt: item.word, answer: item.word }))
    : Object.values(node.evidenceContract.itemContracts ?? {}).flatMap(item => { const answer = answerOf(item); return answer === undefined ? [] : [{ itemId: item.id, prompt: item.prompt, answer }]; });
  const { html, matchedItemIds, unmatchedTargets } = libraryGameHtml({ id, childId: cycle.childId, nodeId: node.nodeId, items, rootDir: opts.rootDir });
  const problems = gameProblems(html, cycle.domain);
  console.log(` 🎮 [library-game] [filled] node=${node.nodeId} game=${id} items=${items.length} matched=${matchedItemIds.length} unmatched=${unmatchedTargets.length} checks=${problems.length ? problems.join("|") : "clean"}`);
  // A game none of her items reach would record nothing: that stop degrades to Not ready instead.
  if (!matchedItemIds.length) throw new Error(`library_game_no_items_matched:${id}`);
  return bindGeneratedHtml({ cycle, node, html, artworkPath: node.artwork.localPath, libraryGame: id }, opts);
}

/** Write an accepted activity where the kiosk serves it and bind it to its node. */
function bindGeneratedHtml(input: {
  cycle: LearningCycleRecordV2; node: LearningCycleNodeContract; html: string; artworkPath?: string | null; validation?: ProgressionValidationResult;
  /** Set when the html is the owner's library game, so provenance says so rather than claiming the Creator. */
  libraryGame?: keyof typeof LIBRARY_GAMES;
}, opts: LearningCycleRepositoryOptions): LearningCycleRecordV2 {
  const { cycle, node, html, artworkPath, validation, libraryGame } = input;
  const rootDir = opts.rootDir ?? process.cwd();
  const stage = node.role === "quest" ? "quest" : node.role === "boss" ? "boss" : "baseline";
  const filename = `${slug(cycle.homeworkId)}-${stage}-${slug(node.experimentId)}.html`;
  const contractFingerprint = progressionContractFingerprint(node);
  const gamesDir = path.join(resolveChildContextDir(cycle.childId, { rootDir }), "homework", "games");
  const file = node.role === "baseline"
    ? path.join(gamesDir, cycle.homeworkId, filename)
    : path.join(gamesDir, filename);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html, "utf8");
  return transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, {
    type: "artifact_bound",
    nodeId: node.nodeId,
    artifact: {
      contentId: `${cycle.homeworkId}:${stage}:${node.experimentId}`,
      artifactId: `${node.generationPrompt!.promptId}:artifact`,
      localArtifactPath: node.role === "baseline"
        ? `/api/homework/game/${cycle.childId}/${cycle.homeworkId}/${filename}`
        : `/api/homework/game/${cycle.childId}/${filename}`,
      localArtworkPath: artworkPath ?? (stage === "boss" ? "/generated/adventure-board-demo/boss.jpeg" : "/generated/adventure-board-demo/quest.jpeg"),
      contractFingerprint,
      validationStatus: "passed",
      ...(libraryGame ? {
        creativeProvenance: {
          rationale: `Owner-chosen library game ${libraryGame} (${LIBRARY_GAMES[libraryGame].title}), hand-built and placed on this stop by the Planner; not Creator-generated.`,
          qualityPrediction: "No numeric quality score is inferred.",
          creatorPromptHash: createHash("sha256").update(`library-game:${libraryGame}`).digest("hex"),
          artworkPromptHash: createHash("sha256").update(node.artwork.prompt ?? "").digest("hex"),
          builderModel: `library-game:${libraryGame}`,
          generatedHtmlHash: createHash("sha256").update(html).digest("hex"),
        },
      } : (node.role === "quest" || node.role === "boss") ? {
        creativeProvenance: {
          rationale: "Publication requires the text check only; the child playing it is the review.",
          qualityPrediction: "No numeric quality score is inferred.",
          creatorPromptHash: createHash("sha256").update(node.generationPrompt!.text).digest("hex"),
          artworkPromptHash: createHash("sha256").update(node.artwork.prompt ?? "").digest("hex"),
        },
      } : {}),
      ...(validation?.screenshotPaths?.length ? {
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

/**
 * Repair a Not ready activity on the current board in place, once, with no provider call.
 * Spelling re-runs the tested built-in the step named; other subjects bind the first of the
 * Creator's own saved attempts that passes today's text check.
 */
export function repairNotReadyActivity(
  input: { childId: string; homeworkId: string; nodeId: string },
  opts: LearningCycleRepositoryOptions = {},
): LearningCycleRecordV2 {
  const rootDir = opts.rootDir ?? process.cwd();
  const cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  const node = cycle.nodes.find(candidate => candidate.nodeId === input.nodeId);
  const onCurrentBoard = !cycle.boards || currentBoardInstance(cycle).nodeIds.includes(input.nodeId);
  if (!node?.notReadyReason || node.artifactBinding || !node.generationPrompt || !onCurrentBoard) {
    throw new Error(`not_ready_repair_not_eligible:${input.nodeId}`);
  }
  // Spelling re-runs the tested built-in the step named; older steps named it by repeating its ID.
  if (cycle.domain === "spelling") {
    const builtInActivityId = node.nodeId.replace(/^.*:b\d+:/, "");
    let repointed: LearningCycleRecordV2;
    try {
      repointed = transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, { type: "not_ready_rerun_builtin", nodeId: node.nodeId, builtInActivityId }, opts);
    } catch (error) {
      console.warn(` 🎮 [board] [portal] [repair-failed] node=${node.nodeId} reason=${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
    const rerun = repointed.nodes.find(candidate => candidate.nodeId === node.nodeId)!;
    console.log(` 🎮 [board] [portal] [repaired] node=${node.nodeId} builtin=${rerun.reusedFrom} provider_calls=0`);
    return launchBuiltInActivity(input.childId, input.homeworkId, repointed, rerun, opts);
  }
  const dir = qualityDiagnosticsDir(rootDir, cycle, node);
  const attempts = (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    .map(name => /^iteration-(\d+)\.html$/.exec(name)).filter((match): match is RegExpExecArray => Boolean(match))
    .sort((a, b) => Number(a[1]) - Number(b[1]));
  for (const attempt of attempts) {
    const html = fs.readFileSync(path.join(dir, attempt[0]), "utf8");
    const failures = [...openingIdentityFailures(html, node), ...textCheckFailures(html, node, cycle)];
    if (failures.length > 0) {
      console.log(` 🎮 [board] [portal] [repair-attempt-skipped] node=${node.nodeId} attempt=${attempt[1]} reason=${failures.join("|")}`);
      continue;
    }
    console.log(` 🎮 [board] [portal] [repaired] node=${node.nodeId} attempt=${attempt[1]} provider_calls=0`);
    return bindGeneratedHtml({ cycle, node, html, artworkPath: node.artwork.localPath }, opts);
  }
  console.warn(` 🎮 [board] [portal] [repair-failed] node=${node.nodeId} attempts=${attempts.length} reason=no_passing_attempt`);
  throw new Error(`not_ready_repair_no_passing_attempt:${input.nodeId}`);
}

/** Repair every Not ready generated activity on the current board; one bounded pass, each result reported. */
export function repairNotReadyActivities(
  input: { childId: string; homeworkId: string },
  opts: LearningCycleRepositoryOptions = {},
): Array<{ nodeId: string; repaired: boolean; reason?: string }> {
  const cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  const board = cycle.boards ? currentBoardInstance(cycle).nodeIds : cycle.nodes.map(node => node.nodeId);
  const candidates = cycle.nodes.filter(node => node.notReadyReason && !node.artifactBinding && node.generationPrompt && board.includes(node.nodeId));
  return candidates.map(({ nodeId }) => {
    try {
      repairNotReadyActivity({ ...input, nodeId }, opts);
      return { nodeId, repaired: true };
    } catch (error) {
      return { nodeId, repaired: false, reason: error instanceof Error ? error.message : String(error) };
    }
  });
}

/**
 * One person-approved paid rebuild of a built-game stop whose build was cut off (owner, 2026-11-11), like the
 * next-board question retry of 2026-11-04. The approval is recorded first, the cut-off receipts are set aside
 * (never deleted), and the stop is rebuilt once through the board's own builder. A failure keeps it Not ready.
 */
export async function retryCutOffStop(
  input: { childId: string; homeworkId: string; nodeId: string; reason: string; client?: SpellingGameClient },
  opts: LearningCycleRepositoryOptions = {},
): Promise<{ cycle: LearningCycleRecordV2; rebuilt: boolean; failure?: string; setAside: string[]; setAsideDir?: string }> {
  const rootDir = opts.rootDir ?? process.cwd();
  const log = (action: string, result: string, detail: string) => console.log(` 🎮 [board] [${action}] [${result}] child=${input.childId} homework=${input.homeworkId} node=${input.nodeId}${detail ? ` ${detail}` : ""}`);
  const cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  const node = cycle.nodes.find(candidate => candidate.nodeId === input.nodeId);
  const draftDir = node ? qualityDiagnosticsDir(rootDir, cycle, node) : "";
  const receipts = path.join(draftDir, "provider-receipts");
  // The reason names the cut-off receipt by its absolute path (node IDs hold colons), so only its file name is read.
  const receiptName = node?.notReadyReason?.startsWith(CUT_OFF_STOP_REASON) ? /provider-receipts\/([a-f0-9]{64}\.json)/.exec(node.notReadyReason)?.[1] : undefined;
  const cutOffReceipt = receiptName ? path.join(receipts, receiptName) : "";
  const cutOffStatus = cutOffReceipt && fs.existsSync(cutOffReceipt) ? (JSON.parse(fs.readFileSync(cutOffReceipt, "utf8")) as { status?: string }).status : undefined;
  const refusal = !node ? "no_such_node"
    : !cycle.boards || !currentBoardInstance(cycle).nodeIds.includes(node.nodeId) ? "not_on_current_board"
    : !node.notReadyReason?.startsWith(CUT_OFF_STOP_REASON) ? `not_ready_reason_is_not_provider_outcome_uncertain:${node.notReadyReason ?? "ready"}`
    : node.artifactBinding ? "already_bound"
    : node.implementationType !== "generated-game" || node.reusedFrom || node.libraryGame || !node.generationPrompt ? `not_a_built_game:${node.implementationType ?? "none"}`
    : !["in_flight", "outcome_uncertain"].includes(cutOffStatus ?? "") ? `cut_off_receipt_not_uncertain:${cutOffStatus ?? "missing"}:${cutOffReceipt}`
    : !input.reason.trim() ? "reason_required" : "";
  if (refusal) {
    log("retry-cut-off-stop", "refused", `reason=${refusal}`);
    throw new Error(`cut_off_stop_retry_not_eligible:${input.nodeId}:${refusal}`);
  }
  const lease = acquireMathGenerationLease({ rootDir: opts.rootDir, childId: input.childId, homeworkId: input.homeworkId });
  if (!lease.acquired || !lease.token) {
    log("retry-cut-off-stop", "refused", "reason=another_build_is_running");
    throw new Error(`cut_off_stop_retry_not_eligible:${input.nodeId}:another_build_is_running`);
  }
  try {
    // The approval is durable before any purchase: a crash from here on leaves the stop Not ready and never re-approvable.
    let current = transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, { type: "not_ready_paid_retry_authorized", nodeId: input.nodeId, reason: input.reason }, opts);
    log("retry-cut-off-stop", "approved", `revision=${current.revision} cut_off_receipt=${cutOffReceipt}`);
    // The cut-off build's receipts and request diagnostics are set aside, never deleted, so the builder starts fresh.
    const setAsideDir = path.join(draftDir, "superseded", `paid-retry-r${current.revision}`);
    const setAside: string[] = [];
    for (const folder of ["provider-receipts", "provider-diagnostics"]) {
      const from = path.join(draftDir, folder);
      if (!fs.existsSync(from)) continue;
      fs.mkdirSync(path.join(setAsideDir, folder), { recursive: true });
      for (const name of fs.readdirSync(from)) {
        const to = path.join(setAsideDir, folder, name);
        fs.renameSync(path.join(from, name), to);
        setAside.push(to);
        log("retry-cut-off-stop", "set-aside", `from=${path.join(from, name)} to=${to}`);
      }
    }
    const pending = current.nodes.find(candidate => candidate.nodeId === input.nodeId)!;
    let failure = "";
    try {
      log("retry-cut-off-stop", "building", "attempts=1 paid=true");
      const next = await prepareGeneratedSpellingGame({ cycle: current, node: pending, client: input.client ?? prebuiltGameClient(input.childId, input.homeworkId, pending.nodeId, opts), draftDir }, opts);
      if (next.revision === current.revision) failure = latestQualityFailure(rootDir, current, pending) ?? "human_review_required";
      else current = next;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      current = getLearningCycle(input.childId, input.homeworkId, opts)!;
    }
    if (failure) {
      current = transitionLearningCycle(input.childId, input.homeworkId, current.revision, { type: "not_ready_paid_retry_failed", nodeId: input.nodeId, reason: failure }, opts);
      log("retry-cut-off-stop", "still-not-ready", `reason=${failure}`);
      return { cycle: current, rebuilt: false, failure, setAside, setAsideDir };
    }
    log("retry-cut-off-stop", "rebuilt", `revision=${current.revision} artifact=${current.nodes.find(candidate => candidate.nodeId === input.nodeId)?.artifactBinding?.localArtifactPath}`);
    return { cycle: current, rebuilt: true, setAside, setAsideDir };
  } finally {
    releaseMathGenerationLease({ rootDir: opts.rootDir, childId: input.childId, homeworkId: input.homeworkId, token: lease.token });
  }
}

/**
 * Implement and verify every node of the one preparing successor board, reusing
 * nodes already bound by an earlier run. The board publishes on its last verified
 * binding; it never opens a node or interrupts the child.
 */
/** Launch a built-in spelling game for this node's fresh items: the earlier activity the Planner named,
 * or a game and mode from the menu set up from the node's own contract. No build, no provider. */
function launchBuiltInActivity(childId: string, homeworkId: string, cycle: LearningCycleRecordV2, node: LearningCycleNodeContract, opts: LearningCycleRepositoryOptions): LearningCycleRecordV2 {
  const rootDir = opts.rootDir ?? process.cwd();
  const source = node.reusedFrom ? cycle.nodes.find((candidate) => candidate.nodeId === node.reusedFrom) : undefined;
  if (node.reusedFrom && !source?.artifactBinding) throw new Error(`reused_activity_missing:${node.reusedFrom}`);
  const contextDir = resolveChildContextDir(childId, { rootDir });
  const nativeDir = path.join(resolveAdaptiveMathDraftDir(childId, homeworkId, { rootDir }), "native-instruments");
  const fileFor = (nodeId: string) => path.join(nativeDir, `${nodeId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
  // Discovery and a fresh game keep their setup on their own contract and have no instrument file to start from.
  const fromContract = (row: LearningCycleNodeContract) => ({ type: row.implementationType, activityId: row.implementationType, difficulty: 1,
    ...(row.evidenceContract.nativeConfig?.wordRadarConfig ? { wordRadarConfig: row.evidenceContract.nativeConfig.wordRadarConfig } : {}) });
  const sourceNode = !source ? fromContract(node) : source.role === "evaluation" ? fromContract(source)
    : (JSON.parse(fs.readFileSync(fileFor(source.nodeId), "utf8")) as { node: Record<string, unknown> }).node;
  const configuration = { version: 1, node: { ...sourceNode, id: node.nodeId, title: node.title, targets: [...node.academicTarget.targets] }, evidenceContract: node.evidenceContract };
  const write = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(`${file}.${process.pid}.tmp`, JSON.stringify(value, null, 2)); fs.renameSync(`${file}.${process.pid}.tmp`, file); };
  write(fileFor(node.nodeId), configuration);
  let activityConfigPath: string | undefined;
  if (node.evidenceContract.nativeConfig) {
    const filename = `${node.nodeId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${hashDiscoveryContract(node.nodeId).slice(0, 8)}.json`;
    write(path.join(contextDir, "homework/games", homeworkId, filename), node.evidenceContract.nativeConfig);
    activityConfigPath = `/api/activity-config/${childId}/${homeworkId}/${filename}`;
  }
  console.log(` 🎮 [learning-board] [successor-preparation] [${source ? "reused" : "fresh"}] node=${node.nodeId} from=${source?.nodeId ?? "menu"} type=${node.implementationType}`);
  return transitionLearningCycle(childId, homeworkId, cycle.revision, { type: "artifact_bound", nodeId: node.nodeId, artifact: {
    contentId: `${homeworkId}:${node.nodeId}`, artifactId: `${homeworkId}:${node.nodeId}:native`,
    localArtifactPath: node.implementationType === "visual-explainer" ? "/games/spelling-visual-explainer.html" : `/${path.relative(contextDir, fileFor(node.nodeId)).split(path.sep).join("/")}`,
    localArtworkPath: source?.artifactBinding?.localArtworkPath ?? thumbnailUrlForActivity(node.implementationType ?? "word-radar"), contractFingerprint: hashDiscoveryContract(configuration), validationStatus: "passed",
    ...(activityConfigPath ? { activityConfigPath } : {}),
  } }, opts);
}

export async function prepareSuccessorBoard(
  input: Omit<CanonicalProgressionGeneratorInput, "nodeId">,
  opts: LearningCycleRepositoryOptions = {},
): Promise<LearningCycleRecordV2> {
  let cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  // Pre-contract-21 cycles finish their in-flight legacy node through the legacy generator.
  if (!cycle.boards) return generateCanonicalProgressionArtifact(input, opts);
  const board = preparingBoardInstance(cycle);
  if (!board || cycle.lifecycle === "blocked") return cycle;
  const lease = acquireMathGenerationLease({ rootDir: opts.rootDir, childId: input.childId, homeworkId: input.homeworkId });
  if (!lease.acquired || !lease.token) {
    console.log(` 🎮 [learning-board] [successor-preparation] [already-running] board=${board.boardId}`);
    return cycle;
  }
  try {
    try {
      await verifyPreparingBoardCanvas({rootDir:opts.rootDir??process.cwd(),childId:input.childId,homeworkId:input.homeworkId,acceptAsAuthored:true,directory:path.join(resolveChildContextDir(input.childId,opts),'homework','canvas-verification',board.boardId.replace(/[^a-zA-Z0-9_-]/g,'_'))});
    } catch (error) {
      console.warn(` 🎮 [learning-board] [canvas-diagnostic] [unavailable] board=${board.boardId} reason=${error instanceof Error ? error.message : String(error)}`);
    }
    cycle=getLearningCycle(input.childId,input.homeworkId,opts)!;
    // An activity held for attention before this rule becomes Not ready at $0, keeping its recorded reason.
    const heldReason = [...cycle.decisionHistory].reverse().find(row => row.eventType === "artifact_generation_attention_required")?.reason ?? "activity_build_failed";
    for (const held of cycle.nodes.filter((node) => board.nodeIds.includes(node.nodeId) && node.state === "blocked" && !node.notReadyReason)) {
      console.warn(` 🎮 [learning-board] [successor-preparation] [not-ready] board=${board.boardId} node=${held.nodeId} reason=${heldReason}`);
      cycle = transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, { type: "artifact_generation_attention_required", nodeId: held.nodeId, reason: heldReason, notReady: true }, opts);
    }
    for (let attempt = 0; attempt <= board.nodeIds.length; attempt += 1) {
      const pending = cycle.nodes.find((node) => board.nodeIds.includes(node.nodeId) && node.state === "generating" && node.generationPrompt);
      if (!pending) return cycle;
      let next: LearningCycleRecordV2;
      let failure = "";
      try {
        // Spelling boards run only tested built-in games: a step with none to launch is Not ready, never built.
        if (cycle.domain === "spelling" && !pending.reusedFrom && !pending.implementationType && !pending.libraryGame) throw new Error("spelling_no_reusable_builtin");
        // Her own game is built for her once, from her chart and the Planner's story; a re-run reuses its file.
        // Any subject's built-game stop goes to the one builder (owner, 2026-11-08: one pipeline).
        // The owner's library game is served, not built (owner, 2026-11-11).
        next = pending.libraryGame ? bindLibraryGame(cycle, pending, opts)
          : pending.implementationType === "generated-game" && !pending.reusedFrom
          ? await prepareGeneratedSpellingGame({ cycle, node: pending, client: input.spellingGameClient ?? prebuiltGameClient(input.childId, input.homeworkId, pending.nodeId, opts), draftDir: qualityDiagnosticsDir(opts.rootDir ?? process.cwd(), cycle, pending) }, opts)
          // A reward break is a built-in Mystery in any subject: bound with no build and no provider (Law 16).
          : cycle.domain === "spelling" || pending.implementationType === "mystery"
          ? launchBuiltInActivity(input.childId, input.homeworkId, cycle, pending, opts)
          : await generateCanonicalProgressionArtifact({ ...input, nodeId: pending.nodeId }, opts);
        if (next.revision === cycle.revision) failure = latestQualityFailure(opts.rootDir ?? process.cwd(), cycle, pending) ?? "human_review_required";
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        next = getLearningCycle(input.childId, input.homeworkId, opts)!;
      }
      if (failure) {
        // One bounded attempt per node, never re-bought on restart. The failed activity degrades to one
        // Not ready portal with its reason; the rest of the board still builds and publishes.
        console.warn(` 🎮 [learning-board] [successor-preparation] [not-ready] board=${board.boardId} node=${pending.nodeId} reason=${failure}`);
        next = transitionLearningCycle(input.childId, input.homeworkId, next.revision, {
          type: "artifact_generation_attention_required", nodeId: pending.nodeId, reason: `successor_node_failed:${failure}`, notReady: true,
        }, opts);
      }
      cycle = next;
    }
    throw new Error(`successor_board_preparation_guard_exceeded:${board.boardId}`);
  } finally {
    releaseMathGenerationLease({ rootDir: opts.rootDir, childId: input.childId, homeworkId: input.homeworkId, token: lease.token });
  }
}
