import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMPANION_DEFAULTS, type CompanionConfig } from "../../../src/shared/companionTypes";
import { SparkOrbLearningShell } from "../components/SparkOrbLearningShell";
import type { SparkOrbEncounterPhase } from "../components/SparkOrbEncounterPost";

vi.mock("../components/CompanionLayer", () => ({
  CompanionLayer: () => <div data-testid="mock-companion-layer" />,
}));

vi.mock("../utils/sparkOrbSfx", () => ({
  playSparkOrbSfx: vi.fn(),
}));

const elliCompanion: CompanionConfig = {
  ...COMPANION_DEFAULTS,
  companionId: "elli",
  vrmUrl: "/companions/sample.vrm",
  toggledOff: false,
};

afterEach(() => {
  vi.useRealTimers();
});

function renderFlagship(phase: SparkOrbEncounterPhase): void {
  render(
    <SparkOrbLearningShell
      childId="ila"
      childName="Ila"
      companion={elliCompanion}
      phase={phase}
      chargeGoal={3}
      domain="spelling"
      currentTarget="word:because"
      lastMoment={phase === "ready" ? "orb_ready" : "watching"}
      orbCount={7}
    >
      <div>Complete the word</div>
    </SparkOrbLearningShell>,
  );
}

describe("Spark Orb flagship visual contract", () => {
  it("turns charge progress into a Notice, Try, Prove mastery path", () => {
    renderFlagship("charge-2");

    const path = screen.getByTestId("spark-orb-mastery-path");
    expect(path).toHaveAccessibleName("Learning path: Notice and Try complete, Prove next");
    expect(screen.getByText("NOTICE")).toHaveAttribute("data-complete", "true");
    expect(screen.getByText("TRY")).toHaveAttribute("data-complete", "true");
    expect(screen.getByText("PROVE")).toHaveAttribute("data-current", "true");
  });

  it("renders orb charge as three magical pedestal segments instead of plain dots", () => {
    renderFlagship("charge-2");

    const pedestal = screen.getByTestId("spark-orb-charge-pedestal");
    expect(pedestal).toHaveAccessibleName("Orb charge: 2 of 3 sparks");
    expect(pedestal.querySelectorAll("[data-filled='true']")).toHaveLength(2);
    expect(pedestal.querySelectorAll("[data-filled='false']")).toHaveLength(1);
  });

  it("does not leave a guessed concept or trail visible while no reward is traveling", () => {
    renderFlagship("charge-2");

    expect(screen.queryByTestId("spark-orb-concept-path")).not.toBeInTheDocument();
    expect(screen.queryByText("K")).not.toBeInTheDocument();
  });

  it("uses the evaluated learning unit instead of guessing from the target string", () => {
    vi.useFakeTimers();
    const conceptReward = { target: "word:spark", unit: "r" };
    const props = {
      childId: "ila",
      childName: "Ila",
      companion: elliCompanion,
      chargeGoal: 3,
      domain: "spelling",
      currentTarget: "word:spark",
      lastMoment: "spark_earned" as const,
      orbCount: 7,
      conceptReward,
    };
    const { rerender } = render(
      <SparkOrbLearningShell {...props} phase="charge-1">
        <div>Complete the word</div>
      </SparkOrbLearningShell>,
    );

    rerender(
      <SparkOrbLearningShell {...props} phase="charge-2">
        <div>Complete the word</div>
      </SparkOrbLearningShell>,
    );

    const conceptPath = screen.getByTestId("spark-orb-concept-path");
    expect(conceptPath).toHaveAttribute("data-target", "word:spark");
    expect(conceptPath).toHaveTextContent("R");
    expect(conceptPath).not.toHaveTextContent("K");

    act(() => {
      vi.advanceTimersByTime(901);
    });
    expect(screen.queryByTestId("spark-orb-concept-path")).not.toBeInTheDocument();
  });

  it("shows encounter meaning without turning Elli into the tutor", () => {
    renderFlagship("ready");

    expect(screen.getByTestId("spark-orb-encounter-modifier")).toHaveTextContent(
      "Mystery clue",
    );
    expect(screen.getByTestId("spark-orb-bond-progress")).toHaveAccessibleName(
      "Lumipuff bond progress",
    );
    expect(screen.getByTestId("mock-companion-layer")).toBeInTheDocument();
    expect(screen.queryByText(/Elli says/i)).not.toBeInTheDocument();
  });
});
