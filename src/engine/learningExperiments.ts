import type {
  LearningExperiment,
  LearningExperimentStatus,
  LearningProfile,
} from "../context/schemas/learningProfile";
import { withActiveSessionPlanLane } from "./homeworkLanes";

export type LearningExperimentResultInput = {
  experimentId: string;
  source: string;
  accuracy: number;
  completed: boolean;
  wordsAttempted: number;
  timeSpent_ms: number;
  recordedAt?: string;
};

function conclusionStatus(input: LearningExperimentResultInput): Exclude<LearningExperimentStatus, "planned" | "active"> {
  if (input.wordsAttempted <= 0) return "inconclusive";
  if (!input.completed || input.accuracy < 0.65) return "falsified";
  if (input.accuracy < 0.85) return "revised";
  return "supported";
}

function nextActionFor(status: Exclude<LearningExperimentStatus, "planned" | "active">): string {
  if (status === "supported") return "reuse or cautiously increase difficulty";
  if (status === "revised") return "revise intervention and retest with support";
  if (status === "falsified") return "retire this intervention theory for now";
  return "collect more evidence before deciding";
}

export function recordLearningExperimentResult(
  profile: LearningProfile,
  input: LearningExperimentResultInput,
): LearningProfile {
  const experiments = profile.learningExperiments ?? profile.activeSessionPlan?.learningExperiments ?? [];
  const existing = experiments.find((experiment) => experiment.experimentId === input.experimentId);
  if (!existing) return profile;

  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const status = conclusionStatus(input);
  const result = {
    recordedAt,
    source: input.source,
    summary: `${input.source} completed=${input.completed} accuracy=${input.accuracy}`,
    metrics: {
      accuracy: input.accuracy,
      completed: input.completed,
      wordsAttempted: input.wordsAttempted,
      timeSpent_ms: input.timeSpent_ms,
    },
  };
  const updated: LearningExperiment = {
    ...existing,
    status,
    updatedAt: recordedAt,
    results: [...existing.results, result],
    conclusion: {
      status,
      decidedAt: recordedAt,
      evidence: [result.summary],
      nextAction: nextActionFor(status),
    },
  };
  const merged = [
    ...experiments.filter((experiment) => experiment.experimentId !== input.experimentId),
    updated,
  ];
  const base = {
    ...profile,
    learningExperiments: merged,
  };
  return profile.activeSessionPlan
    ? withActiveSessionPlanLane(base, { ...profile.activeSessionPlan, learningExperiments: merged })
    : base;
}
