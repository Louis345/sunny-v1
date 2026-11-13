import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NodeConfig } from "../../../src/shared/adventureTypes";
import type { HatchHuntAssignmentConfig } from "../../../src/shared/hatchHuntAssignment";
import { HatchHuntAssignmentLaunch } from "../components/HatchHuntAssignmentLaunch";

vi.mock("../components/HatchHuntEncounter", () => ({
  MossyHatchHuntEncounter: (props: {
    onHatchEvent: (event: unknown) => void;
    onChaseEvent: (event: unknown) => void;
    onCaptured: (event: unknown) => void;
  }) => (
    <div>
      <button onClick={() => props.onHatchEvent({
        type: "guardian_answered",
        evidenceClass: "academic_observation",
        masteryClaimAllowed: false,
        questionId: "base-1",
        correct: true,
        response: "3/4",
        latencyMs: 1200,
      })}>Answer baseline</button>
      <button onClick={() => props.onChaseEvent({
        type: "chase_question_answered",
        encounterId: "enc-1",
        evidenceClass: "academic_observation",
        masteryClaimAllowed: false,
        questionId: "verify-1",
        correct: false,
        response: "unequal",
        latencyMs: 900,
        assistance: "none",
        confounds: ["time_pressure"],
      })}>Answer chase</button>
      <button onClick={() => props.onCaptured({
        type: "orb_capture_completed",
        encounterId: "enc-1",
        childId: "reina",
        source: "hatch_hunt_orb_capture",
        capturedAt: "2026-08-02T12:00:00.000Z",
        hitDistance: 4,
        reward: { creatureId: "mossback" },
      })}>Capture</button>
    </div>
  ),
}));

const config: HatchHuntAssignmentConfig = {
  schemaVersion: 1,
  activityId: "hatch-hunt",
  mode: "baseline_assignment",
  encounterId: "enc-1",
  childId: "reina",
  homeworkId: "homework:hash-1",
  domain: "math",
  creatureId: "mossback",
  source: { fingerprint: "hash-1", documentIds: ["doc-1"] },
  baselineItems: [
    {
      id: "base-1",
      targetId: "fractions.equal-parts",
      sourceEvidenceIds: ["source-1"],
      exposure: "unseen",
      prompt: "Which fraction is shaded?",
      response: {
        mode: "selection",
        options: [{ id: "a", label: "3/4" }, { id: "b", label: "1/4" }],
        correctOptionId: "a",
      },
      timerSeconds: null,
    },
    {
      id: "base-2",
      targetId: "fractions.whole",
      sourceEvidenceIds: ["source-1"],
      exposure: "unseen",
      prompt: "How many fourths make a whole?",
      response: { mode: "numeric", correctValue: 4 },
      timerSeconds: null,
    },
  ],
  verificationItems: [{
    id: "verify-1",
    targetId: "fractions.equal-parts",
    sourceEvidenceIds: ["source-1"],
    exposure: "unseen",
    prompt: "Why are the pieces equal?",
    response: { mode: "text", acceptedAnswers: ["equal shares"] },
    timerSeconds: 12,
  }],
  recoveryByTarget: {
    "fractions.equal-parts": [{ id: "r1", prompt: "Think equal shares.", workedExplanation: "Equal shares have the same size." }],
    "fractions.whole": [{ id: "r2", prompt: "Count four fourths.", workedExplanation: "Four fourths make one whole." }],
  },
  evidencePolicy: {
    purpose: "baseline",
    firstAttemptIndependent: true,
    maximumClaim: "practice_only",
    captureIsAcademicEvidence: false,
  },
};

describe("HatchHuntAssignmentLaunch", () => {
  it("emits provenance-rich practice observations and completes once capture succeeds", () => {
    const sendMessage = vi.fn();
    const onComplete = vi.fn();
    const node = {
      id: "hatch-node",
      planId: "plan-1",
      type: "hatch-hunt",
      difficulty: 2,
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      hatchHuntConfig: config,
    } satisfies NodeConfig;
    render(<HatchHuntAssignmentLaunch node={node} childId="reina" sendMessage={sendMessage} onComplete={onComplete} />);

    fireEvent.click(screen.getByText("Answer baseline"));
    fireEvent.click(screen.getByText("Answer chase"));
    fireEvent.click(screen.getByText("Capture"));

    const attempts = sendMessage.mock.calls
      .filter(([type]) => type === "game_event")
      .map(([, payload]) => payload?.event)
      .filter((event) => event?.type === "attempt_event");
    expect(attempts[0]?.payload).toEqual(expect.objectContaining({
      domain: "math",
      target: "fractions.equal-parts",
      attemptedValue: "3/4",
      responseTimeMs: 1200,
      scaffoldLevel: 0,
    }));
    const serialized = JSON.stringify(sendMessage.mock.calls);
    expect(serialized).toContain("fractions.equal-parts");
    expect(serialized).toContain("sourceEvidenceIds");
    expect(serialized).toContain("practice_only");
    expect(serialized).toContain("hatch_hunt_capture");
    expect(serialized).toContain("game_complete");
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      accuracy: 0.5,
      targetResults: expect.arrayContaining([
        expect.objectContaining({
          target: "fractions.equal-parts",
          attemptedValue: "3/4",
          responseTime_ms: 1200,
          scaffoldLevel: 0,
        }),
      ]),
    }));
  });
});
