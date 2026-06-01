import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PronunciationGameCanvas } from "../components/PronunciationGameCanvas";
import {
  GAME_SFX,
  GAME_SFX_CONFIG,
  pronunciationHitSfxEffectForStreak,
  playPronunciationHitSfx,
} from "../utils/gameSfx";

const webRoot = process.cwd();

function gameEventPayloads(
  sendMessage: ReturnType<typeof vi.fn>,
  eventType: string,
): Array<Record<string, unknown>> {
  return sendMessage.mock.calls
    .filter(
      ([type, payload]) =>
        type === "game_event" &&
        (payload as { event?: { type?: string } })?.event?.type === eventType,
    )
    .map(([, payload]) => (payload as { event: { payload: Record<string, unknown> } }).event.payload);
}

function activityEvidencePayloads(
  sendMessage: ReturnType<typeof vi.fn>,
  eventName: string,
): Array<Record<string, unknown>> {
  return gameEventPayloads(sendMessage, "activity_evidence").filter(
    (payload) => payload.eventName === eventName,
  );
}

describe("PronunciationGameCanvas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as typeof HTMLCanvasElement.prototype.getContext;
    vi.stubGlobal(
      "Audio",
      vi.fn().mockImplementation(() => ({
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
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows one immediate target word instead of waiting for belt spawn", () => {
    render(
      <PronunciationGameCanvas
        words={["hamburger", "corner"]}
        interimTranscript=""
        sendMessage={vi.fn()}
      />,
    );

    expect(screen.getByText("hamburger")).toBeTruthy();
    expect(screen.queryByText("corner")).toBeNull();
  });

  it("does not render underscore or dash placeholder cards when no valid target exists", () => {
    const sendMessage = vi.fn();
    render(
      <PronunciationGameCanvas
        words={["_", "", "   "]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    expect(screen.queryByTestId("pronunciation-word-card")).toBeNull();
    expect(screen.queryByText("_")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        phase: "blocked_no_targets",
        totalWords: 0,
      }),
    );
  });

  it("keeps the heard word visible briefly when interim transcript clears", () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["hamburger"]}
        interimTranscript="hamburger"
        sendMessage={sendMessage}
      />,
    );

    expect(
      screen.getByText((_, element) => element?.textContent === "heard: hamburger"),
    ).toBeTruthy();

    rerender(
      <PronunciationGameCanvas
        words={["hamburger"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    expect(
      screen.getByText((_, element) => element?.textContent === "heard: hamburger"),
    ).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(
      screen.getByText((_, element) => element?.textContent === "heard: waiting"),
    ).toBeTruthy();
  });

  it("dedupes repeated pronunciation targets so one word does not stutter through multiple blocks", async () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["erosion", "erosion", "rocks"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    expect(screen.getByText("erosion")).toBeTruthy();
    rerender(
      <PronunciationGameCanvas
        words={["erosion", "erosion", "rocks"]}
        interimTranscript="erosion"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.getByText("rocks")).toBeTruthy();
    rerender(
      <PronunciationGameCanvas
        words={["erosion", "erosion", "rocks"]}
        interimTranscript="Erosion."
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("rocks")).toBeTruthy();
  });

  it("does not send karaoke reading_progress events while scoring pronunciation", async () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["above"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    rerender(
      <PronunciationGameCanvas
        words={["above"]}
        interimTranscript="above"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(sendMessage).not.toHaveBeenCalledWith(
      "reading_progress",
      expect.anything(),
    );
  });

  it("emits live game_state_update with the current word and pronunciation outcomes", async () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["able", "common"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        currentWord: "able",
        expectedWords: ["able", "common"],
        wordIndex: 0,
        totalWords: 2,
        phase: "approaching",
      }),
    );

    rerender(
      <PronunciationGameCanvas
        words={["able", "common"]}
        interimTranscript="able"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        currentWord: "common",
        lastOutcomeWord: "able",
        lastOutcome: "hit",
        wordIndex: 1,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        currentWord: "common",
        expectedWords: ["able", "common"],
        wordIndex: 1,
      }),
    );
  });

  it("emits canonical activity evidence for presented words, attempts, and completion", async () => {
    const sendMessage = vi.fn();
    const onComplete = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["able"]}
        interimTranscript=""
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );

    expect(activityEvidencePayloads(sendMessage, "activity_started")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "activity_evidence",
          eventName: "activity_started",
          activityId: "pronunciation",
          target: "able",
        }),
      ]),
    );
    expect(activityEvidencePayloads(sendMessage, "target_presented")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "activity_evidence",
          eventName: "target_presented",
          activityId: "pronunciation",
          target: "able",
          visibleState: expect.objectContaining({
            wordVisible: true,
          }),
        }),
      ]),
    );

    rerender(
      <PronunciationGameCanvas
        words={["able"]}
        interimTranscript="able"
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(activityEvidencePayloads(sendMessage, "attempt_recorded")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "activity_evidence",
          eventName: "attempt_recorded",
          activityId: "pronunciation",
          target: "able",
          childAction: expect.objectContaining({
            rawTranscript: "able",
          }),
          result: expect.objectContaining({
            correct: true,
            status: "correct",
            matchReason: "pronunciation_hit",
          }),
        }),
      ]),
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(activityEvidencePayloads(sendMessage, "activity_completed")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "activity_evidence",
          eventName: "activity_completed",
          activityId: "pronunciation",
          targetResults: [
            expect.objectContaining({
              target: "able",
            }),
          ],
        }),
      ]),
    );
  });

  it("does not send backwards pronunciation wordIndex updates after hits", async () => {
    const sendMessage = vi.fn();
    const words = ["able", "common", "behind"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    rerender(
      <PronunciationGameCanvas
        words={words}
        interimTranscript="able"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    const stateUpdates = sendMessage.mock.calls
      .filter(([type]) => type === "game_state_update")
      .map(([, payload]) => payload as Record<string, unknown>);
    const indexes = stateUpdates
      .map((payload) => payload.wordIndex)
      .filter((value): value is number => typeof value === "number");
    for (let i = 1; i < indexes.length; i += 1) {
      expect(indexes[i]).toBeGreaterThanOrEqual(indexes[i - 1] ?? 0);
    }
    expect(stateUpdates).toContainEqual(
      expect.objectContaining({
        game: "pronunciation",
        currentWord: "common",
        lastOutcomeWord: "able",
        lastOutcome: "hit",
        wordIndex: 1,
      }),
    );
  });

  it("accepts common STT syllable splits for able", async () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["able", "common"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    rerender(
      <PronunciationGameCanvas
        words={["able", "common"]}
        interimTranscript="a bull"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        currentWord: "common",
        lastOutcome: "hit",
        lastOutcomeWord: "able",
        wordIndex: 1,
      }),
    );
  });

  it("does not advance pronunciation from an old target buried in a long background transcript", async () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["ago", "government", "half"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    rerender(
      <PronunciationGameCanvas
        words={["ago", "government", "half"]}
        interimTranscript="ago"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    rerender(
      <PronunciationGameCanvas
        words={["ago", "government", "half"]}
        interimTranscript="government movie talk unrelated"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(sendMessage).not.toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        currentWord: "half",
        lastOutcome: "hit",
        lastOutcomeWord: "government",
        wordIndex: 2,
      }),
    );
    expect(screen.getByTestId("pronunciation-progress").textContent).toContain("2 / 3");

    sendMessage.mockClear();
    rerender(
      <PronunciationGameCanvas
        words={["ago", "government", "half"]}
        interimTranscript="movie talk government"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        phase: "hit",
        lastOutcomeWord: "government",
        wordIndex: 2,
      }),
    );
    expect(sendMessage).not.toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        phase: "contaminated_retry",
        currentWord: "government",
      }),
    );
  });

  it("does not let contaminated pronunciation transcripts start heat mode or chart success", async () => {
    const onComplete = vi.fn();
    const sendMessage = vi.fn();
    const words = ["government", "half", "machine"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );

    rerender(
      <PronunciationGameCanvas
        words={words}
        interimTranscript="dad says government in the background"
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("pronunciation-progress").textContent).toContain("1 / 3");
    expect(screen.queryByTestId("pronunciation-heat-fire")).toBeNull();
    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        phase: "contaminated_retry",
        heatMode: false,
        contaminationReasons: expect.arrayContaining(["background_speech"]),
      }),
    );
    expect(sendMessage).not.toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({ type: "pronunciation_miss" }),
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(45000);
    });

    const result = onComplete.mock.calls.at(-1)?.[0];
    expect(result.targetResults[0]).toEqual(
      expect.objectContaining({
        target: "government",
        correct: false,
        contaminatedAttempts: 1,
        struggleSignals: expect.arrayContaining(["background_speech_contamination"]),
      }),
    );
  });

  it("suppresses companion voice turns while pronunciation is mounted", () => {
    const sendMessage = vi.fn();
    const { unmount } = render(
      <PronunciationGameCanvas
        words={["able"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    expect(sendMessage).toHaveBeenCalledWith("game_event", {
      event: {
        type: "voice_control",
        voiceEnabled: false,
        payload: {
          game: "pronunciation",
        },
        version: "1.0",
      },
    });

    unmount();

    expect(sendMessage).toHaveBeenCalledWith("game_event", {
      event: {
        type: "voice_control",
        voiceEnabled: true,
        payload: {
          game: "pronunciation",
        },
        version: "1.0",
      },
    });
  });

  it("shows reconnecting when speech transcripts go stale without requesting game-local audio", async () => {
    const sendMessage = vi.fn();
    render(
      <PronunciationGameCanvas
        words={["able"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    expect(screen.getByTestId("pronunciation-listening-status").textContent).toContain("listening");
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: expect.any(Object),
      audio: false,
    });

    await act(async () => {
      vi.advanceTimersByTime(4500);
    });

    expect(screen.getByTestId("pronunciation-listening-status").textContent).toContain("reconnecting");
    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        sttStatus: "reconnecting",
      }),
    );
  });

  it("shows an immediate support cue when the server sends pronunciation_support", async () => {
    const sendMessage = vi.fn();
    render(
      <PronunciationGameCanvas
        words={["able"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("sunny_pronunciation_support", {
          detail: {
            type: "pronunciation_support",
            word: "able",
            chunked: "a-ble",
            chunks: ["a", "ble"],
            guidance: "long A, then ble",
            mode: "pause",
            durationMs: 7000,
          },
        }),
      );
    });

    expect(screen.getByTestId("pronunciation-support-cue").textContent).toContain("a-ble");
    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        phase: "support",
        currentWord: "able",
        supportMode: "pause",
      }),
    );
  });

  it("does not flash a miss for a transient non-target transcript before timeout", async () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["ago"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    rerender(
      <PronunciationGameCanvas
        words={["ago"]}
        interimTranscript="agallo"
        sendMessage={sendMessage}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(1300);
    });

    expect(sendMessage).not.toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "pronunciation_miss",
        }),
      }),
    );
  });

  it("normalizes concept phrases like wear away into single pronunciation words", async () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["erosion", "wear away", "rocks"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    expect(screen.getByText("erosion")).toBeTruthy();
    expect(screen.queryByText("wear away")).toBeNull();

    rerender(
      <PronunciationGameCanvas
        words={["erosion", "wear away", "rocks"]}
        interimTranscript="erosion"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.getByText("wear")).toBeTruthy();
    expect(screen.queryByText("wear away")).toBeNull();
  });

  it("renders a vertical timer bar that drains and ends the run at zero", async () => {
    const onComplete = vi.fn();
    render(
      <PronunciationGameCanvas
        words={["able", "common"]}
        interimTranscript=""
        sendMessage={vi.fn()}
        onComplete={onComplete}
      />,
    );

    const fill = screen.getByTestId("pronunciation-timer-fill");
    expect(screen.getByTestId("pronunciation-time-label").textContent).toContain("45.0s");
    expect(fill.getAttribute("style")).toContain("height: 75%");

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByTestId("pronunciation-time-label").textContent).toContain("40.0s");
    expect(fill.getAttribute("style")).toContain("height: 66.666");

    await act(async () => {
      vi.advanceTimersByTime(40000);
    });

    expect(screen.getByText("GAME OVER")).toBeTruthy();
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        runEndedReason: "timer",
        timeSurvivedMs: 45000,
      }),
    );
  });

  it("adds time and coins on normal hits, and reports arcade state", async () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["able", "common", "behind"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("pronunciation-time-label").textContent).toContain("44.0s");

    rerender(
      <PronunciationGameCanvas
        words={["able", "common", "behind"]}
        interimTranscript="able"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("pronunciation-time-label").textContent).toContain("44.8s");
    expect(screen.getByTestId("pronunciation-coins").textContent).toContain("10");
    expect(screen.getByText("+10 coins")).toBeTruthy();
    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        coins: 10,
        timeRemainingMs: 44750,
        timerMaxMs: 60000,
        lastCoinAward: 10,
        lastTimeAwardMs: 750,
      }),
    );
  });

  it("caps chart-worthy pronunciation attempts to unique targets when the evidence pass completes", async () => {
    const onComplete = vi.fn();
    const sendMessage = vi.fn();
    const words = ["above", "ago", "away"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    for (let i = 0; i < words.length; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          interimTranscript={words.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
          onComplete={onComplete}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
    }

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        totalWords: 3,
        correctCount: 3,
        wordsAttempted: expect.any(Number),
        hitEvents: expect.any(Number),
        uniqueTargetsAttempted: 3,
      }),
    );
    const result = onComplete.mock.calls.at(-1)?.[0];
    expect(result.wordsAttempted).toBeLessThanOrEqual(3);
    expect(result.hitEvents).toBeGreaterThanOrEqual(3);
    expect(result.targetResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: "above", attempts: 1 }),
        expect.objectContaining({ target: "ago", attempts: 1 }),
        expect.objectContaining({ target: "away", attempts: 1 }),
      ]),
    );
  });

  it("uses heat tempo, 3x coins, no heat time award, and faster drain", async () => {
    const sendMessage = vi.fn();
    const words = ["able", "common", "behind", "whole", "easy"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    for (let i = 0; i < 3; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          interimTranscript={words.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
    }

    expect(screen.getByTestId("pronunciation-speed-state").textContent).toContain("1.45x");
    expect(screen.getByTestId("pronunciation-word-runner").getAttribute("style")).toContain(
      "pg-approach 2069ms",
    );
    expect(screen.getByTestId("pronunciation-drain-state").textContent).toContain("1.60x");
    expect(screen.getByTestId("pronunciation-word-card").getAttribute("style")).toContain(
      "pg-heat-beat 621ms",
    );
    expect(screen.getByTestId("pronunciation-coins").textContent).toContain("50");

    const heatTimeBefore = Number(
      screen.getByTestId("pronunciation-time-label").textContent?.replace("s", ""),
    );
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    const heatTimeAfter = Number(
      screen.getByTestId("pronunciation-time-label").textContent?.replace("s", ""),
    );
    expect(heatTimeBefore - heatTimeAfter).toBeGreaterThanOrEqual(1.5);

    rerender(
      <PronunciationGameCanvas
        words={words}
        interimTranscript={words.slice(0, 4).join(" ")}
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("pronunciation-coins").textContent).toContain("80");
    expect(screen.getByText("+30 coins")).toBeTruthy();
    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        heatMode: true,
        tempoMultiplier: 1.45,
        lastCoinAward: 30,
        lastTimeAwardMs: 0,
      }),
    );
  });

  it("does not score one-edit pronunciation near misses as spoken target words", async () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["neatly", "sunny"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    rerender(
      <PronunciationGameCanvas
        words={["neatly", "sunny"]}
        interimTranscript="nearly"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.getByText("neatly")).toBeTruthy();
    expect(screen.queryByText("sunny")).toBeNull();
    expect(sendMessage).not.toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({ type: "pronunciation_hit" }),
      }),
    );
  });

  it("continues into adaptive flow instead of showing a dead end when the visible list is completed", async () => {
    const onComplete = vi.fn();
    const sendMessage = vi.fn();
    const words = ["able", "common", "behind"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    for (let i = 0; i < words.length; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          interimTranscript={words.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
          onComplete={onComplete}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
    }
    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
    });

    expect(screen.queryByRole("button", { name: /play again/i })).toBeNull();
    expect(screen.getByTestId("pronunciation-flow-round").textContent).toContain("Flow round 1");
    expect(screen.getByText("able")).toBeTruthy();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("reports bounded per-target pronunciation evidence when the visible list completes", async () => {
    const onComplete = vi.fn();
    const sendMessage = vi.fn();
    const words = ["able", "common", "behind"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    for (let i = 0; i < words.length; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          interimTranscript={words.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
          onComplete={onComplete}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
    }

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      totalWords: 3,
      correctCount: 3,
      targetResults: [
        expect.objectContaining({ target: "able", correct: true }),
        expect.objectContaining({ target: "common", correct: true }),
        expect.objectContaining({ target: "behind", correct: true }),
      ],
      flowState: expect.objectContaining({
        heatReached: true,
        comboReached: false,
        abandoned: false,
      }),
    }));
  });

  it("keeps the comic hit and miss effect hooks in the rendered CSS", () => {
    render(
      <PronunciationGameCanvas
        words={["hamburger"]}
        interimTranscript=""
        sendMessage={vi.fn()}
      />,
    );

    const css = Array.from(document.querySelectorAll("style"))
      .map((el) => el.textContent ?? "")
      .join("\n");

    expect(css).toContain("@keyframes pg-ring-expand");
    expect(css).toContain("@keyframes pg-hit-pass");
    expect(css).toContain("@keyframes pg-miss-shatter");
    expect(css).toContain("@keyframes pg-miss-stamp");
  });

  it("speeds up and adds fire effects while heating up", async () => {
    const sendMessage = vi.fn();
    const words = ["alpha", "bravo", "charlie", "delta"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    for (let i = 0; i < 3; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          interimTranscript={words.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
    }

    expect(screen.getByTestId("pronunciation-speed-state").textContent).toContain(
      "1.45x",
    );
    expect(screen.getByTestId("pronunciation-heat-fire")).toBeTruthy();
  });

  it("returns speed and fire effects to normal after a timeout miss", async () => {
    const sendMessage = vi.fn();
    const words = ["alpha", "bravo", "charlie", "delta"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    for (let i = 0; i < 3; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          interimTranscript={words.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
    }

    expect(screen.getByTestId("pronunciation-heat-fire")).toBeTruthy();
    rerender(
      <PronunciationGameCanvas
        words={words}
        interimTranscript={`${words.slice(0, 3).join(" ")} zzzwrong`}
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByTestId("pronunciation-speed-state").textContent).toContain(
      "1.00x",
    );
    expect(screen.queryByTestId("pronunciation-heat-fire")).toBeNull();
  });

  it("preserves the legacy arcade pronunciation hit-sfx ladder", () => {
    expect(
      [1, 2, 3, 4, 5, 6, 10, 15, 20].map((streak) => [
        streak,
        pronunciationHitSfxEffectForStreak(streak),
      ]),
    ).toEqual([
      [1, "correct"],
      [2, "correct"],
      [3, "heating-up"],
      [4, "combo"],
      [5, "combo-breaker"],
      [6, "combo"],
      [10, "on-fire"],
      [15, "mega-streak"],
      [20, "legendary"],
    ]);
  });

  it("keeps the full legacy milestone ladder under the pronunciation config", () => {
    expect(GAME_SFX.pronunciation.comboBreaker).toBe(
      "/sfx/pronunciation/combo_breaker.mp3",
    );
    expect(GAME_SFX_CONFIG.pronunciation.comboMilestones).toEqual(
      [
        {
          minStreak: 5,
          label: "COMBO BREAKER!",
          effect: "combo-breaker",
          src: "/sfx/pronunciation/combo_breaker.mp3",
        },
        { minStreak: 10, label: "ON FIRE!", effect: "on-fire" },
        { minStreak: 15, label: "MEGA STREAK!", effect: "mega-streak" },
        { minStreak: 20, label: "LEGENDARY!", effect: "legendary" },
      ],
    );
    expect(GAME_SFX.pronunciation.combo).toBe("/sfx/pronunciation/combo.wav");
    expect(GAME_SFX.pronunciation.onFire).toBe("/sfx/pronunciation/on_fire.wav");
    expect(GAME_SFX.pronunciation.megaStreak).toBe(
      "/sfx/pronunciation/killer_instinct_brutal_combo.mp3",
    );
    expect(GAME_SFX.pronunciation.legendary).toBe(
      "/sfx/pronunciation/killer_instinct_master_combo.mp3",
    );
    expect(
      new Set([
        GAME_SFX.pronunciation.combo,
        GAME_SFX.pronunciation.onFire,
        GAME_SFX.pronunciation.megaStreak,
        GAME_SFX.pronunciation.legendary,
      ]).size,
    ).toBe(4);
    expect(GAME_SFX.pronunciation.hitPop).toBe("/sfx/pronunciation/hit_pop.wav");
    expect(GAME_SFX.pronunciation.missThunk).toBe("/sfx/pronunciation/miss_thunk.wav");
    expect(GAME_SFX.pronunciation.replayStart).toBe("/sfx/pronunciation/replay_start.wav");
    expect(GAME_SFX.pronunciation.completeFanfare).toBe(
      "/sfx/pronunciation/complete_fanfare.wav",
    );
    expect(GAME_SFX.pronunciation.heatUp).toBe(
      "/sfx/pronunciation/hes-heating-up.mp3",
    );
  });

  it("keeps pronunciation gameplay sfx mapped to real public assets", () => {
    for (const [id, src] of Object.entries(GAME_SFX.pronunciation)) {
      if (src.startsWith("synth:")) continue;
      expect(src, `${id} file-backed sfx must use public assets`).toMatch(/^\/sfx\//);
      expect(
        existsSync(join(webRoot, "public", src)),
        `${id} missing public asset ${src}`,
      ).toBe(true);
    }
  });

  it("uses file-backed audio for every audible pronunciation escalation cue", () => {
    const escalationSfx = {
      combo: GAME_SFX.pronunciation.combo,
      onFire: GAME_SFX.pronunciation.onFire,
      megaStreak: GAME_SFX.pronunciation.megaStreak,
      legendary: GAME_SFX.pronunciation.legendary,
    };

    for (const [id, src] of Object.entries(escalationSfx)) {
      expect(src, `${id} must use the same Audio playback path as working cues`).toMatch(
        /^\/sfx\/pronunciation\/.+\.(wav|mp3)$/,
      );
      expect(
        existsSync(join(webRoot, "public", src)),
        `${id} missing public asset ${src}`,
      ).toBe(true);
    }
  });

  it("plays on-fire, mega-streak, and legendary through browser Audio files", () => {
    const audioCtor = vi.fn().mockImplementation(() => ({
      volume: 0,
      play: vi.fn().mockResolvedValue(undefined),
    }));
    vi.stubGlobal("Audio", audioCtor);

    expect(playPronunciationHitSfx(10)).toBe(true);
    expect(playPronunciationHitSfx(15)).toBe(true);
    expect(playPronunciationHitSfx(20)).toBe(true);

    expect(audioCtor).toHaveBeenCalledWith("/sfx/pronunciation/on_fire.wav");
    expect(audioCtor).toHaveBeenCalledWith(
      "/sfx/pronunciation/killer_instinct_brutal_combo.mp3",
    );
    expect(audioCtor).toHaveBeenCalledWith(
      "/sfx/pronunciation/killer_instinct_master_combo.mp3",
    );
  });

  it("offers replay and harder replay from the completion overlay", async () => {
    const sendMessage = vi.fn();
    render(
      <PronunciationGameCanvas
        words={["alpha"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(60000);
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: /play again/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /harder replay/i })).toBeTruthy();

    act(() => {
      screen.getByRole("button", { name: /harder replay/i }).click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "replay_requested",
          payload: expect.objectContaining({
            game: "pronunciation",
            mode: "hard",
          }),
        }),
      }),
    );
    expect(screen.getAllByText("alpha").length).toBeGreaterThan(0);
    expect(screen.getByTestId("pronunciation-speed-state").textContent).toContain(
      "1.40x",
    );
  });

  it("keeps the pronunciation arcade end screen while emitting post-activity engagement actions", async () => {
    const onPostActivityAction = vi.fn();
    const onExit = vi.fn();
    const { unmount } = render(
      <PronunciationGameCanvas
        words={["alpha"]}
        interimTranscript=""
        sendMessage={vi.fn()}
        onPostActivityAction={onPostActivityAction}
        onExit={onExit}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(60000);
      await Promise.resolve();
    });

    expect(screen.getByTestId("pronunciation-end-overlay")).toBeTruthy();
    expect(screen.queryByTestId("post-activity-engagement-overlay")).toBeNull();

    act(() => {
      screen.getByRole("button", { name: /play again/i }).click();
    });
    expect(onPostActivityAction).toHaveBeenCalledWith(
      "replay_same",
      expect.objectContaining({ runEndedReason: "timer" }),
    );
    unmount();

    render(
      <PronunciationGameCanvas
        words={["alpha"]}
        interimTranscript=""
        sendMessage={vi.fn()}
        onPostActivityAction={onPostActivityAction}
        onExit={onExit}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(60000);
      await Promise.resolve();
    });
    act(() => {
      screen.getByRole("button", { name: /back to map/i }).click();
    });
    expect(onPostActivityAction).toHaveBeenCalledWith(
      "back_to_map",
      expect.objectContaining({ runEndedReason: "timer" }),
    );
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("finishes the evidence pass and automatically enters capped adaptive flow when vitals are strong", async () => {
    const sendMessage = vi.fn();
    const onComplete = vi.fn();
    const words = ["alpha", "beta", "gamma"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    for (let i = 0; i < words.length; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          interimTranscript={words.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
          onComplete={onComplete}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
        await Promise.resolve();
      });
    }

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        runEndedReason: "completed_targets",
        chartEligible: true,
        replayOnly: false,
      }),
    );
    expect(screen.queryByText("GAME OVER")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "replay_requested",
          payload: expect.objectContaining({
            source: "adaptive_flow",
            flowRound: 1,
            mode: "hard",
          }),
        }),
      }),
    );
    expect(screen.getByTestId("pronunciation-flow-round").textContent).toContain("Flow round 1");
    expect(screen.getByTestId("pronunciation-speed-state").textContent).toContain("1.40x");
    expect(screen.queryByText("FLOW COMPLETE")).toBeNull();

    rerender(
      <PronunciationGameCanvas
        words={words}
        interimTranscript="alpha"
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
      await Promise.resolve();
    });
    const flowHitUpdates = sendMessage.mock.calls
      .filter(([type]) => type === "game_state_update")
      .map(([, payload]) => payload as Record<string, unknown>);
    expect(
      flowHitUpdates.some(
        (payload) =>
          payload.phase === "hit" &&
          payload.replayOnly === true &&
          payload.flowRound === 1,
      ),
    ).toBe(true);
    expect(screen.queryByText("FLOW COMPLETE")).toBeNull();
  });

  it("recovers after a misspoke prefix when the current target is spoken at the tail", async () => {
    const sendMessage = vi.fn();
    const words = ["quickly", "scientist"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    rerender(
      <PronunciationGameCanvas
        words={words}
        interimTranscript="quickly"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    rerender(
      <PronunciationGameCanvas
        words={words}
        interimTranscript="sentence scientist"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        phase: "hit",
        lastOutcomeWord: "scientist",
        wordIndex: 2,
      }),
    );
    expect(sendMessage).not.toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        phase: "contaminated_retry",
        currentWord: "scientist",
      }),
    );
  });

  it("keeps replay runs out of authoritative completion evidence", async () => {
    const sendMessage = vi.fn();
    const onComplete = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["alpha"]}
        interimTranscript=""
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    rerender(
      <PronunciationGameCanvas
        words={["alpha"]}
        interimTranscript="alpha"
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
      await Promise.resolve();
    });
    expect(onComplete).toHaveBeenCalledTimes(1);

    act(() => {
      screen.getByRole("button", { name: /play again/i }).click();
    });
    rerender(
      <PronunciationGameCanvas
        words={["alpha"]}
        interimTranscript=""
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    rerender(
      <PronunciationGameCanvas
        words={["alpha"]}
        interimTranscript="alpha"
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
      await Promise.resolve();
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        phase: "complete",
        replayOnly: true,
        chartEligible: false,
      }),
    );
  });

  it("harder replay expands into the extended word pool instead of replaying a 5-word teaser", async () => {
    const sendMessage = vi.fn();
    const teaserWords = ["able", "common", "behind", "whole", "easy"];
    const replayWords = [
      ...teaserWords,
      "carefully",
      "remember",
      "vowel",
      "likely",
      "friendly",
    ];
    render(
      <PronunciationGameCanvas
        words={teaserWords}
        replayWords={replayWords}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(60000);
      await Promise.resolve();
    });

    act(() => {
      screen.getByRole("button", { name: /harder replay/i }).click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "replay_requested",
          payload: expect.objectContaining({
            game: "pronunciation",
            mode: "hard",
            wordCount: replayWords.length,
          }),
        }),
      }),
    );
    expect(screen.getByTestId("pronunciation-progress").textContent).toContain(
      `/ ${replayWords.length}`,
    );
  });

  it("uses the planner pronunciation config for harder replay dosage", async () => {
    const sendMessage = vi.fn();
    const teaserWords = ["able", "common", "behind", "whole", "easy"];
    const replayWords = [
      ...teaserWords,
      "carefully",
      "remember",
      "vowel",
      "likely",
      "friendly",
    ];
    render(
      <PronunciationGameCanvas
        words={teaserWords}
        replayWords={replayWords}
        pronunciationConfig={{
          baseWordCount: 5,
          targetFlowWordCount: 7,
          maxWordCount: 10,
          expansionPolicy: "on_mastery_or_child_replay",
          masteryGate: {
            accuracyAtLeast: 0.85,
            minStreak: 5,
            noFrustrationSignal: true,
          },
          supportPolicy: "slow_on_help_or_repeated_miss",
        }}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(60000);
      await Promise.resolve();
    });

    act(() => {
      screen.getByRole("button", { name: /harder replay/i }).click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "replay_requested",
          payload: expect.objectContaining({
            game: "pronunciation",
            mode: "hard",
            wordCount: 7,
          }),
        }),
      }),
    );
    expect(screen.getByTestId("pronunciation-progress").textContent).toContain(
      "/ 7",
      );
  });

  it("reports completion accuracy against the full configured target set, not only attempted words", async () => {
    const sendMessage = vi.fn();
    const onComplete = vi.fn();
    const words = [
      "wrong",
      "climb",
      "sign",
      "know",
      "write",
      "thumb",
      "comb",
      "gnat",
      "knock",
      "knife",
    ];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        pronunciationConfig={{
          baseWordCount: 5,
          targetFlowWordCount: 7,
          maxWordCount: 10,
          expansionPolicy: "on_mastery_or_child_replay",
          masteryGate: {
            accuracyAtLeast: 0.85,
            minStreak: 5,
            noFrustrationSignal: true,
          },
          supportPolicy: "slow_on_help_or_repeated_miss",
        }}
        interimTranscript=""
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );

    for (let i = 0; i < 5; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          pronunciationConfig={{
            baseWordCount: 5,
            targetFlowWordCount: 7,
            maxWordCount: 10,
            expansionPolicy: "on_mastery_or_child_replay",
            masteryGate: {
              accuracyAtLeast: 0.85,
              minStreak: 5,
              noFrustrationSignal: true,
            },
            supportPolicy: "slow_on_help_or_repeated_miss",
          }}
          interimTranscript={words.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
          onComplete={onComplete}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
    }

    const result = onComplete.mock.calls.at(-1)?.[0] as
      | { wordsHit: number; totalWords: number; accuracy: number }
      | undefined;
    expect(result).toMatchObject({ totalWords: 10 });
    expect(result?.accuracy).toBe(
      Math.round(((result?.wordsHit ?? 0) / (result?.totalWords ?? 1)) * 100),
    );
    expect(result?.accuracy).toBeLessThan(100);
  });

  it("does not score synthetic session-start prompts as pronunciation speech", async () => {
    const sendMessage = vi.fn();
    render(
      <PronunciationGameCanvas
        words={["above", "ago"]}
        interimTranscript={'[Session start — homework map mounted]\\nFirst map node: pronunciation\\nFirst node words: above, ago'}
        sendMessage={sendMessage}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    const gameStateUpdates = sendMessage.mock.calls
      .filter(([type]) => type === "game_state_update")
      .map(([, payload]) => payload as Record<string, unknown>);
    expect(gameStateUpdates.length).toBeGreaterThan(0);
    expect(gameStateUpdates).toEqual(
      expect.arrayContaining([
        expect.not.objectContaining({
          lastHeard: expect.stringContaining("Session start"),
        }),
      ]),
    );
    expect(screen.getByTestId("pronunciation-progress").textContent).toContain("1 / 2");
  });

  it("fires combo breaker event and marks the next word with heat-money VFX after a huge streak", async () => {
    const sendMessage = vi.fn();
    const words = [
      "alpha",
      "bravo",
      "charlie",
      "delta",
      "echo",
      "foxtrot",
      "golf",
      "hotel",
      "india",
    ];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    for (let i = 0; i < 8; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          interimTranscript={words.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
    }

    expect(sendMessage).toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "combo_breaker",
          payload: expect.objectContaining({
            game: "pronunciation",
            streak: 8,
            bonusWord: "india",
            bonusMultiplier: 2,
            difficulty: "super_hard",
          }),
        }),
      }),
    );
    expect(screen.getByText("COMBO BREAKER! 3x MONEY")).toBeTruthy();
    expect(screen.getByTestId("pronunciation-bonus-word")).toBeTruthy();
  });

  it("uses the pronunciation hit-sfx decision contract during streak progression", async () => {
    const sendMessage = vi.fn();
    const audioCtor = vi.fn().mockImplementation(() => ({
      volume: 0,
      play: vi.fn().mockResolvedValue(undefined),
    }));
    vi.stubGlobal("Audio", audioCtor);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const words = ["able", "brave", "calm", "daring", "eager"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    for (let i = 0; i < 5; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          interimTranscript={words.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
    }

    expect(
      logSpy.mock.calls
        .filter((call) => call[0] === " 🎮 [sfx] [pronunciation] [hit]")
        .map((call) => (call[1] as { effect: string }).effect),
    ).toEqual(["correct", "correct", "heating-up", "combo", "combo-breaker"]);
    expect(audioCtor).toHaveBeenCalledWith("/sfx/pronunciation/combo_breaker.mp3");
    logSpy.mockRestore();
  });

  it("restarts the pronunciation hit-sfx ladder after a miss so heat-up can play again", async () => {
    const sendMessage = vi.fn();
    const audioCtor = vi.fn().mockImplementation(() => ({
      volume: 0,
      play: vi.fn().mockResolvedValue(undefined),
    }));
    vi.stubGlobal("Audio", audioCtor);
    const words = ["able", "brave", "calm", "daring", "eager", "final"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    for (let i = 0; i < 3; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          interimTranscript={words.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
    }

    expect(audioCtor).toHaveBeenCalledWith("/sfx/pronunciation/hes-heating-up.mp3");

    rerender(
      <PronunciationGameCanvas
        words={words}
        interimTranscript={`${words.slice(0, 3).join(" ")} zzzwrong`}
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    for (let i = 3; i < 6; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          interimTranscript={words.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
    }

    const playedSources = audioCtor.mock.calls.map(([src]) => src);
    expect(
      playedSources.filter((src) => src === "/sfx/pronunciation/hes-heating-up.mp3"),
    ).toHaveLength(2);
  });

  it("emits replay_requested with wordIndex 0 instead of the finished run index", async () => {
    const sendMessage = vi.fn();
    const words = ["alpha", "beta"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    for (let i = 0; i < words.length; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          interimTranscript={words.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
    }

    act(() => {
      screen.getByRole("button", { name: /play again/i }).click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        phase: "replay_requested",
        wordIndex: 0,
        currentWord: "alpha",
        totalWords: words.length,
      }),
    );
  });

  it("ignores stale interim from the previous word after advancing to the next target", async () => {
    const sendMessage = vi.fn();
    const words = ["machine", "pair"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    rerender(
      <PronunciationGameCanvas
        words={words}
        interimTranscript="machine"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.getByTestId("pronunciation-progress").textContent).toContain("2 / 2");

    rerender(
      <PronunciationGameCanvas
        words={words}
        interimTranscript="machine"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    rerender(
      <PronunciationGameCanvas
        words={words}
        interimTranscript="pair"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        phase: "hit",
        lastOutcomeWord: "pair",
        wordIndex: 2,
      }),
    );
  });
});
