import { useState, useRef, useCallback, useEffect } from "react";
import { classifyKaraokeWordMatch } from "../../../src/shared/karaokeMatchWord";
import {
  buildKaraokeReadingProgressPayload,
  isInterimPhraseRestart,
} from "../../../src/shared/karaokeReadingMetrics";

function transcriptMatchesExpectedPhrase(
  heardWords: string[],
  expected: string,
): "match" | "partial" | "mismatch" {
  const expectedTokens = expected.split(/\s+/).filter(Boolean);
  if (expectedTokens.length <= 1) {
    let result: "match" | "partial" | "mismatch" = "mismatch";
    for (const heardWord of heardWords) {
      const candidate = classifyKaraokeWordMatch(heardWord, expected);
      if (candidate === "match") return "match";
      if (candidate === "partial") result = "partial";
    }
    return result;
  }

  const normalizedExpected = expectedTokens.join(" ");
  for (let start = 0; start <= heardWords.length - expectedTokens.length; start += 1) {
    const phrase = heardWords.slice(start, start + expectedTokens.length).join(" ");
    if (classifyKaraokeWordMatch(phrase, normalizedExpected) === "match") {
      return "match";
    }
    const compactPhrase = phrase.replace(/\s+/g, "");
    const compactExpected = normalizedExpected.replace(/\s+/g, "");
    if (classifyKaraokeWordMatch(compactPhrase, compactExpected) === "match") {
      return "match";
    }
  }

  const lastWords = heardWords.slice(-expectedTokens.length);
  const partialPhrase = lastWords.join(" ");
  if (
    partialPhrase &&
    classifyKaraokeWordMatch(partialPhrase, normalizedExpected) === "partial"
  ) {
    return "partial";
  }
  return "mismatch";
}

function transcriptFingerprint(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export interface UseKaraokeReadingArgs {
  words: string[];
  interimTranscript: string;
  sendMessage: (type: string, payload?: Record<string, unknown>) => void;
  onComplete?: (result: KaraokeReadingCompleteResult) => void;
  mode?: "sequential" | "multi";
  activeWordIndices?: number[];
  /** When set (pronunciation belt), only this word index is eligible for hits — stays in sync with the leader pill. Omit for generic multi (match any active index). */
  leaderWordIndex?: number | null;
  /** Pronunciation STT can replay the same word with punctuation/case changes. Suppress those replays from scoring again. */
  suppressDuplicateTranscriptMatches?: boolean;
  /** Defaults to karaoke reading progress; pass null when another activity owns progress/completion events. */
  progressMessageType?: string | null;
}

export type KaraokeReadingCompleteResult = {
  skippedWords: string[];
  flaggedWords: string[];
  spelledWords: string[];
  hesitations: number;
  wordIndex: number;
  totalWords: number;
};

export interface UseKaraokeReadingResult {
  wordIndex: number;
  skippedIndices: number[];
  handleSkipWord: (idx: number) => void;
  completeReading: (reason?: "preview") => void;
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
    suppressDuplicateTranscriptMatches = false,
    progressMessageType = "reading_progress",
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
  const lastMatchedSequentialFingerprintRef = useRef("");

  const sendProgress = useCallback(
    (payload: ReturnType<typeof buildKaraokeReadingProgressPayload>) => {
      if (!progressMessageType) return;
      sendMessage(progressMessageType, payload);
    },
    [progressMessageType, sendMessage],
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
    pendingHitBlockRef.current = new Set();
    lastMatchedSequentialFingerprintRef.current = "";
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

  const completeReading = useCallback(
    (reason?: "preview") => {
      if (mode === "multi") return;
      if (isCompleteRef.current || words.length === 0) return;

      const current = Math.min(Math.max(0, wordIndexRef.current), words.length);
      if (reason === "preview" && current < words.length) {
        const remainingIndices: number[] = [];
        for (let i = current; i < words.length; i += 1) {
          remainingIndices.push(i);
          const norm = words[i]?.toLowerCase().trim();
          if (norm) skippedWordsListRef.current.push(norm);
        }
        setSkippedIndices((prev) => Array.from(new Set([...prev, ...remainingIndices])));
      }

      wordIndexRef.current = words.length;
      mismatchCountForCurrentRef.current = 0;
      isCompleteRef.current = true;
      setWordIndex(words.length);
      setIsComplete(true);
      const completeResult: KaraokeReadingCompleteResult = {
        wordIndex: words.length,
        totalWords: words.length,
        hesitations: hesitationsRef.current,
        flaggedWords: Array.from(flaggedWordsSetRef.current),
        skippedWords: [...skippedWordsListRef.current],
        spelledWords: [...spelledWordsRef.current],
      };
      if (reason === "preview") {
        onComplete?.(completeResult);
      }
      sendProgress(
        buildKaraokeReadingProgressPayload({
          ...completeResult,
          event: "complete",
        }),
      );
      if (reason !== "preview") {
        onComplete?.(completeResult);
      }
    },
    [mode, onComplete, sendProgress, words],
  );

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
        completeReading();
        return;
      }
      sendProgress(
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
    [words, sendProgress, mode, completeReading],
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
          sendProgress(
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
    if (heardWords.length === 0) return;
    const fingerprint = transcriptFingerprint(t);
    if (
      suppressDuplicateTranscriptMatches &&
      fingerprint &&
      fingerprint === lastMatchedSequentialFingerprintRef.current
    ) {
      return;
    }

    const prev = wordIndexRef.current;
    if (prev >= words.length) return;
    const expected = words[prev];
    if (!expected) return;

    const result = transcriptMatchesExpectedPhrase(heardWords, expected);
    lastClassifyResultRef.current = result;
    if (result !== "match") return;

    if (suppressDuplicateTranscriptMatches) {
      lastMatchedSequentialFingerprintRef.current = fingerprint;
    }
    const spelledToken = expected.toLowerCase().trim();
    if (spelledToken) spelledWordsRef.current.push(spelledToken);
    mismatchCountForCurrentRef.current = 0;
    const next = prev + 1;
    wordIndexRef.current = next;
    setWordIndex(next);
    if (next >= words.length) {
      completeReading();
    }
  }, [
    interimTranscript,
    words,
    sendProgress,
    mode,
    activeWordIndices,
    leaderWordIndex,
    suppressDuplicateTranscriptMatches,
    completeReading,
  ]);

  // Periodic progress heartbeat every 3 seconds.
  useEffect(() => {
    if (words.length === 0) return;
    const id = window.setInterval(() => {
      if (isCompleteRef.current) return;
      sendProgress(
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
  }, [words, sendProgress]);

  const clearHitBlock = useCallback((wordIndex: number) => {
    pendingHitBlockRef.current.delete(wordIndex);
  }, []);

  return {
    wordIndex,
    skippedIndices,
    handleSkipWord,
    completeReading,
    isComplete,
    flaggedWords,
    hitWordIndex,
    clearHitBlock,
  };
}
