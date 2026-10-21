import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SparkOrbLearningShell,
  useSparkOrbLearning,
} from "../components/SparkOrbLearningShell";
import {
  createSparkOrbEvidenceSession,
  postSparkOrbAttempt,
  type SparkOrbAttemptRecord,
} from "../components/sparkOrbEvidence";
import type { OrbCaptureCompletedEvent } from "../components/capturedMonsterReward";
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

describe("spark orb evidence session", () => {
  it("aggregates attempts, recoveries, throws, and reward-loop counters into a Law 14 summary", () => {
    const session = createSparkOrbEvidenceSession({
      childId: "ila",
      domain: "spelling",
      now: () => "2026-07-11T00:00:00.000Z",
    });

    session.recordAttempt({ target: "word:because", correct: false, attemptedValue: "becuase", responseTimeMs: 4200 });
    session.recordAttempt({ target: "word:because", correct: true, attemptedValue: "because", responseTimeMs: 2800 });
    session.recordAttempt({ target: "word:garden", correct: true, attemptedValue: "garden", responseTimeMs: 2000 });
    session.recordThrow({
      result: "breakout",
      hitQuality: "near",
      hitDistance: 50,
      difficultyLevel: 0,
      captureRadius: 82,
      driftOffsetX: 12,
      cheerCount: 1,
    });
    session.recordOrbSpent();
    session.recordStrugglePulse();
    session.recordStrugglePulse();
    session.recordCheer();
    session.recordThrow({
      result: "success",
      hitQuality: "direct",
      hitDistance: 10,
      difficultyLevel: 0,
      captureRadius: 82,
      driftOffsetX: -8,
      cheerCount: 0,
    });
    session.recordOrbGranted();

    const summary = session.buildSummary();
    expect(summary.contractVersion).toBe("spark-orb-evidence-v1");
    expect(summary.evidenceRole).toBe("preference_reward");
    expect(summary.academicEvidenceSource).toBe("embedded_attempts");
    expect(summary.targetsShown).toEqual(["word:because", "word:garden"]);
    expect(summary.targetsMissed).toEqual(["word:because"]);
    expect(summary.targetsRecovered).toEqual(["word:because"]);
    expect(summary.attemptCount).toBe(3);
    expect(summary.correctAttemptCount).toBe(2);
    expect(summary.accuracy).toBeCloseTo(0.67);
    expect(summary.avgResponseTimeMs).toBe(3000);
    expect(summary.throwCount).toBe(2);
    expect(summary.hitQualityCounts).toEqual({ direct: 1, near: 1, wide: 0 });
    expect(summary.strugglePulses).toBe(2);
    expect(summary.breakouts).toBe(1);
    expect(summary.capturesAfterBreakout).toBe(1);
    expect(summary.cheersUsed).toBe(1);
    expect(summary.orbsSpent).toBe(1);
    expect(summary.orbsGranted).toBe(1);
  });

  it("marks a repeat correct answer as recovered only after a miss on that target", () => {
    const session = createSparkOrbEvidenceSession({ childId: "ila", domain: "spelling" });
    const first = session.recordAttempt({ target: "word:spark", correct: true });
    expect(first.recovered).toBe(false);
    session.recordAttempt({ target: "word:spark", correct: false });
    const recovered = session.recordAttempt({ target: "word:spark", correct: true });
    expect(recovered.recovered).toBe(true);
  });

  it("posts attempts to the chart endpoint in the recordLearningAttempt shape", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const record: SparkOrbAttemptRecord = {
      attemptId: "ila:spelling:word:because:1",
      childId: "ila",
      domain: "spelling",
      target: "word:because",
      correct: true,
      attemptedValue: "because",
      responseTimeMs: 2100,
      recovered: false,
      at: "2026-07-11T00:00:00.000Z",
    };

    const posted = await postSparkOrbAttempt(record, {
      sessionId: "session-1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(posted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/map/attempt",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).toMatchObject({
      attemptId: "ila:spelling:word:because:1",
      childId: "ila",
      domain: "spelling",
      target: "because",
      attemptedValue: "because",
      correct: true,
      scaffoldLevel: 0,
      responseTimeMs: 2100,
      sessionId: "session-1",
    });
  });

  it("reports post failures without throwing", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    const record: SparkOrbAttemptRecord = {
      attemptId: "a1",
      childId: "ila",
      domain: "spelling",
      target: "because",
      correct: false,
      recovered: false,
      at: "2026-07-11T00:00:00.000Z",
    };
    await expect(
      postSparkOrbAttempt(record, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe(false);
  });
});

function AttemptButton({ correct }: { correct: boolean }) {
  const { reportAttempt } = useSparkOrbLearning();
  return (
    <button
      type="button"
      onClick={() =>
        reportAttempt({
          target: "word:because",
          correct,
          attemptedValue: correct ? "because" : "becuase",
          responseTimeMs: 1500,
        })
      }
    >
      {correct ? "answer-correct" : "answer-wrong"}
    </button>
  );
}

describe("spark orb learning shell evidence integration", () => {
  it("lets embedded panels report attempts through context and attaches the summary to capture completion", () => {
    vi.useFakeTimers();
    const onAttemptRecorded = vi.fn();
    const onCaptureCompleted = vi.fn();
    const onGameEvent = vi.fn();

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
        onAttemptRecorded={onAttemptRecorded}
        onCaptureCompleted={onCaptureCompleted}
        onGameEvent={onGameEvent}
      >
        <AttemptButton correct={false} />
        <AttemptButton correct />
      </SparkOrbLearningShell>,
    );

    fireEvent.click(screen.getByText("answer-wrong"));
    fireEvent.click(screen.getByText("answer-correct"));
    expect(onAttemptRecorded).toHaveBeenCalledTimes(2);
    expect(onAttemptRecorded).toHaveBeenLastCalledWith(
      expect.objectContaining({
        childId: "ila",
        domain: "spelling",
        target: "word:because",
        correct: true,
        recovered: true,
      }),
    );

    const launchControl = screen.getByTestId("spark-orb-launch-control");
    fireEvent.pointerDown(launchControl, { clientX: 320, clientY: 620 });
    fireEvent.pointerMove(launchControl, { clientX: 338, clientY: 450 });
    fireEvent.pointerUp(launchControl, { clientX: 338, clientY: 450 });
    act(() => {
      vi.advanceTimersByTime(3650);
    });

    expect(onCaptureCompleted).toHaveBeenCalledTimes(1);
    const completed = onCaptureCompleted.mock.calls[0][0] as OrbCaptureCompletedEvent;
    expect(completed.summary).toBeDefined();
    expect(completed.summary?.attemptCount).toBe(2);
    expect(completed.summary?.targetsRecovered).toEqual(["word:because"]);
    expect(completed.summary?.throwCount).toBe(1);
    expect(completed.summary?.hitQualityCounts.direct).toBe(1);

    const completionUpdate = onGameEvent.mock.calls
      .map(([event]) => event)
      .find((event) => event.payload.summary);
    expect(completionUpdate).toBeDefined();
    expect(completionUpdate.type).toBe("game_state_update");
    expect(completionUpdate.version).toBe("1.0");
    expect(completionUpdate.payload.game).toBe("Spark Orb");
  });

  it("emits game_state_update on phase transitions", () => {
    const onGameEvent = vi.fn();
    const { rerender } = render(
      <SparkOrbLearningShell
        childId="ila"
        childName="Ila"
        companion={elliCompanion}
        phase="idle"
        chargeGoal={3}
        domain="spelling"
        currentTarget="word:because"
        onGameEvent={onGameEvent}
      >
        <div>problem</div>
      </SparkOrbLearningShell>,
    );

    rerender(
      <SparkOrbLearningShell
        childId="ila"
        childName="Ila"
        companion={elliCompanion}
        phase="charge-1"
        chargeGoal={3}
        domain="spelling"
        currentTarget="word:because"
        onGameEvent={onGameEvent}
      >
        <div>problem</div>
      </SparkOrbLearningShell>,
    );

    const phases = onGameEvent.mock.calls.map(([event]) => event.payload.phase);
    expect(phases).toContain("idle");
    expect(phases).toContain("charge-1");
  });
});
