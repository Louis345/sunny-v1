import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useKaraokeReading } from "../hooks/useKaraokeReading";
import {
  playGameSfx,
  playPronunciationHitSfx,
  pronunciationHitSfxEffectForStreak,
} from "../utils/gameSfx";
import type { PronunciationNodeConfig } from "../../../src/shared/adventureTypes";
import type { PostActivityAction } from "../../../src/engine/choiceEvents";
import { buildPronunciationTranscriptWindow } from "../../../src/shared/pronunciationTranscriptHygiene";
import {
  PronunciationLatencyAttemptTracker,
  resolvePronunciationFlowTier,
  type PronunciationFlowTier,
  type PronunciationLatencySpan,
} from "../../../src/shared/pronunciationLatencySpans";
import {
  PronunciationTempoCalibrationState,
  resolveTierSpeedIntent,
} from "../../../src/shared/pronunciationTempoCalibration";
import type { PronunciationFlowHook } from "../../../src/shared/adventureTypes";
import { createActivityEvidenceClient } from "../utils/activityEvidence";

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
const MAX_PRONUNCIATION_TIMER_DRAIN_MULTIPLIER = 2.2;
const DEFAULT_PRONUNCIATION_RHYTHM_CONFIG: Required<
  Pick<
    PronunciationNodeConfig,
    "durationMs" | "baseBeatMs" | "minBeatMs" | "rampEveryMs" | "rampStepMs"
  >
> = {
  durationMs: 45_000,
  baseBeatMs: 950,
  minBeatMs: 520,
  rampEveryMs: 8_000,
  rampStepMs: 60,
};
type PronunciationSfxMode = NonNullable<PronunciationNodeConfig["sfxMode"]>;
type PronunciationRhythmConfig = typeof DEFAULT_PRONUNCIATION_RHYTHM_CONFIG;

