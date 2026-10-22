import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

// 2026-10-22 human catch: after two days of removing suspected authors of Elli's opening rant, the kiosk
// still produced an unsolicited personal question, a recap and an agenda. Logs held transcripts and events
// but never the complete request Elli received, so every fix was a guess from reading code. This proves
// the exact request (system prompt, history, injected context, user turn, tool descriptions) can be read.
const sent = vi.hoisted(() => ({ calls: 0 }));
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  streamText: () => {
    sent.calls += 1;
    return { fullStream: (async function* () { yield { type: "text-delta", text: "Hi." }; })(), finishReason: Promise.resolve("stop"), usage: Promise.resolve(undefined) };
  },
}));
import { runAgent } from "../agents/elli/run";

afterEach(() => { vi.unstubAllEnvs(); });

it("writes the exact request Elli is about to receive when capture is switched on, before the model is called", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-companion-request-"));
  vi.stubEnv("SUNNY_CAPTURE_COMPANION_REQUEST", dir);
  try {
    await runAgent({
      history: [{ role: "user", content: "earlier turn" }],
      injectedContextMessages: [{ role: "user", content: "board facts" }],
      userMessage: "the child has just arrived",
      profile: { systemPrompt: "SYSTEM PROMPT UNDER TEST" } as any,
      tools: { waveHello: { description: "Wave when greeting.", inputSchema: {} } as any },
      onToken: () => {},
      quiet: true,
    });
    const files = fs.readdirSync(dir);
    expect(files).toHaveLength(1);
    const captured = JSON.parse(fs.readFileSync(path.join(dir, files[0]!), "utf8"));
    expect(captured.system).toBe("SYSTEM PROMPT UNDER TEST");
    expect(captured.messages).toEqual([
      { role: "user", content: "earlier turn" },
      { role: "user", content: "board facts" },
      { role: "user", content: "the child has just arrived" },
    ]);
    expect(captured.tools).toEqual([{ name: "waveHello", description: "Wave when greeting." }]);
    expect(sent.calls).toBe(1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it("captures nothing when the switch is off", async () => {
  const before = sent.calls;
  await runAgent({ history: [], userMessage: "hello", profile: { systemPrompt: "x" } as any, tools: {}, onToken: () => {}, quiet: true });
  expect(sent.calls).toBe(before + 1);
});
