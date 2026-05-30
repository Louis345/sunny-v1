import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOrbCompanionAnchorContext,
  computeSparkOrbLaunchPhysics,
  SparkOrbLearningShell,
} from "../components/SparkOrbLearningShell";
import { COMPANION_DEFAULTS, type CompanionConfig } from "../../../src/shared/companionTypes";

const playSparkOrbSfxMock = vi.hoisted(() => vi.fn());

vi.mock("../components/CompanionLayer", () => ({
  CompanionLayer: ({
    childId,
    companion,
    companionBehavior,
    speechBubbleText,
  }: {
    childId: string | null;
    companion: { companionId?: string } | null;
    companionBehavior?: { emote?: string } | null;
    speechBubbleText?: string | null;
  }) => (
    <div
      data-testid="mock-companion-layer"
      data-child-id={childId ?? ""}
      data-companion-id={companion?.companionId ?? ""}
      data-emote={companionBehavior?.emote ?? ""}
    >
      {speechBubbleText}
    </div>
  ),
}));

vi.mock("../utils/sparkOrbSfx", () => ({
  playSparkOrbSfx: playSparkOrbSfxMock,
}));

const elliCompanion: CompanionConfig = {
  ...COMPANION_DEFAULTS,
  companionId: "elli",
  vrmUrl: "/companions/sample.vrm",
  expressions: {
    idle: "neutral",
    happy: "happy",
    thinking: "lookDown",
    celebrating: "happy",
    concerned: "sad",
    winking: "blinkLeft",
    surprised: "surprised",
    angry: "angry",
    blink: "blink",
  },
  faceCamera: {
    position: [0, 1.4, 0.8] as [number, number, number],
    target: [0, 1.4, 0] as [number, number, number],
  },
  dopamineGames: ["asteroid"],
  sensitivity: {
    ...COMPANION_DEFAULTS.sensitivity,
    correct_answer: 0.8,
    wrong_answer: 0.6,
    idle_too_long: 0.4,
    mastery_unlock: 1,
  },
  idleFrequency_ms: 20_000,
  randomMomentProbability: 0.1,
  toggledOff: false,
};

afterEach(() => {
  playSparkOrbSfxMock.mockClear();
  vi.useRealTimers();
});

function flickCleanLaunch(): void {
  const launchControl = screen.getByTestId("spark-orb-launch-control");
  fireEvent.pointerDown(launchControl, { clientX: 320, clientY: 620 });
  fireEvent.pointerMove(launchControl, { clientX: 338, clientY: 450 });
  fireEvent.pointerUp(launchControl, { clientX: 338, clientY: 450 });
}

function flickWeakLaunch(): void {
  const launchControl = screen.getByTestId("spark-orb-launch-control");
  fireEvent.pointerDown(launchControl, { clientX: 320, clientY: 620 });
  fireEvent.pointerMove(launchControl, { clientX: 520, clientY: 590 });
  fireEvent.pointerUp(launchControl, { clientX: 520, clientY: 590 });
}

