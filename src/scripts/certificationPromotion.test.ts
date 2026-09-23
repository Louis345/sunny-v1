import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireMathGenerationLease, buildDiscoveryActiveSessionPlan, createDiscoveryLearningCycle, hashDiscoveryContract, releaseMathGenerationLease, type MathDiscoveryEvaluationContract } from "../engine/adaptiveMathDiscovery";
import { readAssignmentSourceExtraction } from "../engine/assignmentSourceExtraction";
import { CHILD_FACING_VISUAL_GATE_VERSION, childFacingVisualRequestHash } from "../engine/childFacingVisualGate";
import { DISCOVERY_RELEASE_VIEWPORTS, DISCOVERY_VERIFIER_VERSION } from "../engine/discoveryVisualReview";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { createCertificationRun, hashDirectory, type CertificationRunManifest } from "./sunnyCertification";
import { promoteCertifiedMathDiscovery } from "./certificationPromotion";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function json(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture(): {
  rootDir: string;
  manifest: CertificationRunManifest;
  homeworkId: string;
  contract: MathDiscoveryEvaluationContract;
  html: string;
} {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-cert-promotion-source-"));
  const certificationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-cert-promotion-runs-"));
  roots.push(rootDir, certificationRoot);
  json(path.join(rootDir, "children.config.json"), {
    childProfiles: { reina: {} },
    childCompanionIds: { reina: "elli" },
    companions: { elli: { displayName: "Elli" } },
    defaultCompanionId: "elli",
  });
  json(path.join(rootDir, "package.json"), { name: "fixture" });
  json(path.join(rootDir, "tsconfig.json"), {});
  json(path.join(rootDir, "src/context/reina/learning_profile.json"), { childId: "reina" });
  json(path.join(rootDir, "src/context/reina/plans/active_session_plan.json"), {});
  json(path.join(rootDir, "src/context/reina/homework/current.json"), {});
  const assignmentPath = path.join(rootDir, "reina-homework.pdf");
  fs.writeFileSync(assignmentPath, "%PDF-1.4\ncertification fixture");
  const fingerprint = crypto.createHash("sha256").update(fs.readFileSync(assignmentPath)).digest("hex");
  const homeworkId = `hw-math-${fingerprint.slice(0, 8)}`;
  const manifest = createCertificationRun({ rootDir, certificationRoot, childId: "reina", domain: "math", assignmentPath });
  manifest.homeworkId = homeworkId;
  manifest.state = "session_closed";
  const html = "<!doctype html><html><body>Approved Discovery</body></html>";
  const academic = {
    evaluationId: "eval-reina-multiplication",
    title: "Multiplication Discovery",
    assignmentEvidenceIds: [`assignment:${homeworkId}:source`],
    constructs: [{ constructId: "math.multiplication.arrays", prerequisiteIds: [] }],
    items: [{
      itemId: "array-1",
      constructId: "math.multiplication.arrays",
      prompt: "How many dots are in three rows of four?",
      representationSpec: "Three rows with four dots in each row.",
      responseContract: { mode: "tap_numeric_pad" as const, representationId: "three-by-four-array" },
      correctAnswerContract: { acceptedValues: ["12"] },
      difficultyBoundary: "grade 3",
      exposureId: "eval-reina-multiplication:array-1",
      possibleConfounds: [],
      falsifyingEvidence: [],
      measurementKeys: ["independent_correct"],
    }],
  };
  const contractHash = hashDiscoveryContract(academic);
  const contract: MathDiscoveryEvaluationContract = {
    ...academic,
    artifact: {
      artifactId: `${homeworkId}:discovery`,
      htmlPath: `/api/homework/game/reina/${homeworkId}/discovery.html`,
      artworkPath: `/api/homework/game/reina/${homeworkId}/discovery-background.svg`,
      contractHash,
      artifactHash: hashDiscoveryContract(html),
    },
  };
  const childDir = path.join(manifest.workspaceDir, "src/context/reina");
  const draftDir = path.join(childDir, "homework/direct-drafts", homeworkId);
  const gameDir = path.join(childDir, "homework/games", homeworkId);
  json(path.join(draftDir, "assignment-source.json"), { version: 3, fileHash: fingerprint, pageCount: 4, extractionMethod: "native_pdf" });
  json(path.join(draftDir, "assignment-extraction.json"), {
    sourceKind: "scanned_assignment_image",
    sourcePath: assignmentPath,
    filename: "reina-homework.pdf",
    mediaType: "application/pdf",
    fileHash: fingerprint,
    extractionMethod: "native_pdf",
    pages: [{ pageNumber: 1, text: "Multiplication arrays" }],
    fullText: "Multiplication arrays",
    warnings: [],
  });
  json(path.join(draftDir, "discovery-academic.json"), academic);
  const design = { contractHash, design: { theme: "constellations" }, backgroundSvg: "<svg xmlns=\"http://www.w3.org/2000/svg\"/>" };
  json(path.join(draftDir, "discovery-design.json"), design);
  json(path.join(draftDir, "discovery-builder.json"), { contractHash, designHash: hashDiscoveryContract(design), html });
  json(path.join(draftDir, "discovery-contract.json"), contract);
  json(path.join(draftDir, "runtime-verification/acceptance.json"), {
    passed: true,
    verifierVersion: DISCOVERY_VERIFIER_VERSION,
    htmlHash: contract.artifact.artifactHash,
    academicHash: hashDiscoveryContract(contract.items),
    viewports: DISCOVERY_RELEASE_VIEWPORTS,
    completedItemIds: contract.items.map((item) => item.itemId),
    screenshots: ["journey-1.png"],
    verifiedAt: "2026-09-22T20:00:00.000Z",
  });
  const screenshotPath = path.join(draftDir, "visual-review", "journey-1.png");
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  fs.writeFileSync(screenshotPath, "approved screenshot bytes");
  const screenshotHash = crypto.createHash("sha256").update(fs.readFileSync(screenshotPath)).digest("hex");
  const visualModel = "gpt-5.6";
  const promptHash = "c".repeat(64);
  const requestHash = childFacingVisualRequestHash({
    version: CHILD_FACING_VISUAL_GATE_VERSION,
    model: visualModel,
    promptHash,
    screenshotLabels: [path.basename(screenshotPath)],
    screenshotHashes: [screenshotHash],
  });
  json(path.join(draftDir, "visual-review/visual-review.json"), {
    status: "approved",
    controllingGate: "browser_and_blind_vision",
    iterations: [{ iteration: 1, htmlHash: contract.artifact.artifactHash, screenshotPath, screenshotPaths: [screenshotPath], issues: [] }],
  });
  json(path.join(draftDir, "visual-review/blind-visual-verdict.json"), {
    version: CHILD_FACING_VISUAL_GATE_VERSION,
    status: "received",
    requestHash,
    promptHash,
    model: visualModel,
    decision: "approve",
    screenshotHashes: [screenshotHash],
    observations: [],
  });
  json(path.join(draftDir, "adaptive-generation-job.json"), {
    version: 1,
    childId: "reina",
    homeworkId,
    phase: "board_ready",
    nodes: [{ nodeId: "practice-1", status: "ready" }],
  });
  createDiscoveryLearningCycle({
    rootDir: manifest.workspaceDir,
    childId: "reina",
    homeworkId,
    assignment: {
      title: "reina-homework.pdf",
      contentFingerprint: fingerprint,
      capturedEvidenceIds: academic.assignmentEvidenceIds,
      targets: academic.constructs.map((construct) => construct.constructId),
    },
    evaluation: contract,
  });
  const cycleFile = path.join(childDir, "homework/cycles", `${homeworkId}.json`);
  const simulationCycle = JSON.parse(fs.readFileSync(cycleFile, "utf8"));
  simulationCycle.lifecycle = "board_ready";
  simulationCycle.adaptiveGeneration = {
    evaluationId: academic.evaluationId,
    evaluationCompletedAt: "2026-09-22T20:05:00.000Z",
    programHash: "p".repeat(64),
    designHash: "b".repeat(64),
  };
  simulationCycle.observations = [{
    observationId: "simulation-answer",
    observedAt: "2026-09-22T20:04:00.000Z",
    source: "independent_probe",
    sourceId: `${homeworkId}:discovery`,
    homeworkId,
    nodeId: `${homeworkId}:discovery`,
    itemId: "array-1",
    constructLinks: [{ constructId: "math.multiplication.arrays", relation: "primary" }],
    result: { correct: true },
    assistance: { level: "none", details: [] },
    exposure: { status: "unseen", exposureIds: ["eval-reina-multiplication:array-1"] },
    provenance: { artifactId: `${homeworkId}:discovery`, activityType: "math-discovery", responseMode: "tap_numeric_pad" },
    confounds: [],
  }];
  json(cycleFile, simulationCycle);
  json(path.join(draftDir, "targeted-program.json"), { basedOn: "simulation-answer" });
  json(path.join(draftDir, "node-artifacts/practice-1.json"), { simulated: true });
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(path.join(gameDir, "discovery.html"), html);
  fs.writeFileSync(path.join(gameDir, "discovery-background.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
  return { rootDir, manifest, homeworkId, contract, html };
}

function dependencies() {
  return {
    ensureArtifactsAreServed: vi.fn(async ({ contract }: { contract: MathDiscoveryEvaluationContract }) => contract),
    buildActiveSessionPlan: ({ childId, homeworkId, evaluation }: { childId: string; homeworkId: string; evaluation: MathDiscoveryEvaluationContract }) =>
      buildDiscoveryActiveSessionPlan({ childId, homeworkId, evaluation, companion: { id: "elli", name: "Elli" } }),
    now: () => "2026-09-22T21:00:00.000Z",
  };
}

describe("certified Discovery promotion", () => {
  it("creates a pristine real Discovery cycle without copying impersonator evidence or board artifacts", async () => {
    const { rootDir, manifest, homeworkId, contract, html } = fixture();
    const deps = dependencies();
    const result = await promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, deps);

    expect(result).toMatchObject({ childId: "reina", homeworkId, artifactHash: contract.artifact.artifactHash, reused: false });
    expect(deps.ensureArtifactsAreServed).toHaveBeenCalledOnce();
    const cycle = getLearningCycle("reina", homeworkId, { rootDir })!;
    expect(cycle.lifecycle).toBe("evaluation_ready");
    expect(cycle.observations).toEqual([]);
    expect(cycle.predictionEvaluations).toEqual([]);
    expect(cycle.adaptiveGeneration?.evaluationCompletedAt).toBeUndefined();
    const targetDraft = path.join(rootDir, "src/context/reina/homework/direct-drafts", homeworkId);
    expect(fs.readFileSync(path.join(rootDir, "src/context/reina/homework/games", homeworkId, "discovery.html"), "utf8")).toBe(html);
    const promotedExtraction = readAssignmentSourceExtraction(path.join(targetDraft, "assignment-extraction.json"));
    expect(promotedExtraction.sourcePath).toBe(path.join(rootDir, "src/context/reina/homework/sources", homeworkId, "reina-homework.pdf"));
    expect(crypto.createHash("sha256").update(fs.readFileSync(promotedExtraction.sourcePath)).digest("hex"))
      .toBe(manifest.assignmentFingerprint);
    expect(promotedExtraction.sourcePath).not.toContain(manifest.workspaceDir);
    expect(fs.existsSync(path.join(targetDraft, "targeted-program.json"))).toBe(false);
    expect(fs.existsSync(path.join(targetDraft, "node-artifacts"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(targetDraft, "certified-discovery-promotion.json"), "utf8"))).toMatchObject({
      certificationRunId: manifest.certificationRunId,
      approvedBy: "Saori",
      copiedSimulationEvidence: false,
      copiedTargetedBoard: false,
    });
  });

  it("is idempotent and never republishes or regenerates a matching promotion", async () => {
    const { manifest } = fixture();
    const deps = dependencies();
    expect((await promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, deps)).reused).toBe(false);
    expect((await promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, deps)).reused).toBe(true);
    expect(deps.ensureArtifactsAreServed).toHaveBeenCalledOnce();
  });

  it("accepts current-verifier proof for the exact artifact after unrelated source code changes", async () => {
    const { rootDir, manifest, homeworkId, contract } = fixture();
    const interrupted = dependencies();
    interrupted.ensureArtifactsAreServed.mockRejectedValueOnce(new Error("simulated_crash"));
    json(path.join(rootDir, "src/engine/unrelated-change.json"), { verifierNote: "after approval" });
    await expect(promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, interrupted))
      .rejects.toThrow("simulated_crash");

    json(path.join(rootDir, "src/engine/unrelated-change.json"), { verifierNote: "edited again while interrupted" });
    const result = await promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, dependencies());

    expect(result).toMatchObject({ homeworkId, artifactHash: contract.artifact.artifactHash, reused: false });
    expect(getLearningCycle("reina", homeworkId, { rootDir })?.lifecycle).toBe("evaluation_ready");
  });

  it("still refuses proof recorded by an older verifier for the same artifact", async () => {
    const { manifest, homeworkId } = fixture();
    const acceptance = path.join(manifest.workspaceDir, "src/context/reina/homework/direct-drafts", homeworkId, "runtime-verification/acceptance.json");
    json(acceptance, { ...JSON.parse(fs.readFileSync(acceptance, "utf8")), verifierVersion: DISCOVERY_VERIFIER_VERSION - 1 });
    await expect(promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, dependencies()))
      .rejects.toThrow("certification_promotion_runtime_approval_missing");
  });

  it("blocks promotion when browser or blind visual approval is absent", async () => {
    const { manifest, homeworkId } = fixture();
    const verdict = path.join(manifest.workspaceDir, "src/context/reina/homework/direct-drafts", homeworkId, "visual-review/blind-visual-verdict.json");
    json(verdict, { version: 4, decision: "reject", screenshotHashes: ["a".repeat(64)], observations: ["broken"] });
    await expect(promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, dependencies()))
      .rejects.toThrow("certification_promotion_visual_approval_missing");
  });

  it("binds the approved artifact to the frozen design and real reviewed screenshots", async () => {
    const designTamper = fixture();
    const designBuilder = path.join(designTamper.manifest.workspaceDir, "src/context/reina/homework/direct-drafts", designTamper.homeworkId, "discovery-builder.json");
    json(designBuilder, { contractHash: designTamper.contract.artifact.contractHash, designHash: "d".repeat(64), html: designTamper.html });
    await expect(promoteCertifiedMathDiscovery({ manifest: designTamper.manifest, approvedBy: "Saori" }, dependencies()))
      .rejects.toThrow("certification_promotion_design_mismatch");

    const screenshotTamper = fixture();
    const verdict = path.join(screenshotTamper.manifest.workspaceDir, "src/context/reina/homework/direct-drafts", screenshotTamper.homeworkId, "visual-review/blind-visual-verdict.json");
    const saved = JSON.parse(fs.readFileSync(verdict, "utf8"));
    saved.screenshotHashes = ["a".repeat(64)];
    json(verdict, saved);
    await expect(promoteCertifiedMathDiscovery({ manifest: screenshotTamper.manifest, approvedBy: "Saori" }, dependencies()))
      .rejects.toThrow("certification_promotion_visual_approval_missing");

    const incompleteReview = fixture();
    const draft = path.join(incompleteReview.manifest.workspaceDir, "src/context/reina/homework/direct-drafts", incompleteReview.homeworkId);
    const auditFile = path.join(draft, "visual-review/visual-review.json");
    const audit = JSON.parse(fs.readFileSync(auditFile, "utf8"));
    const secondScreenshot = path.join(draft, "visual-review/journey-2.png");
    fs.writeFileSync(secondScreenshot, "second approved-state screenshot");
    audit.iterations[0].screenshotPaths.push(secondScreenshot);
    json(auditFile, audit);
    await expect(promoteCertifiedMathDiscovery({ manifest: incompleteReview.manifest, approvedBy: "Saori" }, dependencies()))
      .rejects.toThrow("certification_promotion_visual_approval_missing");

    const requestTamper = fixture();
    const requestVerdict = path.join(requestTamper.manifest.workspaceDir, "src/context/reina/homework/direct-drafts", requestTamper.homeworkId, "visual-review/blind-visual-verdict.json");
    const requestSaved = JSON.parse(fs.readFileSync(requestVerdict, "utf8"));
    requestSaved.requestHash = "f".repeat(64);
    json(requestVerdict, requestSaved);
    await expect(promoteCertifiedMathDiscovery({ manifest: requestTamper.manifest, approvedBy: "Saori" }, dependencies()))
      .rejects.toThrow("certification_promotion_visual_approval_missing");
  });

  it("revalidates the unchanged real child authority snapshot when resuming after interruption", async () => {
    const { rootDir, manifest } = fixture();
    const interrupted = dependencies();
    interrupted.ensureArtifactsAreServed.mockRejectedValueOnce(new Error("simulated_crash"));
    await expect(promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, interrupted))
      .rejects.toThrow("simulated_crash");
    json(path.join(rootDir, "src/context/reina/caregiver-note.json"), { changedWhileInterrupted: true });
    await expect(promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, dependencies()))
      .rejects.toThrow("certification_source_child_changed");
  });

  it("rechecks the child authority snapshot after runtime verification and before publication", async () => {
    const { rootDir, manifest } = fixture();
    const deps = dependencies();
    deps.ensureArtifactsAreServed.mockImplementationOnce(async ({ contract }: { contract: MathDiscoveryEvaluationContract }) => {
      json(path.join(rootDir, "src/context/reina/caregiver-note.json"), { changedDuringVerification: true });
      return contract;
    });
    await expect(promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, deps))
      .rejects.toThrow("certification_source_child_changed");
    expect(getLearningCycle("reina", manifest.homeworkId!, { rootDir })).toBeNull();
  });

  it("resumes an interrupted publication instead of accepting a cycle with missing projections", async () => {
    const { rootDir, manifest, homeworkId } = fixture();
    const workspaceCycle = path.join(manifest.workspaceDir, "src/context/reina/homework/cycles", `${homeworkId}.json`);
    const realCycle = path.join(rootDir, "src/context/reina/homework/cycles", `${homeworkId}.json`);
    const partial = JSON.parse(fs.readFileSync(workspaceCycle, "utf8"));
    partial.lifecycle = "evaluation_ready";
    partial.observations = [];
    delete partial.adaptiveGeneration.evaluationCompletedAt;
    delete partial.adaptiveGeneration.programHash;
    delete partial.adaptiveGeneration.designHash;
    json(realCycle, partial);
    manifest.sourceSnapshotHash = hashDirectory(path.join(rootDir, "src/context/reina"));

    await promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, dependencies());
    const homework = JSON.parse(fs.readFileSync(path.join(rootDir, "src/context/reina/homework/current.json"), "utf8"));
    expect(homework.activeByDomain.math.homeworkId).toBe(homeworkId);
  });

  it("rejects any real cycle containing teaching or inferred evidence", async () => {
    const { rootDir, manifest, homeworkId } = fixture();
    const workspaceCycle = path.join(manifest.workspaceDir, "src/context/reina/homework/cycles", `${homeworkId}.json`);
    const realCycle = path.join(rootDir, "src/context/reina/homework/cycles", `${homeworkId}.json`);
    const contaminated = JSON.parse(fs.readFileSync(workspaceCycle, "utf8"));
    contaminated.lifecycle = "evaluation_ready";
    contaminated.observations = [];
    contaminated.academicPredictions = [{
      predictionId: "simulation-prediction",
      theoryId: contaminated.academicTheory.theoryId,
      constructId: "math.multiplication.arrays",
      context: "simulation",
      horizon: "next attempt",
      expectedMetric: { key: "accuracy", min: 0, max: 1 },
      predictedErrorPatterns: [],
      confidence: 0.5,
      evidenceIds: [],
      intervention: "simulation intervention",
      evidenceLimit: "practice_only",
      createdAt: "2026-09-22T20:10:00.000Z",
    }];
    delete contaminated.adaptiveGeneration.evaluationCompletedAt;
    delete contaminated.adaptiveGeneration.programHash;
    delete contaminated.adaptiveGeneration.designHash;
    json(realCycle, contaminated);
    manifest.sourceSnapshotHash = hashDirectory(path.join(rootDir, "src/context/reina"));
    await expect(promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, dependencies()))
      .rejects.toThrow("certification_promotion_real_cycle_exists");
  });

  it("rejects a superficially clean cycle whose evaluation node differs from the frozen contract", async () => {
    const { rootDir, manifest, homeworkId } = fixture();
    const workspaceCycle = path.join(manifest.workspaceDir, "src/context/reina/homework/cycles", `${homeworkId}.json`);
    const realCycle = path.join(rootDir, "src/context/reina/homework/cycles", `${homeworkId}.json`);
    const contaminated = JSON.parse(fs.readFileSync(workspaceCycle, "utf8"));
    contaminated.lifecycle = "evaluation_ready";
    contaminated.observations = [];
    contaminated.nodes[0].evidenceIds = ["simulation-evidence"];
    delete contaminated.adaptiveGeneration.evaluationCompletedAt;
    delete contaminated.adaptiveGeneration.programHash;
    delete contaminated.adaptiveGeneration.designHash;
    json(realCycle, contaminated);
    manifest.sourceSnapshotHash = hashDirectory(path.join(rootDir, "src/context/reina"));
    await expect(promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, dependencies()))
      .rejects.toThrow("certification_promotion_real_cycle_exists");

    const semanticTamper = fixture();
    const semanticWorkspaceCycle = path.join(semanticTamper.manifest.workspaceDir, "src/context/reina/homework/cycles", `${semanticTamper.homeworkId}.json`);
    const semanticRealCycle = path.join(semanticTamper.rootDir, "src/context/reina/homework/cycles", `${semanticTamper.homeworkId}.json`);
    const semanticCycle = JSON.parse(fs.readFileSync(semanticWorkspaceCycle, "utf8"));
    semanticCycle.lifecycle = "evaluation_ready";
    semanticCycle.observations = [];
    semanticCycle.nodes[0].algorithmOwner = "practice-score";
    delete semanticCycle.adaptiveGeneration.evaluationCompletedAt;
    delete semanticCycle.adaptiveGeneration.programHash;
    delete semanticCycle.adaptiveGeneration.designHash;
    json(semanticRealCycle, semanticCycle);
    semanticTamper.manifest.sourceSnapshotHash = hashDirectory(path.join(semanticTamper.rootDir, "src/context/reina"));
    await expect(promoteCertifiedMathDiscovery({ manifest: semanticTamper.manifest, approvedBy: "Saori" }, dependencies()))
      .rejects.toThrow("certification_promotion_real_cycle_exists");
  });

  it("keeps promotion idempotent after the real child begins Discovery", async () => {
    const { rootDir, manifest, homeworkId } = fixture();
    await promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, dependencies());
    const cycleFile = path.join(rootDir, "src/context/reina/homework/cycles", `${homeworkId}.json`);
    const cycle = JSON.parse(fs.readFileSync(cycleFile, "utf8"));
    cycle.lifecycle = "evaluation_active";
    cycle.observations = [{ observationId: "real-child-answer" }];
    json(cycleFile, cycle);
    expect((await promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, dependencies())).reused).toBe(true);
  });

  it("finalizes safely when the child starts after publication but before the proof is written", async () => {
    const { rootDir, manifest, homeworkId } = fixture();
    await promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, dependencies());
    const targetDraft = path.join(rootDir, "src/context/reina/homework/direct-drafts", homeworkId);
    fs.rmSync(path.join(targetDraft, "certified-discovery-promotion.json"));
    const journalFile = path.join(manifest.runDir, "discovery-promotion.json");
    const journal = JSON.parse(fs.readFileSync(journalFile, "utf8"));
    journal.status = "validated";
    json(journalFile, journal);
    const cycleFile = path.join(rootDir, "src/context/reina/homework/cycles", `${homeworkId}.json`);
    const cycle = JSON.parse(fs.readFileSync(cycleFile, "utf8"));
    cycle.lifecycle = "evaluation_active";
    cycle.observations = [{ observationId: "real-child-answer" }];
    json(cycleFile, cycle);

    expect((await promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, dependencies())).reused).toBe(true);
    expect(fs.existsSync(path.join(targetDraft, "certified-discovery-promotion.json"))).toBe(true);
  });

  it("refuses crash finalization when copied questions, artwork, or the Discovery plan changed", async () => {
    const prepareInterruptedFinalization = async () => {
      const created = fixture();
      await promoteCertifiedMathDiscovery({ manifest: created.manifest, approvedBy: "Saori" }, dependencies());
      const targetDraft = path.join(created.rootDir, "src/context/reina/homework/direct-drafts", created.homeworkId);
      fs.rmSync(path.join(targetDraft, "certified-discovery-promotion.json"));
      const journalFile = path.join(created.manifest.runDir, "discovery-promotion.json");
      const journal = JSON.parse(fs.readFileSync(journalFile, "utf8"));
      journal.status = "validated";
      json(journalFile, journal);
      const cycleFile = path.join(created.rootDir, "src/context/reina/homework/cycles", `${created.homeworkId}.json`);
      const cycle = JSON.parse(fs.readFileSync(cycleFile, "utf8"));
      cycle.lifecycle = "evaluation_active";
      cycle.observations = [{ observationId: "real-child-answer" }];
      json(cycleFile, cycle);
      return { ...created, targetDraft };
    };

    const contractTamper = await prepareInterruptedFinalization();
    const contractFile = path.join(contractTamper.targetDraft, "discovery-contract.json");
    const contract = JSON.parse(fs.readFileSync(contractFile, "utf8"));
    contract.items[0].correctAnswerContract.acceptedValues = ["999"];
    json(contractFile, contract);
    await expect(promoteCertifiedMathDiscovery({ manifest: contractTamper.manifest, approvedBy: "Saori" }, dependencies()))
      .rejects.toThrow("certification_promotion_publication_incomplete");

    const artworkTamper = await prepareInterruptedFinalization();
    fs.writeFileSync(path.join(artworkTamper.rootDir, "src/context/reina/homework/games", artworkTamper.homeworkId, "discovery-background.svg"), "<svg>broken</svg>");
    await expect(promoteCertifiedMathDiscovery({ manifest: artworkTamper.manifest, approvedBy: "Saori" }, dependencies()))
      .rejects.toThrow("certification_promotion_publication_incomplete");

    const planTamper = await prepareInterruptedFinalization();
    const planFile = path.join(planTamper.rootDir, "src/context/reina/plans/active_session_plan.json");
    const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
    plan.activeByDomain.math.nodePlan = [];
    json(planFile, plan);
    await expect(promoteCertifiedMathDiscovery({ manifest: planTamper.manifest, approvedBy: "Saori" }, dependencies()))
      .rejects.toThrow("certification_promotion_publication_incomplete");
  });

  it("will not race a real ingestion worker for the same child", async () => {
    const { rootDir, manifest } = fixture();
    const lease = acquireMathGenerationLease({ rootDir, childId: "reina", homeworkId: "discovery-intake" });
    expect(lease.acquired).toBe(true);
    manifest.sourceSnapshotHash = hashDirectory(path.join(rootDir, "src/context/reina"));
    try {
      await expect(promoteCertifiedMathDiscovery({ manifest, approvedBy: "Saori" }, dependencies()))
        .rejects.toThrow("certification_promotion_already_running");
    } finally {
      releaseMathGenerationLease({ rootDir, childId: "reina", homeworkId: "discovery-intake", token: lease.token! });
    }
  });

  it("blocks promotion after the real child chart changes or when a real cycle already exists", async () => {
    const changed = fixture();
    json(path.join(changed.rootDir, "src/context/reina/caregiver-note.json"), { changed: true });
    await expect(promoteCertifiedMathDiscovery({ manifest: changed.manifest, approvedBy: "Saori" }, dependencies()))
      .rejects.toThrow("certification_source_child_changed");

    const collision = fixture();
    const collisionCycle = path.join(collision.rootDir, "src/context/reina/homework/cycles", `${collision.homeworkId}.json`);
    fs.mkdirSync(path.dirname(collisionCycle), { recursive: true });
    fs.copyFileSync(
      path.join(collision.manifest.workspaceDir, "src/context/reina/homework/cycles", `${collision.homeworkId}.json`),
      collisionCycle,
    );
    collision.manifest.sourceSnapshotHash = hashDirectory(path.join(collision.rootDir, "src/context/reina"));
    await expect(promoteCertifiedMathDiscovery({ manifest: collision.manifest, approvedBy: "Saori" }, dependencies()))
      .rejects.toThrow("certification_promotion_real_cycle_exists");
  });
});
