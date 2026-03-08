import { stepCountIs, streamText, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { Profile } from "../profiles";
import {
  dateTime,
  startSession,
  transitionToWork,
  logAttempt,
  saveSessionSummary,
} from "./tools";

export interface RunAgentOptions {
  history: ModelMessage[];
  userMessage: string;
  profile: Profile;
  onToken: (chunk: string) => void;
  signal?: AbortSignal;
}

export async function runAgent(opts: RunAgentOptions): Promise<string> {
  const { history, userMessage, profile, onToken, signal } = opts;

  let fullText = "";

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: profile.systemPrompt,
    messages: [...history, { role: "user", content: userMessage }],
    maxOutputTokens: 500,
    tools: {
      dateTime,
      startSession,
      transitionToWork,
      logAttempt,
      saveSessionSummary,
    },
    stopWhen: stepCountIs(5),
    abortSignal: signal,
    onStepFinish: (step) => {
      console.log(
        "  🔧 Step finished:",
        step.finishReason,
        step.toolCalls?.length ?? 0,
        "tool calls",
      );
      if (step.toolResults) {
        console.log("  🔧 Tool results:", JSON.stringify(step.toolResults));
      }
    },
  });

  for await (const chunk of result.textStream) {
    fullText += chunk;
    onToken(chunk);
  }

  return fullText;
}
