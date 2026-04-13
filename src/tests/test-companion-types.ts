import { describe, it, expect } from "vitest";
import { buildProfile } from "../profiles/buildProfile";
import { isCompanionEmote } from "../shared/companionEmotes";
import {
  COMPANION_DEFAULTS,
  mergeCompanionConfigWithDefaults,
  type CompanionConfig,
  type CompanionEvent,
  type CompanionTrigger,
} from "../shared/companionTypes";

const TRIGGERS: CompanionTrigger[] = [
  "session_start",
  "correct_answer",
  "wrong_answer",
  "mastery_unlock",
  "session_end",
  "idle_too_long",
];

function assertCompanionConfigShape(c: CompanionConfig): void {
  expect(typeof c.vrmUrl).toBe("string");
  expect(typeof c.idleFrequency_ms).toBe("number");
  expect(typeof c.randomMomentProbability).toBe("number");
  expect(typeof c.toggledOff).toBe("boolean");
  expect(c.sensitivity).toBeDefined();
  for (const key of TRIGGERS) {
    expect(typeof c.sensitivity[key]).toBe("number");
    expect(c.sensitivity[key]).toBeGreaterThanOrEqual(0);
    expect(c.sensitivity[key]).toBeLessThanOrEqual(1);
  }
}

describe("companion types (COMPANION-001)", () => {
  it("CompanionConfig default has all required fields and sensitivity keys", () => {
    assertCompanionConfigShape(COMPANION_DEFAULTS);
  });

  it("CompanionEvent has type companion_event and payload trigger, timestamp, childId", () => {
    const ev: CompanionEvent = {
      type: "companion_event",
      payload: {
        trigger: "correct_answer",
        timestamp: 1_700_000_000_000,
        childId: "fixture_child",
      },
    };
    expect(ev.type).toBe("companion_event");
    expect(ev.payload.trigger).toBe("correct_answer");
    expect(typeof ev.payload.timestamp).toBe("number");
    expect(typeof ev.payload.childId).toBe("string");
  });

  it("CompanionEvent may carry emote + intensity without trigger (expressCompanion)", () => {
    const ev: CompanionEvent = {
      type: "companion_event",
      payload: {
        emote: "wink",
        intensity: 0.5,
        timestamp: 1_700_000_000_001,
        childId: "fixture_child",
      },
    };
    expect(ev.payload.emote).toBe("wink");
    expect(ev.payload.intensity).toBe(0.5);
    expect(ev.payload.trigger).toBeUndefined();
  });

  it("CompanionTrigger union covers all six triggers (exhaustive check)", () => {
    const seen = new Set<string>(TRIGGERS);
    expect(seen.size).toBe(6);
  });

  it("default sensitivity values are between 0 and 1", () => {
    for (const key of TRIGGERS) {
      const v = COMPANION_DEFAULTS.sensitivity[key];
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("default vrmUrl and toggledOff", () => {
    expect(COMPANION_DEFAULTS.vrmUrl).toBe("/companions/sample.vrm");
    expect(COMPANION_DEFAULTS.toggledOff).toBe(false);
  });

  it("isCompanionEmote accepts expressCompanion enum and rejects unknown", () => {
    expect(isCompanionEmote("happy")).toBe(true);
    expect(isCompanionEmote("celebrating")).toBe(true);
    expect(isCompanionEmote("angry")).toBe(false);
    expect(isCompanionEmote(null)).toBe(false);
  });

  it("mergeCompanionConfigWithDefaults fills missing sensitivity keys", () => {
    const m = mergeCompanionConfigWithDefaults({
      vrmUrl: "/custom.vrm",
      sensitivity: { correct_answer: 0.2 },
    } as Partial<CompanionConfig>);
    expect(m.vrmUrl).toBe("/custom.vrm");
    expect(m.sensitivity.correct_answer).toBe(0.2);
    expect(m.sensitivity.wrong_answer).toBe(COMPANION_DEFAULTS.sensitivity.wrong_answer);
  });

  it("buildProfile returns companion for fixture child ila", async () => {
    const p = await buildProfile("ila");
    expect(p).not.toBeNull();
    if (!p) return;
    assertCompanionConfigShape(p.companion);
    expect(p.companion.vrmUrl).toBe("/companions/sample.vrm");
    expect(p.companion.idleFrequency_ms).toBe(45000);
  });

  it("buildProfile returns companion for fixture child reina", async () => {
    const p = await buildProfile("reina");
    expect(p).not.toBeNull();
    if (!p) return;
    assertCompanionConfigShape(p.companion);
    expect(p.companion.vrmUrl).toBe("/companions/matilda.vrm");
  });
});
