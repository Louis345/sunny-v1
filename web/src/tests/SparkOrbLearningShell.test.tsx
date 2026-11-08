import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOrbCompanionAnchorContext,
  computeSparkOrbLaunchPhysics,
  SPARK_ORB_IDLE_FIDGETS,
  SPARK_ORB_MAX_IDLE_FIDGETS,
  SPARK_ORB_MAX_SIM_STEPS,
  SparkOrbLearningShell,
} from "../components/SparkOrbLearningShell";
import { LUMIPUFF_MONSTER } from "../components/capturedMonsterCatalog";
import {
  SPARK_ORB_DEFAULT_BACKGROUND,
  SPARK_ORB_MAX_WEATHER_PARTICLES,
  resolveSparkOrbScene,
} from "../components/sparkOrbScenes";
import { skyMoodNow } from "../utils/skyClock";
import { CREATURE_IDLE_CHIRP_COOLDOWN_MS } from "../hooks/useCreatureIdleLife";
import { DEFAULT_SENSORY_PROFILE } from "../../../src/shared/sensoryProfile";
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

const pullToneMock = vi.hoisted(() => ({ update: vi.fn(), stop: vi.fn() }));
const startSparkOrbPullToneMock = vi.hoisted(() => vi.fn());

vi.mock("../utils/sparkOrbSfx", () => ({
  playSparkOrbSfx: playSparkOrbSfxMock,
  startSparkOrbPullTone: startSparkOrbPullToneMock,
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
  pullToneMock.update.mockClear();
  pullToneMock.stop.mockClear();
  startSparkOrbPullToneMock.mockReset();
  startSparkOrbPullToneMock.mockReturnValue(pullToneMock);
  vi.useRealTimers();
});

function flickCleanLaunch(): void {
  const launchControl = screen.getByTestId("spark-orb-launch-control");
  fireEvent.pointerDown(launchControl, { clientX: 320, clientY: 620 });
  fireEvent.pointerMove(launchControl, { clientX: 338, clientY: 450 });
  fireEvent.pointerUp(launchControl, { clientX: 338, clientY: 450 });
}

describe("SparkOrbLearningShell", () => {
  it("every throw catches, and a good centered flick is Perfect", () => {
    const goodFlick = computeSparkOrbLaunchPhysics({ pullX: 12, pullY: 178 });
    const tap = computeSparkOrbLaunchPhysics({ pullX: 0, pullY: 0 });

    expect(goodFlick.result).toBe("success");
    expect(goodFlick.hitQuality).toBe("direct");
    expect(tap.result).toBe("success");
    expect(tap.hitQuality).toBe("near");
    expect(goodFlick.launchScale).toBe(1);
    expect(goodFlick.peakScale).toBeLessThan(goodFlick.launchScale);
    expect(goodFlick.flightScale).toBeLessThan(goodFlick.peakScale);
    expect(goodFlick.impactScale).toBeLessThan(goodFlick.flightScale);
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

  it("renders capture personality markers from the captured monster identity", () => {
    const shyLumipuff = {
      ...LUMIPUFF_MONSTER,
      capturePersonality: "shy",
    } as typeof LUMIPUFF_MONSTER & { capturePersonality: "shy" };

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
        capturedCreature={shyLumipuff}
        captureProgress={24}
      >
        <div>Spell the word you hear</div>
      </SparkOrbLearningShell>,
    );

    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute(
      "data-capture-personality",
      "shy",
    );
    expect(screen.getByTestId("spark-orb-creature")).toHaveAttribute(
      "data-capture-personality",
      "shy",
    );
    expect(screen.getByTestId("spark-orb-creature")).toHaveAttribute(
      "data-personality-reaction",
      "flinch",
    );
  });

  it.each([
    ["playful", 24, "dodge"],
    ["shy", 58, "curl"],
    ["brave", 24, "resist"],
    ["sleepy", 58, "float"],
  ] as const)(
    "renders %s capture personality during the capture flow",
    (capturePersonality, captureProgress, expectedReaction) => {
      const creature = { ...LUMIPUFF_MONSTER, capturePersonality } as typeof LUMIPUFF_MONSTER & {
        capturePersonality: typeof capturePersonality;
      };

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
          capturedCreature={creature}
          captureProgress={captureProgress}
        >
          <div>Spell the word you hear</div>
        </SparkOrbLearningShell>,
      );

      expect(screen.getByTestId("spark-orb-creature")).toHaveAttribute(
        "data-capture-personality",
        capturePersonality,
      );
      expect(screen.getByTestId("spark-orb-creature")).toHaveAttribute(
        "data-personality-reaction",
        expectedReaction,
      );
    },
  );

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
    expect(screen.getByText("Perfect!")).toBeInTheDocument();
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "release_success",
        result: "success",
        hitQuality: "direct",
        hitDistance: expect.any(Number),
      }),
    );
  });

  it("includes capture personality in successful launch and capture events", () => {
    vi.useFakeTimers();
    const onEncounterEvent = vi.fn();
    const braveLumipuff = {
      ...LUMIPUFF_MONSTER,
      capturePersonality: "brave",
    } as typeof LUMIPUFF_MONSTER & { capturePersonality: "brave" };

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
        capturedCreature={braveLumipuff}
        onEncounterEvent={onEncounterEvent}
      >
        <div>Spell the word you hear</div>
      </SparkOrbLearningShell>,
    );

    flickCleanLaunch();

    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "release_success",
        capturePersonality: "brave",
      }),
    );

    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "capture_pull",
        capturePersonality: "brave",
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
    expect(screen.queryByText("Perfect!")).not.toBeInTheDocument();
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

  it("clicking the settled orb replays the collection animation in reverse", () => {
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
      vi.advanceTimersByTime(3800);
    });

    const encounter = screen.getByTestId("spark-orb-encounter");
    expect(encounter).toHaveAttribute("data-collection-state", "settled");

    fireEvent.click(screen.getByTestId("spark-orb-reverse-control"));

    expect(encounter).toHaveAttribute("data-collection-state", "reversing");
    expect(encounter).toHaveAttribute("data-capture-direction", "reverse");
    expect(encounter).toHaveAttribute("data-capture-stage", "collection-added");
    expect(encounter).toHaveAttribute("data-capture-effect", "active");
    expect(screen.queryByRole("dialog", { name: "Lumipuff added to collection" })).not.toBeInTheDocument();
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "collection_reverse_started", result: "success" }),
    );

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(encounter).toHaveAttribute("data-collection-state", "reversing");
    expect(encounter).toHaveAttribute("data-capture-direction", "reverse");
    expect(encounter).toHaveAttribute("data-capture-stage", "shrinking");
    expect(screen.getByTestId("spark-orb-creature")).toHaveAttribute(
      "data-capture-motion",
      "shrinking",
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(encounter).toHaveAttribute("data-collection-state", "preview-open");
    expect(encounter).toHaveAttribute("data-capture-stage", "free");
    expect(encounter).toHaveAttribute("data-capture-effect", "inactive");
    expect(screen.getByTestId("spark-orb-creature")).toHaveAttribute(
      "data-capture-motion",
      "free",
    );
    expect(screen.getByTestId("spark-orb")).toHaveAttribute("data-on-ground", "true");
    expect(screen.queryByText("Perfect!")).not.toBeInTheDocument();
    expect(screen.queryByText("Charge 3 / 3")).not.toBeInTheDocument();
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "collection_reverse_complete", result: "success" }),
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


});

