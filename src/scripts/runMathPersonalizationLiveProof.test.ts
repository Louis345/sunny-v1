import { describe, expect, it } from "vitest";

import {
  PERSONALIZATION_BRANCHES,
  PERSONALIZATION_MAX_ATTEMPTS,
  assertPersonalizationAttemptBudget,
  compareDesignArtifacts,
  evaluatePersonalizationProof,
  heldConstantAcademicSignature,
  shouldRebuildIsolatedProofCycle,
  shouldRecordFinalization,
  shouldRecordQuestCompletion,
} from "./runMathPersonalizationLiveProof";

const design = (overrides: Record<string, unknown> = {}) => ({
  artifactId: "artifact-a",
  nodeId: "quest",
  academicContractHash: "academic-hash",
  title: "Signal Bridge",
  audienceRationale: "Nine-year-old learner",
  openingPromise: "Restore the bridge",
  firstThreeSeconds: "A bridge flickers",
  firstAction: "Drag one crate",
  interactionDemonstration: "One crate snaps into a group",
  coreInteraction: "Arrange crates into equal groups",
  mathAsPower: "Correct groups power the bridge",
  stakes: "The rival crosses one span after a mismatch",
  consequences: "A span dims",
  recovery: "The mismatched group separates",
  progression: ["Build groups", "Infer factors", "Solve transfer"],
  interactionContinuity: "One continuous crossing",
  worldReaction: "Bridge spans light and the rival moves",
  payoff: "The bridge opens with a victory sequence",
  replayVariation: "New group sizes and rival paths",
  visualDirection: "Bright mechanical river crossing",
  motionDirection: "Snapping crates and moving rival",
  soundDirection: "Percussive progress cues",
  usefulLibraries: ["GSAP"],
  engagementPrediction: "Visible construction may sustain play",
  falsifyingEvidence: "Early abandonment",
  ...overrides,
});

