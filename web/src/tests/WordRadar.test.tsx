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

  it("sends a config audit event to explain hidden-word and input-mode choices", () => {
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
          type: "word_radar_config_audit",
          payload: expect.objectContaining({
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

  it("automatically requests current word audio when hidden visual recall asks for speech", async () => {
    const sendMessage = vi.fn();
    renderRadar({
      timerSeconds: 10,
      sendMessage,
      childId: "ila",
      recallMode: "partial_visual_recall",
      speakStyle: "option-a",
    });
    await startRadar();

    expect(sendMessage).toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "narration_request",
          payload: expect.objectContaining({
            game: "word-radar",
            childId: "ila",
            word: "sun",
            reason: "word_radar_response_prompt",
          }),
        }),
      }),
    );
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

  it("letter tiles not rendered during response when speakStyle=option-b", async () => {
    renderRadar({ speakStyle: "option-b", timerSeconds: 10 });
    await startRadar();
    expect(screen.queryByTestId("word-radar-letter-tile")).toBeNull();
  });

  it("letter tiles rendered during response when speakStyle=option-a", async () => {
    renderRadar({ speakStyle: "option-a", timerSeconds: 10 });
    await startRadar();
    expect(screen.getAllByTestId("word-radar-letter-tile")).toHaveLength(3);
  });

  it("visible_read mode shows the word while the child responds", async () => {
    renderRadar({
      recallMode: "visible_read",
      speakStyle: "option-a",
      timerSeconds: 10,
      requiresCapturedResponse: false,
    });
    await startRadar();

    expect(screen.getByTestId("word-radar-recall-mode").textContent).toBe("visible_read");
    expect(screen.getAllByTestId("word-radar-letter-tile").map((node) => node.textContent)).toEqual([
      "s",
      "u",
      "n",
    ]);
  });

  it("repairs visible_read to partial recall when response capture is required", async () => {
    renderRadar({ recallMode: "visible_read", speakStyle: "option-a", timerSeconds: 10 });
    await startRadar();

    expect(screen.getByTestId("word-radar-recall-mode").textContent).toBe("partial_visual_recall");
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
