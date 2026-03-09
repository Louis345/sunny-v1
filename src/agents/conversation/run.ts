import { stepCountIs, streamText, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { Profile } from "../../profiles";
import { dateTime, logAttempt } from "./tools";

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
      "\n\n[System: Transition to work phase. The child has had 3+ turns of banter. Redirect naturally to learning activities — e.g. 'Oh I just thought of a fun game — want to try it?']"
    : profile.systemPrompt;

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: systemPrompt,
    messages: [...history, { role: "user", content: userMessage }],
    maxOutputTokens: 500,
    tools: {
      dateTime,
      logAttempt,
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
