import { stepCountIs, streamText, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { Profile } from "../../profiles";
import {
  dateTime,
  logAttempt,
  startSession,
  transitionToWork,
  mathProblem,
  riddleTracker,
  showCanvas,
} from "./tools";

export interface RunAgentOptions {
  history: ModelMessage[];
  userMessage: string;
  profile: Profile;
  onToken: (chunk: string) => void;
  signal?: AbortSignal;
  onStepFinish?: (step: { finishReason: string; toolCalls?: unknown[]; toolResults?: unknown[] }) => void;
  quiet?: boolean;
  /** When true, append instruction to redirect to learning (called after 3 turns) */
  transitionToWorkPhase?: boolean;
}

export async function runAgent(opts: RunAgentOptions): Promise<string> {
  const { history, userMessage, profile, onToken, signal, onStepFinish, quiet, transitionToWorkPhase } = opts;

  let fullText = "";
  const systemPrompt = transitionToWorkPhase
    ? profile.systemPrompt +
      "\n\n[System: Turn 5 — transition to work. Say exactly ONE of these (pick one): 'Okay, two more minutes of fun and then we do our words — deal?' OR 'Alright, one more round and then it's word time!' OR 'You know what, let's do one quick word game and then get to our /i/ words.']"
    : profile.systemPrompt;

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: systemPrompt,
    messages: [
      ...history.filter(m => typeof m.content !== "string" || m.content.trim().length > 0),
      { role: "user", content: userMessage }
    ],
    maxOutputTokens: 500,
    tools: {
      dateTime,
      logAttempt,
      startSession,
      transitionToWork,
      mathProblem,
      riddleTracker,
      showCanvas,
    },
    stopWhen: stepCountIs(5),
    abortSignal: signal,
    onStepFinish: (step) => {
      onStepFinish?.(step);
      if (!quiet) {
        console.log(
          "  🔧 Step finished:",
          step.finishReason,
          step.toolCalls?.length ?? 0,
          "tool calls",
        );
        if (step.toolResults) {
          console.log("  🔧 Tool results:", JSON.stringify(step.toolResults));
        }
      }
    },
  });

  for await (const chunk of result.textStream) {
    fullText += chunk;
    onToken(chunk);
  }

  return fullText;
}
