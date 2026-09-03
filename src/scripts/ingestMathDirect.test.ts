import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertFreshResetAllowed,
  classifyIngestionFailure,
  currentRunBuildTokens,
  formatIngestionSummary,
  readReusablePlannerProgram,
  shouldPublishDiscoveryFirst,
  shouldDeferToAdaptiveWorker,
} from "./ingestMathDirect";

describe("direct math ingestion checkpoints", () => {
  it("routes a fresh or active evaluation to Discovery before targeted planning", () => {
    expect(shouldPublishDiscoveryFirst(undefined)).toBe(true);
    expect(shouldPublishDiscoveryFirst("evaluation_ready")).toBe(true);
    expect(shouldPublishDiscoveryFirst("evaluation_active")).toBe(true);
    expect(shouldPublishDiscoveryFirst("evidence_ready")).toBe(false);
  });

  it("never starts the legacy synchronous build after Discovery", () => {
    expect(shouldDeferToAdaptiveWorker("evidence_ready")).toBe(true);
    expect(shouldDeferToAdaptiveWorker("board_generating")).toBe(true);
    expect(shouldDeferToAdaptiveWorker(undefined)).toBe(false);
  });

  it("blocks --fresh once a canonical learning cycle exists", () => {
    expect(() => assertFreshResetAllowed(true, "evaluation_active", "hw-1"))
      .toThrow("fresh_reset_blocked_for_active_learning_cycle:hw-1:evaluation_active");
    expect(() => assertFreshResetAllowed(false, "evaluation_active", "hw-1")).not.toThrow();
    expect(() => assertFreshResetAllowed(true, undefined, "hw-1")).not.toThrow();
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
