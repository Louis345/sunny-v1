import { describe, expect, it } from "vitest";
import { getChildChart } from "../profiles/childChart";
import { planBaselineShellsForHomework, shouldTriggerBaselineGeneration } from "./baselinePlannerIntegration";

describe("baselinePlannerIntegration", () => {
  it("prefers existing shells for time/money homework", () => {
    const chart = getChildChart("demo-pashley");
    const decision = planBaselineShellsForHomework({
      chart,
      homeworkId: "hw-math-1",
      domain: "math",
      title: "Telling Time and Money",
      conceptText: "clock and coins",
    });
    expect(shouldTriggerBaselineGeneration(decision)).toBe(false);
    expect(decision.preferredNodeTypes).toEqual(expect.arrayContaining(["clock-game", "coin-counter"]));
  });
});
