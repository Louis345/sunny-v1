import {
  getCompanionActivityAliases,
  getCompanionActivityIntentWords,
} from "../../../src/shared/companionActivities/registry";
import type {
  CompanionActivityBanter,
  CompanionActivityGameEvent,
} from "./companionActivities/types";

export type CompanionActivityPhase =
  | "idle"
  | "child_turn"
  | "companion_thinking"
  | "companion_move"
  | "round_complete";

export type CompanionConversationMode = "social" | "repeat_after" | "game" | "visual";

export type CompanionActivityContextLike = {
  activityId?: string;
  status?: string;
};

export type CompanionActivityThinkingCue = {
  emote: "thinking";
  intensity: number;
  durationMs: number;
  timestamp: number;
};

function isRepeatAfterStart(question: string): boolean {
  return /\b(repeat after me|copy me|say what i say|repeat what i say)\b/i.test(question);
}

function isRepeatAfterExit(question: string): boolean {
  return /\b(stop repeating|stop repeat|done repeating|don't repeat|do not repeat)\b/i.test(
    question,
  );
}

function escapeForPattern(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s-]+/g, "[\\s-]?");
}

function buildWordPattern(words: string[]): RegExp {
  const sorted = [...new Set(words.map(escapeForPattern))].sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(${sorted.join("|")})\\b`, "i");
}

// Built from the activity registry so each new game contributes its own words.
let cachedGameReturnPattern: RegExp | undefined;
function gameReturnPattern(): RegExp {
  if (!cachedGameReturnPattern) {
    cachedGameReturnPattern = buildWordPattern([
      "back to the game",
      "back to game",
      ...getCompanionActivityAliases(),
    ]);
  }
  return cachedGameReturnPattern;
}

let cachedGameIntentPattern: RegExp | undefined;
function gameIntentPattern(): RegExp {
  if (!cachedGameIntentPattern) {
    cachedGameIntentPattern = buildWordPattern([
      ...getCompanionActivityIntentWords(),
      "centre",
    ]);
  }
  return cachedGameIntentPattern;
}

function isGameReturn(question: string): boolean {
  return gameReturnPattern().test(question);
}

function hasGameIntent(question: string, activeActivity?: CompanionActivityContextLike | null): boolean {
  if (!activeActivity) return false;
  const active = activeActivity.status !== "complete" && activeActivity.status !== "completed";
  if (isGameReturn(question)) return true;
  if (!active) return false;
  return gameIntentPattern().test(question);
}

export function resolveCompanionConversationMode(input: {
  question: string;
  currentMode: CompanionConversationMode;
  activeActivity?: CompanionActivityContextLike | null;
  forceVisualSnapshot?: boolean;
  visualQuestion?: boolean;
}): CompanionConversationMode {
  const question = input.question.trim();
  if (input.forceVisualSnapshot || input.visualQuestion) return "visual";
  if (isRepeatAfterStart(question)) return "repeat_after";
  if (input.currentMode === "repeat_after") {
    if (isRepeatAfterExit(question)) return "social";
    if (isGameReturn(question)) return "game";
    return "repeat_after";
  }
  if (hasGameIntent(question, input.activeActivity)) return "game";
  return "social";
}

export function selectCompanionActivityContextForTalk<T extends CompanionActivityContextLike>(input: {
  activeActivity?: T | null;
  conversationMode?: CompanionConversationMode;
}): T | undefined {
  if (!input.activeActivity) return undefined;
  return input.conversationMode === "game" ? input.activeActivity : undefined;
}

/**
 * Post-move events stay nonverbal: companion-move speech arrives through the
 * gated move packet instead, so it can never trail the board.
 */
export function shouldRequestCompanionActivityAiReaction(
  event: Pick<CompanionActivityGameEvent, "type">,
): boolean {
  return (
    event.type === "companion_activity_started" ||
    event.type === "companion_activity_reset" ||
    event.type === "companion_activity_round_complete"
  );
}

export function resolveCompanionActivityPhase(
  banter: Pick<CompanionActivityBanter, "phase">,
): CompanionActivityPhase {
  if (banter.phase === "child_move") return "child_turn";
  if (banter.phase === "companion_thinking") return "companion_thinking";
  if (banter.phase === "companion_move") return "companion_move";
  return "round_complete";
}

export function createCompanionActivityThinkingCue(input?: {
  now?: number;
}): CompanionActivityThinkingCue {
  return {
    emote: "thinking",
    intensity: 0.62,
    durationMs: 1200,
    timestamp: input?.now ?? Date.now(),
  };
}
