import type { SessionType, CanvasOwner } from "./session-context";
import type { SessionSubject } from "../agents/prompts";

export interface SessionTypeConfig {
  /** Placeholder map so `Object.keys` yields allowed tool names; real tools come from SessionManager. */
  tools: Record<string, unknown>;
  canvasOwner: CanvasOwner;
  description: string;
}

/** Tool names aligned with `generateToolDocs` / SessionManager.buildAgentToolkit. */
export const CANONICAL_AGENT_TOOL_KEYS = [
  "canvasShow",
  "canvasClear",
  "canvasStatus",
  "sessionLog",
  "sessionStatus",
  "sessionEnd",
  "expressCompanion",
  "companionAct",
  "launchGame",
  "dateTime",
] as const;

function placeholderTools(): Record<string, unknown> {
  return Object.fromEntries(CANONICAL_AGENT_TOOL_KEYS.map((k) => [k, {}]));
}

const SESSION_TYPE_REGISTRY: Record<SessionType, SessionTypeConfig> = {
  freeform: {
    tools: placeholderTools(),
    canvasOwner: "companion",
    description: "Open session — Claude drives canvas via six tools",
  },

  worksheet: {
    tools: placeholderTools(),
    canvasOwner: "server",
    description: "Homework worksheet — Claude drives presentation via canvasShow",
  },

  spelling: {
    tools: placeholderTools(),
    canvasOwner: "companion",
    description: "Spelling practice",
  },

  wordle: {
    tools: placeholderTools(),
    canvasOwner: "server",
    description: "Wordle game",
  },

  game: {
    tools: placeholderTools(),
    canvasOwner: "server",
    description: "Reward game",
  },

  reading: {
    tools: placeholderTools(),
    canvasOwner: "companion",
    description: "Reading / karaoke session",
  },

  clocks: {
    tools: placeholderTools(),
    canvasOwner: "companion",
    description: "Clock / time-telling session",
  },

  math: {
    tools: placeholderTools(),
    canvasOwner: "companion",
    description: "Math session",
  },

  homework: {
    tools: placeholderTools(),
    canvasOwner: "companion",
    description: "Homework-aligned session (folder + care plan)",
  },

  pronunciation: {
    tools: placeholderTools(),
    canvasOwner: "companion",
    description: "Pronunciation calibration session",
  },

  wilson: {
    tools: placeholderTools(),
    canvasOwner: "companion",
    description: "Wilson phonics session",
  },

  diag: {
    tools: placeholderTools(),
    canvasOwner: "companion",
    description: "Diagnostics / demo for the creator (manifest-driven canvas)",
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

export function resolveSessionType(opts: {
  childName: string;
  hasHomeworkManifest: boolean;
  hasSpellingWords: boolean;
  explicitType?: SessionType;
}): SessionType {
  if (opts.explicitType === "diag") return "diag";
  if (opts.hasHomeworkManifest) return "worksheet";
  if (opts.explicitType && SESSION_TYPE_REGISTRY[opts.explicitType]) {
    return opts.explicitType;
  }
  if (opts.hasSpellingWords) return "spelling";
  return "freeform";
}

/** Maps SUNNY_SUBJECT (after normalize) to a concrete session type when not driven by spelling word list. */
export function sessionTypeFromSubject(subject: SessionSubject): SessionType | undefined {
  switch (subject) {
    case "clocks":
    case "reading":
    case "math":
    case "homework":
    case "pronunciation":
    case "wilson":
    case "diag":
      return subject;
    case "free":
    case "reversal":
    case "history":
      return "freeform";
    case "spelling":
    default:
      return undefined;
  }
}
