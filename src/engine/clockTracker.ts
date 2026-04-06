import type { MasteryGateResult, StepSessionRecord } from "../algorithms/types";
import { evaluateMasteryGate } from "../algorithms/masteryGating";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";

const sessionAttempts = new Map<string, boolean[]>();

function ensureClockMastery(childId: string) {
  const profile = readLearningProfile(childId);
  if (!profile) return null;
  if (!profile.clockMastery) {
    profile.clockMastery = {
      currentStep: 1,
      stepSessionHistory: [],
    };
    writeLearningProfile(childId, profile);
  }
  return profile;
}

export function recordClockAttempt(
  childId: string,
  correct: boolean,
  _hour: number,
  _minute: number,
): void {
  const list = sessionAttempts.get(childId) ?? [];
  list.push(correct);
  sessionAttempts.set(childId, list);
}

export function getClockLevel(childId: string): {
  currentStep: number;
  gate: MasteryGateResult;
} {
  try {
    const profile = readLearningProfile(childId);
    const step = profile?.clockMastery?.currentStep ?? 1;
    const history = profile?.clockMastery?.stepSessionHistory ?? [];
    const params =
      profile?.algorithmParams.mastery ?? {
        gateAccuracy: 0.8,
        gateSessions: 3,
        regressionThreshold: 0.6,
        regressionSessions: 2,
      };
    const gate = evaluateMasteryGate({
      currentStep: step,
      stepSessionHistory: history,
      params,
    });
    return { currentStep: step, gate };
  } catch {
    return {
      currentStep: 1,
      gate: {
        gate: "locked",
        currentStep: 1,
        sessionsAtThreshold: 0,
        requiredSessions: 3,
      },
    };
  }
}

export function finalizeClockSession(childId: string): void {
  const attempts = sessionAttempts.get(childId);
  if (!attempts || attempts.length === 0) {
    sessionAttempts.delete(childId);
    return;
  }

  const profile = ensureClockMastery(childId);
  if (!profile?.clockMastery) {
    sessionAttempts.delete(childId);
    return;
  }

  const total = attempts.length;
  const correct = attempts.filter(Boolean).length;
  const accuracy = total > 0 ? correct / total : 0;
  const today = new Date().toISOString().slice(0, 10);

  const record: StepSessionRecord = {
    sessionDate: today,
    wordsAttempted: total,
    wordsCorrect: correct,
    accuracy,
  };

  const hist = [...profile.clockMastery.stepSessionHistory, record].slice(-20);
  profile.clockMastery.stepSessionHistory = hist;

  const gate = evaluateMasteryGate({
    currentStep: profile.clockMastery.currentStep,
    stepSessionHistory: hist,
    params: profile.algorithmParams.mastery,
  });

  if (gate.gate === "ready_to_advance") {
    profile.clockMastery.currentStep += 1;
    profile.clockMastery.stepSessionHistory = [];
  } else if (gate.gate === "regressed") {
    profile.clockMastery.currentStep = gate.regressionTarget ?? Math.max(1, profile.clockMastery.currentStep - 1);
    profile.clockMastery.stepSessionHistory = [];
  }

  writeLearningProfile(childId, profile);
  sessionAttempts.delete(childId);
}
