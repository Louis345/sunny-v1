import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const streamText = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ streamText, stepCountIs: vi.fn(() => "eight-steps") }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn(() => "claude") }));
vi.mock("../agents/elli/tools/generateToolDocs", () => ({ ALL_TOOLS: {} }));

import { runAgent } from "../agents/elli/run";

function stream(text: string, providerMetadata?: Record<string, unknown>) {
  return {
    finishReason: Promise.resolve("stop"),
    providerMetadata: Promise.resolve(providerMetadata),
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
  beforeEach(() => streamText.mockReset());
  afterEach(() => vi.unstubAllEnvs());

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
});
