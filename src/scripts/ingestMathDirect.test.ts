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
  readReusablePlannerProgram,
  runMathIngestionCommand,
} from "./ingestMathDirect";

describe("direct math ingestion checkpoints", () => {
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
