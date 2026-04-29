import { describe, expect, it } from "vitest";
import {
  resolveShowroomGestureSequence,
  resolveShowroomSpeechGesturePlan,
  type CompanionShowroomGestureProfile,
} from "../components/CompanionShowroom";

describe("CompanionShowroom gestures", () => {
  it("keeps meet gestures untouched", () => {
    const profile: CompanionShowroomGestureProfile = {
      meet: "quick_formal_bow",
      intro: ["wave", "think"],
      plead: ["dance_victory", "wave"],
      specialDance: "salsa_dancing",
    };

    expect(resolveShowroomGestureSequence(profile, "meet")).toEqual([
      "quick_formal_bow",
    ]);
  });

  it("sanitizes speech gestures away from awkward overhead motions", () => {
    const profile: CompanionShowroomGestureProfile = {
      meet: "wave",
      intro: ["wave", "think"],
      plead: ["dance_victory", "wave", "blow_a_kiss"],
      specialDance: "silly_dancing",
    };

    expect(resolveShowroomGestureSequence(profile, "intro")).toEqual([
      "talking",
      "think",
    ]);
    expect(resolveShowroomGestureSequence(profile, "plead")).toEqual([
      "talking",
      "blow_a_kiss",
    ]);
  });

  it("uses sustained talking mode for speech when the primary gesture is talking", () => {
    const profile: CompanionShowroomGestureProfile = {
      meet: "wave",
      intro: ["wave", "think"],
      plead: ["dance_victory", "wave", "blow_a_kiss"],
      specialDance: "silly_dancing",
    };

    expect(resolveShowroomSpeechGesturePlan(profile, "intro")).toEqual({
      sequence: ["talking"],
      sustainPrimary: true,
      intervalMs: null,
    });
    expect(resolveShowroomSpeechGesturePlan(profile, "plead")).toEqual({
      sequence: ["talking"],
      sustainPrimary: true,
      intervalMs: null,
    });
  });
});
