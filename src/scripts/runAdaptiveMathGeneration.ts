import { loadSunnyRuntimeEnvironment } from "./sunnyMenu";
loadSunnyRuntimeEnvironment();
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getChildChart } from "../profiles/childChart";
import { readPriorConceptIds } from "../engine/assignmentLedger";
import {
  askDirectMathPlanner, askMathExperienceDesigner, buildDirectActiveSessionPlan,
  buildMathCreativeChildContext, correctSavedDirectMathPlannerResponse, generateDirectArtifacts, parseMathLearningProgram, parseSavedDirectMathPlannerResponse,
  findTruncatedDirectRepairReceipt,
  repairDirectArtifact,
  persistDirectExperience, buildDirectLearningCycleInput, runDirectBrowserSmokeCheck, mathPlannerCandidateCards, MATH_BROWSER_VERIFIER_VERSION, type DirectPlaywrightReport, type DirectArtifact, type DirectLearningExperiencePlan,
  type MathDesignPacket, type MathLearningProgram,
} from "../engine/directMathExperience";
import { getLearningCycle, transitionLearningCycle } from "../engine/learningCycleRepository";
import { generateCanonicalProgressionArtifact } from "../engine/canonicalProgressionGenerator";
import { upsertProfileContentCatalog } from "../engine/learningDecisionContext";
import { writeWaterfallContentCatalog } from "../profiles/chartWaterfall";
import {
  acquireMathGenerationLease,
  buildTargetedNodesResumably, getMathGenerationStatus, hashDiscoveryContract,
  hasResumableMathGenerationWork,
  publishTargetedBoardProjection, releaseMathGenerationLease, resolveAdaptiveMathDraftDir,
  revealTargetedBoard, writeMathGenerationJob,
  queueTargetedMathGeneration, setMathGenerationPhase,
  updateMathGenerationNode,
} from "../engine/adaptiveMathDiscovery";
import { readAssignmentSourceExtraction } from "../engine/assignmentSourceExtraction";
import { attachSpellingDiscoveryEvidence, buildAssignmentPlanningPacket, planAssignmentFromSourceWithTelemetry, type AssignmentPlanningPacket } from "../engine/assignmentPlanner";
import { buildSpellingTargetedCycleInput } from "../engine/learningCycleIngest";
import { generateBoardNodeImages } from "../engine/boardNodeImageGenerator";
import { resolveChildContextDir } from "../utils/contextRoot";
import {
  attributeReviewFindings,
  verifyEngineeringRepairEvidence,
  DISCOVERY_VERIFIER_VERSION,
  DISCOVERY_RELEASE_VIEWPORTS,
  isHarnessFailure,
  type JourneyCapture,
  type ReviewAttribution,
} from "../engine/discoveryVisualReview";
import { thumbnailUrlForActivity } from "../shared/activityPresentation";
import { buildAdventureBoardFromActiveSessionPlan } from "../shared/adventureBoardFromPlan";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import {
  CHILD_FACING_VISUAL_GATE_VERSION,
  judgeChildFacingScreens,
  selectVerifiedChildFacingCaptures,
} from "../engine/childFacingVisualGate";

const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;
const write = (file: string, value: unknown): void => { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.${process.pid}.tmp`; fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(temp, file); };
const writeText = (file: string, value: string): void => { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.${process.pid}.tmp`; fs.writeFileSync(temp, value); fs.renameSync(temp, file); };

type VisualRepairAttempt = {
  version: 1;
  patchParserVersion?: number;
  gateVersion: number;
  nodeId: string;
  inputHtmlHash: string;
  outputHtmlHash?: string;
  failures: string[];
  status: "started" | "provider_completed" | "verified" | "failed" | "verification_uncertain";
  startedAt?: string;
  finishedAt?: string;
  error?: string;
};

const VISUAL_REPAIR_PATCH_PARSER_VERSION = 2;
const MAX_VISUAL_REPAIR_PASSES = 1;

function checkerContractAmbiguity(report?: Pick<DirectPlaywrightReport, "failures">): string | undefined {
  return report?.failures.find(failure => failure.startsWith("math_journey_checker_contract_ambiguity;"));
}

const CREATOR_MANIFEST_CONTRACT_FAILURE = /creator_playwright_manifest_(?:file_missing|hash_mismatch|json_invalid|invalid|version|node_mismatch|item_coverage|item_order|item_invalid|assertion_missing|assertion_invalid|completion_missing|action_invalid)/;

function visualRepairNodeDir(draft: string, nodeId: string): string {
  return path.join(draft, "provider-diagnostics", `visual-repair-v${CHILD_FACING_VISUAL_GATE_VERSION}`, nodeId);
}

function visualRepairAttemptPath(draft: string, nodeId: string, inputHtmlHash: string): string {
  return path.join(visualRepairNodeDir(draft, nodeId), inputHtmlHash.slice(0, 12), `${nodeId}-visual-repair-attempt.json`);
}

function findVisualRepairAttempt(draft: string, nodeId: string, artifactHash: string): { file: string; value: VisualRepairAttempt } | undefined {
  const nodeDir = visualRepairNodeDir(draft, nodeId);
  if (!fs.existsSync(nodeDir)) return undefined;
  const files = fs.readdirSync(nodeDir, { recursive: true, encoding: "utf8" })
    .filter(name => name.endsWith(`${nodeId}-visual-repair-attempt.json`))
    .map(name => path.join(nodeDir, name));
  for (const file of files) {
    const value = read<VisualRepairAttempt>(file);
    if (value.gateVersion !== CHILD_FACING_VISUAL_GATE_VERSION || value.nodeId !== nodeId) {
      throw new Error(`visual_repair_attempt_identity_mismatch:${nodeId}`);
    }
    if (value.inputHtmlHash === artifactHash || value.outputHtmlHash === artifactHash) return { file, value };
  }
  return undefined;
}

