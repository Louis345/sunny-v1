import fs from "fs";
import path from "path";
import { stepCountIs, streamText, type ModelMessage, type StopCondition } from "ai";
import { z } from "zod";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
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

type VoiceThinkingOff = { type: "disabled" | "between_tools" };

/**
 * The off switch each voice model accepts (each verified live, 2026-11-26). Reasoning before a spoken
 * reply is silence she sits through: on Saori 22% of turns spent 30+ output tokens that were never spoken
 * and took 1.5-2.1 s to the first word, against 0.76 s. A model not listed here would answer an off switch
 * with a 400 and mute her, so it keeps its own thinking. SUNNY_VOICE_THINKING=on puts Claude's thinking
 * back without a deploy.
 */
function voiceThinkingOff(model: string): VoiceThinkingOff | undefined {
  if (process.env.SUNNY_VOICE_THINKING?.trim().toLowerCase() === "on") return undefined;
  if (/^claude-sonnet-5-5\b/.test(model)) return { type: "between_tools" };
  if (/^claude-(?:sonnet-5|haiku-5-5)(?:-\d{8})?$/.test(model)) return { type: "disabled" };
  console.log(` 🎮 [voice-thinking] [skipped] model=${model} reason=unsupported`);
  return undefined;
}

/** @ai-sdk/anthropic 3.0.58 sends `thinking` only when it is enabled or adaptive, so the off switch goes on the request body itself. */
function voiceModel(modelId: string, thinking: VoiceThinkingOff | undefined) {
  if (!thinking) return anthropic(modelId);
  return createAnthropic({
    fetch: (url, init) => fetch(url, { ...init, body: JSON.stringify({ ...JSON.parse(String(init?.body)), thinking }) }),
  })(modelId);
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

/** Evidence-only tools: they change nothing the child sees or hears, so they never need a reply after them. */
const RECORD_ONLY_TOOLS = new Set(["recordChildSignal", "recordProductIssue", "record_child_signal", "record_product_issue"]);

/**
 * She already spoke and the step only recorded evidence: end the turn instead of paying a
 * second model round trip that could also speak a second reply over the first.
 */
export const spokeThenOnlyRecorded: StopCondition<any> = ({ steps }) => {
  const calls = steps.at(-1)?.toolCalls ?? [];
  if (calls.length === 0 || !calls.every((call) => RECORD_ONLY_TOOLS.has(call.toolName))) return false;
  if (!steps.some((step) => step.text.trim())) return false;
  console.log(` 🎮 [companion] [record-only-step] [turn-ended] tools=${calls.map((call) => call.toolName).join(",")} reason=already_spoke`);
  return true;
};

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
  const thinking = voiceThinkingOff(modelId);

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
    model: voiceModel(modelId, thinking),
    messages: [
      // Cache breakpoint: tools + Elli's long system prompt are reused across turns, and kept for an
      // hour so her first reply after a quiet stretch of play is not a cache miss.
      {
        role: "system",
        content: profile.systemPrompt,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } } },
      },
      ...conversation,
    ],
    maxOutputTokens: 1500,
    maxRetries: 0,
    ...(effort && { providerOptions: { anthropic: { effort } } }),
    tools,
    stopWhen: [stepCountIs(8), spokeThenOnlyRecorded],
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
  const thinkingTokens = ((await result.steps) ?? []).reduce(
    (sum, step) => sum + ((step.usage as { raw?: { output_tokens_details?: { thinking_tokens?: number } } })?.raw?.output_tokens_details?.thinking_tokens ?? 0),
    0,
  );
  console.log(` 🎮 [companion] [thinking] [${thinking ? "off" : "on"}] tokens=${thinkingTokens}`);
  if (finishReason !== "stop" && finishReason !== "tool-calls") {
    throw new Error(`companion_response_incomplete:${finishReason ?? "unknown"}`);
  }

  return fullText;
}
