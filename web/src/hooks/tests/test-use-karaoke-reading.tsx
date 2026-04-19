import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
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

  describe("mode: multi", () => {
    const stableActive1 = [1];

    it("matches interimTranscript against any word in activeWordIndices", async () => {
      const words = ["apple", "banana"];
      const sendMsg = vi.fn();
      const { rerender } = renderHook(
        (p: { interim: string }) =>
          useKaraokeReading({
            words,
            interimTranscript: p.interim,
            sendMessage: sendMsg,
            mode: "multi",
            activeWordIndices: stableActive1,
          }),
        { initialProps: { interim: "" } },
      );
      rerender({ interim: "banana" });
      await waitFor(() => {
        expect(sendMsg).toHaveBeenCalledWith(
          "reading_progress",
          expect.objectContaining({
            event: "hit",
            hitWordIndex: 1,
            word: "banana",
          }),
        );
      });
    });

    it("does not advance wordIndex in multi mode", async () => {
      const words = ["apple", "banana"];
      const sendMsg = vi.fn();
      const { result, rerender } = renderHook(
        (p: { interim: string }) =>
          useKaraokeReading({
            words,
            interimTranscript: p.interim,
            sendMessage: sendMsg,
            mode: "multi",
            activeWordIndices: stableActive1,
          }),
        { initialProps: { interim: "" } },
      );
      rerender({ interim: "banana" });
      await waitFor(() => expect(sendMsg).toHaveBeenCalled());
      expect(result.current.wordIndex).toBe(0);
    });

    it("returns hitWordIndex when a word is matched", async () => {
      const words = ["apple", "banana"];
      const sendMsg = vi.fn();
      const { result, rerender } = renderHook(
        (p: { interim: string }) =>
          useKaraokeReading({
            words,
            interimTranscript: p.interim,
            sendMessage: sendMsg,
            mode: "multi",
            activeWordIndices: stableActive1,
          }),
        { initialProps: { interim: "" } },
      );
      rerender({ interim: "banana" });
      await waitFor(() => expect(result.current.hitWordIndex).toBe(1));
    });

    it("returns null hitWordIndex when no match", async () => {
      const words = ["apple", "banana"];
      const sendMsg = vi.fn();
      const { result, rerender } = renderHook(
        (p: { interim: string }) =>
          useKaraokeReading({
            words,
            interimTranscript: p.interim,
            sendMessage: sendMsg,
            mode: "multi",
            activeWordIndices: stableActive1,
          }),
        { initialProps: { interim: "" } },
      );
      rerender({ interim: "xyzabc" });
      await act(async () => {
        await Promise.resolve();
      });
      const hitCalls = sendMsg.mock.calls.filter(
        (c) => c[0] === "reading_progress" && (c[1] as { event?: string })?.event === "hit",
      );
      expect(hitCalls.length).toBe(0);
      expect(result.current.hitWordIndex).toBeNull();
    });

    it("flags word after 3 misses across all active words", async () => {
      const words = ["hello"];
      const sendMsg = vi.fn();
      const active0 = [0];
      const { result, rerender } = renderHook(
        (p: { interim: string }) =>
          useKaraokeReading({
            words,
            interimTranscript: p.interim,
            sendMessage: sendMsg,
            mode: "multi",
            activeWordIndices: active0,
          }),
        { initialProps: { interim: "" } },
      );
      for (let i = 0; i < 3; i++) {
        rerender({ interim: "xyz xyz xyz" });
        rerender({ interim: "" });
      }
      await waitFor(() => expect(result.current.flaggedWords).toContain("hello"));
    });

    it("never matches same word twice before it is cleared", async () => {
      const words = ["apple", "banana"];
      const sendMsg = vi.fn();
      const { rerender } = renderHook(
        (p: { interim: string; active: number[] }) =>
          useKaraokeReading({
            words,
            interimTranscript: p.interim,
            sendMessage: sendMsg,
            mode: "multi",
            activeWordIndices: p.active,
          }),
        { initialProps: { interim: "", active: stableActive1 } },
      );
      rerender({ interim: "banana", active: stableActive1 });
      await waitFor(() => expect(sendMsg).toHaveBeenCalled());
      const hitsAfterFirst = sendMsg.mock.calls.filter(
        (c) => c[0] === "reading_progress" && (c[1] as { event?: string })?.event === "hit",
      ).length;
      expect(hitsAfterFirst).toBe(1);
      rerender({ interim: "no", active: stableActive1 });
      rerender({ interim: "banana", active: stableActive1 });
      await act(async () => {
        await Promise.resolve();
      });
      const hitsAfterSecond = sendMsg.mock.calls.filter(
        (c) => c[0] === "reading_progress" && (c[1] as { event?: string })?.event === "hit",
      ).length;
      expect(hitsAfterSecond).toBe(1);
      rerender({ interim: "banana", active: [] });
      rerender({ interim: "no", active: [1] });
      rerender({ interim: "banana", active: [1] });
      await waitFor(() => {
        const n = sendMsg.mock.calls.filter(
          (c) => c[0] === "reading_progress" && (c[1] as { event?: string })?.event === "hit",
        ).length;
        expect(n).toBeGreaterThanOrEqual(2);
      });
    });

    it("resets correctly when words array changes", async () => {
      const words1 = ["one", "two"];
      const words2 = ["three", "four"];
      const sendMsg = vi.fn();
      const { result, rerender } = renderHook(
        (p: { words: string[]; interim: string }) =>
          useKaraokeReading({
            words: p.words,
            interimTranscript: p.interim,
            sendMessage: sendMsg,
            mode: "multi",
            activeWordIndices: [0],
          }),
        { initialProps: { words: words1, interim: "one" } },
      );
      await waitFor(() => expect(sendMsg).toHaveBeenCalled());
      rerender({ words: words2, interim: "one" });
      expect(result.current.wordIndex).toBe(0);
      expect(result.current.flaggedWords).toEqual([]);
      expect(result.current.hitWordIndex).toBeNull();
    });
  });
});
