import type { WordEntry, Domain, ScaffoldLevel } from "../algorithms/types";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { TodaysPlanActivity } from "../agents/psychologist/today-plan";
import {
  getWordsDueForReview,
  getNewWordsForSession,
  sortDueWordEntriesByEasinessAscending,
} from "../algorithms/spacedRepetition";

export interface PlannedActivity {
  type: "review" | "new" | "probe" | "game" | "bond";
  words?: string[];
  domain?: Domain;
  scaffoldStart?: ScaffoldLevel;
  priority: number;
  timeboxMinutes: number;
  source?: string;
}

export interface OrderedSession {
  activities: PlannedActivity[];
  newWords: string[];
  reviewWords: string[];
  totalWordCount: number;
  estimatedMinutes: number;
}

export interface SessionPlannerInput {
  childId: string;
  mode: string;
  todaysPlan: TodaysPlanActivity[];
  wordBank: WordEntry[];
  profile: LearningProfile;
  moodSignal?: "energetic" | "neutral" | "fatigued";
  currentWilsonStep: number;
  /** Session 1 words from curriculum.md (Psychologist output), tried before bank-only new picks. */
  externalNewWordCandidates?: string[];
  /** Last resort for new words when curriculum + bank yield none (e.g. OCR homework list). */
  homeworkFallbackWords?: string[];
}

const SPELLING_SESSION_REVIEW_CAP = 3;
const SPELLING_SESSION_NEW_CAP = 2;

function pickSpellingNewWords(input: {
  wordBank: WordEntry[];
  domain: Domain;
  currentWilsonStep: number;
  max: number;
  external: string[];
  homeworkFallback: string[];
}): string[] {
  const { wordBank, domain, currentWilsonStep, max, external, homeworkFallback } =
    input;
  const out: string[] = [];
  const seen = new Set<string>();

  const tryAdd = (raw: string): boolean => {
    const lw = raw.toLowerCase().trim();
    if (!lw || seen.has(lw)) return false;
    const entry = wordBank.find((e) => e.word.toLowerCase() === lw);
    if (entry?.tracks[domain]) return false;
    if (
      entry &&
      entry.wilsonStep !== undefined &&
      entry.wilsonStep !== currentWilsonStep
    ) {
      return false;
    }
    seen.add(lw);
    out.push(lw);
    return true;
  };

  for (const w of external) {
    tryAdd(w);
    if (out.length >= max) return out;
  }

  const bankNew = getNewWordsForSession(
    wordBank,
    domain,
    currentWilsonStep,
    Math.max(max - out.length, 0) + 8,
  );
  for (const e of bankNew) {
    tryAdd(e.word);
    if (out.length >= max) return out;
  }

  for (const w of homeworkFallback) {
    tryAdd(w);
    if (out.length >= max) return out;
  }

  return out.slice(0, max);
}

export function planOrderedSession(input: SessionPlannerInput): OrderedSession {
  const {
    wordBank,
    profile,
    moodSignal,
    currentWilsonStep,
    todaysPlan,
    externalNewWordCandidates = [],
    homeworkFallbackWords = [],
  } = input;
  const sm2 = profile.algorithmParams.sm2;
  const domain = modeToDomain(input.mode);
  const today = new Date().toISOString().slice(0, 10);
  const spellingMode = input.mode === "spelling";

  const activities: PlannedActivity[] = [];

  activities.push({
    type: "bond",
    priority: 0,
    timeboxMinutes: 3,
    source: "bond_protocol",
  });

  const reviewMaxBase = profile.moodAdjustment
    ? Math.ceil(sm2.maxReviewWordsPerSession * 0.8)
    : sm2.maxReviewWordsPerSession;
  const reviewMax = spellingMode
    ? Math.min(reviewMaxBase, SPELLING_SESSION_REVIEW_CAP)
    : reviewMaxBase;
  const newMaxBase = profile.moodAdjustment ? 0 : sm2.maxNewWordsPerSession;
  const newMax = spellingMode
    ? Math.min(newMaxBase || SPELLING_SESSION_NEW_CAP, SPELLING_SESSION_NEW_CAP)
    : newMaxBase;

  const dueWords = sortDueWordEntriesByEasinessAscending(
    getWordsDueForReview(wordBank, domain, today, moodSignal),
    domain,
  );
  const reviewWords = dueWords.slice(0, reviewMax).map((w) => w.word);

  if (reviewWords.length > 0) {
    activities.push({
      type: "review",
      words: reviewWords,
      domain,
      priority: 1,
      timeboxMinutes: Math.ceil(reviewWords.length * 1.5),
      source: "spaced_repetition",
    });
  }

  let newWords: string[];
  if (spellingMode && newMax > 0) {
    newWords = pickSpellingNewWords({
      wordBank,
      domain,
      currentWilsonStep,
      max: newMax,
      external: externalNewWordCandidates,
      homeworkFallback: homeworkFallbackWords,
    });
  } else if (newMax > 0) {
    newWords = getNewWordsForSession(
      wordBank,
      domain,
      currentWilsonStep,
      newMax,
    ).map((w) => w.word);
  } else {
    newWords = [];
  }

  if (newWords.length > 0) {
    activities.push({
      type: "new",
      words: newWords,
      domain,
      scaffoldStart: 2,
      priority: 2,
      timeboxMinutes: Math.ceil(newWords.length * 2),
      source: "wilson_curriculum",
    });
  }

  for (const planItem of todaysPlan) {
    if (planItem.probeSequence && planItem.probeSequence.length > 0) {
      activities.push({
        type: "probe",
        words: planItem.words,
        priority: planItem.priority,
        timeboxMinutes: planItem.timeboxMinutes,
        source: "psychologist",
      });
    }
  }

  const totalWordCount = reviewWords.length + newWords.length;
  const estimatedMinutes = activities.reduce((sum, a) => sum + a.timeboxMinutes, 0);

  return {
    activities: activities.sort((a, b) => a.priority - b.priority),
    newWords,
    reviewWords,
    totalWordCount,
    estimatedMinutes,
  };
}

function modeToDomain(mode: string): Domain {
  switch (mode) {
    case "spelling": return "spelling";
    case "reading": return "reading";
    case "math": return "math";
    case "clocks": return "clocks";
    default: return "spelling";
  }
}
