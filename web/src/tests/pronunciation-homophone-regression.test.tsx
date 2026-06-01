import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { PronunciationGameCanvas } from "../components/PronunciationGameCanvas";

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

describe("pronunciation homophone regression", () => {
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

  it("accepts Pear for target pair while recording orthographic ambiguity", async () => {
    const sendMessage = vi.fn();
    const onComplete = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["pair"]}
        interimTranscript=""
        sendMessage={sendMessage}
        onComplete={onComplete}
      />,
    );

    rerender(
      <PronunciationGameCanvas
        words={["pair"]}
        interimTranscript="Pear"
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

    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        phase: "hit",
        lastOutcomeWord: "pair",
        wordIndex: 1,
      }),
    );
    expect(gameEventPayloads(sendMessage, "pronunciation_miss")).toEqual([]);
    expect(activityEvidencePayloads(sendMessage, "attempt_recorded")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activityId: "pronunciation",
          target: "pair",
          childAction: expect.objectContaining({
            rawTranscript: "Pear",
          }),
          result: expect.objectContaining({
            correct: true,
            matchReason: "pronunciation_hit",
            orthographicAmbiguity: true,
          }),
        }),
      ]),
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        correctCount: 1,
        targetResults: [
          expect.objectContaining({
            target: "pair",
            correct: true,
            orthographicAmbiguity: true,
            struggleSignals: expect.arrayContaining(["orthographic_ambiguity"]),
          }),
        ],
      }),
    );
  });
});
