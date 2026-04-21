import { describe, it, expect, vi } from "vitest";
import type { VRM } from "@pixiv/three-vrm";
import {
  TRIGGER_EXPRESSION_MAP,
  TRIGGER_REACTION_DURATION_MS,
  applyAcceptedEmote,
  applyAcceptedTrigger,
  applyExpressionStateToVrm,
  createNeutralExpressionState,
  getThinkingHeadTiltFactor,
  pickEmotesToApply,
  pickTriggersToApply,
  shouldApplyCompanionReaction,
  tickExpressionDecay,
  CompanionEventDeduper,
} from "../utils/companionExpressions";
import type { CompanionEvent } from "../../../src/shared/companionTypes";
import { cloneCompanionDefaults } from "../../../src/shared/companionTypes";

function ev(
  trigger: NonNullable<CompanionEvent["payload"]["trigger"]>,
  timestamp: number,
  childId = "fixture",
): CompanionEvent {
  return {
    type: "companion_event",
    payload: { trigger, timestamp, childId },
  };
}

describe("companionExpressions (COMPANION-003)", () => {
  it("TRIGGER_EXPRESSION_MAP maps triggers to expressions / thinking", () => {
    expect(TRIGGER_EXPRESSION_MAP.correct_answer).toBe("happy");
    expect(TRIGGER_EXPRESSION_MAP.wrong_answer).toBe("sad");
    expect(TRIGGER_EXPRESSION_MAP.mastery_unlock).toBe("surprised");
    expect(TRIGGER_EXPRESSION_MAP.session_start).toBe("happy");
    expect(TRIGGER_EXPRESSION_MAP.idle_too_long).toBe("thinking");
  });

  it("reaction fires when random < sensitivity", () => {
    const c = cloneCompanionDefaults();
    expect(
      shouldApplyCompanionReaction("correct_answer", c.sensitivity, () => 0.5),
    ).toBe(true);
  });

  it("reaction does NOT fire when random >= sensitivity", () => {
    const c = cloneCompanionDefaults();
    expect(
      shouldApplyCompanionReaction("correct_answer", c.sensitivity, () => 0.99),
    ).toBe(false);
  });

  it("face weight starts at 1 and decays to 0 over duration", () => {
    const s = createNeutralExpressionState();
    applyAcceptedTrigger(s, "correct_answer");
    expect(s.faceExpression).toBe("happy");
    expect(s.faceWeight).toBe(1);
    const dur = TRIGGER_REACTION_DURATION_MS.correct_answer;
    tickExpressionDecay(s, dur / 2);
    expect(s.faceWeight).toBeCloseTo(0.5, 5);
    tickExpressionDecay(s, dur / 2 + 1);
    expect(s.faceWeight).toBe(0);
    expect(s.faceExpression).toBeNull();
  });

  it("after decay completes, neutral rest (no active face)", () => {
    const s = createNeutralExpressionState();
    applyAcceptedTrigger(s, "wrong_answer");
    tickExpressionDecay(s, TRIGGER_REACTION_DURATION_MS.wrong_answer + 50);
    expect(s.faceExpression).toBeNull();
    expect(s.faceWeight).toBe(0);
    expect(s.thinkingActive).toBe(false);
  });

  it("thinking uses pose path, not face expression", () => {
    const s = createNeutralExpressionState();
    applyAcceptedTrigger(s, "idle_too_long");
    expect(s.faceExpression).toBeNull();
    expect(s.faceWeight).toBe(0);
    expect(s.thinkingActive).toBe(true);
    s.thinkingElapsedMs = s.thinkingDurationMs / 2;
    expect(getThinkingHeadTiltFactor(s)).toBeGreaterThan(0);
  });

  it("sensitivity values come from profile companion, not ignored", () => {
    const c = cloneCompanionDefaults();
    c.sensitivity.correct_answer = 0.2;
    expect(shouldApplyCompanionReaction("correct_answer", c.sensitivity, () => 0.15)).toBe(
      true,
    );
    expect(shouldApplyCompanionReaction("correct_answer", c.sensitivity, () => 0.25)).toBe(
      false,
    );
  });

  it("deduplication by timestamp — same event twice does not double-trigger", () => {
    const c = cloneCompanionDefaults();
    c.sensitivity.correct_answer = 1;
    const deduper = new CompanionEventDeduper();
    const e = ev("correct_answer", 4242);
    const r = () => 0.1;
    const a = pickTriggersToApply([e.payload, e.payload], c, r, deduper);
    expect(a.filter((t) => t === "correct_answer").length).toBe(1);
  });

  it("pickTriggersToApply filters by forChildId when set", () => {
    const c = cloneCompanionDefaults();
    c.sensitivity.correct_answer = 1;
    const deduper = new CompanionEventDeduper();
    const other = ev("correct_answer", 1111, "other");
    const mine = ev("correct_answer", 2222, "fixture");
    const r = () => 0.1;
    const a = pickTriggersToApply([other.payload, mine.payload], c, r, deduper, {
      forChildId: "fixture",
    });
    expect(a).toEqual(["correct_answer"]);
    expect(deduper.tryConsume(other.payload)).toBe(true);
  });

  it("shouldApplyCompanionReaction falls back when sensitivity entry is missing", () => {
    const c = cloneCompanionDefaults();
    (c.sensitivity as unknown as Record<string, number>).correct_answer = undefined as unknown as number;
    expect(shouldApplyCompanionReaction("correct_answer", c.sensitivity, () => 0.5)).toBe(
      true,
    );
  });

  it("mastery_unlock uses longer duration than wrong_answer", () => {
    expect(TRIGGER_REACTION_DURATION_MS.mastery_unlock).toBeGreaterThan(
      TRIGGER_REACTION_DURATION_MS.wrong_answer,
    );
  });

  it("pickTriggersToApply skips payloads that have emote set", () => {
    const c = cloneCompanionDefaults();
    c.sensitivity.correct_answer = 1;
    const deduper = new CompanionEventDeduper();
    const withEmote: CompanionEvent["payload"] = {
      emote: "happy",
      timestamp: 9001,
      childId: "fixture",
    };
    const withTrigger = ev("correct_answer", 9002).payload;
    const r = () => 0.1;
    const a = pickTriggersToApply([withEmote, withTrigger], c, r, deduper);
    expect(a).toEqual(["correct_answer"]);
  });

  it("pickEmotesToApply returns emote + default intensity", () => {
    const deduper = new CompanionEventDeduper();
    const p: CompanionEvent["payload"] = {
      emote: "wink",
      timestamp: 101,
      childId: "fixture",
    };
    const out = pickEmotesToApply([p], deduper);
    expect(out).toEqual([{ emote: "wink", intensity: 0.8 }]);
  });

  it("applyAcceptedEmote wink uses wink logical + short duration", () => {
    const s = createNeutralExpressionState();
    applyAcceptedEmote(s, "wink", 1, cloneCompanionDefaults());
    expect(s.faceExpression).toBe("wink");
    expect(s.faceDurationMs).toBe(600);
    expect(s.faceInitialWeight).toBe(1);
  });

  it("applyAcceptedEmote neutral clears expression", () => {
    const s = createNeutralExpressionState();
    applyAcceptedTrigger(s, "correct_answer");
    applyAcceptedEmote(s, "neutral", undefined, cloneCompanionDefaults());
    expect(s.faceExpression).toBeNull();
    expect(s.thinkingActive).toBe(false);
  });

  it("thinking applies head bone rotation via applyExpressionStateToVrm", () => {
    const setValue = vi.fn();
    const head = { rotation: { z: 0 } };
    const exprMap = { happy: {}, sad: {}, surprised: {}, lookDown: {}, neutral: {} };
    const mockVrm = {
      expressionManager: {
        setValue,
        getExpression: (name: string) => (name in exprMap ? {} : null),
        expressionMap: exprMap,
        update: vi.fn(),
      },
      humanoid: { getRawBoneNode: (name: string) => (name === "head" ? head : null) },
    } as unknown as VRM;
    const s = createNeutralExpressionState();
    applyAcceptedTrigger(s, "idle_too_long");
    s.thinkingElapsedMs = s.thinkingDurationMs / 2;
    const c = cloneCompanionDefaults();
    applyExpressionStateToVrm(mockVrm, s, c);
    expect(setValue).toHaveBeenCalledWith("lookDown", expect.any(Number));
    expect(head.rotation.z).not.toBe(0);
  });
});
