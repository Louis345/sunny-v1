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
}

export interface UseKaraokeReadingResult {
  wordIndex: number;
  skippedIndices: number[];
  handleSkipWord: (idx: number) => void;
  isComplete: boolean;
  flaggedWords: string[];
  hitWordIndex: number | null;
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
  const multiMissCountRef = useRef<Map<number, number>>(new Map());
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
    multiMissCountRef.current = new Map();
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
    const prevTrimmed = lastInterimRef.current;

    if (mode === "multi") {
      const indices = activeWordIndices;
      if (isInterimPhraseRestart(prevStoredLen, currLen)) {
        hesitationsRef.current += 1;
        const oldLastToken =
          prevTrimmed.split(/\s+/).filter(Boolean).pop() ?? "";
        for (const i of indices) {
          const expected = words[i];
          if (!expected) continue;
          const cls = classifyKaraokeWordMatch(oldLastToken, expected);
          if (cls !== "match") {
            const c = (multiMissCountRef.current.get(i) ?? 0) + 1;
            multiMissCountRef.current.set(i, c);
            if (c >= 3) {
              const key = expected.toLowerCase().trim();
              if (key) {
                flaggedWordsSetRef.current.add(key);
                setFlaggedWords(Array.from(flaggedWordsSetRef.current));
              }
            }
          }
        }
      }
      lastInterimLengthRef.current = currLen;
      lastInterimRef.current = t;

      const lastWord = t.split(/\s+/).filter(Boolean).pop() ?? "";
      let best: "match" | "partial" | "mismatch" = "mismatch";
      for (const i of indices) {
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

      if (!lastWord) return;

      for (const i of indices) {
        if (pendingHitBlockRef.current.has(i)) continue;
        const expected = words[i];
        if (!expected) continue;
        if (classifyKaraokeWordMatch(lastWord, expected) !== "match") continue;

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

  return {
    wordIndex,
    skippedIndices,
    handleSkipWord,
    isComplete,
    flaggedWords,
    hitWordIndex,
  };
}
