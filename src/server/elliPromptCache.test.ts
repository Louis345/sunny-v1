import { beforeEach, describe, expect, it, vi } from "vitest";

const streamText = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ streamText, stepCountIs: vi.fn(() => "eight-steps") }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn(() => "claude") }));
vi.mock("../agents/elli/tools/generateToolDocs", () => ({ ALL_TOOLS: {} }));

import { runAgent } from "../agents/elli/run";

function stream(text: string, usage?: Record<string, unknown>) {
  return {
    finishReason: Promise.resolve("stop"),
    usage: Promise.resolve(usage),
    fullStream: (async function* () {
      yield { type: "text-delta", text };
    })(),
  };
}

describe("Elli prompt caching", () => {
  beforeEach(() => streamText.mockReset());

  it("marks Elli's system prompt cacheable so Claude reuses it across turns", async () => {
    // Elli's persona, chart, and plan are resent every turn; without a cache
    // breakpoint Claude re-reads all of it before her first word.
    streamText.mockReturnValueOnce(stream("Hey Ila!"));
    await runAgent({
      history: [],
      userMessage: "Hey, Ellie.",
      profile: { systemPrompt: "You are Elli, Ila's tutor." } as never,
      onToken: vi.fn(),
      quiet: true,
    });
    const options = streamText.mock.calls[0][0];
    expect(options.system).toBeUndefined();
    expect(options.messages[0]).toEqual({
      role: "system",
      content: "You are Elli, Ila's tutor.",
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    });
    expect(options.messages.at(-1)).toEqual({ role: "user", content: "Hey, Ellie." });
  });

  it("logs prompt-cache reads so the session log proves the cache is working", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    streamText.mockReturnValueOnce(
      // Shape verified live 2026-10-20: AI SDK v6 reports cache use on usage.inputTokenDetails.
      stream("Hey Ila!", { inputTokenDetails: { noCacheTokens: 11, cacheReadTokens: 5120, cacheWriteTokens: 0 } }),
    );
    await runAgent({
      history: [],
      userMessage: "Hey, Ellie.",
      profile: { systemPrompt: "You are Elli." } as never,
      onToken: vi.fn(),
      quiet: true,
    });
    expect(log.mock.calls.map((c) => String(c[0]))).toContain(
      " 🎮 [companion] [prompt-cache] read=5120 created=0",
    );
    log.mockRestore();
  });
});
