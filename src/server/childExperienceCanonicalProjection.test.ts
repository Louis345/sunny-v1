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
});