function countVisualRepairAttempts(draft: string, nodeId: string): number {
  const diagnosticsDir = path.join(draft, "provider-diagnostics");
  if (!fs.existsSync(diagnosticsDir)) return 0;
  return fs.readdirSync(diagnosticsDir, { recursive: true, encoding: "utf8" })
    .filter(name => /(^|\/)visual-repair-v\d+\//.test(name))
    .filter(name => name.endsWith(`${nodeId}-visual-repair-attempt.json`)).length;
}

function boardVisualReviewHistoryFile(draft: string, nodeId: string): string {
  return path.join(draft, "provider-diagnostics", `${nodeId}-visual-review-history.jsonl`);
}

function appendBoardVisualReviewHistory(draft: string, nodeId: string, row: Record<string, unknown>): void {
  const file = boardVisualReviewHistoryFile(draft, nodeId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify({ ...row, recordedAt: new Date().toISOString() })}\n`, "utf8");
}

type BoardVisualReviewRecord = {
  attribution: ReviewAttribution | null;
  repairAuthorized: boolean;
  findings: Array<{ screen: number | null; claim: "visual_defect" | "content_missing"; observation: string }>;
};

type BoardPlaywrightReport = DirectPlaywrightReport & {
  htmlHash: string;
  verifierVersion: number;
  visualReview?: BoardVisualReviewRecord;
};

function isChildVisualReviewFailure(attempt: VisualRepairAttempt | undefined): boolean {
  return attempt?.status === "failed"
    && Boolean(attempt.outputHtmlHash)
    && Boolean(attempt.error?.includes(":child_visual_review:"));
}

function isRolledBackVisualRepair(attempt: VisualRepairAttempt | undefined, artifactHash: string): boolean {
  return isChildVisualReviewFailure(attempt) && attempt?.inputHtmlHash === artifactHash;
}

function mayRunVisualRepair(attempt: VisualRepairAttempt | undefined, retryUncertain: boolean, artifactHash?: string): boolean {
  if (!attempt || ["started", "provider_completed"].includes(attempt.status)) return true;
  if (artifactHash && isRolledBackVisualRepair(attempt, artifactHash)) return true;
  if (attempt.status === "failed"
    && (attempt.patchParserVersion ?? 1) < VISUAL_REPAIR_PATCH_PARSER_VERSION
    && attempt.error?.startsWith("discovery_repair_patch_")) return true;
  return retryUncertain && attempt.status === "verification_uncertain";
}

function childFacingVisualAuditFile(draft: string, artifact: Pick<DirectArtifact, "nodeId" | "htmlHash">): string {
  return path.join(
    draft,
    "provider-diagnostics",
    `${artifact.nodeId}-visual-v${CHILD_FACING_VISUAL_GATE_VERSION}-${artifact.htmlHash?.slice(0, 12)}.json`,
  );
}

function hasInterruptedVisualAudit(draft: string, artifact: Pick<DirectArtifact, "nodeId" | "htmlHash">): boolean {
  if (!artifact.htmlHash) return false;
  const file = childFacingVisualAuditFile(draft, artifact);
  if (!fs.existsSync(file)) return false;
  try {
    const status = read<{ status?: string }>(file).status;
    return ["in_flight", "outcome_uncertain", "received_raw"].includes(status ?? "");
  } catch {
    return false;
  }
}

function arg(name: string): string {
  const value = process.argv.slice(2).find((part) => part.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value) throw new Error(`missing_argument:${name}`);
  return value.trim().toLowerCase();
}

function hasUncertainTargetedDesignReceipt(draftDir: string): boolean {
  const receiptDir = path.join(draftDir, "provider-receipts");
  if (!fs.existsSync(receiptDir)) return false;
  return fs.readdirSync(receiptDir)
    .filter((name) => /^targeted-design-\d+\.stage\.json$/.test(name))
    .some((name) => {
      try {
        const stage = read<{ requestHash?: string }>(path.join(receiptDir, name));
        if (!stage.requestHash || !/^[a-f0-9]{64}$/.test(stage.requestHash)) return false;
        const receipt = read<{ status?: string }>(path.join(receiptDir, `${stage.requestHash}.json`));
        return receipt.status === "in_flight" || receipt.status === "outcome_uncertain";
      } catch {
        return false;
      }
    });
}

export function nativeSpellingInstrumentContract(
  node: ActiveSessionPlan["nodePlan"][number],
  evidenceContract: unknown,
): { version: 1; node: Omit<typeof node, "thumbnailUrl" | "thumbnailPrompt">; evidenceContract: unknown } {
  const { thumbnailUrl: _thumbnailUrl, thumbnailPrompt: _thumbnailPrompt, ...contractNode } = node;
  return { version: 1, node: contractNode, evidenceContract };
}

function placeholderArtifacts(plan: DirectLearningExperiencePlan, childId: string, homeworkId: string, ready: DirectArtifact[]): DirectArtifact[] {
  const byId = new Map(ready.map((artifact) => [artifact.nodeId, artifact]));
  return plan.activities.map((activity) => byId.get(activity.id) ?? {
    childId, homeworkId, nodeId: activity.id, title: activity.title, htmlPath: "", artworkUrl: "",
    creatorPrompt: "pending frozen design implementation", promptHash: "pending", plannerModel: process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5", creatorModel: "pending",
  });
}

export async function runAdaptiveMathGeneration(
  childId: string,
  homeworkId: string,
  rootDir = process.cwd(),
  options: { retryUncertainProvider?: boolean; authorizeTruncatedRepairReplacementNodeId?: string } = {},
): Promise<void> {
  const draft = resolveAdaptiveMathDraftDir(childId, homeworkId, { rootDir });
  const programFile = path.join(draft, "math-learning-program.json");
  const designFile = path.join(draft, "design-packet.json");
  const planFile = path.join(draft, "designed-plan.json");
  const buildFile = path.join(draft, "candidate-build-v3.json");
  const reportsFile = path.join(draft, "browser-verification.json");
  const rawPlannerResponseFile = path.join(draft, "provider-diagnostics", "targeted-planner-response.json");
  const plannerCorrectionResponseFile = rawPlannerResponseFile.replace(/\.json$/i, "-correction.json");
  const cycle = getLearningCycle(childId, homeworkId, { rootDir });
  if (!cycle) throw new Error(`learning_cycle_missing:${homeworkId}`);
  if (cycle.domain === "spelling") return runSpellingTargetedGeneration(childId, homeworkId, rootDir);
  const initialJob = getMathGenerationStatus(childId, homeworkId, { rootDir });
  let recoveredProgram: MathLearningProgram | undefined;
  let savedPlannerTruthError: string | undefined;
  if (!fs.existsSync(programFile) && fs.existsSync(rawPlannerResponseFile)) {
    try {
      recoveredProgram = parseSavedDirectMathPlannerResponse(read(rawPlannerResponseFile));
      console.log(` 🎮 [adaptive-math] [targeted-planner] [revalidated] child=${childId} homework=${homeworkId}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("math_item_clock_state_inconsistent:")) {
        savedPlannerTruthError = error.message;
      }
      console.log(` 🎮 [adaptive-math] [targeted-planner] [saved-response-still-invalid] child=${childId} homework=${homeworkId} reason=${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const mayRetryFrozenDesign = Boolean(
    options.retryUncertainProvider
    && fs.existsSync(programFile)
    && !fs.existsSync(designFile)
    && !fs.existsSync(planFile)
    && hasUncertainTargetedDesignReceipt(draft),
  );
  const isCurrentGeneratedContentRejection = (saved?: Partial<BoardPlaywrightReport>): boolean => Boolean(
    saved
    && saved.verifierVersion === MATH_BROWSER_VERIFIER_VERSION
    && saved.passed === false
    && saved.failures?.length
    && saved.visualReview?.repairAuthorized === true
    && saved.visualReview.attribution?.category === "generated_content_defect",
  );
  const mayReverifySavedArtifacts = Boolean(initialJob?.phase === "needs_attention" && fs.existsSync(buildFile) && fs.existsSync(reportsFile) && (() => {
    try {
      const savedBuild = read<{ artifacts?: DirectArtifact[] }>(buildFile);
      const savedReports = read<Record<string, { verifierVersion?: number }>>(reportsFile);
      return (savedBuild.artifacts ?? []).some((artifact) => {
        const status = initialJob.nodes.find((node) => node.nodeId === artifact.nodeId)?.status;
        return ["ready", "failed_resumable", "needs_attention"].includes(status ?? "")
          && savedReports[artifact.nodeId]?.verifierVersion !== MATH_BROWSER_VERIFIER_VERSION;
      });
    } catch {
      return false;
    }
  })());
  const mayRepairSavedVisualRejection = Boolean(initialJob?.phase === "needs_attention" && fs.existsSync(buildFile) && fs.existsSync(reportsFile) && (() => {
    try {
      const savedBuild = read<{ artifacts?: DirectArtifact[] }>(buildFile);
      const savedReports = read<Record<string, BoardPlaywrightReport>>(reportsFile);
      return (savedBuild.artifacts ?? []).some((artifact) => {
        const status = initialJob.nodes.find((node) => node.nodeId === artifact.nodeId)?.status;
        const attempt = findVisualRepairAttempt(draft, artifact.nodeId, artifact.htmlHash ?? "")?.value;
        const attemptCount = countVisualRepairAttempts(draft, artifact.nodeId);
        const resumableAttempt = attempt && ["started", "provider_completed"].includes(attempt.status);
        return ["failed_resumable", "needs_attention"].includes(status ?? "")
          && (Boolean(resumableAttempt)
            || (attemptCount < MAX_VISUAL_REPAIR_PASSES
              && isCurrentGeneratedContentRejection(savedReports[artifact.nodeId])
              && mayRunVisualRepair(attempt, Boolean(options.retryUncertainProvider), artifact.htmlHash)));
      });
    } catch (error) {
      console.warn(` 🎮 [adaptive-math] [visual-repair-eligibility] [invalid] child=${childId} homework=${homeworkId} reason=${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  })());
  const mayFinalizeSavedVisualRepair = Boolean(initialJob?.phase === "needs_attention" && fs.existsSync(buildFile) && (() => {
    try {
      const savedBuild = read<{ artifacts?: DirectArtifact[] }>(buildFile);
      return (savedBuild.artifacts ?? []).some((artifact) => {
        const status = initialJob.nodes.find((node) => node.nodeId === artifact.nodeId)?.status;
        const attempt = findVisualRepairAttempt(draft, artifact.nodeId, artifact.htmlHash ?? "")?.value;
        return status === "ready" && attempt?.status === "provider_completed" && attempt.outputHtmlHash === artifact.htmlHash;
      });
    } catch (error) {
      console.warn(` 🎮 [adaptive-math] [visual-repair-finalization] [invalid] child=${childId} homework=${homeworkId} reason=${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  })());
  const mayResumeSavedVisualReview = Boolean(options.retryUncertainProvider && initialJob?.phase === "needs_attention" && fs.existsSync(buildFile) && fs.existsSync(reportsFile) && (() => {
    try {
      const savedBuild = read<{ artifacts?: DirectArtifact[] }>(buildFile);
      const savedReports = read<Record<string, DirectPlaywrightReport & { verifierVersion?: number }>>(reportsFile);
      return (savedBuild.artifacts ?? []).some((artifact) => {
        const status = initialJob.nodes.find((node) => node.nodeId === artifact.nodeId)?.status;
        const report = savedReports[artifact.nodeId];
        return status === "needs_attention"
          && report?.passed === true
          && report.verifierVersion === MATH_BROWSER_VERIFIER_VERSION
          && hasInterruptedVisualAudit(draft, artifact);
      });
    } catch {
      return false;
    }
  })());
  const hasUnfinishedSiblingWork = Boolean(initialJob && hasResumableMathGenerationWork(initialJob));
  const replacementNodeId = options.authorizeTruncatedRepairReplacementNodeId;
  const replacementAuthorizationFile = replacementNodeId
    ? path.join(draft, "provider-diagnostics", `${replacementNodeId}-repair-replacement-authorization.json`)
    : undefined;
  const replacementAlreadyResolved = Boolean(replacementNodeId
    && replacementAuthorizationFile
    && fs.existsSync(replacementAuthorizationFile)
    && initialJob?.nodes.some(node => node.nodeId === replacementNodeId && node.status === "ready"));
  if (replacementAlreadyResolved) {
    console.log(` 🎮 [adaptive-math] [board-repair-replacement] [already-complete] node=${replacementNodeId}`);
    return;
  }
  const mayReplaceTruncatedRepair = Boolean(replacementNodeId
    && initialJob?.nodes.some(node => node.nodeId === replacementNodeId && node.status === "needs_attention")
    && findTruncatedDirectRepairReceipt(path.join(draft, "provider-diagnostics"), replacementNodeId));
  if (replacementNodeId && !mayReplaceTruncatedRepair) throw new Error(`board_repair_replacement_not_eligible:${replacementNodeId}`);
  if (initialJob?.phase === "needs_attention" && !hasUnfinishedSiblingWork && !recoveredProgram && !savedPlannerTruthError && !mayRetryFrozenDesign && !mayReverifySavedArtifacts && !mayRepairSavedVisualRejection && !mayFinalizeSavedVisualRepair && !mayResumeSavedVisualReview && !mayReplaceTruncatedRepair) {
    console.log(` 🎮 [adaptive-math] [worker] [no-work] child=${childId} homework=${homeworkId} phase=${initialJob.phase}`);
    return;
  }
  queueTargetedMathGeneration({rootDir,childId,homeworkId});
  try {
  const extraction = readAssignmentSourceExtraction(path.join(draft, "assignment-extraction.json"));
  const chart = getChildChart(childId, { rootDir });
  const summaryFile = path.join(draft, "discovery-evidence-summary.json");
  const discoveryEvidenceSummary = fs.existsSync(summaryFile)
    ? read<{ summary: unknown }>(summaryFile).summary
    : undefined;
  const program: MathLearningProgram = fs.existsSync(programFile)
    ? parseMathLearningProgram(read(programFile))
    : recoveredProgram ?? (savedPlannerTruthError
      ? await correctSavedDirectMathPlannerResponse({
        savedResponse: read(rawPlannerResponseFile),
        validationError: savedPlannerTruthError,
        correctionResponseFile: plannerCorrectionResponseFile,
      })
      : await askDirectMathPlanner({
      childId,
      chart,
      extraction,
      priorConceptIds: readPriorConceptIds(childId, { rootDir }),
      priorOutcomes: { discoveryCycle: cycle },
      discoveryEvidenceSummary,
      rawResponseFile: rawPlannerResponseFile,
    }));
  write(programFile, program);
  if (!fs.existsSync(designFile) || !fs.existsSync(planFile)) setMathGenerationPhase({rootDir,childId,homeworkId,phase:"board_designing"});
  const designed = fs.existsSync(designFile) && fs.existsSync(planFile)
    ? { packet: read<MathDesignPacket>(designFile), plan: read<DirectLearningExperiencePlan>(planFile) }
    : await askMathExperienceDesigner({ childId, program, childContext: buildMathCreativeChildContext(chart), priorOutcomes: { discoveryCycle: cycle }, checkpointFile: path.join(draft, "design-checkpoint.json"), rawResponseDir: path.join(draft, "provider-diagnostics"), retryUncertain: mayRetryFrozenDesign });
  write(designFile, designed.packet); write(planFile, designed.plan);
  const programHash = hashDiscoveryContract(program);
  const designHash = hashDiscoveryContract(designed.packet);
  let build = fs.existsSync(buildFile) ? read<{ artifacts: DirectArtifact[]; backgroundUrl: string; questArtworkUrl: string; bossArtworkUrl: string }>(buildFile) : { artifacts: [], backgroundUrl: "/generated/adaptive-discovery-background.svg", questArtworkUrl: "", bossArtworkUrl: "" };
  const reports = fs.existsSync(reportsFile) ? read<Record<string, BoardPlaywrightReport>>(reportsFile) : {};
  const report = (): DirectPlaywrightReport => ({ passed: designed.plan.activities.every(a => reports[a.id]?.passed), failures: Object.values(reports).flatMap(r => r.failures), screenshots: Object.values(reports).flatMap(r => r.screenshots) });
  const active = () => buildDirectActiveSessionPlan({ childId, homeworkId, plan: designed.plan, artifacts: placeholderArtifacts(designed.plan, childId, homeworkId, build.artifacts), backgroundUrl: build.backgroundUrl, questArtworkUrl: build.questArtworkUrl, bossArtworkUrl: build.bossArtworkUrl, report: report(), companion: { id: chart.companion.presetId, name: chart.companion.displayName } });
  const canonical = () => buildDirectLearningCycleInput({ childId, homeworkId, extraction, plannerPlan: designed.plan, activeSessionPlan: active(), artifacts: placeholderArtifacts(designed.plan, childId, homeworkId, build.artifacts), assumptions: program.assumptions });
  const contract = canonical();
  if (!getLearningCycle(childId, homeworkId, { rootDir })?.adaptiveGeneration?.designHash) {
    revealTargetedBoard({ rootDir, childId, homeworkId, programHash, designHash, nodes: [], nodeContracts: contract.nodes, academicTheory: contract.academicTheory, academicPredictions: contract.academicPredictions, assumptions: contract.assumptions, agencyExperiment: contract.agencyExperiment });
  }
  if (!getMathGenerationStatus(childId, homeworkId, { rootDir })?.programHash) {
    writeMathGenerationJob({ rootDir, childId, homeworkId, programHash, designHash, nodeIds: designed.plan.activities.map(a => a.id) });
  }
  const project = (): void => {
    const status = getMathGenerationStatus(childId, homeworkId, { rootDir });
    publishTargetedBoardProjection({ rootDir, childId, activeSessionPlan: active(), nodeStatuses: Object.fromEntries(status?.nodes.map(n => [n.nodeId, n.status]) ?? []) });
  };
  const verifyArtifact = async (artifact: DirectArtifact): Promise<void> => {
    const htmlHash = crypto.createHash("sha256").update(fs.readFileSync(artifact.htmlPath)).digest("hex");
    if (artifact.htmlHash !== htmlHash) throw new Error(`targeted_artifact_hash_changed:${artifact.nodeId}`);
    const activity = designed.plan.activities.find(a => a.id === artifact.nodeId);
    if (!activity) throw new Error(`targeted_activity_missing:${artifact.nodeId}`);
    artifact.itemIds = activity.items.map(item => item.id);
    const saved = reports[artifact.nodeId];
    const manifestBytesHash = artifact.creatorContractVersion === 19 && artifact.creatorTestPath && fs.existsSync(artifact.creatorTestPath)
      ? crypto.createHash("sha256").update(fs.readFileSync(artifact.creatorTestPath)).digest("hex")
      : undefined;
    const savedManifestProofMatches = artifact.creatorContractVersion !== 19 || Boolean(
      artifact.creatorTestHash
      && manifestBytesHash === artifact.creatorTestHash
      && saved?.creatorTests?.passed === true
      && saved.creatorTests.manifestHash === artifact.creatorTestHash,
    );
    if (!saved?.passed || saved.htmlHash !== htmlHash || saved.verifierVersion !== MATH_BROWSER_VERIFIER_VERSION || !savedManifestProofMatches) {
      reports[artifact.nodeId] = { ...await runDirectBrowserSmokeCheck({ artifacts: [artifact], rootDir, itemContractsByNodeId: { [artifact.nodeId]: activity.items } }), htmlHash, verifierVersion: MATH_BROWSER_VERIFIER_VERSION };
      write(reportsFile, reports);
    }
    if (artifact.creatorContractVersion === 19 && !(
      artifact.creatorTestHash
      && manifestBytesHash === artifact.creatorTestHash
      && reports[artifact.nodeId].creatorTests?.passed === true
      && reports[artifact.nodeId].creatorTests?.manifestHash === artifact.creatorTestHash
    )) {
      const failure = `${artifact.nodeId}:creator_playwright_manifest_proof_mismatch`;
      reports[artifact.nodeId] = {
        ...reports[artifact.nodeId],
        passed: false,
        failures: [...new Set([...reports[artifact.nodeId].failures, failure])],
      };
      write(reportsFile, reports);
    }
    verifyEngineeringRepairEvidence(path.join(draft, "provider-diagnostics", `${artifact.nodeId}.engineering-repair.json`), {
      artifactHash: htmlHash,
      academicHash: artifact.academicContractHash!,
      designHash: artifact.designArtifactHash!,
      verifierVersion: MATH_BROWSER_VERIFIER_VERSION * 1000 + DISCOVERY_VERIFIER_VERSION,
      runtime: reports[artifact.nodeId].verification?.runtime ?? reports[artifact.nodeId].passed,
      scoring: reports[artifact.nodeId].verification?.scoring ?? false,
      contracts: reports[artifact.nodeId].verification?.contracts ?? false,
      viewports: DISCOVERY_RELEASE_VIEWPORTS.map(viewport => `${viewport.width}x${viewport.height}`),
    });
    const checkerAmbiguity = checkerContractAmbiguity(reports[artifact.nodeId]);
    if (checkerAmbiguity) throw new Error(`targeted_verifier_contract_ambiguity:${artifact.nodeId}:${checkerAmbiguity}`);
    const browserHarnessFailures = reports[artifact.nodeId].failures.filter(isHarnessFailure);
    if (browserHarnessFailures.length > 0) {
      throw new Error(`targeted_visual_review_needs_attention:${artifact.nodeId}:harness_failure:${browserHarnessFailures.join("|")}`);
    }
    if (!reports[artifact.nodeId].passed) {
      const contractFailures = reports[artifact.nodeId].failures.filter(failure => CREATOR_MANIFEST_CONTRACT_FAILURE.test(failure));
      const attribution: ReviewAttribution = contractFailures.length > 0
        ? { category: "verifier_incompatible", source: "deterministic", details: contractFailures }
        : reports[artifact.nodeId].screenshots.length === 0
          ? { category: "capture_defect", source: "deterministic", details: ["browser_failure_without_capture"] }
          : { category: "generated_content_defect", source: "deterministic", details: reports[artifact.nodeId].failures };
      const repairAuthorized = attribution.category === "generated_content_defect";
      reports[artifact.nodeId] = {
        ...reports[artifact.nodeId],
        visualReview: { attribution, repairAuthorized, findings: [] },
      };
      write(reportsFile, reports);
      appendBoardVisualReviewHistory(draft, artifact.nodeId, {
        artifactHash: htmlHash,
        browserVerifierVersion: MATH_BROWSER_VERIFIER_VERSION,
        visualGateVersion: CHILD_FACING_VISUAL_GATE_VERSION,
        deterministicFailures: reports[artifact.nodeId].failures,
        attribution,
        repairAuthorized,
      });
      console.log(` 🎮 [adaptive-math] [verification-attribution] [${repairAuthorized ? "repair-authorized" : "needs-attention"}] node=${artifact.nodeId} category=${attribution.category}`);
      if (!repairAuthorized) {
        const reason = contractFailures.length > 0 ? "creator_manifest_contract" : attribution.category;
        throw new Error(`targeted_visual_review_needs_attention:${artifact.nodeId}:${reason}:${attribution.details.join("|")}`);
      }
      throw new Error(`targeted_generated_content_defect:${artifact.nodeId}:${reports[artifact.nodeId].failures.join("|")}`);
    }
    const visualAuditFile = childFacingVisualAuditFile(draft, artifact);
    const legacyVisualAuditFile = path.join(draft, "provider-diagnostics", `${artifact.nodeId}-visual-verdict.json`);
    if (!fs.existsSync(visualAuditFile) && fs.existsSync(legacyVisualAuditFile)) {
      const legacyAudit = read<{ status?: string; decision?: string }>(legacyVisualAuditFile);
      if ((legacyAudit.status ?? (legacyAudit.decision ? "received" : undefined)) === "received") {
        fs.copyFileSync(legacyVisualAuditFile, visualAuditFile);
      }
    }
    const recordedCaptures = reports[artifact.nodeId].captures ?? [];
    const screens: JourneyCapture[] = selectVerifiedChildFacingCaptures(recordedCaptures).filter(capture =>
      capture.viewport === "sunny"
      && capture.verifierVersion === DISCOVERY_VERIFIER_VERSION
      && (capture.kind === "completion" || (
        capture.kind === "academic_item"
        && capture.promptVisible
        && typeof capture.observedItemId === "string"
        && capture.observedItemId.length > 0
        && (!capture.expectedItemId || capture.expectedItemId === capture.observedItemId)
      )),
    );
    if (!screens.some(screen => screen.kind === "academic_item")) {
      const attribution: ReviewAttribution = {
        category: "capture_defect",
        source: "deterministic",
        details: ["no_browser_confirmed_academic_screen"],
      };
      reports[artifact.nodeId] = {
        ...reports[artifact.nodeId],
        passed: false,
        failures: ["child_visual_review_needs_attention:capture_defect:no_browser_confirmed_academic_screen"],
        visualReview: { attribution, repairAuthorized: false, findings: [] },
      };
      write(reportsFile, reports);
      appendBoardVisualReviewHistory(draft, artifact.nodeId, {
        artifactHash: htmlHash,
        browserVerifierVersion: MATH_BROWSER_VERIFIER_VERSION,
        visualGateVersion: CHILD_FACING_VISUAL_GATE_VERSION,
        screens,
        attribution,
        repairAuthorized: false,
      });
      console.log(` 🎮 [adaptive-math] [board-review-attribution] [needs-attention] node=${artifact.nodeId} category=capture_defect reason=no_browser_confirmed_academic_screen`);
      throw new Error(`targeted_visual_review_needs_attention:${artifact.nodeId}:capture_defect:no_browser_confirmed_academic_screen`);
    }
    let visualVerdict: Awaited<ReturnType<typeof judgeChildFacingScreens>>;
    try {
      visualVerdict = await judgeChildFacingScreens({
        screenshotPaths: screens.map(screen => screen.path),
        auditFile: visualAuditFile,
        retryUncertain: options.retryUncertainProvider,
        citeScreens: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attribution: ReviewAttribution = { category: "harness_failure", source: "deterministic", details: [message] };
      reports[artifact.nodeId] = {
        ...reports[artifact.nodeId],
        passed: false,
        failures: [`child_visual_review_needs_attention:harness_failure:${message}`],
        visualReview: { attribution, repairAuthorized: false, findings: [] },
      };
      write(reportsFile, reports);
      appendBoardVisualReviewHistory(draft, artifact.nodeId, {
        artifactHash: htmlHash,
        browserVerifierVersion: MATH_BROWSER_VERIFIER_VERSION,
        visualGateVersion: CHILD_FACING_VISUAL_GATE_VERSION,
        screens,
        error: message,
        attribution,
        repairAuthorized: false,
      });
      throw new Error(`targeted_visual_review_needs_attention:${artifact.nodeId}:harness_failure:${message}`);
    }
    if (visualVerdict.decision === "reject") {
      const findings = visualVerdict.findings ?? [];
      const attribution = attributeReviewFindings(findings, screens);
      const repairAuthorized = attribution.category === "generated_content_defect";
      reports[artifact.nodeId] = {
        ...reports[artifact.nodeId],
        passed: false,
        failures: findings.length > 0
          ? findings.map(finding => `child_visual_review:screen=${finding.screen ?? "none"}:${finding.observation}`)
          : ["child_visual_review:reject_without_findings"],
        visualReview: { attribution, repairAuthorized, findings },
      };
      write(reportsFile, reports);
      appendBoardVisualReviewHistory(draft, artifact.nodeId, {
        artifactHash: htmlHash,
        browserVerifierVersion: MATH_BROWSER_VERIFIER_VERSION,
        visualGateVersion: CHILD_FACING_VISUAL_GATE_VERSION,
        screens,
        verdict: visualVerdict,
        attribution,
        repairAuthorized,
      });
      console.log(` 🎮 [adaptive-math] [board-review-attribution] [${repairAuthorized ? "repair-authorized" : "needs-attention"}] node=${artifact.nodeId} category=${attribution.category}`);
      if (!repairAuthorized) {
        throw new Error(`targeted_visual_review_needs_attention:${artifact.nodeId}:${attribution.category}:${attribution.details.join("|")}`);
      }
      throw new Error(`targeted_generated_content_defect:${artifact.nodeId}:${reports[artifact.nodeId].failures.join("|")}`);
    }
    reports[artifact.nodeId] = { ...reports[artifact.nodeId], visualReview: { attribution: null, repairAuthorized: false, findings: [] } };
    write(reportsFile, reports);
    appendBoardVisualReviewHistory(draft, artifact.nodeId, {
      artifactHash: htmlHash,
      browserVerifierVersion: MATH_BROWSER_VERIFIER_VERSION,
      visualGateVersion: CHILD_FACING_VISUAL_GATE_VERSION,
      screens,
      verdict: visualVerdict,
      attribution: null,
      repairAuthorized: false,
    });
    console.log(` 🎮 [adaptive-math] [artifact-verification] [passed] node=${artifact.nodeId} hash=${htmlHash}`);
  };
  const bindVerifiedArtifact = (artifact: DirectArtifact): void => {
    const htmlHash = artifact.htmlHash;
    if (!htmlHash || reports[artifact.nodeId]?.passed !== true || reports[artifact.nodeId]?.htmlHash !== htmlHash) {
      throw new Error(`targeted_artifact_binding_without_current_proof:${artifact.nodeId}`);
    }
    const current = getLearningCycle(childId, homeworkId, { rootDir })!;
    const prior = current.nodes.find(n => n.nodeId === artifact.nodeId)!;
    if (prior.artifactBinding?.creativeProvenance?.generatedHtmlHash !== htmlHash || prior.artifactBinding.validationProof?.verifierVersion !== MATH_BROWSER_VERIFIER_VERSION) {
      if (prior.state === "completed" && prior.artifactBinding?.creativeProvenance?.generatedHtmlHash !== htmlHash) throw new Error(`completed_artifact_binding_missing:${artifact.nodeId}`);
      const binding = canonical().nodes.find(n => n.nodeId === artifact.nodeId)!.artifactBinding!;
      binding.validationProof = {engine:"playwright",passed:true,worldStateChanged:true,screenshotPaths:reports[artifact.nodeId].screenshots,htmlHash,verifierVersion:MATH_BROWSER_VERIFIER_VERSION};
      transitionLearningCycle(childId, homeworkId, current.revision, { type: "artifact_bound", nodeId: artifact.nodeId, artifact: binding }, { rootDir });
    }
    console.log(` 🎮 [adaptive-math] [artifact-publication] [verified-bound] node=${artifact.nodeId} hash=${htmlHash}`);
  };
  const verifyAndBind = async (artifact: DirectArtifact): Promise<void> => {
    await verifyArtifact(artifact);
    bindVerifiedArtifact(artifact);
  };
  const markArtifactUnavailable = (nodeId: string, reason: string): void => {
    const generationNode = getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes
      .find(candidate => candidate.nodeId === nodeId);
    updateMathGenerationNode({
      rootDir,
      childId,
      homeworkId,
      nodeId,
      status: "needs_attention",
      ...(generationNode?.artifactHash ? { artifactHash: generationNode.artifactHash } : {}),
      error: reason,
    });
    const current = getLearningCycle(childId, homeworkId, { rootDir });
    const node = current?.nodes.find(candidate => candidate.nodeId === nodeId);
    if (current && node && node.state !== "blocked" && node.state !== "completed") {
      transitionLearningCycle(childId, homeworkId, current.revision, {
        type: "artifact_generation_attention_required",
        nodeId,
        reason,
      }, { rootDir });
    }
    console.log(` 🎮 [adaptive-math] [artifact-publication] [withheld] node=${nodeId} reason=${reason}`);
  };
  if (mayReplaceTruncatedRepair && replacementNodeId) {
    const artifact = build.artifacts.find(candidate => candidate.nodeId === replacementNodeId);
    const activity = designed.plan.activities.find(candidate => candidate.id === replacementNodeId);
    const savedReport = reports[replacementNodeId];
    if (!artifact || !activity || !savedReport) throw new Error(`board_repair_replacement_checkpoint_missing:${replacementNodeId}`);
    console.log(` 🎮 [adaptive-math] [board-repair-replacement] [explicitly-authorized] node=${replacementNodeId}`);
    try {
      const repaired = await repairDirectArtifact({
        rootDir,
        artifact,
        activity,
        failures: savedReport.failures,
        screenshotPaths: savedReport.screenshots,
        outputDir: path.join(draft, "provider-diagnostics"),
        authorizeTruncatedReplacement: true,
      });
      await verifyAndBind(repaired);
      const merged = new Map(build.artifacts.map(candidate => [candidate.nodeId, candidate]));
      merged.set(replacementNodeId, repaired);
      build = { ...build, artifacts: [...merged.values()] };
      write(buildFile, build);
      updateMathGenerationNode({ rootDir, childId, homeworkId, nodeId: replacementNodeId, status: "ready", artifactHash: repaired.htmlHash });
      console.log(` 🎮 [adaptive-math] [board-repair-replacement] [verified] node=${replacementNodeId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markArtifactUnavailable(replacementNodeId, message);
      console.log(` 🎮 [adaptive-math] [board-repair-replacement] [needs-attention] node=${replacementNodeId} reason=${message}`);
    }
  }
  // Repair interrupted publication from saved artifacts, including old board_ready
  // jobs and verifier false negatives. Reverification does not consume a build
  // attempt or buy a repair.
  for (const artifact of build.artifacts) {
    const node = getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes.find(candidate => candidate.nodeId === artifact.nodeId);
    if (node?.status === "ready") {
      try {
        await verifyAndBind(artifact);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        markArtifactUnavailable(artifact.nodeId, message);
        continue;
      }
      if (getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase === "needs_attention") {
        updateMathGenerationNode({ rootDir, childId, homeworkId, nodeId: artifact.nodeId, status: "ready", artifactHash: artifact.htmlHash });
      }
      const completedRepair = findVisualRepairAttempt(draft, artifact.nodeId, artifact.htmlHash ?? "");
      if (completedRepair?.value.status === "provider_completed" && completedRepair.value.outputHtmlHash === artifact.htmlHash) {
        write(completedRepair.file, {
          ...completedRepair.value,
          status: "verified",
          finishedAt: new Date().toISOString(),
        });
        console.log(` 🎮 [adaptive-math] [visual-repair] [publication-resumed] node=${artifact.nodeId} gate=v${CHILD_FACING_VISUAL_GATE_VERSION}`);
      }
    }
    else if (node?.status === "needs_attention"
      && options.retryUncertainProvider
      && reports[artifact.nodeId]?.passed === true
      && reports[artifact.nodeId]?.verifierVersion === MATH_BROWSER_VERIFIER_VERSION
      && hasInterruptedVisualAudit(draft, artifact)) {
      try {
        await verifyAndBind(artifact);
        updateMathGenerationNode({ rootDir, childId, homeworkId, nodeId: artifact.nodeId, status: "ready", artifactHash: artifact.htmlHash });
        console.log(` 🎮 [adaptive-math] [visual-review] [recovered] child=${childId} homework=${homeworkId} node=${artifact.nodeId}`);
      } catch (error) {
        console.log(` 🎮 [adaptive-math] [visual-review] [still-failing] child=${childId} homework=${homeworkId} node=${artifact.nodeId} reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }
    else if (["failed_resumable", "needs_attention"].includes(node?.status ?? "")
      && reports[artifact.nodeId]?.verifierVersion !== MATH_BROWSER_VERIFIER_VERSION) {
      try {
        await verifyAndBind(artifact);
        updateMathGenerationNode({ rootDir, childId, homeworkId, nodeId: artifact.nodeId, status: "ready", artifactHash: artifact.htmlHash });
        console.log(` 🎮 [adaptive-math] [node-reverification] [recovered] child=${childId} homework=${homeworkId} node=${artifact.nodeId}`);
      } catch (error) {
        console.log(` 🎮 [adaptive-math] [node-reverification] [still-failing] child=${childId} homework=${homeworkId} node=${artifact.nodeId} reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  project();
  await buildTargetedNodesResumably({ rootDir, childId, homeworkId, firstNodeId: designed.plan.activities[0]?.id ?? "", concurrency: 2, buildNode: async (nodeId) => {
    let artifact = build.artifacts.find(candidate => candidate.nodeId === nodeId);
    if (!artifact) {
      const generated = await generateDirectArtifacts({ rootDir, plan: designed.plan, childId, homeworkId, plannerModel: process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5", architectModel: process.env.SUNNY_ARCHITECT_MODEL ?? "claude-fable-5", assignmentFingerprint: extraction.fileHash, candidateCards: mathPlannerCandidateCards(chart), existingArtworkUrls: build.artifacts.length ? build : undefined, nodeIds: [nodeId] });
      const merged = new Map(build.artifacts.map(candidate => [candidate.nodeId, candidate]));
      generated.artifacts.forEach(candidate => merged.set(candidate.nodeId, candidate));
      build = { ...generated, artifacts: [...merged.values()] };
      write(buildFile, build);
      artifact = merged.get(nodeId);
    }
    if (!artifact?.htmlHash) throw new Error(`targeted_artifact_missing:${nodeId}`);
    await verifyAndBind(artifact);
    return { artifactHash: artifact.htmlHash };
  }, onNodeReady: project });
  // A runtime/provider failure and a child-visible visual defect are different
  // failure classes. Generic build attempts must not consume the one bounded
  // visual repair available for a frozen artifact under this gate version.
  for (const currentArtifact of [...build.artifacts]) {
    const node = getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes.find(candidate => candidate.nodeId === currentArtifact.nodeId);
    const savedReport = reports[currentArtifact.nodeId];
    const foundAttempt = findVisualRepairAttempt(draft, currentArtifact.nodeId, currentArtifact.htmlHash ?? "");
    const savedAttempt = foundAttempt;
    const resumableAttempt = savedAttempt && ["started", "provider_completed"].includes(savedAttempt.value.status);
    const consumedAttempts = countVisualRepairAttempts(draft, currentArtifact.nodeId);
    if (!["failed_resumable", "needs_attention"].includes(node?.status ?? "")
      || !(resumableAttempt || (isCurrentGeneratedContentRejection(savedReport)
        && consumedAttempts < MAX_VISUAL_REPAIR_PASSES
        && mayRunVisualRepair(savedAttempt?.value, Boolean(options.retryUncertainProvider), currentArtifact.htmlHash)))) continue;
    const activity = designed.plan.activities.find(candidate => candidate.id === currentArtifact.nodeId);
    if (!activity) throw new Error(`targeted_activity_missing:${currentArtifact.nodeId}`);
    if (!currentArtifact.htmlHash) throw new Error(`targeted_artifact_hash_missing:${currentArtifact.nodeId}`);
    const attemptFile = savedAttempt?.file ?? visualRepairAttemptPath(draft, currentArtifact.nodeId, currentArtifact.htmlHash);
    const outputDir = path.dirname(attemptFile);
    const originalHtmlFile = path.join(outputDir, `${currentArtifact.nodeId}-visual-original.html`);
    const metadataFile = currentArtifact.htmlPath.replace(/\.html$/i, ".artifact.json");
    const originalMetadataFile = path.join(outputDir, `${currentArtifact.nodeId}-visual-original.artifact.json`);
    const originalReportFile = path.join(outputDir, `${currentArtifact.nodeId}-visual-original-report.json`);
    const reportBeforeRepair = fs.existsSync(originalReportFile)
      ? read<DirectPlaywrightReport & { htmlHash: string; verifierVersion: number }>(originalReportFile)
      : savedAttempt?.value.outputHtmlHash === savedReport.htmlHash
        ? { ...savedReport, passed: false, failures: savedAttempt.value.failures, htmlHash: savedAttempt.value.inputHtmlHash }
        : savedReport;
    if (!fs.existsSync(originalHtmlFile)) writeText(originalHtmlFile, fs.readFileSync(currentArtifact.htmlPath, "utf8"));
    if (fs.existsSync(metadataFile) && !fs.existsSync(originalMetadataFile)) writeText(originalMetadataFile, fs.readFileSync(metadataFile, "utf8"));
    if (!fs.existsSync(originalReportFile)) write(originalReportFile, reportBeforeRepair);
    const startedAt = savedAttempt?.value.startedAt ?? new Date().toISOString();
    const attemptBase: VisualRepairAttempt = {
      version: 1,
      patchParserVersion: VISUAL_REPAIR_PATCH_PARSER_VERSION,
      gateVersion: CHILD_FACING_VISUAL_GATE_VERSION,
      nodeId: currentArtifact.nodeId,
      inputHtmlHash: savedAttempt?.value.inputHtmlHash ?? currentArtifact.htmlHash,
      failures: savedAttempt?.value.failures ?? savedReport.failures,
      status: "started",
      startedAt,
    };
    write(attemptFile, attemptBase);
    console.log(` 🎮 [adaptive-math] [visual-repair] [${savedAttempt ? "resumed" : "scheduled"}] node=${currentArtifact.nodeId} gate=v${CHILD_FACING_VISUAL_GATE_VERSION}`);
    let repaired: DirectArtifact | undefined;
    const buildBeforeRepair = build;
    try {
      repaired = await repairDirectArtifact({
        rootDir,
        artifact: currentArtifact,
        activity,
        failures: attemptBase.failures,
        screenshotPaths: savedReport.screenshots,
        outputDir,
      });
      write(attemptFile, { ...attemptBase, outputHtmlHash: repaired.htmlHash, status: "provider_completed" });
      await verifyArtifact(repaired);
      const merged = new Map(build.artifacts.map(artifact => [artifact.nodeId, artifact]));
      merged.set(currentArtifact.nodeId, repaired);
      build = { ...build, artifacts: [...merged.values()] };
      write(buildFile, build);
      bindVerifiedArtifact(repaired);
      const repairVerification = reports[repaired.nodeId]?.verification;
      verifyEngineeringRepairEvidence(path.join(outputDir, `${currentArtifact.nodeId}.engineering-repair.json`), {
        artifactHash: repaired.htmlHash!,
        academicHash: repaired.academicContractHash!,
        designHash: repaired.designArtifactHash!,
        verifierVersion: MATH_BROWSER_VERIFIER_VERSION * 1000 + DISCOVERY_VERIFIER_VERSION,
        runtime: repairVerification?.runtime ?? false,
        scoring: repairVerification?.scoring ?? false,
        contracts: repairVerification?.contracts ?? false,
        viewports: DISCOVERY_RELEASE_VIEWPORTS.map(viewport => `${viewport.width}x${viewport.height}`),
      });
      updateMathGenerationNode({ rootDir, childId, homeworkId, nodeId: repaired.nodeId, status: "ready", artifactHash: repaired.htmlHash });
      write(attemptFile, {
        ...attemptBase,
        outputHtmlHash: repaired.htmlHash,
        status: "verified",
        finishedAt: new Date().toISOString(),
      });
      console.log(` 🎮 [adaptive-math] [visual-repair] [verified] node=${repaired.nodeId} gate=v${CHILD_FACING_VISUAL_GATE_VERSION}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const preserveUnpublishedCandidate = Boolean(repaired && message.includes(":child_visual_review:"));
      if (preserveUnpublishedCandidate && repaired) {
        const merged = new Map(build.artifacts.map(artifact => [artifact.nodeId, artifact]));
        merged.set(currentArtifact.nodeId, repaired);
        build = { ...build, artifacts: [...merged.values()] };
        write(buildFile, build);
        console.log(` 🎮 [adaptive-math] [visual-repair] [candidate-preserved] node=${repaired.nodeId} hash=${repaired.htmlHash}`);
      } else {
        writeText(currentArtifact.htmlPath, fs.readFileSync(originalHtmlFile, "utf8"));
        if (fs.existsSync(originalMetadataFile)) writeText(metadataFile, fs.readFileSync(originalMetadataFile, "utf8"));
        build = buildBeforeRepair;
        write(buildFile, build);
        reports[currentArtifact.nodeId] = reportBeforeRepair;
        write(reportsFile, reports);
      }
      markArtifactUnavailable(currentArtifact.nodeId, message);
      const uncertain = /child_visual_review_(?:in_flight|outcome_uncertain|received_raw)/.test(message);
      write(attemptFile, {
        ...attemptBase,
        ...(repaired?.htmlHash ? { outputHtmlHash: repaired.htmlHash } : {}),
        status: uncertain ? "verification_uncertain" : "failed",
        error: message,
        finishedAt: new Date().toISOString(),
      });
      console.log(` 🎮 [adaptive-math] [visual-repair] [failed] node=${currentArtifact.nodeId} reason=${message}`);
    }
  }
  project();
  if (getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase === "board_ready") {
    persistDirectExperience({ rootDir, childId, homeworkId, extraction, plannerPlan: designed.plan, activeSessionPlan: active(), artifacts: build.artifacts, report: report(), assumptions: program.assumptions });
    project();
    console.log(` 🎮 [adaptive-math] [targeted-board] [ready] child=${childId} homework=${homeworkId}`);
  }
  } catch (error) {
    setMathGenerationPhase({rootDir,childId,homeworkId,phase:"needs_attention",error:error instanceof Error ? error.message : String(error)});
    throw error;
  }
}

/** Native spelling instruments use the same job, publication, and per-node resume machinery. */
async function runSpellingTargetedGeneration(childId: string, homeworkId: string, rootDir: string): Promise<void> {
  const scope = { rootDir, childId, homeworkId };
  const cycle = getLearningCycle(childId, homeworkId, { rootDir })!;
  if (["evaluation_ready", "evaluation_active"].includes(cycle.lifecycle)) throw new Error("spelling_evidence_not_committed");
  const stoppedJob = getMathGenerationStatus(childId, homeworkId, { rootDir });
  if (stoppedJob?.phase === "needs_attention") {
    const publicationOnlyRetry = stoppedJob.nodes.length > 0 && stoppedJob.nodes.every((node) =>
      ["ready", "completed", "evidence_locked"].includes(node.status));
    if (!publicationOnlyRetry) return;
    console.log(` 🎮 [spelling] [targeted-generation] [resuming-publication] homework=${homeworkId}`);
  }
  queueTargetedMathGeneration(scope);
  const draft = resolveAdaptiveMathDraftDir(childId, homeworkId, { rootDir });
  try {
    const requestFile = path.join(draft, "spelling-targeted-request.json");
    const responseFile = path.join(draft, "spelling-targeted-response.json");
    const chart = getChildChart(childId, { rootDir });
    const packet = fs.existsSync(requestFile) ? read<AssignmentPlanningPacket>(requestFile)
      : attachSpellingDiscoveryEvidence(buildAssignmentPlanningPacket({ childId, childChart: chart, extraction: readAssignmentSourceExtraction(path.join(draft, "assignment-extraction.json")) }), chart);
    if (!fs.existsSync(requestFile)) write(requestFile, packet);
    const saved = fs.existsSync(responseFile) ? read<{ result: Awaited<ReturnType<typeof planAssignmentFromSourceWithTelemetry>>; requestHash: string; outputHash: string; createdAt: string }>(responseFile) : undefined;
    if (saved && (saved.requestHash !== hashDiscoveryContract(packet) || saved.outputHash !== hashDiscoveryContract(saved.result))) throw new Error("spelling_targeted_checkpoint_hash_mismatch");
    const result = saved?.result ?? await planAssignmentFromSourceWithTelemetry(packet, { providerReceipt: { draftDir: draft, stage: "spelling-targeted-planner" } });
    const createdAt = saved?.createdAt ?? result.receivedAt ?? new Date().toISOString();
    const normalizedNodePlan = result.output.activeSessionPlan.nodePlan.map((node) => ({
      ...node,
      thumbnailUrl: !node.thumbnailUrl || node.thumbnailUrl.startsWith("/thumbnails/activities/")
        ? thumbnailUrlForActivity(node.activityId ?? node.type)
        : node.thumbnailUrl,
    }));
    const activeBase = {
      ...result.output.activeSessionPlan,
      childId,
      domain: "spelling",
      activeHomeworkId: homeworkId,
      nodePlan: normalizedNodePlan,
      plannedMeasurements: result.output.plannedMeasurements,
      planTheory: result.output.planTheory,
    };
    const authoredBoard = result.output.activeSessionPlan.adventureBoard;
    const active = {
      ...activeBase,
      adventureBoard: authoredBoard
        ? buildAdventureBoardFromActiveSessionPlan({
            plan: activeBase as never,
            boardId: authoredBoard.boardId,
            title: authoredBoard.title,
            theme: authoredBoard.theme,
            layout: authoredBoard.layout,
            plannerRationale: authoredBoard.plannerRationale,
            companion: authoredBoard.companion,
          })
        : undefined,
    };
    const historicalEvidence = Object.entries(packet.discoveryEvidence?.history.constructs ?? {}).flatMap(([construct, entry]) => [...entry.observations.map(row => row.observationId), ...entry.evaluations.map(row => row.evaluationId)].map(id => ({ id, domain: construct.split(".")[0] })));
    const contract = buildSpellingTargetedCycleInput({ cycle, plan: active, now: createdAt, historicalEvidence });
    if (!saved) write(responseFile, { result, requestHash: hashDiscoveryContract(packet), outputHash: hashDiscoveryContract(result), createdAt });
    console.log(` 🎮 [spelling] [targeted-planner] [${saved ? "reused" : "saved"}] homework=${homeworkId}`);
    const programHash = hashDiscoveryContract(result.output), designHash = hashDiscoveryContract(active.adventureBoard);
    let presentation = (await generateBoardNodeImages({ ...scope, plan: active, generateMissing: false })).plan ?? active;
    if (!cycle.adaptiveGeneration?.designHash) revealTargetedBoard({ ...scope, programHash, designHash, nodes: [], nodeContracts: contract.nodes, academicTheory: contract.academicTheory, academicPredictions: contract.academicPredictions });
    if (!getMathGenerationStatus(childId, homeworkId, { rootDir })?.programHash) writeMathGenerationJob({ ...scope, programHash, designHash, nodeIds: active.nodePlan.map(node => node.id) });
    for (const node of contract.nodes.filter(node => node.role === "quest" || node.role === "boss")) {
      if (getMathGenerationStatus(childId, homeworkId, { rootDir })!.nodes.find(row => row.nodeId === node.nodeId)?.status === "preparing") updateMathGenerationNode({ ...scope, nodeId: node.nodeId, status: "evidence_locked" });
    }
    const project = (): void => {
      const currentChart = getChildChart(childId, { rootDir });
      const currentCycle = getLearningCycle(childId, homeworkId, { rootDir })!;
      const existing = new Set(currentChart.contentCatalog.items.map(item => item.contentId));
      const items = currentCycle.nodes.filter(node => node.role !== "evaluation" && node.artifactBinding && !existing.has(node.artifactBinding.contentId)).map(node => ({
        contentId: node.artifactBinding!.contentId, childId, homeworkId, domain: "spelling", type: "game" as const,
        source: node.implementationType === "generated-baseline" ? "generated" as const : "baseline" as const,
        theoryDecisionId: node.theoryId, title: node.title, activityId: node.mechanic, gameHtmlPath: node.artifactBinding!.localArtifactPath,
        algorithmTargets: ["retrieval-practice" as const], targetSkills: [node.academicTarget.skill], targetConcepts: [], targetWords: node.academicTarget.targets, engagementHooks: [],
        inputEvidence: { contentFingerprint: currentCycle.assignment.contentFingerprint, activityEvidenceIds: [...new Set(Object.values(node.evidenceContract.spellingItems ?? {}).flatMap(item => item.lineage.sourceEvidenceIds))] },
        reuseStatus: "candidate" as const, reuseReason: "Planner-selected instrument; subsequent outcomes are needed before reuse decisions.",
      }));
      if (items.length) writeWaterfallContentCatalog(childId, upsertProfileContentCatalog(currentChart.learningProfile, items), { rootDir });
      publishTargetedBoardProjection({ rootDir, childId, activeSessionPlan: presentation, nodeStatuses: Object.fromEntries(getMathGenerationStatus(childId, homeworkId, { rootDir })!.nodes.map(node => [node.nodeId, node.status])) });
    };
    const buildNode = async (nodeId: string) => {
      const node = active.nodePlan.find(node => node.id === nodeId)!;
      const canonical = contract.nodes.find(node => node.nodeId === nodeId)!;
      if (node.type === "generated-baseline") {
        const generated = await generateCanonicalProgressionArtifact({ childId, homeworkId, nodeId }, { rootDir });
        const artifact = generated.nodes.find(row => row.nodeId === nodeId)?.artifactBinding;
        if (!artifact || artifact.validationStatus !== "passed") throw new Error(`spelling_generated_instrument_requires_verified_artifact:${nodeId}`);
        return { artifactHash: artifact.contractFingerprint };
      }
      const configFile = path.join(draft, "native-instruments", `${nodeId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
      const configuration = nativeSpellingInstrumentContract(node, canonical.evidenceContract);
      const hash = hashDiscoveryContract(configuration);
      if (fs.existsSync(configFile) && hashDiscoveryContract(read(configFile)) !== hash) {
        const existing = read<{ node?: ActiveSessionPlan["nodePlan"][number]; evidenceContract?: unknown }>(configFile);
        const migrated = existing.node
          ? nativeSpellingInstrumentContract(existing.node, existing.evidenceContract)
          : existing;
        if (hashDiscoveryContract(migrated) !== hash) throw new Error(`spelling_native_contract_changed:${nodeId}`);
        write(configFile, configuration);
        console.log(` 🎮 [spelling] [native-contract] [presentation-metadata-migrated] node=${nodeId}`);
      }
      if (!fs.existsSync(configFile)) write(configFile, configuration);
      const localPath = `/${path.relative(resolveChildContextDir(childId, { rootDir }), configFile).split(path.sep).join("/")}`;
      let activityConfigPath: string | undefined;
      if (canonical.evidenceContract.nativeConfig) {
        const filename = `${nodeId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${hashDiscoveryContract(nodeId).slice(0, 8)}.json`;
        const file = path.join(resolveChildContextDir(childId, { rootDir }), "homework/games", homeworkId, filename);
        if (fs.existsSync(file) && hashDiscoveryContract(read(file)) !== hashDiscoveryContract(canonical.evidenceContract.nativeConfig)) throw new Error(`spelling_native_payload_changed:${nodeId}`);
        if (!fs.existsSync(file)) write(file, canonical.evidenceContract.nativeConfig);
        activityConfigPath = `/api/activity-config/${childId}/${homeworkId}/${filename}`;
      }
      const current = getLearningCycle(childId, homeworkId, { rootDir })!;
      const bound = current.nodes.find(row => row.nodeId === nodeId)?.artifactBinding;
      if (bound && bound.contractFingerprint !== hash) throw new Error(`spelling_native_binding_changed:${nodeId}`);
      if (!bound) transitionLearningCycle(childId, homeworkId, current.revision, { type: "artifact_bound", nodeId, artifact: { contentId: `${homeworkId}:${nodeId}`, artifactId: `${homeworkId}:${nodeId}:native`, localArtifactPath: localPath, localArtworkPath: node.thumbnailUrl ?? thumbnailUrlForActivity(node.activityId ?? node.type), ...(activityConfigPath ? { activityConfigPath } : {}), contractFingerprint: hash, validationStatus: "passed" } }, { rootDir });
      return { artifactHash: hash };
    };
    // Reconstitute missing native payload files from the frozen contract before
    // projecting Ready. Existing mismatched bytes fail; no provider is involved.
    for (const ready of getMathGenerationStatus(childId, homeworkId, { rootDir })!.nodes) {
      if (["ready", "completed"].includes(ready.status) && active.nodePlan.find(node => node.id === ready.nodeId)?.type !== "generated-baseline") await buildNode(ready.nodeId);
    }
    project();
    await buildTargetedNodesResumably({ ...scope, firstNodeId: active.nodePlan[0]?.id ?? "", concurrency: 2, buildNode, onNodeReady: project });
    project();
    // Reconnect the existing best-effort illustration stage after playable
    // content is published. Keep artwork outside frozen academic/provider data.
    process.env.SUNNY_IMAGE_GENERATION_MAX_PER_RUN ||= "8";
    await generateBoardNodeImages({ ...scope, plan: presentation, onPlanUpdated: plan => { presentation = plan; project(); } });
  } catch (error) {
    setMathGenerationPhase({ ...scope, phase: "needs_attention", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

if (require.main === module) {
  const childId = arg("child");
  const homeworkId = arg("homework");
  const lease = acquireMathGenerationLease({ childId, homeworkId });
  if (!lease.acquired || !lease.token) {
    console.log(` 🎮 [adaptive-math] [worker] [duplicate-skipped] child=${childId} homework=${homeworkId}`);
  } else {
    const retryUncertainProvider = process.argv.slice(2).includes("--retry-uncertain-provider");
    const authorizeTruncatedRepairReplacementNodeId = process.argv.slice(2)
      .find(value => value.startsWith("--authorize-truncated-repair-replacement="))
      ?.slice("--authorize-truncated-repair-replacement=".length);
    void runAdaptiveMathGeneration(childId, homeworkId, process.cwd(), { retryUncertainProvider, authorizeTruncatedRepairReplacementNodeId })
      .catch((error) => {
        console.error(` 🎮 [adaptive-math] [worker] [paused] ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      })
      .finally(() => releaseMathGenerationLease({ childId, homeworkId, token: lease.token! }));
  }
}