describe("Spark Orb throw physics", () => {
  it("a plain tap still throws and catches", () => {
    expect(computeSparkOrbLaunchPhysics({ pullX: 0, pullY: 0 }).result).toBe("success");
  });

  it("a slingshot pull-back also throws and catches", () => {
    expect(computeSparkOrbLaunchPhysics({ pullX: 0, pullY: -150 }).result).toBe("success");
  });

  it("a wild sideways flick curves back and lands on the creature", () => {
    const wild = computeSparkOrbLaunchPhysics({ pullX: 170, pullY: 178, releaseVelocityX: 3 });
    const flight = wild.path.slice(0, wild.landingIndex + 1);

    expect(wild.result).toBe("success");
    expect(wild.hitQuality).toBe("near");
    expect(Math.max(...flight.map((sample) => sample.x))).toBeGreaterThan(30);
    expect(wild.impactX).toBe(0);
    expect(wild.impactY).toBe(-wild.targetDepth);
  });

  it("lands on where the creature actually stands on this screen", () => {
    const physics = computeSparkOrbLaunchPhysics({ pullX: 0, pullY: 178, targetDepth: 250 });

    expect(physics.targetDepth).toBe(250);
    expect(physics.impactX).toBe(0);
    expect(physics.impactY).toBe(-250);
  });

  it("a faster flick flies quicker and arcs higher than a slow drag", () => {
    const slowDrag = computeSparkOrbLaunchPhysics({ pullX: 0, pullY: 60 });
    const fastFlick = computeSparkOrbLaunchPhysics({ pullX: 0, pullY: 60, releaseVelocityY: 2.5 });
    const peak = (physics: typeof slowDrag) => Math.min(...physics.path.map((sample) => sample.y));

    expect(fastFlick.flightMs).toBeLessThan(slowDrag.flightMs);
    expect(peak(fastFlick)).toBeLessThan(peak(slowDrag));
  });

  it("flies a smooth arc with one peak instead of straight segments", () => {
    const physics = computeSparkOrbLaunchPhysics({ pullX: 30, pullY: 178 });
    const flight = physics.path.slice(0, physics.landingIndex + 1);
    const peakIndex = flight.reduce((best, sample, index) => (sample.y < flight[best].y ? index : best), 0);

    expect(flight.length).toBeGreaterThanOrEqual(20);
    expect(flight.length).toBeLessThanOrEqual(SPARK_ORB_MAX_SIM_STEPS);
    expect(peakIndex).toBeGreaterThan(0);
    expect(peakIndex).toBeLessThan(flight.length - 1);
    for (let index = 1; index < flight.length; index += 1) {
      const step = Math.hypot(flight[index].x - flight[index - 1].x, flight[index].y - flight[index - 1].y);
      expect(step).toBeLessThan(40);
      if (index <= peakIndex) expect(flight[index].y).toBeLessThanOrEqual(flight[index - 1].y);
      else expect(flight[index].y).toBeGreaterThanOrEqual(flight[index - 1].y);
    }
  });

  it("a tap on the orb catches the creature with a plain Nice throw", () => {
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
    fireEvent.pointerUp(launchControl, { clientX: 320, clientY: 620 });

    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute("data-launch-skill", "success");
    expect(screen.getByText("Nice throw!")).toBeInTheDocument();
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "release_success", hitQuality: "near" }),
    );
  });

  it("starts the capture pull when the orb actually lands", () => {
    vi.useFakeTimers();
    const onEncounterEvent = vi.fn();
    const expected = computeSparkOrbLaunchPhysics({ pullX: 18, pullY: 170, holdCharge: 0 });

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
    const pullCalls = () =>
      onEncounterEvent.mock.calls.filter(([event]) => event.type === "capture_pull").length;

    act(() => {
      vi.advanceTimersByTime(expected.flightMs - 1);
    });
    expect(pullCalls()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(pullCalls()).toBe(1);
  });
});

