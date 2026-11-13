import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  ASSIGNMENT_SOURCE_CONTRACT_VERSION,
  assignmentSourceFileHash,
  isCurrentAssignmentSourceCheckpoint,
  loadOrExtractAssignmentSource,
  type AssignmentSourceExtraction,
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
import {
  buildMathOpeningEvaluationPrompt,
  buildAdaptiveBoardPlannerContext,
  runMathBoardWorker,
  adaptiveMathSnapshotHash,
  adaptiveMathDraftBindingKey,
  type AdaptiveBoardPlannerContext,
  type MathOpeningEvaluationAssignment,
  type MathBoardWorkerJob,
} from "../engine/adaptiveMathTwoPhase";
import { getChildChart } from "../profiles/childChart";

type ExistingAssignmentCycle = {
  homeworkId: string;
  lifecycle: string;
  assignment: { contentFingerprint: string };
};

export type ExistingAssignmentIngestionOutcome = {
  kind: "READY_TO_START" | "CONTINUE_EXISTING" | "AWAITING_CALIBRATION" | "ALREADY_COMPLETE";
  shouldGenerate: false;
  message: string;
};

export function mathHomeworkIdFromSourceHash(sourceHash: string): string {
  return `hw-math-${crypto.createHash("sha256").update(sourceHash).digest("hex").slice(0, 24)}`;
}

export function shouldResetMathDraft(input: { freshRequested: boolean; adaptiveBinding?: string }): boolean {
  return input.freshRequested && !input.adaptiveBinding;
}

