import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSparkOrbStrugglePlan,
  sparkOrbBreakoutChance,
  SparkOrbLearningShell,
} from "../components/SparkOrbLearningShell";
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

function renderReadyShell(options: {
  captureRandom: () => number;
  onEncounterEvent: ReturnType<typeof vi.fn>;
  phase?: "ready" | "idle";
}) {
  return render(
    <SparkOrbLearningShell
      childId="ila"
      childName="Ila"
      companion={elliCompanion}
      phase={options.phase ?? "ready"}
      chargeGoal={3}
      domain="spelling"
      currentTarget="word:because"
      lastMoment="orb_ready"
      orbCount={7}
      captureRandom={options.captureRandom}
      onEncounterEvent={options.onEncounterEvent}
    >
      <div>Spell the word you hear</div>
    </SparkOrbLearningShell>,
  );
}

function shellProps(options: {
  captureRandom: () => number;
  onEncounterEvent: ReturnType<typeof vi.fn>;
  phase: "ready" | "idle";
}) {
  return (
    <SparkOrbLearningShell
      childId="ila"
      childName="Ila"
      companion={elliCompanion}
      phase={options.phase}
      chargeGoal={3}
      domain="spelling"
      currentTarget="word:because"
      lastMoment="orb_ready"
      orbCount={7}
      captureRandom={options.captureRandom}
      onEncounterEvent={options.onEncounterEvent}
    >
      <div>Spell the word you hear</div>
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

describe("spark orb capture struggle", () => {
  it("plans a single legacy-timed pulse for direct hits and never allows breakout", () => {
    const plan = buildSparkOrbStrugglePlan("direct", "uncommon");
    expect(plan.pulseCount).toBe(1);
    expect(plan.resolveAtMs).toBe(1250);
    expect(plan.shrinkAtMs).toBe(1250);
    expect(plan.lockAtMs).toBe(1800);
    expect(plan.revealAtMs).toBe(2150);
    expect(plan.settleAtMs).toBe(3650);
    expect(plan.baseBreakoutChance).toBe(0);
  });

  it("gives near hits more suspense pulses and rare creatures the most", () => {
    expect(buildSparkOrbStrugglePlan("near", "uncommon").pulseCount).toBe(2);
    expect(buildSparkOrbStrugglePlan("near", "rare").pulseCount).toBe(3);
    expect(buildSparkOrbStrugglePlan("near", "uncommon").baseBreakoutChance).toBeGreaterThan(0);
  });

  it("cheering reduces breakout chance and pity removes it entirely", () => {
    expect(sparkOrbBreakoutChance(0.35, 0, 0)).toBeCloseTo(0.35);
    expect(sparkOrbBreakoutChance(0.35, 3, 0)).toBe(0);
    expect(sparkOrbBreakoutChance(0.35, 0, 2)).toBe(0);
  });

  it("emits capture_struggle before shrinking on a direct hit without shifting the legacy timeline", () => {
    vi.useFakeTimers();
    const onEncounterEvent = vi.fn();
    renderReadyShell({ captureRandom: () => 0, onEncounterEvent });

    flickDirect();
    act(() => {
      vi.advanceTimersByTime(1150);
    });
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "capture_struggle",
        strugglePulse: 1,
        strugglePulseCount: 1,
      }),
    );
    expect(onEncounterEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "capture_shrink" }),
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "capture_shrink" }),
    );
    expect(onEncounterEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "capture_breakout" }),
    );
  });

  it("lets a near-hit creature break out, keeping it visible and protecting one charge", () => {
    vi.useFakeTimers();
    const onEncounterEvent = vi.fn();
    renderReadyShell({ captureRandom: () => 0, onEncounterEvent });

    flickNear();
    act(() => {
      vi.advanceTimersByTime(1990);
    });

    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "capture_breakout",
        chargeCount: 1,
        orbCount: 6,
        consecutiveBreakouts: 1,
      }),
    );
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "recharge_needed", chargeCount: 1 }),
    );
    expect(onEncounterEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "capture_shrink" }),
    );
    expect(screen.getByTestId("spark-orb-creature")).toHaveAttribute(
      "data-capture-motion",
      "free",
    );
    expect(screen.getByText("Charge 1 / 3")).toBeInTheDocument();
    expect(screen.getByLabelText("6 Sunny orbs left")).toBeInTheDocument();
  });

  it("captures a near hit when the breakout roll fails", () => {
    vi.useFakeTimers();
    const onEncounterEvent = vi.fn();
    renderReadyShell({ captureRandom: () => 0.9, onEncounterEvent });

    flickNear();
    act(() => {
      vi.advanceTimersByTime(4390);
    });

    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "capture_struggle", strugglePulse: 2, strugglePulseCount: 2 }),
    );
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "capture_lock" }),
    );
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "collection_settled" }),
    );
    expect(onEncounterEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "capture_breakout" }),
    );
  });

  it("counts cheers during the struggle and lets them prevent a breakout", () => {
    vi.useFakeTimers();
    const onEncounterEvent = vi.fn();
    renderReadyShell({ captureRandom: () => 0.2, onEncounterEvent });

    flickNear();
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    const cheerControl = screen.getByTestId("spark-orb-cheer-control");
    fireEvent.click(cheerControl);
    fireEvent.click(cheerControl);
    fireEvent.click(cheerControl);
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cheer", cheerCount: 3 }),
    );

    act(() => {
      vi.advanceTimersByTime(3200);
    });
    expect(onEncounterEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "capture_breakout" }),
    );
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "collection_settled" }),
    );
  });

  it("forces a capture after two consecutive breakouts (pity rule)", () => {
    vi.useFakeTimers();
    const onEncounterEvent = vi.fn();
    const { rerender } = renderReadyShell({ captureRandom: () => 0, onEncounterEvent });

    const relaunch = () => {
      rerender(shellProps({ captureRandom: () => 0, onEncounterEvent, phase: "idle" }));
      rerender(shellProps({ captureRandom: () => 0, onEncounterEvent, phase: "ready" }));
    };

    flickNear();
    act(() => {
      vi.advanceTimersByTime(1990);
    });
    relaunch();
    flickNear();
    act(() => {
      vi.advanceTimersByTime(1990);
    });
    const breakouts = onEncounterEvent.mock.calls.filter(
      ([event]) => event.type === "capture_breakout",
    );
    expect(breakouts).toHaveLength(2);

    relaunch();
    flickNear();
    act(() => {
      vi.advanceTimersByTime(4390);
    });
    expect(
      onEncounterEvent.mock.calls.filter(([event]) => event.type === "capture_breakout"),
    ).toHaveLength(2);
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "collection_settled" }),
    );
  });
});
