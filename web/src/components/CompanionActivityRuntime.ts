import type { CompanionCommand } from "../../../src/shared/companions/companionContract";
import { COMPANION_CAPABILITIES } from "../../../src/shared/companions/registry";
import { validateCompanionCommand } from "../../../src/shared/companions/validateCompanionCommand";
import type {
  CompanionTicTacToeBanter,
  CompanionTicTacToeGameEvent,
} from "./CompanionTicTacToe";

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

let thinkingCommandSequence = 0;

function isRepeatAfterStart(question: string): boolean {
  return /\b(repeat after me|copy me|say what i say|repeat what i say)\b/i.test(question);
}

function isRepeatAfterExit(question: string): boolean {
  return /\b(stop repeating|stop repeat|done repeating|don't repeat|do not repeat)\b/i.test(
    question,
  );
}

function isGameReturn(question: string): boolean {
  return /\b(back to (the )?game|let'?s play tic[- ]?tac[- ]?toe|tic[- ]?tac[- ]?toe)\b/i.test(
    question,
  );
}

function hasGameIntent(question: string, activeActivity?: CompanionActivityContextLike | null): boolean {
  if (!activeActivity) return false;
  const active = activeActivity.status !== "complete" && activeActivity.status !== "completed";
  if (isGameReturn(question)) return true;
  if (!active) return false;
  return /\b(square|move|turn|board|three in a row|win|block|corner|center|centre)\b/i.test(
    question,
  );
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

export function shouldRequestCompanionActivityAiReaction(
  event: CompanionTicTacToeGameEvent,
): boolean {
  return (
    event.type === "companion_tic_tac_toe_started" ||
    event.type === "companion_tic_tac_toe_reset" ||
    event.type === "companion_tic_tac_toe_round_complete"
  );
}

export function resolveCompanionActivityPhase(
  banter: Pick<CompanionTicTacToeBanter, "phase">,
): CompanionActivityPhase {
  if (banter.phase === "child_move") return "child_turn";
  if (banter.phase === "companion_thinking") return "companion_thinking";
  if (banter.phase === "companion_move") return "companion_move";
  return "round_complete";
}

export function createCompanionActivityThinkingCommand(input: {
  childId: string;
  now?: number;
}): CompanionCommand {
  const command = validateCompanionCommand(
    {
      type: "animate",
      payload: {
        animation: "think",
        loop: false,
      },
    },
    COMPANION_CAPABILITIES,
    {
      childId: input.childId,
      source: "diag",
      now: input.now,
    },
  );
  if (!command) {
    throw new Error("invalid_companion_activity_thinking_command");
  }
  return {
    ...command,
    timestamp: command.timestamp * 1000 + thinkingCommandSequence++,
  };
}
