import type {
  AttemptInput,
  AttemptSnapshot,
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
import fs from "fs";
import type { PlannedActivity, OrderedSession } from "./sessionPlanner";

import { computeSM2, computeQualityFromAttempt } from "../algorithms/spacedRepetition";
import { assessDifficulty } from "../algorithms/desirableDifficulty";
import { evaluateRewards } from "./rewardEngine";
import { planOrderedSession } from "./sessionPlanner";
import {
  readWordBank,
  writeWordBank,
  ensureWordInBank,
  createFreshSM2Track,
  resolveWordBankPath,
} from "../utils/wordBankIO";
import { readNextSessionWordsFromCurriculumFile } from "../utils/curriculumNextSessionWords";
import { readLearningProfile, initializeLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import { writeSessionNote, updateLearningProfileFromSession } from "./psychologistBridge";
import type { SessionData } from "./psychologistBridge";
import { readPersistedTodaysPlan } from "../agents/psychologist/today-plan";
import type { ChildName } from "../utils/childContextPaths";
import { getBondContextInjection } from "./bondProtocol";

export interface PlanSessionOptions {
  /** OCR / extracted homework list — used only when curriculum + bank yield no session words. */
  homeworkFallbackWords?: string[];
}

export interface SessionPlan {
  childId: string;
  mode: string;
  activities: PlannedActivity[];
  newWords: string[];
  reviewWords: string[];
  /** Spelling: new words first, then SM-2 due reviews (max 5). Reading: story/karaoke pool (due + new). */
  focusWords: string[];
  totalWordCount: number;
  estimatedMinutes: number;
  bondContext: string;
  difficultyParams: LearningProfile["algorithmParams"]["difficulty"];
  moodAdjustment: boolean;
  /** Wilson step from learning profile at plan time (injected per turn via canvas context). */
  wilsonStep: number;
  /** Spelling only: when no reviews and no new words were scheduled. */
  sessionRecommendation?: "reading" | "math" | "clocks" | "free";
}

type HomeworkNodeLike = {
  id: string;
  type: string;
  words?: string[];
  difficulty?: number;
  gameFile?: string | null;
  storyFile?: string | null;
  date?: string;
};

function formatDueForLog(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${Number(parts[1])}/${Number(parts[2])}`;
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
  if (childName === "Ila") return "ila";
  if (childName === "Reina") return "reina";
  return "creator";
}

export function planSession(
  childId: string,
  mode: string,
  options?: PlanSessionOptions,
): SessionPlan {
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
  const homeworkFallback = options?.homeworkFallbackWords ?? [];
  const currentWilsonStep = profile.sessionStats.currentWilsonStep || 1;

  if (mode === "homework" && profile.pendingHomework?.nodes?.length) {
    const pending = profile.pendingHomework;
    const baseNodes = reorderHomeworkNodesForSession(pending.nodes as HomeworkNodeLike[]);
    const dueWords = getDueHomeworkWords(
      wordBank.words,
      pending.wordList,
      new Date().toISOString().slice(0, 10),
    );
    const strugglingWords = dueWords.filter(
      (w) => estimateWordConfidence(wordBank.words, w) < 0.4,
    );
    const nodesAfterStruggling = promotePronunciationNode(baseNodes, strugglingWords);
    const maxNodes = Math.max(2, Math.floor(profile.demographics.age > 0 ? (profile.demographics.attentionSpan === "short" ? 2 : 4) : 3) + 2);
    const cappedNodes = nodesAfterStruggling.slice(0, Math.min(maxNodes, nodesAfterStruggling.length));
    const difficulty = getHomeworkDifficulty(profile);
    const companion = profile.companion?.toggledOff ? "off" : "elli";

    const activities: PlannedActivity[] = cappedNodes.map((node, idx) => ({
      type: "game",
      words: dueWords,
      domain: "spelling",
      priority: idx + 1,
      timeboxMinutes: 5,
      source: `homework:${node.type}`,
    }));

    return {
      childId,
      mode,
      activities,
      newWords: [],
      reviewWords: dueWords,
      focusWords: dueWords,
      totalWordCount: dueWords.length,
      estimatedMinutes: activities.reduce((sum, a) => sum + a.timeboxMinutes, 0),
      bondContext: getBondContextInjection(profile.bondPatterns),
      difficultyParams: profile.algorithmParams.difficulty,
      moodAdjustment: profile.moodAdjustment,
      wilsonStep: currentWilsonStep,
      sessionRecommendation: undefined,
    };
  }

  if (
    mode === "spelling" &&
    homeworkFallback.length > 0 &&
    !fs.existsSync(resolveWordBankPath(childId))
  ) {
    console.log("  [engine] no word bank — using fallback");
  }

  const childName: ChildName =
    childId === "ila" ? "Ila" : childId === "reina" ? "Reina" : "creator";
  const todaysPlanResult = readPersistedTodaysPlan(childName);
  const todaysPlan: TodaysPlanActivity[] = todaysPlanResult?.todaysPlan ?? [];

  const curriculumWords =
    mode === "spelling" ? readNextSessionWordsFromCurriculumFile(childId) : [];

  const ordered: OrderedSession = planOrderedSession({
    childId,
    mode,
    todaysPlan,
    wordBank: wordBank.words,
    profile,
    moodSignal: profile.moodAdjustment ? "fatigued" : undefined,
    currentWilsonStep,
    externalNewWordCandidates: curriculumWords,
    homeworkFallbackWords: homeworkFallback,
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

  const bondContext: string = getBondContextInjection(profile.bondPatterns);

  let focusWords: string[];
  if (mode === "reading") {
    focusWords = Array.from(
      new Set([
        ...ordered.reviewWords.slice(0, 3),
        ...ordered.newWords.slice(0, 2),
      ]),
    );
  } else if (mode === "spelling") {
    focusWords = [...ordered.newWords, ...ordered.reviewWords].slice(0, 5);
  } else {
    focusWords = [];
  }

  let sessionRecommendation: SessionPlan["sessionRecommendation"];
  if (
    mode === "spelling" &&
    ordered.newWords.length === 0 &&
    ordered.reviewWords.length === 0
  ) {
    sessionRecommendation = "reading";
    console.log("  [engine] no words due — free session");
  }

  if (mode === "spelling") {
    console.log(
      `  [engine] session plan — ${ordered.newWords.length} new, ${ordered.reviewWords.length} review, total: ${focusWords.length}`,
    );
    if (ordered.newWords.length > 0) {
      console.log(`  [engine] new words: ${ordered.newWords.join(", ")}`);
    }
    if (ordered.reviewWords.length > 0) {
      const parts = ordered.reviewWords.map((w) => {
        const entry = wordBank.words.find(
          (x) => x.word.toLowerCase() === w.toLowerCase(),
        );
        const due =
          entry?.tracks.spelling?.nextReviewDate ?? todayIso();
        return `${w} (due ${formatDueForLog(due)})`;
      });
      console.log(`  [engine] review words: ${parts.join(", ")}`);
    }
  }

  return {
    childId,
    mode,
    activities: ordered.activities,
    newWords: ordered.newWords,
    reviewWords: ordered.reviewWords,
    focusWords,
    totalWordCount: ordered.totalWordCount,
    estimatedMinutes: ordered.estimatedMinutes,
    bondContext,
    difficultyParams: profile.algorithmParams.difficulty,
    moodAdjustment: profile.moodAdjustment,
    wilsonStep: currentWilsonStep,
    sessionRecommendation,
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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
  const snap: AttemptSnapshot = {
    date: new Date().toISOString().slice(0, 10),
    quality,
    scaffoldLevel: attempt.scaffoldLevel,
    correct: attempt.correct,
  };
  updatedTrack.history = [...updatedTrack.history, snap];

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

function getHomeworkDifficulty(profile: LearningProfile): 1 | 2 | 3 {
  const target = profile.algorithmParams.difficulty.targetAccuracy ?? 0.7;
  if (target >= 0.8) return 3;
  if (target >= 0.65) return 2;
  return 1;
}

function getDueHomeworkWords(
  bank: WordEntry[],
  words: string[],
  todayIsoDate: string,
): string[] {
  const out: string[] = [];
  for (const raw of words) {
    const word = raw.toLowerCase();
    const entry = bank.find((w) => w.word.toLowerCase() === word);
    const due = entry?.tracks?.spelling?.nextReviewDate;
    if (!due || due <= todayIsoDate) {
      out.push(raw);
    }
  }
  return out.length > 0 ? out : words;
}

function estimateWordConfidence(bank: WordEntry[], wordRaw: string): number {
  const word = wordRaw.toLowerCase();
  const entry = bank.find((w) => w.word.toLowerCase() === word);
  const ease = entry?.tracks?.spelling?.easinessFactor ?? 2.5;
  const normalized = (ease - 1.3) / (2.5 - 1.3);
  return Math.max(0, Math.min(1, normalized));
}

function modalityForNode(nodeType: string): string {
  if (nodeType === "pronunciation" || nodeType === "word-builder") return "phonics";
  if (nodeType === "karaoke") return "reading";
  if (nodeType === "quest" || nodeType === "boss") return "quest";
  return nodeType;
}

export function reorderHomeworkNodesForSession(nodes: HomeworkNodeLike[]): HomeworkNodeLike[] {
  const out = [...nodes];
  const bossIdx = out.findIndex((n) => n.type === "boss");
  if (bossIdx > -1 && bossIdx !== out.length - 1) {
    const [boss] = out.splice(bossIdx, 1);
    out.push(boss!);
  }
  for (let i = 1; i < out.length; i++) {
    if (modalityForNode(out[i - 1]!.type) === modalityForNode(out[i]!.type)) {
      const swapIdx = out.findIndex(
        (n, idx) =>
          idx > i && modalityForNode(n.type) !== modalityForNode(out[i - 1]!.type),
      );
      if (swapIdx > -1) {
        const [swap] = out.splice(swapIdx, 1);
        out.splice(i, 0, swap!);
      }
    }
  }
  return out;
}

function promotePronunciationNode(
  nodes: HomeworkNodeLike[],
  strugglingWords: string[],
): HomeworkNodeLike[] {
  if (strugglingWords.length === 0) return nodes;
  const out = [...nodes];
  const pronIdx = out.findIndex((n) => n.type === "pronunciation");
  if (pronIdx > 1) {
    const [pron] = out.splice(pronIdx, 1);
    out.unshift(pron!);
  }
  return out;
}

export function buildNodeParams(
  node: HomeworkNodeLike,
  childId: string,
  words: string[],
  companion = "elli",
): string {
  const params = new URLSearchParams({
    words: words.join(","),
    childId,
    difficulty: String(node.difficulty ?? 2),
    nodeId: node.id,
    companion,
    sessionId: `sess-${Date.now()}`,
  });
  return params.toString();
}
