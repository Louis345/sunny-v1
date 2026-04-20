import { useState, useRef, useCallback, useEffect } from "react";
import { classifyKaraokeWordMatch } from "../../../src/shared/karaokeMatchWord";
import {
  buildKaraokeReadingProgressPayload,
  isInterimPhraseRestart,
} from "../../../src/shared/karaokeReadingMetrics";

export interface UseKaraokeReadingArgs {
  words: string[];
  interimTranscript: string;
  sendMessage: (type: string, payload?: Record<string, unknown>) => void;
  onComplete?: () => void;
  mode?: "sequential" | "multi";
  activeWordIndices?: number[];
  /** When set (pronunciation belt), only this word index is eligible for hits — stays in sync with the leader pill. Omit for generic multi (match any active index). */
  leaderWordIndex?: number | null;
}

export interface UseKaraokeReadingResult {
  wordIndex: number;
  skippedIndices: number[];
  handleSkipWord: (idx: number) => void;
  isComplete: boolean;
  flaggedWords: string[];
  hitWordIndex: number | null;
  /** Immediately unblocks a word index in the pending-hit guard. Call this as
   *  soon as the canvas has confirmed the hit so the hook doesn't stay blocked
   *  across Deepgram `final` restarts. */
  clearHitBlock: (wordIndex: number) => void;
}

