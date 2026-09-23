import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import {
  readAssignmentSourceExtraction,
  writeAssignmentSourceExtraction,
  type AssignmentSourceExtraction,
} from "../engine/assignmentSourceExtraction";
import {
  acquireMathGenerationLease,
  buildDiscoveryActiveSessionPlan,
  buildDiscoveryEvaluationNode,
  ensureDiscoveryArtifactsAreServed,
  hashDiscoveryContract,
  publishDiscoveryExperience,
  releaseMathGenerationLease,
  type MathDiscoveryEvaluationContract,
} from "../engine/adaptiveMathDiscovery";
import {
  CHILD_FACING_VISUAL_GATE_VERSION,
  childFacingVisualRequestHash,
  selectChildFacingJourneyScreens,
} from "../engine/childFacingVisualGate";
import { DISCOVERY_RELEASE_VIEWPORTS, DISCOVERY_VERIFIER_VERSION } from "../engine/discoveryVisualReview";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { getChildChart } from "../profiles/childChart";
import {
  assertSourceSnapshotUnchanged,
  findCertificationRun,
  validateCertificationWorkspace,
  type CertificationRunManifest,
} from "./sunnyCertification";

type PromotionResult = {
  childId: string;
  homeworkId: string;
  artifactHash: string;
  reused: boolean;
};

type PromotionDependencies = {
  ensureArtifactsAreServed: typeof ensureDiscoveryArtifactsAreServed;
  buildActiveSessionPlan: (input: {
    rootDir: string;
    childId: string;
    homeworkId: string;
    evaluation: MathDiscoveryEvaluationContract;
  }) => ActiveSessionPlan;
  now: () => string;
};

type PromotionProof = {
  version: 1;
  certificationRunId: string;
  childId: string;
  homeworkId: string;
  assignmentFingerprint: string;
  sourceImplementationHash: string;
  verifierVersion: number;
  academicHash: string;
  designHash: string;
  artifactHash: string;
  runtimeAcceptanceHash: string;
  visualAuditHash: string;
  blindVisualVerdictHash: string;
  approvedBy: string;
  approvedAt: string;
  copiedSimulationEvidence: false;
  copiedTargetedBoard: false;
};

type PromotionJournal = PromotionProof & {
  status: "validated" | "promoted";
  sourceAuthorityHash: string;
};

type RuntimeAcceptance = {
  passed?: unknown;
  verifierVersion?: unknown;
  htmlHash?: unknown;
  academicHash?: unknown;
  viewports?: Array<{ width?: unknown; height?: unknown }>;
  completedItemIds?: unknown;
};

type VisualAudit = {
  status?: unknown;
  controllingGate?: unknown;
  iterations?: Array<{ htmlHash?: unknown; issues?: unknown; screenshotPaths?: unknown }>;
};

type BlindVerdict = {
  version?: unknown;
  status?: unknown;
  requestHash?: unknown;
  promptHash?: unknown;
  model?: unknown;
  decision?: unknown;
  observations?: unknown;
  screenshotHashes?: unknown;
};

type GenerationJob = {
  phase?: unknown;
  nodes?: Array<{ status?: unknown }>;
};

const defaultDependencies: PromotionDependencies = {
  ensureArtifactsAreServed: ensureDiscoveryArtifactsAreServed,
  buildActiveSessionPlan: ({ rootDir, childId, homeworkId, evaluation }) => {
    const chart = getChildChart(childId, { rootDir });
    return buildDiscoveryActiveSessionPlan({
      childId,
      homeworkId,
      evaluation,
      companion: { id: chart.companion.presetId, name: chart.companion.displayName },
    });
  },
  now: () => new Date().toISOString(),
};

function readJson<T>(file: string): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    throw new Error(`certification_promotion_file_invalid:${file}`);
  }
}

function atomicJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function sha256File(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, stableJson(child)]));
}

