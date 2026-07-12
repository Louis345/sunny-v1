import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SparkOrbLearningShell } from "../components/SparkOrbLearningShell";
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

function renderReadyShell(onEncounterEvent = vi.fn()) {
  render(
    <SparkOrbLearningShell
      childId="ila"
      childName="Ila"
      companion={elliCompanion}
      phase="ready"
      chargeGoal={3}
      domain="spelling"
      currentTarget="word:because"
      lastMoment="orb_ready"
      orbCount={7}
      onEncounterEvent={onEncounterEvent}
    >
      <div>Spell the word you hear</div>
    </SparkOrbLearningShell>,
  );
  return onEncounterEvent;
}

describe("spark orb keyboard capture path", () => {
  it("launches a sweet-spot throw with hold-Space and release", () => {
    vi.useFakeTimers();
    const onEncounterEvent = renderReadyShell();
    const launchControl = screen.getByTestId("spark-orb-launch-control");

    fireEvent.keyDown(launchControl, { key: " " });
    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute(
      "data-launch-skill",
      "holding",
    );
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "hold_start" }),
    );

    fireEvent.keyUp(launchControl, { key: " " });
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "release_success",
        result: "success",
        hitQuality: "direct",
      }),
    );
    expect(screen.getByText("Perfect throw!")).toBeInTheDocument();
  });

  it("adjusts aim with arrow keys and repeated keydown does not restart the hold", () => {
    vi.useFakeTimers();
    const onEncounterEvent = renderReadyShell();
    const launchControl = screen.getByTestId("spark-orb-launch-control");

    fireEvent.keyDown(launchControl, { key: " " });
    fireEvent.keyDown(launchControl, { key: " ", repeat: true });
    for (let index = 0; index < 4; index += 1) {
      fireEvent.keyDown(launchControl, { key: "ArrowRight" });
    }
    fireEvent.keyUp(launchControl, { key: " " });

    const holdStarts = onEncounterEvent.mock.calls.filter(
      ([event]) => event.type === "hold_start",
    );
    expect(holdStarts).toHaveLength(1);
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "release_success",
        result: "success",
        hitQuality: "near",
      }),
    );
  });

  it("can steer a keyboard throw wide into a miss", () => {
    vi.useFakeTimers();
    const onEncounterEvent = renderReadyShell();
    const launchControl = screen.getByTestId("spark-orb-launch-control");

    fireEvent.keyDown(launchControl, { key: " " });
    for (let index = 0; index < 10; index += 1) {
      fireEvent.keyDown(launchControl, { key: "ArrowRight" });
    }
    fireEvent.keyUp(launchControl, { key: " " });

    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "release_miss", result: "miss-late" }),
    );
  });
});

describe("spark orb live announcements", () => {
  it("announces readiness, misses, and collection through the polite status region", () => {
    vi.useFakeTimers();
    renderReadyShell();
    const liveRegion = screen.getByTestId("spark-orb-live-region");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion).toHaveTextContent("The orb is glowing and ready to launch.");

    const launchControl = screen.getByTestId("spark-orb-launch-control");
    fireEvent.keyDown(launchControl, { key: " " });
    for (let index = 0; index < 10; index += 1) {
      fireEvent.keyDown(launchControl, { key: "ArrowRight" });
    }
    fireEvent.keyUp(launchControl, { key: " " });
    expect(liveRegion).toHaveTextContent(
      "Missed! Answer more questions to recharge the orb.",
    );
  });

  it("announces the struggle and the collection moment during a capture", () => {
    vi.useFakeTimers();
    renderReadyShell();
    const launchControl = screen.getByTestId("spark-orb-launch-control");
    const liveRegion = screen.getByTestId("spark-orb-live-region");

    fireEvent.keyDown(launchControl, { key: " " });
    fireEvent.keyUp(launchControl, { key: " " });
    act(() => {
      vi.advanceTimersByTime(1150);
    });
    expect(liveRegion).toHaveTextContent(
      "Lumipuff is wiggling! Cheer to help the capture.",
    );

    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(liveRegion).toHaveTextContent("Lumipuff joined your collection!");
  });
});
