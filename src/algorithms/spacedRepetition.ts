import type {
  SM2Track,
  SM2Params,
  ChildQuality,
  WordEntry,
  Domain,
  AttemptInput,
} from "./types";

export function computeSM2(
  track: SM2Track,
  quality: ChildQuality,
  params: SM2Params,
): SM2Track {
  const today = new Date().toISOString().slice(0, 10);
  let { easinessFactor, interval, repetition, mastered, masteredDate, regressionCount } = track;

  // EF update (standard SM-2 formula)
  easinessFactor = easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  easinessFactor = Math.max(params.minEasinessFactor, easinessFactor);

  if (quality < 3) {
    if (mastered) {
      // Regression: mastered word fails. Don't reset to 1 — demoralizing.
      interval = Math.max(1, Math.floor(interval / 4));
      mastered = false;
      regressionCount++;
    } else {
      repetition = 0;
      interval = 1;
    }
  } else {
    if (repetition === 0) {
      interval = 1;
    } else if (repetition === 1) {
      interval = 4; // Child-adapted: 4 not 6
    } else {
      interval = Math.round(interval * easinessFactor * params.intervalModifier);
    }
    repetition++;
  }

  interval = Math.min(interval, 60);

  if (!mastered && interval > 21) {
    mastered = true;
    masteredDate = today;
  }

  const nextReviewDate = addDays(today, interval);

  return {
    quality,
    easinessFactor,
    interval,
    repetition,
    nextReviewDate,
    lastReviewDate: today,
    scaffoldLevel: track.scaffoldLevel,
    history: track.history,
    mastered,
    masteredDate,
    regressionCount,
  };
}

export function getWordsDueForReview(
  wordBank: WordEntry[],
  domain: Domain,
  today: string,
  mood?: "energetic" | "neutral" | "fatigued",
): WordEntry[] {
  return wordBank.filter((entry) => {
    const track = entry.tracks[domain];
    if (!track) return false;
    if (track.nextReviewDate > today) return false;
    if (mood === "fatigued" && track.interval < 3) return false;
    return true;
  });
}

export function getNewWordsForSession(
  wordBank: WordEntry[],
  domain: Domain,
  wilsonStep: number,
  maxNew: number,
): WordEntry[] {
  const candidates = wordBank.filter((entry) => {
    if (entry.tracks[domain]) return false;
    if (entry.wilsonStep !== undefined && entry.wilsonStep !== wilsonStep) return false;
    return true;
  });
  return candidates.slice(0, maxNew);
}

export function computeQualityFromAttempt(attempt: AttemptInput): ChildQuality {
  if (attempt.correct) {
    if (attempt.scaffoldLevel === 0) return 5;
    if (attempt.scaffoldLevel === 1) return 4;
    return 3;
  }
  if (attempt.scaffoldLevel > 0) return 2;
  return 0;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