describe("Lumipuff idle life", () => {
  function renderReady() {
    return render(
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
        <p>Spell because.</p>
      </SparkOrbLearningShell>,
    );
  }

  it("breathes and does an occasional random fidget, not on a fixed rhythm", () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0);
    renderReady();
    const creature = screen.getByTestId("spark-orb-creature");
    expect(creature).toHaveAttribute("data-idle-life", "breathing");
    expect(creature).not.toHaveAttribute("data-idle-fidget");

    act(() => vi.advanceTimersByTime(2_700));
    expect(creature).toHaveAttribute("data-idle-fidget", SPARK_ORB_IDLE_FIDGETS[0]);
    random.mockReturnValue(0.99);
    act(() => vi.advanceTimersByTime(1_000));
    expect(creature).not.toHaveAttribute("data-idle-fidget");

    act(() => vi.advanceTimersByTime(2_700));
    expect(creature).not.toHaveAttribute("data-idle-fidget");
    act(() => vi.advanceTimersByTime(3_200));
    expect(creature).toHaveAttribute(
      "data-idle-fidget",
      SPARK_ORB_IDLE_FIDGETS[SPARK_ORB_IDLE_FIDGETS.length - 1],
    );
    random.mockRestore();
  });

  it("stops idling once the orb is thrown so the capture reaction plays alone", () => {
    vi.useFakeTimers();
    renderReady();
    flickCleanLaunch();
    act(() => vi.advanceTimersByTime(30_000));
    const creature = screen.getByTestId("spark-orb-creature");
    expect(creature).not.toHaveAttribute("data-idle-life");
    expect(creature).not.toHaveAttribute("data-idle-fidget");
  });

  it("stops scheduling fidgets after the guard limit and on unmount", () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const { unmount } = renderReady();
    let fidgets = 0;
    let wasFidgeting = false;
    for (let step = 0; step < (SPARK_ORB_MAX_IDLE_FIDGETS + 5) * 40; step += 1) {
      act(() => vi.advanceTimersByTime(100));
      const fidgeting = screen.getByTestId("spark-orb-creature").hasAttribute("data-idle-fidget");
      if (fidgeting && !wasFidgeting) fidgets += 1;
      wasFidgeting = fidgeting;
    }
    expect(fidgets).toBe(SPARK_ORB_MAX_IDLE_FIDGETS);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    random.mockRestore();
  });
});

