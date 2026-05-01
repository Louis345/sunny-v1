import type { ErrorSignal, QuestThreshold } from "../../algorithms/types";
import { readLearningProfile } from "../../utils/learningProfileIO";
import { scanChildErrorPatterns } from "./patternDetector";

export function evaluateQuestThreshold(input: {
  totalSessions: number;
  patterns: ErrorSignal[];
}): QuestThreshold {
  const strongestPattern = [...input.patterns].sort(
    (a, b) => b.confidence - a.confidence,
  )[0];

  if (input.totalSessions < 3) {
    return {
      unlocked: false,
      reason: "needs_more_sessions",
      totalSessions: input.totalSessions,
      strongestPattern,
    };
  }

  if (
    strongestPattern &&
    strongestPattern.confidence >= 0.7 &&
    strongestPattern.sessionCount >= 2
  ) {
    return {
      unlocked: true,
      reason: "pattern_ready",
      totalSessions: input.totalSessions,
      strongestPattern,
    };
  }

  return {
    unlocked: false,
    reason: "needs_confirmed_pattern",
    totalSessions: input.totalSessions,
    strongestPattern,
  };
}

export function computeQuestThreshold(childId: string): boolean {
  const profile = readLearningProfile(childId);
  const totalSessions = profile?.sessionStats.totalSessions ?? 0;
  const patternResult = scanChildErrorPatterns(childId);
  const threshold = evaluateQuestThreshold({
    totalSessions,
    patterns: patternResult.patterns,
  });
  console.log(
    ` 🎮 [quest-threshold] [evaluate] [${threshold.unlocked ? "unlocked" : "locked"}] child=${childId} sessions=${totalSessions} patterns=${patternResult.patterns.length}`,
  );
  return threshold.unlocked;
}
