import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeSparkOrbLaunchPhysics,
  SparkOrbLearningShell,
} from "../components/SparkOrbLearningShell";
import {
  nextSparkOrbDifficultyLevel,
  sparkOrbDifficultyParams,
  sparkOrbDriftOffsetX,
} from "../components/sparkOrbDifficulty";
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

describe("spark orb adaptive difficulty", () => {
  it("shifts the capture window with the creature's drift so aim must lead the target", () => {
    const centeredAimStillTarget = computeSparkOrbLaunchPhysics({ pullX: 12, pullY: 178 });
    expect(centeredAimStillTarget.hitQuality).toBe("direct");

    const centeredAimMovedTarget = computeSparkOrbLaunchPhysics({
      pullX: 12,
      pullY: 178,
      targetOffsetX: 130,
    });
    expect(centeredAimMovedTarget.result).not.toBe("success");

    const leadingAimMovedTarget = computeSparkOrbLaunchPhysics({
      pullX: 158,
      pullY: 178,
      targetOffsetX: 130,
    });
    expect(leadingAimMovedTarget.hitQuality).toBe("direct");
  });

  it("shrinks the capture radius as difficulty rises", () => {
    expect(computeSparkOrbLaunchPhysics({ pullX: 62, pullY: 178 }).result).toBe("success");
    expect(
      computeSparkOrbLaunchPhysics({ pullX: 62, pullY: 178, captureRadius: 40 }).result,
    ).not.toBe("success");
  });

  it("steps the ladder up after three straight successes and down after two straight misses", () => {
    expect(nextSparkOrbDifficultyLevel(0, [true, true, true])).toBe(1);
    expect(nextSparkOrbDifficultyLevel(1, [true, true, false])).toBe(1);
    expect(nextSparkOrbDifficultyLevel(1, [true, false, false])).toBe(0);
    expect(nextSparkOrbDifficultyLevel(0, [false, false])).toBe(0);
    expect(nextSparkOrbDifficultyLevel(4, [true, true, true])).toBe(4);
    expect(nextSparkOrbDifficultyLevel(0, [true, false, true])).toBe(0);
  });

  it("maps difficulty levels to tighter radii and wider drift", () => {
    const easy = sparkOrbDifficultyParams(0);
    const hard = sparkOrbDifficultyParams(4);
    expect(easy.captureRadius).toBe(82);
    expect(hard.captureRadius).toBeLessThan(easy.captureRadius);
    expect(hard.driftAmpScale).toBeGreaterThan(easy.driftAmpScale);
    expect(sparkOrbDifficultyParams(99).level).toBe(4);
    expect(sparkOrbDifficultyParams(-3).level).toBe(0);
  });

  it("computes drift as a sine that starts centered", () => {
    expect(sparkOrbDriftOffsetX(0, 0, 40, 4000)).toBeCloseTo(0);
    expect(sparkOrbDriftOffsetX(1000, 0, 40, 4000)).toBeCloseTo(40);
    expect(sparkOrbDriftOffsetX(3000, 0, 40, 4000)).toBeCloseTo(-40);
    expect(sparkOrbDriftOffsetX(500, 0, 0, 4000)).toBe(0);
  });

  it("marks the creature as drifting in ready phase and includes difficulty evidence in release events", () => {
    vi.useFakeTimers();
    const onEncounterEvent = vi.fn();
    let clock = 0;

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
        driftNow={() => clock}
        onEncounterEvent={onEncounterEvent}
      >
        <div>Spell the word you hear</div>
      </SparkOrbLearningShell>,
    );

    expect(screen.getByTestId("spark-orb-creature")).toHaveAttribute(
      "data-drifting",
      "true",
    );

    // Quarter of the playful drift period (3200ms * 0.6 scale keeps amp 28px)
    clock = 800;
    const launchControl = screen.getByTestId("spark-orb-launch-control");
    fireEvent.pointerDown(launchControl, { clientX: 320, clientY: 620 });
    fireEvent.pointerMove(launchControl, { clientX: 338, clientY: 450 });
    fireEvent.pointerUp(launchControl, { clientX: 338, clientY: 450 });

    const release = onEncounterEvent.mock.calls
      .map(([event]) => event)
      .find((event) => event.type === "release_success" || event.type === "release_miss");
    expect(release).toBeDefined();
    expect(release.difficultyLevel).toBe(0);
    expect(release.captureRadius).toBe(82);
    expect(release.driftOffsetX).toBe(28);
  });

  it("grants a rescue orb when the orb pouch is empty at ready", () => {
    const onEncounterEvent = vi.fn();
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
        orbCount={0}
        onEncounterEvent={onEncounterEvent}
      >
        <div>Spell the word you hear</div>
      </SparkOrbLearningShell>,
    );

    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "orb_granted", orbCount: 1 }),
    );
    expect(screen.getByLabelText("1 Sunny orbs left")).toBeInTheDocument();
  });
});
