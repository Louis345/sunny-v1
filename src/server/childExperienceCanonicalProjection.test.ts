import { describe, expect, it } from "vitest";
import { buildChildExperiencePacket } from "../profiles/childExperiencePacket";
import type { ChildChart } from "../profiles/childChart";

describe("child experience packet canonical projection", () => {
  it("uses the chart's canonical active plan instead of a stale domain mirror", () => {
    const chart = {
      childId: "reina",
      identity: {},
      companion: { presetId: "elli", displayName: "Elli", config: {} },
      companionCare: {},
      economy: {},
      adventureMapProfile: {},
      learningCycle: { homeworkId: "hw-math", lifecycle: "quest_ready", revision: 8 },
      activeSessionPlan: { planId: "canonical-r8" },
      homework: { selectedDomain: "math" },
      sessionPlan: {
        waterfall: { activeByDomain: { math: { planId: "stale-r2" } } },
      },
    } as unknown as ChildChart;

    expect(buildChildExperiencePacket(chart).activeSessionPlan?.planId).toBe("canonical-r8");
  });

  it("carries the chart's sensory sheet so the kiosk can set game sound volume", () => {
    const sensory = { soundEnabled: false, soundVolume: 0.3, soundBrightness: "soft", motion: "calm" };
    const chart = {
      childId: "ila", identity: {}, companion: { presetId: "elli", displayName: "Elli", config: {} },
      companionCare: {}, economy: {}, adventureMapProfile: {}, sensory, activeSessionPlan: null, homework: {},
    } as unknown as ChildChart;

    expect(buildChildExperiencePacket(chart).childChart.sensory).toEqual(sensory);
  });
});
