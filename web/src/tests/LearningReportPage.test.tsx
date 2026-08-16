import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearningReportPage } from "../components/LearningReportPage";

describe("LearningReportPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows one assignment decision using GET requests only", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ assignments: [{ homeworkId: "hw-original", title: "Fractions", domain: "math" }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ report: {
        childId: "reina", homeworkId: "hw-original", status: "interpreted", lifecycle: "awaiting_calibration",
        assignment: { title: "Fractions", domain: "math" },
        assumptions: [{ assumptionId: "a1", claim: "Equal partitioning will transfer.", confidence: 0.7, uncertainty: "Delayed work missing", assessment: { outcome: "rejected", reason: "Returned work contradicted it.", observationIds: ["o1"] } }],
        predictions: [],
        predictionAccuracy: [{ assignment: "Fractions", construct: "math.fractions.equal_partitioning", prediction: "70–90%", actual: "100%", error: "10%", evidenceType: "graded_work", assistance: "unassisted", adjustment: "guided partitioning" }],
        calibrationSummary: { externallyCalibratedPredictions: 1, generalAccuracyClaimPermitted: false, message: "One calibrated prediction is not enough to judge Sunny overall." },
        readiness: { status: "ready_independent", headline: "Sunny believes Reina can complete Fractions independently.", reason: "Confirmed returned work supports the conclusion.", uncertainty: "Limited to equal partitioning.", nextAction: "Complete Fractions independently.", constructIds: ["math.fractions.equal_partitioning"], evidenceIds: ["o1"], predictionEvaluationIds: ["e1"] },
        latestDecision: { status: "revised", reason: "Returned work contradicted the partition assumption.", preserve: ["fraction comparison"], change: ["guided partitioning"], testNext: ["unseen partition"], nextEvidenceRequired: ["delayed work"] },
      } }), { status: 200, headers: { "Content-Type": "application/json" } }));

    render(<LearningReportPage childId="reina" />);
    fireEvent.click(await screen.findByRole("button", { name: /Fractions/i }));

    expect(await screen.findByText("What Sunny believed")).toBeTruthy();
    expect(screen.getByText("Sunny believes Reina can complete Fractions independently.")).toBeTruthy();
    expect(screen.getAllByText("math.fractions.equal_partitioning")).toHaveLength(2);
    expect(screen.getByRole("table", { name: "Prediction accuracy" })).toBeTruthy();
    expect(screen.getByText("One calibrated prediction is not enough to judge Sunny overall.")).toBeTruthy();
    expect(screen.getByText("Returned work contradicted the partition assumption.")).toBeTruthy();
    expect(screen.getAllByText("guided partitioning")).toHaveLength(2);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });
});
