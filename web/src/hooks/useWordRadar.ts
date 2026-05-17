import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classifyKaraokeWordMatch } from "../../../src/shared/karaokeMatchWord";
import { LETTER_ALIASES } from "../../../src/shared/letterAliases";
import type {
  ItemResult,
  RadarItem,
  WordRadarResult,
} from "../components/WordRadar";

type CapturedWordRadarResponse = Pick<
  ItemResult,
  "heardTranscript" | "heardToken" | "typedResponse"
>;

function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t = ctx.currentTime;
    [523, 659, 784].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.28, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.35);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t + i * 0.08);
      o.stop(t + i * 0.08 + 0.4);
    });
  } catch {
    /* Web Audio optional */
  }
}

function playBuzz() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.3);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.4);
  } catch {
    /* Web Audio optional */
  }
}

export const WORD_RADAR_FLASH_MS = 1500;
export const WORD_RADAR_FEEDBACK_MS = 900;
export const WORD_RADAR_DEFAULT_SECONDS = 10;
export const WORD_RADAR_END_SCREEN_MS = 800;

/**
 * Phoneme match ratio — how many letters of display appear
 * in the interim token in order (not position-exact).
 */
export function computeMatchRatio(heard: string, display: string): number {
  if (!heard || !display) return 0;
  const h = heard.toLowerCase().replace(/[^a-z]/g, "");
  const d = display.toLowerCase().replace(/[^a-z]/g, "");
  if (!d.length) return 0;
  let hi = 0;
  let matched = 0;
  for (let di = 0; di < d.length && hi < h.length; di++) {
    if (h[hi] === d[di]) {
      matched++;
      hi++;
    }
  }
  return matched / d.length;
}

export type WordRadarPhase =
  | "intro"
  | "flash"
  | "response"
  | "feedback"
  | "end"
  | "idle";

export type WordRadarGameEventType =
  | "ready"
  | "heard"
  | "correct"
  | "incorrect"
  | "timeout"
  | "complete";

export interface WordRadarGameEvent {
  type: WordRadarGameEventType;
  item?: RadarItem;
  itemIndex?: number;
  heardTranscript?: string;
  heardToken?: string;
  attempts?: number;
  responseTime_ms?: number;
  result?: WordRadarResult;
  /** Present on `incorrect` (e.g. manual skip). */
  reason?: string;
}

export function bucketCorrectItem(
  item: RadarItem,
  responseTime_ms: number,
  attempts: number,
  personalBests: Record<string, number>,
): "known" | "weak" {
  const pb = personalBests[item.display];
  const hasPb = typeof pb === "number" && pb > 0;
  const slow = hasPb && responseTime_ms >= pb;
  const retried = attempts > 1;
  if (retried || slow) return "weak";
  return "known";
}

export function shouldShowPersonalBestBadge(
  timerSeconds: number | undefined,
  personalBests: Record<string, number>,
  display: string,
): boolean {
  if (typeof timerSeconds !== "number" || timerSeconds <= 0) return false;
  if (Object.keys(personalBests).length === 0) return false;
  return typeof personalBests[display] === "number" && personalBests[display] > 0;
}

function typedMatchesAccepted(typed: string, item: RadarItem): boolean {
  const norm = (s: string) => s.trim().toLowerCase();
  const t = norm(typed);
  if (!t) return false;
  const targets = [item.display, ...item.acceptedResponses];
  return targets.some((a) => norm(a) === t);
}

function buildFinalResult(
  items: RadarItem[],
  raw: ItemResult[],
  sessionStart: number,
  personalBests: Record<string, number>,
): WordRadarResult {
  const knownItems: RadarItem[] = [];
  const weakItems: RadarItem[] = [];
  const unknownItems: RadarItem[] = [];
  for (const r of raw) {
    if (!r.correct) {
      unknownItems.push(r.item);
      continue;
    }
    const bucket = bucketCorrectItem(
      r.item,
      r.responseTime_ms,
      r.attempts,
      personalBests,
    );
    if (bucket === "known") knownItems.push(r.item);
    else weakItems.push(r.item);
  }
  const correctCount = raw.filter((r) => r.correct).length;
  const accuracy = items.length ? correctCount / items.length : 0;
  return {
    knownItems,
    weakItems,
    unknownItems,
    accuracy,
    rawResults: raw,
    timeSpent_ms: Math.max(0, Date.now() - sessionStart),
  };
}

