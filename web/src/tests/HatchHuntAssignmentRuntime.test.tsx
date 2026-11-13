import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NodeConfig } from "../../../src/shared/adventureTypes";
import type { HatchHuntAssignmentConfig } from "../../../src/shared/hatchHuntAssignment";
import { HatchHuntAssignmentLaunch } from "../components/HatchHuntAssignmentLaunch";
import { buildHatchHuntRuntimeQuestions } from "../components/HatchHuntAssignmentAdapter";
import { MossyHatchHuntEncounter } from "../components/HatchHuntEncounter";

vi.mock("../components/CompanionLayer", () => ({
  CompanionLayer: ({ childId }: { childId: string | null }) => (
    <div data-testid="runtime-elli" data-child-id={childId ?? ""}>Elli</div>
  ),
}));

const config: HatchHuntAssignmentConfig = {
  schemaVersion: 1,
  activityId: "hatch-hunt",
  mode: "baseline_assignment",
  encounterId: "hatch:reina:fractions:canonical",
  childId: "reina",
  homeworkId: "hw-math-fractions-canonical",
  domain: "math",
  creatureId: "mossback",
  source: { fingerprint: "worksheet-hash", documentIds: ["worksheet-page-1"] },
  baselineItems: [
    {
      id: "baseline:fraction",
      targetId: "fractions.equal-parts",
      sourceEvidenceIds: ["worksheet-page-1:item-1"],
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
      id: "baseline:whole",
      targetId: "fractions.whole",
      sourceEvidenceIds: ["worksheet-page-1:item-2"],
      exposure: "unseen",
      prompt: "How many fourths make one whole?",
      response: { mode: "numeric", correctValue: 4 },
      timerSeconds: null,
    },
  ],
  verificationItems: [{
    id: "verification:fraction",
    targetId: "fractions.equal-parts",
    sourceEvidenceIds: ["worksheet-page-1:item-3"],
    exposure: "practiced",
    prompt: "Choose another equal-parts fraction.",
    response: {
      mode: "selection",
      options: [{ id: "a", label: "2/4" }, { id: "b", label: "2/3" }],
      correctOptionId: "a",
    },
    timerSeconds: 12,
  }],
  recoveryByTarget: {
    "fractions.equal-parts": [{
      id: "recover:equal-parts",
      prompt: "Look for equal-sized parts, then try again.",
      workedExplanation: "The denominator counts equal parts in the whole.",
    }],
    "fractions.whole": [{
      id: "recover:whole",
      prompt: "Count four equal fourths.",
      workedExplanation: "Four fourths make one whole.",
    }],
  },
  evidencePolicy: {
    purpose: "baseline",
    firstAttemptIndependent: true,
    maximumClaim: "practice_only",
    captureIsAcademicEvidence: false,
  },
};

describe("Hatch Hunt assignment runtime", () => {
  it("carries canonical planner identity into the real encounter and uses authored recovery", () => {
    const node: NodeConfig = {
      id: "hatch-node",
      planId: "plan-1",
      type: "hatch-hunt",
      difficulty: 2,
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      hatchHuntConfig: config,
    };
    const { container } = render(
      <HatchHuntAssignmentLaunch
        node={node}
        childId="reina"
        sendMessage={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    expect(container.querySelector("main.mossy-hatch-chase")).toMatchObject({
      dataset: expect.objectContaining({
        encounterId: "hatch:reina:fractions:canonical",
        childId: "reina",
        domain: "math",
        creatureId: "mossback",
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Choose fern egg" }));
    fireEvent.click(screen.getByRole("button", { name: "1/4" }));
    expect(screen.getByText("Look for equal-sized parts, then try again.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3/4" }));
    expect(screen.getByText("How many fourths make one whole?")).toBeInTheDocument();
  });

  it("never exposes an internal verification id as child-facing chase content", () => {
    render(
      <MossyHatchHuntEncounter
        encounterId="encounter-visible-copy"
        childId="reina"
        childName="Reina"
        domain="math"
        hatchQuestions={buildHatchHuntRuntimeQuestions(config).hatch}
        chaseQuestions={[{
          id: "node:verification:1",
          targetId: "fractions.equal-parts",
          prompt: "Which picture shows equal parts?",
          answers: ["Picture A", "Picture B"],
          correctAnswer: "Picture A",
          seconds: 12,
          recovery: {
            prompt: "Compare the size of every part.",
            answers: ["Picture A", "Picture B"],
            correctAnswer: "Picture A",
            workedAnswer: "Picture A has equal-sized parts.",
          },
        }]}
        testMode
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Capture Screen" }));
    expect(screen.getByText("Which picture shows equal parts?")).toBeInTheDocument();
    expect(screen.queryByText("node:verification:1", { exact: true })).not.toBeInTheDocument();
  });
});
