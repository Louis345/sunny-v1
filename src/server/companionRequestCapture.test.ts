import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { createAnthropic } from "@ai-sdk/anthropic";
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
      tools: { waveHello: { description: "Wave when greeting.", inputSchema: z.object({gesture:z.string().describe("A body gesture")}) } as any },
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
    expect(captured.tools[0]).toMatchObject({ name: "waveHello", description: "Wave when greeting.", inputSchema:{type:"object", properties:{gesture:{type:"string",description:"A body gesture"}}} });
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

// Exercise the real provider converter too: Anthropic rejects system messages after user/assistant turns.
it("transports internal-event provenance through Anthropic without separated system messages or network", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-event-request-"));
  vi.stubEnv("SUNNY_CAPTURE_COMPANION_REQUEST", dir);
  try {
    await runAgent({history:[{role:"user",content:"Please help."},{role:"assistant",content:"How can I help?"},
      {role:"system",content:"[System event: board available]"}], source:"system", userMessage:"[System event: choice opened]",
      profile:{systemPrompt:"Synthetic companion"} as any,tools:{},onToken:()=>{},quiet:true});
    const capture = JSON.parse(fs.readFileSync(path.join(dir,fs.readdirSync(dir)[0]!),"utf8"));
    const intercepted = vi.fn(async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      expect(body.messages.at(-1).content[0].text).toContain("not child speech");
      throw new Error("synthetic_stop_after_conversion");
    });
    const model = createAnthropic({apiKey:"synthetic",fetch:intercepted})("claude-sonnet-4-6");
    await expect(model.doStream({prompt:[{role:"system",content:capture.system},...capture.messages.map((m:any)=>({role:m.role,content:[{type:"text",text:m.content}]}))]})).rejects.toThrow("synthetic_stop_after_conversion");
    expect(intercepted).toHaveBeenCalledOnce();
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
