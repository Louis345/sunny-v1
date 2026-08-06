import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertLabBudget,
  buildLabReportHtml,
  sanitizeCycleForLab,
  sha256Tree,
  type MathFeedbackLabSummary,
} from "./runMathFeedbackLoopLab";

const cycle = {
  schemaVersion: 2,
  childId: "reina",
  homeworkId: "hw-fractions",
  revision: 19,
  lifecycle: "baseline_ready",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  domain: "math",
  assignment: { title: "Fractions", contentFingerprint: "fp", capturedEvidenceIds: ["pdf:1"], targets: ["fractions"] },
  academicTheory: { theoryId: "theory", revision: 2, hypothesis: "test fractions", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] },
  engagementTheory: null,
  assumptions: [{ assumptionId: "a1", claim: "comparison is fragile", evidenceIds: ["pdf:1"], confidence: 0.6, uncertainty: "unknown", createdAt: "2026-08-01T00:00:00.000Z", lockedAt: "2026-08-01T00:00:00.000Z" }],
  academicPredictions: [],
  nodes: [
    { nodeId: "n1", role: "baseline", state: "completed", evidenceIds: ["old"], artifactBinding: { validationStatus: "passed" } },
    { nodeId: "quest", role: "quest", state: "completed", evidenceIds: ["old"], artifactBinding: { validationStatus: "passed" } },
    { nodeId: "boss", role: "boss", state: "completed", evidenceIds: ["old"], artifactBinding: { validationStatus: "passed" } },
  ],
  evidence: { academic: [{ evidenceId: "old" }], engagement: [], companionObservations: [] },
  observations: [{ observationId: "old" }],
  predictionEvaluations: [{ evaluationId: "old" }],
  evidenceSources: [{ sourceId: "old" }],
  decisionHistory: [{ eventType: "theory_decided" }],
} as never;

describe("math feedback-loop lab", () => {
  it("gives the single follow-up Planner call enough bounded output room", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/runMathFeedbackLoopLab.ts"), "utf8");
    expect(source).toContain("maxTokens: 32000");
  });

  it("sanitizes one frozen cycle into identical evidence-free scenario seeds", () => {
    const first = sanitizeCycleForLab(cycle, new Date("2026-08-01T10:00:00.000Z"));
    const second = sanitizeCycleForLab(cycle, new Date("2026-08-01T10:00:00.000Z"));
    expect(first).toEqual(second);
    expect(first.lifecycle).toBe("baseline_ready");
    expect(first.evidence.academic).toEqual([]);
    expect(first.observations).toEqual([]);
    expect(first.predictionEvaluations).toEqual([]);
    expect(first.evidenceSources).toEqual([]);
    expect(first.decisionHistory).toEqual([]);
    expect(first.nodes.find((node) => node.role === "baseline")?.state).toBe("ready");
    expect(first.nodes.find((node) => node.role === "quest")?.state).toBe("locked");
    expect(first.nodes.find((node) => node.role === "boss")?.artifactBinding).toBeNull();
  });

  it("enforces both paid-call and dollar ceilings before another call", () => {
    expect(() => assertLabBudget({ callCount: 7, spentUsd: 1, reserveUsd: 0.1, maxCalls: 7, maxCostUsd: 10 })).toThrow(/call_cap/);
    expect(() => assertLabBudget({ callCount: 2, spentUsd: 9.8, reserveUsd: 0.3, maxCalls: 7, maxCostUsd: 10 })).toThrow(/cost_cap/);
    expect(() => assertLabBudget({ callCount: 2, spentUsd: 2, reserveUsd: 0.3, maxCalls: 7, maxCostUsd: 10 })).not.toThrow();
  });

  it("hashes the complete real-child tree so writes cannot hide", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-feedback-hash-"));
    fs.writeFileSync(path.join(root, "a.json"), "one");
    const before = sha256Tree(root);
    fs.writeFileSync(path.join(root, "a.json"), "two");
    expect(sha256Tree(root)).not.toBe(before);
  });

  it("renders a visual verdict, scenario comparison, assumption accountability, and next-plan difference", () => {
    const summary = {
      status: "PASS",
      calls: 6,
      costUsd: 2.34,
      maxCalls: 7,
      maxCostUsd: 10,
      sameStartingHash: true,
      differentPaths: true,
      falseAssumptionFound: true,
      nextPlannerUsedCorrection: true,
      realReinaUnchanged: true,
      startHash: "abc123",
      originalAssumptions: [{ assumptionId: "a1", claim: "comparison is fragile", confidence: 0.6, evidenceIds: ["pdf:1"] }],
      strong: { accuracy: 0.92, assistanceCount: 0, errors: [], action: "generate_quest", reason: "unassisted success", lifecycle: ["baseline", "quest", "boss", "awaiting_calibration"] },
      weak: { accuracy: 0.4, assistanceCount: 3, errors: ["unequal partitions"], action: "generate_support", reason: "assisted errors", lifecycle: ["baseline", "support"] },
      assessments: [{ assumptionId: "a1", outcome: "rejected", reason: "returned work contradicted it", observationIds: ["o1"] }],
      returnedWork: { homeworkId: "hw-fractions", sourceId: "returned:1", predictionErrors: [{ predictionId: "p1", error: 0.3 }] },
      nextPlan: { preserved: ["visual comparison"], changed: ["guided partitioning"], evidenceReason: "assessment a1" },
      integrity: { forbiddenCalls: [], realTreeBefore: "real", realTreeAfter: "real", files: [] },
      plainSummary: ["Sunny began with one belief.", "The evidence produced different paths.", "Returned work changed the next plan."],
    } satisfies MathFeedbackLabSummary;
    const html = buildLabReportHtml(summary);
    expect(html).toContain("ADAPTATION RESULT");
    expect(html).toContain("Independent success");
    expect(html).toContain("Persistent misunderstanding");
    expect(html).toContain("BELIEVED");
    expect(html).toContain("ACTUALLY HAPPENED");
    expect(html).toContain("Next-plan difference");
    expect(html).toContain("$2.34 / $10.00");
  });
});
