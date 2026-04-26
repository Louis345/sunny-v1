import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { WordRadar } from "../components/WordRadar";
import type { RadarItem } from "../components/WordRadar";
import { WORD_RADAR_FEEDBACK_MS } from "../hooks/useWordRadar";

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

  it("letter tiles are blank during response phase", async () => {
    renderRadar();
    await startRadar();
    expect(screen.getAllByTestId("word-radar-letter-tile").map((n) => n.textContent)).toEqual([
      "",
      "",
      "",
    ]);
  });

  it("letter-by-letter mode locks spoken letters left to right", async () => {
    const { rerender } = renderRadar({ inputMode: "letter-by-letter" });
    await startRadar();

    rerender(
      <WordRadar
        items={sampleItems}
        interimTranscript="s u"
        sendMessage={vi.fn()}
        showKeyboard={false}
        inputMode="letter-by-letter"
        personalBests={{}}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId("word-radar-letter-tile").map((n) => n.textContent)).toEqual([
      "s",
      "u",
      "",
    ]);
  });

  it("Skip button visible during response phase", async () => {
    renderRadar({ timerSeconds: 10 });
    await startRadar();
    expect(screen.getByTestId("word-radar-btn-skip")).toBeTruthy();
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
