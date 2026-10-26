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

  it("reports an empty length-limited turn without purchasing another response", async () => {
    // Human catch: Ila asked why Sunny was silent. The log showed an accepted
    // turn ending at `length` with no text or tools; earlier labs only tested
    // routing and TTS, never a zero-text model result at the output limit.
    streamText
      .mockReturnValueOnce(stream([], "length"))
      .mockReturnValueOnce(stream([{ type: "text-delta", text: "I'm here." }], "stop"));
    const onToken = vi.fn();

    await expect(runAgent({ history: [], userMessage: "Sunny, can you hear me?",
      profile: { systemPrompt: "Speak to the demo." } as never, onToken, quiet: true })).rejects.toThrow("companion_response_incomplete:length");
    expect(onToken).not.toHaveBeenCalled();
    expect(streamText).toHaveBeenCalledOnce();
    expect(streamText.mock.calls[0][0].maxRetries).toBe(0);
  });

  it("accepts successful quiet without a second provider request", async () => {
    streamText.mockReturnValue(stream([], "stop"));

    const answer = await runAgent({ history: [], userMessage: "Sunny?",
      profile: { systemPrompt: "Speak to Ila." } as never, onToken: vi.fn(), quiet: true });

    expect(answer).toBe("");
    expect(streamText).toHaveBeenCalledOnce();
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

    await expect(runAgent({ history: [], userMessage: "Sunny?",
      profile: { systemPrompt: "Speak to the demo." } as never, onToken: vi.fn(), quiet: true })).rejects.toThrow("companion_response_incomplete:length");

    expect(streamText).toHaveBeenCalledOnce();
  });
});