export interface UseWordRadarArgs {
  items: RadarItem[];
  interimTranscript: string;
  timerSeconds?: number;
  startImmediately?: boolean;
  showKeyboard?: boolean;
  inputMode?: "whole-word" | "letter-by-letter" | "keyboard";
  speakStyle?: "option-a" | "option-b";
  keyboardStyle?: "option-b" | "option-c";
  personalBests: Record<string, number>;
  onEvent?: (event: WordRadarGameEvent) => void;
  onFinish: (result: WordRadarResult) => void;
}

export interface UseWordRadarResult {
  phase: WordRadarPhase;
  itemIndex: number;
  currentItem: RadarItem | null;
  lastFeedback: "got" | "missed" | null;
  typedBuffer: string;
  responseLetters: string[];
  lockedLetters: string[];
  letterCursor: number;
  start: () => void;
  appendTypedKey: (key: string) => void;
  setTypedBuffer: (next: string) => void;
  rawResults: ItemResult[];
  shakeKeyboard: boolean;
  shakeLetterIndex: number | null;
  timerRemainingRatio: number;
  dotOutcomes: Array<"pending" | "known" | "weak" | "unknown">;
  /** 0–1 during `response` from STT vs current item display; otherwise 0. */
  matchRatio: number;
  /** 1 = first attempt on this item, 2 = after one Try Again. */
  attemptCount: number;
  /** One Try Again per item; false after it is used until the next item. */
  canTryAgain: boolean;
  handleSkip: () => void;
  handleTryAgain: () => void;
}

function buildSpokenLetterBuffer(transcript: string, item: RadarItem): string[] {
  const displayLetters = item.display.toLowerCase().replace(/[^a-z0-9]/g, "").split("");
  if (displayLetters.length === 0) return [];
  const tokens = transcript
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  const letters: string[] = [];
  for (const token of tokens) {
    if (token.length !== 1) {
      letters.length = 0;
      continue;
    }
    if (letters.length >= displayLetters.length) break;
    const expected = displayLetters[letters.length];
    if (token !== expected) {
      letters.length = 0;
      continue;
    }
    letters.push(token);
  }
  return letters;
}

function cleanToken(token: string): string {
  return token.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
}

function displayLetters(item: RadarItem): string[] {
  return item.display.toLowerCase().replace(/[^a-z0-9]/g, "").split("");
}

function tokenMatchesLetter(token: string, expected: string): boolean {
  const cleaned = cleanToken(token);
  if (!cleaned || !expected) return false;
  const aliases = LETTER_ALIASES[expected] ?? [expected];
  return aliases.some(
    (alias) =>
      cleanToken(alias) === cleaned ||
      classifyKaraokeWordMatch(cleaned, alias) === "match",
  );
}

export type WordRadarInputMode = "whole-word" | "letter-by-letter" | "keyboard";

/** Keep Word Radar's three product modes auditable instead of flattening them. */
export function resolveWordRadarInputMode(
  mode: string | undefined,
): WordRadarInputMode {
  if (mode === "keyboard" || mode === "letter-by-letter") return mode;
  return "whole-word";
}

