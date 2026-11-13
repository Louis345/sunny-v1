export const COMPANION_SPEECH_GRACE_MS = 900;

export type CompanionPresencePhase =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "celebrating";

export type CompanionPresenceEvent =
  | { type: "session_listening"; atMs: number }
  | { type: "response_thinking"; atMs: number }
  | { type: "speech_started"; atMs: number }
  | { type: "speech_paused"; atMs: number }
  | { type: "time_advanced"; atMs: number }
  | { type: "session_ended"; atMs: number }
  | { type: "success_reaction"; requestId: number; atMs: number }
  | { type: "one_shot_finished"; requestId: number; atMs: number };

export const COMPANION_LIFE_LAB_MAX_SCRIPT_STEPS = 10;

export interface CompanionLifeLabScriptStep {
  delayMs: number;
  event: CompanionPresenceEvent;
}

export const COMPANION_LIFE_LAB_SCRIPT = [
  { delayMs: 0, event: { type: "session_listening", atMs: 0 } },
  { delayMs: 1_200, event: { type: "response_thinking", atMs: 1_200 } },
  { delayMs: 2_400, event: { type: "speech_started", atMs: 2_400 } },
  { delayMs: 3_250, event: { type: "speech_paused", atMs: 3_250 } },
  { delayMs: 3_650, event: { type: "speech_started", atMs: 3_650 } },
  {
    delayMs: 4_700,
    event: { type: "success_reaction", requestId: 1, atMs: 4_700 },
  },
  {
    delayMs: 6_600,
    event: { type: "one_shot_finished", requestId: 1, atMs: 6_600 },
  },
  { delayMs: 8_000, event: { type: "session_ended", atMs: 8_000 } },
] satisfies CompanionLifeLabScriptStep[];

export interface CompanionPresenceTransition {
  component: "companion-presence";
  action: CompanionPresenceEvent["type"];
  result: string;
  atMs: number;
}

export interface CompanionPresenceState {
  visiblePhase: CompanionPresencePhase;
  basePhase: Exclude<CompanionPresencePhase, "celebrating">;
  resumePhase: Exclude<CompanionPresencePhase, "celebrating"> | null;
  activeOverrideRequestId: number | null;
  speechGraceUntilMs: number | null;
  transitionCount: number;
  lastTransition: CompanionPresenceTransition | null;
}

export function createCompanionPresenceState(): CompanionPresenceState {
  return {
    visiblePhase: "idle",
    basePhase: "idle",
    resumePhase: null,
    activeOverrideRequestId: null,
    speechGraceUntilMs: null,
    transitionCount: 0,
    lastTransition: null,
  };
}

function withVisiblePhase(
  state: CompanionPresenceState,
  visiblePhase: CompanionPresencePhase,
  event: CompanionPresenceEvent,
  patch: Partial<CompanionPresenceState> = {},
): CompanionPresenceState {
  if (state.visiblePhase === visiblePhase) {
    return { ...state, ...patch };
  }
  return {
    ...state,
    ...patch,
    visiblePhase,
    transitionCount: state.transitionCount + 1,
    lastTransition: {
      component: "companion-presence",
      action: event.type,
      result: `${state.visiblePhase}->${visiblePhase}`,
      atMs: event.atMs,
    },
  };
}

function setBasePhase(
  state: CompanionPresenceState,
  basePhase: CompanionPresenceState["basePhase"],
  event: CompanionPresenceEvent,
  patch: Partial<CompanionPresenceState> = {},
): CompanionPresenceState {
  if (state.activeOverrideRequestId !== null) {
    return {
      ...state,
      ...patch,
      basePhase,
      resumePhase: basePhase,
    };
  }
  return withVisiblePhase(state, basePhase, event, {
    ...patch,
    basePhase,
    resumePhase: null,
  });
}

export function reduceCompanionPresence(
  state: CompanionPresenceState,
  event: CompanionPresenceEvent,
): CompanionPresenceState {
  switch (event.type) {
    case "session_listening":
      return setBasePhase(state, "listening", event, {
        speechGraceUntilMs: null,
      });
    case "response_thinking":
      return setBasePhase(state, "thinking", event, {
        speechGraceUntilMs: null,
      });
    case "speech_started":
      return setBasePhase(state, "speaking", event, {
        speechGraceUntilMs: null,
      });
    case "speech_paused":
      if (state.basePhase !== "speaking") return state;
      return {
        ...state,
        speechGraceUntilMs: event.atMs + COMPANION_SPEECH_GRACE_MS,
      };
    case "time_advanced":
      if (
        state.basePhase !== "speaking" ||
        state.speechGraceUntilMs === null ||
        event.atMs < state.speechGraceUntilMs
      ) {
        return state;
      }
      return setBasePhase(state, "listening", event, {
        speechGraceUntilMs: null,
      });
    case "success_reaction":
      return withVisiblePhase(state, "celebrating", event, {
        activeOverrideRequestId: event.requestId,
        resumePhase: state.basePhase,
      });
    case "one_shot_finished":
      if (event.requestId !== state.activeOverrideRequestId) return state;
      return withVisiblePhase(state, state.resumePhase ?? state.basePhase, event, {
        activeOverrideRequestId: null,
        resumePhase: null,
      });
    case "session_ended":
      return setBasePhase(state, "idle", event, {
        activeOverrideRequestId: null,
        resumePhase: null,
        speechGraceUntilMs: null,
      });
  }
}
