import {
  endSession,
  transitionToWork,
  logAttempt,
  logWorksheetAttempt,
  dateTime,
  mathProblem,
  riddleTracker,
  showCanvas,
  blackboard,
  startSession,
  startWordBuilder,
  startSpellCheck,
  launchGame,
  requestPauseForCheckIn,
  requestResumeActivity,
} from "../agents/elli/tools";
import type { SessionType, CanvasOwner } from "./session-context";

export interface SessionTypeConfig {
  tools: Record<string, unknown>;
  canvasOwner: CanvasOwner;
  description: string;
}

/**
 * THE REGISTRY. One entry per session type.
 * Adding a new session type = one object here.
 */
const SESSION_TYPE_REGISTRY: Record<SessionType, SessionTypeConfig> = {
  freeform: {
    tools: {
      endSession,
      dateTime,
      logAttempt,
      startSession,
      transitionToWork,
      mathProblem,
      riddleTracker,
      showCanvas,
      blackboard,
      startWordBuilder,
      startSpellCheck,
      launchGame,
      requestPauseForCheckIn,
      requestResumeActivity,
    },
    canvasOwner: "companion",
    description: "Open session — companion drives canvas and chooses activities",
  },

  worksheet: {
    tools: {
      endSession,
      dateTime,
      logWorksheetAttempt,
      transitionToWork,
      requestPauseForCheckIn,
      requestResumeActivity,
    },
    canvasOwner: "server",
    description: "Homework worksheet — server renders questions, companion grades answers",
  },

  spelling: {
    tools: {
      endSession,
      dateTime,
      logAttempt,
      blackboard,
      transitionToWork,
      startWordBuilder,
      startSpellCheck,
      requestPauseForCheckIn,
      requestResumeActivity,
    },
    canvasOwner: "companion",
    description: "Spelling practice — companion uses blackboard for words",
  },

  wordle: {
    tools: {
      endSession,
      dateTime,
      transitionToWork,
      requestPauseForCheckIn,
      requestResumeActivity,
    },
    canvasOwner: "server",
    description: "Wordle game — server drives the game canvas",
  },

  game: {
    tools: {
      endSession,
      dateTime,
      requestPauseForCheckIn,
      requestResumeActivity,
    },
    canvasOwner: "server",
    description: "Reward game (Space Invaders etc) — server drives iframe",
  },
};

const DEFAULT_SESSION_TYPE: SessionType = "freeform";

export function getSessionTypeConfig(sessionType: SessionType): SessionTypeConfig {
  return SESSION_TYPE_REGISTRY[sessionType] ?? SESSION_TYPE_REGISTRY[DEFAULT_SESSION_TYPE];
}

export function getToolsForSessionType(sessionType: SessionType | string): Record<string, unknown> {
  const config = SESSION_TYPE_REGISTRY[sessionType as SessionType];
  if (!config) return SESSION_TYPE_REGISTRY[DEFAULT_SESSION_TYPE].tools;
  return config.tools;
}

/**
 * Resolve what session type to use based on available inputs.
 * Called at session start. Pure function — no side effects.
 */
export function resolveSessionType(opts: {
  childName: string;
  hasHomeworkManifest: boolean;
  hasSpellingWords: boolean;
  explicitType?: SessionType;
}): SessionType {
  if (opts.explicitType && SESSION_TYPE_REGISTRY[opts.explicitType]) {
    return opts.explicitType;
  }
  if (opts.hasHomeworkManifest) return "worksheet";
  if (opts.hasSpellingWords) return "spelling";
  return "freeform";
}
