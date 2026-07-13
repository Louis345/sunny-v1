import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildInitialEngagementTheory,
  updateEngagementTheoryFromChoiceEvents,
  updateEngagementTheoryFromActivityEvidence,
  writeEngagementTheory,
} from "./engagementTheory";

describe("engagement theory", () => {
  it("creates all supported preference dimensions with an explicit experiment", () => {
    const theory = buildInitialEngagementTheory({
      childId: "demo-pashley",
      domain: "math",
      homeworkId: "hw-math-6b68e575",
      now: new Date("2026-07-11T12:00:00.000Z"),
    });

    expect(Object.keys(theory.dimensions)).toEqual(expect.arrayContaining([
      "visual", "puzzle", "story", "speed", "competition", "control", "novelty", "voice", "calm",
    ]));
    expect(theory.nextExperiment?.variable).toBe("mechanic");
    expect(theory.nextExperiment?.holdConstant).toContain("academic targets");
  });

  it("uses completion and abandonment to update preference evidence instead of treating selection alone as mastery", () => {
    const theory = buildInitialEngagementTheory({ childId: "demo-pashley", domain: "math" });
    const next = updateEngagementTheoryFromChoiceEvents(theory, [
      {
        type: "choice_event",
        version: 1,
        choiceEventId: "choice-1",
        choiceSetId: "routes",
        childId: "demo-pashley",
        context: "baseline_route",
        domain: "math",
        shownOptions: [
          { optionId: "puzzle", activityId: "generated-baseline", label: "Puzzle", purposeLabel: "puzzle", preferenceTraits: ["puzzle", "control"] },
          { optionId: "speed", activityId: "generated-baseline", label: "Speed", purposeLabel: "speed", preferenceTraits: ["speed"] },
        ],
        selectedOptionId: "puzzle",
        skippedOptionIds: ["speed"],
        source: "child_choice",
        eventName: "activity_completed",
        started: true,
        completed: true,
        accuracy: 0.8,
        frustrationScore: 0.1,
        createdAt: "2026-07-11T12:00:00.000Z",
      },
    ]);

    expect(next.dimensions.puzzle.positiveWeight).toBeGreaterThan(0);
    expect(next.dimensions.speed.negativeWeight).toBeGreaterThan(0);
    expect(next.evidence[0]?.kind).toBe("choice");
    expect(next.nextExperiment?.holdConstant).toContain("academic targets");
  });

  it("writes a readable flat-file artifact", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-engagement-theory-"));
    const theory = buildInitialEngagementTheory({ childId: "demo-pashley", domain: "math" });
    const file = writeEngagementTheory("demo-pashley", theory, { rootDir });
    expect(file).toContain("engagement_theory.json");
    expect(JSON.parse(fs.readFileSync(file, "utf8")).theoryId).toBe(theory.theoryId);
  });

  it("keeps activity preference evidence separate from academic accuracy", () => {
    const theory = buildInitialEngagementTheory({ childId: "reina", domain: "math" });
    const next = updateEngagementTheoryFromActivityEvidence(theory, {
      activityId: "generated-baseline",
      contentId: "hw:fact-blaster",
      experimentId: "experiment:fact-blaster",
      dimensions: ["puzzle", "competition"],
      completed: true,
      frustrationScore: 0.1,
      liked: true,
      createdAt: "2026-07-11T12:00:00.000Z",
    });
    expect(next.dimensions.puzzle.positiveWeight).toBeGreaterThan(0);
    expect(next.evidence[0]?.kind).toBe("activity");
    expect(next.evidence[0]?.summary).not.toContain("mastery");
  });

  it("does not let synthetic browser evidence update a child's engagement theory", () => {
    const theory = buildInitialEngagementTheory({ childId: "reina", domain: "math" });
    const next = updateEngagementTheoryFromActivityEvidence(theory, {
      activityId: "generated-baseline",
      contentId: "browser-acceptance:fact-blaster",
      experimentId: "experiment:fact-blaster",
      dimensions: ["puzzle", "competition"],
      completed: true,
      frustrationScore: 0,
      replayRequested: true,
      source: "synthetic_lab",
      createdAt: "2026-07-12T12:00:00.000Z",
    });

    expect(next).toEqual(theory);
  });
});
