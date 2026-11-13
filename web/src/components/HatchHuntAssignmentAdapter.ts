import type {
  HatchHuntAssignmentConfig,
  HatchHuntAssignmentItem,
} from "../../../src/shared/hatchHuntAssignment";
import type { HatchChaseQuestion } from "./HatchChaseEngine";
import type { HatchHuntQuestion } from "./HatchHuntEngine";

export type InjectedHatchHuntQuestion = HatchHuntAssignmentItem & {
  recovery: HatchHuntAssignmentConfig["recoveryByTarget"][string];
};

export type InjectedHatchHuntQuestions = {
  hatch: InjectedHatchHuntQuestion[];
  chase: InjectedHatchHuntQuestion[];
};

function inject(
  items: HatchHuntAssignmentItem[],
  recoveryByTarget: HatchHuntAssignmentConfig["recoveryByTarget"],
): InjectedHatchHuntQuestion[] {
  return items.map((item) => ({
    ...item,
    response: item.response.mode === "selection"
      ? { ...item.response, options: item.response.options.map((option) => ({ ...option })) }
      : item.response.mode === "text"
        ? { ...item.response, acceptedAnswers: [...item.response.acceptedAnswers] }
        : { ...item.response },
    sourceEvidenceIds: [...item.sourceEvidenceIds],
    recovery: (recoveryByTarget[item.targetId] ?? []).map((step) => ({ ...step })),
  }));
}

/**
 * Converts Planner-owned assignment content into the two question phases used by
 * Hatch Hunt. No fallback questions live here: missing content is a config error.
 */
export function buildInjectedHatchHuntQuestions(
  config: HatchHuntAssignmentConfig,
): InjectedHatchHuntQuestions {
  return {
    hatch: inject(config.baselineItems, config.recoveryByTarget),
    chase: inject(config.verificationItems, config.recoveryByTarget),
  };
}

function answerContract(item: HatchHuntAssignmentItem): {
  answers: string[];
  correctAnswer: string;
  acceptedAnswers: string[];
} {
  const response = item.response;
  if (response.mode === "selection") {
    const correct = response.options.find((option) => option.id === response.correctOptionId);
    if (!correct) throw new Error(`hatch_hunt_correct_option_missing:${item.id}`);
    return {
      answers: response.options.map((option) => option.label),
      correctAnswer: correct.label,
      acceptedAnswers: [correct.label],
    };
  }
  if (response.mode === "numeric") {
    const answer = String(response.correctValue);
    return { answers: [], correctAnswer: answer, acceptedAnswers: [answer] };
  }
  return {
    answers: [],
    correctAnswer: response.acceptedAnswers[0] ?? "",
    acceptedAnswers: [...response.acceptedAnswers],
  };
}

export function buildHatchHuntRuntimeQuestions(config: HatchHuntAssignmentConfig): {
  hatch: HatchHuntQuestion[];
  chase: HatchChaseQuestion[];
} {
  const hatchItems = config.baselineItems.map((item, index): HatchHuntQuestion => ({
    id: item.id,
    prompt: item.prompt,
    ...answerContract(item),
    responseMode: item.response.mode,
    difficulty: index === 0 ? "guardian" : index === config.baselineItems.length - 1 ? "challenge" : "stretch",
    seconds: item.timerSeconds,
    targetId: item.targetId,
    sourceEvidenceIds: [...item.sourceEvidenceIds],
    exposure: item.exposure,
  }));
  const hatchRecoveries = config.baselineItems.map((item): HatchHuntQuestion => {
    const recovery = config.recoveryByTarget[item.targetId]?.[0];
    if (!recovery) throw new Error(`hatch_hunt_recovery_missing:${item.targetId}`);
    return {
      id: recovery.id,
      prompt: recovery.prompt,
      ...answerContract(item),
      responseMode: item.response.mode,
      difficulty: "recovery",
      seconds: null,
      targetId: item.targetId,
      sourceEvidenceIds: [...item.sourceEvidenceIds],
      exposure: item.exposure,
    };
  });
  const hatch = [...hatchItems, ...hatchRecoveries];
  const chase = config.verificationItems.map((item): HatchChaseQuestion => {
    const answers = answerContract(item);
    const recovery = config.recoveryByTarget[item.targetId]?.[0];
    if (!recovery) throw new Error(`hatch_hunt_recovery_missing:${item.targetId}`);
    return {
      id: item.id,
      prompt: item.prompt,
      ...answers,
      responseMode: item.response.mode,
      seconds: item.timerSeconds ?? 15,
      targetId: item.targetId,
      sourceEvidenceIds: [...item.sourceEvidenceIds],
      exposure: item.exposure,
      recovery: {
        prompt: recovery.prompt,
        answers: [...answers.answers],
        correctAnswer: answers.correctAnswer,
        acceptedAnswers: [...answers.acceptedAnswers],
        workedAnswer: recovery.workedExplanation,
      },
    };
  });
  return { hatch, chase };
}
