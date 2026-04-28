import { stepCountIs, streamText, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { Profile } from "../../profiles";
import { ALL_TOOLS } from "./tools/generateToolDocs";

export interface RunAgentOptions {
  history: ModelMessage[];
  userMessage: string;
  profile: Profile;
  onToken: (chunk: string) => void;
  signal?: AbortSignal;
  onStepFinish?: (
    step: { finishReason: string; toolCalls?: unknown[]; toolResults?: unknown[] },
  ) => void | Promise<void>;
  /**
   * LLM step begins (before the provider is called). Pair with
   * `experimentalOnToolCallStart` to reset "first tool in step" emote state.
   */
  experimentalOnStepStart?: (event: unknown) => void | Promise<void>;
  /**
   * A tool’s `execute` is about to run. Use to show thinking before work, not after
   * `onStepFinish` (which runs after tools complete).
   */
  experimentalOnToolCallStart?: (event: unknown) => void | Promise<void>;
  quiet?: boolean;
  /** When true, append instruction to redirect to learning (called after 3 turns) */
  transitionToWorkPhase?: boolean;
  allowTransitionToWork?: boolean;
  /** Dynamic tool set — if not provided, falls back to buildAgentTools (ALL_TOOLS) */
  tools?: Record<string, any>;
  /**
   * Inserted in `streamText` immediately before the current user turn (e.g. pending
   * `game_state_update` summary as user + assistant lines). Not part of rolling history.
   */
  injectedContextMessages?: ModelMessage[];
}

export function buildAgentTools(_opts: { allowTransitionToWork?: boolean } = {}) {
  return { ...ALL_TOOLS };
}

export async function runAgent(opts: RunAgentOptions): Promise<string> {
  const {
    history,
    userMessage,
    profile,
    onToken,
    signal,
    onStepFinish,
    experimentalOnStepStart,
    experimentalOnToolCallStart,
    quiet,
    transitionToWorkPhase,
    allowTransitionToWork,
  } = opts;
  const injected = opts.injectedContextMessages?.filter(
    (m) =>
      typeof m.content !== "string" || m.content.trim().length > 0,
  ) ?? [];

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
      ...injected,
      { role: "user", content: userMessage }
    ],
    maxOutputTokens: 500,
    tools: opts.tools ?? buildAgentTools({ allowTransitionToWork }),
    stopWhen: stepCountIs(8),
    abortSignal: signal,
    experimental_onStepStart: experimentalOnStepStart,
    experimental_onToolCallStart: experimentalOnToolCallStart,
    onStepFinish: async (step) => {
      if (onStepFinish) {
        await onStepFinish(step);
      }
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

  // Use fullStream to ensure text deltas reach onToken even when tools/stopWhen
  // cause textStream to skip chunks on plain-text-only turns
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      const p = part as { textDelta?: string; text?: string };
      const text = p.textDelta ?? p.text ?? "";
      if (text) {
        fullText += text;
        onToken(text);
      }
    }
  }

  return fullText;
}
