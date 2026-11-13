export type HatchHuntPhase =
  | "choose"
  | "guardian"
  | "cracking"
  | "rescue"
  | "hatched"
  | "lost";

export interface HatchHuntQuestion {
  id: string;
  prompt: string;
  answers: string[];
  correctAnswer: string;
  difficulty: "guardian" | "stretch" | "challenge" | "recovery";
  seconds: number | null;
  responseMode?: "selection" | "numeric" | "text";
  acceptedAnswers?: string[];
  targetId?: string;
  sourceEvidenceIds?: string[];
  exposure?: "unseen" | "taught" | "practiced";
}

export type HatchHuntEventType =
  | "egg_selected"
  | "guardian_answered"
  | "crack_answered"
  | "shell_cracked"
  | "shell_resealed"
  | "timer_expired"
  | "rescue_started"
  | "rescue_recovered"
  | "egg_hatched"
  | "egg_attempt_lost";

export interface HatchHuntEvent {
  type: HatchHuntEventType;
  evidenceClass: "academic_observation" | "engagement_only";
  masteryClaimAllowed: false;
  questionId?: string;
  correct?: boolean;
  latencyMs?: number;
  confounds?: string[];
  response?: string;
  assistance?: "none" | "scaffold";
}

export interface HatchHuntDiscovery {
  encounterId: string;
  childId: string;
  creatureId: string;
  selectedEggId: string;
  crackCount: number;
  next: "orb_chase";
}

export interface HatchHuntState {
  encounterId: string;
  childId: string;
  creatureId: string;
  eggIds: string[];
  questions: HatchHuntQuestion[];
  phase: HatchHuntPhase;
  selectedEggId: string | null;
  crackCount: number;
  currentQuestion: HatchHuntQuestion | null;
  currentQuestionIndex: number;
  recoveryUsed: boolean;
  recoveryFromPhase: "guardian" | "cracking" | null;
  resumeQuestionIndex: number | null;
  discovery: HatchHuntDiscovery | null;
  events: HatchHuntEvent[];
}

function requiredCracks(state: HatchHuntState): number {
  return Math.max(1, state.questions.filter((question) => question.difficulty !== "recovery").length - 1);
}

function answerMatches(question: HatchHuntQuestion, answer: string): boolean {
  const normalized = answer.trim().toLocaleLowerCase();
  return (question.acceptedAnswers ?? [question.correctAnswer]).some(
    (accepted) => accepted.trim().toLocaleLowerCase() === normalized,
  );
}

function event(
  type: HatchHuntEventType,
  evidenceClass: HatchHuntEvent["evidenceClass"],
  details: Omit<
    HatchHuntEvent,
    "type" | "evidenceClass" | "masteryClaimAllowed"
  > = {},
): HatchHuntEvent {
  return {
    type,
    evidenceClass,
    masteryClaimAllowed: false,
    ...details,
  };
}

function hatch(state: HatchHuntState): HatchHuntState {
  return {
    ...state,
    phase: "hatched",
    crackCount: requiredCracks(state),
    currentQuestion: null,
    discovery: {
      encounterId: state.encounterId,
      childId: state.childId,
      creatureId: state.creatureId,
      selectedEggId: state.selectedEggId ?? state.eggIds[0],
      crackCount: requiredCracks(state),
      next: "orb_chase",
    },
    events: [
      ...state.events,
      event("egg_hatched", "engagement_only"),
    ],
  };
}

function loseEgg(state: HatchHuntState): HatchHuntState {
  return {
    ...state,
    phase: "lost",
    currentQuestion: null,
    discovery: null,
    events: [
      ...state.events,
      event("egg_attempt_lost", "engagement_only"),
    ],
  };
}

function startRescue(
  state: HatchHuntState,
  answerEvent: HatchHuntEvent,
): HatchHuntState {
  const failedQuestion = state.currentQuestion;
  const rescueQuestionIndex = state.questions.findIndex(
    (question) => question.difficulty === "recovery" && question.targetId === failedQuestion?.targetId,
  );
  if (state.recoveryUsed || rescueQuestionIndex < 0) {
    return loseEgg({
      ...state,
      events: [...state.events, answerEvent],
    });
  }
  const resealedCracks = Math.max(0, state.crackCount - 1);
  return {
    ...state,
    phase: "rescue",
    crackCount: resealedCracks,
    currentQuestion: state.questions[rescueQuestionIndex],
    currentQuestionIndex: rescueQuestionIndex,
    recoveryUsed: true,
    recoveryFromPhase: state.phase === "guardian" ? "guardian" : "cracking",
    resumeQuestionIndex: state.currentQuestionIndex + 1,
    events: [
      ...state.events,
      answerEvent,
      event("shell_resealed", "engagement_only"),
      event("rescue_started", "engagement_only"),
    ],
  };
}

