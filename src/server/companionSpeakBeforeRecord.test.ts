import { beforeEach, describe, expect, it, vi } from "vitest";
import { tool } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { z } from "zod";

const model = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn(() => model.current) }));
vi.mock("../agents/elli/tools/generateToolDocs", () => ({ ALL_TOOLS: {} }));

import { runAgent } from "../agents/elli/run";
import { COMPANION_SPOKEN_TURN_PROMPT } from "./companionTurnTaking";

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };

function modelStep(parts: Array<Record<string, unknown>>, finish: "stop" | "tool-calls") {
  return {
    stream: simulateReadableStream({
      chunks: [{ type: "stream-start", warnings: [] }, ...parts,
        { type: "finish", finishReason: { unified: finish, raw: finish }, usage }] as never[],
    }),
  };
}
const text = (id: string, words: string) => [
  { type: "text-start", id }, { type: "text-delta", id, delta: words }, { type: "text-end", id },
];
const recordCall = (toolName: string) => ({
  type: "tool-call", toolCallId: `call-${toolName}`, toolName,
  input: JSON.stringify({ evidenceText: "the gate clue was confusing" }),
});

describe("the companion speaks before she records", () => {
  // Human catch (Reina, 2026-11-04): replies took ~5.3s instead of ~2.2s; every slow
  // reply logged tool_steps=1. A record-only tool cost a whole second model round trip
  // before or after her words. Labs stubbed streamText and never ran the real tool loop.
  let events: string[];
  let releaseRecord: () => void;
  let tools: Record<string, unknown>;

  beforeEach(() => {
    events = [];
    const recorded = new Promise<void>((resolve) => { releaseRecord = resolve; });
    const record = (name: string) => tool({
      description: name, inputSchema: z.object({ evidenceText: z.string() }),
      execute: async () => { events.push(`${name}:started`); await recorded; events.push(`${name}:resolved`); return { ok: true }; },
    });
    tools = { recordProductIssue: record("recordProductIssue"), recordChildSignal: record("recordChildSignal") };
  });

  it("hears one reply: words stream before the record tool resolves, and no second model call follows", async () => {
    const doStream = vi.fn()
      .mockResolvedValueOnce(modelStep([...text("t1", "Oops, that gate was confusing. Try the blue one!"), recordCall("recordProductIssue")], "tool-calls"))
      .mockResolvedValueOnce(modelStep(text("t2", "I wrote that down for the grown-ups."), "stop"));
    model.current = new MockLanguageModelV3({ doStream });
    const spoken: string[] = [];
    const turn = runAgent({ history: [], userMessage: "This gate is broken.", profile: { systemPrompt: "Talk to Reina." } as never,
      tools: tools as never, quiet: true, onToken: (chunk) => { events.push("spoke"); spoken.push(chunk); } });
    await vi.waitFor(() => expect(events).toContain("recordProductIssue:started"));
    expect(events.indexOf("spoke")).toBeLessThan(events.indexOf("recordProductIssue:started"));
    releaseRecord();
    await turn;

    expect(spoken.join("")).toBe("Oops, that gate was confusing. Try the blue one!");
    expect(doStream).toHaveBeenCalledOnce();
  });

  it("still asks for her words when she recorded before speaking (exactly one spoken reply)", async () => {
    const doStream = vi.fn()
      .mockResolvedValueOnce(modelStep([recordCall("recordChildSignal")], "tool-calls"))
      .mockResolvedValueOnce(modelStep(text("t2", "You picked the dragon gate!"), "stop"));
    model.current = new MockLanguageModelV3({ doStream });
    releaseRecord();
    const spoken: string[] = [];
    await runAgent({ history: [], userMessage: "Dragon!", profile: { systemPrompt: "Talk to Reina." } as never,
      tools: tools as never, quiet: true, onToken: (chunk) => spoken.push(chunk) });

    expect(spoken.join("")).toBe("You picked the dragon gate!");
    expect(doStream).toHaveBeenCalledTimes(2);
  });

  it("tells her to speak first and record after", () => {
    expect(COMPANION_SPOKEN_TURN_PROMPT).toMatch(/recordChildSignal.*recordProductIssue|recordProductIssue.*recordChildSignal/);
    expect(COMPANION_SPOKEN_TURN_PROMPT).toMatch(/after/i);
  });
});