describe("math personalization live proof", () => {
  it("defines three engagement histories without changing academic performance", () => {
    expect(PERSONALIZATION_BRANCHES.map((branch) => branch.id)).toEqual([
      "visual-construction",
      "fast-challenge",
      "negative-uncertain",
    ]);
    expect(new Set(PERSONALIZATION_BRANCHES.map((branch) => JSON.stringify(branch.academicResult))).size).toBe(1);
    expect(new Set(PERSONALIZATION_BRANCHES.map((branch) => JSON.stringify(branch.engagement))).size).toBe(3);
  });

  it("does not count cosmetic changes as meaningful personalization", () => {
    const result = compareDesignArtifacts(
      design(),
      design({ title: "Purple Signal Bridge", visualDirection: "Purple mechanical river crossing" }),
    );
    expect(result.meaningfullyDifferent).toBe(false);
    expect(result.structuralDifferences).toEqual([]);
  });

  it("recognizes changes to the actual child experience", () => {
    const result = compareDesignArtifacts(
      design(),
      design({
        coreInteraction: "Tap factor pairs before a rival reaches the vault",
        stakes: "Three misses let the rival take the key",
        recovery: "A number line reveals the factor mismatch",
        progression: ["Choose pairs", "Race the rival", "Defend the vault"],
        worldReaction: "The rival advances and vault locks rotate",
        payoff: "The child opens the vault before the rival",
      }),
    );
    expect(result.meaningfullyDifferent).toBe(true);
    expect(result.structuralDifferences.length).toBeGreaterThanOrEqual(4);
  });

  it("passes only when academics match, every branch is playable, and designs differ structurally", () => {
    const result = evaluatePersonalizationProof({
      branches: [
        { id: "visual-construction", startingHash: "same", academicHash: "math", questUsable: true, bossUsable: true, questDesign: design(), bossDesign: design({ nodeId: "boss" }) },
        { id: "fast-challenge", startingHash: "same", academicHash: "math", questUsable: true, bossUsable: true, questDesign: design({ coreInteraction: "Tap factor pairs against a clock", stakes: "The rival gains ground", recovery: "A factor rail appears", progression: ["Warm up", "Race", "Final sprint"], worldReaction: "Rival moves", payoff: "Finish line erupts" }), bossDesign: design({ nodeId: "boss", coreInteraction: "Defend gates with factors", stakes: "A gate breaks", recovery: "Broken gate shows mismatch", progression: ["One gate", "Two gates", "Core gate"], worldReaction: "Gates shake", payoff: "Core restored" }) },
        { id: "negative-uncertain", startingHash: "same", academicHash: "math", questUsable: true, bossUsable: true, questDesign: design({ coreInteraction: "Investigate broken arrays without a timer", stakes: "Wrong hypotheses consume evidence tokens", recovery: "The array exposes the uneven row", progression: ["Inspect", "Repair", "Explain"], worldReaction: "Evidence board updates", payoff: "Mystery resolves" }), bossDesign: design({ nodeId: "boss", coreInteraction: "Reconstruct a damaged machine", stakes: "Bad parts jam the machine", recovery: "The jam exposes the factor mismatch", progression: ["Repair", "Test", "Restart"], worldReaction: "Machine parts move", payoff: "Machine launches" }) },
      ],
      weakHighRatingBlocked: true,
      realChildDataChanged: false,
    });
    expect(result.status).toBe("PASS");
  });

  it("records the synthetic Quest scorecard after a valid artifact makes the node ready", () => {
    expect(shouldRecordQuestCompletion("quest_generating")).toBe(true);
    expect(shouldRecordQuestCompletion("quest_ready")).toBe(true);
    expect(shouldRecordQuestCompletion("quest_evaluating")).toBe(false);
  });

  it("does not duplicate an already checkpointed session finalization on resume", () => {
    expect(shouldRecordFinalization([], "rating-1")).toBe(true);
    expect(shouldRecordFinalization([{ choiceEventId: "rating-1" }], "rating-1")).toBe(false);
  });

  it("allows the three final builds after bounded zero-usage billing failures", () => {
    expect(() => assertPersonalizationAttemptBudget(PERSONALIZATION_MAX_ATTEMPTS - 1)).not.toThrow();
    expect(() => assertPersonalizationAttemptBudget(PERSONALIZATION_MAX_ATTEMPTS)).toThrow(/attempt_cap/);
  });

  it("holds original academics and observed results constant without treating different interventions as different academic truth", () => {
    const common = {
      assignment: { contentFingerprint: "same", targets: ["equal-groups"] },
      academicTheory: { theoryId: "t1", hypothesis: "same" },
      academicPredictions: [{ predictionId: "personalization-proof-prediction", constructId: "equal-groups" }],
      observations: [{ itemId: "i1", constructLinks: [{ constructId: "equal-groups" }], result: { correct: true }, assistance: { status: "unassisted" }, exposure: "unseen", provenance: "independent_probe", confounds: [] }],
    };
    const left = { ...common, academicPredictions: [...common.academicPredictions, { predictionId: "generated-quest-a", constructId: "transfer-a" }] };
    const right = { ...common, academicPredictions: [...common.academicPredictions, { predictionId: "generated-quest-b", constructId: "transfer-b" }] };
    expect(heldConstantAcademicSignature(left)).toEqual(heldConstantAcademicSignature(right));
    expect(heldConstantAcademicSignature({ ...right, observations: [{ ...common.observations[0], result: { correct: false } }] }))
      .not.toEqual(heldConstantAcademicSignature(left));
  });

  it("rebuilds only stale isolated cycle state while preserving cached model artifacts", () => {
    expect(shouldRebuildIsolatedProofCycle(undefined)).toBe(true);
    expect(shouldRebuildIsolatedProofCycle(1)).toBe(true);
    expect(shouldRebuildIsolatedProofCycle(2)).toBe(false);
  });
});
