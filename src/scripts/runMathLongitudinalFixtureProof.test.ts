import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runMathLongitudinalFixtureProof } from "./runMathLongitudinalFixtureProof";

const repoRoot = path.resolve(__dirname, "../..");
const fixtureDir = path.join(repoRoot, "output/pdf/math-release-confidence");

describe("three-assignment longitudinal math proof", () => {
  it("preserves assignment identity and carries returned-work corrections into later planning context", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-math-longitudinal-"));
    const summary = await runMathLongitudinalFixtureProof({ repoRoot, fixtureDir, outputDir });

    expect(summary.status).toBe("PASS");
    expect(summary.rounds).toHaveLength(3);
    expect(new Set(summary.rounds.map((round) => round.homeworkId)).size).toBe(3);
    expect(summary.rounds.every((round) => round.sameAssignmentReingestionPreserved)).toBe(true);
    expect(summary.rounds.every((round) => round.returnedWorkLinkedToOriginal)).toBe(true);
    expect(summary.rounds[1]?.plannerContextDecisionIds).toContain(summary.rounds[0]?.decisionId);
    expect(summary.rounds[2]?.plannerContextDecisionIds).toContain(summary.rounds[1]?.decisionId);
    expect(summary.rounds[1]?.assumptionOutcome).toBe("rejected");
    expect(summary.rounds[2]?.readiness).toBe("ready_independent");
    expect(summary.rounds[2]?.readinessConstructs).not.toContain("math.multiplication.factor_pairs");
    expect(summary.engagementContaminatedMastery).toBe(false);
    expect(summary.realChildDataChanged).toBe(false);
    expect(fs.existsSync(path.join(outputDir, "report.html"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "summary.json"))).toBe(true);
  });
});
