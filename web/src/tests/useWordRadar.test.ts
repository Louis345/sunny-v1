import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useWordRadar,
  computeMatchRatio,
  bucketCorrectItem,
  shouldShowPersonalBestBadge,
  WORD_RADAR_FLASH_MS,
  WORD_RADAR_FEEDBACK_MS,
  WORD_RADAR_END_SCREEN_MS,
} from "../hooks/useWordRadar";
import type { RadarItem, WordRadarResult } from "../components/WordRadar";

const SLOW_PB_MS = 5000;

const catItem: RadarItem = {
  display: "cat",
  acceptedResponses: ["cat", "kat"],
};
const dogItem: RadarItem = { display: "dog", acceptedResponses: ["dog"] };
const elephantItem: RadarItem = {
  display: "elephant",
  acceptedResponses: ["elephant"],
};

function flushMicrotasks() {
  return act(async () => {
    await Promise.resolve();
  });
}

async function enterResponse() {
  await act(async () => {
    vi.advanceTimersByTime(WORD_RADAR_FLASH_MS);
  });
}

describe("computeMatchRatio", () => {
  it('computeMatchRatio("eleph", "elephant") is 5/8', () => {
    expect(computeMatchRatio("eleph", "elephant")).toBeCloseTo(0.625, 5);
  });

  it("computeMatchRatio full word returns 1", () => {
    expect(computeMatchRatio("elephant", "elephant")).toBe(1);
  });

  it("computeMatchRatio empty heard returns 0", () => {
    expect(computeMatchRatio("", "elephant")).toBe(0);
  });

  it("computeMatchRatio no ordered overlap returns 0", () => {
    expect(computeMatchRatio("xyz", "elephant")).toBe(0);
  });
});

