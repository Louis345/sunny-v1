import type { SM2Track, WordEntry } from "../algorithms/types";
import type { LearningProfile } from "../context/schemas/learningProfile";

export interface RewardTrigger {
  event: string;
  canvasMode: string;
  canvasLabel?: string;
  elliTone: string;
  gameUnlock?: string;
  psychologistLog: boolean;
}

export interface SessionRewardState {
  correctStreak: number;
  wordsThisSession: string[];
  bonusRoundFired: boolean;
  streakRecord: number;
  totalCorrect: number;
  totalAttempts: number;
}

export function evaluateRewards(
  _word: string,
  updatedTrack: SM2Track,
  previousTrack: SM2Track | undefined,
  sessionState: SessionRewardState,
  profile: LearningProfile,
): RewardTrigger[] {
  const triggers: RewardTrigger[] = [];

  if (updatedTrack.mastered && (!previousTrack || !previousTrack.mastered)) {
    triggers.push({
      event: "word_mastered",
      canvasMode: "score_meter",
      canvasLabel: "MASTERED",
      elliTone: "Genuine awe. That word is yours forever.",
      psychologistLog: true,
    });
  }

  if (sessionState.correctStreak > profile.sessionStats.streakRecord) {
    triggers.push({
      event: "personal_best",
      canvasMode: "reward",
      canvasLabel: `NEW RECORD: ${sessionState.correctStreak} IN A ROW`,
      elliTone: "Disbelief, pride. Longest streak EVER.",
      gameUnlock: sessionState.correctStreak > 5 ? "choice" : undefined,
      psychologistLog: true,
    });
  }

  if (sessionState.correctStreak === 5) {
    triggers.push({
      event: "streak_5",
      canvasMode: "reward",
      canvasLabel: "5 IN A ROW",
      elliTone: "Excited, high energy.",
      psychologistLog: false,
    });
  }

  if (
    previousTrack &&
    previousTrack.regressionCount > 0 &&
    updatedTrack.quality >= 4 &&
    updatedTrack.scaffoldLevel === 0
  ) {
    triggers.push({
      event: "comeback",
      canvasMode: "score_meter",
      canvasLabel: "COMEBACK",
      elliTone: "Quiet pride. Remember when this was hard?",
      psychologistLog: true,
    });
  }

  return triggers;
}

export function shouldTriggerBonusRound(
  wordBank: WordEntry[],
  domain: string,
  sessionAttemptCount: number,
  bonusRoundFired: boolean,
): { trigger: boolean; word?: WordEntry } {
  if (bonusRoundFired) return { trigger: false };
  if (sessionAttemptCount < 5) return { trigger: false };
  if (Math.random() > 0.33) return { trigger: false };

  const today = new Date();
  const candidates = wordBank.filter((w) => {
    const track = w.tracks[domain as keyof typeof w.tracks];
    if (!track || !track.mastered || !track.masteredDate) return false;
    const masteredDate = new Date(track.masteredDate);
    const daysSince = Math.floor((today.getTime() - masteredDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysSince >= 14 && daysSince <= 28;
  });

  if (candidates.length === 0) return { trigger: false };
  const word = candidates[Math.floor(Math.random() * candidates.length)];
  return { trigger: true, word };
}

export function evaluatePerfectSession(
  totalCorrect: number,
  totalAttempts: number,
): RewardTrigger | null {
  if (totalAttempts < 5) return null;
  if (totalCorrect !== totalAttempts) return null;
  return {
    event: "perfect_session",
    canvasMode: "championship",
    canvasLabel: "PERFECT",
    elliTone: "Over the top. This is the Super Bowl.",
    gameUnlock: "choice",
    psychologistLog: true,
  };
}
