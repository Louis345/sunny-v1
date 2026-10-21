import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SparkOrbLearningShell } from "../components/SparkOrbLearningShell";
import type { OrbCaptureCompletedEvent } from "../components/capturedMonsterReward";
import type { SparkOrbEncounterPhase } from "../components/SparkOrbEncounterPost";
import { COMPANION_DEFAULTS, type CompanionConfig } from "../../../src/shared/companionTypes";

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

function shellAt(
  phase: SparkOrbEncounterPhase,
  options: {
    captureRandom?: () => number;
    conceptReward?: { target: string; unit: string };
    onCaptureCompleted?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return (
    <SparkOrbLearningShell
      childId="ila"
      childName="Ila"
      companion={elliCompanion}
      phase={phase}
      chargeGoal={3}
      domain="spelling"
      currentTarget="word:because"
      conceptReward={options.conceptReward}
      lastMoment="watching"
      orbCount={7}
      captureRandom={options.captureRandom}
      onCaptureCompleted={options.onCaptureCompleted}
    >
      <div>problem</div>
    </SparkOrbLearningShell>
  );
}

function flickDirect(): void {
  const launchControl = screen.getByTestId("spark-orb-launch-control");
  fireEvent.pointerDown(launchControl, { clientX: 320, clientY: 620 });
  fireEvent.pointerMove(launchControl, { clientX: 338, clientY: 450 });
  fireEvent.pointerUp(launchControl, { clientX: 338, clientY: 450 });
}

function flickNear(): void {
  const launchControl = screen.getByTestId("spark-orb-launch-control");
  fireEvent.pointerDown(launchControl, { clientX: 320, clientY: 620 });
  fireEvent.pointerMove(launchControl, { clientX: 380, clientY: 450 });
  fireEvent.pointerUp(launchControl, { clientX: 380, clientY: 450 });
}

describe("spark orb learning-moment juice", () => {
  it("flies a spark from the problem panel to the orb when a charge is earned", () => {
    const { rerender } = render(shellAt("charge-1"));
    expect(screen.queryByTestId("spark-orb-spark-flight")).not.toBeInTheDocument();

    rerender(shellAt("charge-2"));
    expect(screen.getByTestId("spark-orb-spark-flight")).toBeInTheDocument();
  });

  it("never exposes a raw answer letter inside the decorative spark flight", () => {
    const { rerender } = render(shellAt("charge-1"));
    rerender(shellAt("charge-2", {
      conceptReward: { target: "word:spark", unit: "K" },
    }));

    expect(screen.getByTestId("spark-orb-concept-path")).toBeInTheDocument();
    expect(screen.queryByText("K")).not.toBeInTheDocument();
  });

  it("does not fire the spark flight when charge resets after a spend", () => {
    const { rerender } = render(shellAt("charge-2"));
    rerender(shellAt("idle"));
    expect(screen.queryByTestId("spark-orb-spark-flight")).not.toBeInTheDocument();
  });

  it("awards three stars and the word hook on a direct capture", () => {
    vi.useFakeTimers();
    const onCaptureCompleted = vi.fn();
    render(shellAt("ready", { captureRandom: () => 0.9, onCaptureCompleted }));

    flickDirect();
    act(() => {
      vi.advanceTimersByTime(2200);
    });

    expect(screen.getByLabelText("3 star throw")).toBeInTheDocument();
    expect(
      screen.getByText(/loves the word “because”!/),
    ).toBeInTheDocument();
    const card = screen.getByRole("dialog", { name: /added to collection/i });
    expect(card).toHaveAttribute("data-shiny", "false");

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    const completed = onCaptureCompleted.mock.calls[0][0] as OrbCaptureCompletedEvent;
    expect(completed.reward.inventoryRecord.starTier).toBe(3);
    expect(completed.reward.inventoryRecord.shiny).toBe(false);
    expect(completed.reward.inventoryRecord.bond).toBe(30);
  });

  it("rolls a shiny bonus from the injected random source", () => {
    vi.useFakeTimers();
    const onCaptureCompleted = vi.fn();
    render(shellAt("ready", { captureRandom: () => 0.01, onCaptureCompleted }));

    flickDirect();
    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(screen.getByText("Shiny friend found!")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    const completed = onCaptureCompleted.mock.calls[0][0] as OrbCaptureCompletedEvent;
    expect(completed.reward.inventoryRecord.shiny).toBe(true);
  });

  it("marks a capture after a breakout as a comeback", () => {
    vi.useFakeTimers();
    const onCaptureCompleted = vi.fn();
    const rolls = [0, 0.9, 0.9];
    let rollIndex = 0;
    const captureRandom = () => rolls[Math.min(rollIndex++, rolls.length - 1)] ?? 0.9;
    const { rerender } = render(shellAt("ready", { captureRandom, onCaptureCompleted }));

    flickNear();
    act(() => {
      vi.advanceTimersByTime(1990);
    });

    rerender(shellAt("idle", { captureRandom, onCaptureCompleted }));
    rerender(shellAt("ready", { captureRandom, onCaptureCompleted }));
    flickNear();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText("Never gave up!")).toBeInTheDocument();
    expect(screen.getByLabelText("2 star throw")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    const completed = onCaptureCompleted.mock.calls[0][0] as OrbCaptureCompletedEvent;
    expect(completed.reward.inventoryRecord.comeback).toBe(true);
    expect(completed.reward.inventoryRecord.starTier).toBe(2);
  });
});
