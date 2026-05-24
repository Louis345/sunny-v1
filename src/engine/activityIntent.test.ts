import { describe, expect, it } from "vitest";
import type { NodeConfig } from "../shared/adventureTypes";
import {
  buildActivityIntent,
  isTargetPurposeCompatibleWithActivity,
  selectTargetsForIntent,
} from "./activityIntent";

function node(type: NodeConfig["type"], words: string[] = ["above", "ahead", "again"]): NodeConfig {
  return {
    id: `n-${type}`,
    type,
    words,
    difficulty: 1,
    isLocked: false,
    isCompleted: false,
    isGoal: false,
  };
}

describe("ActivityIntent", () => {
  it("builds a complete intent for every real spelling instrument", () => {
    const intent = buildActivityIntent({
      childId: "demo_adaptive",
      node: node("spell-check", ["ahead", "again"]),
      carePlanHypothesis: "Ila needs production-from-memory checks before reward play.",
      evidence: {
        recentMisses: ["ahead"],
        fragileTargets: ["again"],
      },
      now: new Date("2026-05-16T19:30:00.000Z"),
    });

    expect(intent).toMatchObject({
      activityId: "spell-check",
      purpose: "spelling_production_from_memory",
      targetSelector: "production_targets",
      evidenceTier: "practice",
      masteryEligible: false,
      carePlanHypothesis: "Ila needs production-from-memory checks before reward play.",
    });
    expect(intent.intentId).toContain("intent-demo_adaptive-spell-check");
    expect(intent.selectedTargets.map((target) => target.target)).toEqual(["ahead", "again"]);
    expect(intent.diagnosticQuestion).toMatch(/spell/i);
    expect(intent.successCriteria.length).toBeGreaterThan(0);
    expect(intent.reviseCriteria.length).toBeGreaterThan(0);
    expect(intent.falsifyCriteria.length).toBeGreaterThan(0);
    expect(intent.expectedEvidence).toContain("targetResults");
    expect(intent.companionSpeechPolicy).toMatchObject({
      mentionOnlyCurrentSnapshot: true,
    });
  });

  it("selects Wheel targets from fragile or recent misses before word order", () => {
    const decision = selectTargetsForIntent({
      childId: "demo_adaptive",
      node: node("wheel-of-fortune", ["random", "ahead", "again"]),
      targetSelector: "fragile_or_recent_miss",
      evidence: {
        recentMisses: ["ahead"],
        fragileTargets: ["again"],
        recentlyUsedByActivity: {
          "wheel-of-fortune": ["again"],
        },
      },
      maxTargets: 1,
      now: new Date("2026-05-16T19:31:00.000Z"),
    });

    expect(decision.selectedTargets).toEqual(["ahead"]);
    expect(decision.selectorId).toContain("selector-demo_adaptive-wheel-of-fortune");
    expect(decision.targetReasons[0]).toMatchObject({
      target: "ahead",
    });
    expect(decision.targetReasons[0]?.reasons.join(" ")).toMatch(/recent miss|not recently used/i);
    expect(decision.traceSummary).toMatch(/Wheel selected "ahead"/);
  });

  it("does not select off-assignment due words when homework targets are present", () => {
    const decision = selectTargetsForIntent({
      childId: "demo_adaptive",
      node: node("letter-rush", ["sign", "know", "write"]),
      targetSelector: "baseline_pattern_mastery",
      evidence: {
        homeworkWords: ["sign", "know", "write"],
        recentMisses: ["farmer"],
        fragileTargets: ["building"],
        sm2DueWords: ["farmer", "building"],
      },
      maxTargets: 3,
      now: new Date("2026-05-21T23:40:00.000Z"),
    });

    expect(decision.selectedTargets).toEqual(["sign", "know", "write"]);
    expect(decision.targetReasons.map((target) => target.target)).not.toContain("farmer");
    expect(decision.targetReasons.map((target) => target.target)).not.toContain("building");
    expect(decision.avoidedTargets).toEqual(expect.arrayContaining(["farmer", "building"]));
  });

  it("marks hidden-answer intents with a strict companion speech policy", () => {
    const intent = buildActivityIntent({
      childId: "demo_adaptive",
      node: node("wheel-of-fortune", ["ahead", "again"]),
      evidence: {
        recentMisses: ["ahead"],
      },
      now: new Date("2026-05-16T19:32:00.000Z"),
    });

    expect(intent.purpose).toBe("playful_retrieval_probe");
    expect(intent.selectedTargets.map((target) => target.target)).toEqual(["ahead"]);
    expect(intent.companionSpeechPolicy).toMatchObject({
      answerVisibility: "hidden_until_reveal",
      canSpeakTargetBeforeReveal: false,
    });
  });

  it("rejects recognition-only targets for clean spelling recall instruments", () => {
    expect(
      isTargetPurposeCompatibleWithActivity({
        activityId: "word-radar",
        targetPurpose: "recognize",
      }).compatible,
    ).toBe(false);
    expect(
      isTargetPurposeCompatibleWithActivity({
        activityId: "word-radar",
        targetPurpose: "spell_from_memory",
      }).compatible,
    ).toBe(true);
    expect(
      isTargetPurposeCompatibleWithActivity({
        activityId: "pronunciation",
        targetPurpose: "recognize",
      }).compatible,
    ).toBe(true);
  });
});
