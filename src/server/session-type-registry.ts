import type { SessionType, CanvasOwner } from "./session-context";

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
  if (opts.explicitType && SESSION_TYPE_REGISTRY[opts.explicitType]) {
    return opts.explicitType;
  }
  if (opts.hasHomeworkManifest) return "worksheet";
  if (opts.hasSpellingWords) return "spelling";
  return "freeform";
}