function positiveMs(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function normalizePronunciationRhythmConfig(
  config: PronunciationNodeConfig | undefined,
): PronunciationRhythmConfig {
  const durationMs = positiveMs(
    config?.durationMs,
    DEFAULT_PRONUNCIATION_RHYTHM_CONFIG.durationMs,
  );
  const baseBeatMs = positiveMs(
    config?.baseBeatMs,
    DEFAULT_PRONUNCIATION_RHYTHM_CONFIG.baseBeatMs,
  );
  const minBeatMs = Math.min(
    baseBeatMs,
    positiveMs(config?.minBeatMs, DEFAULT_PRONUNCIATION_RHYTHM_CONFIG.minBeatMs),
  );
  const rampEveryMs = positiveMs(
    config?.rampEveryMs,
    DEFAULT_PRONUNCIATION_RHYTHM_CONFIG.rampEveryMs,
  );
  const rampStepMs =
    typeof config?.rampStepMs === "number" && Number.isFinite(config.rampStepMs)
      ? Math.max(0, config.rampStepMs)
      : DEFAULT_PRONUNCIATION_RHYTHM_CONFIG.rampStepMs;
  return { durationMs, baseBeatMs, minBeatMs, rampEveryMs, rampStepMs };
}

function tempoLevelForElapsed(elapsedMs: number, rampEveryMs: number): number {
  return Math.max(0, Math.floor(Math.max(0, elapsedMs) / rampEveryMs));
}

function rawBeatMsForTempo(
  elapsedMs: number,
  config: PronunciationRhythmConfig,
): number {
  const level = tempoLevelForElapsed(elapsedMs, config.rampEveryMs);
  return Math.max(config.minBeatMs, config.baseBeatMs - level * config.rampStepMs);
}

function rhythmBeatMsForTempo(
  elapsedMs: number,
  config: PronunciationRhythmConfig,
  reliefSteps: number,
): number {
  const rawBeat = rawBeatMsForTempo(elapsedMs, config);
  return Math.min(
    config.baseBeatMs,
    rawBeat + Math.max(0, reliefSteps) * config.rampStepMs,
  );
}

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

type PronunciationRunEndReason = "timer" | "completed_targets" | "meter_expired";

function pronunciationFlowTimerDrainMultiplier(flowRound: number): number {
  return 1 + Math.min(0.3, Math.max(0, flowRound) * 0.1);
}

function cappedPronunciationTimerDrainMultiplier(
  hitStreak: number,
  flowRound: number,
): number {
  return Math.min(
    MAX_PRONUNCIATION_TIMER_DRAIN_MULTIPLIER,
    pronunciationTimerDrainMultiplier(hitStreak) *
      pronunciationFlowTimerDrainMultiplier(flowRound),
  );
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
  rhythmMode?: boolean;
  rhythmRound?: number;
  meterRemainingMs?: number;
  beatMs?: number;
  tempoLevel?: number;
  finalBeatMs?: number;
  sfxMode?: PronunciationSfxMode;
  accuracy: number;
  totalWords: number;
  correctCount: number;
  evidenceTier?: "practice" | "clean_recall" | "mastery_candidate" | "calibration_required";
  targetResults: Array<{
    target: string;
    correct: boolean;
    attempts: number;
    contaminatedAttempts?: number;
    contaminationReasons?: string[];
    heardExamples?: string[];
    orthographicAmbiguity?: boolean;
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
    meterExpired?: boolean;
    tempoIncreased?: boolean;
    rhythmRound?: number;
    tempoLevel?: number;
    beatMs?: number;
    finalBeatMs?: number;
  };
  replayOnly?: boolean;
  chartEligible?: boolean;
};

export interface PronunciationGameCanvasProps {
  words: string[];
  replayWords?: string[];
  pronunciationConfig?: PronunciationNodeConfig;
  /** Profile-driven flow wrapper (presentation only). */
  flowHooks?: PronunciationFlowHook[];
  interimTranscript: string;
  sendMessage: (type: string, payload?: Record<string, unknown>) => void;
  backgroundImageUrl?: string;
  accentColor?: string;
  onComplete?: (result: PronunciationCompleteResult) => void;
  onPostActivityAction?: (
    action: PostActivityAction,
    result: PronunciationCompleteResult,
  ) => void;
  onExit?: () => void;
  /** Extra top padding (px) to clear a fixed banner above the component. */
  topInset?: number;
}

function pronunciationFlowHookBanner(flowHooks: PronunciationFlowHook[] | undefined): string | null {
  if (!flowHooks?.length) return null;
  if (flowHooks.includes("competition")) return "COMPETITION MODE";
  if (flowHooks.includes("speed")) return "SPEED RUN";
  if (flowHooks.includes("challenge")) return "CHALLENGE MODE";
  return null;
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

function buildPronunciationFlowWords(pool: string[], cycles: number): string[] {
  if (pool.length === 0) return [];
  const flowWords: string[] = [];
  for (let i = 0; i < cycles; i += 1) {
    flowWords.push(...pool);
  }
  return flowWords;
}

function pronunciationRhythmCycles(
  poolCount: number,
  config: Required<Pick<PronunciationNodeConfig, "durationMs" | "minBeatMs">>,
): number {
  if (poolCount <= 0) return 1;
  const fastestExpectedTargets = Math.ceil(config.durationMs / Math.max(120, config.minBeatMs * 0.35));
  return Math.max(2, Math.ceil(fastestExpectedTargets / poolCount) + 2);
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
  flowHooks: flowHooksProp,
  interimTranscript,
  sendMessage,
  backgroundImageUrl: _backgroundImageUrl, // eslint-disable-line @typescript-eslint/no-unused-vars
  accentColor: _accentColor, // eslint-disable-line @typescript-eslint/no-unused-vars
  onComplete,
  onPostActivityAction,
  onExit,
  topInset = 0,
}: PronunciationGameCanvasProps): React.ReactElement {
  const rawWordsKey = pronunciationWordsKey(rawWords);
  const replayWordsKey = pronunciationWordsKey(rawReplayWords ?? []);
  const pronunciationConfigKey = JSON.stringify(pronunciationConfig ?? null);
  const isRhythmMode = pronunciationConfig?.mode === "rhythm";
  const rhythmConfig = useMemo(
    () => normalizePronunciationRhythmConfig(pronunciationConfig),
    [pronunciationConfigKey],
  );
  const sfxMode: PronunciationSfxMode = pronunciationConfig?.sfxMode ?? "scored";
  const pronunciationSfxEnabled = sfxMode === "scored";
  const initialTimeRemainingMs = isRhythmMode ? rhythmConfig.durationMs : TIMER_START_MS;
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
  const rhythmMatcherCycles = isRhythmMode
    ? pronunciationRhythmCycles(activeWordPool.length, rhythmConfig)
    : 1;
  const words = useMemo(
    () => buildPronunciationFlowWords(activeWordPool, rhythmMatcherCycles),
    [activeWordPool, rhythmMatcherCycles],
  );
  const flowWordsKey = pronunciationWordsKey(words);
  const pronunciationRunKey = `${challengeMode}:${replaySeed}:${flowWordsKey}`;
  const flowHooks = flowHooksProp ?? pronunciationConfig?.flowHooks;
  const flowHookBanner = pronunciationFlowHookBanner(flowHooks);
  const videoRef = useRef<HTMLVideoElement>(null);
  const particlesRef = useRef<HTMLCanvasElement>(null);
  const particlesDataRef = useRef<Particle[]>([]);
  const rafParticlesRef = useRef(0);
  const blockWrapRef = useRef<HTMLDivElement>(null);
  const presentedEvidenceRef = useRef("");

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
  const lastLoggedDrainMultiplierRef = useRef("");
  const interimRef = useRef(interimTranscript);
  const heardClearTimeoutRef = useRef<number | null>(null);
  const comboBannerTimeoutRef = useRef<number | null>(null);
  const lastMilestoneStreakRef = useRef(0);
  const wordIndexRef = useRef(0);
  const rhythmRoundRef = useRef(1);
  const prevRhythmRoundRef = useRef(1);
  const hitsRef = useRef(0);
  const wordsAttemptedRef = useRef(0);
  const xpRef = useRef(0);
  const bestStreakRef = useRef(0);
  const hitStreakRef = useRef(0);
  const coinsRef = useRef(0);
  const timeRemainingRef = useRef(initialTimeRemainingMs);
  const lastCoinAwardRef = useRef(0);
  const lastTimeAwardRef = useRef(0);
  const maxHeatStreakRef = useRef(0);
  const runStartedAtRef = useRef(performance.now());
  const lastTimerTickAtRef = useRef(performance.now());
  const flaggedWordsRef = useRef<string[]>([]);
  const missCountByWordRef = useRef<Map<string, number>>(new Map());
  const hitCountByWordRef = useRef<Map<string, number>>(new Map());
  const contaminatedCountByWordRef = useRef<Map<string, number>>(new Map());
  const contaminationReasonsByWordRef = useRef<Map<string, Set<string>>>(new Map());
  const contaminationExamplesByWordRef = useRef<Map<string, string[]>>(new Map());
  const orthographicAmbiguityByWordRef = useRef<Set<string>>(new Set());
  const replayRequestsRef = useRef(0);
  const bonusWordIndexRef = useRef<number | null>(null);
  const ignoreReplayTranscriptRef = useRef("");
  const staleHitWordIndexAfterResetRef = useRef<number | null>(null);
  const stateUpdateFingerprintRef = useRef("");
  const lastContaminationFingerprintRef = useRef("");
  const blockedNoTargetsFingerprintRef = useRef("");
  const supportClearTimeoutRef = useRef<number | null>(null);
  const lastTranscriptAtRef = useRef(performance.now());
  const latencyTrackerRef = useRef(new PronunciationLatencyAttemptTracker());
  const tempoCalibrationRef = useRef(new PronunciationTempoCalibrationState());
  const tempoReliefStepsRef = useRef(0);
  const tempoReliefWordsRemainingRef = useRef(0);
  const lastRhythmBeatMsRef = useRef(rhythmConfig.baseBeatMs);
  const lastRhythmTempoLevelRef = useRef(0);

  const emitLatencySpan = useCallback(
    (span: PronunciationLatencySpan) => {
      console.log(
        ` 🎮 [pronunciation] [latency] target=${span.target} outcome=${span.outcome} scoreLoopMs=${span.scoreLoopMs} marginMs=${span.marginMs} staleTailMs=${span.staleTailMs} tier=${span.flowTier}`,
      );
      sendMessage("game_event", {
        event: {
          type: "pronunciation_latency_span",
          payload: span,
          version: "1.0",
        },
      });
    },
    [sendMessage],
  );

  const recordLatencySpan = useCallback(
    (span: PronunciationLatencySpan) => {
      tempoCalibrationRef.current.recordSpan({
        outcome: span.outcome,
        scoreLoopMs: span.scoreLoopMs,
        marginMs: span.marginMs,
        staleTailMs: span.staleTailMs,
        flowTier: span.flowTier,
      });
      const deesc = tempoCalibrationRef.current.shouldDeescalate();
      if (deesc.drop) {
        tempoReliefStepsRef.current = Math.min(
          2,
          tempoReliefStepsRef.current + deesc.reliefSteps,
        );
        tempoReliefWordsRemainingRef.current = 2;
        console.log(
          ` 🎮 [pronunciation] [tempo-cal] deescalate reason=${deesc.reason} reliefSteps=${tempoReliefStepsRef.current}`,
        );
        sendMessage("game_event", {
          event: {
            type: "pronunciation_flow_tempo_adjusted",
            payload: {
              game: "pronunciation",
              reason: deesc.reason,
              reliefSteps: tempoReliefStepsRef.current,
              rollingP95ScoreLoopMs: tempoCalibrationRef.current.rollingP95ScoreLoopMs,
              rollingP95MarginMs: tempoCalibrationRef.current.rollingP95MarginMs,
            },
            version: "1.0",
          },
        });
      }
      emitLatencySpan(span);
      setTempoCalRevision((value) => value + 1);
    },
    [emitLatencySpan, sendMessage],
  );

  const [tempoCalRevision, setTempoCalRevision] = useState(0);
  const [cameraOk, setCameraOk] = useState(false);
  const [hasStarted, setHasStarted] = useState(true);
  const [cycleKey, setCycleKey] = useState(0);
  const [blockPhase, setBlockPhase] = useState<BlockPhase>("approaching");
  const [missSeq, setMissSeq] = useState(0);
  const [showWrongBadge, setShowWrongBadge] = useState(false);
  const [showHitBadge, setShowHitBadge] = useState(false);
  const [showRecoveryBadge, setShowRecoveryBadge] = useState(false);
  const [ended, setEnded] = useState(false);
  const [endReason, setEndReason] = useState<PronunciationRunEndReason>("timer");
  const [finalResult, setFinalResult] = useState<PronunciationCompleteResult | null>(null);
  const [flowRound, setFlowRound] = useState(0);
  const [hits, setHits] = useState(0);
  const [wordsAttempted, setWordsAttempted] = useState(0);
  const [xp, setXp] = useState(0);
  const [coins, setCoins] = useState(0);
  const [timeRemainingMs, setTimeRemainingMs] = useState(initialTimeRemainingMs);
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
  const evidence = useMemo(
    () =>
      createActivityEvidenceClient({
        context: {
          activityId: "pronunciation",
          childId: "unknown",
          activityMode: "pronunciation",
          ...(pronunciationConfig
            ? { activityConfig: pronunciationConfig as unknown as Record<string, unknown> }
            : {}),
        },
        sendMessage,
      }),
    [pronunciationConfigKey, sendMessage],
  );
  const emitPronunciationSfxCue = useCallback(
    (
      id: string,
      played: boolean,
      source: "scored_event" | "visual_only_suppressed",
    ) => {
      sendMessage("game_event", {
        event: {
          type: "pronunciation_sfx_cue",
          payload: {
            game: "pronunciation",
            id,
            played,
            source,
            rhythmMode: isRhythmMode,
            sfxMode,
          },
          version: "1.0",
        },
      });
    },
    [isRhythmMode, sendMessage, sfxMode],
  );
  const playPronunciationScoredSfx = useCallback(
    (id: string, play: () => boolean) => {
      if (!pronunciationSfxEnabled) {
        emitPronunciationSfxCue(id, false, "visual_only_suppressed");
        return false;
      }
      const played = play();
      emitPronunciationSfxCue(id, played, "scored_event");
      return played;
    },
    [emitPronunciationSfxCue, pronunciationSfxEnabled],
  );

  const childSpeechTranscript = isSyntheticSessionTranscript(interimTranscript)
    ? ""
    : interimTranscript;
  const latestChildSpeechTranscript = latestPronunciationScoringWindow(childSpeechTranscript);
  const currentScoringTarget =
    words[Math.min(wordIndexRef.current, Math.max(0, words.length - 1))] ?? "";
  const pronunciationTranscriptWindow = buildPronunciationTranscriptWindow({
    target: currentScoringTarget,
    rawTranscript: latestChildSpeechTranscript,
    acceptedPrefix: words.slice(0, wordIndexRef.current),
  });
  const interimFingerprint = transcriptFingerprint(latestChildSpeechTranscript);
  const scoringInterimTranscript =
    ignoreReplayTranscriptRef.current &&
    interimFingerprint === ignoreReplayTranscriptRef.current
      ? ""
      : pronunciationTranscriptWindow.scoringText;

  useEffect(() => {
    if (rawWordsKeyRef.current === rawWordsKey) return;
    rawWordsKeyRef.current = rawWordsKey;
    authoritativeCompleteSentRef.current = false;
    replayRunRef.current = 0;
    autoFlowRoundsRef.current = 0;
    flowRoundRef.current = 0;
    setFlowRound(0);
    tempoCalibrationRef.current = new PronunciationTempoCalibrationState();
    tempoReliefStepsRef.current = 0;
    tempoReliefWordsRemainingRef.current = 0;
    setTempoCalRevision(0);
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
  const rhythmRound =
    isRhythmMode && activeWordPool.length > 0
      ? Math.floor(wordIndex / activeWordPool.length) + 1
      : 1;

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
      if (blockPhase === "approaching" && !ended && !isComplete && expected) {
        latencyTrackerRef.current.noteInterim(
          latestChildSpeechTranscript || trimmed,
          expected,
          performance.now(),
        );
      }
      return;
    }
    if (heardClearTimeoutRef.current !== null) {
      window.clearTimeout(heardClearTimeoutRef.current);
    }
    heardClearTimeoutRef.current = window.setTimeout(() => {
      heardClearTimeoutRef.current = null;
      setHeardTranscript("");
    }, HEARD_STICKY_MS);
  }, [
    blockPhase,
    ended,
    isComplete,
    latestChildSpeechTranscript,
    scoringInterimTranscript,
    words,
  ]);

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
    rhythmRoundRef.current = rhythmRound;
    if (rhythmRound !== prevRhythmRoundRef.current) {
      prevRhythmRoundRef.current = rhythmRound;
      prevWordIndexRef.current = -1;
      hitProcessedForWordIndexRef.current = -1;
    }
  }, [rhythmRound, wordIndex]);
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
  const hasVisibleExpectedWord = expectedWord.trim().length > 0;
  const heard =
    heardTranscript ||
    scoringInterimTranscript.trim().split(/\s+/).filter(Boolean).pop() ||
    "waiting";
  const supportActive = supportCue !== null;
  const supportPaused = supportCue?.mode === "pause";
  const displayHeat = hitStreak >= HEAT_THRESHOLD;
  const flowTier = resolvePronunciationFlowTier({
    hitStreak,
    flowRound,
  });
  const tempoCal = tempoCalibrationRef.current;
  const canHeatTempo = tempoCal.canEscalateFlowTier("heat");
  const canFlowTempo = tempoCal.canEscalateFlowTier("flow");
  const canComboTempo = tempoCal.canEscalateFlowTier("combo");
  const activeHeat = displayHeat && canHeatTempo;
  const warmHeat = displayHeat && !canHeatTempo;
  const gatedStreakForTempo = displayHeat
    ? hitStreak
    : Math.min(hitStreak, HEAT_THRESHOLD - 1);
  // Flow round from earned adaptive replay always affects tempo; heat/combo stay margin-gated.
  const gatedFlowRoundForTempo = flowRound;
  const tierSpeedIntent = resolveTierSpeedIntent({
    hitStreak: gatedStreakForTempo,
    flowRound: gatedFlowRoundForTempo,
    challengeHard: challengeMode === "hard",
    supportSlow: supportActive && !supportPaused,
    comboBreaker: canComboTempo && hitStreak >= COMBO_BREAKER_STREAK,
  });
  const marginTier: PronunciationFlowTier =
    !canComboTempo && flowTier === "combo"
      ? "heat"
      : !canFlowTempo && flowTier === "flow"
        ? canHeatTempo
          ? "heat"
          : "normal"
        : !canHeatTempo && (flowTier === "heat" || warmHeat)
          ? "normal"
          : flowTier;
  const tempoReliefSteps =
    tempoReliefWordsRemainingRef.current > 0 ? tempoReliefStepsRef.current : 0;
  const calibratedTempo = tempoCal.resolveTempoForTier({
    baseTravelMs: TRAVEL_MS,
    baseZoneMs: ZONE_MS,
    tier: marginTier,
    tierSpeedIntent,
    tempoReliefSteps,
  });
  const rhythmElapsedMs = isRhythmMode
    ? Math.max(0, rhythmConfig.durationMs - timeRemainingMs)
    : 0;
  const rhythmTempoLevel = isRhythmMode
    ? tempoLevelForElapsed(rhythmElapsedMs, rhythmConfig.rampEveryMs)
    : 0;
  const rhythmRawBeatMs = isRhythmMode
    ? rawBeatMsForTempo(rhythmElapsedMs, rhythmConfig)
    : rhythmConfig.baseBeatMs;
  const rhythmBeatMs = isRhythmMode
    ? rhythmBeatMsForTempo(rhythmElapsedMs, rhythmConfig, tempoReliefSteps)
    : rhythmConfig.baseBeatMs;
  lastRhythmBeatMsRef.current = rhythmBeatMs;
  lastRhythmTempoLevelRef.current = rhythmTempoLevel;
  const speedMultiplier = isRhythmMode
    ? Number(Math.max(0.1, rhythmConfig.baseBeatMs / Math.max(1, rhythmBeatMs)).toFixed(2))
    : calibratedTempo.effectiveMultiplier;
  const travelMs = isRhythmMode
    ? Math.max(220, Math.round(rhythmBeatMs * 0.68))
    : calibratedTempo.travelMs;
  const totalMs = isRhythmMode ? rhythmBeatMs : calibratedTempo.totalMs;
  const drainStreak = activeHeat ? hitStreak : gatedStreakForTempo;
  const drainIntent = cappedPronunciationTimerDrainMultiplier(
    drainStreak,
    gatedFlowRoundForTempo,
  );
  const tempoDrainRatio =
    calibratedTempo.intentMultiplier > 0
      ? calibratedTempo.effectiveMultiplier / calibratedTempo.intentMultiplier
      : 1;
  const timerDrainMultiplier = isRhythmMode
    ? 1
    : Math.min(
        MAX_PRONUNCIATION_TIMER_DRAIN_MULTIPLIER,
        drainIntent * tempoDrainRatio,
      );
  const heatBeatMs = Math.round(900 / speedMultiplier);
  const heatedUp = activeHeat || warmHeat;
  void tempoCalRevision;
  const timerMaxMs = isRhythmMode ? rhythmConfig.durationMs : TIMER_MAX_MS;
  const timerFillPct = Math.max(0, Math.min(100, (timeRemainingMs / timerMaxMs) * 100));
  const rhythmMeterRatio = isRhythmMode
    ? Math.max(0, Math.min(1, timeRemainingMs / rhythmConfig.durationMs))
    : 0;
  const rhythmBeatPhase = isRhythmMode
    ? (rhythmElapsedMs % rhythmBeatMs) / Math.max(1, rhythmBeatMs)
    : 0;
  const rhythmPulseScale = 1 + (1 - rhythmBeatPhase) * 0.2;
  const lowTime = timeRemainingMs <= 10_000;
  const noPronunciationTargets = activeWordPool.length === 0;

  useEffect(() => {
    const firstTarget = activeWordPool[0] ?? "";
    evidence.activityStarted({
      target: firstTarget || undefined,
      targets: activeWordPool,
      activityMode: "pronunciation",
      activityConfig: pronunciationConfig ?? null,
      visibleState: {
        wordVisible: Boolean(firstTarget),
        cameraEnabled: cameraOk,
      },
    });
  }, [activeWordPool, cameraOk, evidence, pronunciationConfigKey]);

  useEffect(() => {
    if (!hasVisibleExpectedWord) return;
    const key = `${pronunciationRunKey}:${wordIndex}:${expectedWord}`;
    if (presentedEvidenceRef.current === key) return;
    presentedEvidenceRef.current = key;
    evidence.targetPresented({
      target: expectedWord,
      itemIndex: wordIndex,
      activityMode: "pronunciation",
      visibleState: {
        wordVisible: true,
        blockPhase,
        flowTier,
        heatMode: displayHeat,
        supportActive,
      },
    });
  }, [
    blockPhase,
    displayHeat,
    evidence,
    expectedWord,
    flowTier,
    hasVisibleExpectedWord,
    pronunciationRunKey,
    supportActive,
    wordIndex,
  ]);

  const emitPronunciationGameState = useCallback(
    (phase: string, extra: Record<string, unknown> = {}) => {
      const idx = wordIndexRef.current;
      const rawWordIndex =
        typeof extra.wordIndex === "number" ? extra.wordIndex : idx;
      const visibleWordIndex = Math.max(
        0,
        Math.min(
          rawWordIndex,
          activeWordPool.length > 0 ? activeWordPool.length - 1 : 0,
        ),
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
        timerMaxMs,
        coins: coinsRef.current,
        heatMode: activeHeat,
        warmHeat,
        flowRound: flowRoundRef.current,
        tempoMultiplier: speedMultiplier,
        tempoCalReason: isRhythmMode ? "rhythm_meter" : calibratedTempo.reason,
        timerDrainMultiplier,
        lastTimeAwardMs: lastTimeAwardRef.current,
        lastCoinAward: lastCoinAwardRef.current,
        replayOnly: replayRunRef.current > 0,
        ...(isRhythmMode
          ? {
              rhythmMode: true,
              rhythmRound: rhythmRoundRef.current,
              meterRemainingMs: timeRemainingRef.current,
              beatMs: lastRhythmBeatMsRef.current,
              rawBeatMs: rhythmRawBeatMs,
              tempoLevel: lastRhythmTempoLevelRef.current,
              tempoReliefSteps,
              sfxMode,
            }
          : {}),
        ...extra,
      };
      const fingerprint = JSON.stringify(payload);
      if (fingerprint === stateUpdateFingerprintRef.current) return;
      stateUpdateFingerprintRef.current = fingerprint;
      sendMessage("game_state_update", payload);
    },
    [
      activeHeat,
      activeWordPool,
      calibratedTempo.reason,
      isRhythmMode,
      rhythmRawBeatMs,
      sendMessage,
      speedMultiplier,
      sttStatus,
      sfxMode,
      tempoReliefSteps,
      timerDrainMultiplier,
      timerMaxMs,
      warmHeat,
      words,
    ],
  );

  useEffect(() => {
    if (!noPronunciationTargets) return;
    const fingerprint = rawWordsKey || "empty";
    if (fingerprint === blockedNoTargetsFingerprintRef.current) return;
    blockedNoTargetsFingerprintRef.current = fingerprint;
    console.warn(
      ` 🎮 [pronunciation] [blocked_no_targets] rawWords=${rawWords.length}`,
    );
    sendMessage("game_state_update", {
      game: "pronunciation",
      phase: "blocked_no_targets",
      currentWord: null,
      expectedWords: [],
      wordIndex: 0,
      totalWords: 0,
      reason: "no_valid_pronunciation_targets",
    });
    sendMessage("game_event", {
      event: {
        type: "pronunciation_blocked_no_targets",
        payload: {
          game: "pronunciation",
          rawWordCount: rawWords.length,
          reason: "no_valid_pronunciation_targets",
        },
        version: "1.0",
      },
    });
  }, [noPronunciationTargets, rawWords.length, rawWordsKey, sendMessage]);

  useEffect(() => {
    if (ended || isComplete || !pronunciationTranscriptWindow.rawTranscript.trim()) return;
    const target = words[wordIndexRef.current] ?? currentScoringTarget;
    const targetKey = normalizePracticeWord(target);
    if (!target || !targetKey) return;

    if (!pronunciationTranscriptWindow.contaminated) {
      if (pronunciationTranscriptWindow.orthographicAmbiguity) {
        orthographicAmbiguityByWordRef.current.add(targetKey);
      }
      return;
    }

    const recoverableTailMatch = Boolean(
      pronunciationTranscriptWindow.scoringText.trim() &&
      pronunciationTranscriptWindow.reasons.includes("transcript_tail"),
    );
    if (recoverableTailMatch) {
      if (pronunciationTranscriptWindow.orthographicAmbiguity) {
        orthographicAmbiguityByWordRef.current.add(targetKey);
      }
      return;
    }

    const fingerprint = [
      targetKey,
      pronunciationTranscriptWindow.rawTranscript,
      pronunciationTranscriptWindow.reasons.join("|"),
    ].join("\u0001");
    if (fingerprint === lastContaminationFingerprintRef.current) return;
    lastContaminationFingerprintRef.current = fingerprint;

    contaminatedCountByWordRef.current.set(
      targetKey,
      (contaminatedCountByWordRef.current.get(targetKey) ?? 0) + 1,
    );
    const reasonSet =
      contaminationReasonsByWordRef.current.get(targetKey) ?? new Set<string>();
    for (const reason of pronunciationTranscriptWindow.reasons) {
      reasonSet.add(reason);
    }
    contaminationReasonsByWordRef.current.set(targetKey, reasonSet);
    const examples = contaminationExamplesByWordRef.current.get(targetKey) ?? [];
    if (examples.length < 3) {
      examples.push(pronunciationTranscriptWindow.heardTail || pronunciationTranscriptWindow.rawTranscript.slice(0, 80));
      contaminationExamplesByWordRef.current.set(targetKey, examples);
    }

    console.log(
      ` 🎮 [pronunciation] [contaminated_retry] word=${target} reasons=${pronunciationTranscriptWindow.reasons.join(",")}`,
    );
    sendMessage("game_event", {
      event: {
        type: "pronunciation_contaminated_transcript",
        payload: {
          game: "pronunciation",
          word: target,
          wordIndex: wordIndexRef.current,
          heardTail: pronunciationTranscriptWindow.heardTail,
          contaminationReasons: pronunciationTranscriptWindow.reasons,
        },
        version: "1.0",
      },
    });
    evidence.attemptRecorded({
      target,
      itemIndex: wordIndexRef.current,
      activityMode: "pronunciation",
      visibleState: {
        wordVisible: true,
        blockPhase,
        contaminationStatus: "contaminated",
      },
      childAction: {
        rawTranscript: pronunciationTranscriptWindow.rawTranscript,
        heardTail: pronunciationTranscriptWindow.heardTail,
      },
      result: {
        status: "contaminated",
        correct: false,
        matchReason: "pronunciation_contaminated_transcript",
        contaminationReasons: pronunciationTranscriptWindow.reasons,
      },
    });
    emitPronunciationGameState("contaminated_retry", {
      currentWord: target,
      wordIndex: wordIndexRef.current,
      lastOutcome: "contaminated_retry",
      lastOutcomeWord: target,
      lastHeard: pronunciationTranscriptWindow.heardTail || pronunciationTranscriptWindow.rawTranscript,
      contaminationStatus: "contaminated",
      contaminationReasons: pronunciationTranscriptWindow.reasons,
      heatMode: false,
      lastCoinAward: 0,
      lastTimeAwardMs: 0,
    });
  }, [
    currentScoringTarget,
    emitPronunciationGameState,
    ended,
    evidence,
    isComplete,
    blockPhase,
    pronunciationTranscriptWindow,
    sendMessage,
    words,
  ]);

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
    const signature = `${speedMultiplier}|${timerDrainMultiplier}|${calibratedTempo.reason}`;
    if (lastLoggedDrainMultiplierRef.current === signature) return;
    lastLoggedDrainMultiplierRef.current = signature;
    console.log(
      ` 🎮 [pronunciation] [tempo-cal] p95ScoreLoop=${tempoCal.rollingP95ScoreLoopMs} window=${totalMs} intent=${calibratedTempo.intentMultiplier.toFixed(2)} effective=${speedMultiplier.toFixed(2)} drain=${timerDrainMultiplier.toFixed(2)} reason=${calibratedTempo.reason} warm=${warmHeat}`,
    );
  }, [
    calibratedTempo.intentMultiplier,
    calibratedTempo.reason,
    speedMultiplier,
    tempoCal,
    timerDrainMultiplier,
    totalMs,
    warmHeat,
  ]);

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
    latencyTrackerRef.current = new PronunciationLatencyAttemptTracker();
    runSerialRef.current += 1;
    staleHitWordIndexAfterResetRef.current = wordIndex > 0 ? wordIndex : null;
    prevWordIndexRef.current = -1;
    hitProcessedForWordIndexRef.current = -1;
    cycleStartRef.current = performance.now();
    runStartedAtRef.current = performance.now();
    lastTimerTickAtRef.current = performance.now();
    rhythmRoundRef.current = 1;
    prevRhythmRoundRef.current = 1;
    const startingTimeMs = isRhythmMode ? rhythmConfig.durationMs : TIMER_START_MS;
    timeRemainingRef.current = startingTimeMs;
    coinsRef.current = 0;
    lastCoinAwardRef.current = 0;
    lastTimeAwardRef.current = 0;
    maxHeatStreakRef.current = 0;
    hitStreakRef.current = 0;
    hitsRef.current = 0;
    wordsAttemptedRef.current = 0;
    xpRef.current = 0;
    bestStreakRef.current = 0;
    flaggedWordsRef.current = [];
    missCountByWordRef.current = new Map();
    hitCountByWordRef.current = new Map();
    contaminatedCountByWordRef.current = new Map();
    contaminationReasonsByWordRef.current = new Map();
    contaminationExamplesByWordRef.current = new Map();
    orthographicAmbiguityByWordRef.current = new Set();
    lastContaminationFingerprintRef.current = "";
    flowRoundRef.current = replayRunRef.current;
    timeoutArmedRef.current = true;
    queueMicrotask(() => {
      setCycleKey((k) => k + 1);
      setBlockPhase("approaching");
      setHits(0);
      setWordsAttempted(0);
      setXp(0);
      setCoins(0);
      setTimeRemainingMs(startingTimeMs);
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
      setShowRecoveryBadge(false);
      setFlowRound(replayRunRef.current);
      completeSentRef.current = false;
      lastMilestoneStreakRef.current = 0;
      setEnded(false);
      setFinalResult(null);
    });
  }, [pronunciationRunKey, hasStarted, isRhythmMode, rhythmConfig.durationMs]);

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
      completeSentRef.current = false;
      setEnded(false);
      tempoCalibrationRef.current = new PronunciationTempoCalibrationState();
      tempoReliefStepsRef.current = 0;
      tempoReliefWordsRemainingRef.current = 0;
      setTempoCalRevision((value) => value + 1);
      playPronunciationScoredSfx("replayStart", () =>
        playGameSfx("pronunciation", "replayStart"),
      );
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
        wordIndex: 0,
        currentWord: nextWords[0] ?? "",
      });
      setReplaySeed((seed) => seed + 1);
    },
    [baseWords, emitPronunciationGameState, hardReplayWords, playPronunciationScoredSfx, sendMessage],
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
        const drain = isRhythmMode
          ? 1
          : cappedPronunciationTimerDrainMultiplier(
              hitStreakRef.current,
              flowRoundRef.current,
            );
        const next = Math.max(0, remaining - elapsed * drain);
        timeRemainingRef.current = next;
        if (next <= 0) {
          const reason = isRhythmMode ? "meter_expired" : "timer";
          console.log(` 🎮 [pronunciation] [timer] ${reason}`);
          endReasonRef.current = reason;
          setEndReason(reason);
          setEnded(true);
        }
        return next;
      });
    }, TIMER_TICK_MS);
    return () => window.clearInterval(tickId);
  }, [hasStarted, ended, isRhythmMode, supportPaused]);

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
      const contaminatedAttempts = contaminatedCountByWordRef.current.get(key) ?? 0;
      const contaminationReasons = [
        ...(contaminationReasonsByWordRef.current.get(key) ?? new Set<string>()),
      ];
      const heardExamples = contaminationExamplesByWordRef.current.get(key) ?? [];
      const orthographicAmbiguity = orthographicAmbiguityByWordRef.current.has(key);
      const chartAttempts = isRhythmMode
        ? missesForWord + hitsForWord
        : missesForWord + (hitsForWord > 0 ? 1 : 0);
      const contaminationSignals = Array.from(
        new Set(
          contaminationReasons.map((reason) =>
            reason === "background_speech"
              ? "background_speech_contamination"
              : reason === "transcript_tail" || reason === "target_not_tail"
                ? "transcript_tail_contamination"
                : `${reason}_contamination`,
          ),
        ),
      );
      return {
        target: word,
        correct: hitsForWord > 0,
        attempts: chartAttempts,
        contaminatedAttempts,
        contaminationReasons,
        heardExamples,
        orthographicAmbiguity,
        scaffoldLevel: missesForWord > 0 ? 1 : 0,
        mode: "pronunciation",
        evidenceTier: "practice",
        masteryEligible: false,
        struggleSignals: [
          ...(missesForWord > 0
            ? [hitsForWord > 0 ? "missed_then_recovered" : "missed"]
            : []),
          ...(orthographicAmbiguity ? ["orthographic_ambiguity"] : []),
          ...contaminationSignals,
        ],
      };
    });
    const correctCount = targetResults.filter((row) => row.correct).length;
    const uniqueTargetsAttempted = targetResults.filter((row) => row.attempts > 0).length;
    const chartAttempts = targetResults.reduce((sum, row) => sum + row.attempts, 0);
    const retryCount = targetResults.reduce((sum, row) => sum + Math.max(0, row.attempts - 1), 0);
    const rounds = isRhythmMode
      ? rhythmRoundRef.current
      : Math.max(
          1,
          activeWordPool.length > 0 ? Math.ceil(rawResolvedAttempts / activeWordPool.length) : 0,
        );
    const missToHitRecoveries = targetResults.filter((row) =>
      row.correct && row.struggleSignals.includes("missed_then_recovered"),
    ).length;
    const finalRhythmElapsedMs = isRhythmMode
      ? rhythmConfig.durationMs - Math.max(0, timeRemainingRef.current)
      : 0;
    const finalTempoLevel = isRhythmMode
      ? tempoLevelForElapsed(finalRhythmElapsedMs, rhythmConfig.rampEveryMs)
      : undefined;
    const finalBeatMs = isRhythmMode
      ? rawBeatMsForTempo(finalRhythmElapsedMs, rhythmConfig)
      : undefined;
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
      ...(isRhythmMode
        ? {
            meterExpired: reason === "meter_expired",
            tempoIncreased: (finalTempoLevel ?? 0) > 0,
            rhythmRound: rhythmRoundRef.current,
            tempoLevel: finalTempoLevel,
            beatMs: finalBeatMs,
            finalBeatMs,
          }
        : {}),
    };
    const rhythmCompleteFields = isRhythmMode
      ? {
          rhythmMode: true,
          rhythmRound: rhythmRoundRef.current,
          meterRemainingMs: Math.max(0, Math.round(timeRemainingRef.current)),
          beatMs: finalBeatMs,
          tempoLevel: finalTempoLevel,
          finalBeatMs,
          sfxMode,
        }
      : {};
    const totalEvidenceTargets = Math.max(baseWordPool.length, activeWordPool.length);
    const accuracyRatio = totalEvidenceTargets > 0 ? correctCount / totalEvidenceTargets : 0;
    const acc = Math.round(accuracyRatio * 100);
    const replayOnly = authoritativeCompleteSentRef.current || replayRunRef.current > 0;
    const effectiveBestStreak = Math.max(bs, hitStreakRef.current, correctCount);
    const shouldStartAdaptiveFlow =
      reason === "completed_targets" &&
      accuracyRatio >= 0.8 &&
      effectiveBestStreak >= HEAT_THRESHOLD &&
      uniqueTargetsAttempted >= Math.min(activeWordPool.length, HEAT_THRESHOLD) &&
      autoFlowRoundsRef.current < MAX_ADAPTIVE_FLOW_ROUNDS &&
      tempoCalibrationRef.current.canStartAdaptiveFlow();
    const completeResult: PronunciationCompleteResult = {
      wordsHit: correctCount,
      wordsAttempted: chartAttempts,
      hitEvents: h,
      uniqueTargetsAttempted,
      rounds,
      accuracy: acc,
      totalWords: totalEvidenceTargets,
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
      replayOnly,
      chartEligible: !replayOnly,
      ...rhythmCompleteFields,
    };
    playPronunciationScoredSfx("completeFanfare", () =>
      playGameSfx("pronunciation", "completeFanfare"),
    );
    evidence.activityCompleted({
      activityMode: "pronunciation",
      targetResults,
      accuracy: accuracyRatio,
      wordsAttempted: chartAttempts,
      correctCount,
      totalWords: totalEvidenceTargets,
      result: {
        status: "completed",
        correct: accuracyRatio >= 1,
        matchReason: reason,
      },
      flowState,
      timeSpent_ms: survived,
    });
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
      ...rhythmCompleteFields,
    });
    if (!replayOnly) {
      authoritativeCompleteSentRef.current = true;
      onComplete?.({
        ...completeResult,
        replayOnly: false,
        chartEligible: true,
        ...rhythmCompleteFields,
      });
    }
    setFinalResult(completeResult);
    return { shouldStartAdaptiveFlow };
  }, [
    activeWordPool,
    baseWordPool.length,
    emitPronunciationGameState,
    evidence,
    isRhythmMode,
    onComplete,
    playPronunciationScoredSfx,
    rhythmConfig,
    sfxMode,
  ]);

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

  const handlePostActivityAction = useCallback(
    (action: PostActivityAction) => {
      if (finalResult) {
        onPostActivityAction?.(action, finalResult);
      }
      if (action === "replay_same") {
        restartPronunciation("normal");
        return;
      }
      if (action === "replay_harder") {
        restartPronunciation("hard");
        return;
      }
      onExit?.();
    },
    [finalResult, onExit, onPostActivityAction, restartPronunciation],
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
      playPronunciationScoredSfx("missThunk", () =>
        playGameSfx("pronunciation", "missThunk"),
      );
    }
    if (isRhythmMode) {
      tempoReliefStepsRef.current = Math.max(1, tempoReliefStepsRef.current);
      tempoReliefWordsRemainingRef.current = 2;
      setTempoCalRevision((value) => value + 1);
    }
    const latencySpan = latencyTrackerRef.current.finishAttempt({
      target: w,
      wordIndex: wordIndexRef.current,
      attempt: newCount,
      outcome: "miss",
      flowTier: resolvePronunciationFlowTier({
        hitStreak: 0,
        flowRound: flowRoundRef.current,
      }),
      flowRound: flowRoundRef.current,
      heatMode: false,
      tempoMultiplier: speedMultiplier,
      windowMs: totalMs,
      lastHeard: heardTranscript || interimRef.current.trim(),
    });
    recordLatencySpan(latencySpan);
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
    const missEvidence = {
      target: w,
      itemIndex: wordIndexRef.current,
      attemptNumber: newCount,
      activityMode: "pronunciation",
      latencyMs: latencySpan.scoreLoopMs,
      visibleState: {
        wordVisible: true,
        blockPhase,
        flowTier: latencySpan.flowTier,
        heatMode: false,
      },
      childAction: {
        rawTranscript: heardTranscript || interimRef.current.trim(),
      },
      result: {
        status: "missed",
        correct: false,
        matchReason: "pronunciation_miss",
      },
    };
    evidence.attemptRecorded(missEvidence);
    evidence.targetCompleted(missEvidence);
    const missRhythmElapsedMs = isRhythmMode
      ? rhythmConfig.durationMs - Math.max(0, timeRemainingRef.current)
      : 0;
    const missTempoLevel = isRhythmMode
      ? tempoLevelForElapsed(missRhythmElapsedMs, rhythmConfig.rampEveryMs)
      : 0;
    const missBeatMs = isRhythmMode
      ? rhythmBeatMsForTempo(
          missRhythmElapsedMs,
          rhythmConfig,
          tempoReliefWordsRemainingRef.current > 0 ? tempoReliefStepsRef.current : 0,
        )
      : undefined;
    emitPronunciationGameState("miss", {
      currentWord: w,
      wordIndex: wordIndexRef.current,
      lastOutcome: "miss",
      lastOutcomeWord: w,
      missCount: newCount,
      heatMode: false,
      flowRound: flowRoundRef.current,
      tempoMultiplier: speedMultiplier,
      timerDrainMultiplier,
      lastCoinAward: 0,
      lastTimeAwardMs: 0,
      ...(isRhythmMode
        ? {
            rhythmMode: true,
            tempoLevel: missTempoLevel,
            beatMs: missBeatMs,
            tempoReliefSteps: tempoReliefStepsRef.current,
          }
        : {}),
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
      const staleInterimFingerprint = transcriptFingerprint(interimRef.current);
      if (staleInterimFingerprint) {
        ignoreReplayTranscriptRef.current = staleInterimFingerprint;
      }
      setHeardTranscript("");
      lastContaminationFingerprintRef.current = "";
      setCycleKey((k) => k + 1);
      setBlockPhase("approaching");
      setShowWrongBadge(false);
      cycleStartRef.current = performance.now();
      timeoutArmedRef.current = true;
    }, YANK_OUT_MS + YANK_BACK_MS);
  }, [
    blockPhase,
    evidence,
    recordLatencySpan,
    emitPronunciationGameState,
    ended,
    isComplete,
    heardTranscript,
    isRhythmMode,
    playPronunciationScoredSfx,
    rhythmConfig,
    sendMessage,
    speedMultiplier,
    timerDrainMultiplier,
    timerMaxMs,
    totalMs,
    words,
  ]);

  useEffect(() => {
    if (blockPhase !== "approaching" || ended || isComplete) return;
    if (wordIndex >= words.length) return;
    if (tempoReliefWordsRemainingRef.current > 0) {
      tempoReliefWordsRemainingRef.current -= 1;
      if (tempoReliefWordsRemainingRef.current === 0) {
        tempoReliefStepsRef.current = Math.max(0, tempoReliefStepsRef.current - 1);
        setTempoCalRevision((value) => value + 1);
      }
    }
    latencyTrackerRef.current.beginWordAttempt(performance.now());
  }, [blockPhase, cycleKey, ended, isComplete, wordIndex, words.length]);

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

    const nextWordIndex = wordIndex;
    if (nextWordIndex < words.length) {
      const staleInterimFingerprint = transcriptFingerprint(interimRef.current);
      if (staleInterimFingerprint) {
        ignoreReplayTranscriptRef.current = staleInterimFingerprint;
      }
      setHeardTranscript("");
      lastContaminationFingerprintRef.current = "";
    }

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
    const hitKey = normalizePracticeWord(hitWord);
    const recoveredAfterMiss = (missCountByWordRef.current.get(hitKey) ?? 0) > 0;
    const latencySpan = latencyTrackerRef.current.finishAttempt({
      target: hitWord,
      wordIndex: hitWordIndex,
      attempt: (missCountByWordRef.current.get(hitKey) ?? 0) + 1,
      outcome: "hit",
      flowTier: resolvePronunciationFlowTier({
        hitStreak: hitStreakRef.current + 1,
        flowRound: flowRoundRef.current,
      }),
      flowRound: flowRoundRef.current,
      heatMode: hitStreakRef.current + 1 >= HEAT_THRESHOLD,
      tempoMultiplier: speedMultiplier,
      windowMs: totalMs,
      lastHeard: interimRef.current.trim() || heardTranscript,
    });
    recordLatencySpan(latencySpan);
    const nextWord = words[advancedTo] ?? hitWord;
    const hitRunSerial = runSerialRef.current;
    hitCountByWordRef.current.set(
      hitKey,
      (hitCountByWordRef.current.get(hitKey) ?? 0) + 1,
    );
    hitsRef.current += 1;
    wordsAttemptedRef.current += 1;
    const hitEvidence = {
      target: hitWord,
      itemIndex: hitWordIndex,
      attemptNumber: (missCountByWordRef.current.get(hitKey) ?? 0) + 1,
      activityMode: "pronunciation",
      latencyMs: latencySpan.scoreLoopMs,
      visibleState: {
        wordVisible: true,
        blockPhase,
        flowTier: latencySpan.flowTier,
        heatMode: hitStreakRef.current + 1 >= HEAT_THRESHOLD,
      },
      childAction: {
        rawTranscript: interimRef.current.trim() || heardTranscript,
      },
      result: {
        status: "correct",
        correct: true,
        matchReason: "pronunciation_hit",
        orthographicAmbiguity: orthographicAmbiguityByWordRef.current.has(hitKey),
      },
    };
    evidence.attemptRecorded(hitEvidence);
    evidence.targetCompleted(hitEvidence);
    if (recoveredAfterMiss) {
      sendMessage("game_event", {
        event: {
          type: "pronunciation_recovery",
          payload: {
            game: "pronunciation",
            word: hitWord,
            wordIndex: hitWordIndex,
            rhythmMode: isRhythmMode,
          },
          version: "1.0",
        },
      });
    }
    emitPronunciationGameState("hit", {
      currentWord: nextWord,
      wordIndex: advancedTo,
      lastOutcome: recoveredAfterMiss ? "recovered_hit" : "hit",
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
      setShowRecoveryBadge(recoveredAfterMiss);
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
          const timeAward = isRhythmMode
            ? 0
            : Math.round(
                (nextHeat ? HEAT_TIME_AWARD_MS : NORMAL_TIME_AWARD_MS) * rewardMultiplier,
              );
          const nextCoins = coinsRef.current + coinAward;
          const nextTime = Math.min(timerMaxMs, timeRemainingRef.current + timeAward);
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
            lastOutcome: recoveredAfterMiss ? "recovered_hit" : "hit",
            lastOutcomeWord: hitWord,
            coins: nextCoins,
            timeRemainingMs: nextTime,
            heatMode: nextHeat,
            flowRound: flowRoundRef.current,
            tempoMultiplier: speedMultiplier,
            timerDrainMultiplier,
            lastCoinAward: coinAward,
            lastTimeAwardMs: timeAward,
          });
          if (nhs > lastMilestoneStreakRef.current) {
            const effect = pronunciationHitSfxEffectForStreak(nhs);
            playPronunciationScoredSfx(effect, () => playPronunciationHitSfx(nhs));
            lastMilestoneStreakRef.current = nhs;
          }
          if (recoveredAfterMiss) {
            playPronunciationScoredSfx("recovery", () =>
              playGameSfx("pronunciation", "combo"),
            );
          }
          if (nextHeat) {
            setHeatBanner("heating");
          }
          if (nhs === COMBO_BREAKER_STREAK && tempoCalibrationRef.current.canEscalateFlowTier("combo")) {
            triggerComboBreaker(nhs, advancedTo);
          }
          if (!isRhythmMode && advancedTo >= words.length) {
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
      setShowRecoveryBadge(false);
      if (!isRhythmMode && advancedTo >= words.length) return;
      setCycleKey((k) => k + 1);
      setBlockPhase("approaching");
      cycleStartRef.current = performance.now();
      timeoutArmedRef.current = true;
    }, HIT_MS);
    // Diagnostic log reads words/blockPhase; effect timing unchanged from pre-log version.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- PG diagnostics only
  }, [
    wordIndex,
    words,
    ended,
    burst,
    evidence,
    isRhythmMode,
    playPronunciationScoredSfx,
    recordLatencySpan,
    emitPronunciationGameState,
    finishRound,
    heardTranscript,
    sendMessage,
    speedMultiplier,
    timerDrainMultiplier,
    totalMs,
    triggerComboBreaker,
  ]);

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
    !ended && activeWordPool.length > 0 && (isRhythmMode || wordIndex < words.length);

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
    @keyframes pg-rhythm-miss-wobble {
      0%, 100% { transform: translateX(-50%) translateY(-50%) scale(1.18); }
      20% { transform: translate(calc(-50% + 10px), -50%) scale(1.16); }
      40% { transform: translate(calc(-50% - 8px), -50%) scale(1.15); }
      70% { transform: translate(calc(-50% + 4px), -50%) scale(1.12); filter: brightness(1.2); }
    }
    @keyframes pg-rhythm-ring {
      0% { transform: translate(-50%, -50%) scale(0.78); opacity: 0.95; }
      80% { opacity: 0.16; }
      100% { transform: translate(-50%, -50%) scale(1.34); opacity: 0; }
    }
    @keyframes pg-miss-stamp {
      0%   { transform: translate(-50%, -50%) rotate(4deg) scale(0); }
      50%  { transform: translate(-50%, -50%) rotate(4deg) scale(1.3); opacity: 1; }
      100% { transform: translate(-50%, -50%) rotate(4deg) scale(1); opacity: 0.85; }
    }
    @keyframes pg-recovery-pop {
      0% { transform: translate(-50%, -40%) scale(0.7); opacity: 0; }
      45% { transform: translate(-50%, -80%) scale(1.1); opacity: 1; }
      100% { transform: translate(-50%, -132%) scale(0.9); opacity: 0; }
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
        : isRhythmMode
          ? `pg-rhythm-miss-wobble ${YANK_OUT_MS + YANK_BACK_MS}ms ease-out forwards`
          : `pg-miss-shatter ${YANK_OUT_MS + YANK_BACK_MS}ms cubic-bezier(0.33, 1, 0.68, 1) forwards`;
  const isBonusWord = bonusWordIndex === wordIndex && blockPhase === "approaching";
  const visibleProgressWordNumber =
    activeWordPool.length === 0
      ? 0
      : isRhythmMode
        ? (wordIndex % activeWordPool.length) + 1
        : Math.min(wordIndex + 1, activeWordPool.length);

  if (noPronunciationTargets) {
    return (
      <div
        data-testid="pronunciation-blocked-no-targets"
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, #0e172a 0%, #05070c 75%)",
          display: "grid",
          placeItems: "center",
          fontFamily: "'Lexend', system-ui, sans-serif",
          color: "white",
          padding: 24,
          textAlign: "center",
        }}
      >
        <style>{css}</style>
        <div
          style={{
            maxWidth: 520,
            display: "grid",
            gap: 10,
            borderRadius: 18,
            padding: "22px 26px",
            background: "rgba(15, 23, 42, 0.9)",
            border: "1px solid rgba(125, 211, 252, 0.45)",
            boxShadow: "0 18px 60px rgba(14, 165, 233, 0.22)",
          }}
        >
          <strong
            style={{
              fontFamily: "'Fredoka', sans-serif",
              fontSize: 30,
              fontWeight: 900,
            }}
          >
            Pronunciation needs real words.
          </strong>
          <span style={{ color: "#bae6fd", fontSize: 16, fontWeight: 700 }}>
            This activity was blocked before showing a fake target.
          </span>
        </div>
      </div>
    );
  }

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
        {isRhythmMode ? `Round ${rhythmRound}` : "Word"} {visibleProgressWordNumber} / {activeWordPool.length}
      </div>
      {isRhythmMode ? (
        <div
          data-testid="pronunciation-rhythm-meter"
          aria-label="rhythm meter"
          style={{
            position: "fixed",
            top: Math.max(66, topInset + 58),
            left: 84,
            zIndex: 40,
            width: 260,
            maxWidth: "calc(100vw - 168px)",
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(5, 7, 12, 0.76)",
            border: "1px solid rgba(255, 255, 255, 0.14)",
            boxShadow: "0 12px 34px rgba(14, 165, 233, 0.18)",
            pointerEvents: "none",
            display: "grid",
            gap: 7,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              fontFamily: "'Fredoka', sans-serif",
              fontSize: 13,
              fontWeight: 900,
              color: "#e0f2fe",
            }}
          >
            <span>{Math.ceil(timeRemainingMs / 1000)}s</span>
            <span>{rhythmBeatMs}ms</span>
            <span>L{rhythmTempoLevel}</span>
          </div>
          <div
            style={{
              height: 7,
              borderRadius: 999,
              overflow: "hidden",
              background: "rgba(255,255,255,0.13)",
            }}
          >
            <div
              style={{
                width: `${rhythmMeterRatio * 100}%`,
                height: "100%",
                borderRadius: 999,
                background: "linear-gradient(90deg, #22c55e, #facc15 54%, #f97316)",
                transition: "width 100ms linear",
              }}
            />
          </div>
        </div>
      ) : null}
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

      {hasVisibleExpectedWord ? (
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
        {isRhythmMode && blockPhase === "approaching" ? (
          <div
            data-testid="pronunciation-rhythm-beat-ring"
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 340,
              height: 188,
              borderRadius: 30,
              border: "3px solid rgba(34, 211, 238, 0.72)",
              boxShadow: "0 0 34px rgba(34,211,238,0.32)",
              transform: `translate(-50%, -50%) scale(${rhythmPulseScale})`,
              animation: `pg-rhythm-ring ${rhythmBeatMs}ms linear infinite`,
              zIndex: 1,
              pointerEvents: "none",
            }}
          />
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
          <span style={{ position: "relative", zIndex: 1 }}>{expectedWord}</span>
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

        {showRecoveryBadge ? (
          <div
            data-testid="pronunciation-recovery-badge"
            style={{
              position: "absolute",
              left: "50%",
              top: "18%",
              fontFamily: "'Fredoka', sans-serif",
              fontWeight: 900,
              fontSize: 25,
              color: "#bbf7d0",
              textShadow: "0 0 14px rgba(34,197,94,0.9)",
              animation: "pg-recovery-pop 900ms ease-out both",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              zIndex: 22,
            }}
          >
            RECOVERED!
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
            {isRhythmMode ? "KEEP GOING!" : "MISS!"}
          </div>
        ) : null}
        </div>
      ) : null}

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
            {warmHeat ? "WARMING UP — FINDING YOUR RHYTHM" : "THEY'RE HEATING UP 🔥"}
          </div>
        </div>
      ) : null}

      {flowHookBanner && heatBanner === "heating" ? (
        <div
          data-testid="pronunciation-flow-hook-banner"
          style={{
            position: "fixed",
            top: 56 + topInset,
            left: 0,
            right: 0,
            zIndex: 39,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
            fontFamily: "'Lexend', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: "rgba(251, 191, 36, 0.95)",
          }}
        >
          {flowHookBanner}
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
          data-testid="pronunciation-end-overlay"
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
            {endReason === "meter_expired"
              ? "RHYTHM COMPLETE"
              : endReason === "timer"
                ? "GAME OVER"
                : "FLOW COMPLETE"}
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
              {
                v: `${wordsAttempted > 0 ? Math.round((hits / wordsAttempted) * 100) : 0}%`,
                l: "accuracy",
              },
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
              onClick={() => handlePostActivityAction("replay_same")}
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
              onClick={() => handlePostActivityAction("replay_harder")}
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
                onClick={() => handlePostActivityAction("back_to_map")}
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
