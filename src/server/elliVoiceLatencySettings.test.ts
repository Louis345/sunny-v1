import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const streamText = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ streamText, stepCountIs: vi.fn(() => "eight-steps") }));
const createAnthropic = vi.hoisted(() => vi.fn((_options?: { fetch?: typeof fetch }) => vi.fn(() => "claude")));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn(() => "claude"), createAnthropic }));
vi.mock("../agents/elli/tools/generateToolDocs", () => ({ ALL_TOOLS: {} }));

import { runAgent } from "../agents/elli/run";

function stream(text: string, providerMetadata?: Record<string, unknown>, steps?: unknown[]) {
  return {
    finishReason: Promise.resolve("stop"),
    providerMetadata: Promise.resolve(providerMetadata),
    steps: Promise.resolve(steps),
    fullStream: (async function* () {
      yield { type: "text-delta", text };
    })(),
  };
}

async function speak(): Promise<Record<string, any>> {
  streamText.mockReturnValueOnce(stream("Hey Ila!"));
  await runAgent({
    history: [],
    userMessage: "Hey, Ellie.",
    profile: { systemPrompt: "You are Elli, Ila's tutor." } as never,
    onToken: vi.fn(),
    quiet: true,
  });
  return streamText.mock.calls[0][0];
}

describe("Elli voice latency settings", () => {
  beforeEach(() => {
    streamText.mockReset();
    createAnthropic.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("asks Claude for low effort by default so a greeting is not preceded by deep reasoning", async () => {
    // Human catch (Ila, 2026-10-20): ~3s before Elli's first word on "Hey, Ellie".
    const options = await speak();
    expect(options.providerOptions?.anthropic?.effort).toBe("low");
  });

  it("lets SUNNY_VOICE_EFFORT raise effort without a code change", async () => {
    vi.stubEnv("SUNNY_VOICE_EFFORT", "medium");
    const options = await speak();
    expect(options.providerOptions.anthropic.effort).toBe("medium");
  });

  it("does not send effort to a voice model that does not support it", async () => {
    // Review catch: an older SUNNY_VOICE_MODEL would 400 on every turn.
    vi.stubEnv("SUNNY_VOICE_MODEL", "claude-haiku-4-5");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const options = await speak();
    expect(options.providerOptions?.anthropic?.effort).toBeUndefined();
    expect(log.mock.calls.map((c) => String(c[0]))).toContain(
      " 🎮 [voice-effort] [skipped] model=claude-haiku-4-5 reason=unsupported",
    );
    log.mockRestore();
  });

  it.each(["claude-sonnet-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-opus-4-8", "claude-sonnet-4-6"])(
    "sends effort for %s",
    async (model) => {
      vi.stubEnv("SUNNY_VOICE_MODEL", model);
      const options = await speak();
      expect(options.providerOptions.anthropic.effort).toBe("low");
    },
  );

  it("falls back to low effort and says so when SUNNY_VOICE_EFFORT is invalid", async () => {
    vi.stubEnv("SUNNY_VOICE_EFFORT", "turbo");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const options = await speak();
    expect(options.providerOptions.anthropic.effort).toBe("low");
    expect(String(warn.mock.calls[0]?.[0])).toContain("[voice-effort] [invalid]");
    warn.mockRestore();
  });

  /** The body Anthropic would receive, after the voice turn's own fetch has run. */
  async function sentBody(): Promise<Record<string, unknown>> {
    const network = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response("{}"));
    vi.stubGlobal("fetch", network);
    const voiceFetch = createAnthropic.mock.calls[0]?.[0]?.fetch;
    await voiceFetch?.("https://api.anthropic.com/v1/messages", {
      method: "POST",
      body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1500, output_config: { effort: "low" } }),
    });
    return JSON.parse(String(network.mock.calls[0]?.[1]?.body ?? "{}"));
  }

  it("turns Claude's thinking off for a spoken turn so her first word is not held behind reasoning", async () => {
    // Saori, 2026-11-11..25 (575 child turns): 22% of replies carried 30+ unspoken output tokens and took
    // 1.5-2.1 s to the first word, against 0.76 s for the rest. Logs showed the slow first word but not
    // why, because thinking tokens were never logged. The SDK (3.0.58) drops `thinking: disabled` from
    // the request, so the setting has to be proven on the body that is actually sent.
    await speak();
    expect(await sentBody()).toEqual({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      output_config: { effort: "low" },
      thinking: { type: "disabled" },
    });
  });

  it("lets SUNNY_VOICE_THINKING=on put Claude's own thinking back without a deploy", async () => {
    vi.stubEnv("SUNNY_VOICE_THINKING", "on");
    await speak();
    expect(createAnthropic).not.toHaveBeenCalled();
  });

  it.each([
    ["claude-sonnet-5", { type: "disabled" }],
    ["claude-haiku-5-5", { type: "disabled" }],
    // Verified live 2026-11-26: Sonnet 5.5 answers `disabled` with a 400 and names this value instead.
    ["claude-sonnet-5-5", { type: "between_tools" }],
  ])("sends %s the off switch it accepts", async (model, thinking) => {
    vi.stubEnv("SUNNY_VOICE_MODEL", model);
    await speak();
    expect((await sentBody()).thinking).toEqual(thinking);
  });

  it.each(["claude-opus-5-5", "claude-haiku-4-5", "claude-opus-4-8"])(
    "leaves thinking alone for %s, which would 400 on an off switch and mute her",
    async (model) => {
      vi.stubEnv("SUNNY_VOICE_MODEL", model);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      await speak();
      expect(createAnthropic).not.toHaveBeenCalled();
      expect(log.mock.calls.map((c) => String(c[0]))).toContain(
        ` 🎮 [voice-thinking] [skipped] model=${model} reason=unsupported`,
      );
      log.mockRestore();
    },
  );

  it("logs the thinking tokens each spoken turn spent, so a slow first word can be explained", async () => {
    vi.stubEnv("SUNNY_VOICE_THINKING", "on");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    streamText.mockReturnValueOnce(
      // Shape verified live 2026-11-26: Anthropic reports usage.output_tokens_details.thinking_tokens,
      // which the AI SDK passes through as usage.raw on each step.
      stream("Hey Ila!", undefined, [
        { usage: { raw: { output_tokens_details: { thinking_tokens: 57 } } } },
        { usage: { raw: { output_tokens_details: { thinking_tokens: 4 } } } },
      ]),
    );
    await runAgent({
      history: [],
      userMessage: "Hey, Ellie.",
      profile: { systemPrompt: "You are Elli." } as never,
      onToken: vi.fn(),
      quiet: true,
    });
    expect(log.mock.calls.map((c) => String(c[0]))).toContain(" 🎮 [companion] [thinking] [on] tokens=61");
    log.mockRestore();
  });

  it("logs zero thinking tokens when thinking is off, which is the proof the switch reached Claude", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    streamText.mockReturnValueOnce(
      stream("Hey Ila!", undefined, [{ usage: { raw: { output_tokens_details: { thinking_tokens: 0 } } } }]),
    );
    await runAgent({
      history: [],
      userMessage: "Hey, Ellie.",
      profile: { systemPrompt: "You are Elli." } as never,
      onToken: vi.fn(),
      quiet: true,
    });
    expect(log.mock.calls.map((c) => String(c[0]))).toContain(" 🎮 [companion] [thinking] [off] tokens=0");
    log.mockRestore();
  });
});
