/**
 * One log line for every Claude call, from any part of Sunny, plus a daily total per part (BUGS.md S25; owner,
 * 2026-11-18, after the Anthropic credit ran out: "what's burning my credits?"). One rule in one place: every request
 * to the Anthropic Messages API goes through fetch, so the reading is taken there and nothing else changes.
 * The part is named from the request itself: its first tool, or the start of its system prompt.
 */
import fs from "node:fs";
import path from "node:path";

type Usage = { input: number; cacheRead: number; cacheWrite: number; output: number };
type DayTotals = Record<string, Usage & { calls: number; model: string }>;

const ANTHROPIC_MESSAGES = /^https:\/\/api\.anthropic\.com\/v1\/messages(\?|$)/;

/** A short, stable name for who made the call, from what it asked. */
export function claudeCallPart(body: unknown): string {
  const request = (body && typeof body === "object" ? body : {}) as { tools?: Array<{ name?: string }>; system?: unknown };
  const tool = request.tools?.find(row => typeof row?.name === "string")?.name;
  if (tool) return `tools:${tool}`;
  const system = typeof request.system === "string" ? request.system
    : Array.isArray(request.system) ? request.system.map(block => (block as { text?: string })?.text ?? "").join(" ") : "";
  const words = system.replace(/[^a-zA-Z ]+/g, " ").trim().split(/\s+/).slice(0, 4).join("-").toLowerCase();
  return words ? `system:${words}` : "unnamed";
}

/** Usage from a JSON response or from a streamed one (message_start carries input, message_delta carries output). */
export function usageFromResponseText(text: string): Usage | null {
  const pick = (row: Record<string, unknown> | undefined): Partial<Usage> => ({
    ...(typeof row?.input_tokens === "number" ? { input: row.input_tokens } : {}),
    ...(typeof row?.cache_read_input_tokens === "number" ? { cacheRead: row.cache_read_input_tokens } : {}),
    ...(typeof row?.cache_creation_input_tokens === "number" ? { cacheWrite: row.cache_creation_input_tokens } : {}),
    ...(typeof row?.output_tokens === "number" ? { output: row.output_tokens } : {}),
  });
  let usage: Partial<Usage> = {};
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) {
    try { usage = pick((JSON.parse(trimmed) as { usage?: Record<string, unknown> }).usage); } catch { return null; }
  } else {
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const event = JSON.parse(line.slice(5)) as { message?: { usage?: Record<string, unknown> }; usage?: Record<string, unknown> };
        usage = { ...usage, ...pick(event.message?.usage), ...pick(event.usage) };
      } catch { /* a partial line is skipped */ }
    }
  }
  if (!Object.keys(usage).length) return null;
  return { input: usage.input ?? 0, cacheRead: usage.cacheRead ?? 0, cacheWrite: usage.cacheWrite ?? 0, output: usage.output ?? 0 };
}

export function recordClaudeUsage(input: { part: string; model: string; usage: Usage; logDir: string; now?: Date }): void {
  const { part, model, usage } = input;
  console.log(` 🎮 [claude-usage] [call] part=${part} model=${model} input=${usage.input} cache_read=${usage.cacheRead} cache_write=${usage.cacheWrite} output=${usage.output}`);
  const file = path.join(input.logDir, `${(input.now ?? new Date()).toISOString().slice(0, 10)}.json`);
  let totals: DayTotals = {};
  try { totals = JSON.parse(fs.readFileSync(file, "utf8")) as DayTotals; } catch { totals = {}; }
  const key = `${part} ${model}`;
  const row = totals[key] ?? { calls: 0, model, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  totals[key] = { calls: row.calls + 1, model, input: row.input + usage.input, cacheRead: row.cacheRead + usage.cacheRead,
    cacheWrite: row.cacheWrite + usage.cacheWrite, output: row.output + usage.output };
  fs.mkdirSync(input.logDir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(totals, null, 2)}\n`);
}

/** Counts a Claude call on any fetch (global or the SDK's node-fetch); the caller's response is untouched. */
function countingFetch<F extends (...args: any[]) => Promise<any>>(original: F, logDir: string): F {
  return (async (resource: any, init?: any) => {
    const response = await original(resource, init);
    const url = typeof resource === "string" ? resource : resource?.href ?? resource?.url ?? "";
    if (!ANTHROPIC_MESSAGES.test(url) || !response?.ok || typeof response.clone !== "function") return response;
    let body: unknown;
    try { body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined; } catch { body = undefined; }
    const model = (body as { model?: string } | undefined)?.model ?? "unknown";
    response.clone().text()
      .then((text: string) => { const usage = usageFromResponseText(text); if (usage) recordClaudeUsage({ part: claudeCallPart(body), model, usage, logDir }); })
      .catch((error: unknown) => console.warn(` 🎮 [claude-usage] [unreadable] reason=${error instanceof Error ? error.message : String(error)}`));
    return response;
  }) as F;
}

/** Installs the count once: on global fetch (the AI SDK behind Elli) and on the Anthropic SDK's own fetch. */
export function installClaudeUsageLog(logDir = path.join(process.cwd(), "logs", "claude-usage")): void {
  const marker = globalThis as { __sunnyClaudeUsage?: true };
  if (marker.__sunnyClaudeUsage) return;
  marker.__sunnyClaudeUsage = true;
  if (typeof globalThis.fetch === "function") globalThis.fetch = countingFetch(globalThis.fetch.bind(globalThis), logDir);
  try {
    // SDK 0.39 picks node-fetch through its shim registry; clients made after this read the counted one.
    require("@anthropic-ai/sdk/_shims/index");
    const registry = require("@anthropic-ai/sdk/_shims/registry") as { fetch?: (...args: any[]) => Promise<any> };
    if (typeof registry.fetch === "function") registry.fetch = countingFetch(registry.fetch, logDir);
  } catch (error) {
    console.warn(` 🎮 [claude-usage] [sdk-not-counted] reason=${error instanceof Error ? error.message : String(error)}`);
  }
  console.log(" 🎮 [claude-usage] [installed] every Claude call logs its tokens");
}
