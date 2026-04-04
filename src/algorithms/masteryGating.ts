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
