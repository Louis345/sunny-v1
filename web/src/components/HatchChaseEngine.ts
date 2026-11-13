export type HatchChasePhase =
  | "questions"
  | "recovery"
  | "worked_support"
  | "capture_ready"
  | "capturing"
  | "retreated"
  | "captured";

export interface HatchChaseRecovery {
  prompt: string;
  answers: string[];
  correctAnswer: string;
  workedAnswer: string;
  acceptedAnswers?: string[];
}

export interface HatchChaseQuestion {
  id: string;
  prompt: string;
  answers: string[];
  correctAnswer: string;
  seconds: number;
  recovery: HatchChaseRecovery;
  responseMode?: "selection" | "numeric" | "text";
  acceptedAnswers?: string[];
  targetId?: string;
  sourceEvidenceIds?: string[];
  exposure?: "unseen" | "taught" | "practiced";
}

export type HatchChaseEventType =
  | "chase_question_answered"
  | "chase_timer_expired"
  | "chase_recovery_started"
  | "chase_recovery_answered"
  | "chase_worked_support_completed"
  | "chase_orb_charged"
  | "chase_throw_released"
  | "creature_retreated"
  | "creature_captured";

export interface HatchChaseEvent {
  type: HatchChaseEventType;
  encounterId: string;
  evidenceClass: "academic_observation" | "support" | "engagement_only";
  masteryClaimAllowed: false;
  questionId?: string;
  correct?: boolean;
  latencyMs?: number;
  confounds?: string[];
  assistance?: "none" | "scaffold" | "worked_solution";
  result?: "miss" | "capture";
  hitDistance?: number;
  remainingOrbs?: number;
  response?: string;
}

export interface HatchChaseCapture {
  encounterId: string;
  childId: string;
  creatureId: string;
  source: "hatch_hunt_orb_capture";
  hitDistance: number;
}

export interface HatchChaseState {
  encounterId: string;
  childId: string;
  creatureId: string;
  questions: HatchChaseQuestion[];
  phase: HatchChasePhase;
  currentQuestionIndex: number;
  currentQuestion: HatchChaseQuestion | null;
  chargedOrbs: number;
  remainingOrbs: number;
  capture: HatchChaseCapture | null;
  events: HatchChaseEvent[];
}

function event(
  state: HatchChaseState,
  type: HatchChaseEventType,
  evidenceClass: HatchChaseEvent["evidenceClass"],
  details: Omit<
    HatchChaseEvent,
    "type" | "encounterId" | "evidenceClass" | "masteryClaimAllowed"
  > = {},
): HatchChaseEvent {
  return {
    type,
    encounterId: state.encounterId,
    evidenceClass,
    masteryClaimAllowed: false,
    ...details,
  };
}

function advanceWithChargedOrb(
  state: HatchChaseState,
  assistance: HatchChaseEvent["assistance"],
  precedingEvents: HatchChaseEvent[],
): HatchChaseState {
  const nextIndex = state.currentQuestionIndex + 1;
  const complete = nextIndex >= state.questions.length;
  return {
    ...state,
    phase: complete ? "capture_ready" : "questions",
    currentQuestionIndex: nextIndex,
    currentQuestion: complete ? null : state.questions[nextIndex],
    chargedOrbs: Math.min(state.questions.length, state.chargedOrbs + 1),
    events: [
      ...state.events,
      ...precedingEvents,
      event(state, "chase_orb_charged", "engagement_only", { assistance }),
    ],
  };
}

function startRecovery(
  state: HatchChaseState,
  observation: HatchChaseEvent,
): HatchChaseState {
  return {
    ...state,
    phase: "recovery",
    events: [
      ...state.events,
      observation,
      event(state, "chase_recovery_started", "support", {
        questionId: state.currentQuestion?.id,
        assistance: "scaffold",
      }),
    ],
  };
}

export function createHatchChaseSession({
  encounterId,
  childId,
  creatureId,
  questions,
  orbCount,
}: {
  encounterId: string;
  childId: string;
  creatureId: string;
  questions: HatchChaseQuestion[];
  orbCount: number;
}): HatchChaseState {
  if (questions.length < 1) throw new Error("hatch_chase_requires_questions");
  if (orbCount !== questions.length) throw new Error("hatch_chase_orbs_must_match_questions");
  return {
    encounterId,
    childId,
    creatureId,
    questions: [...questions],
    phase: "questions",
    currentQuestionIndex: 0,
    currentQuestion: questions[0],
    chargedOrbs: 0,
    remainingOrbs: orbCount,
    capture: null,
    events: [],
  };
}

