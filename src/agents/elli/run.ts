import fs from "fs";
import path from "path";
import { stepCountIs, streamText, type ModelMessage } from "ai";
import { z } from "zod";
import { anthropic } from "@ai-sdk/anthropic";
import type { Profile } from "../../profiles";
import { ALL_TOOLS } from "./tools/generateToolDocs";

export interface RunAgentOptions {
  history: ModelMessage[];
  userMessage: string;
  source?: "user" | "system";
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
  allowTransitionToWork?: boolean;
  /** Dynamic tool set — if not provided, falls back to buildAgentTools (ALL_TOOLS) */
  tools?: Record<string, any>;
  /**
   * Inserted in `streamText` immediately before the current user turn (e.g. pending
   * `game_state_update` summary as user + assistant lines). Not part of rolling history.
   */
  injectedContextMessages?: ModelMessage[];
}

const VOICE_EFFORTS = ["low", "medium", "high", "max"] as const;
type VoiceEffort = (typeof VOICE_EFFORTS)[number];

/**
 * Claude reasoning effort for Elli's spoken turns. Live conversation does well
 * at low effort, and higher effort adds reasoning before her first word.
 * Override with SUNNY_VOICE_EFFORT if tutoring quality needs more.
 */
function voiceEffort(): VoiceEffort {
  const raw = process.env.SUNNY_VOICE_EFFORT?.trim().toLowerCase();
  if (!raw) return "low";
  if ((VOICE_EFFORTS as readonly string[]).includes(raw)) return raw as VoiceEffort;
  console.warn(` 🎮 [voice-effort] [invalid] value=${raw} using=low`);
  return "low";
}

/** Claude models that accept `effort` (Opus 4.5+, Sonnet 4.6, and the 5.x family). */
function supportsEffort(model: string): boolean {
  return /^claude-(?:(?:fable|mythos|opus|sonnet|haiku)-[5-9]|opus-4-[5-9]|sonnet-4-6)/.test(model);
}

let capturedRequests = 0;
/**
 * Diagnostic: with SUNNY_CAPTURE_COMPANION_REQUEST=<dir>, write the exact request Elli is about to receive
 * (system prompt, messages, tool descriptions and schemas; before SDK tool steps) so her behavior can be traced to its sources, not guessed.
 */
function captureCompanionRequest(request: { model: string; system: string; messages: ModelMessage[]; tools: Record<string, unknown> }): void {
  const dir = process.env.SUNNY_CAPTURE_COMPANION_REQUEST?.trim();
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${process.pid}-${++capturedRequests}.json`);
    const tools = Object.entries(request.tools).map(([name, tool]: [string, any]) => ({ name, description: tool.description ?? "",
      inputSchema: tool.inputSchema?._zod ? z.toJSONSchema(tool.inputSchema, { unrepresentable: "any" }) : tool.inputSchema }));
    fs.writeFileSync(file, JSON.stringify({ capturedAt: new Date().toISOString(), model: request.model, system: request.system, messages: request.messages, tools, scope: "initial_assembled_request" }, null, 2), { mode: 0o600 });
    console.log(` 🎮 [companion] [request-capture] [saved] file=${file}`);
  } catch (error) {
    console.warn(` 🎮 [companion] [request-capture] [failed] ${error instanceof Error ? error.message : String(error)}`);
  }
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
    allowTransitionToWork,
  } = opts;
  const injected = opts.injectedContextMessages?.filter(
    (m) =>
      typeof m.content !== "string" || m.content.trim().length > 0,
  ) ?? [];

  let fullText = "";
  const modelId = process.env.SUNNY_VOICE_MODEL ?? "claude-sonnet-5";
  const effort = supportsEffort(modelId) ? voiceEffort() : undefined;
  if (!effort) console.log(` 🎮 [voice-effort] [skipped] model=${modelId} reason=unsupported`);

  const conversation: ModelMessage[] = [
    ...history.filter(m => typeof m.content !== "string" || m.content.trim().length > 0),
    ...injected,
    { role: opts.source ?? "user", content: userMessage },
  ].map((message): ModelMessage => message.role === "system"
    ? { role: "user", content: `[Runtime context — not child speech]\n${message.content}` }
    : message);
  const tools = opts.tools ?? buildAgentTools({ allowTransitionToWork });
  captureCompanionRequest({ model: modelId, system: profile.systemPrompt, messages: conversation, tools });
  const result = streamText({
    model: anthropic(modelId),
    messages: [
      // Cache breakpoint: tools + Elli's long system prompt are reused across turns.
      {
        role: "system",
        content: profile.systemPrompt,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      ...conversation,
    ],
    maxOutputTokens: 1500,
    maxRetries: 0,
    ...(effort && { providerOptions: { anthropic: { effort } } }),
    tools,
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
  // cause textStream to skip chunks on plain-text-only turns.
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
  const finishReason = await result.finishReason;
  const cache = (await result.usage)?.inputTokenDetails;
  if (cache) {
    console.log(
      ` 🎮 [companion] [prompt-cache] read=${cache.cacheReadTokens ?? 0} created=${cache.cacheWriteTokens ?? 0}`,
    );
  }
  if (finishReason !== "stop" && finishReason !== "tool-calls") {
    throw new Error(`companion_response_incomplete:${finishReason ?? "unknown"}`);
  }

  return fullText;
}
