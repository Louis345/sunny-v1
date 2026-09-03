import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  ASSIGNMENT_SOURCE_CONTRACT_VERSION,
  assignmentSourceFileHash,
  isCurrentAssignmentSourceCheckpoint,
  loadOrExtractAssignmentSource,
  type AssignmentSourceCheckpoint,
} from "../engine/assignmentSourceExtraction";
import {
  askDirectMathPlanner,
  askMathExperienceDesigner,
  buildDirectActiveSessionPlan,
  buildMathCreativeChildContext,
  generateDirectArtifacts,
  parseMathLearningProgram,
  persistDirectExperience,
  readDirectCanonicalLearningContext,
  runDirectBrowserSmokeCheck,
  type DirectArtifact,
  type DirectLearningExperiencePlan,
  type MathDesignCheckpoint,
  mathDesignHasRoutePresentationBindings,
  mathPlannerCandidateCards,
  type MathDesignPacket,
} from "../engine/directMathExperience";
import { readDirectFeedbackContext } from "../engine/directExperienceFeedback";
import { readPriorConceptIds } from "../engine/assignmentLedger";
import { getChildChart } from "../profiles/childChart";
import {
  buildDiscoveryActiveSessionPlan,
  ensureDiscoveryArtifactsAreServed,
  generateMathDiscoveryExperience,
  publishDiscoveryExperience,
  getMathDiscoveryLifecycle,
  getMathGenerationStatus,
  type MathDiscoveryEvaluationContract,
} from "../engine/adaptiveMathDiscovery";

function arg(name: string, required = true): string {
  const value = process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value && required) throw new Error(`missing_argument:${name}`);
  return value ?? "";
}

function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function plannerProgramFromDiagnostic(file: string): unknown {
  const diagnostic = readJson<{ content?: Array<{ type?: string; name?: string; input?: unknown }> }>(file);
  return diagnostic.content?.find((block) =>
    block.type === "tool_use" && block.name === "create_math_learning_program")?.input;
}

function archiveInvalidCheckpoint(file: string, archiveDir: string): void {
  if (!fs.existsSync(file)) return;
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.renameSync(file, path.join(archiveDir, `${path.basename(file)}.invalid-${Date.now()}`));
}

export function readReusablePlannerProgram(input: {
  programFile: string;
  diagnosticFile: string;
  archiveDir: string;
}): ReturnType<typeof parseMathLearningProgram> | undefined {
  if (fs.existsSync(input.programFile)) {
    try {
      return parseMathLearningProgram(readJson(input.programFile));
    } catch {
      archiveInvalidCheckpoint(input.programFile, input.archiveDir);
    }
  }
  if (fs.existsSync(input.diagnosticFile)) {
    try {
      return parseMathLearningProgram(plannerProgramFromDiagnostic(input.diagnosticFile));
    } catch {
      archiveInvalidCheckpoint(input.diagnosticFile, input.archiveDir);
    }
  }
  return undefined;
}

let currentPhase = "reading-assignment";
let currentCheckpoint = "";

export type IngestionFailureKind = "INPUT_ERROR" | "PROVIDER_PAUSED" | "PUBLICATION_FAILED";

export function classifyIngestionFailure(error: unknown, phase: string): IngestionFailureKind {
  const message = error instanceof Error ? error.message : String(error);
  if (phase === "atomic-publication") return "PUBLICATION_FAILED";
  if (phase === "reading-assignment"
    && /assignment_source_missing|unsupported_assignment_source|EISDIR|ENOENT/i.test(message)) {
    return "INPUT_ERROR";
  }
  return "PROVIDER_PAUSED";
}