describe("Spark Orb sound", () => {
  const sfxIds = () => playSparkOrbSfxMock.mock.calls.map((call) => call[0]);

  function renderShell(props: Partial<Parameters<typeof SparkOrbLearningShell>[0]> = {}) {
    return render(
      <SparkOrbLearningShell
        childId="kid"
        childName="Kid"
        companion={elliCompanion}
        phase="ready"
        chargeGoal={3}
        domain="spelling"
        currentTarget="because"
        lastMoment="orb_ready"
        {...props}
      >
        <p>Question</p>
      </SparkOrbLearningShell>,
    );
  }

  it("follows the throw: grab, a pull tone that rises and stops, impact on landing, Perfect sting", () => {
    vi.useFakeTimers();
    startSparkOrbPullToneMock.mockReturnValue(pullToneMock);
    renderShell();
    const expected = computeSparkOrbLaunchPhysics({ pullX: 18, pullY: 170 });
    flickCleanLaunch();
    expect(sfxIds()).toContain("grab");
    expect(startSparkOrbPullToneMock).toHaveBeenCalledTimes(1);
    expect(pullToneMock.update).toHaveBeenCalled();
    expect(pullToneMock.stop).toHaveBeenCalled();
    expect(sfxIds()).toContain("launch");
    expect(sfxIds()).not.toContain("impact");
    act(() => vi.advanceTimersByTime(expected.flightMs + 20));
    expect(sfxIds()).toContain("impact");
    expect(sfxIds()).toContain("perfect");
  });

  it("chimes once per answer that charges the orb and sings when it is full", () => {
    const { rerender } = renderShell({ phase: "idle", lastMoment: "watching" });
    expect(sfxIds()).toEqual([]);
    const next = (phase: "charge-1" | "charge-2" | "ready") =>
      rerender(
        <SparkOrbLearningShell
          childId="kid"
          childName="Kid"
          companion={elliCompanion}
          phase={phase}
          chargeGoal={3}
          domain="spelling"
          currentTarget="because"
        >
          <p>Question</p>
        </SparkOrbLearningShell>,
      );
    next("charge-1");
    next("charge-2");
    next("ready");
    expect(sfxIds()).toEqual(["charge", "charge", "ready"]);
  });

  it("Lumipuff chirps with its fidgets and passes the chart's sensory sheet to every sound", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const sensory = { ...DEFAULT_SENSORY_PROFILE, soundVolume: 0.3 };
    renderShell({ sensory });
    act(() => vi.advanceTimersByTime(2_700));
    expect(sfxIds()).toContain("chirp");
    for (const call of playSparkOrbSfxMock.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ sensory }));
    }
    vi.restoreAllMocks();
  });

  it("a calm motion sheet keeps Lumipuff to a gentle bob with no fidgets", () => {
    vi.useFakeTimers();
    renderShell({ sensory: { ...DEFAULT_SENSORY_PROFILE, motion: "calm" } });
    act(() => vi.advanceTimersByTime(20_000));
    const creature = screen.getByTestId("spark-orb-creature");
    expect(creature).not.toHaveAttribute("data-idle-life");
    expect(sfxIds()).not.toContain("chirp");
  });
});

