import type { MasteryGateInput, MasteryGateResult } from "./types";

export function evaluateMasteryGate(input: MasteryGateInput): MasteryGateResult {
  const { currentStep, stepSessionHistory, params } = input;

  if (stepSessionHistory.length === 0) {
    return {
      gate: "locked",
      currentStep,
      sessionsAtThreshold: 0,
      requiredSessions: params.gateSessions,
    };
  }

  // Count consecutive sessions from end that meet gate accuracy
  let sessionsAtThreshold = 0;
  for (let i = stepSessionHistory.length - 1; i >= 0; i--) {
    if (stepSessionHistory[i].accuracy >= params.gateAccuracy) {
      sessionsAtThreshold++;
    } else {
      break;
    }
  }

  if (sessionsAtThreshold >= params.gateSessions) {
    return {
      gate: "ready_to_advance",
      currentStep,
      sessionsAtThreshold,
      requiredSessions: params.gateSessions,
    };
  }

  // Check for regression: consecutive sessions below regression threshold from end
  let regressionSessions = 0;
  for (let i = stepSessionHistory.length - 1; i >= 0; i--) {
    if (stepSessionHistory[i].accuracy < params.regressionThreshold) {
      regressionSessions++;
    } else {
      break;
    }
  }

  if (regressionSessions >= params.regressionSessions) {
    return {
      gate: "regressed",
      currentStep,
      sessionsAtThreshold: 0,
      requiredSessions: params.gateSessions,
      regressionTarget: Math.max(1, currentStep - 1),
    };
  }

  return {
    gate: "locked",
    currentStep,
    sessionsAtThreshold,
    requiredSessions: params.gateSessions,
  };
}

type SessionHistoryInput = {
  sessions?: Array<{ accuracy?: number; domain?: string; type?: string }>;
  clockStep?: number;
  coinStep?: number;
  readingLevel?: number;
  sessionStats?: { currentWilsonStep?: number };
  readingProfile?: { currentReadingLevel?: string };
};

function levelFromReadingLabel(label: string | undefined): number {
  if (!label) return 1;
  const match = label.match(/\d+/);
  if (match) return Number(match[0]);
  if (/cvc/i.test(label)) return 1;
  return 1;
}

/**
 * ChildProfile output field: `masteryGating`.
 */
export function masteryGating(
  sessionHistory: SessionHistoryInput = {},
): { masteryGating: { clockStep: number; coinStep: number; readingLevel: number } } {
  const sessions = sessionHistory.sessions ?? [];
  const clockWins = sessions.filter(
    (session) =>
      (session.domain === "clock" || session.type === "clock" || session.type === "clocks") &&
      (session.accuracy ?? 0) >= 0.8,
  ).length;
  const coinWins = sessions.filter(
    (session) =>
      (session.domain === "coin" || session.type === "coin" || session.type === "coins") &&
      (session.accuracy ?? 0) >= 0.8,
  ).length;

  return {
    masteryGating: {
      clockStep: Math.max(1, sessionHistory.clockStep ?? 1 + Math.floor(clockWins / 3)),
      coinStep: Math.max(1, sessionHistory.coinStep ?? 1 + Math.floor(coinWins / 3)),
      readingLevel: Math.max(
        1,
        sessionHistory.readingLevel ??
          sessionHistory.sessionStats?.currentWilsonStep ??
          levelFromReadingLabel(sessionHistory.readingProfile?.currentReadingLevel),
      ),
    },
  };
}
