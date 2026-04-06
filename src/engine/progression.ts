import { readWordBank } from "../utils/wordBankIO";
import { readLearningProfile } from "../utils/learningProfileIO";

export interface ProgressionSnapshot {
  level: number;
  currentXP: number;
  xpToNextLevel: number;
  totalXP: number;
  wordsMastered: number;
  totalWords: number;
  streakRecord: number;
  recentTrend: "improving" | "stable" | "declining";
}

function trendFromMood(
  history: { sessionAccuracy: number }[],
): "improving" | "stable" | "declining" {
  if (history.length < 2) return "stable";
  const recent = history.slice(-3);
  const older = history.slice(-6, -3);
  if (older.length === 0) return "stable";
  const r =
    recent.reduce((s, m) => s + m.sessionAccuracy, 0) / recent.length;
  const o = older.reduce((s, m) => s + m.sessionAccuracy, 0) / older.length;
  if (r > o + 0.05) return "improving";
  if (r < o - 0.05) return "declining";
  return "stable";
}

export function computeProgression(childId: string): ProgressionSnapshot {
  const defaults: ProgressionSnapshot = {
    level: 1,
    currentXP: 0,
    xpToNextLevel: 100,
    totalXP: 0,
    wordsMastered: 0,
    totalWords: 0,
    streakRecord: 0,
    recentTrend: "stable",
  };

  try {
    const bank = readWordBank(childId);
    const profile = readLearningProfile(childId);

    let correctAttemptsXp = 0;
    let masteredWordXp = 0;
    let wordsMasteredCount = 0;
    for (const w of bank.words) {
      let wordHasMastered = false;
      for (const track of Object.values(w.tracks)) {
        if (!track) continue;
        for (const snap of track.history ?? []) {
          if (snap.correct) correctAttemptsXp += 10;
        }
        if (track.mastered) wordHasMastered = true;
      }
      if (wordHasMastered) {
        masteredWordXp += 25;
        wordsMasteredCount++;
      }
    }

    const totalSessions = profile?.sessionStats.totalSessions ?? 0;
    const sessionXp = totalSessions * 5;
    const wilsonStep = profile?.sessionStats.currentWilsonStep ?? 1;
    const wilsonXp = Math.max(0, wilsonStep - 1) * 50;

    const totalXP =
      correctAttemptsXp + masteredWordXp + sessionXp + wilsonXp;
    const level = Math.floor(totalXP / 100) + 1;
    const currentXP = totalXP % 100;
    const xpToNextLevel = 100 - (totalXP % 100);

    return {
      level,
      currentXP,
      xpToNextLevel,
      totalXP,
      wordsMastered: wordsMasteredCount,
      totalWords: bank.words.length,
      streakRecord: profile?.sessionStats.streakRecord ?? 0,
      recentTrend: profile?.moodHistory?.length
        ? trendFromMood(profile.moodHistory)
        : "stable",
    };
  } catch {
    return defaults;
  }
}
