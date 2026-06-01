import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { PronunciationGameCanvas } from "../components/PronunciationGameCanvas";

const rhythmConfig = {
  baseWordCount: 2,
  targetFlowWordCount: 2,
  maxWordCount: 2,
  expansionPolicy: "on_mastery_or_child_replay" as const,
  masteryGate: { accuracyAtLeast: 0.85, minStreak: 3, noFrustrationSignal: true },
  supportPolicy: "slow_on_help_or_repeated_miss" as const,
  mode: "rhythm" as const,
  durationMs: 5000,
  baseBeatMs: 900,
  minBeatMs: 520,
  rampEveryMs: 1500,
  rampStepMs: 60,
};

function setupBrowserStubs(audioCtor = vi.fn()) {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as typeof HTMLCanvasElement.prototype.getContext;
  vi.stubGlobal(
    "Audio",
    audioCtor.mockImplementation(() => ({
      volume: 0,
      play: vi.fn().mockResolvedValue(undefined),
    })),
  );
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockRejectedValue(new Error("no camera")),
    },
  });
}

async function settle(ms = 0) {
  await act(async () => {
    await Promise.resolve();
  });
  if (ms > 0) {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  }
}

describe("pronunciation rhythm flow", () => {
  beforeEach(() => {
    setupBrowserStubs();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("cycles selected words instead of completing when the target list is cleared", async () => {
    const sendMessage = vi.fn();
    const onComplete = vi.fn();
    const words = ["able", "common"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        pronunciationConfig={rhythmConfig}
        interimTranscript=""
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );

    rerender(
      <PronunciationGameCanvas
        words={words}
        pronunciationConfig={rhythmConfig}
        interimTranscript="able"
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );
    await settle(350);

    rerender(
      <PronunciationGameCanvas
        words={words}
        pronunciationConfig={rhythmConfig}
        interimTranscript="common"
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );
    await settle(350);

    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByTestId("pronunciation-word-card").textContent).toContain("able");
    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        rhythmMode: true,
        rhythmRound: 2,
        currentWord: "able",
      }),
    );
  });

  it("ends only when the rhythm meter expires and reports tempo evidence", async () => {
    const sendMessage = vi.fn();
    const onComplete = vi.fn();
    render(
      <PronunciationGameCanvas
        words={["able", "common"]}
        pronunciationConfig={{
          ...rhythmConfig,
          durationMs: 1200,
          baseBeatMs: 900,
          rampEveryMs: 600,
        }}
        interimTranscript=""
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );

    await settle(1200);

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        rhythmMode: true,
        runEndedReason: "meter_expired",
        meterRemainingMs: 0,
        finalBeatMs: 780,
        tempoLevel: 2,
        flowState: expect.objectContaining({
          meterExpired: true,
          tempoIncreased: true,
        }),
      }),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        phase: "complete",
        rhythmMode: true,
        meterRemainingMs: 0,
        beatMs: 780,
        tempoLevel: 2,
      }),
    );
  });

  it("keeps repeated per-target evidence across rhythm rounds", async () => {
    const sendMessage = vi.fn();
    const onComplete = vi.fn();
    const words = ["able", "common"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        pronunciationConfig={{ ...rhythmConfig, durationMs: 3200 }}
        interimTranscript=""
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );

    for (const transcript of ["able", "common", "able"]) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          pronunciationConfig={{ ...rhythmConfig, durationMs: 3200 }}
          interimTranscript={transcript}
          sendMessage={sendMessage}
          onComplete={onComplete}
        />,
      );
      await settle(350);
    }

    await settle(3200);

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        rhythmMode: true,
        rhythmRound: 2,
        hitEvents: 3,
        targetResults: [
          expect.objectContaining({ target: "able", correct: true, attempts: 2 }),
          expect.objectContaining({ target: "common", correct: true }),
        ],
      }),
    );
    const result = onComplete.mock.calls[0]?.[0];
    expect(result.targetResults[1].attempts).toBeGreaterThanOrEqual(1);
  });

  it("holds tempo after a miss instead of accelerating blindly", async () => {
    const sendMessage = vi.fn();
    render(
      <PronunciationGameCanvas
        words={["able", "common"]}
        pronunciationConfig={{
          ...rhythmConfig,
          durationMs: 5000,
          baseBeatMs: 900,
          rampEveryMs: 1000,
          rampStepMs: 100,
        }}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    await settle(1200);

    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        phase: "miss",
        rhythmMode: true,
        tempoLevel: 1,
        beatMs: 900,
        tempoReliefSteps: expect.any(Number),
      }),
    );
  });

  it("uses scored SFX cues without playing an audible beat track", async () => {
    const audioCtor = vi.fn();
    setupBrowserStubs(audioCtor);
    const sendMessage = vi.fn();
    const words = ["able", "common"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        pronunciationConfig={rhythmConfig}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    rerender(
      <PronunciationGameCanvas
        words={words}
        pronunciationConfig={rhythmConfig}
        interimTranscript="able"
        sendMessage={sendMessage}
      />,
    );
    await settle(350);
    await settle(1200);

    const playedSources = audioCtor.mock.calls.map(([src]) => String(src));
    expect(playedSources).toContain("/sfx/pronunciation/hit_pop.wav");
    expect(playedSources).toContain("/sfx/pronunciation/miss_thunk.wav");
    expect(playedSources.join(" ")).not.toMatch(/beat|metronome|click/i);
    expect(sendMessage).toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "pronunciation_sfx_cue",
          payload: expect.objectContaining({ source: "scored_event" }),
        }),
      }),
    );
  });
});
