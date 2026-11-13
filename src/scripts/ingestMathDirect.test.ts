import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  classifyIngestionFailure,
  currentRunBuildTokens,
  existingAssignmentIngestionOutcome,
  findExistingMathHomeworkIdBySourceHash,
  formatIngestionSummary,
  mathHomeworkIdFromSourceHash,
  prepareMathOpeningEvaluationContext,
  readReusablePlannerProgram,
  resolveMathAssignmentExtraction,
  runAdaptiveMathWorkerWithExistingFactory,
  runMathIngestionCommand,
  shouldResetMathDraft,
} from "./ingestMathDirect";
import {
  createMathBoardWorkerJob,
  createMathInterventionDecision,
  adaptiveMathSnapshotHash,
  mathEvaluationFindingsHash,
  type MathEvaluationFindings,
} from "../engine/adaptiveMathTwoPhase";

describe("direct math ingestion checkpoints", () => {
  it("starts the opening evaluation context from the canonical child chart doorway", () => {
    const getChart = vi.fn(() => ({
      identity: { childId: "lab-child" },
      demographics: { age: 9, grade: 3 },
    }));
    const result = prepareMathOpeningEvaluationContext({
      childId: "lab-child",
      assignment: {
        homeworkId: "hw-math-adaptive",
        cycleId: "cycle-math-adaptive",
        sourceHash: "source-hash",
        extractionHash: "extraction-hash",
        academicContractHash: "academic-hash",
        fullText: "Equal groups",
        sourceEvidenceIds: ["assignment:page-1"],
        contextEvidenceIds: [],
        sourceQuestionTexts: ["A source equal-groups question"],
        sourceQuestionFingerprints: ["source-question"],
      },
      getChart: getChart as never,
    });
    expect(getChart).toHaveBeenCalledWith("lab-child");
    expect(result.prompt).toContain("Factual child chart snapshot");
    expect(result.childChartSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("runs the adaptive worker through the existing production board factory", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-existing-math-factory-"));
    const findings: MathEvaluationFindings = {
      version: 1,
      findingsId: "findings:opening",
      evaluationId: "opening",
      evaluationArtifactId: "opening-artifact",
      evaluationHash: "frozen-opening-evaluation-hash",
      homeworkId: "hw-math-adaptive",
      cycleId: "cycle-math-adaptive",
      academicContractHash: "academic-hash",
      completedAt: "2026-08-16T12:00:00.000Z",
      demonstrated: [],
      holes: [],
      assisted: [],
      ambiguities: [],
      provenance: [{
        evidenceId: "attempt:opening",
        itemId: "opening-item",
        constructId: "math.equal_groups",
        result: "incorrect",
        assistance: "none",
        exposure: "unseen",
        responseMode: "selection",
        device: { kind: "tablet", inputMethods: ["touch"] },
        artifactId: "opening-artifact",
        occurredAt: "2026-08-16T12:00:00.000Z",
      }],
    };
    const decision = createMathInterventionDecision({
      version: 1,
      decisionId: "decision:target-groups",
      findingsHash: mathEvaluationFindingsHash(findings),
      action: "visual_explainer",
      targetConstructIds: ["math.equal_groups"],
      evidenceIds: ["attempt:opening"],
      rationale: "Use a concrete group model.",
      confidence: 0.7,
      uncertainty: "One response.",
      falsifyingEvidence: ["Fresh evidence remains incorrect."],
      measurementKeys: ["fresh.equal_groups"],
      nextEvidenceRequired: ["Fresh unassisted response."],
    }, findings);
    const childChartSnapshot = { identity: { childId: "lab-child" }, demographics: { age: 9, grade: 3 } };
    const frozenExtraction = {
      sourceKind: "embedded_text_pdf",
      sourcePath: "/fixture/math.pdf",
      filename: "math.pdf",
      mediaType: "application/pdf",
      fileHash: "source-hash",
      extractionMethod: "unpdf",
      pages: [{ pageNumber: 1, text: "Equal groups" }],
      fullText: "Equal groups",
      warnings: [],
    } as const;
    const job = createMathBoardWorkerJob({
      rootDir,
      childId: "lab-child",
      homeworkId: findings.homeworkId,
      cycleId: findings.cycleId,
      assignmentSourceHash: "source-hash",
      frozenExtractionHash: adaptiveMathSnapshotHash(frozenExtraction),
      childChartSnapshotHash: adaptiveMathSnapshotHash(childChartSnapshot),
      findings,
      decision,
      academicContractHash: findings.academicContractHash,
      expectedArtifactIds: [],
    });
    const checkpointOrder: string[] = [];
    const continueUnpublished = vi.fn(async (factoryInput: {
      onArtifactPlanReady?: (nodeIds: string[]) => void;
      onArtifactReady?: (artifact: { nodeId: string; htmlHash: string }) => void;
      onArtifactsReady?: (value: { artifacts: Array<{ nodeId: string; htmlHash: string }>; calls: number; tokens: number; costUsd: number }) => void;
    }) => {
      const ready = {
        artifacts: [
          { nodeId: "baseline-targeted", htmlHash: "hash-baseline" },
          { nodeId: "fresh-check", htmlHash: "hash-check" },
        ],
        calls: 4,
        tokens: 1200,
        costUsd: 0.5,
      };
      factoryInput.onArtifactPlanReady?.(ready.artifacts.map((artifact) => artifact.nodeId));
      checkpointOrder.push("plan");
      for (const artifact of ready.artifacts) {
        factoryInput.onArtifactReady?.(artifact);
        checkpointOrder.push(artifact.nodeId);
      }
      factoryInput.onArtifactsReady?.(ready);
      checkpointOrder.push("publication");
      return ({
      kind: "UNPUBLISHED_COMPLETE" as const,
      ...ready,
      });
    });

    const ready = await runAdaptiveMathWorkerWithExistingFactory({
      jobFile: job.jobFile,
      childId: "lab-child",
      startedAt: 0,
      sourceHash: "source-hash",
      frozenExtraction: frozenExtraction as never,
      childChartSnapshot: childChartSnapshot as never,
      continueUnpublished: continueUnpublished as never,
    });

    expect(ready).toMatchObject({
      state: "ready",
      completedArtifactIds: ["baseline-targeted", "fresh-check"],
    });
    expect(checkpointOrder).toEqual(["plan", "baseline-targeted", "fresh-check", "publication"]);
    expect(continueUnpublished).toHaveBeenCalledWith(expect.objectContaining({
      pdf: undefined,
      frozenExtraction,
      frozenChart: childChartSnapshot,
      adaptiveFindings: expect.objectContaining({
        findingsHash: mathEvaluationFindingsHash(findings),
        interventionDecisionId: decision.decisionId,
        decision,
      }),
    }));
    await expect(runAdaptiveMathWorkerWithExistingFactory({
      jobFile: job.jobFile,
      childId: "lab-child",
      startedAt: 0,
      sourceHash: "source-hash",
      frozenExtraction: frozenExtraction as never,
      childChartSnapshot: { identity: { childId: "different-child" } } as never,
      continueUnpublished: continueUnpublished as never,
    })).rejects.toThrow("adaptive_math_worker_chart_binding_mismatch");
    await expect(runAdaptiveMathWorkerWithExistingFactory({
      jobFile: job.jobFile,
      childId: "different-child",
      startedAt: 0,
      sourceHash: "source-hash",
      frozenExtraction: frozenExtraction as never,
      childChartSnapshot: childChartSnapshot as never,
      continueUnpublished: continueUnpublished as never,
    })).rejects.toThrow("adaptive_math_worker_child_binding_mismatch");
    await expect(runAdaptiveMathWorkerWithExistingFactory({
      jobFile: job.jobFile,
      childId: "lab-child",
      startedAt: 0,
      sourceHash: "source-hash",
      frozenExtraction: frozenExtraction as never,
      childChartSnapshot: { demographics: { age: 9, grade: 3 } } as never,
      continueUnpublished: continueUnpublished as never,
    })).rejects.toThrow("adaptive_math_worker_chart_binding_mismatch");

    const chartWithoutIdentity = { demographics: { age: 9, grade: 3 } };
    const missingIdentityJob = createMathBoardWorkerJob({
      rootDir,
      childId: "lab-child",
      homeworkId: findings.homeworkId,
      cycleId: findings.cycleId,
      assignmentSourceHash: "source-hash",
      frozenExtractionHash: adaptiveMathSnapshotHash(frozenExtraction),
      childChartSnapshotHash: adaptiveMathSnapshotHash(chartWithoutIdentity),
      findings,
      decision: { ...decision, decisionId: "decision:missing-chart-identity" },
      academicContractHash: findings.academicContractHash,
      expectedArtifactIds: [],
    });
    await expect(runAdaptiveMathWorkerWithExistingFactory({
      jobFile: missingIdentityJob.jobFile,
      childId: "lab-child",
      startedAt: 0,
      sourceHash: "source-hash",
      frozenExtraction: frozenExtraction as never,
      childChartSnapshot: chartWithoutIdentity as never,
      continueUnpublished: continueUnpublished as never,
    })).rejects.toThrow("adaptive_math_worker_chart_child_missing");
  });

  it("never lets a process-wide fresh flag erase a bound adaptive worker draft", () => {
    expect(shouldResetMathDraft({ freshRequested: true, adaptiveBinding: "bound-evidence" })).toBe(false);
    expect(shouldResetMathDraft({ freshRequested: true })).toBe(true);
  });

  it("checkpoints each real-factory artifact before the factory can publish", () => {
    const ingestion = fs.readFileSync(path.join(process.cwd(), "src/scripts/ingestMathDirect.ts"), "utf8");
    const generation = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    expect(ingestion.indexOf("onArtifactPlanReady")).toBeLessThan(ingestion.indexOf("persistDirectExperience({"));
    expect(generation).toContain("mapConcurrentSettledWithCheckpoint(input.plan.activities");
    expect(generation).toContain("input.onArtifactReady?.(artifact)");
  });

  it("lets the adaptive worker continue from frozen extraction without rereading the PDF", async () => {
    const load = vi.fn();
    const frozenExtraction = {
      fileHash: "source-hash",
      fullText: "Frozen equal-groups extraction",
      pages: [{ pageNumber: 1, text: "Equal groups" }],
    } as never;

    await expect(resolveMathAssignmentExtraction({
      pdf: undefined,
      extractionCacheFile: "/tmp/unused-extraction.json",
      frozenExtraction,
      expectedSourceHash: "source-hash",
      load,
    })).resolves.toEqual({ extraction: frozenExtraction, reused: true });
    expect(load).not.toHaveBeenCalled();

    await expect(resolveMathAssignmentExtraction({
      pdf: undefined,
      extractionCacheFile: "/tmp/unused-extraction.json",
      frozenExtraction,
      expectedSourceHash: "different-source-hash",
      load,
    })).rejects.toThrow("adaptive_math_frozen_extraction_hash_mismatch");
  });

  it("exits the command before extraction and every provider for an existing canonical assignment", async () => {
    const extract = vi.fn();
    const plan = vi.fn();
    const design = vi.fn();
    const build = vi.fn();
    const publish = vi.fn();
    const continueUnpublished = vi.fn(async () => {
      await extract();
      await plan();
      await design();
      await build();
      await publish();
    });

    const result = await runMathIngestionCommand({
      sourceHash: "source-hash",
      rebuildNodeIds: [],
      existingCycle: {
        homeworkId: "hw-math-existing",
        lifecycle: "quest_ready",
        assignment: { contentFingerprint: "source-hash" },
      },
      continueUnpublished,
    });

    expect(result).toMatchObject({ kind: "CONTINUE_EXISTING", shouldGenerate: false });
    expect(continueUnpublished).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
    expect(plan).not.toHaveBeenCalled();
    expect(design).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("continues into checkpoint generation when no canonical cycle exists", async () => {
    const continueUnpublished = vi.fn(async () => ({ kind: "UNPUBLISHED_RESUME" as const }));

    await expect(runMathIngestionCommand({
      sourceHash: "source-hash",
      rebuildNodeIds: [],
      existingCycle: null,
      continueUnpublished,
    })).resolves.toEqual({ kind: "UNPUBLISHED_RESUME" });
    expect(continueUnpublished).toHaveBeenCalledOnce();
  });

  it.each([
    ["baseline_ready", "READY_TO_START"],
    ["baseline_active", "CONTINUE_EXISTING"],
    ["baseline_evaluating", "CONTINUE_EXISTING"],
    ["quest_ready", "CONTINUE_EXISTING"],
    ["quest_active", "CONTINUE_EXISTING"],
    ["boss_ready", "CONTINUE_EXISTING"],
    ["awaiting_calibration", "AWAITING_CALIBRATION"],
    ["complete", "ALREADY_COMPLETE"],
  ] as const)("classifies an existing %s assignment without regenerating it", (lifecycle, expected) => {
    expect(existingAssignmentIngestionOutcome({
      homeworkId: "hw-math-existing",
      lifecycle,
      assignment: { contentFingerprint: "source-hash" },
    }, "source-hash")).toMatchObject({ kind: expected, shouldGenerate: false });
  });

  it("rejects a homework identity collision instead of silently preserving different source content", () => {
    expect(() => existingAssignmentIngestionOutcome({
      homeworkId: "hw-math-existing",
      lifecycle: "baseline_active",
      assignment: { contentFingerprint: "old-source" },
    }, "new-source")).toThrow("learning_cycle_assignment_identity_mismatch:hw-math-existing");
  });

  it("does not silently ignore an explicit node rebuild for a published assignment", () => {
    expect(() => existingAssignmentIngestionOutcome({
      homeworkId: "hw-math-existing",
      lifecycle: "baseline_active",
      assignment: { contentFingerprint: "source-hash" },
    }, "source-hash", { rebuildNodeIds: ["N2"] }))
      .toThrow("published_assignment_rebuild_requires_separate_workflow:hw-math-existing:N2");
  });

  it("gives changed assignment source content a distinct homework identity", () => {
    const first = mathHomeworkIdFromSourceHash("source-hash-a");
    expect(first).toMatch(/^hw-math-[a-f0-9]{24}$/);
    expect(first).not.toBe(mathHomeworkIdFromSourceHash("source-hash-b"));
  });

  it("reuses a legacy short homework id when its full source fingerprint matches", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-legacy-math-id-"));
    const cyclesDir = path.join(rootDir, "src/context/reina/homework/cycles");
    fs.mkdirSync(cyclesDir, { recursive: true });
    fs.writeFileSync(path.join(cyclesDir, "hw-math-deadbeef.json"), JSON.stringify({
      homeworkId: "hw-math-deadbeef",
      domain: "math",
      assignment: { contentFingerprint: "full-source-fingerprint" },
    }));

    expect(findExistingMathHomeworkIdBySourceHash("reina", "full-source-fingerprint", rootDir))
      .toBe("hw-math-deadbeef");
  });

  it("resumes a legacy short-id unpublished draft when its full source fingerprint matches", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-legacy-math-draft-"));
    const draftDir = path.join(rootDir, "src/context/reina/homework/direct-drafts/hw-math-cafebabe");
    fs.mkdirSync(draftDir, { recursive: true });
    fs.writeFileSync(path.join(draftDir, "assignment-source.json"), JSON.stringify({
      version: 1,
      fileHash: "full-draft-source-fingerprint",
      pageCount: 3,
      extractionMethod: "native_pdf",
    }));

    expect(findExistingMathHomeworkIdBySourceHash("reina", "full-draft-source-fingerprint", rootDir))
      .toBe("hw-math-cafebabe");
  });

  it("archives a malformed Planner diagnostic instead of poisoning every resume", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-planner-checkpoint-"));
    const programFile = path.join(root, "math-learning-program.json");
    const diagnosticFile = path.join(root, "provider-diagnostics", "planner-response.json");
    fs.mkdirSync(path.dirname(diagnosticFile), { recursive: true });
    fs.writeFileSync(diagnosticFile, JSON.stringify({ content: [{ type: "text", text: "truncated" }] }));

    expect(readReusablePlannerProgram({ programFile, diagnosticFile, archiveDir: path.join(root, "audit") }))
      .toBeUndefined();
    expect(fs.existsSync(diagnosticFile)).toBe(false);
    expect(fs.readdirSync(path.join(root, "audit"))).toHaveLength(1);
  });

  it("distinguishes input, provider, and publication failures", () => {
    expect(classifyIngestionFailure(new Error("assignment_source_missing:/tmp/x.pdf"), "reading-assignment"))
      .toBe("INPUT_ERROR");
    expect(classifyIngestionFailure(
      new Error("published_assignment_rebuild_requires_separate_workflow:hw-math-existing:N2"),
      "reading-assignment",
    )).toBe("INPUT_ERROR");
    expect(classifyIngestionFailure(new Error("request timed out"), "activity-building"))
      .toBe("PROVIDER_PAUSED");
    expect(classifyIngestionFailure(new Error("disk full"), "atomic-publication"))
      .toBe("PUBLICATION_FAILED");
  });

  it.each([2, 4, 7])("reports generated and reused totals for a %i-node baseline", (nodeCount) => {
    const generated = Array.from({ length: Math.floor(nodeCount / 2) }, (_, index) => `N${index + 1}`);
    const reused = Array.from({ length: nodeCount - generated.length }, (_, index) => `R${index + 1}`);
    const summary = formatIngestionSummary({
      planner: "reused",
      design: "reused",
      generatedNodeIds: generated,
      reusedNodeIds: reused,
      generatedImages: 0,
      reusedImages: nodeCount + 3,
      calls: generated.length,
      tokens: 1234,
      elapsedMs: 65_000,
      checkpoint: "/tmp/checkpoint",
      bonusDeferred: true,
    });

    expect(summary).toContain(`Baseline nodes: ${generated.length} generated, ${reused.length} reused`);
    expect(summary).toContain("Bonus: deferred until earned");
    expect(summary).toContain("Recorded calls: ");
  });

  it("charges the current run only for generated nodes while retained reuse metadata stays historical", () => {
    expect(currentRunBuildTokens([
      { nodeId: "N1", inputTokens: 100, outputTokens: 200 },
      { nodeId: "N2", inputTokens: 8_000, outputTokens: 20_000 },
    ], ["N1"])).toBe(300);
  });
});