describe("Spark Orb scenes", () => {
  const at = (iso: string) => new Date(iso);

  it("uses the board theme's picture when the board has one, and the park otherwise", () => {
    const imageTheme = { background: { type: "image" as const, value: "/boards/ocean.png" } };
    const gradientTheme = { background: { type: "gradient" as const, value: "linear-gradient(red, blue)" } };
    expect(resolveSparkOrbScene({ boardTheme: imageTheme, now: at("2026-07-04T14:00:00") })).toMatchObject({
      backgroundSrc: "/boards/ocean.png",
      source: "board-theme",
    });
    expect(resolveSparkOrbScene({ boardTheme: gradientTheme, now: at("2026-07-04T14:00:00") })).toMatchObject({
      backgroundSrc: SPARK_ORB_DEFAULT_BACKGROUND,
      source: "default",
    });
    expect(resolveSparkOrbScene({ now: at("2026-07-04T14:00:00") }).backgroundSrc).toBe(SPARK_ORB_DEFAULT_BACKGROUND);
  });

  it.each(["2026-07-04T06:10:00", "2026-07-04T14:00:00", "2026-11-07T16:40:00", "2026-11-07T22:30:00"])(
    "follows the same real-sun sky clock as the start screen at %s",
    (iso) => {
      expect(resolveSparkOrbScene({ now: at(iso) }).timeOfDay).toBe(skyMoodNow(at(iso)));
    },
  );

  it.each([
    ["2026-10-20T12:00:00", "halloween"],
    ["2026-12-10T12:00:00", "holiday"],
    ["2027-01-15T12:00:00", "winter"],
    ["2026-04-10T12:00:00", "spring"],
    ["2026-07-10T12:00:00", "summer"],
    ["2026-09-25T12:00:00", "autumn"],
    ["2026-11-08T12:00:00", "autumn"],
  ])("reads %s as the %s season", (iso, season) => {
    expect(resolveSparkOrbScene({ now: at(iso) }).season).toBe(season);
  });

  it("lets a caller pin the time of day and season", () => {
    expect(
      resolveSparkOrbScene({ now: at("2026-07-04T14:00:00"), timeOfDay: "twilight", season: "winter" }),
    ).toMatchObject({ timeOfDay: "twilight", season: "winter" });
  });

  function renderScene(props: Partial<Parameters<typeof SparkOrbLearningShell>[0]>) {
    return render(
      <SparkOrbLearningShell
        childId="kid"
        childName="Kid"
        companion={elliCompanion}
        phase="ready"
        chargeGoal={3}
        domain="math"
        currentTarget="fact:7x8"
        lastMoment="orb_ready"
        {...props}
      >
        <p>7 x 8</p>
      </SparkOrbLearningShell>,
    );
  }

  it("paints the scene's picture, light and seasonal weather", () => {
    const { container } = renderScene({
      scene: {
        now: at("2026-12-10T17:30:00"),
        timeOfDay: "twilight",
        boardTheme: { background: { type: "image", value: "/boards/snow.png" } },
      },
    });
    const stage = screen.getByTestId("spark-orb-encounter");
    expect(stage).toHaveAttribute("data-time-of-day", "twilight");
    expect(stage).toHaveAttribute("data-season", "holiday");
    expect(container.querySelector(".spark-orb-learning-shell__backdrop")).toHaveAttribute("src", "/boards/snow.png");
    const flakes = screen.getAllByTestId("spark-orb-weather-particle");
    expect(flakes.length).toBeGreaterThan(0);
    expect(flakes.length).toBeLessThanOrEqual(SPARK_ORB_MAX_WEATHER_PARTICLES);
    expect(screen.getByTestId("spark-orb-weather")).toHaveAttribute("data-weather", "snow");
  });

  it("drops falling weather for a calm motion sheet", () => {
    renderScene({
      scene: { now: at("2026-12-10T17:30:00") },
      sensory: { ...DEFAULT_SENSORY_PROFILE, motion: "calm" },
    });
    expect(screen.queryByTestId("spark-orb-weather")).not.toBeInTheDocument();
  });

  it("shows no orb counter, and frames the companion portrait", () => {
    renderScene({});
    expect(screen.queryByLabelText(/Sunny orbs left/)).not.toBeInTheDocument();
    expect(screen.getByTestId("spark-orb-companion-frame")).toBeInTheDocument();
  });
});

describe("Spark Orb charge goal", () => {
  function renderGoal(props: Partial<Parameters<typeof SparkOrbLearningShell>[0]>) {
    return render(
      <SparkOrbLearningShell
        childId="kid"
        childName="Kid"
        companion={elliCompanion}
        phase="charge-2"
        domain="math"
        currentTarget="fact:7x8"
        {...props}
      >
        <p>7 x 8</p>
      </SparkOrbLearningShell>,
    );
  }

  it("counts up to any goal the encounter sets, not a fixed three", () => {
    renderGoal({ chargeGoal: 5, chargeCount: 4 });
    expect(screen.getByText(/Charge 4 \/ 5/)).toBeInTheDocument();
  });

  it("a ready orb is full whatever the goal", () => {
    renderGoal({ phase: "ready", chargeGoal: 6, lastMoment: "orb_ready" });
    expect(screen.getByText(/Charge 6 \/ 6/)).toBeInTheDocument();
  });
});

describe("Lumipuff idle chirps", () => {
  it("chirps now and then, not on every fidget", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(
      <SparkOrbLearningShell childId="kid" childName="Kid" companion={elliCompanion} phase="ready" domain="spelling" currentTarget="word:spark" lastMoment="orb_ready">
        <p>Q</p>
      </SparkOrbLearningShell>,
    );
    act(() => vi.advanceTimersByTime(60_000));
    const chirps = playSparkOrbSfxMock.mock.calls.filter((call) => call[0] === "chirp").length;
    expect(chirps).toBeGreaterThan(0);
    expect(chirps).toBeLessThanOrEqual(Math.ceil(60_000 / CREATURE_IDLE_CHIRP_COOLDOWN_MS));
    vi.restoreAllMocks();
  });
});
