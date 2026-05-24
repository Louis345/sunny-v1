import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { WordRadar } from "../components/WordRadar";
import type { RadarItem } from "../components/WordRadar";
import {
  WORD_RADAR_END_SCREEN_MS,
  WORD_RADAR_FEEDBACK_MS,
} from "../hooks/useWordRadar";

const sampleItems: RadarItem[] = [
  { display: "sun", acceptedResponses: ["sun"], label: "Spelling", subject: "spelling" },
  { display: "moon", acceptedResponses: ["moon"], label: "Reading", subject: "reading" },
];

function renderRadar(overrides: Partial<Parameters<typeof WordRadar>[0]> = {}) {
  const props = {
    items: sampleItems,
    interimTranscript: "",
    sendMessage: vi.fn(),
    showKeyboard: false,
    personalBests: {},
    onComplete: vi.fn(),
    ...overrides,
  };
  const view = render(<WordRadar {...props} />);
  return { ...view, props };
}

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

async function startRadar() {
  fireEvent.click(screen.getByTestId("word-radar-ready"));
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
}

describe("WordRadar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("autoStart=true skips intro and moves to flash without a button click", async () => {
    renderRadar({ autoStart: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("word-radar-phase").textContent).toBe("flash");
  });

  it("autoStart=false (default) keeps intro phase until button clicked", () => {
    renderRadar({ autoStart: false });
    expect(screen.getByTestId("word-radar-phase").textContent).toBe("intro");
  });

  it("labels letter-by-letter mode so the UI is not deceptive", () => {
    renderRadar({ inputMode: "letter-by-letter" });
    expect(screen.getByTestId("word-radar-mode-label").textContent).toContain(
      "Spell it out loud",
    );
  });

  it("sends a game trace config event to explain hidden-word and input-mode choices", () => {
    const sendMessage = vi.fn();
    renderRadar({
      childId: "ila",
      inputMode: "letter-by-letter",
      speakStyle: "option-a",
      sendMessage,
    });
    expect(sendMessage).toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "game_state_update",
          payload: expect.objectContaining({
            phase: "config_audit",
            childId: "ila",
            requestedInputMode: "letter-by-letter",
            resolvedInputMode: "letter-by-letter",
            speakStyle: "option-a",
            hiddenDuringSpeech: false,
          }),
        }),
      }),
    );
  });

  it("emits target attempt traces with mode, visibility, and captured response", async () => {
    const sendMessage = vi.fn();
    const { rerender } = renderRadar({
      childId: "reina",
      inputMode: "letter-by-letter",
      recallMode: "partial_visual_recall",
      speakStyle: "option-a",
      timerSeconds: 10,
      sendMessage,
    });

    await startRadar();
    rerender(
      <WordRadar
        items={sampleItems}
        interimTranscript="s u n"
        sendMessage={sendMessage}
        timerSeconds={10}
        inputMode="letter-by-letter"
        recallMode="partial_visual_recall"
        speakStyle="option-a"
        personalBests={{}}
        childId="reina"
        onComplete={vi.fn()}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "attempt_event",
          payload: expect.objectContaining({
            game: "word-radar",
            activityId: "word-radar",
            childId: "reina",
            target: "sun",
            correct: true,
            attempts: 1,
            attemptedValue: "sun",
            inputMode: "letter-by-letter",
            recallMode: "partial_visual_recall",
            answerVisibility: "hidden",
          }),
        }),
      }),
    );
  });

  it("emits Class A flight recorder fields for target state, audio clicks, and per-target results", async () => {
    const sendMessage = vi.fn();
    const onComplete = vi.fn();
    const wordRadarConfig = {
      recallMode: "partial_visual_recall",
      inputMode: "letter-by-letter",
      speakStyle: "option-a",
      showTimer: true,
      timerSeconds: 10,
      hideWordDuringResponse: true,
      requiresCapturedResponse: true,
    } as const;
    const telemetry = {
      nodeId: "n-word-radar-silent-letters",
      planId: "session-plan-reina-1",
      targetLane: "silent_letters",
      wordRadarConfig,
    } as Partial<Parameters<typeof WordRadar>[0]>;
    const { rerender } = renderRadar({
      items: [sampleItems[0]!],
      childId: "reina",
      inputMode: "letter-by-letter",
      recallMode: "partial_visual_recall",
      speakStyle: "option-a",
      hideWordDuringResponse: true,
      requiresCapturedResponse: true,
      timerSeconds: 10,
      sendMessage,
      onComplete,
      ...telemetry,
    });

    await startRadar();

    expect(gameEventPayloads(sendMessage, "game_state_update")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          game: "word-radar",
          activityId: "word-radar",
          childId: "reina",
          nodeId: "n-word-radar-silent-letters",
          planId: "session-plan-reina-1",
          targetLane: "silent_letters",
          wordRadarConfig,
          target: "sun",
          phase: "response",
          visibleState: expect.objectContaining({
            wordVisible: false,
            slotsVisible: true,
            scaffold: "partial_visual_recall",
            inputMode: "letter-by-letter",
            speakStyle: "option-a",
            hideWordDuringResponse: true,
            requiresCapturedResponse: true,
          }),
        }),
      ]),
    );

    fireEvent.click(screen.getByTestId("word-radar-mic"));
    expect(gameEventPayloads(sendMessage, "narration_request")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          game: "word-radar",
          childId: "reina",
          nodeId: "n-word-radar-silent-letters",
          planId: "session-plan-reina-1",
          targetLane: "silent_letters",
          wordRadarConfig,
          text: "sun.",
          word: "sun",
          control: "hear_again",
          clickType: "speaker",
          reason: "word_radar_mic_click",
        }),
      ]),
    );

    rerender(
      <WordRadar
        items={[sampleItems[0]!]}
        interimTranscript="s u n"
        sendMessage={sendMessage}
        timerSeconds={10}
        inputMode="letter-by-letter"
        recallMode="partial_visual_recall"
        speakStyle="option-a"
        hideWordDuringResponse={true}
        requiresCapturedResponse={true}
        personalBests={{}}
        childId="reina"
        onComplete={onComplete}
        {...telemetry}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(gameEventPayloads(sendMessage, "attempt_event")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          game: "word-radar",
          activityId: "word-radar",
          childId: "reina",
          nodeId: "n-word-radar-silent-letters",
          planId: "session-plan-reina-1",
          targetLane: "silent_letters",
          wordRadarConfig,
          target: "sun",
          itemIndex: 0,
          correct: true,
          attempts: 1,
          retryUsed: false,
          skipped: false,
          helpUsed: false,
          rawTranscript: "s u n",
          heardTranscript: "s u n",
          heardToken: "n",
          capturedLetters: ["s", "u", "n"],
          normalizedResponse: "sun",
          attemptedValue: "sun",
          matchReason: "spoken_letter_sequence_complete",
          answerVisibility: "hidden",
          visibleState: expect.objectContaining({
            wordVisible: false,
            slotsVisible: true,
            scaffold: "partial_visual_recall",
          }),
          responseTime_ms: expect.any(Number),
        }),
      ]),
    );

    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS + WORD_RADAR_END_SCREEN_MS + 1);
    });

    expect(gameEventPayloads(sendMessage, "game_complete")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          game: "word-radar",
          childId: "reina",
          nodeId: "n-word-radar-silent-letters",
          planId: "session-plan-reina-1",
          targetLane: "silent_letters",
          wordRadarConfig,
          targetResults: [
            expect.objectContaining({
              target: "sun",
              correct: true,
              rawTranscript: "s u n",
              capturedLetters: ["s", "u", "n"],
              normalizedResponse: "sun",
              matchReason: "spoken_letter_sequence_complete",
              responseTime_ms: expect.any(Number),
            }),
          ],
        }),
      ]),
    );
  });

  it("does not disable organic voice while showing a hear-again control", () => {
    const sendMessage = vi.fn();
    renderRadar({ childId: "ila", sendMessage });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "voice_control",
          voiceEnabled: true,
          payload: expect.objectContaining({
            game: "word-radar",
            childId: "ila",
          }),
        }),
      }),
    );
  });

  it("renders starfield", () => {
    renderRadar();
    expect(screen.getByTestId("word-radar-starfield")).toBeTruthy();
    expect(
      screen.getByTestId("word-radar-starfield").querySelectorAll(".wr-star"),
    ).toHaveLength(55);
  });

  it("renders intro then flash for 1500ms then transitions to response", async () => {
    renderRadar({ timerSeconds: 10 });
    expect(screen.getByTestId("word-radar-phase").textContent).toBe("intro");
    fireEvent.click(screen.getByTestId("word-radar-ready"));
    expect(screen.getByTestId("word-radar-phase").textContent).toBe("flash");
    await act(async () => {
      vi.advanceTimersByTime(1499);
    });
    expect(screen.getByTestId("word-radar-phase").textContent).toBe("flash");
    await act(async () => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.getByTestId("word-radar-phase").textContent).toBe("response");
  });

  it("does not render a timer when timerSeconds is omitted", async () => {
    renderRadar();
    await startRadar();
    expect(screen.queryByTestId("word-radar-timer")).toBeNull();
  });

  it("renders a timer when timerSeconds is provided", async () => {
    renderRadar({ timerSeconds: 60 });
    await startRadar();
    expect(screen.getByTestId("word-radar-timer")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(59_000);
    });
    expect(screen.getByTestId("word-radar-phase").textContent).toBe("response");
  });

  it("keyboard renders when showKeyboard=true", async () => {
    renderRadar({ timerSeconds: 10, showKeyboard: true });
    await startRadar();
    expect(screen.getByTestId("word-radar-keyboard")).toBeTruthy();
    expect(screen.getByTestId("word-radar-input")).toBeTruthy();
  });

  it("keyboard is hidden by default", async () => {
    renderRadar();
    await startRadar();
    expect(screen.queryByTestId("word-radar-keyboard")).toBeNull();
  });

  it("progress dots count matches items.length", () => {
    renderRadar();
    expect(screen.getAllByTestId("word-radar-progress-dot")).toHaveLength(2);
  });

  it("visually separates bonus review words from regular homework words", async () => {
    const items: RadarItem[] = [
      {
        display: "sun",
        acceptedResponses: ["sun"],
        label: "Homework",
        subject: "spelling",
      },
      {
        display: "figure",
        acceptedResponses: ["figure"],
        label: "Bonus",
        subject: "spelling",
        targetRole: "bonus",
        source: "spaced_repetition",
        reason: "due_review",
      },
    ];
    const sendMessage = vi.fn();
    const onComplete = vi.fn();
    const { rerender } = renderRadar({
      items,
      timerSeconds: 10,
      recallMode: "visible_read",
      speakStyle: "option-a",
      sendMessage,
      onComplete,
    });

    await startRadar();
    expect(screen.queryByTestId("word-radar-bonus-badge")).toBeNull();
    expect(screen.getAllByTestId("word-radar-progress-dot")[1]).toHaveAttribute(
      "data-word-role",
      "bonus",
    );

    rerender(
      <WordRadar
        items={items}
        interimTranscript="sun"
        sendMessage={sendMessage}
        timerSeconds={10}
        showKeyboard={false}
        recallMode="visible_read"
        speakStyle="option-a"
        personalBests={{}}
        onComplete={onComplete}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS + 1500);
    });

    expect(screen.getByTestId("word-radar-bonus-badge").textContent).toContain(
      "Bonus word",
    );
    expect(screen.getByTestId("word-radar-bonus-source").textContent).toContain(
      "Review vault",
    );
  });

  it("letter tiles are blank during response phase", async () => {
    renderRadar();
    await startRadar();
    expect(screen.getAllByTestId("word-radar-letter-tile").map((n) => n.textContent)).toEqual([
      "",
      "",
      "",
    ]);
  });


  it("Skip button visible during response phase", async () => {
    renderRadar({ timerSeconds: 10 });
    await startRadar();
    expect(screen.getByTestId("word-radar-btn-skip")).toBeTruthy();
  });

  it("hear-again control looks like audio replay, not recording", async () => {
    renderRadar({ timerSeconds: 10 });
    await startRadar();

    const hearAgain = screen.getByTestId("word-radar-mic");
    expect(hearAgain).toHaveAccessibleName("Hear sun again");
    expect(hearAgain).not.toHaveTextContent("🎤");
  });

  it("microphone click requests current word audio without rendering a separate speaker control", async () => {
    const sendMessage = vi.fn();
    renderRadar({ timerSeconds: 10, sendMessage, childId: "ila" });
    await startRadar();

    fireEvent.click(screen.getByTestId("word-radar-mic"));

    expect(sendMessage).toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "narration_request",
          payload: expect.objectContaining({
            game: "word-radar",
            childId: "ila",
            text: "sun.",
            reason: "word_radar_mic_click",
          }),
        }),
      }),
    );
    expect(screen.queryByTestId("word-radar-speaker")).toBeNull();
  });

  it("debounces hear-again clicks so one child tap cannot create duplicate narration", async () => {
    const sendMessage = vi.fn();
    renderRadar({ timerSeconds: 10, sendMessage, childId: "ila" });
    await startRadar();

    fireEvent.click(screen.getByTestId("word-radar-mic"));
    fireEvent.click(screen.getByTestId("word-radar-mic"));

    const narrationCalls = sendMessage.mock.calls.filter(
      ([type, payload]) =>
        type === "game_event" &&
        (payload as { event?: { type?: string } })?.event?.type === "narration_request",
    );
    expect(narrationCalls).toHaveLength(1);
  });

  it("does not automatically request word audio during hidden visual recall", async () => {
    const sendMessage = vi.fn();
    renderRadar({
      timerSeconds: 10,
      sendMessage,
      childId: "ila",
      recallMode: "partial_visual_recall",
      speakStyle: "option-a",
    });
    await startRadar();

    expect(sendMessage).not.toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "narration_request",
        }),
      }),
    );
  });

  it("option-b listen flash waits for explicit hear click instead of auto narration", async () => {
    const sendMessage = vi.fn();
    renderRadar({
      autoStart: true,
      recallMode: "hidden_word_recall",
      speakStyle: "option-b",
      sendMessage,
      childId: "ila",
    });
    await act(async () => {
      await Promise.resolve();
    });

    const narrationCalls = () =>
      sendMessage.mock.calls.filter(
        ([type, payload]) =>
          type === "game_event" &&
          (payload as { event?: { type?: string } })?.event?.type === "narration_request",
      );

    expect(narrationCalls()).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(narrationCalls()).toHaveLength(0);
  });

  it("microphone click plays current word audio in Storybook local preview", async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak, cancel });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      vi.fn().mockImplementation((text: string) => ({ text })),
    );
    renderRadar({
      timerSeconds: 10,
      childId: "qa",
      enableLocalNarrationFallback: true,
      sendMessage: (type, payload) => console.info("[storybook:word-radar]", type, payload),
    });
    await startRadar();
    speak.mockClear();
    cancel.mockClear();

    fireEvent.click(screen.getByTestId("word-radar-mic"));

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: "sun" }));
  });

  it("Try Again button visible when canTryAgain", async () => {
    renderRadar({ timerSeconds: 10 });
    await startRadar();
    expect(screen.getByTestId("word-radar-btn-try-again")).toBeTruthy();
  });

  it("Try Again button not visible after it is used", async () => {
    renderRadar({ timerSeconds: 10 });
    await startRadar();
    await act(async () => {
      fireEvent.click(screen.getByTestId("word-radar-btn-try-again"));
    });
    expect(screen.queryByTestId("word-radar-btn-try-again")).toBeNull();
    expect(screen.getByTestId("word-radar-btn-skip")).toBeTruthy();
  });

  it("Got it and Missed it buttons do not exist", async () => {
    renderRadar({ timerSeconds: 60 });
    await startRadar();
    expect(screen.queryByTestId("word-radar-btn-got-it")).toBeNull();
    expect(screen.queryByTestId("word-radar-btn-missed-it")).toBeNull();
    expect(screen.queryByTestId("word-radar-btn-not-my-word")).toBeNull();
  });

  it("letter tiles all filled on feedback phase when correct", async () => {
    const { rerender } = renderRadar({ timerSeconds: 10 });
    await startRadar();
    rerender(
      <WordRadar
        items={sampleItems}
        interimTranscript="sun"
        sendMessage={vi.fn()}
        timerSeconds={10}
        showKeyboard={false}
        personalBests={{}}
        onComplete={vi.fn()}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("word-radar-phase").textContent).toBe("feedback");
    expect(screen.getAllByTestId("word-radar-letter-tile").map((n) => n.textContent)).toEqual([
      "s",
      "u",
      "n",
    ]);
  });

  it("feedback screen shows for 900ms then advances", async () => {
    const onComplete = vi.fn();
    const { rerender } = renderRadar({ timerSeconds: 10, onComplete });
    await startRadar();
    rerender(
      <WordRadar
        items={sampleItems}
        interimTranscript="sun"
        sendMessage={vi.fn()}
        timerSeconds={10}
        showKeyboard={false}
        personalBests={{}}
        onComplete={onComplete}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("word-radar-phase").textContent).toBe("feedback");
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS - 1);
    });
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.getByTestId("word-radar-phase").textContent).not.toBe("feedback");
  });

  it("end screen fires onComplete", async () => {
    const onComplete = vi.fn();
    const sendMessage = vi.fn();
    const { rerender } = renderRadar({
      items: [{ display: "a", acceptedResponses: ["a"] }],
      sendMessage,
      timerSeconds: 10,
      onComplete,
    });
    await startRadar();
    rerender(
      <WordRadar
        items={[{ display: "a", acceptedResponses: ["a"] }]}
        interimTranscript="a"
        sendMessage={sendMessage}
        timerSeconds={10}
        showKeyboard={false}
        personalBests={{}}
        onComplete={onComplete}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS);
    });
    expect(screen.getByTestId("word-radar-phase").textContent).toBe("end");
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      "word_radar_complete",
      expect.objectContaining({ accuracy: expect.any(Number) }),
    );
  });

  it("typed match wins when showKeyboard true", async () => {
    renderRadar({
      items: [{ display: "hi", acceptedResponses: ["hi"] }],
      timerSeconds: 10,
      showKeyboard: true,
    });
    await startRadar();
    await act(() => {
      fireEvent.click(screen.getByTestId("word-radar-key-h"));
      fireEvent.click(screen.getByTestId("word-radar-key-i"));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("word-radar-phase").textContent).toBe("feedback");
  });

  it("wrong keyboard item plays a buzz and spends the retry penalty", async () => {
    const oscillatorStart = vi.fn();
    const oscillatorStop = vi.fn();
    const audioContext = {
      currentTime: 0,
      createOscillator: vi.fn(() => ({
        type: "sawtooth",
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: oscillatorStart,
        stop: oscillatorStop,
      })),
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      })),
      destination: {},
    };
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: vi.fn(() => audioContext),
    });
    renderRadar({
      items: [{ display: "hi", acceptedResponses: ["hi"] }],
      timerSeconds: 10,
      showKeyboard: true,
      inputMode: "keyboard",
      keyboardStyle: "option-b",
    });
    await startRadar();

    await act(async () => {
      fireEvent.click(screen.getByTestId("word-radar-key-x"));
    });

    expect(oscillatorStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("word-radar-btn-try-again")).toBeNull();
  });

  it("confidence bar renders when speakStyle=option-b and phase=response", async () => {
    const sendMessage = vi.fn();
    renderRadar({
      speakStyle: "option-b",
      timerSeconds: 10,
      sendMessage,
    });
    await startRadar();
    expect(screen.getByTestId("word-radar-confidence-bar")).toBeTruthy();
  });

  it("confidence bar does not render when speakStyle=option-a", async () => {
    const sendMessage = vi.fn();
    renderRadar({
      speakStyle: "option-a",
      timerSeconds: 10,
      sendMessage,
    });
    await startRadar();
    expect(screen.queryByTestId("word-radar-confidence-bar")).toBeNull();
  });

  it("confidence bar fill width reflects matchRatio", async () => {
    const sendMessage = vi.fn();
    const items: RadarItem[] = [{ display: "aa", acceptedResponses: ["aa"], label: "T", subject: "spelling" }];
    const { rerender } = renderRadar({
      items,
      speakStyle: "option-b",
      timerSeconds: 10,
      sendMessage,
    });
    await startRadar();
    rerender(
      <WordRadar
        items={items}
        interimTranscript="a"
        sendMessage={sendMessage}
        timerSeconds={10}
        showKeyboard={false}
        speakStyle="option-b"
        personalBests={{}}
        onComplete={vi.fn()}
      />,
    );
    const fill = screen.getByTestId("word-radar-confidence-fill");
    expect(fill).toHaveStyle({ width: "50%" });
  });

  it("matchRatio updates when interimTranscript prop changes during response phase (option-b)", async () => {
    const sendMessage = vi.fn();
    const items: RadarItem[] = [{ display: "aa", acceptedResponses: ["aa"], label: "T", subject: "spelling" }];
    const onComplete = vi.fn();
    const { rerender } = renderRadar({
      items,
      speakStyle: "option-b",
      timerSeconds: 10,
      sendMessage,
      interimTranscript: "",
    });
    await startRadar();
    const fill = screen.getByTestId("word-radar-confidence-fill");
    expect(fill).toHaveStyle({ width: "0%" });
    rerender(
      <WordRadar
        items={items}
        interimTranscript="a"
        sendMessage={sendMessage}
        timerSeconds={10}
        showKeyboard={false}
        speakStyle="option-b"
        personalBests={{}}
        onComplete={onComplete}
      />,
    );
    expect(fill).toHaveStyle({ width: "50%" });
  });

  it("partial recall option-b shows STT clue bar and length hint without letter boxes", async () => {
    renderRadar({
      recallMode: "partial_visual_recall",
      inputMode: "whole-word",
      speakStyle: "option-b",
      timerSeconds: 10,
    });
    await startRadar();
    expect(screen.queryByTestId("word-radar-letter-tile")).toBeNull();
    expect(screen.getByTestId("word-radar-confidence-bar")).toBeTruthy();
    expect(screen.getByTestId("word-radar-length-hint").textContent).toContain("letters");
  });

  it("full hidden recall option-b shows clue bar only (memory / test-day mode)", async () => {
    renderRadar({
      recallMode: "hidden_word_recall",
      inputMode: "whole-word",
      speakStyle: "option-b",
      timerSeconds: 10,
    });
    await startRadar();
    expect(screen.queryByTestId("word-radar-letter-tile")).toBeNull();
    expect(screen.queryByTestId("word-radar-length-hint")).toBeNull();
    expect(screen.getByTestId("word-radar-confidence-bar")).toBeTruthy();
  });

  it("letter-by-letter keeps fill-in boxes visible even when speakStyle=option-b", async () => {
    renderRadar({
      speakStyle: "option-b",
      inputMode: "letter-by-letter",
      recallMode: "partial_visual_recall",
      timerSeconds: 10,
    });
    await startRadar();
    expect(screen.getAllByTestId("word-radar-letter-tile")).toHaveLength(3);
  });

  it("audio-cued letter recall hides the flash word but keeps fill-in boxes", async () => {
    renderRadar({
      recallMode: "partial_visual_recall",
      inputMode: "letter-by-letter",
      speakStyle: "option-b",
      timerSeconds: 10,
      autoStart: true,
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("word-radar-phase").textContent).toBe("flash");
    expect(screen.getByTestId("word-radar-listen-prompt").textContent).toContain("Listen");
    expect(screen.queryByTestId("word-radar-flash-word")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1501);
    });

    expect(screen.getByTestId("word-radar-phase").textContent).toBe("response");
    expect(screen.getAllByTestId("word-radar-letter-tile").map((node) => node.textContent)).toEqual([
      "",
      "",
      "",
    ]);
  });

  it("partial_visual_recall uses full empty letter boxes like main branch", async () => {
    renderRadar({
      recallMode: "partial_visual_recall",
      inputMode: "letter-by-letter",
      speakStyle: "option-a",
      timerSeconds: 10,
    });
    await startRadar();

    const tiles = screen.getAllByTestId("word-radar-letter-tile");
    expect(tiles).toHaveLength(3);
    expect(tiles.map((node) => node.textContent)).toEqual(["", "", ""]);
    expect(tiles[0]).toHaveStyle({ minWidth: "44px", minHeight: "60px" });
  });

  it("letter tiles rendered during response when speakStyle=option-a", async () => {
    renderRadar({ speakStyle: "option-a", timerSeconds: 10 });
    await startRadar();
    expect(screen.getAllByTestId("word-radar-letter-tile")).toHaveLength(3);
  });

  it("visible_read response does not keep the whole word on screen", async () => {
    renderRadar({
      recallMode: "visible_read",
      speakStyle: "option-a",
      timerSeconds: 10,
      requiresCapturedResponse: false,
    });
    await startRadar();

    expect(screen.getByTestId("word-radar-recall-mode").textContent).toBe("visible_read");
    expect(screen.queryByTestId("word-radar-visible-word")).toBeNull();
    expect(screen.getAllByTestId("word-radar-letter-tile").map((node) => node.textContent)).toEqual([
      "",
      "",
      "",
    ]);
  });

  it("keeps visible_read from becoming a copy-the-word task when response capture is required", async () => {
    renderRadar({ recallMode: "visible_read", speakStyle: "option-a", timerSeconds: 10 });
    await startRadar();

    expect(screen.getByTestId("word-radar-recall-mode").textContent).toBe("visible_read");
    expect(screen.queryByTestId("word-radar-visible-word")).toBeNull();
    expect(screen.getAllByTestId("word-radar-letter-tile").map((node) => node.textContent)).toEqual([
      "",
      "",
      "",
    ]);
  });

  it("partial_visual_recall mode hides the full word and labels scaffold as a length hint", async () => {
    renderRadar({ recallMode: "partial_visual_recall", speakStyle: "option-a", timerSeconds: 10 });
    await startRadar();

    expect(screen.getByTestId("word-radar-recall-mode").textContent).toBe("partial_visual_recall");
    expect(screen.getByTestId("word-radar-mode-label").textContent).not.toContain("boxes");
    expect(screen.getAllByTestId("word-radar-letter-tile")).toHaveLength(3);
    expect(screen.getByTestId("word-radar-length-hint").textContent).toContain("3 letters");
    expect(screen.getAllByTestId("word-radar-letter-tile").map((node) => node.textContent)).toEqual([
      "",
      "",
      "",
    ]);
  });

  it("partial_visual_recall flashes the whole word first, then shows empty slots", async () => {
    renderRadar({ recallMode: "partial_visual_recall", speakStyle: "option-a", timerSeconds: 10 });
    fireEvent.click(screen.getByTestId("word-radar-ready"));

    expect(screen.getByTestId("word-radar-phase").textContent).toBe("flash");
    expect(screen.getByTestId("word-radar-flash-word").textContent).toBe("sun");

    await act(async () => {
      vi.advanceTimersByTime(1501);
    });

    expect(screen.getByTestId("word-radar-phase").textContent).toBe("response");
    expect(screen.queryByTestId("word-radar-flash-word")).toBeNull();
    expect(screen.getAllByTestId("word-radar-letter-tile").map((node) => node.textContent)).toEqual([
      "",
      "",
      "",
    ]);
  });

  it("letter-by-letter fills tiles as the child speaks each letter", async () => {
    const sendMessage = vi.fn();
    const onComplete = vi.fn();
    const { rerender } = renderRadar({
      inputMode: "letter-by-letter",
      recallMode: "partial_visual_recall",
      speakStyle: "option-a",
      timerSeconds: 10,
      sendMessage,
      onComplete,
    });
    await startRadar();
    expect(screen.getByTestId("word-radar-mode-label").textContent).toContain("Spell it out loud");
    expect(screen.getAllByTestId("word-radar-letter-tile").map((node) => node.textContent)).toEqual([
      "",
      "",
      "",
    ]);

    rerender(
      <WordRadar
        items={sampleItems}
        interimTranscript="s"
        sendMessage={sendMessage}
        timerSeconds={10}
        inputMode="letter-by-letter"
        recallMode="partial_visual_recall"
        speakStyle="option-a"
        personalBests={{}}
        onComplete={onComplete}
      />,
    );
    expect(screen.getAllByTestId("word-radar-letter-tile").map((node) => node.textContent)).toEqual([
      "s",
      "",
      "",
    ]);

    rerender(
      <WordRadar
        items={sampleItems}
        interimTranscript="s u"
        sendMessage={sendMessage}
        timerSeconds={10}
        inputMode="letter-by-letter"
        recallMode="partial_visual_recall"
        speakStyle="option-a"
        personalBests={{}}
        onComplete={onComplete}
      />,
    );
    expect(screen.getAllByTestId("word-radar-letter-tile").map((node) => node.textContent)).toEqual([
      "s",
      "u",
      "",
    ]);
  });

  it("hidden_word_recall mode removes the visual answer context during response", async () => {
    renderRadar({ recallMode: "hidden_word_recall", speakStyle: "option-b", timerSeconds: 10 });
    await startRadar();

    expect(screen.getByTestId("word-radar-recall-mode").textContent).toBe("hidden_word_recall");
    expect(screen.queryByTestId("word-radar-letter-tile")).toBeNull();
  });

  it("hidden_word_recall uses a listen prompt instead of flashing the answer word", async () => {
    renderRadar({ recallMode: "hidden_word_recall", speakStyle: "option-b", autoStart: true });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("word-radar-phase").textContent).toBe("flash");
    expect(screen.getByTestId("word-radar-listen-prompt").textContent).toContain("Listen");
    expect(screen.queryByTestId("word-radar-flash-word")).toBeNull();
    expect(screen.queryByText("sun")).toBeNull();
  });

  it("does not mark hidden recall as mastery eligible without a captured response", async () => {
    const onComplete = vi.fn();
    renderRadar({
      items: [sampleItems[0]!],
      recallMode: "hidden_word_recall",
      speakStyle: "option-b",
      timerSeconds: 1,
      onComplete,
    });
    await startRadar();
    await act(async () => {
      fireEvent.click(screen.getByTestId("word-radar-btn-skip"));
    });
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS + 1);
    });
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_END_SCREEN_MS + 1);
    });

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      recallMode: "hidden_word_recall",
      masteryEligible: false,
    }));
  });

  it("downgrades noisy hidden recall captures instead of marking them as mastery", async () => {
    const onComplete = vi.fn();
    const { rerender } = renderRadar({
      items: [sampleItems[0]!],
      recallMode: "hidden_word_recall",
      speakStyle: "option-b",
      timerSeconds: 10,
      onComplete,
    });
    await startRadar();
    rerender(
      <WordRadar
        items={[sampleItems[0]!]}
        interimTranscript="sun sun"
        sendMessage={vi.fn()}
        timerSeconds={10}
        showKeyboard={false}
        recallMode="hidden_word_recall"
        speakStyle="option-b"
        personalBests={{}}
        onComplete={onComplete}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS);
    });
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_END_SCREEN_MS + 1);
    });

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      masteryEligible: false,
      evidenceTier: "practice",
      targetResults: [
        expect.objectContaining({
          target: "sun",
          masteryEligible: false,
          evidenceTier: "practice",
          attemptedValue: "sun sun",
        }),
      ],
    }));
  });

  it("tiles reveal on feedback phase when speakStyle=option-b", async () => {
    const { rerender } = renderRadar({ speakStyle: "option-b", timerSeconds: 10 });
    await startRadar();
    expect(screen.queryByTestId("word-radar-letter-tile")).toBeNull();
    rerender(
      <WordRadar
        items={sampleItems}
        interimTranscript="sun"
        sendMessage={vi.fn()}
        timerSeconds={10}
        showKeyboard={false}
        speakStyle="option-b"
        personalBests={{}}
        onComplete={vi.fn()}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("word-radar-phase").textContent).toBe("feedback");
    expect(screen.getAllByTestId("word-radar-letter-tile").map((n) => n.textContent)).toEqual([
      "s",
      "u",
      "n",
    ]);
  });

  it("confidence bar fill stays hidden for option-a when interim changes", async () => {
    const sendMessage = vi.fn();
    const items: RadarItem[] = [{ display: "aa", acceptedResponses: ["aa"], label: "T", subject: "spelling" }];
    const { rerender } = renderRadar({
      items,
      speakStyle: "option-a",
      timerSeconds: 10,
      sendMessage,
      interimTranscript: "",
    });
    await startRadar();
    expect(screen.queryByTestId("word-radar-confidence-fill")).toBeNull();
    rerender(
      <WordRadar
        items={items}
        interimTranscript="a"
        sendMessage={sendMessage}
        timerSeconds={10}
        showKeyboard={false}
        speakStyle="option-a"
        personalBests={{}}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("word-radar-confidence-fill")).toBeNull();
  });
});
