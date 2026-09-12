import { loadSunnyRuntimeEnvironment } from "./sunnyMenu";
loadSunnyRuntimeEnvironment();
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  ASSIGNMENT_SOURCE_CONTRACT_VERSION,
  assignmentSourceFileHash,
  classifyAssignmentSource,
  isCurrentAssignmentSourceCheckpoint,
  loadOrExtractAssignmentSource,
  writeAssignmentSourceExtraction,
  type AssignmentSourceCheckpoint,
  type AssignmentSourceExtraction,
} from "../engine/assignmentSourceExtraction";
import { buildMathCreativeChildContext, mathPlannerChartContext } from "../engine/directMathExperience";
import { withDiscoveryBrowserPage } from "../engine/discoveryVisualReview";
import { getChildChart } from "../profiles/childChart";
import {
  acquireMathGenerationLease, releaseMathGenerationLease, recoverDiscoveryPublication,
  buildDiscoveryActiveSessionPlan,
  ensureDiscoveryArtifactsAreServed,
  generateMathDiscoveryExperience,
  publishDiscoveryExperience,
  getMathDiscoveryLifecycle,
  getMathGenerationStatus,
  resolveDiscoveryRepairModel,
  resolveAdaptiveMathDraftDir,
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
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

export function archiveStaleAssignmentSourceDraft(input: {
  draftDir: string;
  freshRequested: boolean;
  savedSourceCheckpoint?: AssignmentSourceCheckpoint;
  sourceCheckpoint: AssignmentSourceCheckpoint;
  extraction: AssignmentSourceExtraction;
  now?: number;
}): boolean {
  if (input.freshRequested
    || !fs.existsSync(input.draftDir)
    || isCurrentAssignmentSourceCheckpoint(input.savedSourceCheckpoint, input.sourceCheckpoint)) {
    return false;
  }
  const auditDir = path.join(
    path.dirname(input.draftDir),
    "audit",
    `${path.basename(input.draftDir)}-${input.now ?? Date.now()}`,
  );
  fs.mkdirSync(path.dirname(auditDir), { recursive: true });
  fs.renameSync(input.draftDir, auditDir);
  writeAssignmentSourceExtraction(path.join(input.draftDir, "assignment-extraction.json"), input.extraction);
  return true;
}


export type IngestionFailureKind = "INPUT_ERROR" | "PROVIDER_PAUSED" | "PUBLICATION_FAILED" | "NEEDS_ATTENTION";

export function classifyIngestionFailure(error: unknown, phase: string): IngestionFailureKind {
  const message = error instanceof Error ? error.message : String(error);
  if (/provider_outcome_uncertain|math_|discovery_.*(failed|mismatch|invalid)|ingestion_already_running/.test(message)) return "NEEDS_ATTENTION";
  if (phase === "preflight") return "INPUT_ERROR";
  if (phase === "atomic-publication") return "PUBLICATION_FAILED";
  if (/Could not resolve authentication method|ANTHROPIC_API_KEY|OPENAI_API_KEY|apiKey or authToken/i.test(message)) {
    return "INPUT_ERROR";
  }
  if (phase === "reading-assignment"
    && /assignment_source_missing|unsupported_assignment_source|Learning profile not found|protected_child_context_root|EISDIR|ENOENT/i.test(message)) {
    return "INPUT_ERROR";
  }
  if ((error as {status?:number})?.status === 429) return "PROVIDER_PAUSED";
  return "NEEDS_ATTENTION";
}

export function discoveryProgressGuide(): string[] {
  return [
    "1/3 Academic plan — deciding what independent evidence to collect",
    "2/3 Experience design — deciding how the child will interact",
    "3/3 Playable build — creating and browser-checking the activity",
    "Saved stages are reused after interruption.",
  ];
}

export function initialIngestionProgressLabels(): { reading: string; discovery: string } {
  return {
    reading: "Step 1 — Reading assignment and child evidence",
    discovery: "Step 2 — Preparing the child's independent Discovery",
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function formatStartSessionCommand(
  env: Partial<Record<string, string | undefined>> = process.env,
): string {
  const contextRoot = env.SUNNY_CONTEXT_ROOT?.trim();
  if (!contextRoot) return "npm run sunny";
  const allowProtected = env.SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT === "true"
    ? " SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT=true"
    : "";
  return `SUNNY_CONTEXT_ROOT=${shellQuote(contextRoot)}${allowProtected} npm run sunny`;
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

export async function preflightMathIngestion(input: {childId: string; pdf: string; rootDir?: string; env?: NodeJS.ProcessEnv}) {
  const rootDir = input.rootDir ?? process.cwd(), env = input.env ?? process.env;
  const childId = input.childId.trim().toLowerCase(), pdf = path.resolve(rootDir, input.pdf);
  if (!/^[a-z0-9_-]+$/.test(childId)) throw new Error("preflight_child_id_invalid");
  const chart = getChildChart(childId, {rootDir});
  classifyAssignmentSource(pdf);
  if (!fs.statSync(pdf).isFile()) throw new Error("preflight_assignment_not_file");
  const sourceHash = assignmentSourceFileHash(pdf);
  const homeworkId = `hw-math-${crypto.createHash("sha256").update(sourceHash).digest("hex").slice(0, 8)}`;
  const draftDir = resolveAdaptiveMathDraftDir(childId, homeworkId, {rootDir});
  const sourceFile = path.join(draftDir, "assignment-source.json");
  if (fs.existsSync(sourceFile) && readJson<AssignmentSourceCheckpoint>(sourceFile).fileHash !== sourceHash) throw new Error("preflight_assignment_identity_collision");
  const localCandidate = ["discovery-contract.json", "discovery-builder.json"].some(file => fs.existsSync(path.join(draftDir,file)));
  if (!localCandidate && !env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) throw new Error("preflight_missing:ANTHROPIC_API_KEY");
  const repair = resolveDiscoveryRepairModel({
    builderModel: env.SUNNY_GENERATION_MODEL ?? env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5",
    environment: env,
  });
  if (repair.provider === "openai" && !env.OPENAI_API_KEY?.trim()) {
    throw new Error("preflight_missing:OPENAI_API_KEY");
  }
  const childDir=path.resolve(draftDir,"../../..");
  const directories=[draftDir,...["provider-receipts","visual-review","runtime-verification"].map(name=>path.join(draftDir,name)),childDir,path.join(childDir,"plans"),path.join(childDir,"homework"),path.join(childDir,"homework/cycles"),path.join(childDir,"homework/games",homeworkId)];
  for (const dir of directories) {
    fs.mkdirSync(dir,{recursive:true});
    const probe=path.join(dir,`.preflight-${crypto.randomUUID()}`);
    try {fs.writeFileSync(probe,"",{flag:"wx"});} finally {fs.rmSync(probe,{force:true});}
  }
  for (const name of ["learning_profile.json","plans/active_session_plan.json","homework/current.json"]) {
    const file=path.join(childDir,name);if(fs.existsSync(file))fs.accessSync(file,fs.constants.W_OK);
  }
  await withDiscoveryBrowserPage("<!doctype html><button>Preflight</button>", async () => undefined);
  console.log(` 🎮 [math-ingestion] [preflight] [passed] child=${childId} homework=${homeworkId} context=${path.dirname(path.dirname(draftDir))}`);
  return {childId,pdf,chart,sourceHash,homeworkId,draftDir,rootDir};
}

export async function ingestMathAssignment(input: {childId: string; pdf: string; rootDir?: string; fresh?: boolean; retryUncertain?: boolean}): Promise<void> {
  const rootDir=input.rootDir ?? process.cwd(), childId=input.childId.trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(childId)) throw new Error("preflight_child_id_invalid");
  const leaseInput={rootDir,childId,homeworkId:"discovery-intake"};
  const lease=acquireMathGenerationLease(leaseInput);
  if (!lease.acquired) throw new Error("ingestion_already_running");
  let currentPhase="preflight", checkpoint="";
  let status: (state:string,error?:unknown)=>void=()=>undefined;
  try {
  recoverDiscoveryPublication({rootDir,childId});
  const {pdf,chart,sourceHash,homeworkId,draftDir} = await preflightMathIngestion(input);
  checkpoint=draftDir;
  const jobFile=path.join(draftDir,"discovery-ingestion-job.json");
  status=(state: string, error?: unknown) => writeJson(jobFile,{version:1,jobId:`${childId}:${sourceHash}:v${ASSIGNMENT_SOURCE_CONTRACT_VERSION}`,childId,homeworkId,state,phase:currentPhase,updatedAt:new Date().toISOString(),...(error ? {error: error instanceof Error ? error.message : String(error)} : {})});
  const progressLabels = initialIngestionProgressLabels();
  console.log(progressLabels.reading);
  const freshRequested = input.fresh ?? false;
  const existingLifecycleBeforeReset = getMathDiscoveryLifecycle(childId, homeworkId, {rootDir});
  assertFreshResetAllowed(freshRequested, existingLifecycleBeforeReset, homeworkId);
  if (freshRequested) fs.rmSync(draftDir, { recursive: true, force: true });
  status("running");
  currentPhase = "reading-assignment";
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
  if (archiveStaleAssignmentSourceDraft({
    draftDir,
    freshRequested,
    savedSourceCheckpoint,
    sourceCheckpoint,
    extraction,
  })) {
    console.log(`  ♻️ Previous partial-source draft archived; planning will restart from all ${extraction.pages.length} pages`);
  }
  writeJson(sourceCheckpointFile, sourceCheckpoint);
  const discoveryFile = path.join(draftDir, "discovery-contract.json");
  const existingLifecycle = getMathDiscoveryLifecycle(childId, homeworkId, {rootDir});
  if (shouldPublishDiscoveryFirst(existingLifecycle)) {
    currentPhase = "discovery-generation";
    console.log(progressLabels.discovery);
    discoveryProgressGuide().forEach((line) => console.log(`  ${line}`));
    const existingDiscovery = fs.existsSync(discoveryFile) ? readJson<MathDiscoveryEvaluationContract>(discoveryFile) : undefined;
    const evaluation = existingDiscovery ? await ensureDiscoveryArtifactsAreServed({ rootDir, childId, homeworkId, contract: existingDiscovery }) : (await withIngestionHeartbeat("Discovery", () => generateMathDiscoveryExperience({
      rootDir, retryUncertain: input.retryUncertain,
      childId,
      homeworkId,
      assignmentText: extraction.fullText, assignmentSource: extraction,
      assignmentEvidenceIds: [`assignment:${homeworkId}:source`],
      factualChildContext: { academic: mathPlannerChartContext(chart), engagement: buildMathCreativeChildContext(chart) },
    }))).contract;
    const activeSessionPlan = buildDiscoveryActiveSessionPlan({
      childId,
      homeworkId,
      evaluation,
      companion: { id: chart.companion.presetId, name: chart.companion.displayName },
    });
    currentPhase = "atomic-publication";
    status("running");
    publishDiscoveryExperience({
      rootDir,
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
    status("ready");
    console.log("Done — DISCOVERY READY");
    console.log(`Discovery: ${existingDiscovery ? "reused" : "generated"}`);
    console.log("Targeted board: waits for committed Discovery evidence");
    console.log(`Checkpoint: ${draftDir}`);
    console.log(`Start session: ${formatStartSessionCommand()} → Start child session`);
    return;
  }
  if (shouldDeferToAdaptiveWorker(existingLifecycle)) {
    status("ready");
    const generationStatus = getMathGenerationStatus(childId, homeworkId, {rootDir});
    console.log("Done — ADAPTIVE GENERATION IN PROGRESS");
    console.log(`Lifecycle: ${existingLifecycle}`);
    console.log(`Generation: ${generationStatus?.phase ?? "queued"}`);
    console.log("Start or restart Sunny; saved work resumes automatically.");
    return;
  }
  } catch(error) { status("needs_attention", error); throw Object.assign(error instanceof Error ? error : new Error(String(error)),{phase:currentPhase,checkpoint}); }
  finally { releaseMathGenerationLease({...leaseInput,token:lease.token!}); }
}

if (require.main === module) {
  void ingestMathAssignment({childId:arg("child"),pdf:arg("pdf"),fresh:flag("fresh"),retryUncertain:flag("retry-uncertain")}).catch((error) => {
    const currentPhase=error.phase ?? "preflight";
    const failureKind = classifyIngestionFailure(error, currentPhase);
    console.error(`${failureKind} — ${failureKind === "INPUT_ERROR" ? "correct the assignment input" : "saved progress is available"}`);
    console.error("Only browser-accepted Discovery is eligible for publication.");
    console.error(`Phase: ${currentPhase}`);
    if (error.checkpoint) console.error(`Checkpoint: ${error.checkpoint}`);
    console.error(`Reason: ${error instanceof Error ? error.message : String(error)}`);
    if (failureKind === "PROVIDER_PAUSED") {
      console.error("Run ingestion again; saved work will resume automatically.");
    }
    process.exitCode = 1;
  });
}
