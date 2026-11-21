import { describe, expect, it } from "vitest";
import { plannerDecisionView, plannerObservationView } from "./plannerEvidenceView";

describe("plannerEvidenceView: what the Planner reads, never what the chart keeps", () => {
  it("replaces a past decision's evidence ID list with its count", () => {
    const decision = { decisionId: "d1", reason: "Because.", evidenceIds: ["e1", "e2", "e3"], predictionEvaluationIds: ["p1"] };
    const view = plannerDecisionView(decision);
    expect(view).toEqual({ decisionId: "d1", reason: "Because.", evidenceCount: 3, predictionEvaluationIds: ["p1"] });
    expect(decision.evidenceIds).toEqual(["e1", "e2", "e3"]);
  });

  it("drops operational codes from an attempt's confounds and keeps every learning fact", () => {
    const observation = { observationId: "o1", confounds: ["word_id:w1", "first_response", "assistance_hinted", "measurement_role:practice",
      "artifact_hash:0123456789abcdef", "launch_id:L1", "session_id:S1"] };
    const view = plannerObservationView(observation);
    expect(view.confounds).toEqual(["word_id:w1", "first_response", "assistance_hinted", "measurement_role:practice", "session_id:S1"]);
    expect(observation.confounds).toHaveLength(7);
  });
});
