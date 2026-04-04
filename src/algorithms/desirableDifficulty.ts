import type { DifficultyParams, DifficultySignal } from "./types";

interface DifficultyInput {
  recentAttempts: { correct: boolean; timestamp: string }[];
  params: DifficultyParams;
}

export function assessDifficulty(input: DifficultyInput): DifficultySignal {
  const { recentAttempts, params } = input;

  if (recentAttempts.length === 0) {
    return { zone: "optimal", currentAccuracy: 0, recommendation: "maintain", confidence: 0 };
  }

  const window = recentAttempts.slice(-params.windowSize);
  const correct = window.filter((a) => a.correct).length;
  const currentAccuracy = correct / window.length;
  const confidence = Math.min(1, window.length / params.windowSize);

  // Check for 3 consecutive wrong at end (break signal)
  const last3 = recentAttempts.slice(-3);
  if (last3.length >= 3 && last3.every((a) => !a.correct)) {
    return { zone: "break_needed", currentAccuracy, recommendation: "take_break", confidence };
  }

  const last5 = recentAttempts.slice(-5);
  if (last5.length >= 5) {
    const last5Accuracy = last5.filter((a) => a.correct).length / last5.length;

    if (last5Accuracy < params.breakThreshold) {
      return { zone: "break_needed", currentAccuracy, recommendation: "take_break", confidence };
    }

    if (last5Accuracy < params.hardThreshold) {
      return { zone: "too_hard", currentAccuracy, recommendation: "decrease_difficulty", confidence };
    }
  }

  if (currentAccuracy > params.easyThreshold) {
    return { zone: "too_easy", currentAccuracy, recommendation: "increase_difficulty", confidence };
  }

  if (currentAccuracy < params.hardThreshold && window.length >= 5) {
    return { zone: "too_hard", currentAccuracy, recommendation: "decrease_difficulty", confidence };
  }

  return { zone: "optimal", currentAccuracy, recommendation: "maintain", confidence };
}
