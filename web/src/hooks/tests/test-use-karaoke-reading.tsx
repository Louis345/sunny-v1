import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useKaraokeReading } from "../useKaraokeReading";

describe("useKaraokeReading", () => {
  afterEach(() => {
    cleanup();
  });

  it("wordIndex advances when interimTranscript matches expected word", () => {
    const words = ["hello", "world"];
    const sendMsg = vi.fn();
    const { result } = renderHook(
      (interim: string) =>
        useKaraokeReading({ words, interimTranscript: interim, sendMessage: sendMsg }),
      { initialProps: "hello" },
    );
    expect(result.current.wordIndex).toBe(1);
    expect(result.current.isComplete).toBe(false);
  });

  it("wordIndex does not advance on mismatch", () => {
    const words = ["hello"];
    const sendMsg = vi.fn();
    const { result } = renderHook(
      (interim: string) =>
        useKaraokeReading({ words, interimTranscript: interim, sendMessage: sendMsg }),
      { initialProps: "xyz" },
    );
    expect(result.current.wordIndex).toBe(0);
  });

  it("handleSkipWord advances wordIndex and adds to skippedIndices", () => {
    const words = ["one", "two", "three"];
    const sendMsg = vi.fn();
    const { result } = renderHook(
      (interim: string) =>
        useKaraokeReading({ words, interimTranscript: interim, sendMessage: sendMsg }),
      { initialProps: "" },
    );
    act(() => {
      result.current.handleSkipWord(0);
    });
    expect(result.current.wordIndex).toBe(1);
    expect(result.current.skippedIndices).toContain(0);
  });

  it("handleSkipWord on non-current index does nothing", () => {
    const words = ["a", "b", "c"];
    const sendMsg = vi.fn();
    const { result } = renderHook(
      (interim: string) =>
        useKaraokeReading({ words, interimTranscript: interim, sendMessage: sendMsg }),
      { initialProps: "" },
    );
    act(() => {
      result.current.handleSkipWord(2); // current is 0, not 2
    });
    expect(result.current.wordIndex).toBe(0);
    expect(result.current.skippedIndices).toEqual([]);
  });

  it("isComplete true when wordIndex reaches words.length", () => {
    const words = ["a", "b"];
    const sendMsg = vi.fn();
    const { result } = renderHook(
      (interim: string) =>
        useKaraokeReading({ words, interimTranscript: interim, sendMessage: sendMsg }),
      { initialProps: "" },
    );
    act(() => {
      result.current.handleSkipWord(0);
    });
    expect(result.current.isComplete).toBe(false);
    act(() => {
      result.current.handleSkipWord(1);
    });
    expect(result.current.isComplete).toBe(true);
    expect(result.current.wordIndex).toBe(2);
  });

  it("flaggedWords accumulates after 3 consecutive mismatches on same word", () => {
    const words = ["hello"];
    const sendMsg = vi.fn();
    const { result, rerender } = renderHook(
      (interim: string) =>
        useKaraokeReading({ words, interimTranscript: interim, sendMessage: sendMsg }),
      { initialProps: "" },
    );
    expect(result.current.flaggedWords).toEqual([]);
    // Three cycles: mismatch → phrase-restart (shrink) = one flag-event each
    for (let i = 0; i < 3; i++) {
      rerender("xyz xyz xyz"); // long mismatch, sets lastClassify=mismatch
      rerender("");             // phrase restart (length shrinks) → mismatchCount++
    }
    expect(result.current.flaggedWords).toContain("hello");
  });

  it("resets all state when words array reference changes", () => {
    const words1 = ["one", "two"];
    const words2 = ["three", "four", "five"];
    const sendMsg = vi.fn();
    const { result, rerender } = renderHook(
      (props: { words: string[]; interimTranscript: string }) =>
        useKaraokeReading({ ...props, sendMessage: sendMsg }),
      { initialProps: { words: words1, interimTranscript: "one" } },
    );
    // "one" matched on initial render → wordIndex = 1
    expect(result.current.wordIndex).toBe(1);
    // Switch to a new words array reference
    rerender({ words: words2, interimTranscript: "one" });
    expect(result.current.wordIndex).toBe(0);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.skippedIndices).toEqual([]);
    expect(result.current.flaggedWords).toEqual([]);
  });
});