describe("SparkOrbLearningShell", () => {
  it("scores launch quality from a deterministic projectile arc", () => {
    const centeredArc = computeSparkOrbLaunchPhysics({ pullX: 12, pullY: 178 });
    const closeArc = computeSparkOrbLaunchPhysics({ pullX: 62, pullY: 178 });
    const wideArc = computeSparkOrbLaunchPhysics({ pullX: 148, pullY: 178 });

    expect(centeredArc.result).toBe("success");
    expect(centeredArc.hitQuality).toBe("direct");
    expect(centeredArc.hitDistance).toBeLessThan(closeArc.hitDistance);
    expect(centeredArc.launchScale).toBe(1);
    expect(centeredArc.peakScale).toBeLessThan(centeredArc.launchScale);
    expect(centeredArc.flightScale).toBeLessThan(centeredArc.peakScale);
    expect(centeredArc.impactScale).toBeLessThan(centeredArc.flightScale);
    expect(closeArc.hitQuality).toBe("near");
    expect(computeSparkOrbLaunchPhysics({ pullX: 62, pullY: 96 })).toMatchObject({
      result: "success",
      hitQuality: "near",
    });
    expect(wideArc.result).toBe("miss-late");
    expect(wideArc.hitQuality).toBe("wide");
  });

  it("renders learning children beside the orb with the companion portrait anchored near the orb", () => {
    render(
      <SparkOrbLearningShell
        childId="ila"
        childName="Ila"
        companion={elliCompanion}
        phase="charge-2"
        chargeGoal={3}
        domain="spelling"
        currentTarget="because"
        lastMoment="spark_earned"
      >
        <div>Spell the word you hear</div>
      </SparkOrbLearningShell>,
    );

    expect(screen.getByLabelText("Learning problem panel")).toHaveTextContent(
      "Spell the word you hear",
    );
    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute(
      "data-phase",
      "charge-2",
    );
    expect(screen.queryByLabelText("Companion travel buddy")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Companion portrait near orb")).toContainElement(
      screen.getByTestId("mock-companion-layer"),
    );
    expect(screen.getByTestId("mock-companion-layer")).toHaveAttribute("data-child-id", "ila");
    expect(screen.getByTestId("mock-companion-layer")).toHaveAttribute(
      "data-companion-id",
      "elli",
    );
  });

  it("builds companion anchor context as travel-buddy context instead of tutor authority", () => {
    expect(
      buildOrbCompanionAnchorContext({
        childId: "ila",
        childName: "Ila",
        companionId: "elli",
        companionName: "Elli",
        phase: "ready",
        chargeCount: 3,
        chargeGoal: 3,
        domain: "reading",
        currentTarget: "question:q-greenhouse",
        lastMoment: "orb_ready",
        allowedRole: "emote_and_tiny_reaction",
      }),
    ).toMatchObject({
      source: "orb_learning_shell",
      role: "travel_buddy",
      childId: "ila",
      childName: "Ila",
      companion: "elli",
      companionName: "Elli",
      phase: "ready",
      chargeCount: 3,
      chargeGoal: 3,
      domain: "reading",
      currentTarget: "question:q-greenhouse",
      lastMoment: "orb_ready",
      allowedRole: "emote_and_tiny_reaction",
      disallowedRole: "tutor_scoring_or_mastery_claims",
    });
  });

  it("lets kids grab the orb itself without visible control instructions", () => {
    vi.useFakeTimers();
    const onEncounterEvent = vi.fn();

    render(
      <SparkOrbLearningShell
        childId="ila"
        childName="Ila"
        companion={elliCompanion}
        phase="ready"
        chargeGoal={3}
        domain="spelling"
        currentTarget="because"
        lastMoment="orb_ready"
        onEncounterEvent={onEncounterEvent}
      >
        <div>Spell the word you hear</div>
      </SparkOrbLearningShell>,
    );

    const launchControl = screen.getByTestId("spark-orb-launch-control");
    expect(launchControl).toHaveAttribute("aria-label", "Grab the orb to aim and launch");
    expect(screen.queryByText("Flick up")).not.toBeInTheDocument();
    expect(screen.queryByText("Aim up, then release")).not.toBeInTheDocument();
    expect(screen.queryByText("Release in the spark zone")).not.toBeInTheDocument();

    fireEvent.pointerDown(launchControl, { clientX: 320, clientY: 620 });

    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute(
      "data-launch-aim",
      "aiming",
    );
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "hold_start", phase: "ready" }),
    );
  });

  it("requires a skillful flick-up aim before launch succeeds", () => {
    vi.useFakeTimers();
    const onEncounterEvent = vi.fn();

    render(
      <SparkOrbLearningShell
        childId="ila"
        childName="Ila"
        companion={elliCompanion}
        phase="ready"
        chargeGoal={3}
        domain="spelling"
        currentTarget="because"
        lastMoment="orb_ready"
        onEncounterEvent={onEncounterEvent}
      >
        <div>Spell the word you hear</div>
      </SparkOrbLearningShell>,
    );

    const launchControl = screen.getByTestId("spark-orb-launch-control");

    fireEvent.pointerDown(launchControl, { clientX: 320, clientY: 620 });
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "hold_start", phase: "ready" }),
    );
    fireEvent.pointerMove(launchControl, { clientX: 338, clientY: 450 });
    fireEvent.pointerUp(launchControl, { clientX: 338, clientY: 450 });

    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute(
      "data-launch-skill",
      "success",
    );
    expect(screen.getByText("Clean launch")).toBeInTheDocument();
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "release_success",
        result: "success",
        hitQuality: "direct",
        hitDistance: expect.any(Number),
      }),
    );
  });

  it("launches from a flick-up aim gesture with enough upward pull", () => {
    vi.useFakeTimers();
    const onEncounterEvent = vi.fn();

    render(
      <SparkOrbLearningShell
        childId="ila"
        childName="Ila"
        companion={elliCompanion}
        phase="ready"
        chargeGoal={3}
        domain="spelling"
        currentTarget="because"
        lastMoment="orb_ready"
        onEncounterEvent={onEncounterEvent}
      >
        <div>Spell the word you hear</div>
      </SparkOrbLearningShell>,
    );

    const launchControl = screen.getByTestId("spark-orb-launch-control");

    fireEvent.pointerDown(launchControl, { clientX: 320, clientY: 620 });
    fireEvent.pointerMove(launchControl, { clientX: 338, clientY: 450 });
    fireEvent.pointerUp(launchControl, { clientX: 338, clientY: 450 });

    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute(
      "data-launch-skill",
      "success",
    );
    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute(
      "data-launch-aim",
      "clean",
    );
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "release_success", result: "success" }),
    );
  });

  it("spends the charged orb on a missed release and asks for more answers to recharge", () => {
    vi.useFakeTimers();
    const onEncounterEvent = vi.fn();

    render(
      <SparkOrbLearningShell
        childId="ila"
        childName="Ila"
        companion={elliCompanion}
        phase="ready"
        chargeGoal={3}
        domain="spelling"
        currentTarget="because"
        lastMoment="orb_ready"
        orbCount={7}
        onEncounterEvent={onEncounterEvent}
      >
        <div>Spell the word you hear</div>
      </SparkOrbLearningShell>,
    );

    flickWeakLaunch();

    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute(
      "data-launch-skill",
      "spent",
    );
    expect(screen.getByText("Answer more to recharge.")).toBeInTheDocument();
    expect(screen.getByText("Charge 0 / 3")).toBeInTheDocument();
    expect(screen.getByLabelText("6 Sunny orbs left")).toBeInTheDocument();
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "release_miss", result: "miss-early" }),
    );
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "orb_spent", orbCount: 6 }),
    );
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "recharge_needed", chargeCount: 0 }),
    );
  });

  it("plays a success flight, capture effect, and delayed collectible payoff", () => {
    vi.useFakeTimers();
    const onEncounterEvent = vi.fn();

    render(
      <SparkOrbLearningShell
        childId="ila"
        childName="Ila"
        companion={elliCompanion}
        phase="ready"
        chargeGoal={3}
        domain="spelling"
        currentTarget="because"
        lastMoment="orb_ready"
        onEncounterEvent={onEncounterEvent}
      >
        <div>Spell the word you hear</div>
      </SparkOrbLearningShell>,
    );

    flickCleanLaunch();

    const encounter = screen.getByTestId("spark-orb-encounter");
    expect(encounter).toHaveAttribute("data-flight", "traveling");
    expect(encounter).toHaveAttribute("data-capture-effect", "charging");
    expect(screen.queryByRole("dialog", { name: "Lumipuff added to collection" })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(encounter).toHaveAttribute("data-flight", "impact");
    expect(encounter).toHaveAttribute("data-capture-effect", "active");
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "capture_effect", result: "success" }),
    );

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(encounter).toHaveAttribute("data-flight", "reward");
    expect(screen.getByRole("dialog", { name: "Lumipuff added to collection" })).toBeInTheDocument();
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "collectible_revealed", result: "success" }),
    );
  });

  it("shrinks the creature into the orb before adding it to the collection", () => {
    vi.useFakeTimers();

    render(
      <SparkOrbLearningShell
        childId="ila"
        childName="Ila"
        companion={elliCompanion}
        phase="ready"
        chargeGoal={3}
        domain="spelling"
        currentTarget="because"
        lastMoment="orb_ready"
        sfx={{
          audioMode: "file",
          audioAssets: {
            launch: "/encounters/spark-orb/sfx/orb-launch.mp3",
            capturePull: "/encounters/spark-orb/sfx/capture-pull.mp3",
            captureShrink: "/encounters/spark-orb/sfx/capture-shrink.mp3",
            captureLock: "/encounters/spark-orb/sfx/orb-lock.mp3",
            collected: "/encounters/spark-orb/sfx/collection-boom.mp3",
          },
        }}
      >
        <div>Spell the word you hear</div>
      </SparkOrbLearningShell>,
    );

    flickCleanLaunch();

    const encounter = screen.getByTestId("spark-orb-encounter");
    const creature = screen.getByTestId("spark-orb-creature");
    const orb = screen.getByTestId("spark-orb");
    expect(playSparkOrbSfxMock).toHaveBeenCalledWith(
      "launch",
      expect.objectContaining({ audioMode: "file" }),
    );

    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(encounter).toHaveAttribute("data-capture-stage", "pulling");
    expect(creature).toHaveAttribute("data-capture-motion", "pulling");
    expect(playSparkOrbSfxMock).toHaveBeenCalledWith(
      "capturePull",
      expect.objectContaining({ audioMode: "file" }),
    );

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(encounter).toHaveAttribute("data-capture-stage", "shrinking");
    expect(creature).toHaveAttribute("data-capture-motion", "shrinking");
    expect(screen.queryByRole("dialog", { name: "Lumipuff added to collection" })).not.toBeInTheDocument();
    expect(playSparkOrbSfxMock).toHaveBeenCalledWith(
      "captureShrink",
      expect.objectContaining({ audioMode: "file" }),
    );

    act(() => {
      vi.advanceTimersByTime(550);
    });
    expect(encounter).toHaveAttribute("data-capture-stage", "locked");
    expect(orb).toHaveAttribute("data-capture-lock", "true");
    expect(playSparkOrbSfxMock).toHaveBeenCalledWith(
      "captureLock",
      expect.objectContaining({ audioMode: "file" }),
    );

    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(encounter).toHaveAttribute("data-capture-stage", "collection-added");
    expect(screen.getByRole("dialog", { name: "Lumipuff added to collection" })).toBeInTheDocument();
    expect(playSparkOrbSfxMock).toHaveBeenCalledWith(
      "collected",
      expect.objectContaining({ audioMode: "file" }),
    );
  });

  it("settles the orb on the grass after the temporary collection reward", () => {
    vi.useFakeTimers();
    const onEncounterEvent = vi.fn();

    render(
      <SparkOrbLearningShell
        childId="ila"
        childName="Ila"
        companion={elliCompanion}
        phase="ready"
        chargeGoal={3}
        domain="spelling"
        currentTarget="because"
        lastMoment="orb_ready"
        onEncounterEvent={onEncounterEvent}
      >
        <div>Spell the word you hear</div>
      </SparkOrbLearningShell>,
    );

    flickCleanLaunch();
    act(() => {
      vi.advanceTimersByTime(2200);
    });

    expect(screen.getByRole("dialog", { name: "Lumipuff added to collection" })).toBeInTheDocument();
    expect(screen.queryByText("Clean launch")).not.toBeInTheDocument();
    expect(screen.queryByText("Charge 3 / 3")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Launch aim meter")).not.toBeInTheDocument();
    expect(screen.queryByText("It's glowing.")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    const encounter = screen.getByTestId("spark-orb-encounter");
    expect(encounter).toHaveAttribute("data-flight", "settled");
    expect(encounter).toHaveAttribute("data-collection-state", "settled");
    expect(encounter).toHaveAttribute("data-capture-effect", "inactive");
    expect(encounter).toHaveAttribute("data-capture-stage", "free");
    expect(encounter).toHaveAttribute("data-launch-aim", "idle");
    expect(screen.queryByRole("dialog", { name: "Lumipuff added to collection" })).not.toBeInTheDocument();
    expect(screen.getByTestId("spark-orb")).toHaveAttribute("data-on-ground", "true");
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "collection_settled", result: "success" }),
    );
  });

  it("keeps the capture readable before the collection card appears", () => {
    vi.useFakeTimers();

    render(
      <SparkOrbLearningShell
        childId="ila"
        childName="Ila"
        companion={elliCompanion}
        phase="ready"
        chargeGoal={3}
        domain="spelling"
        currentTarget="because"
        lastMoment="orb_ready"
      >
        <div>Spell the word you hear</div>
      </SparkOrbLearningShell>,
    );

    flickCleanLaunch();

    const encounter = screen.getByTestId("spark-orb-encounter");
    const creature = screen.getByTestId("spark-orb-creature");

    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(encounter).toHaveAttribute("data-capture-stage", "pulling");
    expect(creature).toHaveAttribute("data-capture-motion", "pulling");
    expect(screen.queryByRole("dialog", { name: "Lumipuff added to collection" })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(encounter).toHaveAttribute("data-capture-stage", "shrinking");
    expect(creature).toHaveAttribute("data-capture-motion", "shrinking");
    expect(screen.queryByRole("dialog", { name: "Lumipuff added to collection" })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(encounter).toHaveAttribute("data-capture-stage", "locked");
    expect(screen.queryByRole("dialog", { name: "Lumipuff added to collection" })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(encounter).toHaveAttribute("data-capture-stage", "collection-added");
    expect(screen.getByRole("dialog", { name: "Lumipuff added to collection" })).toBeInTheDocument();
  });

  it("plays a miss fizzle flight instead of revealing the collectible", () => {
    vi.useFakeTimers();

    render(
      <SparkOrbLearningShell
        childId="ila"
        childName="Ila"
        companion={elliCompanion}
        phase="ready"
        chargeGoal={3}
        domain="spelling"
        currentTarget="because"
        lastMoment="orb_ready"
      >
        <div>Spell the word you hear</div>
      </SparkOrbLearningShell>,
    );

    flickWeakLaunch();

    const encounter = screen.getByTestId("spark-orb-encounter");
    expect(encounter).toHaveAttribute("data-launch-skill", "spent");
    expect(encounter).toHaveAttribute("data-flight", "fizzle");
    expect(encounter).toHaveAttribute("data-capture-effect", "inactive");
    expect(screen.getByTestId("spark-orb-creature")).toHaveAttribute(
      "data-capture-motion",
      "free",
    );
    expect(playSparkOrbSfxMock).toHaveBeenCalledWith("miss", undefined);
    expect(screen.queryByRole("dialog", { name: "Lumipuff added to collection" })).not.toBeInTheDocument();
  });
});
