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
}

export interface UseKaraokeReadingResult {
  wordIndex: number;
  skippedIndices: number[];
  handleSkipWord: (idx: number) => void;
  isComplete: boolean;
  flaggedWords: string[];
}

export function useKaraokeReading(
  args: UseKaraokeReadingArgs,
): UseKaraokeReadingResult {
  const { words, interimTranscript, sendMessage, onComplete } = args;

  const [wordIndex, setWordIndex] = useState(0);
  const [skippedIndices, setSkippedIndices] = useState<number[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [flaggedWords, setFlaggedWords] = useState<string[]>([]);

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
    setWordIndex(0);
    setSkippedIndices([]);
    setIsComplete(false);
    setFlaggedWords([]);
  }, [words]);

  const handleSkipWord = useCallback(
    (globalIdx: number) => {
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
    [words, sendMessage, onComplete],
  );

  // Process interim transcript: advance on match, accumulate hesitations + flagged words.
  useEffect(() => {
    if (isCompleteRef.current || words.length === 0) return;
    const t = interimTranscript.trim();
    if (t === lastInterimRef.current) return;

    const currLen = t.length;
    const prevStoredLen = lastInterimLengthRef.current;
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
  }, [interimTranscript, words, sendMessage, onComplete]);

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

  return { wordIndex, skippedIndices, handleSkipWord, isComplete, flaggedWords };
}
