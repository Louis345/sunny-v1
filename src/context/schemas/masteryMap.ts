import type { MasteryMap, StepStatus } from "../../algorithms/types";

export function createEmptyMasteryMap(childId: string): MasteryMap {
  return {
    childId,
    currentStep: 1,
    steps: {
      1: createInitialStepStatus(),
    },
  };
}

export function createInitialStepStatus(): StepStatus {
  return {
    status: "active",
    sessionsAtGate: 0,
    totalSessions: 0,
    averageAccuracy: 0,
    regressionCount: 0,
  };
}

export type { MasteryMap, StepStatus };
