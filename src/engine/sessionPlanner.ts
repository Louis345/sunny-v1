import type { WordEntry, Domain, SM2Params, DifficultyParams, ScaffoldLevel } from "../algorithms/types";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { TodaysPlanActivity } from "../agents/psychologist/today-plan";
import { getWordsDueForReview, getNewWordsForSession } from "../algorithms/spacedRepetition";

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
}

export function planOrderedSession(input: SessionPlannerInput): OrderedSession {
  const { wordBank, profile, moodSignal, currentWilsonStep, todaysPlan } = input;
  const sm2 = profile.algorithmParams.sm2;
  const domain = modeToDomain(input.mode);
  const today = new Date().toISOString().slice(0, 10);

  const activities: PlannedActivity[] = [];

  activities.push({
    type: "bond",
    priority: 0,
    timeboxMinutes: 3,
    source: "bond_protocol",
  });

  const reviewMax = profile.moodAdjustment
    ? Math.ceil(sm2.maxReviewWordsPerSession * 0.8)
    : sm2.maxReviewWordsPerSession;
  const newMax = profile.moodAdjustment ? 0 : sm2.maxNewWordsPerSession;

  const dueWords = getWordsDueForReview(wordBank, domain, today, moodSignal);
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

  const newWordEntries = getNewWordsForSession(wordBank, domain, currentWilsonStep, newMax);
  const newWords = newWordEntries.map((w) => w.word);

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