export function formatIngestionSummary(input: {
  planner: "generated" | "reused";
  design: "generated" | "reused";
  generatedNodeIds: string[];
  reusedNodeIds: string[];
  generatedImages: number;
  reusedImages: number;
  calls: number;
  tokens: number;
  elapsedMs: number;
  checkpoint: string;
  bonusDeferred: boolean;
}): string {
  return [
    "Board: published",
    `Planner: ${input.planner}`,
    `Design: ${input.design}`,
    `Baseline nodes: ${input.generatedNodeIds.length} generated, ${input.reusedNodeIds.length} reused`,
    `Bonus: ${input.bonusDeferred ? "deferred until earned" : "not planned"}`,
    `Images: ${input.generatedImages} generated, ${input.reusedImages} reused`,
    `Recorded calls: ${input.calls}`,
    `Recorded tokens: ${input.tokens}`,
    `Elapsed time: ${Math.round(input.elapsedMs / 1000)}s`,
    `Checkpoint: ${input.checkpoint}`,
    "Start session: npm run sunny → Start child session",
  ].join("\n");
}

export function currentRunBuildTokens(
  artifacts: Array<Pick<DirectArtifact, "nodeId" | "inputTokens" | "outputTokens">>,
  generatedNodeIds: string[],
): number {
  const generated = new Set(generatedNodeIds);
  return artifacts
    .filter((artifact) => generated.has(artifact.nodeId))
    .reduce((sum, artifact) => sum + (artifact.inputTokens ?? 0) + (artifact.outputTokens ?? 0), 0);
}

export function shouldPublishDiscoveryFirst(lifecycle: string | undefined): boolean {
  return lifecycle === undefined || lifecycle === "evaluation_ready" || lifecycle === "evaluation_active";
}

export function shouldDeferToAdaptiveWorker(lifecycle: string | undefined): boolean {
  return lifecycle !== undefined && !shouldPublishDiscoveryFirst(lifecycle);
}

export function assertFreshResetAllowed(freshRequested: boolean, lifecycle: string | undefined, homeworkId: string): void {
  if (freshRequested && lifecycle) {
    throw new Error(`fresh_reset_blocked_for_active_learning_cycle:${homeworkId}:${lifecycle}`);
  }
}

