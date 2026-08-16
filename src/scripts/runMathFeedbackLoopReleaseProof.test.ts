import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runMathFeedbackLoopReleaseProof } from "./runMathFeedbackLoopReleaseProof";

describe("final math feedback-loop release proof", () => {
  it("proves continuation, prediction accountability, and prior-error handoff without child writes", async () => {
    const repoRoot = process.cwd();
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-final-loop-proof-"));
    const summary = await runMathFeedbackLoopReleaseProof({ repoRoot, outputDir });

    expect(summary.status).toBe("PASS");
    expect(summary.identicalStartingHash).toBe(true);
    expect(summary.returnedWorkControlledReadiness).toBe(true);
    expect(summary.multipleSessionsPreservedOneHistory).toBe(true);
    expect(summary.nextPlannerUsedPriorPredictionError).toBe(true);
    expect(summary.plannerApiPromptIncludedCalibration).toBe(true);
    expect(summary.currentCodeQuestBossBoundariesPassed).toBe(true);
    expect(summary.strongBossAwaitedCalibration).toBe(true);
    expect(summary.productionQuestBossTransitionProof).toBe(true);
    expect(summary.currentCodeReingestionStatesPassed).toBe(true);
    expect(summary.plannerContextEvidenceIds).toEqual(expect.arrayContaining([
      summary.weak.evaluationId,
      summary.weak.decisionId,
    ]));
    expect(summary.plannerContextHash).toMatch(/^[0-9a-f]{64}$/);
    expect(summary.priorProofFiles).toEqual([]);
    expect(summary.realChildDataChanged).toBe(false);
    expect(summary.strong.lifecycle).toBe("complete");
    expect(summary.strong.readiness).toBe("ready_independent");
    expect(summary.weak.lifecycle).toBe("baseline_generating");
    expect(summary.weak.readiness).toBe("not_yet_ready");
    expect(summary.weak.nextNodeId).toMatch(/^support:/);
    expect(summary.weak.nextPredictionId).toBeTruthy();
    expect(summary.weak.priorEvidenceIds.length).toBeGreaterThan(0);
    expect(summary.predictionRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ assignment: "Equal groups release proof", evidenceType: "graded_work" }),
    ]));
    expect(summary.audit.contractVersion).toBe(11);
    expect(summary.audit.branch).toBeTruthy();
    expect(summary.audit.startingCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(summary.audit.productCodeDiff).toContain("LEARNING_FEEDBACK_LOOP.md");

    const html = fs.readFileSync(path.join(outputDir, "report.html"), "utf8");
    expect(html).toContain("MATH FEEDBACK LOOP: PASS");
    expect(html).toContain("Real child data changed: No");
    expect(html).toContain(summary.strong.decisionId);
    expect(html).toContain(summary.weak.decisionId);
    expect(html).toContain(summary.startingHash);
  });
});