export function findExistingMathHomeworkIdBySourceHash(
  childId: string,
  sourceHash: string,
  rootDir = process.cwd(),
  warn: (message: string) => void = console.warn,
): string | undefined {
  const cyclesDir = path.join(rootDir, "src", "context", childId, "homework", "cycles");
  const matches = new Set<string>();
  if (fs.existsSync(cyclesDir)) {
    for (const filename of fs.readdirSync(cyclesDir).filter((name) => name.endsWith(".json"))) {
      const file = path.join(cyclesDir, filename);
      try {
        const cycle = readJson<Partial<ExistingAssignmentCycle> & { domain?: string }>(file);
        if (cycle.domain === "math" && cycle.assignment?.contentFingerprint === sourceHash && cycle.homeworkId) {
          matches.add(cycle.homeworkId);
        }
      } catch (error) {
        warn(` 🎮 [math-ingestion] [cycle-scan] [invalid] file=${file} reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  const draftsDir = path.join(rootDir, "src", "context", childId, "homework", "direct-drafts");
  if (fs.existsSync(draftsDir)) {
    for (const homeworkId of fs.readdirSync(draftsDir)) {
      const checkpointFile = path.join(draftsDir, homeworkId, "assignment-source.json");
      if (!fs.existsSync(checkpointFile)) continue;
      try {
        const checkpoint = readJson<Partial<AssignmentSourceCheckpoint>>(checkpointFile);
        if (checkpoint.fileHash === sourceHash) matches.add(homeworkId);
      } catch (error) {
        warn(` 🎮 [math-ingestion] [draft-scan] [invalid] file=${checkpointFile} reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  if (matches.size > 1) {
    throw new Error(`duplicate_math_assignment_fingerprint:${sourceHash}:${[...matches].join(",")}`);
  }
  return [...matches][0];
}

export function prepareMathOpeningEvaluationContext(input: {
  childId: string;
  assignment: MathOpeningEvaluationAssignment;
  getChart?: typeof getChildChart;
}): { prompt: string; childChartSnapshotHash: string; childChart: ReturnType<typeof getChildChart> } {
  const childChart = (input.getChart ?? getChildChart)(input.childId);
  return {
    prompt: buildMathOpeningEvaluationPrompt({ assignment: input.assignment, childChart }),
    childChartSnapshotHash: adaptiveMathSnapshotHash(childChart),
    childChart,
  };
}

export function existingAssignmentIngestionOutcome(
  cycle: ExistingAssignmentCycle,
  sourceHash: string,
  options: { rebuildNodeIds?: string[] } = {},
): ExistingAssignmentIngestionOutcome {
  if (cycle.assignment.contentFingerprint !== sourceHash) {
    throw new Error(`learning_cycle_assignment_identity_mismatch:${cycle.homeworkId}`);
  }
  const rebuildNodeIds = options.rebuildNodeIds?.filter(Boolean) ?? [];
  if (rebuildNodeIds.length > 0) {
    throw new Error(
      `published_assignment_rebuild_requires_separate_workflow:${cycle.homeworkId}:${rebuildNodeIds.join(",")}`,
    );
  }
  if (cycle.lifecycle === "baseline_ready") {
    return { kind: "READY_TO_START", shouldGenerate: false, message: "Assignment already published and ready to start." };
  }
  if (cycle.lifecycle === "awaiting_calibration") {
    return { kind: "AWAITING_CALIBRATION", shouldGenerate: false, message: "Assignment is awaiting returned work or calibration." };
  }
  if (cycle.lifecycle === "complete") {
    return { kind: "ALREADY_COMPLETE", shouldGenerate: false, message: "Assignment is already complete." };
  }
  return { kind: "CONTINUE_EXISTING", shouldGenerate: false, message: "Assignment progress is already active and will be preserved." };
}

export async function runMathIngestionCommand<T>(input: {
  sourceHash: string;
  rebuildNodeIds: string[];
  existingCycle: ExistingAssignmentCycle | null;
  continueUnpublished: () => Promise<T>;
}): Promise<ExistingAssignmentIngestionOutcome | T> {
  if (input.existingCycle) {
    return existingAssignmentIngestionOutcome(input.existingCycle, input.sourceHash, {
      rebuildNodeIds: input.rebuildNodeIds,
    });
  }
  return input.continueUnpublished();
}

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
    && /assignment_source_missing|unsupported_assignment_source|published_assignment_rebuild_requires_separate_workflow|EISDIR|ENOENT/i.test(message)) {
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

export async function resolveMathAssignmentExtraction(input: {
  pdf?: string;
  extractionCacheFile: string;
  frozenExtraction?: AssignmentSourceExtraction;
  expectedSourceHash?: string;
  load?: typeof loadOrExtractAssignmentSource;
}): Promise<Awaited<ReturnType<typeof loadOrExtractAssignmentSource>>> {
  if (input.frozenExtraction) {
    if (input.expectedSourceHash && input.frozenExtraction.fileHash !== input.expectedSourceHash) {
      throw new Error("adaptive_math_frozen_extraction_hash_mismatch");
    }
    return { extraction: input.frozenExtraction, reused: true };
  }
  if (!input.pdf) throw new Error("adaptive_math_frozen_extraction_missing");
  return (input.load ?? loadOrExtractAssignmentSource)(input.pdf, input.extractionCacheFile);
}

export async function continueUnpublishedMathIngestion(input: {
  startedAt: number;
  childId: string;
  pdf?: string;
  rebuildNodeIds: string[];
  sourceHash: string;
  homeworkId: string;
  frozenExtraction?: AssignmentSourceExtraction;
  adaptiveFindings?: AdaptiveBoardPlannerContext;
  frozenChart?: ReturnType<typeof getChildChart>;
  frozenChartSnapshotHash?: string;
  onPhase?: (phase: "planning" | "designing" | "building") => void;
  onArtifactPlanReady?: (nodeIds: string[]) => void | Promise<void>;
  onArtifactReady?: (artifact: DirectArtifact) => void | Promise<void>;
  onArtifactsReady?: (result: {
    artifacts: DirectArtifact[];
    calls: number;
    tokens: number;
    costUsd: number;
  }) => void | Promise<void>;
}): Promise<{
  kind: "UNPUBLISHED_COMPLETE";
  artifacts: DirectArtifact[];
  calls: number;
  tokens: number;
  costUsd: number;
}> {
  const { startedAt, childId, pdf, rebuildNodeIds, homeworkId } = input;
  if (input.adaptiveFindings && input.adaptiveFindings.findings.homeworkId !== homeworkId) {
    throw new Error("adaptive_math_findings_homework_mismatch");
  }
  const baseDraftDir = path.join(process.cwd(), "src", "context", childId, "homework", "direct-drafts", homeworkId);
  const adaptiveBinding = input.adaptiveFindings && input.frozenChart && input.frozenExtraction
    ? adaptiveMathDraftBindingKey({
        findingsHash: input.adaptiveFindings.findingsHash,
        decisionId: input.adaptiveFindings.decision.decisionId,
        decisionHash: adaptiveMathSnapshotHash(input.adaptiveFindings.decision),
        childChartSnapshotHash: input.frozenChartSnapshotHash ?? adaptiveMathSnapshotHash(input.frozenChart),
        frozenExtractionHash: adaptiveMathSnapshotHash(input.frozenExtraction),
        academicContractHash: input.adaptiveFindings.findings.academicContractHash,
      })
    : undefined;
  const draftDir = adaptiveBinding ? path.join(baseDraftDir, "adaptive", adaptiveBinding) : baseDraftDir;
  const freshRequested = shouldResetMathDraft({ freshRequested: flag("fresh"), adaptiveBinding });
  if (freshRequested) fs.rmSync(draftDir, { recursive: true, force: true });
  const extractionCacheFile = path.join(draftDir, "assignment-extraction.json");
  const loadedExtraction = await resolveMathAssignmentExtraction({
    pdf,
    extractionCacheFile,
    frozenExtraction: input.frozenExtraction,
    expectedSourceHash: input.sourceHash,
  });
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
  const plannerCheckpointFile = path.join(draftDir, "planner-checkpoint.json");
  const designCheckpointFile = path.join(draftDir, "design-checkpoint.json");
  const designFile = path.join(draftDir, "design-packet.json");
  const finalPlanFile = path.join(draftDir, "designed-plan.json");
  const buildFile = path.join(draftDir, "candidate-build-v3.json");
  const chart = input.frozenChart ?? getChildChart(childId);
  if (input.frozenChartSnapshotHash && adaptiveMathSnapshotHash(chart) !== input.frozenChartSnapshotHash) {
    throw new Error("adaptive_math_frozen_chart_hash_mismatch");
  }
  const priorOutcomes = input.frozenChart
    ? {
        adaptiveFindings: structuredClone(input.adaptiveFindings?.findings),
        historicalEvidence: structuredClone(input.adaptiveFindings?.historicalEvidence ?? []),
      }
    : {
        directExperience: readDirectFeedbackContext(childId),
        canonicalCycle: readDirectCanonicalLearningContext(childId, homeworkId),
      };
  const priorConceptIds = input.frozenChart ? [] : readPriorConceptIds(childId);

  currentCheckpoint = draftDir;
  currentPhase = "academic-planning";
  input.onPhase?.("planning");
  console.log("[2/5] Planner writing academic prescription");
  const reusableProgram = readReusablePlannerProgram({
    programFile,
    diagnosticFile: plannerDiagnosticFile,
    archiveDir: path.join(draftDir, "audit"),
  });
  const plannerStatus = reusableProgram ? "reused" as const : "generated" as const;
  const plannerAttemptsBefore = fs.existsSync(plannerCheckpointFile)
    ? readJson<{ attempts?: unknown[] }>(plannerCheckpointFile).attempts?.length ?? 0
    : 0;
  const program = reusableProgram ?? await withIngestionHeartbeat("Planner", () => askDirectMathPlanner({
        childId,
        chart,
        extraction,
        priorOutcomes,
        priorConceptIds,
        rawResponseFile: plannerDiagnosticFile,
        plannerCheckpointDir: draftDir,
        adaptiveFindings: input.adaptiveFindings,
      }));
  writeJson(programFile, program);
  console.log(`  📋 ${program.assumptions.length} assumptions preregistered; publication remains pending`);
  const routeIds = new Set(program.fork.routes.map((route) => route.id));
  const sharedNodes = program.activities.filter((activity) => !routeIds.has(activity.routeId)).map((activity) => activity.id);
  console.log(`  🧭 Program: shared=${sharedNodes.join(",") || "none"}; ${program.fork.routes.map((route) => `${route.id}=${route.nodeIds.join(",")}`).join("; ")}`);

  currentPhase = "experience-design";
  input.onPhase?.("designing");
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
  input.onPhase?.("building");
  console.log(`[4/5] Building ${designed.plan.activities.length} artifact-designed activities with bounded concurrency`);
  if (program.bonusActivity) console.log(`  ○ ${program.bonusActivity.id} bonus deferred until earned`);
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
  await input.onArtifactPlanReady?.(designed.plan.activities.map((activity) => activity.id));
  const generated = await withIngestionHeartbeat("Baseline builders", () => generateDirectArtifacts({
    plan: designed.plan,
    childId,
    homeworkId,
    plannerModel: process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5",
    architectModel: process.env.SUNNY_ARCHITECT_MODEL ?? "claude-fable-5",
    assignmentFingerprint: extraction.fileHash,
    candidateCards: mathPlannerCandidateCards(chart),
    existingArtworkUrls,
    onArtifactReady: input.onArtifactReady,
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
  const designCheckpoint = fs.existsSync(designCheckpointFile)
    ? readJson<MathDesignCheckpoint>(designCheckpointFile)
    : undefined;
  const designTokens = designStatus === "generated"
    ? designCheckpoint?.attempts.slice(designAttemptsBefore)
      .reduce((sum, attempt) => sum + attempt.inputTokens + attempt.outputTokens, 0) ?? 0
    : 0;
  const buildTokens = currentRunBuildTokens(generated.artifacts, generated.stats.generatedNodeIds);
  const plannerCheckpoint = fs.existsSync(plannerCheckpointFile)
    ? readJson<{ attempts?: Array<{ inputTokens?: number; outputTokens?: number }> }>(plannerCheckpointFile)
    : {};
  const plannerRunAttempts = plannerStatus === "generated"
    ? (plannerCheckpoint.attempts ?? []).slice(plannerAttemptsBefore)
    : [];
  const plannerTokens = plannerRunAttempts.reduce(
    (sum, attempt) => sum + Number(attempt.inputTokens ?? 0) + Number(attempt.outputTokens ?? 0),
    0,
  );
  const designAttemptsAfter = designCheckpoint?.attempts.length ?? designAttemptsBefore;
  const calls = plannerRunAttempts.length
    + Math.max(0, designAttemptsAfter - designAttemptsBefore)
    + generated.stats.generatedNodeIds.length
    + generated.stats.generatedImages;
  const tokens = plannerTokens + designTokens + buildTokens;
  await input.onArtifactsReady?.({
    artifacts: generated.artifacts,
    calls,
    tokens,
    costUsd: 0,
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
  console.log(formatIngestionSummary({
    planner: plannerStatus,
    design: designStatus,
    generatedNodeIds: generated.stats.generatedNodeIds,
    reusedNodeIds: generated.stats.reusedNodeIds,
    generatedImages: generated.stats.generatedImages,
    reusedImages: generated.stats.reusedImages,
    calls,
    tokens,
    elapsedMs: Date.now() - startedAt,
    checkpoint: draftDir,
    bonusDeferred: Boolean(program.bonusActivity),
  }));
  console.log(`Plan: ${record}`);
  return {
    kind: "UNPUBLISHED_COMPLETE",
    artifacts: generated.artifacts,
    calls,
    tokens,
    costUsd: 0,
  };
}

export async function runAdaptiveMathWorkerWithExistingFactory(input: {
  jobFile: string;
  childId: string;
  startedAt: number;
  sourceHash: string;
  frozenExtraction: AssignmentSourceExtraction;
  childChartSnapshot: ReturnType<typeof getChildChart>;
  rebuildNodeIds?: string[];
  continueUnpublished?: typeof continueUnpublishedMathIngestion;
}): Promise<MathBoardWorkerJob> {
  const savedJob = readJson<MathBoardWorkerJob>(input.jobFile);
  if (savedJob.childId !== input.childId) throw new Error("adaptive_math_worker_child_binding_mismatch");
  if (savedJob.assignmentSourceHash !== input.sourceHash || input.frozenExtraction.fileHash !== input.sourceHash) {
    throw new Error("adaptive_math_worker_source_binding_mismatch");
  }
  if (adaptiveMathSnapshotHash(input.frozenExtraction) !== savedJob.frozenExtractionHash) {
    throw new Error("adaptive_math_worker_extraction_binding_mismatch");
  }
  if (adaptiveMathSnapshotHash(input.childChartSnapshot) !== savedJob.childChartSnapshotHash) {
    throw new Error("adaptive_math_worker_chart_binding_mismatch");
  }
  const chartChildId = (input.childChartSnapshot as { identity?: { childId?: string } }).identity?.childId;
  if (!chartChildId) throw new Error("adaptive_math_worker_chart_child_missing");
  if (chartChildId !== savedJob.childId) throw new Error("adaptive_math_worker_chart_child_mismatch");
  const continueUnpublished = input.continueUnpublished ?? continueUnpublishedMathIngestion;
  return runMathBoardWorker(input.jobFile, {
    failureState: (error) => classifyIngestionFailure(error, currentPhase) === "PUBLICATION_FAILED"
      ? "publication_failed"
      : "provider_paused",
    build: async ({
      homeworkId,
      findingsHash,
      findings,
      reportPhase,
      reportExpectedArtifacts,
      reportArtifact,
    }) => {
      const result = await continueUnpublished({
        startedAt: input.startedAt,
        childId: input.childId,
        pdf: undefined,
        rebuildNodeIds: input.rebuildNodeIds ?? [],
        sourceHash: input.sourceHash,
        homeworkId,
        frozenExtraction: input.frozenExtraction,
        frozenChart: input.childChartSnapshot,
        frozenChartSnapshotHash: savedJob.childChartSnapshotHash,
        adaptiveFindings: buildAdaptiveBoardPlannerContext({
          findings,
          decision: savedJob.decision,
          historicalEvidence: [],
        }),
        onPhase: reportPhase,
        onArtifactPlanReady: reportExpectedArtifacts,
        onArtifactReady: (artifact) => {
          reportArtifact(artifact.nodeId, artifact.htmlHash ?? assignmentSourceFileHash(artifact.htmlPath));
        },
        onArtifactsReady: ({ artifacts }) => {
          const artifactIds = artifacts.map((artifact) => artifact.nodeId);
          if (artifactIds.length === 0) throw new Error("adaptive_math_factory_returned_no_artifacts");
        },
      });
      const artifactIds = result.artifacts.map((artifact) => artifact.nodeId);
      const artifactHashes = Object.fromEntries(result.artifacts.map((artifact) => {
        const htmlHash = artifact.htmlHash ?? assignmentSourceFileHash(artifact.htmlPath);
        return [artifact.nodeId, htmlHash];
      }));
      return {
        completedArtifactIds: artifactIds,
        artifactHashes,
        calls: result.calls,
        tokens: result.tokens,
        costUsd: null,
        // The legacy provider adapters do not yet expose authoritative dollar cost.
        costAccountingComplete: false,
        inputFindingsHash: findingsHash,
      };
    },
  });
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const childId = arg("child").trim().toLowerCase();
  const pdf = path.resolve(arg("pdf"));
  const rebuildNodeIds = arg("rebuild-node", false).split(",").map((value) => value.trim()).filter(Boolean);
  console.log("[1/5] Reading assignment and evidence");
  const sourceHash = assignmentSourceFileHash(pdf);
  const homeworkId = findExistingMathHomeworkIdBySourceHash(childId, sourceHash)
    ?? mathHomeworkIdFromSourceHash(sourceHash);
  const existingCycle = readDirectCanonicalLearningContext(childId, homeworkId) as ExistingAssignmentCycle | null;
  const outcome = await runMathIngestionCommand({
    sourceHash,
    rebuildNodeIds,
    existingCycle,
    continueUnpublished: () => continueUnpublishedMathIngestion({
      startedAt,
      childId,
      pdf,
      rebuildNodeIds,
      sourceHash,
      homeworkId,
    }),
  });
  if (outcome.kind === "UNPUBLISHED_COMPLETE") return;
  console.log("Done — EXISTING");
  console.log(`Homework: ${homeworkId}`);
  console.log(`Lifecycle: ${existingCycle!.lifecycle}`);
  console.log(outcome.message);
  console.log("Provider calls: 0");
  console.log("Existing progress and evidence were not changed.");
  console.log("Start session: npm run sunny → Start child session");
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
