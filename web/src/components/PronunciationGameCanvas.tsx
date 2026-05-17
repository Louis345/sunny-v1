import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useKaraokeReading } from "../hooks/useKaraokeReading";
import { playGameSfx, playPronunciationHitSfx } from "../utils/gameSfx";
import type { PronunciationNodeConfig } from "../../../src/shared/adventureTypes";

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Fredoka:wght@700;800;900&family=Lexend:wght@400;600&family=Caveat:wght@700&display=swap";

const TRAVEL_MS = 3000;
const ZONE_MS = 2000;
const TIMER_START_MS = 45_000;
const TIMER_MAX_MS = 60_000;
const TIMER_TICK_MS = 100;
const NORMAL_TIME_AWARD_MS = 750;
const HEAT_TIME_AWARD_MS = 0;
const NORMAL_COIN_AWARD = 10;
const HEAT_COIN_AWARD = 30;
const HEAT_THRESHOLD = 3;
const COMBO_BREAKER_STREAK = 8;
const HEAT_SPEED_MULTIPLIER = 1.45;
const COMBO_BREAKER_SPEED_MULTIPLIER = 1.7;
const HEAT_TIMER_DRAIN_MULTIPLIER = 1.6;
const COMBO_BREAKER_TIMER_DRAIN_MULTIPLIER = 2.1;
const COMBO_BREAKER_BANNER_MS = 1800;
const MAX_ADAPTIVE_FLOW_ROUNDS = 2;
const ADAPTIVE_FLOW_RESTART_MS = 650;
const HIT_MS = 300;
const YANK_OUT_MS = 300;
const YANK_BACK_MS = 400;
const HEARD_STICKY_MS = 450;
const STT_STALE_MS = 4000;

function transcriptWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function transcriptFingerprint(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function latestPronunciationScoringWindow(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const segments = trimmed
    .split(/[.!?\n]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.at(-1) ?? trimmed;
}

function normalizePracticeWord(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

type PronunciationRunEndReason = "timer" | "completed_targets";

function pronunciationFlowSpeedMultiplier(flowRound: number): number {
  return 1 + Math.min(0.36, Math.max(0, flowRound) * 0.12);
}

function pronunciationFlowTimerDrainMultiplier(flowRound: number): number {
  return 1 + Math.min(0.45, Math.max(0, flowRound) * 0.15);
}

function pronunciationFlowRewardMultiplier(flowRound: number): number {
  return Math.max(0.45, 1 - Math.max(0, flowRound) * 0.2);
}

export type PronunciationCompleteResult = {
  wordsHit: number;
  wordsAttempted: number;
  hitEvents?: number;
  uniqueTargetsAttempted?: number;
  rounds?: number;
  accuracy: number;
  totalWords: number;
  correctCount: number;
  evidenceTier?: "practice" | "clean_recall" | "mastery_candidate" | "calibration_required";
  targetResults: Array<{
    target: string;
    correct: boolean;
    attempts: number;
    scaffoldLevel: number;
    mode: string;
    struggleSignals: string[];
  }>;
  flaggedWords: string[];
  xpEarned: number;
  bestStreak: number;
  coinsEarned?: number;
  timeSurvivedMs?: number;
  runEndedReason?: PronunciationRunEndReason;
  maxHeatStreak?: number;
  flowState?: {
    timeOnTask_ms: number;
    bestStreak: number;
    heatReached: boolean;
    comboReached: boolean;
    retries: number;
    missToHitRecoveries: number;
    idleEvents: number;
    pauseRequests: number;
    replayRequests: number;
    powerBarSurvival_ms: number;
    abandoned: boolean;
  };
  replayOnly?: boolean;
  chartEligible?: boolean;
};

export interface PronunciationGameCanvasProps {
  words: string[];
  replayWords?: string[];
  pronunciationConfig?: PronunciationNodeConfig;
  interimTranscript: string;
  sendMessage: (type: string, payload?: Record<string, unknown>) => void;
  backgroundImageUrl?: string;
  accentColor?: string;
  onComplete?: (result: PronunciationCompleteResult) => void;
  onExit?: () => void;
  /** Extra top padding (px) to clear a fixed banner above the component. */
  topInset?: number;
}

type BlockPhase = "approaching" | "hit" | "miss";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  life: number;
  maxLife: number;
};

type PronunciationSupportCue = {
  word?: string;
  chunks?: string[];
  chunked?: string;
  guidance?: string;
  mode?: "pause" | "slow";
  durationMs?: number;
};

function streakMultiplier(streak: number): number {
  if (streak >= 10) return 2.0;
  if (streak >= 5) return 1.5;
  return 1.0;
}

function scoreForHit(hitStreakAfterHit: number, displayStreak: number): number {
  const mult =
    hitStreakAfterHit >= HEAT_THRESHOLD ? 2.0 : streakMultiplier(displayStreak);
  return Math.round(10 * mult);
}

function pronunciationSpeedMultiplier(hitStreak: number): number {
  if (hitStreak >= COMBO_BREAKER_STREAK) return COMBO_BREAKER_SPEED_MULTIPLIER;
  if (hitStreak >= HEAT_THRESHOLD) return HEAT_SPEED_MULTIPLIER;
  return 1;
}

function pronunciationTimerDrainMultiplier(hitStreak: number): number {
  if (hitStreak >= COMBO_BREAKER_STREAK) return COMBO_BREAKER_TIMER_DRAIN_MULTIPLIER;
  if (hitStreak >= HEAT_THRESHOLD) return HEAT_TIMER_DRAIN_MULTIPLIER;
  return 1;
}

const LOW_VALUE_PRONUNCIATION_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "away",
  "by",
  "down",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "out",
  "over",
  "the",
  "to",
  "under",
  "up",
  "with",
]);

function pronunciationTargetTokens(rawWord: string): string[] {
  const tokens = rawWord
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const meaningfulTokens = tokens.filter(
    (token) => token.length >= 3 && !LOW_VALUE_PRONUNCIATION_WORDS.has(token),
  );
  return meaningfulTokens.length > 0 ? meaningfulTokens : tokens.slice(0, 1);
}

function dedupePronunciationWords(words: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const word of words) {
    for (const target of pronunciationTargetTokens(word)) {
      if (!target || seen.has(target)) continue;
      seen.add(target);
      deduped.push(target);
    }
  }
  return deduped;
}

function pronunciationWordsKey(words: string[]): string {
  return words.flatMap(pronunciationTargetTokens).join("\u0001");
}

function isSyntheticSessionTranscript(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/^\[session start\b/i.test(text)) return true;
  if (/\bfirst map node\b/i.test(text) && /\bspeak to\b/i.test(text)) return true;
  if (text.length > 240 && /\bhomework map mounted\b/i.test(text)) return true;
  return false;
}

function buildPronunciationFlowWords(pool: string[], cycles = 1): string[] {
  if (pool.length === 0) return [];
  const flowWords: string[] = [];
  for (let i = 0; i < cycles; i += 1) {
    flowWords.push(...pool);
  }
  return flowWords;
}