export async function withIngestionHeartbeat<T>(
  label: string,
  run: () => Promise<T>,
  log: (message: string) => void = console.log,
  intervalMs = 30_000,
): Promise<T> {
  const startedAt = Date.now();
  let count = 0;
  const timer = setInterval(() => {
    count += 1;
    log(`  … ${label}: running — ${Math.floor((Date.now() - startedAt) / 60_000)}:${String(Math.floor((Date.now() - startedAt) / 1000) % 60).padStart(2, "0")}`);
    if (count >= 20) clearInterval(timer);
  }, intervalMs);
  try {
    return await run();
  } finally {
    clearInterval(timer);
  }
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const childId = arg("child").trim().toLowerCase();
  const pdf = path.resolve(arg("pdf"));
  const rebuildNodeIds = arg("rebuild-node", false).split(",").map((value) => value.trim()).filter(Boolean);
  console.log("[1/5] Reading assignment and evidence");
  const sourceHash = assignmentSourceFileHash(pdf);
  const homeworkId = `hw-math-${crypto.createHash("sha256").update(sourceHash).digest("hex").slice(0, 8)}`;
  const draftDir = path.join(process.cwd(), "src", "context", childId, "homework", "direct-drafts", homeworkId);
  const freshRequested = flag("fresh");
  const existingLifecycleBeforeReset = getMathDiscoveryLifecycle(childId, homeworkId);
  assertFreshResetAllowed(freshRequested, existingLifecycleBeforeReset, homeworkId);
  if (freshRequested) fs.rmSync(draftDir, { recursive: true, force: true });
  const extractionCacheFile = path.join(draftDir, "assignment-extraction.json");
  const loadedExtraction = await loadOrExtractAssignmentSource(pdf, extractionCacheFile);
  const extraction = loadedExtraction.extraction;
  console.log(`  📄 Source: ${extraction.sourceKind}, ${extraction.pages.length} page${extraction.pages.length === 1 ? "" : "s"} captured, ${extraction.extractionMethod}${loadedExtraction.reused ? " (reused)" : ""}`);
  extraction.warnings.forEach((warning) => console.warn(`  LOCAL_TOOL_WARNING: ${warning}`));
  const sourceCheckpointFile = path.join(draftDir, "assignment-source.json");
  const sourceCheckpoint: AssignmentSourceCheckpoint = {
    version: ASSIGNMENT_SOURCE_CONTRACT_VERSION,
    fileHash: extraction.fileHash,
    pageCount: extraction.pages.length,
    extractionMethod: extraction.extractionMethod,
  };
  let savedSourceCheckpoint: AssignmentSourceCheckpoint | undefined;
  try {
    savedSourceCheckpoint = readJson<AssignmentSourceCheckpoint>(sourceCheckpointFile);
  } catch {
    savedSourceCheckpoint = undefined;
  }
  if (!freshRequested && fs.existsSync(draftDir)
    && !isCurrentAssignmentSourceCheckpoint(savedSourceCheckpoint, sourceCheckpoint)) {
    const auditDir = path.join(path.dirname(draftDir), "audit", `${homeworkId}-${Date.now()}`);
    fs.mkdirSync(path.dirname(auditDir), { recursive: true });
    fs.renameSync(draftDir, auditDir);
    console.log(`  ♻️ Previous partial-source draft archived; planning will restart from all ${extraction.pages.length} pages`);
  }
  writeJson(sourceCheckpointFile, sourceCheckpoint);
  const programFile = path.join(draftDir, "math-learning-program.json");
  const plannerDiagnosticFile = path.join(draftDir, "provider-diagnostics", "planner-response.json");
  const designCheckpointFile = path.join(draftDir, "design-checkpoint.json");
  const designFile = path.join(draftDir, "design-packet.json");
  const finalPlanFile = path.join(draftDir, "designed-plan.json");
  const buildFile = path.join(draftDir, "candidate-build-v3.json");
  const chart = getChildChart(childId);
  const discoveryFile = path.join(draftDir, "discovery-contract.json");
  const existingLifecycle = getMathDiscoveryLifecycle(childId, homeworkId);
  if (shouldPublishDiscoveryFirst(existingLifecycle)) {
    currentPhase = "discovery-generation";
    console.log("[2/2] Preparing independent Discovery evaluation");
    const existingDiscovery = fs.existsSync(discoveryFile) ? readJson<MathDiscoveryEvaluationContract>(discoveryFile) : undefined;
    const evaluation = existingDiscovery ? ensureDiscoveryArtifactsAreServed({ childId, homeworkId, contract: existingDiscovery }) : (await withIngestionHeartbeat("Discovery", () => generateMathDiscoveryExperience({
      childId,
      homeworkId,
      assignmentText: extraction.fullText,
      assignmentEvidenceIds: [`assignment:${homeworkId}:source`],
      factualChildContext: buildMathCreativeChildContext(chart),
    }))).contract;
    const activeSessionPlan = buildDiscoveryActiveSessionPlan({
      childId,
      homeworkId,
      evaluation,
      companion: { id: chart.companion.presetId, name: chart.companion.displayName },
    });
    currentPhase = "atomic-publication";
    publishDiscoveryExperience({
      childId,
      homeworkId,
      evaluation,
      activeSessionPlan,
      assignment: {
        title: extraction.filename,
        contentFingerprint: extraction.fileHash,
        capturedEvidenceIds: evaluation.assignmentEvidenceIds,
        targets: evaluation.constructs.map((construct) => construct.constructId),
      },
    });
    console.log("Done — DISCOVERY READY");
    console.log(`Discovery: ${existingDiscovery ? "reused" : "generated"}`);
    console.log("Targeted board: waits for committed Discovery evidence");
    console.log(`Checkpoint: ${draftDir}`);
    console.log("Start session: npm run sunny → Start child session");
    return;
  }
  if (shouldDeferToAdaptiveWorker(existingLifecycle)) {
    const status = getMathGenerationStatus(childId, homeworkId);
    console.log("Done — ADAPTIVE GENERATION IN PROGRESS");
    console.log(`Lifecycle: ${existingLifecycle}`);
    console.log(`Generation: ${status?.phase ?? "queued"}`);
    console.log("Start or restart Sunny; saved work resumes automatically.");
    return;
  }
  const priorOutcomes = {
    directExperience: readDirectFeedbackContext(childId),
    canonicalCycle: readDirectCanonicalLearningContext(childId, homeworkId),
  };

  currentCheckpoint = draftDir;
  currentPhase = "academic-planning";
  console.log("[2/5] Planner writing academic prescription");
  const reusableProgram = readReusablePlannerProgram({
    programFile,
    diagnosticFile: plannerDiagnosticFile,
    archiveDir: path.join(draftDir, "audit"),
  });
  const plannerStatus = reusableProgram ? "reused" as const : "generated" as const;
  const program = reusableProgram ?? await withIngestionHeartbeat("Planner", () => askDirectMathPlanner({
        childId,
        chart,
        extraction,
        priorOutcomes,
        priorConceptIds: readPriorConceptIds(childId),
        rawResponseFile: plannerDiagnosticFile,
      }));
  writeJson(programFile, program);
  console.log(`  📋 ${program.assumptions.length} assumptions preregistered; publication remains pending`);
  const routeIds = new Set(program.fork.routes.map((route) => route.id));
  const sharedNodes = program.activities.filter((activity) => !routeIds.has(activity.routeId)).map((activity) => activity.id);
  console.log(`  🧭 Program: shared=${sharedNodes.join(",") || "none"}; ${program.fork.routes.map((route) => `${route.id}=${route.nodeIds.join(",")}`).join("; ")}`);

  currentPhase = "experience-design";
  const existingDesignPacket = fs.existsSync(designFile) ? readJson<MathDesignPacket>(designFile) : undefined;
  const shouldDesign = !existingDesignPacket || !fs.existsSync(finalPlanFile)
    || !mathDesignHasRoutePresentationBindings(existingDesignPacket);
  console.log("[3/5] Creator designing coherent board and node artifacts");
  const designStatus = shouldDesign ? "generated" as const : "reused" as const;
  const designAttemptsBefore = fs.existsSync(designCheckpointFile)
    ? readJson<MathDesignCheckpoint>(designCheckpointFile).attempts.length
    : 0;
  const designed = shouldDesign
      ? await withIngestionHeartbeat("Designer", () => askMathExperienceDesigner({
        childId,
        program,
        childContext: buildMathCreativeChildContext(chart),
        priorOutcomes,
        checkpoint: fs.existsSync(designCheckpointFile)
          ? readJson<MathDesignCheckpoint>(designCheckpointFile)
          : undefined,
        checkpointFile: designCheckpointFile,
        rawResponseDir: path.join(draftDir, "provider-diagnostics"),
      }))
    : {
        packet: readJson<MathDesignPacket>(designFile),
        plan: readJson<DirectLearningExperiencePlan>(finalPlanFile),
      };
  writeJson(designFile, designed.packet);
  writeJson(finalPlanFile, designed.plan);

  currentPhase = "activity-building";
  console.log(`[4/5] Building ${designed.plan.activities.length} artifact-designed activities with bounded concurrency`);
  const existingBuild = fs.existsSync(buildFile)
    ? readJson<{ artifacts: DirectArtifact[]; backgroundUrl: string; questArtworkUrl: string; bossArtworkUrl: string }>(buildFile)
    : undefined;
  const existingArtworkUrls = existingBuild
    ? {
        backgroundUrl: existingBuild.backgroundUrl,
        questArtworkUrl: existingBuild.questArtworkUrl,
        bossArtworkUrl: existingBuild.bossArtworkUrl,
      }
    : undefined;
  const generated = await withIngestionHeartbeat("Baseline builders", () => generateDirectArtifacts({
    plan: designed.plan,
    childId,
    homeworkId,
    plannerModel: process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5",
    architectModel: process.env.SUNNY_ARCHITECT_MODEL ?? "claude-fable-5",
    assignmentFingerprint: extraction.fileHash,
    candidateCards: mathPlannerCandidateCards(chart),
    existingArtworkUrls,
    ...(rebuildNodeIds.length > 0 ? { forceNodeIds: rebuildNodeIds } : {}),
  }));
  writeJson(buildFile, generated);

  currentPhase = "runtime-verification";
  console.log("[5/5] Running the opening browser smoke check");
  const report = await runDirectBrowserSmokeCheck({ artifacts: generated.artifacts });
  if (!report.passed) {
    console.warn(`  🎮 [direct-ingest] [runtime-diagnostics] warnings=${report.failures.length}`);
    report.failures.forEach((failure) => console.warn(`    ${failure}`));
  }

  currentPhase = "atomic-publication";
  const activeSessionPlan = buildDirectActiveSessionPlan({
    childId,
    homeworkId,
    plan: designed.plan,
    artifacts: generated.artifacts,
    backgroundUrl: generated.backgroundUrl,
    questArtworkUrl: generated.questArtworkUrl,
    bossArtworkUrl: generated.bossArtworkUrl,
    report,
    companion: {
      id: chart.companion.presetId,
      name: chart.companion.displayName,
    },
  });
  const record = persistDirectExperience({
    childId,
    homeworkId,
    extraction,
    plannerPlan: designed.plan,
    activeSessionPlan,
    artifacts: generated.artifacts,
    report,
    assumptions: program.assumptions,
  });
  console.log("Done — FULL");
  console.log(`Browser smoke check: ${report.passed ? "passed" : "diagnostic warnings recorded"}`);
  console.log("Quest: locked");
  console.log("Boss: locked");
  const designCheckpoint = fs.existsSync(designCheckpointFile)
    ? readJson<MathDesignCheckpoint>(designCheckpointFile)
    : undefined;
  const designTokens = designStatus === "generated"
    ? designCheckpoint?.attempts.slice(designAttemptsBefore)
      .reduce((sum, attempt) => sum + attempt.inputTokens + attempt.outputTokens, 0) ?? 0
    : 0;
  const buildTokens = currentRunBuildTokens(generated.artifacts, generated.stats.generatedNodeIds);
  const plannerDiagnostic = fs.existsSync(plannerDiagnosticFile)
    ? readJson<{ usage?: { input_tokens?: number; output_tokens?: number } }>(plannerDiagnosticFile)
    : {};
  const plannerTokens = plannerStatus === "generated"
    ? Number(plannerDiagnostic.usage?.input_tokens ?? 0) + Number(plannerDiagnostic.usage?.output_tokens ?? 0)
    : 0;
  const designAttemptsAfter = designCheckpoint?.attempts.length ?? designAttemptsBefore;
  const calls = (plannerStatus === "generated" ? 1 : 0)
    + Math.max(0, designAttemptsAfter - designAttemptsBefore)
    + generated.stats.generatedNodeIds.length
    + generated.stats.generatedImages;
  console.log(formatIngestionSummary({
    planner: plannerStatus,
    design: designStatus,
    generatedNodeIds: generated.stats.generatedNodeIds,
    reusedNodeIds: generated.stats.reusedNodeIds,
    generatedImages: generated.stats.generatedImages,
    reusedImages: generated.stats.reusedImages,
    calls,
    tokens: plannerTokens + designTokens + buildTokens,
    elapsedMs: Date.now() - startedAt,
    checkpoint: draftDir,
    bonusDeferred: generated.stats.bonusDeferred,
  }));
  console.log(`Plan: ${record}`);
}

if (require.main === module) {
  void main().catch((error) => {
    const failureKind = classifyIngestionFailure(error, currentPhase);
    console.error(`${failureKind} — ${failureKind === "INPUT_ERROR" ? "correct the assignment input" : "saved progress is available"}`);
    console.error("Existing board was not changed.");
    console.error(`Phase: ${currentPhase}`);
    if (currentCheckpoint) console.error(`Checkpoint: ${currentCheckpoint}`);
    console.error(`Reason: ${error instanceof Error ? error.message : String(error)}`);
    if (failureKind === "PROVIDER_PAUSED") {
      console.error("Run ingestion again; saved work will resume automatically.");
    }
    process.exitCode = 1;
  });
}
