import { describe, expect, it } from "vitest";
import {
  getVisualStudioBrief,
  visualStudioBriefs,
} from "../components/VisualExplainer/studioBriefs";
import { validateVisualStudioBrief } from "../components/VisualExplainer/studioBriefSchema";

describe("Visual Explainer studio briefs", () => {
  it("connects each visual intervention to a recall game and evidence writes", () => {
    expect(Object.keys(visualStudioBriefs)).toEqual(["erosion", "red-blood-cells"]);

    for (const id of Object.keys(visualStudioBriefs) as Array<keyof typeof visualStudioBriefs>) {
      const brief = validateVisualStudioBrief(getVisualStudioBrief(id));

      expect(brief.intervention.type).toBe("visual-explainer");
      expect(brief.intervention.template).toBe(brief.concept.mentalModel);
      expect(brief.recall.type).toBe("co-op-quiz");
      expect(brief.recall.sourceInterventionId).toBe(brief.intervention.id);
      expect(brief.recall.questions.length).toBeGreaterThan(0);
      expect(brief.evidence.writes).toEqual(
        expect.arrayContaining([
          "activity_target_result",
          "activity_complete",
          "recall_result",
        ]),
      );

      for (const question of brief.recall.questions) {
        expect(brief.concept.evidenceTargets).toContain(question.targetConcept);
      }
    }
  });

  it("rejects studio briefs without a real recall game", () => {
    const brief = getVisualStudioBrief("erosion");

    expect(() =>
      validateVisualStudioBrief({
        ...brief,
        recall: {
          ...brief.recall,
          questions: [],
        },
      }),
    ).toThrow();
  });

  it("keeps misconception tags available from visual prediction into recall", () => {
    const erosion = validateVisualStudioBrief(getVisualStudioBrief("erosion"));

    expect(erosion.concept.misconceptions).toContain("rocks_disappear");
    expect(erosion.recall.questions.some((question) => question.misconception === "rocks_disappear"))
      .toBe(true);
  });
});