export function createHatchHuntSession({
  encounterId,
  childId,
  creatureId,
  eggIds,
  questions,
}: {
  encounterId: string;
  childId: string;
  creatureId: string;
  eggIds: string[];
  questions: HatchHuntQuestion[];
}): HatchHuntState {
  if (eggIds.length < 1) throw new Error("Hatch Hunt requires at least one egg");
  if (questions.length < 2) {
    throw new Error("Hatch Hunt requires guardian and cracking questions");
  }
  return {
    encounterId,
    childId,
    creatureId,
    eggIds: [...eggIds],
    questions: [...questions],
    phase: "choose",
    selectedEggId: null,
    crackCount: 0,
    currentQuestion: null,
    currentQuestionIndex: -1,
    recoveryUsed: false,
    recoveryFromPhase: null,
    resumeQuestionIndex: null,
    discovery: null,
    events: [],
  };
}

export function selectHatchEgg(
  state: HatchHuntState,
  eggId: string,
): HatchHuntState {
  if (state.phase !== "choose" || !state.eggIds.includes(eggId)) return state;
  return {
    ...state,
    phase: "guardian",
    selectedEggId: eggId,
    currentQuestion: state.questions[0],
    currentQuestionIndex: 0,
    events: [...state.events, event("egg_selected", "engagement_only")],
  };
}

export function answerHatchQuestion(
  state: HatchHuntState,
  {
    answer,
    latencyMs,
  }: {
    answer: string;
    latencyMs: number;
  },
): HatchHuntState {
  const question = state.currentQuestion;
  if (!question || !["guardian", "cracking", "rescue"].includes(state.phase)) {
    return state;
  }
  const correct = answerMatches(question, answer);
  const answerEvent = event(
    state.phase === "guardian" ? "guardian_answered" : "crack_answered",
    "academic_observation",
    {
      questionId: question.id,
      correct,
      latencyMs: Math.max(0, Math.round(latencyMs)),
      response: answer,
      assistance: state.phase === "rescue" ? "scaffold" : "none",
      ...(question.seconds == null ? {} : { confounds: ["time_pressure"] }),
    },
  );

  if (state.phase === "guardian") {
    if (!correct) {
      return startRescue(state, answerEvent);
    }
    return {
      ...state,
      phase: "cracking",
      currentQuestionIndex: 1,
      currentQuestion: state.questions[1] ?? null,
      events: [...state.events, answerEvent],
    };
  }

  if (state.phase === "rescue") {
    if (!correct) {
      return loseEgg({ ...state, events: [...state.events, answerEvent] });
    }
    const maxCracks = requiredCracks(state);
    const recovered = state.recoveryFromPhase === "guardian"
      ? state.crackCount
      : Math.min(maxCracks, state.crackCount + (state.crackCount === 0 ? 1 : 2));
    const resumeIndex = state.resumeQuestionIndex ?? state.questions.length;
    const rescuedState: HatchHuntState = {
      ...state,
      phase: "cracking",
      crackCount: recovered,
      currentQuestionIndex: resumeIndex,
      currentQuestion:
        state.questions[resumeIndex]?.difficulty === "recovery"
          ? null
          : (state.questions[resumeIndex] ?? null),
      resumeQuestionIndex: null,
      recoveryFromPhase: null,
      events: [
        ...state.events,
        answerEvent,
        event("rescue_recovered", "engagement_only"),
        event("shell_cracked", "engagement_only"),
      ],
    };
    return state.recoveryFromPhase !== "guardian" && recovered >= maxCracks
      ? hatch(rescuedState)
      : rescuedState;
  }

  if (!correct) return startRescue(state, answerEvent);
  const maxCracks = requiredCracks(state);
  const crackCount = Math.min(maxCracks, state.crackCount + 1);
  const nextQuestionIndex = state.currentQuestionIndex + 1;
  const crackedState: HatchHuntState = {
    ...state,
    crackCount,
    currentQuestionIndex: nextQuestionIndex,
    currentQuestion: state.questions[nextQuestionIndex] ?? null,
    events: [
      ...state.events,
      answerEvent,
      event("shell_cracked", "engagement_only"),
    ],
  };
  return crackCount >= maxCracks ? hatch(crackedState) : crackedState;
}

export function expireHatchTimer(state: HatchHuntState): HatchHuntState {
  const question = state.currentQuestion;
  if (state.phase !== "cracking" || !question || question.seconds == null) {
    return state;
  }
  return startRescue(
    state,
    event("timer_expired", "academic_observation", {
      questionId: question.id,
      correct: false,
      latencyMs: question.seconds * 1_000,
      confounds: ["time_pressure"],
    }),
  );
}
