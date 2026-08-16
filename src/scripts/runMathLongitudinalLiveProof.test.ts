import { describe, expect, it, vi } from "vitest";

import {
  LIVE_PROOF_MAX_CALLS,
  LIVE_PROOF_MAX_COST_USD,
  LIVE_PROOF_MAX_ATTEMPTS,
  assertLiveProofBudget,
  assertLiveProofAttemptBudget,
  isScopedLongitudinalReadiness,
  isPlayableProgressionReady,
  runGatedPlayableProof,
} from "./runMathLongitudinalLiveProof";

describe("math longitudinal live proof guardrails", () => {
  it("blocks calls that would exceed the live proof budget", () => {
    expect(() => assertLiveProofBudget({ callCount: LIVE_PROOF_MAX_CALLS, spentUsd: 0, reserveUsd: 0 }))
      .toThrow(/call_cap/);
    expect(() => assertLiveProofBudget({ callCount: 1, spentUsd: LIVE_PROOF_MAX_COST_USD - 0.5, reserveUsd: 1 }))
      .toThrow(/cost_cap/);
  });

  it("permits one post-checkpoint validation after two zero-usage transport failures", () => {
    expect(() => assertLiveProofAttemptBudget(LIVE_PROOF_MAX_ATTEMPTS - 1)).not.toThrow();
    expect(() => assertLiveProofAttemptBudget(LIVE_PROOF_MAX_ATTEMPTS)).toThrow(/attempt_cap/);
  });

  it("does not spend on Quest or Boss when longitudinal accountability fails", async () => {
    const buildQuest = vi.fn();
    const buildBoss = vi.fn();
    const result = await runGatedPlayableProof({
      longitudinalPassed: false,
      buildQuest,
      buildBoss,
    });

    expect(result).toEqual({ status: "skipped", reason: "longitudinal_gate_failed" });
    expect(buildQuest).not.toHaveBeenCalled();
    expect(buildBoss).not.toHaveBeenCalled();
  });

  it("builds Quest before Boss only after the longitudinal gate passes", async () => {
    const order: string[] = [];
    const result = await runGatedPlayableProof({
      longitudinalPassed: true,
      buildQuest: async () => { order.push("quest"); return { usable: true, artifactPath: "quest.html" }; },
      buildBoss: async () => { order.push("boss"); return { usable: true, artifactPath: "boss.html" }; },
    });

    expect(order).toEqual(["quest", "boss"]);
    expect(result).toEqual({
      status: "complete",
      quest: { usable: true, artifactPath: "quest.html" },
      boss: { usable: true, artifactPath: "boss.html" },
    });
  });

  it("stops before Boss when Quest generation is unusable", async () => {
    const buildBoss = vi.fn();
    const result = await runGatedPlayableProof({
      longitudinalPassed: true,
      buildQuest: async () => ({ usable: false, artifactPath: "quest.html" }),
      buildBoss,
    });

    expect(result.status).toBe("incomplete");
    expect(buildBoss).not.toHaveBeenCalled();
  });

  it("accepts a safe whole-assignment ready-with-support judgment without erasing the unresolved construct", () => {
    expect(isScopedLongitudinalReadiness({
      roundTwoReadiness: "not_yet_ready",
      roundThreeReadiness: "ready_with_support",
      roundThreeConstructs: ["math.multiplication.equal_groups", "math.multiplication.factor_pairs"],
      roundThreeReason: "Equal groups transferred independently; factor_pairs remains unresolved and requires support.",
    })).toBe(true);
    expect(isScopedLongitudinalReadiness({
      roundTwoReadiness: "not_yet_ready",
      roundThreeReadiness: "ready_independent",
      roundThreeConstructs: ["math.multiplication.equal_groups", "math.multiplication.factor_pairs"],
      roundThreeReason: "Everything is mastered.",
    })).toBe(false);
  });

  it("resumes playable generation after Quest has already authorized Boss", () => {
    expect(isPlayableProgressionReady("quest_generating")).toBe(true);
    expect(isPlayableProgressionReady("boss_generating")).toBe(true);
    expect(isPlayableProgressionReady("baseline_evaluating")).toBe(false);
  });
});
