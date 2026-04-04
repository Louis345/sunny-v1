import type {
  AttemptInput,
  SM2Track,
  Domain,
  DifficultySignal,
  ChildQuality,
  WordEntry,
} from "../algorithms/types";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { MasteryMap } from "../context/schemas/masteryMap";
import type { TodaysPlanActivity } from "../agents/psychologist/today-plan";
import type { RewardTrigger, SessionRewardState } from "./rewardEngine";
import type { PlannedActivity, OrderedSession } from "./sessionPlanner";

import { computeSM2, computeQualityFromAttempt } from "../algorithms/spacedRepetition";
import { assessDifficulty } from "../algorithms/desirableDifficulty";
import { evaluateRewards } from "./rewardEngine";
import { planOrderedSession } from "./sessionPlanner";
import { readWordBank, writeWordBank, ensureWordInBank, createFreshSM2Track } from "../utils/wordBankIO";
import { readLearningProfile, initializeLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import { writeSessionNote, updateLearningProfileFromSession } from "./psychologistBridge";
import type { SessionData } from "./psychologistBridge";
import { readPersistedTodaysPlan } from "../agents/psychologist/today-plan";
import type { ChildName } from "../utils/childContextPaths";

export interface SessionPlan {
  childId: string;
  mode: string;
  activities: PlannedActivity[];
  newWords: string[];
  reviewWords: string[];
  totalWordCount: number;
  estimatedMinutes: number;
  bondContext: string;
  difficultyParams: LearningProfile["algorithmParams"]["difficulty"];
  moodAdjustment: boolean;
  /** Wilson step from learning profile at plan time (injected per turn via canvas context). */
  wilsonStep: number;
}

export interface AttemptResult {
  quality: ChildQuality;
  updatedTrack: SM2Track;
  difficultySignal: DifficultySignal;
  rewards: RewardTrigger[];
}

export interface SessionSummary {
  childId: string;
  date: string;
  totalAttempts: number;
  accuracy: number;
  wordsReviewed: string[];
  wordsNew: string[];
  wordsRegressed: string[];
  correctStreak: number;
  wilsonStep: number;
  duration: number;
}

// Per-session state (not persisted — lives only for the session lifetime)
const sessionStates = new Map<string, {
  rewardState: SessionRewardState;
  attempts: AttemptInput[];
  difficultySignals: DifficultySignal[];
  rewardsFired: RewardTrigger[];
  wordsRegressed: string[];
  startTime: number;
  mode: string;
  wilsonStep: number;
}>();

function childIdFromName(childName: ChildName): string {
  return childName === "Ila" ? "ila" : "reina";
}

export function planSession(childId: string, mode: string): SessionPlan {
  let profile = readLearningProfile(childId);
  if (!profile) {
    profile = initializeLearningProfile({
      childId,
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    writeLearningProfile(childId, profile);
  }

  const wordBank = readWordBank(childId);

  const childName: ChildName = childId === "ila" ? "Ila" : "Reina";
  const todaysPlanResult = readPersistedTodaysPlan(childName);
  const todaysPlan: TodaysPlanActivity[] = todaysPlanResult?.todaysPlan ?? [];

  const currentWilsonStep = profile.sessionStats.currentWilsonStep || 1;

  const ordered: OrderedSession = planOrderedSession({
    childId,
    mode,
    todaysPlan,
    wordBank: wordBank.words,
    profile,
    moodSignal: profile.moodAdjustment ? "fatigued" : undefined,
    currentWilsonStep,
  });

  sessionStates.set(childId, {
    rewardState: {
      correctStreak: 0,
      wordsThisSession: [],
      bonusRoundFired: false,
      streakRecord: profile.sessionStats.streakRecord,
      totalCorrect: 0,
      totalAttempts: 0,
    },
    attempts: [],
    difficultySignals: [],
    rewardsFired: [],
    wordsRegressed: [],
    startTime: Date.now(),
    mode,
    wilsonStep: currentWilsonStep,
  });

  const { getBondContextInjection } = require("./bondProtocol");
  const bondContext: string = getBondContextInjection(profile.bondPatterns);

  return {
    childId,
    mode,
    activities: ordered.activities,
    newWords: ordered.newWords,
    reviewWords: ordered.reviewWords,
    totalWordCount: ordered.totalWordCount,
    estimatedMinutes: ordered.estimatedMinutes,
    bondContext,
    difficultyParams: profile.algorithmParams.difficulty,
    moodAdjustment: profile.moodAdjustment,
    wilsonStep: currentWilsonStep,
  };
}

export function recordAttempt(childId: string, attempt: AttemptInput): AttemptResult {
  const profile = readLearningProfile(childId);
  const sm2Params = profile?.algorithmParams.sm2 ?? {
    defaultEasinessFactor: 2.5,
    minEasinessFactor: 1.3,
    intervalModifier: 1.0,
    maxNewWordsPerSession: 5,
    maxReviewWordsPerSession: 12,
  };

  ensureWordInBank(childId, attempt.word, attempt.domain, "session");

  const bank = readWordBank(childId);
  const entry = bank.words.find((w) => w.word === attempt.word);
  const previousTrack = entry?.tracks[attempt.domain];
  const currentTrack = previousTrack ?? createFreshSM2Track(new Date().toISOString().slice(0, 10));

  const quality = computeQualityFromAttempt(attempt);
  const updatedTrack = computeSM2(currentTrack, quality, sm2Params);

  if (entry) {
    entry.tracks[attempt.domain] = updatedTrack;
    writeWordBank(childId, bank);
  }

  const state = sessionStates.get(childId);
  if (state) {
    state.attempts.push(attempt);
    state.rewardState.wordsThisSession.push(attempt.word);
    state.rewardState.totalAttempts++;

    if (attempt.correct) {
      state.rewardState.correctStreak++;
      state.rewardState.totalCorrect++;
    } else {
      state.rewardState.correctStreak = 0;
    }

    if (previousTrack?.mastered && !updatedTrack.mastered) {
      state.wordsRegressed.push(attempt.word);
    }
  }

  const allAttempts = state?.attempts ?? [attempt];
  const difficultySignal = assessDifficulty({
    recentAttempts: allAttempts.map((a) => ({
      correct: a.correct,
      timestamp: new Date().toISOString(),
    })),
    params: profile?.algorithmParams.difficulty ?? {
      targetAccuracy: 0.70,
      easyThreshold: 0.85,
      hardThreshold: 0.50,
      breakThreshold: 0.40,
      windowSize: 8,
    },
  });

  if (state) {
    state.difficultySignals.push(difficultySignal);
  }

  const rewards = state
    ? evaluateRewards(attempt.word, updatedTrack, previousTrack, state.rewardState, profile!)
    : [];

  if (state) {
    state.rewardsFired.push(...rewards);
  }

  return { quality, updatedTrack, difficultySignal, rewards };
}

export function finalizeSession(
  childId: string,
  bondData?: { exchangeCount: number; topics: string[]; quality: "strong" | "moderate" | "weak" },
): SessionSummary {
  const state = sessionStates.get(childId);
  const now = new Date().toISOString();
  const duration = state ? Math.round((Date.now() - state.startTime) / 60_000) : 0;

  const totalAttempts = state?.rewardState.totalAttempts ?? 0;
  const totalCorrect = state?.rewardState.totalCorrect ?? 0;
  const accuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;

  const wordsReviewed = [...new Set(state?.attempts.map((a) => a.word) ?? [])];
  const wordsNew = state?.rewardState.wordsThisSession.filter(
    (w, i, arr) => arr.indexOf(w) === i
  ) ?? [];

  const sessionData: SessionData = {
    childId,
    date: now,
    attempts: state?.attempts ?? [],
    difficultySignals: state?.difficultySignals ?? [],
    bondExchangeCount: bondData?.exchangeCount ?? 0,
    bondTopics: bondData?.topics ?? [],
    bondQuality: bondData?.quality ?? "moderate",
    sessionDuration: duration,
    moodStart: "neutral",
    moodEnd: totalAttempts > 0 && accuracy < 0.4 ? "fatigued" : "neutral",
    mode: state?.mode ?? "spelling",
    wilsonStep: state?.wilsonStep ?? 1,
    wordsRegressed: state?.wordsRegressed ?? [],
    rewardsFired: state?.rewardsFired ?? [],
    correctStreak: state?.rewardState.correctStreak ?? 0,
    totalCorrect,
    totalAttempts,
  };

  writeSessionNote(childId, sessionData);
  updateLearningProfileFromSession(childId, sessionData);

  sessionStates.delete(childId);

  return {
    childId,
    date: now,
    totalAttempts,
    accuracy,
    wordsReviewed,
    wordsNew,
    wordsRegressed: state?.wordsRegressed ?? [],
    correctStreak: state?.rewardState.correctStreak ?? 0,
    wilsonStep: state?.wilsonStep ?? 1,
    duration,
  };
}

export function getSessionDifficultySignal(childId: string): DifficultySignal | null {
  const state = sessionStates.get(childId);
  if (!state || state.difficultySignals.length === 0) return null;
  return state.difficultySignals[state.difficultySignals.length - 1];
}

export function getSessionRewardState(childId: string): SessionRewardState | null {
  const state = sessionStates.get(childId);
  return state?.rewardState ?? null;
}

export { childIdFromName };