export function useWordRadar(args: UseWordRadarArgs): UseWordRadarResult {
  const {
    items,
    interimTranscript,
    timerSeconds,
    startImmediately = true,
    showKeyboard = false,
    inputMode: inputModeArg,
    keyboardStyle = "option-c",
    personalBests,
    onEvent,
    onFinish,
  } = args;

  const [phase, setPhase] = useState<WordRadarPhase>(
    items.length ? (startImmediately ? "flash" : "intro") : "idle",
  );
  const [itemIndex, setItemIndex] = useState(0);
  const [lastFeedback, setLastFeedback] = useState<"got" | "missed" | null>(
    null,
  );
  const [typedBuffer, setTypedBufferState] = useState("");
  const [responseLetters, setResponseLetters] = useState<string[]>([]);
  const [lockedLetters, setLockedLetters] = useState<string[]>([]);
  const [letterCursor, setLetterCursor] = useState(0);
  const [rawResults, setRawResults] = useState<ItemResult[]>([]);
  const [shakeKeyboard, setShakeKeyboard] = useState(false);
  const [shakeLetterIndex, setShakeLetterIndex] = useState<number | null>(null);
  const [timerRemainingRatio, setTimerRemainingRatio] = useState(1);
  const [dotOutcomes, setDotOutcomes] = useState<
    Array<"pending" | "known" | "weak" | "unknown">
  >(() => items.map(() => "pending"));
  const [attemptCount, setAttemptCount] = useState(1);
  const [canTryAgain, setCanTryAgain] = useState(true);
  /** While interim equals this trimmed string, matchRatio reports 0 (Try Again reset). */
  const [matchRatioInterimFreeze, setMatchRatioInterimFreeze] = useState<string | null>(null);
  const [timerRearmVersion, setTimerRearmVersion] = useState(0);

  const itemIndexRef = useRef(0);
  const phaseRef = useRef<WordRadarPhase>(
    items.length ? (startImmediately ? "flash" : "intro") : "idle",
  );
  const responseStartRef = useRef<number | null>(null);
  const lastInterimRef = useRef("");
  const sessionStartRef = useRef(Date.now());
  const rawResultsRef = useRef<ItemResult[]>([]);
  const typedBufferRef = useRef("");
  const lockedLettersRef = useRef<string[]>([]);
  const letterCursorRef = useRef(0);
  const resolvedForItemRef = useRef(false);
  const tickIntervalRef = useRef<number | null>(null);
  const emptyFinishRef = useRef(false);
  const attemptCountRef = useRef(1);
  const canTryAgainRef = useRef(true);
  const responseTimerIdRef = useRef<number | null>(null);
  const lastSttResolvedTokenRef = useRef("");
  const lastWrongKeyboardSnapshotRef = useRef("");

  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const personalBestsRef = useRef(personalBests);
  personalBestsRef.current = personalBests;
  const interimTranscriptRef = useRef(interimTranscript);
  interimTranscriptRef.current = interimTranscript;
  const timerSecondsRef = useRef(timerSeconds);
  timerSecondsRef.current = timerSeconds;
  const showKeyboardRef = useRef(showKeyboard);
  showKeyboardRef.current = showKeyboard;
  const inputMode = inputModeArg ?? "whole-word";
  const inputModeRef = useRef(inputMode);
  inputModeRef.current = inputMode;
  const keyboardStyleRef = useRef(keyboardStyle);
  keyboardStyleRef.current = keyboardStyle;

  useEffect(() => {
    itemIndexRef.current = itemIndex;
  }, [itemIndex]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    attemptCountRef.current = attemptCount;
  }, [attemptCount]);
  useEffect(() => {
    canTryAgainRef.current = canTryAgain;
  }, [canTryAgain]);

  useEffect(() => {
    if (matchRatioInterimFreeze === null) return;
    const t = interimTranscript.trim();
    if (t !== matchRatioInterimFreeze) {
      setMatchRatioInterimFreeze(null);
    }
  }, [interimTranscript, matchRatioInterimFreeze]);

  const clearTick = useCallback(() => {
    if (tickIntervalRef.current != null) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }, []);

  const clearResponseTimer = useCallback(() => {
    if (responseTimerIdRef.current != null) {
      clearTimeout(responseTimerIdRef.current);
      responseTimerIdRef.current = null;
    }
  }, []);

  const bumpDot = useCallback(
    (idx: number, tone: "known" | "weak" | "unknown") => {
      setDotOutcomes((prev) => {
        const next = [...prev];
        if (idx >= 0 && idx < next.length) next[idx] = tone;
        return next;
      });
    },
    [],
  );

  const spendRetryPenalty = useCallback(() => {
    playBuzz();
    if (!canTryAgainRef.current) return;
    attemptCountRef.current = 2;
    setAttemptCount(2);
    canTryAgainRef.current = false;
    setCanTryAgain(false);
  }, []);

  const finishSession = useCallback(
    (finalRaw: ItemResult[]) => {
      clearTick();
      clearResponseTimer();
      const result = buildFinalResult(
        itemsRef.current,
        finalRaw,
        sessionStartRef.current,
        personalBestsRef.current,
      );
      onEventRef.current?.({ type: "complete", result });
      setPhase("end");
      window.setTimeout(() => {
        onFinishRef.current(result);
      }, WORD_RADAR_END_SCREEN_MS);
    },
    [clearTick, clearResponseTimer],
  );

  const goToNextItemOrEnd = useCallback(
    (finalRaw: ItemResult[], nextIndex: number) => {
      if (nextIndex >= itemsRef.current.length) {
        finishSession(finalRaw);
        return;
      }
      setItemIndex(nextIndex);
      itemIndexRef.current = nextIndex;
      resolvedForItemRef.current = false;
      lastInterimRef.current = "";
      lastSttResolvedTokenRef.current = "";
      lastWrongKeyboardSnapshotRef.current = "";
      typedBufferRef.current = "";
      lockedLettersRef.current = [];
      letterCursorRef.current = 0;
      setTypedBufferState("");
      setResponseLetters([]);
      setLockedLetters([]);
      setLetterCursor(0);
      setShakeLetterIndex(null);
      setAttemptCount(1);
      attemptCountRef.current = 1;
      setCanTryAgain(true);
      canTryAgainRef.current = true;
      setMatchRatioInterimFreeze(null);
      setTimerRearmVersion(0);
      setPhase("flash");
      phaseRef.current = "flash";
    },
    [finishSession],
  );

  const resolveItemRef = useRef<
    (
      correct: boolean,
      responseTime_ms: number,
      attempts: number,
      eventType?: "correct" | "incorrect" | "timeout",
      incorrectReason?: string,
      captured?: CapturedWordRadarResponse,
    ) => void
  >(() => {});

  useEffect(() => {
    resolveItemRef.current = (
      correct,
      responseTime_ms,
      attempts,
      eventType,
      incorrectReason,
      captured,
    ) => {
      if (resolvedForItemRef.current) return;
      resolvedForItemRef.current = true;
      clearTick();
      clearResponseTimer();
      const item = itemsRef.current[itemIndexRef.current];
      if (!item) return;
      if (correct) {
        playChime();
      } else if (incorrectReason !== "skip") {
        playBuzz();
      }
      const row: ItemResult = {
        item,
        correct,
        responseTime_ms,
        attempts,
        ...captured,
      };
      const nextRaw = [...rawResultsRef.current, row];
      rawResultsRef.current = nextRaw;
      setRawResults(nextRaw);
      const tone: "known" | "weak" | "unknown" = correct
        ? bucketCorrectItem(
            item,
            responseTime_ms,
            attempts,
            personalBestsRef.current,
          ) === "known"
          ? "known"
          : "weak"
        : "unknown";
      bumpDot(itemIndexRef.current, tone);
      const type: WordRadarGameEventType =
        eventType ?? (correct ? "correct" : "incorrect");
      onEventRef.current?.({
        type,
        item,
        itemIndex: itemIndexRef.current,
        attempts,
        responseTime_ms,
        ...(type === "incorrect" && incorrectReason ? { reason: incorrectReason } : {}),
      });
      setLastFeedback(correct ? "got" : "missed");
      setPhase("feedback");
      phaseRef.current = "feedback";
      window.setTimeout(() => {
        const ni = itemIndexRef.current + 1;
        goToNextItemOrEnd(nextRaw, ni);
      }, WORD_RADAR_FEEDBACK_MS);
    };
  }, [bumpDot, clearTick, clearResponseTimer, goToNextItemOrEnd]);

  useEffect(() => {
    if (items.length > 0 || emptyFinishRef.current) return;
    emptyFinishRef.current = true;
    finishSession([]);
  }, [items.length, finishSession]);

  const start = useCallback(() => {
    if (itemsRef.current.length === 0) return;
    if (phaseRef.current !== "intro") return;
    onEventRef.current?.({ type: "ready" });
    setPhase("flash");
    phaseRef.current = "flash";
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    if (phase !== "flash") return;
    const id = window.setTimeout(() => {
      resolvedForItemRef.current = false;
      responseStartRef.current = Date.now();
      lastInterimRef.current = interimTranscriptRef.current.trim();
      lastSttResolvedTokenRef.current = "";
      setTypedBufferState("");
      typedBufferRef.current = "";
      setResponseLetters([]);
      lockedLettersRef.current = [];
      letterCursorRef.current = 0;
      setLockedLetters([]);
      setLetterCursor(0);
      setShakeLetterIndex(null);
      setAttemptCount(1);
      attemptCountRef.current = 1;
      setCanTryAgain(true);
      canTryAgainRef.current = true;
      setMatchRatioInterimFreeze(null);
      setTimerRearmVersion(0);
      setPhase("response");
      phaseRef.current = "response";
      setTimerRemainingRatio(1);
    }, WORD_RADAR_FLASH_MS);
    return () => window.clearTimeout(id);
  }, [phase, itemIndex, items.length]);

  /** Response phase: optional countdown; at 0 → unknown + advance (no child tap). */
  useEffect(() => {
    if (phase !== "response") return;
    const responseMs =
      typeof timerSecondsRef.current === "number" && timerSecondsRef.current > 0
        ? timerSecondsRef.current * 1000
        : null;
    if (responseMs == null) {
      setTimerRemainingRatio(1);
      return;
    }
    const tick = window.setInterval(() => {
      const start = responseStartRef.current;
      if (!start) return;
      const elapsed = Date.now() - start;
      const r = Math.max(0, 1 - elapsed / responseMs);
      setTimerRemainingRatio(r);
    }, 50);
    tickIntervalRef.current = tick;
    clearResponseTimer();
    responseTimerIdRef.current = window.setTimeout(() => {
      responseTimerIdRef.current = null;
      if (phaseRef.current !== "response") return;
      if (resolvedForItemRef.current) return;
      clearTick();
      tickIntervalRef.current = null;
      setTimerRemainingRatio(0);
      const rt =
        responseStartRef.current != null
          ? Date.now() - responseStartRef.current
          : 0;
      resolveItemRef.current(false, rt, attemptCountRef.current, "timeout");
    }, responseMs);
    return () => {
      clearResponseTimer();
      clearInterval(tick);
      tickIntervalRef.current = null;
    };
  }, [phase, itemIndex, timerRearmVersion, clearTick, clearResponseTimer]);

  /** STT: whole-word or letter-by-letter match on the latest interim token. */
  useEffect(() => {
    if (phase !== "response") return;
    const item = items[itemIndex];
    if (!item || resolvedForItemRef.current) return;
    if (inputModeRef.current === "keyboard") return;
    const t = interimTranscript.trim();
    if (t === lastInterimRef.current) return;
    const previousTranscript = lastInterimRef.current;
    lastInterimRef.current = t;
    const tokens = t.split(/\s+/).filter(Boolean);
    const lastTok = tokens[tokens.length - 1] ?? "";
    const responseTime_ms =
      responseStartRef.current != null ? Date.now() - responseStartRef.current : 0;
    onEventRef.current?.({
      type: "heard",
      item,
      itemIndex,
      heardTranscript: t,
      heardToken: lastTok,
      attempts: attemptCountRef.current,
      responseTime_ms,
    });
    if (inputModeRef.current === "letter-by-letter") {
      const letters = displayLetters(item);
      const previousTokenCount = previousTranscript.split(/\s+/).filter(Boolean).length;
      const tokensToCheck = tokens.slice(previousTokenCount);
      for (const token of tokensToCheck.length ? tokensToCheck : [lastTok]) {
        const cursor = letterCursorRef.current;
        const expected = letters[cursor] ?? "";
        if (!expected || !token) return;
        if (tokenMatchesLetter(token, expected)) {
          const next = [...lockedLettersRef.current, expected];
          lockedLettersRef.current = next;
          letterCursorRef.current = cursor + 1;
          setLockedLetters(next);
          setResponseLetters(next);
          setLetterCursor(cursor + 1);
          setShakeLetterIndex(null);
          if (next.length >= letters.length) {
            resolveItemRef.current(
              true,
              responseTime_ms,
              attemptCountRef.current,
              "correct",
              undefined,
              { heardTranscript: t, heardToken: token },
            );
            return;
          }
          continue;
        }
        spendRetryPenalty();
        setShakeLetterIndex(cursor);
        window.setTimeout(() => setShakeLetterIndex(null), 400);
        return;
      }
      return;
    }

    const spokenLetters = buildSpokenLetterBuffer(t, item);
    const spelledWord = spokenLetters.join("");
    const displayWord = item.display.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      classifyKaraokeWordMatch(lastTok, item.display, { mode: "spelling" }) ===
        "match" ||
      (displayWord.length > 0 && spelledWord === displayWord)
    ) {
      if (lastSttResolvedTokenRef.current === lastTok) return;
      lastSttResolvedTokenRef.current = lastTok;
      resolveItemRef.current(
        true,
        responseTime_ms,
        attemptCountRef.current,
        "correct",
        undefined,
        { heardTranscript: t, heardToken: lastTok },
      );
    }
  }, [interimTranscript, phase, itemIndex, items]);

  /** Keyboard: full word length match → auto-advance or shake+clear. */
  useEffect(() => {
    typedBufferRef.current = typedBuffer;
    if (phase !== "response") return;
    if (inputModeRef.current !== "keyboard" && !showKeyboardRef.current) return;
    if (keyboardStyleRef.current === "option-b") return;
    const item = items[itemIndex];
    if (!item || resolvedForItemRef.current) return;
    if (typedBuffer.length < item.display.length) {
      lastWrongKeyboardSnapshotRef.current = "";
      return;
    }
    if (typedBuffer.length !== item.display.length) return;
    if (typedMatchesAccepted(typedBuffer, item)) {
      const rt =
        responseStartRef.current != null
          ? Date.now() - responseStartRef.current
          : 0;
      resolveItemRef.current(
        true,
        rt,
        attemptCountRef.current,
        "correct",
        undefined,
        { typedResponse: typedBuffer },
      );
      return;
    }
    const snap = `${itemIndex}:${typedBuffer}`;
    if (lastWrongKeyboardSnapshotRef.current === snap) return;
    lastWrongKeyboardSnapshotRef.current = snap;
    setShakeKeyboard(true);
    window.setTimeout(() => setShakeKeyboard(false), 400);
    setTypedBufferState("");
    typedBufferRef.current = "";
  }, [typedBuffer, phase, itemIndex, items]);

  const appendTypedKey = useCallback((key: string) => {
    if (phaseRef.current !== "response") return;
    if (resolvedForItemRef.current) return;
    const item = itemsRef.current[itemIndexRef.current];
    if (!item) return;
    if (key === "Backspace") {
      if (inputModeRef.current === "keyboard" && keyboardStyleRef.current === "option-b") {
        const next = lockedLettersRef.current.slice(0, -1);
        lockedLettersRef.current = next;
        letterCursorRef.current = next.length;
        setLockedLetters(next);
        setResponseLetters(next);
        setLetterCursor(next.length);
        setTypedBufferState(next.join(""));
        typedBufferRef.current = next.join("");
        return;
      }
      setTypedBufferState((s) => s.slice(0, -1));
      return;
    }
    if (key.length === 1 && /[a-zA-Z0-9\s'-]/.test(key)) {
      if (inputModeRef.current === "keyboard" && keyboardStyleRef.current === "option-b") {
        const letters = displayLetters(item);
        const cursor = letterCursorRef.current;
        const expected = letters[cursor] ?? "";
        const cleanedKey = cleanToken(key);
        if (expected && cleanedKey === expected) {
          const next = [...lockedLettersRef.current, expected];
          lockedLettersRef.current = next;
          letterCursorRef.current = cursor + 1;
          setLockedLetters(next);
          setResponseLetters(next);
          setLetterCursor(cursor + 1);
          setTypedBufferState(next.join(""));
          typedBufferRef.current = next.join("");
          setShakeLetterIndex(null);
          if (next.length >= letters.length) {
            const rt =
              responseStartRef.current != null
                ? Date.now() - responseStartRef.current
                : 0;
            resolveItemRef.current(
              true,
              rt,
              attemptCountRef.current,
              "correct",
              undefined,
              { typedResponse: next.join("") },
            );
          }
          return;
        }
        spendRetryPenalty();
        setShakeLetterIndex(cursor);
        window.setTimeout(() => setShakeLetterIndex(null), 400);
        return;
      }
      setTypedBufferState((s) => {
        const next = s + key;
        return next.length > item.display.length ? s : next;
      });
    }
  }, []);

  const setTypedBuffer = useCallback((next: string) => {
    if (phaseRef.current !== "response") return;
    if (resolvedForItemRef.current) return;
    const item = itemsRef.current[itemIndexRef.current];
    if (!item) return;
    if (inputModeRef.current === "keyboard" && keyboardStyleRef.current === "option-b") {
      const letters = displayLetters(item);
      const cleaned = next.toLowerCase().replace(/[^a-z0-9]/g, "");
      const locked: string[] = [];
      for (let i = 0; i < cleaned.length && i < letters.length; i++) {
        if (cleaned[i] !== letters[i]) {
          spendRetryPenalty();
          setShakeLetterIndex(i);
          window.setTimeout(() => setShakeLetterIndex(null), 400);
          break;
        }
        locked.push(cleaned[i]);
      }
      lockedLettersRef.current = locked;
      letterCursorRef.current = locked.length;
      setLockedLetters(locked);
      setResponseLetters(locked);
      setLetterCursor(locked.length);
      setTypedBufferState(locked.join(""));
      typedBufferRef.current = locked.join("");
      if (locked.length >= letters.length) {
        const rt =
          responseStartRef.current != null
            ? Date.now() - responseStartRef.current
            : 0;
        resolveItemRef.current(
          true,
          rt,
          attemptCountRef.current,
          "correct",
          undefined,
          { typedResponse: locked.join("") },
        );
      }
      return;
    }
    const cleaned = next.replace(/[^a-zA-Z0-9\s'-]/g, "");
    setTypedBufferState(cleaned.slice(0, item.display.length));
  }, []);

  const handleSkip = useCallback(() => {
    if (phaseRef.current !== "response") return;
    if (resolvedForItemRef.current) return;
    const rt =
      responseStartRef.current != null
        ? Date.now() - responseStartRef.current
        : 0;
    resolveItemRef.current(
      false,
      rt,
      attemptCountRef.current,
      "incorrect",
      "skip",
    );
  }, []);

  const handleTryAgain = useCallback(() => {
    if (phaseRef.current !== "response") return;
    if (resolvedForItemRef.current) return;
    if (!canTryAgainRef.current) return;
    clearTick();
    clearResponseTimer();
    attemptCountRef.current = 2;
    setAttemptCount(2);
    canTryAgainRef.current = false;
    setCanTryAgain(false);
    setMatchRatioInterimFreeze(interimTranscriptRef.current.trim());
    typedBufferRef.current = "";
    lockedLettersRef.current = [];
    letterCursorRef.current = 0;
    setTypedBufferState("");
    setLockedLetters([]);
    setResponseLetters([]);
    setLetterCursor(0);
    setShakeLetterIndex(null);
    setShakeKeyboard(false);
    lastSttResolvedTokenRef.current = "";
    lastWrongKeyboardSnapshotRef.current = "";
    lastInterimRef.current = interimTranscriptRef.current.trim();
    responseStartRef.current = Date.now();
    setTimerRemainingRatio(1);
    setTimerRearmVersion((v) => v + 1);
  }, [clearTick, clearResponseTimer]);

  useEffect(() => {
    return () => {
      clearTick();
      clearResponseTimer();
    };
  }, [clearTick, clearResponseTimer]);

  const currentItem = items[itemIndex] ?? null;

  const matchRatio = useMemo(() => {
    if (phase !== "response") return 0;
    const it = items[itemIndex];
    if (!it?.display) return 0;
    const trimmed = interimTranscript.trim();
    if (matchRatioInterimFreeze !== null && trimmed === matchRatioInterimFreeze) {
      return 0;
    }
    return computeMatchRatio(interimTranscript, it.display);
  }, [phase, itemIndex, interimTranscript, items, matchRatioInterimFreeze]);

  return {
    phase,
    itemIndex,
    currentItem,
    lastFeedback,
    typedBuffer,
    responseLetters,
    lockedLetters,
    letterCursor,
    start,
    appendTypedKey,
    setTypedBuffer,
    rawResults,
    shakeKeyboard,
    shakeLetterIndex,
    timerRemainingRatio,
    dotOutcomes,
    matchRatio,
    attemptCount,
    canTryAgain,
    handleSkip,
    handleTryAgain,
  };
}
