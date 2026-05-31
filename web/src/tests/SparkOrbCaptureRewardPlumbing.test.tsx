import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMPANION_DEFAULTS, type CompanionConfig } from "../../../src/shared/companionTypes";
import { LUMIPUFF_MONSTER } from "../components/capturedMonsterCatalog";
import { SparkOrbLearningShell } from "../components/SparkOrbLearningShell";

const playSparkOrbSfxMock = vi.hoisted(() => vi.fn());

vi.mock("../components/CompanionLayer", () => ({
  CompanionLayer: () => <div data-testid="mock-companion-layer" />,
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

describe("Spark Orb capture reward plumbing", () => {
  it("emits the captured creature reward contract after collection settles", () => {
    vi.useFakeTimers();
    const onCaptureCompleted = vi.fn();
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
        capturedCreature={LUMIPUFF_MONSTER}
        onCaptureCompleted={onCaptureCompleted}
        onEncounterEvent={onEncounterEvent}
      >
        <div>Spell the word you hear</div>
      </SparkOrbLearningShell>,
    );

    flickCleanLaunch();

    act(() => {
      vi.advanceTimersByTime(3650);
    });

    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute(
      "data-captured-creature-id",
      "lumipuff",
    );
    expect(onCaptureCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "orb_capture_completed",
        source: "spark_orb_learning_shell",
        chargeGoal: 3,
        orbCount: 7,
        reward: expect.objectContaining({
          creatureId: "lumipuff",
          inventoryRecord: expect.objectContaining({
            childId: "ila",
            creatureId: "lumipuff",
            nickname: "Lumi",
            chartWriteMode: "storybook_only",
            origin: expect.objectContaining({
              domain: "spelling",
              currentTarget: "word:because",
            }),
          }),
        }),
      }),
    );
    expect(onEncounterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "collection_settled", result: "success" }),
    );
  });
});