export function answerHatchChaseQuestion(
  state: HatchChaseState,
  { answer, latencyMs }: { answer: string; latencyMs: number },
): HatchChaseState {
  const question = state.currentQuestion;
  if (state.phase !== "questions" || !question) return state;
  const normalized = answer.trim().toLocaleLowerCase();
  const correct = (question.acceptedAnswers ?? [question.correctAnswer]).some(
    (accepted) => accepted.trim().toLocaleLowerCase() === normalized,
  );
  const observation = event(state, "chase_question_answered", "academic_observation", {
    questionId: question.id,
    correct,
    latencyMs: Math.max(0, Math.round(latencyMs)),
    confounds: ["time_pressure"],
    assistance: "none",
    response: answer,
  });
  if (!correct) return startRecovery(state, observation);
  return advanceWithChargedOrb(state, "none", [observation]);
}

export function expireHatchChaseTimer(state: HatchChaseState): HatchChaseState {
  const question = state.currentQuestion;
  if (state.phase !== "questions" || !question) return state;
  const observation = event(state, "chase_timer_expired", "academic_observation", {
    questionId: question.id,
    correct: false,
    latencyMs: question.seconds * 1_000,
    confounds: ["time_pressure"],
    assistance: "none",
  });
  return startRecovery(state, observation);
}

export function answerHatchChaseRecovery(
  state: HatchChaseState,
  { answer, latencyMs }: { answer: string; latencyMs: number },
): HatchChaseState {
  const question = state.currentQuestion;
  if (state.phase !== "recovery" || !question) return state;
  const normalized = answer.trim().toLocaleLowerCase();
  const correct = (question.recovery.acceptedAnswers ?? [question.recovery.correctAnswer]).some(
    (accepted) => accepted.trim().toLocaleLowerCase() === normalized,
  );
  const observation = event(state, "chase_recovery_answered", "support", {
    questionId: question.id,
    correct,
    latencyMs: Math.max(0, Math.round(latencyMs)),
    assistance: "scaffold",
    response: answer,
  });
  if (!correct) {
    return {
      ...state,
      phase: "worked_support",
      events: [...state.events, observation],
    };
  }
  return advanceWithChargedOrb(state, "scaffold", [observation]);
}

export function completeHatchChaseWorkedSupport(state: HatchChaseState): HatchChaseState {
  if (state.phase !== "worked_support" || !state.currentQuestion) return state;
  return advanceWithChargedOrb(state, "worked_solution", [
    event(state, "chase_worked_support_completed", "support", {
      questionId: state.currentQuestion.id,
      assistance: "worked_solution",
    }),
  ]);
}

export function recordHatchChaseThrow(
  state: HatchChaseState,
  { result, hitDistance }: { result: "miss" | "capture"; hitDistance: number },
): HatchChaseState {
  if (!["capture_ready", "capturing"].includes(state.phase) || state.remainingOrbs <= 0) {
    return state;
  }
  const remainingOrbs = Math.max(0, state.remainingOrbs - 1);
  const throwEvent = event(state, "chase_throw_released", "engagement_only", {
    result,
    hitDistance,
    remainingOrbs,
  });
  if (result === "capture") {
    return {
      ...state,
      phase: "captured",
      remainingOrbs,
      capture: {
        encounterId: state.encounterId,
        childId: state.childId,
        creatureId: state.creatureId,
        source: "hatch_hunt_orb_capture",
        hitDistance,
      },
      events: [
        ...state.events,
        throwEvent,
        event(state, "creature_captured", "engagement_only", {
          result,
          hitDistance,
          remainingOrbs,
        }),
      ],
    };
  }
  if (remainingOrbs === 0) {
    return {
      ...state,
      phase: "retreated",
      remainingOrbs,
      events: [
        ...state.events,
        throwEvent,
        event(state, "creature_retreated", "engagement_only", {
          result,
          hitDistance,
          remainingOrbs,
        }),
      ],
    };
  }
  return {
    ...state,
    phase: "capturing",
    remainingOrbs,
    events: [...state.events, throwEvent],
  };
}
