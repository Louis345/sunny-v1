import { describe, expect, it } from "vitest";
import { selectTargetedPracticePlan } from "./targetedPracticeSelector";

describe("selectTargetedPracticePlan", () => {
  it("drops mastered targets and keeps fragile or slow targets for the next node", () => {
    const plan = selectTargetedPracticePlan({
      nodeId: "n-word-radar",
      nodeType: "word-radar",
      domain: "spelling",
      targets: ["shiny", "slowly", "lucky", "neatly"],
      targetResults: [
        { target: "shiny", correct: true, attempts: 1, responseTime_ms: 900 },
        {
          target: "slowly",
          correct: false,
          attempts: 2,
          attemptedValue: "sloly",
          responseTime_ms: 4200,
        },
        { target: "lucky", correct: true, attempts: 2, responseTime_ms: 3600 },
        { target: "neatly", correct: true, attempts: 1, responseTime_ms: 850 },
      ],
    });

    expect(plan.masteredTargets).toEqual(["shiny", "neatly"]);
    expect(plan.nextTargets).toEqual(["slowly", "lucky"]);
    expect(plan.buckets.fragile).toEqual(["slowly"]);
    expect(plan.buckets.known_but_slow).toEqual(["lucky"]);
    expect(plan.status).toBe("ready");
  });

  it("does not pull unattempted targets into the next node by default", () => {
    const plan = selectTargetedPracticePlan({
      nodeId: "n-word-radar",
      nodeType: "word-radar",
      targets: ["able", "behind", "common"],
      targetResults: [
        { target: "able", correct: true, attempts: 1, responseTime_ms: 700 },
      ],
    });

    expect(plan.masteredTargets).toEqual(["able"]);
    expect(plan.nextTargets).toEqual([]);
    expect(plan.unattemptedTargets).toEqual(["behind", "common"]);
  });

  it("can build a plan from correct and missed word lists when raw target rows are unavailable", () => {
    const plan = selectTargetedPracticePlan({
      nodeId: "n-legacy-game",
      nodeType: "spell-check",
      targets: ["sunny", "messy", "whole"],
      correctWords: ["sunny"],
      missedWords: ["messy", "whole"],
    });

    expect(plan.masteredTargets).toEqual(["sunny"]);
    expect(plan.nextTargets).toEqual(["messy", "whole"]);
  });
});