export function useKaraokeReading(
  args: UseKaraokeReadingArgs,
): UseKaraokeReadingResult {
  const {
    words,
    interimTranscript,
    sendMessage,
    onComplete,
    mode = "sequential",
    activeWordIndices = [],
    leaderWordIndex = null,
  } = args;

  const [wordIndex, setWordIndex] = useState(0);
  const [skippedIndices, setSkippedIndices] = useState<number[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [flaggedWords, setFlaggedWords] = useState<string[]>([]);
  const [hitWordIndex, setHitWordIndex] = useState<number | null>(null);

  // Refs are the canonical source of truth inside effects and callbacks;
  // state drives renders only.
  const wordIndexRef = useRef(0);
  const isCompleteRef = useRef(false);
  const lastInterimRef = useRef("");
  const spelledWordsRef = useRef<string[]>([]);
  const flaggedWordsSetRef = useRef<Set<string>>(new Set());
  const skippedWordsListRef = useRef<string[]>([]);
  const mismatchCountForCurrentRef = useRef(0);
  const hesitationsRef = useRef(0);
  const lastInterimLengthRef = useRef(0);
  const lastClassifyResultRef = useRef<"match" | "partial" | "mismatch">(
    "match",
  );
  const pendingHitBlockRef = useRef<Set<number>>(new Set());

  // Reset all state when the words array reference changes (new story).
  const prevWordsRef = useRef(words);
  useEffect(() => {
    if (words === prevWordsRef.current) return;
    prevWordsRef.current = words;
    wordIndexRef.current = 0;
    isCompleteRef.current = false;
    lastInterimRef.current = "";
    spelledWordsRef.current = [];
    flaggedWordsSetRef.current = new Set();
    skippedWordsListRef.current = [];
    mismatchCountForCurrentRef.current = 0;
    hesitationsRef.current = 0;
    lastInterimLengthRef.current = 0;
    lastClassifyResultRef.current = "match";
    pendingHitBlockRef.current = new Set();
    setWordIndex(0);
    setSkippedIndices([]);
    setIsComplete(false);
    setFlaggedWords([]);
    setHitWordIndex(null);
  }, [words]);

  // When active belt indices change, allow re-hits for words no longer active.
  const prevActiveRef = useRef<number[] | null>(null);
  useEffect(() => {
    if (mode !== "multi") return;
    const prev = prevActiveRef.current;
    prevActiveRef.current = activeWordIndices;
    if (prev === null) return;
    const nextSet = new Set(activeWordIndices);
    for (const idx of [...pendingHitBlockRef.current]) {
      if (!nextSet.has(idx)) pendingHitBlockRef.current.delete(idx);
    }
  }, [mode, activeWordIndices]);

  useEffect(() => {
    if (hitWordIndex === null) return;
    const id = window.setTimeout(() => setHitWordIndex(null), 0);
    return () => window.clearTimeout(id);
  }, [hitWordIndex]);

  const handleSkipWord = useCallback(
    (globalIdx: number) => {
      if (mode === "multi") return;
      if (isCompleteRef.current || words.length === 0) return;
      if (globalIdx !== wordIndexRef.current) return;
      const w = words[globalIdx];
      if (!w) return;
      const norm = w.toLowerCase().trim();
      if (norm) skippedWordsListRef.current.push(norm);
      const next = globalIdx + 1;
      wordIndexRef.current = next;
      mismatchCountForCurrentRef.current = 0;
      setWordIndex(next);
      setSkippedIndices((prev) => [...prev, globalIdx]);
      if (next >= words.length) {
        isCompleteRef.current = true;
        setIsComplete(true);
        sendMessage(
          "reading_progress",
          buildKaraokeReadingProgressPayload({
            wordIndex: next,
            totalWords: words.length,
            hesitations: hesitationsRef.current,
            flaggedWords: Array.from(flaggedWordsSetRef.current),
            skippedWords: [...skippedWordsListRef.current],
            spelledWords: [...spelledWordsRef.current],
            event: "complete",
          }),
        );
        onComplete?.();
        return;
      }
      sendMessage(
        "reading_progress",
        buildKaraokeReadingProgressPayload({
          wordIndex: next,
          totalWords: words.length,
          hesitations: hesitationsRef.current,
          flaggedWords: Array.from(flaggedWordsSetRef.current),
          skippedWords: [...skippedWordsListRef.current],
          spelledWords: [...spelledWordsRef.current],
          event: "progress",
        }),
      );
    },
    [words, sendMessage, onComplete, mode],
  );

  // Process interim transcript: sequential advance, or multi-belt match.
  useEffect(() => {
    if (isCompleteRef.current || words.length === 0) return;
    const t = interimTranscript.trim();
    if (t === lastInterimRef.current) return;

    const currLen = t.length;
    const prevStoredLen = lastInterimLengthRef.current;

    if (mode === "multi") {
      const useLeader =
        typeof leaderWordIndex === "number" &&
        leaderWordIndex >= 0 &&
        leaderWordIndex < words.length;
      const matchIndices = useLeader ? [leaderWordIndex] : activeWordIndices;

      if (isInterimPhraseRestart(prevStoredLen, currLen)) {
        hesitationsRef.current += 1;
        // Do not run phrase-restart "miss every active word" logic in multi —
        // STT length drops are not attempts on each belt word and caused false
        // flags during fast play. Belt auto-miss / sequential mode handle misses.
      }
      lastInterimLengthRef.current = currLen;
      lastInterimRef.current = t;

      const lastWord = t.split(/\s+/).filter(Boolean).pop() ?? "";
      let best: "match" | "partial" | "mismatch" = "mismatch";
      for (const i of matchIndices) {
        const expected = words[i];
        if (!expected) continue;
        const r = classifyKaraokeWordMatch(lastWord, expected);
        if (r === "match") {
          best = "match";
          break;
        }
        if (r === "partial") best = "partial";
      }
      lastClassifyResultRef.current = best;

      const heardTokens = t.split(/\s+/).filter(Boolean);
      if (heardTokens.length === 0) return;

      for (const heardWord of heardTokens) {
        for (const i of matchIndices) {
          const blocked = pendingHitBlockRef.current.has(i);
          const expected = words[i];
          if (!expected) continue;
          const matchResult = classifyKaraokeWordMatch(heardWord, expected);
          if (import.meta.env.DEV) {
            console.debug(
              "[PG-MATCH] heard=%s expected=%s result=%s idx=%d blocked=%s",
              heardWord,
              expected,
              matchResult,
              i,
              blocked,
            );
          }
          if (blocked) continue;
          if (matchResult !== "match") continue;

          pendingHitBlockRef.current.add(i);
          const spelledToken = expected.toLowerCase().trim();
          if (spelledToken) spelledWordsRef.current.push(spelledToken);
          setHitWordIndex(i);
          sendMessage(
            "reading_progress",
            buildKaraokeReadingProgressPayload({
              wordIndex: wordIndexRef.current,
              totalWords: words.length,
              hesitations: hesitationsRef.current,
              flaggedWords: Array.from(flaggedWordsSetRef.current),
              skippedWords: [...skippedWordsListRef.current],
              spelledWords: [...spelledWordsRef.current],
              event: "hit",
              hitWordIndex: i,
              word: expected,
            }),
          );
          return;
        }
      }
      return;
    }

    // --- sequential (default) ---
    if (isInterimPhraseRestart(prevStoredLen, currLen)) {
      hesitationsRef.current += 1;
      if (lastClassifyResultRef.current === "mismatch") {
        const stuckIdx = wordIndexRef.current;
        if (stuckIdx < words.length) {
          const stuckExpected = words[stuckIdx];
          if (stuckExpected) {
            mismatchCountForCurrentRef.current += 1;
            if (mismatchCountForCurrentRef.current >= 3) {
              const key = stuckExpected.toLowerCase().trim();
              if (key) {
                flaggedWordsSetRef.current.add(key);
                setFlaggedWords(Array.from(flaggedWordsSetRef.current));
              }
            }
          }
        }
      }
    }
    lastInterimLengthRef.current = currLen;
    lastInterimRef.current = t;

    const heardWords = t.split(/\s+/).filter(Boolean);
    const lastWord = heardWords[heardWords.length - 1] ?? "";
    if (!lastWord) return;

    const prev = wordIndexRef.current;
    if (prev >= words.length) return;
    const expected = words[prev];
    if (!expected) return;

    const result = classifyKaraokeWordMatch(lastWord, expected);
    lastClassifyResultRef.current = result;

    if (result !== "match") return;

    const spelledToken = expected.toLowerCase().trim();
    if (spelledToken) spelledWordsRef.current.push(spelledToken);
    mismatchCountForCurrentRef.current = 0;
    const next = prev + 1;
    wordIndexRef.current = next;
    setWordIndex(next);
    if (next >= words.length) {
      isCompleteRef.current = true;
      setIsComplete(true);
      sendMessage(
        "reading_progress",
        buildKaraokeReadingProgressPayload({
          wordIndex: next,
          totalWords: words.length,
          hesitations: hesitationsRef.current,
          flaggedWords: Array.from(flaggedWordsSetRef.current),
          skippedWords: [...skippedWordsListRef.current],
          spelledWords: [...spelledWordsRef.current],
          event: "complete",
        }),
      );
      onComplete?.();
    }
  }, [
    interimTranscript,
    words,
    sendMessage,
    onComplete,
    mode,
    activeWordIndices,
    leaderWordIndex,
  ]);

  // Periodic progress heartbeat every 3 seconds.
  useEffect(() => {
    if (words.length === 0) return;
    const id = window.setInterval(() => {
      if (isCompleteRef.current) return;
      sendMessage(
        "reading_progress",
        buildKaraokeReadingProgressPayload({
          wordIndex: wordIndexRef.current,
          totalWords: words.length,
          hesitations: hesitationsRef.current,
          flaggedWords: Array.from(flaggedWordsSetRef.current),
          skippedWords: [...skippedWordsListRef.current],
          spelledWords: [...spelledWordsRef.current],
          event: "progress",
        }),
      );
    }, 3000);
    return () => window.clearInterval(id);
  }, [words, sendMessage]);

  const clearHitBlock = useCallback((wordIndex: number) => {
    pendingHitBlockRef.current.delete(wordIndex);
  }, []);

  return {
    wordIndex,
    skippedIndices,
    handleSkipWord,
    isComplete,
    flaggedWords,
    hitWordIndex,
    clearHitBlock,
  };
}
