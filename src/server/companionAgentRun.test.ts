import { beforeEach, describe, expect, it, vi } from "vitest";

const streamText = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ streamText, stepCountIs: vi.fn(() => "eight-steps") }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn(() => "claude") }));
vi.mock("../agents/elli/tools/generateToolDocs", () => ({ ALL_TOOLS: {} }));

import { runAgent } from "../agents/elli/run";

function stream(parts: Array<{ type: string; text?: string }>, finishReason: string) {
  return {
    finishReason: Promise.resolve(finishReason),
    fullStream: (async function* () { for (const part of parts) yield part; })(),
  };
}

describe("Elli's spoken turn", () => {
  beforeEach(() => streamText.mockReset());

  it("retries one empty length-limited turn so the child receives actual speech", async () => {
    // Human catch: Ila asked why Sunny was silent. The log showed an accepted
    // turn ending at `length` with no text or tools; earlier labs only tested
    // routing and TTS, never a zero-text model result at the output limit.
    streamText
      .mockReturnValueOnce(stream([], "length"))
      .mockReturnValueOnce(stream([{ type: "text-delta", text: "I'm here." }], "stop"));
    const onToken = vi.fn();

    const answer = await runAgent({ history: [], userMessage: "Sunny, can you hear me?",
      profile: { systemPrompt: "Speak to Ila." } as never, onToken, quiet: true });

    expect(answer).toBe("I'm here.");
    expect(onToken).toHaveBeenCalledExactlyOnceWith("I'm here.");
    expect(streamText).toHaveBeenCalledTimes(2);
    expect(streamText.mock.calls[1][0].maxOutputTokens).toBeGreaterThan(streamText.mock.calls[0][0].maxOutputTokens);
  });

  it("stops after one retry if the provider produces no text twice", async () => {
    streamText.mockReturnValue(stream([], "length"));

    const answer = await runAgent({ history: [], userMessage: "Sunny?",
      profile: { systemPrompt: "Speak to Ila." } as never, onToken: vi.fn(), quiet: true });

    expect(answer).toBe("");
    expect(streamText).toHaveBeenCalledTimes(2);
  });

  it("does not repeat a normal spoken answer", async () => {
    streamText.mockReturnValueOnce(stream([{ type: "text-delta", text: "Let's work together." }], "stop"));

    const answer = await runAgent({ history: [], userMessage: "Sunny?",
      profile: { systemPrompt: "Speak to Ila." } as never, onToken: vi.fn(), quiet: true });

    expect(answer).toBe("Let's work together.");
    expect(streamText).toHaveBeenCalledOnce();
  });

  it("does not retry an empty turn after a tool has already run", async () => {
    streamText.mockImplementationOnce((options: { onStepFinish: (step: unknown) => Promise<void> }) => {
      void options.onStepFinish({ finishReason: "length", toolCalls: [{ toolName: "recordChildSignal" }] });
      return stream([], "length");
    });

    await runAgent({ history: [], userMessage: "Sunny?",
      profile: { systemPrompt: "Speak to Ila." } as never, onToken: vi.fn(), quiet: true });

    expect(streamText).toHaveBeenCalledOnce();
  });
});