describe("useWordRadar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("matchRatio updates when interimTranscript changes in response phase", async () => {
    const { result, rerender } = renderHook(
      (props: { interim: string }) =>
        useWordRadar({
          items: [elephantItem],
          interimTranscript: props.interim,
          inputMode: "keyboard",
          showKeyboard: true,
          personalBests: {},
          onFinish: vi.fn(),
        }),
      { initialProps: { interim: "" } },
    );
    await enterResponse();
    expect(result.current.matchRatio).toBe(0);
    rerender({ interim: "eleph" });
    expect(result.current.matchRatio).toBeCloseTo(0.625, 5);
    rerender({ interim: "elephant" });
    expect(result.current.matchRatio).toBe(1);
  });

  it("matchRatio resets to 0 on new item after advancing", async () => {
    const onFinish = vi.fn();
    const { result, rerender } = renderHook(
      (props: { interim: string }) =>
        useWordRadar({
          items: [catItem, dogItem],
          interimTranscript: props.interim,
          personalBests: {},
          onFinish,
        }),
      { initialProps: { interim: "" } },
    );
    await enterResponse();
    rerender({ interim: "ca" });
    expect(result.current.matchRatio).toBeGreaterThan(0);
    rerender({ interim: "cat" });
    await flushMicrotasks();
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS);
    });
    expect(result.current.itemIndex).toBe(1);
    expect(result.current.phase).toBe("flash");
    rerender({ interim: "" });
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FLASH_MS);
    });
    expect(result.current.phase).toBe("response");
    expect(result.current.matchRatio).toBe(0);
  });

  it("STT match on whole word auto-advances without override delay", async () => {
    const onFinish = vi.fn();
    const { result, rerender } = renderHook(
      (props: { interim: string }) =>
        useWordRadar({
          items: [catItem, dogItem],
          interimTranscript: props.interim,
          personalBests: {},
          onFinish,
        }),
      { initialProps: { interim: "" } },
    );
    await enterResponse();
    expect(result.current.phase).toBe("response");

    rerender({ interim: "cat" });
    await flushMicrotasks();
    expect(result.current.phase).toBe("feedback");
    expect(result.current.lastFeedback).toBe("got");

    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS);
    });
    expect(result.current.itemIndex).toBe(1);
    expect(result.current.phase).toBe("flash");
  });

  it("handleSkip marks item as unknown and advances", async () => {
    const onFinish = vi.fn();
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem, dogItem],
        interimTranscript: "",
        personalBests: {},
        onFinish,
      }),
    );
    await enterResponse();
    await act(async () => {
      result.current.handleSkip();
    });
    expect(result.current.phase).toBe("feedback");
    expect(result.current.lastFeedback).toBe("missed");
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS);
    });
    expect(result.current.itemIndex).toBe(1);
  });

  it('handleSkip fires onEvent with type "incorrect" and reason "skip"', async () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem],
        interimTranscript: "",
        personalBests: {},
        onFinish: vi.fn(),
        onEvent,
      }),
    );
    await enterResponse();
    await act(async () => {
      result.current.handleSkip();
    });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "incorrect", reason: "skip" }),
    );
  });

  it("handleTryAgain resets timerRemainingRatio to 1", async () => {
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem],
        interimTranscript: "",
        timerSeconds: 10,
        personalBests: {},
        onFinish: vi.fn(),
      }),
    );
    await enterResponse();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.timerRemainingRatio).toBeLessThan(1);
    await act(async () => {
      result.current.handleTryAgain();
    });
    expect(result.current.timerRemainingRatio).toBe(1);
  });

  it("handleTryAgain resets typedBuffer to empty", async () => {
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem],
        interimTranscript: "",
        inputMode: "keyboard",
        keyboardStyle: "option-c",
        personalBests: {},
        onFinish: vi.fn(),
        showKeyboard: true,
      }),
    );
    await enterResponse();
    await act(async () => {
      result.current.setTypedBuffer("ca");
    });
    expect(result.current.typedBuffer).toBe("ca");
    await act(async () => {
      result.current.handleTryAgain();
    });
    expect(result.current.typedBuffer).toBe("");
  });

  it("handleTryAgain resets matchRatio to 0 until interim changes", async () => {
    const { result, rerender } = renderHook(
      (props: { interim: string }) =>
        useWordRadar({
          items: [elephantItem],
          interimTranscript: props.interim,
          inputMode: "keyboard",
          showKeyboard: true,
          personalBests: {},
          onFinish: vi.fn(),
        }),
      { initialProps: { interim: "" } },
    );
    await enterResponse();
    rerender({ interim: "eleph" });
    expect(result.current.matchRatio).toBeGreaterThan(0);
    await act(async () => {
      result.current.handleTryAgain();
    });
    expect(result.current.matchRatio).toBe(0);
    rerender({ interim: "elephant" });
    expect(result.current.matchRatio).toBe(1);
  });

  it("handleTryAgain sets canTryAgain to false", async () => {
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem],
        interimTranscript: "",
        personalBests: {},
        onFinish: vi.fn(),
      }),
    );
    await enterResponse();
    expect(result.current.canTryAgain).toBe(true);
    await act(async () => {
      result.current.handleTryAgain();
    });
    expect(result.current.canTryAgain).toBe(false);
  });

  it("handleTryAgain does not advance item", async () => {
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem, dogItem],
        interimTranscript: "",
        personalBests: {},
        onFinish: vi.fn(),
      }),
    );
    await enterResponse();
    expect(result.current.itemIndex).toBe(0);
    await act(async () => {
      result.current.handleTryAgain();
    });
    expect(result.current.itemIndex).toBe(0);
  });

  it("second attempt match after tryAgain scores as weak not known", async () => {
    const onFinish = vi.fn();
    const { result, rerender } = renderHook(
      (props: { interim: string }) =>
        useWordRadar({
          items: [catItem],
          interimTranscript: props.interim,
          personalBests: {},
          onFinish,
        }),
      { initialProps: { interim: "" } },
    );
    await enterResponse();
    await act(async () => {
      result.current.handleTryAgain();
    });
    rerender({ interim: "cat" });
    await flushMicrotasks();
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS + WORD_RADAR_END_SCREEN_MS);
    });
    const r = onFinish.mock.calls[0]![0] as WordRadarResult;
    expect(r.weakItems).toHaveLength(1);
    expect(r.knownItems).toHaveLength(0);
    expect(r.rawResults[0]?.attempts).toBe(2);
  });

  it("counts weak-but-correct responses toward accuracy", async () => {
    const onFinish = vi.fn();
    const { result, rerender } = renderHook(
      (props: { interim: string }) =>
        useWordRadar({
          items: [catItem],
          interimTranscript: props.interim,
          personalBests: {},
          onFinish,
        }),
      { initialProps: { interim: "" } },
    );
    await enterResponse();
    await act(async () => {
      result.current.handleTryAgain();
    });
    rerender({ interim: "cat" });
    await flushMicrotasks();
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS + WORD_RADAR_END_SCREEN_MS);
    });

    const r = onFinish.mock.calls[0]![0] as WordRadarResult;
    expect(r.weakItems).toHaveLength(1);
    expect(r.accuracy).toBe(1);
  });


  it("timer expiry auto-advances and marks unknown without any button tap", async () => {
    const onEvent = vi.fn();
    const onFinish = vi.fn();
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem],
        interimTranscript: "",
        timerSeconds: 10,
        personalBests: {},
        onFinish,
        onEvent,
      }),
    );
    await enterResponse();
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "timeout" }));
    expect(result.current.phase).toBe("feedback");
    expect(result.current.lastFeedback).toBe("missed");
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS + WORD_RADAR_END_SCREEN_MS);
    });
    const r = onFinish.mock.calls[0]![0] as WordRadarResult;
    expect(r.unknownItems).toHaveLength(1);
  });

  it("canTryAgain is true on first item load (response phase)", async () => {
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem],
        interimTranscript: "",
        personalBests: {},
        onFinish: vi.fn(),
      }),
    );
    await enterResponse();
    expect(result.current.canTryAgain).toBe(true);
    expect(result.current.attemptCount).toBe(1);
  });

  it("canTryAgain resets to true on new item after using Try Again on prior item", async () => {
    const { result, rerender } = renderHook(
      (props: { interim: string }) =>
        useWordRadar({
          items: [catItem, dogItem],
          interimTranscript: props.interim,
          personalBests: {},
          onFinish: vi.fn(),
        }),
      { initialProps: { interim: "" } },
    );
    await enterResponse();
    await act(async () => {
      result.current.handleTryAgain();
    });
    expect(result.current.canTryAgain).toBe(false);
    rerender({ interim: "cat" });
    await flushMicrotasks();
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS + WORD_RADAR_FLASH_MS);
    });
    expect(result.current.itemIndex).toBe(1);
    expect(result.current.canTryAgain).toBe(true);
    expect(result.current.attemptCount).toBe(1);
  });

  it("whole-word inputMode reads from args and matches without interim tile fill", async () => {
    const { result, rerender } = renderHook(
      (props: { interim: string }) =>
        useWordRadar({
          items: [catItem],
          interimTranscript: props.interim,
          inputMode: "whole-word",
          speakStyle: "option-a",
          personalBests: {},
          onFinish: vi.fn(),
        }),
      { initialProps: { interim: "" } },
    );
    await enterResponse();
    rerender({ interim: "cat" });
    await flushMicrotasks();
    expect(result.current.responseLetters).toEqual([]);
  });

  it('letter-by-letter: correct letter advances cursor to next tile', async () => {
    const { result, rerender } = renderHook(
      (props: { interim: string }) =>
        useWordRadar({
          items: [catItem],
          interimTranscript: props.interim,
          inputMode: "letter-by-letter",
          personalBests: {},
          onFinish: vi.fn(),
        }),
      { initialProps: { interim: "" } },
    );
    await enterResponse();
    rerender({ interim: "c" });
    await flushMicrotasks();
    expect(result.current.lockedLetters).toEqual(["c"]);
    expect(result.current.letterCursor).toBe(1);
  });

  it("letter-by-letter: wrong speech shakes only; no buzz and no Try Again penalty", async () => {
    const oscillatorStart = vi.fn();
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
        stop: vi.fn(),
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
    const { result, rerender } = renderHook(
      (props: { interim: string }) =>
        useWordRadar({
          items: [catItem],
          interimTranscript: props.interim,
          inputMode: "letter-by-letter",
          personalBests: {},
          onFinish: vi.fn(),
        }),
      { initialProps: { interim: "" } },
    );
    await enterResponse();
    rerender({ interim: "x" });
    await flushMicrotasks();
    expect(result.current.letterCursor).toBe(0);
    expect(result.current.shakeLetterIndex).toBe(0);
    expect(result.current.canTryAgain).toBe(true);
    expect(oscillatorStart).not.toHaveBeenCalled();
  });

  it('letter-by-letter: phonetic alias "see" matches "c"', async () => {
    const { result, rerender } = renderHook(
      (props: { interim: string }) =>
        useWordRadar({
          items: [catItem],
          interimTranscript: props.interim,
          inputMode: "letter-by-letter",
          personalBests: {},
          onFinish: vi.fn(),
        }),
      { initialProps: { interim: "" } },
    );
    await enterResponse();
    rerender({ interim: "see" });
    await flushMicrotasks();
    expect(result.current.lockedLetters).toEqual(["c"]);
  });

  it("keyboard option-c: free type keeps tiles pending until complete", async () => {
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem],
        interimTranscript: "",
        inputMode: "keyboard",
        keyboardStyle: "option-c",
        personalBests: {},
        onFinish: vi.fn(),
      }),
    );
    await enterResponse();
    await act(async () => result.current.setTypedBuffer("ca"));
    expect(result.current.lockedLetters).toEqual([]);
    expect(result.current.typedBuffer).toBe("ca");
  });

  it("keyboard option-b: correct letter locks tile green", async () => {
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem],
        interimTranscript: "",
        inputMode: "keyboard",
        keyboardStyle: "option-b",
        personalBests: {},
        onFinish: vi.fn(),
      }),
    );
    await enterResponse();
    await act(async () => result.current.appendTypedKey("c"));
    expect(result.current.lockedLetters).toEqual(["c"]);
  });

  it("keyboard option-b: wrong letter shakes tile only", async () => {
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem],
        interimTranscript: "",
        inputMode: "keyboard",
        keyboardStyle: "option-b",
        personalBests: {},
        onFinish: vi.fn(),
      }),
    );
    await enterResponse();
    await act(async () => result.current.appendTypedKey("x"));
    expect(result.current.lockedLetters).toEqual([]);
    expect(result.current.shakeLetterIndex).toBe(0);
  });

  it("keyboard correct full word auto-advances without override delay", async () => {
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem],
        interimTranscript: "",
        personalBests: {},
        onFinish: vi.fn(),
        showKeyboard: true,
      }),
    );
    await enterResponse();
    await act(async () => {
      result.current.setTypedBuffer("cat");
    });
    await flushMicrotasks();
    expect(result.current.phase).toBe("feedback");
    expect(result.current.lastFeedback).toBe("got");
  });

  it("keyboard wrong full word shakes and clears, does not advance", async () => {
    const onFinish = vi.fn();
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem],
        interimTranscript: "",
        personalBests: {},
        onFinish,
        showKeyboard: true,
      }),
    );
    await enterResponse();
    await act(async () => {
      result.current.setTypedBuffer("car");
    });
    await flushMicrotasks();
    expect(result.current.shakeKeyboard).toBe(true);
    expect(result.current.typedBuffer).toBe("");
    expect(result.current.phase).toBe("response");
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("backspace removes last character from typedBuffer", async () => {
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem],
        interimTranscript: "",
        personalBests: {},
        onFinish: vi.fn(),
        showKeyboard: true,
      }),
    );
    await enterResponse();
    await act(async () => {
      result.current.appendTypedKey("c");
      result.current.appendTypedKey("a");
    });
    expect(result.current.typedBuffer).toBe("ca");
    await act(async () => {
      result.current.appendTypedKey("Backspace");
    });
    expect(result.current.typedBuffer).toBe("c");
  });

  it("hook does not expose heardToken / heardTranscript (no letter-by-letter STT)", () => {
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem],
        interimTranscript: "",
        personalBests: {},
        onFinish: vi.fn(),
      }),
    );
    expect("heardToken" in result.current).toBe(false);
    expect("heardTranscript" in result.current).toBe(false);
  });

  it("incorrect spoken word does not advance or resolve", async () => {
    const onFinish = vi.fn();
    const { result, rerender } = renderHook(
      (props: { interim: string }) =>
        useWordRadar({
          items: [catItem],
          interimTranscript: props.interim,
          personalBests: {},
          onFinish,
        }),
      { initialProps: { interim: "" } },
    );
    await enterResponse();
    rerender({ interim: "xyz" });
    await flushMicrotasks();
    expect(result.current.itemIndex).toBe(0);
    expect(result.current.phase).toBe("response");
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("stays in response when timerSeconds is omitted even after long elapsed", async () => {
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem],
        interimTranscript: "",
        personalBests: {},
        onFinish: vi.fn(),
      }),
    );
    await enterResponse();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.phase).toBe("response");
  });

  it("keyboard wrong then correct on first attempt scores as known", async () => {
    const onFinish = vi.fn();
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem],
        interimTranscript: "",
        personalBests: {},
        onFinish,
        showKeyboard: true,
      }),
    );
    await enterResponse();
    await act(async () => {
      result.current.setTypedBuffer("car");
    });
    await flushMicrotasks();
    await act(async () => {
      result.current.setTypedBuffer("cat");
    });
    await flushMicrotasks();
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS + WORD_RADAR_END_SCREEN_MS);
    });
    const r = onFinish.mock.calls[0]![0] as WordRadarResult;
    expect(r.knownItems).toHaveLength(1);
    expect(r.weakItems).toHaveLength(0);
    expect(r.rawResults[0]?.attempts).toBe(1);
  });

  it("responseTime_ms recorded on every item regardless of showTimer", async () => {
    const onFinish = vi.fn();
    const { rerender } = renderHook(
      (props: { interim: string }) =>
        useWordRadar({
          items: [catItem],
          interimTranscript: props.interim,
          personalBests: {},
          onFinish,
        }),
      { initialProps: { interim: "" } },
    );
    await enterResponse();
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    rerender({ interim: "cat" });
    await flushMicrotasks();
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS + WORD_RADAR_END_SCREEN_MS);
    });
    const r = onFinish.mock.calls[0]![0] as WordRadarResult;
    expect(r.rawResults[0]?.responseTime_ms).toBeGreaterThanOrEqual(200);
  });

  it("records full letter-by-letter response when speech arrives in fragments", async () => {
    const onFinish = vi.fn();
    const { rerender } = renderHook(
      (props: { interim: string }) =>
        useWordRadar({
          items: [{ display: "thumb", acceptedResponses: ["thumb"] }],
          interimTranscript: props.interim,
          inputMode: "letter-by-letter",
          personalBests: {},
          onFinish,
        }),
      { initialProps: { interim: "" } },
    );

    await enterResponse();
    for (const interim of ["t", "h", "u", "m", "b"]) {
      rerender({ interim });
      await flushMicrotasks();
    }
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS + WORD_RADAR_END_SCREEN_MS);
    });

    const r = onFinish.mock.calls[0]![0] as WordRadarResult;
    expect(r.rawResults[0]).toMatchObject({
      correct: true,
      typedResponse: "thumb",
      capturedLetters: ["t", "h", "u", "m", "b"],
      normalizedResponse: "thumb",
      matchReason: "spoken_letter_sequence_complete",
    });
  });

  it("known/weak/unknown classification correct across all three cases", () => {
    expect(bucketCorrectItem(catItem, 100, 1, {})).toBe("known");
    expect(bucketCorrectItem(catItem, 100, 1, { cat: 50 })).toBe("weak");
    expect(bucketCorrectItem(catItem, 40, 1, { cat: 50 })).toBe("known");
    expect(bucketCorrectItem(catItem, 40, 2, {})).toBe("weak");
  });

  it("personalBest not shown when personalBests record is empty", () => {
    expect(shouldShowPersonalBestBadge(10, {}, "cat")).toBe(false);
  });

  it("personalBest shown when record exists and timerSeconds is set", () => {
    expect(shouldShowPersonalBestBadge(10, { cat: 1200 }, "cat")).toBe(true);
    expect(shouldShowPersonalBestBadge(undefined, { cat: 1200 }, "cat")).toBe(false);
  });

  it("onComplete fires with correct knownItems/weakItems/unknownItems counts", async () => {
    const onFinish = vi.fn();
    const { result, rerender } = renderHook(
      (props: { interim: string }) =>
        useWordRadar({
          items: [catItem, dogItem, { display: "pig", acceptedResponses: ["pig"] }],
          interimTranscript: props.interim,
          timerSeconds: 10,
          inputMode: "whole-word",
          personalBests: { cat: SLOW_PB_MS },
          onFinish,
          showKeyboard: true,
        }),
      { initialProps: { interim: "" } },
    );
    await enterResponse();
    await act(async () => {
      vi.advanceTimersByTime(SLOW_PB_MS + 100);
    });
    rerender({ interim: "cat" });
    await flushMicrotasks();
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS);
    });
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FLASH_MS);
    });

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    await flushMicrotasks();
    expect(result.current.phase).toBe("feedback");
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS);
    });
    rerender({ interim: "" });
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FLASH_MS);
    });

    await act(async () => {
      result.current.setTypedBuffer("pig");
    });
    await flushMicrotasks();
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS + WORD_RADAR_END_SCREEN_MS);
    });
    await flushMicrotasks();

    expect(onFinish).toHaveBeenCalledTimes(1);
    const r = onFinish.mock.calls[0]![0] as WordRadarResult;
    expect(r.knownItems).toHaveLength(1);
    expect(r.unknownItems).toHaveLength(1);
    expect(r.weakItems).toHaveLength(1);
  });

  it("accuracy = correct raw results / totalItems", async () => {
    const onFinish = vi.fn();
    const { rerender } = renderHook(
      (props: { interim: string }) =>
        useWordRadar({
          items: [catItem, dogItem],
          interimTranscript: props.interim,
          personalBests: {},
          onFinish,
        }),
      { initialProps: { interim: "" } },
    );
    await enterResponse();
    rerender({ interim: "cat" });
    await flushMicrotasks();
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS);
    });
    await enterResponse();
    rerender({ interim: "dog" });
    await flushMicrotasks();
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS + WORD_RADAR_END_SCREEN_MS);
    });
    const r = onFinish.mock.calls[0]![0] as WordRadarResult;
    expect(r.accuracy).toBe(2 / 2);
    expect(r.knownItems).toHaveLength(2);
  });

  it("tryAgain then timeout marks unknown with attempts 2", async () => {
    const onFinish = vi.fn();
    const { result } = renderHook(() =>
      useWordRadar({
        items: [catItem],
        interimTranscript: "",
        timerSeconds: 10,
        personalBests: {},
        onFinish,
      }),
    );
    await enterResponse();
    await act(async () => {
      result.current.handleTryAgain();
    });
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    await act(async () => {
      vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS + WORD_RADAR_END_SCREEN_MS);
    });
    const r = onFinish.mock.calls[0]![0] as WordRadarResult;
    expect(r.unknownItems).toHaveLength(1);
    expect(r.rawResults[0]?.attempts).toBe(2);
  });
});