function projectionIndependentValue(relative: string, bytes: Buffer): Buffer {
  if (!["learning_profile.json", "homework/current.json", "plans/active_session_plan.json"].includes(relative)) {
    return bytes;
  }
  const value = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
  if (relative === "learning_profile.json") {
    delete value.pendingHomework;
    delete value.activeSessionPlan;
    for (const key of ["activeHomeworkByDomain", "activeSessionPlanByDomain"]) {
      if (value[key] && typeof value[key] === "object" && !Array.isArray(value[key])) {
        const domains = { ...(value[key] as Record<string, unknown>) };
        delete domains.math;
        if (Object.keys(domains).length === 0) delete value[key];
        else value[key] = domains;
      }
    }
  } else {
    delete value.version;
    delete value.childId;
    delete value.selectedDomain;
    delete value.current;
    delete value.updatedAt;
    if (value.activeByDomain && typeof value.activeByDomain === "object" && !Array.isArray(value.activeByDomain)) {
      const domains = { ...(value.activeByDomain as Record<string, unknown>) };
      delete domains.math;
      if (Object.keys(domains).length === 0) delete value.activeByDomain;
      else value.activeByDomain = domains;
    }
  }
  return Buffer.from(JSON.stringify(stableJson(value)));
}

function hashPromotionAuthoritySnapshot(manifest: CertificationRunManifest): string {
  const root = realChildDir(manifest);
  const homeworkId = manifest.homeworkId!;
  const excludedPrefixes = [
    `homework/direct-drafts/${homeworkId}`,
    `homework/games/${homeworkId}`,
    `homework/sources/${homeworkId}`,
  ];
  const excludedFiles = new Set([
    `homework/cycles/${homeworkId}.json`,
    "homework/discovery-publication.json",
    "homework/direct-drafts/discovery-intake/adaptive-generation-job.json.worker-lock",
  ]);
  const files: string[] = [];
  const visit = (directory: string): void => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, entry);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (excludedFiles.has(relative) || excludedPrefixes.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`))) continue;
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory()) visit(absolute);
      else if (stat.isFile()) files.push(absolute);
      else throw new Error(`certification_promotion_source_type_unsupported:${relative}`);
    }
  };
  visit(root);
  const hash = crypto.createHash("sha256");
  for (const file of files.sort()) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    hash.update(relative);
    hash.update("\0");
    hash.update(projectionIndependentValue(relative, fs.readFileSync(file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function copyExact(source: string, destination: string): void {
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`certification_promotion_source_missing:${source}`);
  }
  const bytes = fs.readFileSync(source);
  if (fs.existsSync(destination)) {
    if (!fs.statSync(destination).isFile() || !fs.readFileSync(destination).equals(bytes)) {
      throw new Error(`certification_promotion_destination_conflict:${destination}`);
    }
    return;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, bytes);
    fs.linkSync(temporary, destination);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function realChildDir(manifest: CertificationRunManifest): string {
  return path.join(manifest.sourceRoot, "src", "context", manifest.sourceChildId);
}

function certificationDraftDir(manifest: CertificationRunManifest): string {
  return path.join(
    manifest.workspaceDir,
    "src",
    "context",
    manifest.sourceChildId,
    "homework",
    "direct-drafts",
    manifest.homeworkId!,
  );
}

function promotedEvaluationBinding(rootDir: string, childId: string, homeworkId: string): {
  cycle: NonNullable<ReturnType<typeof getLearningCycle>>;
  artifactHash?: string;
} {
  const cycle = getLearningCycle(childId, homeworkId, { rootDir });
  if (!cycle) throw new Error("certification_promotion_real_cycle_missing");
  const binding = cycle.nodes.find((node) => node.role === "evaluation")?.artifactBinding;
  return { cycle, artifactHash: binding?.creativeProvenance?.generatedHtmlHash };
}

function assertPromotedCycleMatches(
  rootDir: string,
  childId: string,
  homeworkId: string,
  assignmentFingerprint: string,
  artifactHash: string,
): void {
  const binding = promotedEvaluationBinding(rootDir, childId, homeworkId);
  if (binding.cycle.childId !== childId
    || binding.cycle.homeworkId !== homeworkId
    || binding.cycle.domain !== "math"
    || binding.cycle.assignment.contentFingerprint !== assignmentFingerprint
    || binding.artifactHash !== artifactHash) {
    throw new Error("certification_promotion_real_cycle_mismatch");
  }
}

function assertPristineCycle(
  rootDir: string,
  childId: string,
  homeworkId: string,
  assignmentFingerprint: string,
  contract: MathDiscoveryEvaluationContract,
): void {
  const { cycle, artifactHash: boundArtifactHash } = promotedEvaluationBinding(rootDir, childId, homeworkId);
  const node = cycle.nodes[0];
  const expectedTargets = contract.constructs.map((construct) => construct.constructId);
  const expectedNode = buildDiscoveryEvaluationNode(
    contract,
    typeof node?.prediction?.createdAt === "string" ? node.prediction.createdAt : "",
  );
  const contaminated = cycle.lifecycle !== "evaluation_ready"
    || cycle.childId !== childId
    || cycle.homeworkId !== homeworkId
    || cycle.domain !== "math"
    || cycle.assignment.contentFingerprint !== assignmentFingerprint
    || cycle.nodes.length !== 1
    || node?.role !== "evaluation"
    || JSON.stringify(stableJson(node)) !== JSON.stringify(stableJson(expectedNode))
    || node.nodeId !== contract.evaluationId
    || node.title !== contract.title
    || node.state !== "ready"
    || node.evidenceIds.length !== 0
    || node.artifactBinding?.artifactId !== contract.artifact.artifactId
    || node.artifactBinding?.contractFingerprint !== contract.artifact.contractHash
    || node.artifactBinding?.localArtifactPath !== contract.artifact.htmlPath
    || node.artifactBinding?.localArtworkPath !== contract.artifact.artworkPath
    || node.artifactBinding?.validationStatus !== "passed"
    || node.evidenceContract.academic !== true
    || node.evidenceContract.engagement !== true
    || node.evidenceContract.companionObservations !== true
    || JSON.stringify(node.academicTarget.targets) !== JSON.stringify(expectedTargets)
    || cycle.observations.length !== 0
    || cycle.predictionEvaluations.length !== 0
    || cycle.decisionHistory.length !== 0
    || cycle.academicPredictions.length !== 0
    || cycle.assumptions.length !== 0
    || cycle.evidenceSources.length !== 0
    || cycle.evidence.academic.length !== 0
    || cycle.evidence.engagement.length !== 0
    || cycle.evidence.companionObservations.length !== 0
    || (cycle.calibrations?.length ?? 0) !== 0
    || cycle.engagementTheory !== null
    || cycle.agencyExperiment != null
    || cycle.routeSelection != null
    || cycle.adaptiveGeneration?.evaluationCompletedAt
    || cycle.adaptiveGeneration?.programHash
    || cycle.adaptiveGeneration?.designHash
    || boundArtifactHash !== contract.artifact.artifactHash;
  if (contaminated) {
    throw new Error("certification_promotion_real_cycle_not_pristine");
  }
}

function domainProjection(file: string, container: string, domain: string): Record<string, unknown> | undefined {
  const value = readJson<Record<string, unknown>>(file);
  const domains = value[container];
  if (!domains || typeof domains !== "object" || Array.isArray(domains)) return undefined;
  const projected = (domains as Record<string, unknown>)[domain];
  return projected && typeof projected === "object" && !Array.isArray(projected)
    ? projected as Record<string, unknown>
    : undefined;
}

function assertCompletedPublication(input: {
  manifest: CertificationRunManifest;
  proof: PromotionProof;
  contract: MathDiscoveryEvaluationContract;
  expectedPlan: ActiveSessionPlan;
}): void {
  const { manifest, proof, contract } = input;
  const childDir = realChildDir(manifest);
  const targetDraft = path.join(childDir, "homework", "direct-drafts", manifest.homeworkId!);
  const targetGame = path.join(childDir, "homework", "games", manifest.homeworkId!);
  const copiedContract = readJson<MathDiscoveryEvaluationContract>(path.join(targetDraft, "discovery-contract.json"));
  const copiedAcademic = readJson<Record<string, unknown>>(path.join(targetDraft, "discovery-academic.json"));
  const copiedDesign = readJson<Record<string, unknown>>(path.join(targetDraft, "discovery-design.json"));
  const extraction = readAssignmentSourceExtraction(path.join(targetDraft, "assignment-extraction.json"));
  const artwork = fs.readFileSync(path.join(targetGame, "discovery-background.svg"), "utf8");
  const { artifact: _copiedArtifact, ...copiedContractAcademic } = copiedContract;
  if (JSON.stringify(stableJson(copiedContract)) !== JSON.stringify(stableJson(contract))
    || hashDiscoveryContract(copiedContractAcademic) !== proof.academicHash
    || hashDiscoveryContract(copiedAcademic) !== proof.academicHash
    || copiedContract.artifact.artifactHash !== proof.artifactHash
    || copiedContract.artifact.contractHash !== proof.academicHash
    || hashDiscoveryContract(copiedDesign) !== proof.designHash
    || copiedDesign.contractHash !== proof.academicHash
    || artwork !== String(copiedDesign.backgroundSvg)
    || sha256File(path.join(targetDraft, "runtime-verification", "acceptance.json")) !== proof.runtimeAcceptanceHash
    || hashDiscoveryContract(fs.readFileSync(path.join(targetGame, "discovery.html"), "utf8")) !== proof.artifactHash
    || extraction.fileHash !== proof.assignmentFingerprint
    || !fs.existsSync(extraction.sourcePath)
    || sha256File(extraction.sourcePath) !== proof.assignmentFingerprint) {
    throw new Error("certification_promotion_publication_incomplete");
  }
  const homework = domainProjection(path.join(childDir, "homework", "current.json"), "activeByDomain", "math");
  const plan = domainProjection(path.join(childDir, "plans", "active_session_plan.json"), "activeByDomain", "math");
  const profileHomework = domainProjection(path.join(childDir, "learning_profile.json"), "activeHomeworkByDomain", "math");
  const profilePlan = domainProjection(path.join(childDir, "learning_profile.json"), "activeSessionPlanByDomain", "math");
  const expectedPlan = {
    ...input.expectedPlan,
    createdAt: typeof plan?.createdAt === "string" ? plan.createdAt : "",
  };
  if (homework?.homeworkId !== manifest.homeworkId
    || plan?.activeHomeworkId !== manifest.homeworkId
    || profileHomework?.homeworkId !== manifest.homeworkId
    || profilePlan?.activeHomeworkId !== manifest.homeworkId
    || JSON.stringify(stableJson(plan)) !== JSON.stringify(stableJson(expectedPlan))
    || JSON.stringify(stableJson(profilePlan)) !== JSON.stringify(stableJson(expectedPlan))
    || JSON.stringify(stableJson(homework?.nodes)) !== JSON.stringify(stableJson(expectedPlan.nodePlan))
    || JSON.stringify(stableJson(profileHomework?.nodes)) !== JSON.stringify(stableJson(expectedPlan.nodePlan))) {
    throw new Error("certification_promotion_publication_incomplete");
  }
}

function assertCertificationProof(input: {
  manifest: CertificationRunManifest;
  contract: MathDiscoveryEvaluationContract;
  html: string;
  academicHash: string;
  designHash: string;
}): void {
  const { manifest, contract, html, academicHash, designHash } = input;
  if (manifest.homeworkDomain !== "math") throw new Error("certification_promotion_math_only");
  if (manifest.state !== "session_closed" || !manifest.homeworkId) {
    throw new Error("certification_promotion_journey_incomplete");
  }
  const expectedHomeworkId = `hw-math-${manifest.assignmentFingerprint.slice(0, 8)}`;
  if (manifest.homeworkId !== expectedHomeworkId || sha256File(manifest.assignmentPath) !== manifest.assignmentFingerprint) {
    throw new Error("certification_promotion_assignment_mismatch");
  }
  const draftDir = certificationDraftDir(manifest);
  const source = readJson<{ fileHash?: unknown }>(path.join(draftDir, "assignment-source.json"));
  const extraction = readAssignmentSourceExtraction(path.join(draftDir, "assignment-extraction.json"));
  if (source.fileHash !== manifest.assignmentFingerprint || extraction.fileHash !== manifest.assignmentFingerprint) {
    throw new Error("certification_promotion_assignment_mismatch");
  }
  const artifactHash = hashDiscoveryContract(html);
  if (contract.artifact.artifactHash !== artifactHash || contract.artifact.contractHash !== academicHash) {
    throw new Error("certification_promotion_contract_mismatch");
  }
  const design = readJson<{ contractHash?: unknown }>(path.join(draftDir, "discovery-design.json"));
  const builder = readJson<{ contractHash?: unknown; designHash?: unknown; html?: unknown }>(path.join(draftDir, "discovery-builder.json"));
  if (design.contractHash !== academicHash
    || !/^[a-f0-9]{64}$/.test(designHash)
    || builder.contractHash !== academicHash
    || builder.designHash !== designHash
    || typeof builder.html !== "string") {
    throw new Error("certification_promotion_design_mismatch");
  }
  const acceptance = readJson<RuntimeAcceptance>(path.join(draftDir, "runtime-verification", "acceptance.json"));
  const viewportKeys = new Set((acceptance.viewports ?? []).map((value) => `${value.width}x${value.height}`));
  if (acceptance.passed !== true
    || acceptance.verifierVersion !== DISCOVERY_VERIFIER_VERSION
    || acceptance.htmlHash !== artifactHash
    || acceptance.academicHash !== hashDiscoveryContract(contract.items)
    || !Array.isArray(acceptance.completedItemIds)
    || JSON.stringify(acceptance.completedItemIds) !== JSON.stringify(contract.items.map((item) => item.itemId))
    || !DISCOVERY_RELEASE_VIEWPORTS.every((viewport) => viewportKeys.has(`${viewport.width}x${viewport.height}`))) {
    throw new Error("certification_promotion_runtime_approval_missing");
  }
  const visual = readJson<VisualAudit>(path.join(draftDir, "visual-review", "visual-review.json"));
  const finalIteration = visual.iterations?.at(-1);
  const blind = readJson<BlindVerdict>(path.join(draftDir, "visual-review", "blind-visual-verdict.json"));
  const screenshotPaths = Array.isArray(finalIteration?.screenshotPaths)
    ? finalIteration.screenshotPaths.filter((value): value is string => typeof value === "string")
    : [];
  const draftRoot = `${path.resolve(draftDir)}${path.sep}`;
  for (const screenshot of screenshotPaths) {
    const resolved = path.resolve(screenshot);
    if (!resolved.startsWith(draftRoot) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error("certification_promotion_visual_approval_missing");
    }
  }
  const reviewedScreenshotPaths = selectChildFacingJourneyScreens(screenshotPaths);
  const actualScreenshotHashes = reviewedScreenshotPaths.map((screenshot) => sha256File(path.resolve(screenshot)));
  const blindHashes = Array.isArray(blind.screenshotHashes)
    ? blind.screenshotHashes.filter((value): value is string => typeof value === "string")
    : [];
  const expectedRequestHash = typeof blind.model === "string" && typeof blind.promptHash === "string"
    ? childFacingVisualRequestHash({
        version: CHILD_FACING_VISUAL_GATE_VERSION,
        model: blind.model,
        promptHash: blind.promptHash,
        screenshotLabels: reviewedScreenshotPaths.map((screenshot) => path.basename(screenshot)),
        screenshotHashes: actualScreenshotHashes,
      })
    : "";
  if (visual.status !== "approved"
    || visual.controllingGate !== "browser_and_blind_vision"
    || finalIteration?.htmlHash !== artifactHash
    || !Array.isArray(finalIteration.issues)
    || finalIteration.issues.length !== 0
    || screenshotPaths.length === 0
    || blind.version !== CHILD_FACING_VISUAL_GATE_VERSION
    || blind.status !== "received"
    || typeof blind.requestHash !== "string"
    || !/^[a-f0-9]{64}$/.test(blind.requestHash)
    || typeof blind.promptHash !== "string"
    || !/^[a-f0-9]{64}$/.test(blind.promptHash)
    || blind.requestHash !== expectedRequestHash
    || typeof blind.model !== "string"
    || !blind.model.trim()
    || blind.decision !== "approve"
    || !Array.isArray(blind.observations)
    || JSON.stringify(blindHashes) !== JSON.stringify(actualScreenshotHashes)) {
    throw new Error("certification_promotion_visual_approval_missing");
  }
  const simulationCycle = getLearningCycle(manifest.sourceChildId, manifest.homeworkId, { rootDir: manifest.workspaceDir });
  if (!simulationCycle?.adaptiveGeneration?.evaluationCompletedAt || simulationCycle.observations.length === 0) {
    throw new Error("certification_promotion_evaluation_not_exercised");
  }
  const job = readJson<GenerationJob>(path.join(draftDir, "adaptive-generation-job.json"));
  const allowedStatuses = new Set(["ready", "completed", "evidence_locked"]);
  if (job.phase !== "board_ready" || !Array.isArray(job.nodes) || job.nodes.length === 0
    || job.nodes.some((node) => !allowedStatuses.has(String(node.status)))) {
    throw new Error("certification_promotion_board_not_ready");
  }
}

export async function promoteCertifiedMathDiscovery(
  input: { manifest: CertificationRunManifest; approvedBy: string },
  dependencies: PromotionDependencies = defaultDependencies,
): Promise<PromotionResult> {
  const approvedBy = input.approvedBy.trim();
  if (!approvedBy) throw new Error("certification_promotion_human_approval_required");
  const manifest = input.manifest;
  if (!manifest.homeworkId) throw new Error("certification_promotion_journey_incomplete");
  const targetDraft = path.join(realChildDir(manifest), "homework", "direct-drafts", manifest.homeworkId);
  const targetGame = path.join(realChildDir(manifest), "homework", "games", manifest.homeworkId);
  const finalProofFile = path.join(targetDraft, "certified-discovery-promotion.json");
  if (fs.existsSync(finalProofFile)) {
    const proof = readJson<PromotionProof>(finalProofFile);
    if (proof.version !== 1
      || proof.certificationRunId !== manifest.certificationRunId
      || proof.assignmentFingerprint !== manifest.assignmentFingerprint
      || proof.childId !== manifest.sourceChildId
      || proof.homeworkId !== manifest.homeworkId) {
      throw new Error("certification_promotion_existing_proof_conflict");
    }
    assertPromotedCycleMatches(
      manifest.sourceRoot,
      manifest.sourceChildId,
      manifest.homeworkId,
      manifest.assignmentFingerprint,
      proof.artifactHash,
    );
    return { childId: manifest.sourceChildId, homeworkId: manifest.homeworkId, artifactHash: proof.artifactHash, reused: true };
  }

  validateCertificationWorkspace(manifest);
  const journalFile = path.join(manifest.runDir, "discovery-promotion.json");
  const priorJournal = fs.existsSync(journalFile) ? readJson<PromotionJournal>(journalFile) : undefined;
  if (!priorJournal) assertSourceSnapshotUnchanged(manifest);
  const sourceAuthorityHash = hashPromotionAuthoritySnapshot(manifest);
  if (priorJournal && priorJournal.sourceAuthorityHash !== sourceAuthorityHash) {
    throw new Error("certification_source_child_changed");
  }
  const lease = acquireMathGenerationLease({
    rootDir: manifest.sourceRoot,
    childId: manifest.sourceChildId,
    homeworkId: "discovery-intake",
  });
  if (!lease.acquired || !lease.token) throw new Error("certification_promotion_already_running");

  try {
  if (hashPromotionAuthoritySnapshot(manifest) !== sourceAuthorityHash) {
    throw new Error("certification_source_child_changed");
  }

  const certDraft = certificationDraftDir(manifest);
  const certGame = path.join(
    manifest.workspaceDir,
    "src",
    "context",
    manifest.sourceChildId,
    "homework",
    "games",
    manifest.homeworkId,
  );
  const contract = readJson<MathDiscoveryEvaluationContract>(path.join(certDraft, "discovery-contract.json"));
  const { artifact: _artifact, ...academic } = contract;
  const academicHash = hashDiscoveryContract(academic);
  const design = readJson<Record<string, unknown>>(path.join(certDraft, "discovery-design.json"));
  const designHash = hashDiscoveryContract(design);
  const html = fs.readFileSync(path.join(certGame, "discovery.html"), "utf8");
  assertCertificationProof({ manifest, contract, html, academicHash, designHash });
  const runtimeAcceptanceHash = sha256File(path.join(certDraft, "runtime-verification", "acceptance.json"));
  const visualAuditHash = sha256File(path.join(certDraft, "visual-review", "visual-review.json"));
  const blindVisualVerdictHash = sha256File(path.join(certDraft, "visual-review", "blind-visual-verdict.json"));

  const proof: PromotionProof = priorJournal ? (() => {
    const { status: _status, sourceAuthorityHash: _sourceAuthorityHash, ...savedProof } = priorJournal;
    return savedProof;
  })() : {
    version: 1,
    certificationRunId: manifest.certificationRunId,
    childId: manifest.sourceChildId,
    homeworkId: manifest.homeworkId,
    assignmentFingerprint: manifest.assignmentFingerprint,
    sourceImplementationHash: manifest.sourceImplementationHash,
    verifierVersion: DISCOVERY_VERIFIER_VERSION,
    academicHash,
    designHash,
    artifactHash: contract.artifact.artifactHash,
    runtimeAcceptanceHash,
    visualAuditHash,
    blindVisualVerdictHash,
    approvedBy,
    approvedAt: dependencies.now(),
    copiedSimulationEvidence: false,
    copiedTargetedBoard: false,
  };
  if (priorJournal && (priorJournal.certificationRunId !== manifest.certificationRunId
    || priorJournal.artifactHash !== contract.artifact.artifactHash
    || priorJournal.assignmentFingerprint !== manifest.assignmentFingerprint
    || priorJournal.verifierVersion !== DISCOVERY_VERIFIER_VERSION
    || priorJournal.runtimeAcceptanceHash !== runtimeAcceptanceHash
    || priorJournal.visualAuditHash !== visualAuditHash
    || priorJournal.blindVisualVerdictHash !== blindVisualVerdictHash)) {
    throw new Error("certification_promotion_journal_conflict");
  }
  atomicJson(journalFile, { ...proof, sourceAuthorityHash, status: "validated" } satisfies PromotionJournal);

  const existingCycle = getLearningCycle(manifest.sourceChildId, manifest.homeworkId, { rootDir: manifest.sourceRoot });
  if (existingCycle) {
    try {
      assertPristineCycle(
        manifest.sourceRoot,
        manifest.sourceChildId,
        manifest.homeworkId,
        manifest.assignmentFingerprint,
        contract,
      );
    } catch {
      if (priorJournal?.status === "validated") {
        assertPromotedCycleMatches(
          manifest.sourceRoot,
          manifest.sourceChildId,
          manifest.homeworkId,
          manifest.assignmentFingerprint,
          proof.artifactHash,
        );
        const recoveredPlan = dependencies.buildActiveSessionPlan({
          rootDir: manifest.sourceRoot,
          childId: manifest.sourceChildId,
          homeworkId: manifest.homeworkId,
          evaluation: contract,
        });
        assertCompletedPublication({ manifest, proof, contract, expectedPlan: recoveredPlan });
        if (hashPromotionAuthoritySnapshot(manifest) !== sourceAuthorityHash) {
          throw new Error("certification_source_child_changed");
        }
        atomicJson(finalProofFile, proof);
        atomicJson(journalFile, { ...proof, sourceAuthorityHash, status: "promoted" } satisfies PromotionJournal);
        console.log(` 🎮 [certification-promotion] [discovery] [finalized] child=${manifest.sourceChildId} homework=${manifest.homeworkId} artifact=${proof.artifactHash.slice(0, 12)}`);
        return { childId: manifest.sourceChildId, homeworkId: manifest.homeworkId, artifactHash: proof.artifactHash, reused: true };
      }
      throw new Error("certification_promotion_real_cycle_exists");
    }
  }

  for (const relative of [
    "assignment-source.json",
    "discovery-academic.json",
    "discovery-design.json",
    "discovery-contract.json",
    path.join("runtime-verification", "acceptance.json"),
  ]) {
    copyExact(path.join(certDraft, relative), path.join(targetDraft, relative));
  }
  const certifiedExtraction = readAssignmentSourceExtraction(path.join(certDraft, "assignment-extraction.json"));
  const sourceFilename = path.basename(certifiedExtraction.filename);
  const archivedAssignment = path.join(realChildDir(manifest), "homework", "sources", manifest.homeworkId, sourceFilename);
  copyExact(manifest.assignmentPath, archivedAssignment);
  const promotedExtraction: AssignmentSourceExtraction = {
    ...certifiedExtraction,
    sourcePath: archivedAssignment,
    filename: sourceFilename,
  };
  const targetExtractionFile = path.join(targetDraft, "assignment-extraction.json");
  if (fs.existsSync(targetExtractionFile)) {
    const existingExtraction = readAssignmentSourceExtraction(targetExtractionFile);
    if (JSON.stringify(existingExtraction) !== JSON.stringify(promotedExtraction)) {
      throw new Error(`certification_promotion_destination_conflict:${targetExtractionFile}`);
    }
  } else {
    writeAssignmentSourceExtraction(targetExtractionFile, promotedExtraction);
  }
  copyExact(path.join(certGame, "discovery.html"), path.join(targetGame, "discovery.html"));
  copyExact(path.join(certGame, "discovery-background.svg"), path.join(targetGame, "discovery-background.svg"));

  const verifiedContract = await dependencies.ensureArtifactsAreServed({
    rootDir: manifest.sourceRoot,
    childId: manifest.sourceChildId,
    homeworkId: manifest.homeworkId,
    contract,
  });
  if (verifiedContract.artifact.artifactHash !== proof.artifactHash
    || verifiedContract.artifact.contractHash !== proof.academicHash) {
    throw new Error("certification_promotion_revalidation_changed_contract");
  }
  if (hashPromotionAuthoritySnapshot(manifest) !== sourceAuthorityHash) {
    throw new Error("certification_source_child_changed");
  }
  const extraction = readAssignmentSourceExtraction(path.join(targetDraft, "assignment-extraction.json"));
  const activeSessionPlan = dependencies.buildActiveSessionPlan({
    rootDir: manifest.sourceRoot,
    childId: manifest.sourceChildId,
    homeworkId: manifest.homeworkId,
    evaluation: verifiedContract,
  });
  publishDiscoveryExperience({
    rootDir: manifest.sourceRoot,
    childId: manifest.sourceChildId,
    homeworkId: manifest.homeworkId,
    evaluation: verifiedContract,
    activeSessionPlan,
    assignment: {
      title: extraction.filename,
      contentFingerprint: manifest.assignmentFingerprint,
      capturedEvidenceIds: verifiedContract.assignmentEvidenceIds,
      targets: verifiedContract.constructs.map((construct) => construct.constructId),
    },
  });
  if (hashPromotionAuthoritySnapshot(manifest) !== sourceAuthorityHash) {
    throw new Error("certification_source_child_changed");
  }
  assertPristineCycle(
    manifest.sourceRoot,
    manifest.sourceChildId,
    manifest.homeworkId,
    manifest.assignmentFingerprint,
    verifiedContract,
  );
  assertCompletedPublication({ manifest, proof, contract: verifiedContract, expectedPlan: activeSessionPlan });
  atomicJson(finalProofFile, proof);
  atomicJson(journalFile, { ...proof, sourceAuthorityHash, status: "promoted" } satisfies PromotionJournal);
  console.log(` 🎮 [certification-promotion] [discovery] [promoted] child=${manifest.sourceChildId} homework=${manifest.homeworkId} artifact=${proof.artifactHash.slice(0, 12)}`);
  return { childId: manifest.sourceChildId, homeworkId: manifest.homeworkId, artifactHash: proof.artifactHash, reused: false };
  } finally {
    releaseMathGenerationLease({
      rootDir: manifest.sourceRoot,
      childId: manifest.sourceChildId,
      homeworkId: "discovery-intake",
      token: lease.token,
    });
  }
}

function arg(name: string): string | undefined {
  const inline = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const childId = arg("child")?.trim().toLowerCase();
  const approvedBy = arg("approved-by")?.trim();
  if (!childId) throw new Error("certification_promotion_child_required");
  if (!approvedBy) throw new Error("certification_promotion_human_approval_required");
  const manifest = findCertificationRun({ childId, domain: "math" });
  if (!manifest) throw new Error(`certification_promotion_run_not_found:${childId}:math`);
  const result = await promoteCertifiedMathDiscovery({ manifest, approvedBy });
  console.log(result.reused
    ? `Discovery was already prepared for ${childId}. No provider work repeated.`
    : `Discovery is ready for ${childId}. The child will create the real board from their own evaluation.`);
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(`Certification promotion failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