function clampWordCount(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function baseWordLimit(poolCount: number, config?: PronunciationNodeConfig): number {
  if (poolCount <= 0) return 0;
  if (!config) return poolCount;
  return clampWordCount(config.baseWordCount, 1, poolCount);
}

function hardReplayWordLimit(
  baseCount: number,
  poolCount: number,
  config?: PronunciationNodeConfig,
): number {
  if (poolCount <= baseCount) return poolCount;
  if (config) {
    const maxCount = clampWordCount(config.maxWordCount, baseCount, poolCount);
    return clampWordCount(config.targetFlowWordCount, baseCount, maxCount);
  }
  const desired = baseCount < 10 ? 10 : Math.ceil(baseCount * 1.25);
  const streakReady = COMBO_BREAKER_STREAK + 2;
  const minimumGrowth = baseCount + 3;
  return Math.min(
    poolCount,
    Math.max(baseCount, Math.min(12, Math.max(desired, streakReady, minimumGrowth))),
  );
}

export function PronunciationGameCanvas({
  words: rawWords,
  replayWords: rawReplayWords,
  pronunciationConfig,
  interimTranscript,
  sendMessage,
  backgroundImageUrl: _backgroundImageUrl, // eslint-disable-line @typescript-eslint/no-unused-vars
  accentColor: _accentColor, // eslint-disable-line @typescript-eslint/no-unused-vars
  onComplete,
  onExit,
  topInset = 0,
}: PronunciationGameCanvasProps): React.ReactElement {
  const rawWordsKey = pronunciationWordsKey(rawWords);
  const replayWordsKey = pronunciationWordsKey(rawReplayWords ?? []);
  const pronunciationConfigKey = JSON.stringify(pronunciationConfig ?? null);
  const [replaySeed, setReplaySeed] = useState(0);
  const [challengeMode, setChallengeMode] = useState<"normal" | "hard">("normal");
  const baseWordPool = useMemo(() => dedupePronunciationWords(rawWords), [rawWordsKey]);
  const baseWords = useMemo(
    () => baseWordPool.slice(0, baseWordLimit(baseWordPool.length, pronunciationConfig)),
    [baseWordPool, pronunciationConfigKey],
  );
  const extendedWords = useMemo(() => {
    const pool = dedupePronunciationWords([
      ...rawWords,
      ...(rawReplayWords ?? []),
    ]);
    return pool.length > 0 ? pool : baseWords;
  }, [baseWords, rawWordsKey, replayWordsKey]);
  const hardReplayWords = useMemo(
    () => extendedWords.slice(
      0,
      hardReplayWordLimit(baseWords.length, extendedWords.length, pronunciationConfig),
    ),
    [baseWords.length, extendedWords, pronunciationConfigKey],
  );
  const activeWordPool = useMemo(() => {
    void replaySeed;
    return [...(challengeMode === "hard" ? hardReplayWords : baseWords)];
  }, [baseWords, challengeMode, hardReplayWords, replaySeed]);
  const words = useMemo(
    () => buildPronunciationFlowWords(activeWordPool),
    [activeWordPool],
  );
  const flowWordsKey = pronunciationWordsKey(words);
  const pronunciationRunKey = `${challengeMode}:${replaySeed}:${flowWordsKey}`;
  const videoRef = useRef<HTMLVideoElement>(null);
  const particlesRef = useRef<HTMLCanvasElement>(null);
  const particlesDataRef = useRef<Particle[]>([]);
  const rafParticlesRef = useRef(0);
  const blockWrapRef = useRef<HTMLDivElement>(null);

  const completeSentRef = useRef(false);
  const authoritativeCompleteSentRef = useRef(false);
  const replayRunRef = useRef(0);
  const runSerialRef = useRef(0);
  const autoFlowRoundsRef = useRef(0);
  const flowRoundRef = useRef(0);
  const flowRestartTimerRef = useRef<number | null>(null);
  const endReasonRef = useRef<PronunciationRunEndReason>("timer");
  const rawWordsKeyRef = useRef(rawWordsKey);
  const prevWordIndexRef = useRef(-1);
  const cycleStartRef = useRef(0);
  const wrongTimerRef = useRef<number | null>(null);
  const lastHitInterimRef = useRef("");
  const hitCooldownUntilRef = useRef(0);
  const timeoutIntervalRef = useRef<number | null>(null);
  const hitProcessedForWordIndexRef = useRef(-1);
  const missSeqRef = useRef(0);
  const timeoutArmedRef = useRef(true);
  const lastLoggedDrainMultiplierRef = useRef(1);
  const interimRef = useRef(interimTranscript);
  const heardClearTimeoutRef = useRef<number | null>(null);
  const comboBannerTimeoutRef = useRef<number | null>(null);
  const lastMilestoneStreakRef = useRef(0);
  const wordIndexRef = useRef(0);
  const hitsRef = useRef(0);
  const wordsAttemptedRef = useRef(0);
  const xpRef = useRef(0);
  const bestStreakRef = useRef(0);
  const hitStreakRef = useRef(0);
  const coinsRef = useRef(0);
  const timeRemainingRef = useRef(TIMER_START_MS);
  const lastCoinAwardRef = useRef(0);
  const lastTimeAwardRef = useRef(0);
  const maxHeatStreakRef = useRef(0);
  const runStartedAtRef = useRef(performance.now());
  const lastTimerTickAtRef = useRef(performance.now());
  const flaggedWordsRef = useRef<string[]>([]);
  const missCountByWordRef = useRef<Map<string, number>>(new Map());
  const hitCountByWordRef = useRef<Map<string, number>>(new Map());
  const replayRequestsRef = useRef(0);
  const bonusWordIndexRef = useRef<number | null>(null);
  const ignoreReplayTranscriptRef = useRef("");
  const staleHitWordIndexAfterResetRef = useRef<number | null>(null);
  const stateUpdateFingerprintRef = useRef("");
  const supportClearTimeoutRef = useRef<number | null>(null);
  const lastTranscriptAtRef = useRef(performance.now());

  const [cameraOk, setCameraOk] = useState(false);
  const [hasStarted, setHasStarted] = useState(true);
  const [cycleKey, setCycleKey] = useState(0);
  const [blockPhase, setBlockPhase] = useState<BlockPhase>("approaching");
  const [missSeq, setMissSeq] = useState(0);
  const [showWrongBadge, setShowWrongBadge] = useState(false);
  const [showHitBadge, setShowHitBadge] = useState(false);
  const [ended, setEnded] = useState(false);
  const [endReason, setEndReason] = useState<PronunciationRunEndReason>("timer");
  const [flowRound, setFlowRound] = useState(0);
  const [hits, setHits] = useState(0);
  const [wordsAttempted, setWordsAttempted] = useState(0);
  const [xp, setXp] = useState(0);
  const [coins, setCoins] = useState(0);
  const [timeRemainingMs, setTimeRemainingMs] = useState(TIMER_START_MS);
  const [streak, setStreak] = useState(0);
  const [hitStreak, setHitStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [heatBanner, setHeatBanner] = useState<"off" | "heating">("off");
  const [heardTranscript, setHeardTranscript] = useState("");
  const [bonusWordIndex, setBonusWordIndex] = useState<number | null>(null);
  const [comboBreakerBanner, setComboBreakerBanner] = useState(false);
  const [lastHitXp, setLastHitXp] = useState(0);
  const [lastCoinAward, setLastCoinAward] = useState(0);
  const [lastTimeAwardMs, setLastTimeAwardMs] = useState(0);
  const [lastHitWasBonus, setLastHitWasBonus] = useState(false);
  const [supportCue, setSupportCue] = useState<PronunciationSupportCue | null>(null);
  const [sttStatus, setSttStatus] = useState<"listening" | "reconnecting">("listening");

  const childSpeechTranscript = isSyntheticSessionTranscript(interimTranscript)
    ? ""
    : interimTranscript;
  const latestChildSpeechTranscript = latestPronunciationScoringWindow(childSpeechTranscript);
  const interimFingerprint = transcriptFingerprint(latestChildSpeechTranscript);
  const scoringInterimTranscript =
    ignoreReplayTranscriptRef.current &&
    interimFingerprint === ignoreReplayTranscriptRef.current
      ? ""
      : latestChildSpeechTranscript;

  useEffect(() => {
    if (rawWordsKeyRef.current === rawWordsKey) return;
    rawWordsKeyRef.current = rawWordsKey;
    authoritativeCompleteSentRef.current = false;
    replayRunRef.current = 0;
    autoFlowRoundsRef.current = 0;
    flowRoundRef.current = 0;
    setFlowRound(0);
  }, [rawWordsKey]);

  useEffect(() => {
    if (!ignoreReplayTranscriptRef.current) return;
    if (!interimFingerprint) {
      ignoreReplayTranscriptRef.current = "";
      staleHitWordIndexAfterResetRef.current = null;
      return;
    }
    if (interimFingerprint && interimFingerprint !== ignoreReplayTranscriptRef.current) {
      ignoreReplayTranscriptRef.current = "";
    }
  }, [interimFingerprint]);

  const {
    wordIndex,
    flaggedWords,
    isComplete,
  } = useKaraokeReading({
    words,
    interimTranscript: scoringInterimTranscript,
    sendMessage,
    mode: "sequential",
    suppressDuplicateTranscriptMatches: true,
    progressMessageType: null,
    resetKey: `${challengeMode}:${replaySeed}`,
    matchMode: "pronunciation",
    sequentialMatchScope: "tail",
  });

  useEffect(() => {
    sendMessage("game_event", {
      event: {
        type: "voice_control",
        voiceEnabled: false,
        payload: {
          game: "pronunciation",
        },
        version: "1.0",
      },
    });
    return () => {
      sendMessage("game_event", {
        event: {
          type: "voice_control",
          voiceEnabled: true,
          payload: {
            game: "pronunciation",
          },
          version: "1.0",
        },
      });
    };
  }, [sendMessage]);

  useEffect(() => {
    interimRef.current = scoringInterimTranscript;
    const trimmed = scoringInterimTranscript.trim();
    if (trimmed) {
      lastTranscriptAtRef.current = performance.now();
      setSttStatus("listening");
      if (heardClearTimeoutRef.current !== null) {
        window.clearTimeout(heardClearTimeoutRef.current);
        heardClearTimeoutRef.current = null;
      }
      const expected = words[wordIndexRef.current] ?? "";
      const expectedTokenCount = expected.split(/\s+/).filter(Boolean).length;
      const heardWords = transcriptWords(trimmed);
      setHeardTranscript(
        expectedTokenCount > 1
          ? heardWords.slice(-expectedTokenCount).join(" ") || trimmed
          : heardWords.at(-1) ?? trimmed,
      );
      return;
    }
    if (heardClearTimeoutRef.current !== null) {
      window.clearTimeout(heardClearTimeoutRef.current);
    }
    heardClearTimeoutRef.current = window.setTimeout(() => {
      heardClearTimeoutRef.current = null;
      setHeardTranscript("");
    }, HEARD_STICKY_MS);
  }, [scoringInterimTranscript, words]);

  useEffect(() => {
    if (ended) return;
    const id = window.setInterval(() => {
      const staleFor = performance.now() - lastTranscriptAtRef.current;
      setSttStatus(staleFor >= STT_STALE_MS ? "reconnecting" : "listening");
    }, 500);
    return () => window.clearInterval(id);
  }, [ended]);

  useEffect(() => {
    return () => {
      if (heardClearTimeoutRef.current !== null) {
        window.clearTimeout(heardClearTimeoutRef.current);
      }
      if (comboBannerTimeoutRef.current !== null) {
        window.clearTimeout(comboBannerTimeoutRef.current);
      }
      if (supportClearTimeoutRef.current !== null) {
        window.clearTimeout(supportClearTimeoutRef.current);
      }
    };
  }, []);
  useEffect(() => {
    wordIndexRef.current = wordIndex;
  });
  useEffect(() => {
    hitsRef.current = hits;
    wordsAttemptedRef.current = wordsAttempted;
    xpRef.current = xp;
    coinsRef.current = coins;
    timeRemainingRef.current = timeRemainingMs;
    lastCoinAwardRef.current = lastCoinAward;
    lastTimeAwardRef.current = lastTimeAwardMs;
    hitStreakRef.current = hitStreak;
    bestStreakRef.current = bestStreak;
    flaggedWordsRef.current = flaggedWords;
  }, [bestStreak, coins, flaggedWords, hits, hitStreak, lastCoinAward, lastTimeAwardMs, timeRemainingMs, wordsAttempted, xp]);

  const expectedWord =
    wordIndex < words.length ? (words[wordIndex] ?? "") : "";
  const heard =
    heardTranscript || scoringInterimTranscript.trim().split(/\s+/).filter(Boolean).pop() || "—";
  const supportActive = supportCue !== null;
  const supportPaused = supportCue?.mode === "pause";
  const speedMultiplier =
    pronunciationSpeedMultiplier(hitStreak) *
    pronunciationFlowSpeedMultiplier(flowRound) *
    (challengeMode === "hard" ? 1.25 : 1) *
    (supportActive && !supportPaused ? 0.6 : 1);
  const timerDrainMultiplier =
    pronunciationTimerDrainMultiplier(hitStreak) *
    pronunciationFlowTimerDrainMultiplier(flowRound);
  const heatBeatMs = Math.round(900 / speedMultiplier);
  const travelMs = Math.round(TRAVEL_MS / speedMultiplier);
  const zoneMs = Math.round(ZONE_MS / speedMultiplier);
  const totalMs = travelMs + zoneMs;
  const heatedUp = hitStreak >= HEAT_THRESHOLD;
  const timerFillPct = Math.max(0, Math.min(100, (timeRemainingMs / TIMER_MAX_MS) * 100));
  const lowTime = timeRemainingMs <= 10_000;

  const emitPronunciationGameState = useCallback(
    (phase: string, extra: Record<string, unknown> = {}) => {
      const idx = wordIndexRef.current;
      const rawWordIndex =
        typeof extra.wordIndex === "number" ? extra.wordIndex : idx;
      const visibleWordIndex = Math.max(
        0,
        Math.min(rawWordIndex, activeWordPool.length),
      );
      const currentWord =
        typeof extra.currentWord === "string"
          ? extra.currentWord
          : words[Math.min(idx, Math.max(0, words.length - 1))] ?? "";
      const attempts = wordsAttemptedRef.current;
      const payload = {
        game: "pronunciation",
        phase,
        currentWord,
        expectedWords: activeWordPool,
        wordIndex: visibleWordIndex,
        totalWords: activeWordPool.length,
        lastHeard: interimRef.current.trim() || undefined,
        sttStatus,
        missCount: missCountByWordRef.current.get(normalizePracticeWord(String(currentWord))) ?? 0,
        accuracy: attempts > 0 ? hitsRef.current / attempts : undefined,
        timeRemainingMs: timeRemainingRef.current,
        timerMaxMs: TIMER_MAX_MS,
        coins: coinsRef.current,
        heatMode: hitStreakRef.current >= HEAT_THRESHOLD,
        flowRound: flowRoundRef.current,
        tempoMultiplier:
          pronunciationSpeedMultiplier(hitStreakRef.current) *
          pronunciationFlowSpeedMultiplier(flowRoundRef.current),
        timerDrainMultiplier:
          pronunciationTimerDrainMultiplier(hitStreakRef.current) *
          pronunciationFlowTimerDrainMultiplier(flowRoundRef.current),
        lastTimeAwardMs: lastTimeAwardRef.current,
        lastCoinAward: lastCoinAwardRef.current,
        replayOnly: replayRunRef.current > 0,
        ...extra,
      };
      const fingerprint = JSON.stringify(payload);
      if (fingerprint === stateUpdateFingerprintRef.current) return;
      stateUpdateFingerprintRef.current = fingerprint;
      sendMessage("game_state_update", payload);
    },
    [activeWordPool, sendMessage, sttStatus, words],
  );

  useEffect(() => {
    if (ended || isComplete || wordIndex >= words.length) return;
    emitPronunciationGameState(blockPhase, {
      currentWord: expectedWord,
      wordIndex,
    });
  }, [
    blockPhase,
    emitPronunciationGameState,
    ended,
    expectedWord,
    isComplete,
    wordIndex,
    words.length,
  ]);

  useEffect(() => {
    if (ended || isComplete || wordIndex >= words.length) return;
    emitPronunciationGameState(sttStatus, {
      currentWord: expectedWord,
      wordIndex,
    });
  }, [emitPronunciationGameState, ended, expectedWord, isComplete, sttStatus, wordIndex, words.length]);

  useEffect(() => {
    if (lastLoggedDrainMultiplierRef.current === timerDrainMultiplier) return;
    lastLoggedDrainMultiplierRef.current = timerDrainMultiplier;
    console.log(
      ` 🎮 [pronunciation] [tempo] speed=${speedMultiplier.toFixed(2)} drain=${timerDrainMultiplier.toFixed(2)}`,
    );
  }, [speedMultiplier, timerDrainMultiplier]);

  useEffect(() => {
    const onSupport = (event: Event) => {
      const detail = (event as CustomEvent<PronunciationSupportCue>).detail;
      if (!detail || typeof detail !== "object") return;
      const requestedWord = detail.word?.trim().toLowerCase();
      if (requestedWord && requestedWord !== expectedWord.trim().toLowerCase()) {
        return;
      }
      if (supportClearTimeoutRef.current !== null) {
        window.clearTimeout(supportClearTimeoutRef.current);
      }
      setSupportCue(detail);
      emitPronunciationGameState("support", {
        currentWord: expectedWord,
        wordIndex,
        supportMode: detail.mode ?? "slow",
        supportChunks: detail.chunks,
      });
      const durationMs = Math.max(1500, Number(detail.durationMs) || 7000);
      supportClearTimeoutRef.current = window.setTimeout(() => {
        supportClearTimeoutRef.current = null;
        setSupportCue(null);
        cycleStartRef.current = performance.now();
      }, durationMs);
    };
    window.addEventListener("sunny_pronunciation_support", onSupport);
    return () => {
      window.removeEventListener("sunny_pronunciation_support", onSupport);
    };
  }, [emitPronunciationGameState, expectedWord, wordIndex]);

  const burst = useCallback((x: number, y: number) => {
    const colors = ["#4ade80", "#86efac", "#bbf7d0", "#fff"];
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      particlesDataRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        r: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)] ?? "#fff",
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.75,
      });
    }
  }, []);

  useEffect(() => {
    const elId = "pronunciation-game-fonts";
    if (!document.getElementById(elId)) {
      const link = document.createElement("link");
      link.id = elId;
      link.rel = "stylesheet";
      link.href = FONT_LINK;
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          void v.play().catch(() => {});
        }
        setCameraOk(true);
      } catch {
        setCameraOk(false);
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useLayoutEffect(() => {
    if (!hasStarted) return;
    runSerialRef.current += 1;
    staleHitWordIndexAfterResetRef.current = wordIndex > 0 ? wordIndex : null;
    prevWordIndexRef.current = -1;
    hitProcessedForWordIndexRef.current = -1;
    cycleStartRef.current = performance.now();
    runStartedAtRef.current = performance.now();
    lastTimerTickAtRef.current = performance.now();
    timeRemainingRef.current = TIMER_START_MS;
    coinsRef.current = 0;
    lastCoinAwardRef.current = 0;
    lastTimeAwardRef.current = 0;
    maxHeatStreakRef.current = 0;
    hitStreakRef.current = 0;
    flowRoundRef.current = replayRunRef.current;
    timeoutArmedRef.current = true;
    queueMicrotask(() => {
      setCycleKey((k) => k + 1);
      setBlockPhase("approaching");
      setHits(0);
      setWordsAttempted(0);
      setXp(0);
      setCoins(0);
      setTimeRemainingMs(TIMER_START_MS);
      setStreak(0);
      setHitStreak(0);
      setBestStreak(0);
      setHeatBanner("off");
      bonusWordIndexRef.current = null;
      setBonusWordIndex(null);
      setComboBreakerBanner(false);
      setLastHitXp(0);
      setLastCoinAward(0);
      setLastTimeAwardMs(0);
      setLastHitWasBonus(false);
      setFlowRound(replayRunRef.current);
      completeSentRef.current = false;
      lastMilestoneStreakRef.current = 0;
      setEnded(false);
      missCountByWordRef.current = new Map();
      hitCountByWordRef.current = new Map();
    });
  }, [pronunciationRunKey, hasStarted]);

  const triggerComboBreaker = useCallback(
    (streakCount: number, nextWordIndex: number) => {
      const bonusIndex = nextWordIndex < words.length ? nextWordIndex : null;
      const bonusWord = bonusIndex !== null ? words[bonusIndex] ?? "" : "";
      if (bonusIndex !== null) {
        bonusWordIndexRef.current = bonusIndex;
        setBonusWordIndex(bonusIndex);
      }

      console.log(" 🎮 [pronunciation] combo_breaker fired", {
        streak: streakCount,
        bonusWord,
      });
      sendMessage("game_event", {
        event: {
          type: "combo_breaker",
          payload: {
            game: "pronunciation",
            streak: streakCount,
            bonusWord,
            bonusMultiplier: 2,
            difficulty: "super_hard",
            reason: "huge_streak",
          },
          version: "1.0",
        },
      });

      setComboBreakerBanner(true);
      if (comboBannerTimeoutRef.current !== null) {
        window.clearTimeout(comboBannerTimeoutRef.current);
      }
      comboBannerTimeoutRef.current = window.setTimeout(() => {
        comboBannerTimeoutRef.current = null;
        setComboBreakerBanner(false);
      }, COMBO_BREAKER_BANNER_MS);
    },
    [sendMessage, words],
  );

  const restartPronunciation = useCallback(
    (mode: "normal" | "hard", source: "manual" | "adaptive_flow" = "manual") => {
      const nextWords = mode === "hard" ? hardReplayWords : baseWords;
      replayRequestsRef.current += 1;
      replayRunRef.current += 1;
      if (source === "adaptive_flow") autoFlowRoundsRef.current += 1;
      flowRoundRef.current = replayRunRef.current;
      hitStreakRef.current = 0;
      maxHeatStreakRef.current = 0;
      lastMilestoneStreakRef.current = 0;
      setFlowRound(replayRunRef.current);
      setStreak(0);
      setHitStreak(0);
      setHeatBanner("off");
      setComboBreakerBanner(false);
      ignoreReplayTranscriptRef.current = transcriptFingerprint(interimRef.current);
      setChallengeMode(mode);
      setHeardTranscript("");
      playGameSfx("pronunciation", "replayStart");
      sendMessage("game_event", {
        event: {
          type: "replay_requested",
          payload: {
            game: "pronunciation",
            mode,
            source,
            flowRound: replayRunRef.current,
            wordCount: nextWords.length,
          },
          version: "1.0",
        },
      });
      emitPronunciationGameState("replay_requested", {
        mode,
        source,
        flowRound: replayRunRef.current,
        totalWords: nextWords.length,
      });
      setReplaySeed((seed) => seed + 1);
    },
    [baseWords, emitPronunciationGameState, hardReplayWords, sendMessage],
  );

  useEffect(() => {
    return () => {
      if (flowRestartTimerRef.current !== null) {
        window.clearTimeout(flowRestartTimerRef.current);
        flowRestartTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!hasStarted) return;
    if (ended) return;
    if (supportPaused) return;
    lastTimerTickAtRef.current = performance.now();
    const tickId = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.max(TIMER_TICK_MS, now - lastTimerTickAtRef.current);
      lastTimerTickAtRef.current = now;
      setTimeRemainingMs((remaining) => {
        if (remaining <= 0) return 0;
        const drain =
          pronunciationTimerDrainMultiplier(hitStreakRef.current) *
          pronunciationFlowTimerDrainMultiplier(flowRoundRef.current);
        const next = Math.max(0, remaining - elapsed * drain);
        timeRemainingRef.current = next;
        if (next <= 0) {
          console.log(" 🎮 [pronunciation] [timer] game_over");
          endReasonRef.current = "timer";
          setEndReason("timer");
          setEnded(true);
        }
        return next;
      });
    }, TIMER_TICK_MS);
    return () => window.clearInterval(tickId);
  }, [hasStarted, ended, supportPaused]);

  const finalizeOnce = useCallback((reason: PronunciationRunEndReason) => {
    if (completeSentRef.current) return { shouldStartAdaptiveFlow: false };
    completeSentRef.current = true;
    const h = hitsRef.current;
    const rawResolvedAttempts = wordsAttemptedRef.current;
    const x = xpRef.current;
    const bs = bestStreakRef.current;
    const c = coinsRef.current;
    const survived = Math.round(performance.now() - runStartedAtRef.current);
    const fw = flaggedWordsRef.current;
    const targetResults = activeWordPool.map((word) => {
      const key = normalizePracticeWord(word);
      const hitsForWord = hitCountByWordRef.current.get(key) ?? 0;
      const missesForWord = missCountByWordRef.current.get(key) ?? 0;
      const chartAttempts = missesForWord + (hitsForWord > 0 ? 1 : 0);
      return {
        target: word,
        correct: hitsForWord > 0,
        attempts: chartAttempts,
        scaffoldLevel: missesForWord > 0 ? 1 : 0,
        mode: "pronunciation",
        evidenceTier: "practice",
        masteryEligible: false,
        struggleSignals: missesForWord > 0 ? ["missed_then_recovered"] : [],
      };
    });
    const correctCount = targetResults.filter((row) => row.correct).length;
    const uniqueTargetsAttempted = targetResults.filter((row) => row.attempts > 0).length;
    const chartAttempts = targetResults.reduce((sum, row) => sum + row.attempts, 0);
    const retryCount = targetResults.reduce((sum, row) => sum + Math.max(0, row.attempts - 1), 0);
    const rounds = Math.max(
      1,
      activeWordPool.length > 0 ? Math.ceil(rawResolvedAttempts / activeWordPool.length) : 0,
    );
    const missToHitRecoveries = targetResults.filter((row) =>
      row.correct && row.struggleSignals.includes("missed_then_recovered"),
    ).length;
    const flowState = {
      timeOnTask_ms: survived,
      bestStreak: bs,
      heatReached: maxHeatStreakRef.current >= HEAT_THRESHOLD,
      comboReached: maxHeatStreakRef.current >= COMBO_BREAKER_STREAK,
      retries: retryCount,
      missToHitRecoveries,
      idleEvents: 0,
      pauseRequests: 0,
      replayRequests: replayRequestsRef.current,
      powerBarSurvival_ms: survived,
      abandoned: false,
    };
    const accuracyRatio = chartAttempts > 0 ? correctCount / chartAttempts : 0;
    const acc = Math.round(accuracyRatio * 100);
    const replayOnly = authoritativeCompleteSentRef.current || replayRunRef.current > 0;
    const effectiveBestStreak = Math.max(bs, hitStreakRef.current, correctCount);
    const shouldStartAdaptiveFlow =
      reason === "completed_targets" &&
      accuracyRatio >= 0.8 &&
      effectiveBestStreak >= HEAT_THRESHOLD &&
      uniqueTargetsAttempted >= Math.min(activeWordPool.length, HEAT_THRESHOLD) &&
      autoFlowRoundsRef.current < MAX_ADAPTIVE_FLOW_ROUNDS;
    playGameSfx("pronunciation", "completeFanfare");
    emitPronunciationGameState("complete", {
      lastOutcome: "complete",
      replayOnly,
      chartEligible: !replayOnly,
      adaptiveFlowEligible: shouldStartAdaptiveFlow,
      correctCount,
      wordsAttempted: chartAttempts,
      rawResolvedAttempts,
      hitEvents: h,
      uniqueTargetsAttempted,
      rounds,
      accuracy: accuracyRatio,
      flaggedWords: [...fw],
      targetResults,
      bestStreak: bs,
      coinsEarned: c,
      timeSurvivedMs: survived,
      runEndedReason: reason,
      flowRound: flowRoundRef.current,
      maxHeatStreak: maxHeatStreakRef.current,
      flowState,
      evidenceTier: "practice",
    });
    if (!replayOnly) {
      authoritativeCompleteSentRef.current = true;
      onComplete?.({
        wordsHit: correctCount,
        wordsAttempted: chartAttempts,
        hitEvents: h,
        uniqueTargetsAttempted,
        rounds,
        accuracy: acc,
        totalWords: activeWordPool.length,
        correctCount,
        evidenceTier: "practice",
        targetResults,
        flaggedWords: [...fw],
        xpEarned: x,
        bestStreak: bs,
        coinsEarned: c,
        timeSurvivedMs: survived,
        runEndedReason: reason,
        maxHeatStreak: maxHeatStreakRef.current,
        flowState,
        replayOnly: false,
        chartEligible: true,
      });
    }
    return { shouldStartAdaptiveFlow };
  }, [activeWordPool, emitPronunciationGameState, onComplete]);

  useEffect(() => {
    if (!ended) return;
    finalizeOnce(endReasonRef.current);
  }, [ended, finalizeOnce]);

  const finishRound = useCallback(
    (reason: PronunciationRunEndReason) => {
      if (completeSentRef.current) return;
      endReasonRef.current = reason;
      const result = finalizeOnce(reason);
      if (result.shouldStartAdaptiveFlow) {
        console.log(
          ` 🎮 [pronunciation] [adaptive-flow] round=${autoFlowRoundsRef.current + 1} reason=flow_state_ready`,
        );
        flowRestartTimerRef.current = window.setTimeout(() => {
          flowRestartTimerRef.current = null;
          restartPronunciation("hard", "adaptive_flow");
        }, ADAPTIVE_FLOW_RESTART_MS);
        return;
      }
      setEndReason(reason);
      setEnded(true);
    },
    [finalizeOnce, restartPronunciation],
  );

  const triggerMissYank = useCallback(() => {
    console.log(
      "[PG] MISS YANK | word:",
      words[wordIndexRef.current],
      "| blockPhase:",
      blockPhase,
      "| timeoutArmed:",
      timeoutArmedRef.current,
    );
    if (blockPhase !== "approaching" || ended || isComplete) return;
    if (!timeoutArmedRef.current) return;
    timeoutArmedRef.current = false;
    const w = words[wordIndexRef.current] ?? "";
    const missKey = normalizePracticeWord(w);
    const prev = missCountByWordRef.current.get(missKey) ?? 0;
    const newCount = prev + 1;
    missCountByWordRef.current.set(missKey, newCount);
    if (newCount === 1) {
      playGameSfx("pronunciation", "missThunk");
    }
    const seq = (missSeqRef.current += 1);
    sendMessage("game_event", {
      event: {
        type: "pronunciation_miss",
        payload: {
          game: "pronunciation",
          word: w,
          wordIndex: wordIndexRef.current,
          attempt: newCount,
        },
        version: "1.0",
      },
    });
    emitPronunciationGameState("miss", {
      currentWord: w,
      wordIndex: wordIndexRef.current,
      lastOutcome: "miss",
      lastOutcomeWord: w,
      missCount: newCount,
      heatMode: false,
      flowRound: flowRoundRef.current,
      tempoMultiplier: pronunciationFlowSpeedMultiplier(flowRoundRef.current),
      timerDrainMultiplier: pronunciationFlowTimerDrainMultiplier(flowRoundRef.current),
      lastCoinAward: 0,
      lastTimeAwardMs: 0,
    });
    setMissSeq(seq);
    setShowWrongBadge(true);
    setBlockPhase("miss");
    setWordsAttempted((w) => w + 1);
    setStreak(0);
    setHitStreak(0);
    hitStreakRef.current = 0;
    lastMilestoneStreakRef.current = 0;
    console.log(" 🎮 [pronunciation] [sfx_reset] miss");
    setHeatBanner("off");
    lastCoinAwardRef.current = 0;
    lastTimeAwardRef.current = 0;
    setLastCoinAward(0);
    setLastTimeAwardMs(0);
    if (bonusWordIndexRef.current === wordIndexRef.current) {
      bonusWordIndexRef.current = null;
      setBonusWordIndex(null);
    }
    window.setTimeout(() => {
      setCycleKey((k) => k + 1);
      setBlockPhase("approaching");
      setShowWrongBadge(false);
      cycleStartRef.current = performance.now();
      timeoutArmedRef.current = true;
    }, YANK_OUT_MS + YANK_BACK_MS);
  }, [blockPhase, emitPronunciationGameState, ended, isComplete, sendMessage, words]);

  useEffect(() => {
    if (blockPhase !== "approaching" || ended || isComplete) return;
    if (supportPaused) return;
    cycleStartRef.current = performance.now();
    timeoutArmedRef.current = true;
    timeoutIntervalRef.current = window.setInterval(() => {
      if (!timeoutArmedRef.current) return;
      if (performance.now() - cycleStartRef.current >= totalMs) {
        console.log(
          "[PG] TIMEOUT | elapsed:",
          performance.now() - cycleStartRef.current,
          "| word:",
          words[wordIndexRef.current],
        );
        triggerMissYank();
      }
    }, 200);
    return () => {
      if (timeoutIntervalRef.current !== null) {
        clearInterval(timeoutIntervalRef.current);
        timeoutIntervalRef.current = null;
      }
    };
  }, [blockPhase, cycleKey, ended, isComplete, supportPaused, totalMs, triggerMissYank, words]);

  useEffect(() => {
    if (wrongTimerRef.current) {
      clearTimeout(wrongTimerRef.current);
      wrongTimerRef.current = null;
    }
    if (blockPhase !== "approaching" || ended || isComplete) return;
    const t = scoringInterimTranscript.trim();
    const heardWords = transcriptWords(t);
    const last = heardWords.at(-1) ?? "";
    console.log(
      "[PG] interim changed | heard:",
      last,
      "| expected:",
      words[wordIndex],
      "| blockPhase:",
      blockPhase,
      "| debounce length check:",
      last.length,
    );
    // STT interims are noisy for kids' voices. Do not punish a mismatch while
    // the recognizer is still settling; misses come from the block timeout.
    return () => {
      if (wrongTimerRef.current) {
        clearTimeout(wrongTimerRef.current);
        wrongTimerRef.current = null;
      }
    };
  }, [
    scoringInterimTranscript,
    blockPhase,
    wordIndex,
    words,
    ended,
    isComplete,
    triggerMissYank,
  ]);

  useEffect(() => {
    // SYNCHRONOUS guards — must run before any async work
    if (ended) return;
    if (wordIndex === staleHitWordIndexAfterResetRef.current) return;
    // prev starts at -1; `0 <= -1` is false in JS, so block mount-only wordIndex 0 explicitly
    if (wordIndex === 0 && prevWordIndexRef.current < 0) return;
    if (wordIndex <= prevWordIndexRef.current) return;
    if (hitProcessedForWordIndexRef.current === wordIndex) return;
    prevWordIndexRef.current = wordIndex;
    hitProcessedForWordIndexRef.current = wordIndex;

    console.log(
      "[PG] HIT | wordIndex advanced to:",
      wordIndex,
      "| word was:",
      words[wordIndex - 1],
      "| blockPhase:",
      blockPhase,
    );
    if (timeoutIntervalRef.current !== null) {
      clearInterval(timeoutIntervalRef.current);
      timeoutIntervalRef.current = null;
    }
    timeoutArmedRef.current = false;
    const advancedTo = wordIndex;
    // Clear the wrong-word debounce timer immediately on hit
    if (wrongTimerRef.current) {
      clearTimeout(wrongTimerRef.current);
      wrongTimerRef.current = null;
    }
    hitCooldownUntilRef.current = performance.now() + 1500;
    // Record the interim at hit time so debounce can ignore stale values
    lastHitInterimRef.current = interimRef.current.trim();
    const hitWordIndex = advancedTo - 1;
    const hitWord = words[hitWordIndex] ?? "";
    const nextWord = words[advancedTo] ?? hitWord;
    const hitKey = normalizePracticeWord(hitWord);
    const hitRunSerial = runSerialRef.current;
    hitCountByWordRef.current.set(
      hitKey,
      (hitCountByWordRef.current.get(hitKey) ?? 0) + 1,
    );
    hitsRef.current += 1;
    wordsAttemptedRef.current += 1;
    emitPronunciationGameState("hit", {
      currentWord: nextWord,
      wordIndex: advancedTo,
      lastOutcome: "hit",
      lastOutcomeWord: hitWord,
    });
    const wasBonusHit = bonusWordIndexRef.current === hitWordIndex;
    if (wasBonusHit) {
      bonusWordIndexRef.current = null;
      setBonusWordIndex(null);
    }
    queueMicrotask(() => {
      if (hitRunSerial !== runSerialRef.current) return;
      setShowHitBadge(true);
      setBlockPhase("hit");
      setHits((h) => h + 1);
      setWordsAttempted((wa) => wa + 1);
      setStreak((s) => {
        if (hitRunSerial !== runSerialRef.current) return s;
        const ns = s + 1;
        bestStreakRef.current = Math.max(bestStreakRef.current, ns);
        setBestStreak((b) => (ns > b ? ns : b));
        setHitStreak((hs) => {
          if (hitRunSerial !== runSerialRef.current) return hs;
          const nhs = hs + 1;
          hitStreakRef.current = nhs;
          maxHeatStreakRef.current = Math.max(maxHeatStreakRef.current, nhs);
          const nextHeat = nhs >= HEAT_THRESHOLD;
          const rewardMultiplier = pronunciationFlowRewardMultiplier(flowRoundRef.current);
          const coinAward = Math.max(
            1,
            Math.round((nextHeat ? HEAT_COIN_AWARD : NORMAL_COIN_AWARD) * rewardMultiplier),
          );
          const timeAward = Math.round(
            (nextHeat ? HEAT_TIME_AWARD_MS : NORMAL_TIME_AWARD_MS) * rewardMultiplier,
          );
          const nextCoins = coinsRef.current + coinAward;
          const nextTime = Math.min(TIMER_MAX_MS, timeRemainingRef.current + timeAward);
          coinsRef.current = nextCoins;
          timeRemainingRef.current = nextTime;
          lastCoinAwardRef.current = coinAward;
          lastTimeAwardRef.current = timeAward;
          setCoins(nextCoins);
          setTimeRemainingMs(nextTime);
          setLastCoinAward(coinAward);
          setLastTimeAwardMs(timeAward);
          const earnedXp = scoreForHit(nhs, ns) * (wasBonusHit ? 2 : 1);
          sendMessage("game_event", {
            event: {
              type: "pronunciation_hit",
              payload: {
                game: "pronunciation",
                word: hitWord,
                wordIndex: hitWordIndex,
                streak: ns,
                bonusMultiplier: wasBonusHit ? 2 : 1,
              },
              version: "1.0",
            },
          });
          setLastHitXp(earnedXp);
          setLastHitWasBonus(wasBonusHit);
          xpRef.current += earnedXp;
          setXp((x) => x + earnedXp);
          emitPronunciationGameState("hit", {
            currentWord: nextWord,
            wordIndex: advancedTo,
            lastOutcome: "hit",
            lastOutcomeWord: hitWord,
            coins: nextCoins,
            timeRemainingMs: nextTime,
            heatMode: nextHeat,
            flowRound: flowRoundRef.current,
            tempoMultiplier:
              pronunciationSpeedMultiplier(nhs) *
              pronunciationFlowSpeedMultiplier(flowRoundRef.current),
            timerDrainMultiplier:
              pronunciationTimerDrainMultiplier(nhs) *
              pronunciationFlowTimerDrainMultiplier(flowRoundRef.current),
            lastCoinAward: coinAward,
            lastTimeAwardMs: timeAward,
          });
          if (nhs > lastMilestoneStreakRef.current) {
            playPronunciationHitSfx(nhs);
            lastMilestoneStreakRef.current = nhs;
          }
          if (nextHeat) {
            setHeatBanner("heating");
          }
          if (nhs === COMBO_BREAKER_STREAK) {
            triggerComboBreaker(nhs, advancedTo);
          }
          if (advancedTo >= words.length) {
            window.setTimeout(() => {
              if (hitRunSerial === runSerialRef.current) {
                finishRound("completed_targets");
              }
            }, 0);
          }
          return nhs;
        });
        return ns;
      });
    });
    requestAnimationFrame(() => {
      if (hitRunSerial !== runSerialRef.current) return;
      const el = blockWrapRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2);
      }
    });
    window.setTimeout(() => {
      if (hitRunSerial !== runSerialRef.current) return;
      setShowHitBadge(false);
      if (advancedTo >= words.length) return;
      setCycleKey((k) => k + 1);
      setBlockPhase("approaching");
      cycleStartRef.current = performance.now();
      timeoutArmedRef.current = true;
    }, HIT_MS);
    // Diagnostic log reads words/blockPhase; effect timing unchanged from pre-log version.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- PG diagnostics only
  }, [wordIndex, words, ended, burst, emitPronunciationGameState, finishRound, triggerComboBreaker]);

  useEffect(() => {
    const c = particlesRef.current;
    if (!c) return;
    const resize = () => {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const tick = () => {
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      const arr = particlesDataRef.current;
      const dt = 1 / 60;
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i]!;
        p.life -= dt;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        if (p.life <= 0) {
          arr.splice(i, 1);
          continue;
        }
        const a = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      rafParticlesRef.current = requestAnimationFrame(tick);
    };
    rafParticlesRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafParticlesRef.current);
    };
  }, []);

  const listening =
    !ended && activeWordPool.length > 0 && wordIndex < words.length;

  const css = `
    @keyframes pg-approach {
      from { transform: translateX(-50%) translateY(-50%) scale(0.3); opacity: 0.6; }
      to { transform: translateX(-50%) translateY(-50%) scale(1.4); opacity: 1; }
    }
    /* SHOCKWAVE HIT */
    @keyframes pg-ring-expand {
      0%   { width: 30px; height: 30px; opacity: 1; border-width: 4px; }
      100% { width: 280px; height: 280px; opacity: 0; border-width: 1px; }
    }
    @keyframes pg-xp-float {
      0%   { transform: translate(-50%, -50%) scale(0); opacity: 1; }
      30%  { transform: translate(-50%, -80%) scale(1.4); opacity: 1; }
      100% { transform: translate(-50%, -160%) scale(0.8); opacity: 0; }
    }
    @keyframes pg-hit-pass {
      0%   { transform: translateX(-50%) translateY(-50%) scale(1.4); }
      50%  { transform: translateX(-50%) translateY(-50%) scale(2);
             filter: brightness(1.8); }
      100% { transform: translateX(-50%) translateY(-50%) scale(3); opacity: 0; }
    }
    /* COMIC MISS */
    @keyframes pg-miss-shatter {
      0%,5%,15%,25% { transform: translateX(-50%) translateY(-50%) scale(1.4); }
      10%  { transform: translate(calc(-50% + 6px), -50%) scale(1.4);
             filter: brightness(2) hue-rotate(-40deg); }
      20%  { transform: translate(calc(-50% - 6px), -50%) scale(1.4); }
      100% { transform: translateX(-50%) translateY(-50%) scale(0.3) rotate(12deg);
             opacity: 0; filter: grayscale(1); }
    }
    @keyframes pg-miss-stamp {
      0%   { transform: translate(-50%, -50%) rotate(4deg) scale(0); }
      50%  { transform: translate(-50%, -50%) rotate(4deg) scale(1.3); opacity: 1; }
      100% { transform: translate(-50%, -50%) rotate(4deg) scale(1); opacity: 0.85; }
    }
    @keyframes pg-heat-banner-in {
      from { transform: translateY(-120%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes pg-flame-trail {
      0% { transform: translate(-50%, -50%) scale(0.7) rotate(-8deg); opacity: 0.15; }
      45% { opacity: 0.9; }
      100% { transform: translate(-50%, -50%) scale(1.5) rotate(8deg); opacity: 0; }
    }
    @keyframes pg-heat-flame {
      0% { transform: translate(-50%, 0) scale(0.75); opacity: 0.15; }
      35% { opacity: 0.85; }
      100% { transform: translate(-50%, -42px) scale(1.15); opacity: 0; }
    }
    @keyframes pg-heat-flicker {
      0%, 100% { filter: brightness(1); }
      50% { filter: brightness(1.25) saturate(1.2); }
    }
    @keyframes pg-heat-beat {
      0%, 100% { transform: scale(1); filter: brightness(1) saturate(1); }
      50% { transform: scale(1.045); filter: brightness(1.35) saturate(1.28); }
    }
    @keyframes pg-timer-beat {
      0%, 100% { transform: scaleY(1); filter: brightness(1); }
      50% { transform: scaleY(1.055); filter: brightness(1.35); }
    }
    @keyframes pg-combo-pop {
      0% { transform: translateY(-20px) scale(0.8); opacity: 0; }
      55% { transform: translateY(0) scale(1.08); opacity: 1; }
      100% { transform: translateY(0) scale(1); opacity: 1; }
    }
    @keyframes pg-mic-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.55; transform: scale(0.75); }
    }
    @keyframes pg-time-warning {
      0%, 100% { transform: scaleY(1); filter: brightness(1); }
      50% { transform: scaleY(1.03); filter: brightness(1.35); }
    }
  `;

  const blockAnim =
    blockPhase === "approaching"
      ? `pg-approach ${travelMs}ms linear forwards`
      : blockPhase === "hit"
        ? `pg-hit-pass ${HIT_MS}ms ease-out forwards`
        : `pg-miss-shatter ${YANK_OUT_MS + YANK_BACK_MS}ms cubic-bezier(0.33, 1, 0.68, 1) forwards`;
  const isBonusWord = bonusWordIndex === wordIndex && blockPhase === "approaching";

  if (!hasStarted) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, #0e172a 0%, #05070c 75%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Lexend', system-ui, sans-serif",
          color: "white",
          gap: 32,
          paddingTop: topInset,
        }}
      >
        <style>{css}</style>
        <div
          style={{
            fontFamily: "'Fredoka', sans-serif",
            fontSize: 40,
            fontWeight: 800,
            textAlign: "center",
            lineHeight: 1.1,
          }}
        >
          Say each word aloud
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "center",
            maxWidth: 480,
          }}
        >
          {activeWordPool.map((w) => (
            <span
              key={w}
              style={{
                padding: "10px 20px",
                borderRadius: 999,
                background: "rgba(109,94,245,0.25)",
                border: "1px solid rgba(109,94,245,0.5)",
                fontFamily: "'Fredoka', sans-serif",
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {w}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setHasStarted(true)}
          style={{
            marginTop: 8,
            padding: "18px 52px",
            borderRadius: 999,
            background: "linear-gradient(135deg, #6D5EF5, #a78bfa)",
            border: "none",
            color: "white",
            fontSize: 22,
            fontFamily: "'Fredoka', sans-serif",
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 4px 24px rgba(109,94,245,0.5)",
            letterSpacing: "0.02em",
          }}
        >
          Let's Go!
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "#05070c",
        fontFamily: "'Lexend', system-ui, sans-serif",
        color: "white",
      }}
    >
      <style>{css}</style>
      <span
        data-testid="pronunciation-speed-state"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
      >
        {speedMultiplier.toFixed(2)}x
      </span>
      <span
        data-testid="pronunciation-drain-state"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
      >
        {timerDrainMultiplier.toFixed(2)}x
      </span>
      <div
        data-testid="pronunciation-progress"
        style={{
          position: "fixed",
          top: Math.max(22, topInset + 14),
          left: 22,
          zIndex: 40,
          padding: "8px 14px",
          borderRadius: 8,
          background: "rgba(5, 7, 12, 0.72)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          color: "rgba(255, 255, 255, 0.9)",
          fontFamily: "'Fredoka', sans-serif",
          fontSize: 18,
          fontWeight: 800,
          pointerEvents: "none",
        }}
      >
        Word {activeWordPool.length > 0 ? Math.min(wordIndex + 1, activeWordPool.length) : 0} / {activeWordPool.length}
      </div>
      {flowRound > 0 ? (
        <div
          data-testid="pronunciation-flow-round"
          style={{
            position: "fixed",
            top: Math.max(22, topInset + 14),
            left: 190,
            zIndex: 40,
            padding: "8px 14px",
            borderRadius: 8,
            background: "rgba(249, 115, 22, 0.22)",
            border: "1px solid rgba(251, 191, 36, 0.42)",
            color: "#fde68a",
            fontFamily: "'Fredoka', sans-serif",
            fontSize: 18,
            fontWeight: 800,
            pointerEvents: "none",
          }}
        >
          Flow round {flowRound}
        </div>
      ) : null}
      <div
        aria-label="time remaining"
        style={{
          position: "fixed",
          left: 24,
          top: Math.max(82, topInset + 76),
          bottom: 84,
          zIndex: 40,
          width: 42,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          pointerEvents: "none",
        }}
      >
        <div
          data-testid="pronunciation-time-label"
          style={{
            fontFamily: "'Fredoka', sans-serif",
            fontSize: 17,
            fontWeight: 900,
            color: lowTime ? "#fed7aa" : "#dbeafe",
            textShadow: "0 2px 10px rgba(0,0,0,0.55)",
          }}
        >
          {(timeRemainingMs / 1000).toFixed(1)}s
        </div>
        <div
          style={{
            position: "relative",
            width: 24,
            flex: 1,
            minHeight: 240,
            borderRadius: 999,
            background: "rgba(15, 23, 42, 0.74)",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: heatedUp
              ? "0 0 32px rgba(249,115,22,0.65)"
              : "0 0 22px rgba(96,165,250,0.28)",
            overflow: "hidden",
          }}
        >
          <div
            data-testid="pronunciation-timer-fill"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: `${timerFillPct}%`,
              borderRadius: 999,
              background: heatedUp
                ? "linear-gradient(180deg, #facc15, #f97316 48%, #dc2626)"
                : lowTime
                  ? "linear-gradient(180deg, #fde68a, #f97316 52%, #dc2626)"
                  : "linear-gradient(180deg, #a78bfa, #60a5fa 48%, #22d3ee)",
              boxShadow: heatedUp
                ? "0 0 26px rgba(249,115,22,0.85)"
                : lowTime
                  ? "0 0 22px rgba(248,113,113,0.72)"
                  : "0 0 18px rgba(96,165,250,0.5)",
              animation: lowTime
                ? "pg-time-warning 680ms ease-in-out infinite"
                : heatedUp
                  ? `pg-timer-beat ${heatBeatMs}ms ease-in-out infinite`
                  : undefined,
              transformOrigin: "bottom",
            }}
          />
        </div>
      </div>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background:
            "radial-gradient(ellipse at center, #0e172a 0%, #05070c 75%)",
          display: cameraOk ? "none" : "block",
        }}
      />
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: 1,
        }}
      />

      {heatBanner === "heating" ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2,
            pointerEvents: "none",
            boxShadow: "inset 0 0 120px rgba(255, 120, 40, 0.2)",
          }}
        />
      ) : null}

      {comboBreakerBanner ? (
        <div
          style={{
            position: "fixed",
            top: Math.max(108, topInset + 64),
            left: 0,
            right: 0,
            zIndex: 41,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: "'Fredoka', sans-serif",
              fontSize: 34,
              fontWeight: 900,
              color: "#fff7ed",
              padding: "12px 26px",
              borderRadius: 999,
              background: "linear-gradient(135deg, #f97316, #dc2626)",
              border: "2px solid rgba(254,240,138,0.85)",
              boxShadow: "0 0 42px rgba(249,115,22,0.65)",
              textShadow: "0 3px 0 rgba(0,0,0,0.35)",
              animation: "pg-combo-pop 360ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
            }}
          >
            COMBO BREAKER! 3x MONEY
          </div>
        </div>
      ) : null}

      {supportCue ? (
        <div
          data-testid="pronunciation-support-cue"
          style={{
            position: "fixed",
            top: Math.max(132, topInset + 92),
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 42,
            maxWidth: "min(720px, calc(100vw - 32px))",
            padding: "16px 24px",
            borderRadius: 18,
            background: "rgba(15, 23, 42, 0.9)",
            border: "1px solid rgba(125, 211, 252, 0.55)",
            boxShadow: "0 18px 60px rgba(14, 165, 233, 0.25)",
            color: "white",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: "'Fredoka', sans-serif",
              fontSize: 34,
              fontWeight: 900,
              marginBottom: 6,
            }}
          >
            {supportCue.chunked ?? supportCue.word ?? expectedWord}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#bae6fd" }}>
            {supportCue.guidance ?? "One part at a time."}
          </div>
        </div>
      ) : null}

      <div
        data-testid="pronunciation-word-runner"
        key={`${cycleKey}-${wordIndex}-${missSeq}`}
        ref={blockWrapRef}
        style={{
          position: "fixed",
          left: "50%",
          top: "42%",
          transform: "translateX(-50%) translateY(-50%)",
          zIndex: 3,
          pointerEvents: "none",
          animation: supportPaused ? `${blockAnim} paused` : blockAnim,
          willChange: "transform, opacity",
        }}
      >
        {heatedUp && !isBonusWord ? (
          <div
            data-testid="pronunciation-heat-fire"
            style={{
              position: "absolute",
              inset: "-42px -38px",
              zIndex: 0,
              pointerEvents: "none",
            }}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  left: `${14 + i * 14}%`,
                  bottom: -18,
                  width: 56,
                  height: 86,
                  borderRadius: "50% 50% 45% 45%",
                  background:
                    "radial-gradient(circle at 50% 72%, rgba(254,240,138,0.95) 0%, rgba(249,115,22,0.82) 38%, rgba(220,38,38,0) 72%)",
                  filter: "blur(1px)",
                  animation: `pg-heat-flame ${520 - Math.min(120, hitStreak * 12)}ms ease-out ${i * 65}ms infinite`,
                }}
              />
            ))}
          </div>
        ) : null}
        {isBonusWord ? (
          <div
            data-testid="pronunciation-bonus-word"
            style={{
              position: "absolute",
              inset: "-30px -48px",
              zIndex: 0,
              pointerEvents: "none",
            }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  left: `${18 + i * 16}%`,
                  top: `${44 + (i % 2) * 18}%`,
                  width: 92,
                  height: 92,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle, rgba(254,240,138,0.95) 0%, rgba(249,115,22,0.7) 42%, rgba(220,38,38,0) 72%)",
                  filter: "blur(2px)",
                  animation: `pg-flame-trail 800ms ease-out ${i * 90}ms infinite`,
                }}
              />
            ))}
          </div>
        ) : null}
        <div
          data-testid="pronunciation-word-card"
          style={{
            position: "relative",
            borderRadius: 20,
            padding: "24px 48px",
            fontFamily: "'Fredoka', sans-serif",
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.1,
            color: "white",
            textAlign: "center",
            minWidth: 280,
            background: isBonusWord
              ? "linear-gradient(135deg, #f97316, #facc15 48%, #dc2626)"
              : "linear-gradient(135deg, #6D5EF5, #a78bfa)",
            border: isBonusWord
              ? "4px solid rgba(254,240,138,0.95)"
              : "3px solid rgba(255,255,255,0.5)",
            boxShadow: isBonusWord
              ? "0 0 80px rgba(249,115,22,0.85), 0 0 18px rgba(254,240,138,0.8) inset"
              : heatedUp
                ? "0 0 86px rgba(249,115,22,0.72), 0 0 26px rgba(254,240,138,0.32) inset"
                : "0 0 60px rgba(109,94,245,0.6)",
            textShadow: "0 2px 8px rgba(0,0,0,0.35)",
            userSelect: "none",
            zIndex: 2,
            animation: heatedUp && !isBonusWord ? `pg-heat-beat ${heatBeatMs}ms ease-in-out infinite` : undefined,
          }}
        >
          {isBonusWord ? (
            <div
              style={{
                position: "absolute",
                top: -18,
                right: 18,
                padding: "5px 12px",
                borderRadius: 999,
                background: "#111827",
                color: "#fef08a",
                fontFamily: "'Fredoka', sans-serif",
                fontSize: 16,
                fontWeight: 900,
                letterSpacing: "0.04em",
                boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              }}
            >
              x2 SUPER HARD
            </div>
          ) : null}
          <span style={{ position: "relative", zIndex: 1 }}>
            {expectedWord || "—"}
          </span>
        </div>

        {showHitBadge &&
          [0, 100, 200].map((delay, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                borderRadius: "50%",
                border: `3px solid ${
                  i === 0 ? "#fbbf24" : i === 1 ? "#f472b6" : "#22d3ee"
                }`,
                transform: "translate(-50%, -50%)",
                animation: `pg-ring-expand 700ms ease-out ${delay}ms both`,
                pointerEvents: "none",
                zIndex: 0,
                boxSizing: "border-box",
              }}
            />
          ))}

        {showHitBadge ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              fontFamily: "'Fredoka', sans-serif",
              fontWeight: 800,
              fontSize: 28,
              color: "#fbbf24",
              textShadow: "0 0 12px #fbbf24",
              animation: "pg-xp-float 900ms ease-out both",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              zIndex: 3,
            }}
          >
            +{lastCoinAward || (heatedUp ? HEAT_COIN_AWARD : NORMAL_COIN_AWARD)} coins
            <div style={{ fontSize: 16, color: "#fde68a", textShadow: "0 0 8px #fbbf24" }}>
              +{lastHitXp || scoreForHit(hitStreak, streak)} XP{lastHitWasBonus ? " x2" : ""}
            </div>
          </div>
        ) : null}

        {showWrongBadge ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              fontFamily: "'Fredoka', sans-serif",
              fontWeight: 900,
              fontSize: 52,
              color: "#FFF4E2",
              WebkitTextStroke: "3px #000",
              textShadow: "3px 3px 0 #6366f1, 4px 4px 0 #3730a3",
              animation: `pg-miss-stamp ${YANK_OUT_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1) both`,
              animationDelay: "80ms",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              zIndex: 20,
            }}
          >
            MISS!
          </div>
        ) : null}
      </div>

      <canvas
        ref={particlesRef}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 4,
          pointerEvents: "none",
        }}
      />

      {heatBanner === "heating" ? (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
            paddingTop: Math.max(48, topInset + 8),
          }}
        >
          <div
            style={{
              fontFamily: "'Caveat', cursive",
              fontSize: 48,
              fontWeight: 700,
              color: "#fbbf24",
              textShadow: "0 2px 12px rgba(0,0,0,0.5)",
              animation:
                "pg-heat-banner-in 420ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
            }}
          >
            THEY'RE HEATING UP 🔥
          </div>
        </div>
      ) : null}

      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 5,
          pointerEvents: "none",
        }}
      >
        <div
          data-testid="pronunciation-listening-status"
          style={{
            position: "absolute",
            top: 20 + topInset,
            left: 84,
            padding: "10px 18px",
            borderRadius: 999,
            background: "rgba(10, 12, 18, 0.75)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            fontSize: 15,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid rgba(255, 255, 255, 0.1)",
            pointerEvents: "auto",
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: listening && sttStatus === "listening" ? "#10b981" : "#f59e0b",
              boxShadow: listening && sttStatus === "listening" ? "0 0 10px #10b981" : undefined,
              animation: listening ? "pg-mic-pulse 1.4s infinite" : undefined,
            }}
          />
          {listening ? sttStatus : "waiting"}
        </div>
        <div
          data-testid="pronunciation-coins"
          style={{
            position: "absolute",
            top: 20 + topInset,
            right: 124,
            padding: "10px 18px",
            borderRadius: 999,
            background:
              "linear-gradient(135deg, rgba(250, 204, 21, 0.9), rgba(245, 158, 11, 0.88))",
            color: "#111827",
            fontSize: 15,
            fontWeight: 800,
            border: "1px solid rgba(255, 255, 255, 0.18)",
            pointerEvents: "auto",
          }}
        >
          ${coins}
        </div>
        <div
          style={{
            position: "absolute",
            top: 20 + topInset,
            right: 232,
            padding: "10px 18px",
            borderRadius: 999,
            background:
              "linear-gradient(135deg, rgba(251, 191, 36, 0.85), rgba(239, 68, 68, 0.85))",
            fontSize: 15,
            fontWeight: 600,
            border: "1px solid rgba(255, 255, 255, 0.1)",
            pointerEvents: "auto",
          }}
        >
          🔥 {hitStreak}
        </div>
        <div
          style={{
            position: "absolute",
            top: 20 + topInset,
            right: 20,
            padding: "10px 18px",
            borderRadius: 999,
            background:
              "linear-gradient(135deg, rgba(139, 92, 246, 0.85), rgba(109, 94, 245, 0.85))",
            fontSize: 15,
            fontWeight: 600,
            border: "1px solid rgba(255, 255, 255, 0.1)",
            pointerEvents: "auto",
          }}
        >
          ✨ {xp} XP
        </div>
        <div
          style={{
            position: "fixed",
            bottom: 36,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 22px",
            borderRadius: 14,
            background: "rgba(10, 12, 18, 0.75)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            fontSize: 16,
            minWidth: 220,
            textAlign: "center",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            zIndex: 5,
            pointerEvents: "auto",
          }}
        >
          heard: <strong>{heard}</strong>
        </div>
      </div>

      {ended ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 40,
            background: "rgba(5, 7, 12, 0.55)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            pointerEvents: "auto",
          }}
        >
          <h1
            style={{
              fontFamily: "'Caveat', cursive",
              fontSize: 64,
              fontWeight: 700,
              marginBottom: 16,
            }}
          >
            {endReason === "timer" ? "GAME OVER" : "FLOW COMPLETE"}
          </h1>
          <div
            style={{
              display: "flex",
              gap: 20,
              margin: "24px 0",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            {[
              { v: hits, l: "words hit" },
              { v: coins, l: "coins earned" },
              { v: xp, l: "xp earned" },
              { v: bestStreak, l: "best streak" },
              { v: `${wordsAttempted > 0 ? Math.round((hits / wordsAttempted) * 100) : 0}%`, l: "accuracy" },
            ].map((st) => (
              <div
                key={st.l}
                style={{
                  padding: "18px 28px",
                  borderRadius: 18,
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  minWidth: 120,
                }}
              >
                <div
                  style={{
                    fontFamily: "'Fredoka', sans-serif",
                    fontSize: 36,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {st.v}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.65,
                    marginTop: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {st.l}
                </div>
              </div>
            ))}
          </div>
          {flaggedWords.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 15, opacity: 0.7 }}>tap to hear</p>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  justifyContent: "center",
                  maxWidth: 600,
                }}
              >
                {flaggedWords.map((word) => (
                  <button
                    key={word}
                    type="button"
                    style={{
                      padding: "8px 16px",
                      borderRadius: 999,
                      background: "rgba(239, 68, 68, 0.18)",
                      border: "1px solid rgba(239, 68, 68, 0.45)",
                      cursor: "pointer",
                      fontFamily: "'Fredoka', sans-serif",
                      fontSize: 15,
                      color: "white",
                    }}
                    onClick={() => {
                      const u = new SpeechSynthesisUtterance(word);
                      u.rate = 0.8;
                      speechSynthesis.speak(u);
                    }}
                  >
                    🔊 {word}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              justifyContent: "center",
              marginTop: 28,
            }}
          >
            <button
              type="button"
              onClick={() => restartPronunciation("normal")}
              aria-label="Play again"
              style={{
                border: "none",
                borderRadius: 8,
                padding: "12px 24px",
                background: "linear-gradient(135deg, #fbbf24, #f97316)",
                color: "#111827",
                cursor: "pointer",
                fontFamily: "'Fredoka', sans-serif",
                fontSize: 18,
                fontWeight: 900,
                boxShadow: "0 12px 30px rgba(249,115,22,0.28)",
              }}
            >
              Play again
            </button>
            <button
              type="button"
              onClick={() => restartPronunciation("hard")}
              aria-label="Harder replay"
              style={{
                border: "none",
                borderRadius: 8,
                padding: "12px 24px",
                background: "linear-gradient(135deg, #ef4444, #7c3aed)",
                color: "white",
                cursor: "pointer",
                fontFamily: "'Fredoka', sans-serif",
                fontSize: 18,
                fontWeight: 900,
                boxShadow: "0 12px 30px rgba(124,58,237,0.28)",
              }}
            >
              Harder replay
            </button>
            {onExit ? (
              <button
                type="button"
                onClick={onExit}
                aria-label="Back to map"
                style={{
                  border: "1px solid rgba(255,255,255,0.24)",
                  borderRadius: 8,
                  padding: "12px 24px",
                  background: "rgba(255,255,255,0.08)",
                  color: "white",
                  cursor: "pointer",
                  fontFamily: "'Fredoka', sans-serif",
                  fontSize: 18,
                  fontWeight: 900,
                }}
              >
                Back to map
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
