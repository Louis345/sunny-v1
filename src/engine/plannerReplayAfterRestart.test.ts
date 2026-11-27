import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

// BUGS.md S16 (Ila, 2026-11-17): her next spelling board blocked all day with
// provider_stage_request_changed. Turn 1's strict request was refused ("compiled grammar is too large"), the
// same turn was answered unlocked, and Sunny restarted mid-decision. After the restart the loop forgot it had
// gone unlocked, rebuilt the strict request, found the saved turn pointing at the unlocked one, and blocked.
// Why the human caught it: she played a stuck board at the library with answers on hold. Why the logs missed
// it: the block was logged once at 7:18 AM and nothing told anyone. Why the lab missed it: the grammar
// fallback and restart replay were each tested, never together across a restart.
// Invariant: a restart replays a turn that fell back to unlocked tools at no cost and reaches the same answer.

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

type State = { finished: boolean };
const tools = [{ name: "finish", description: "Finish.", schema: z.object({ title: z.string() }).strict(), run: (state: State) => (state.finished = true, { ok: true as const, result: "ok" }) }];
const reply = (name: string): Anthropic.Messages.Message => ({
  id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "tool_use", stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 } as Anthropic.Messages.Usage,
  content: [{ type: "tool_use", id: "tu_1", name, input: { title: "Board" } }] as Anthropic.Messages.ContentBlock[],
});
const tooLarge = () => Object.assign(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"The compiled grammar is too large, which would cause performance issues."}}'), { status: 400 });

async function runOnce(draftDir: string, provider: (request: any) => Anthropic.Messages.Message) {
  // A fresh module is a fresh process: the in-memory "grammar too large" note is gone, as after a restart.
  vi.resetModules();
  const { runPlannerToolLoop } = await import("./plannerToolLoop");
  const { runMathProviderStage } = await import("./adaptiveMathDiscovery");
  return runPlannerToolLoop<State>({
    label: "replay-lab", prompt: "FACTS", model: "claude-opus-5-5", maxTokens: 1000, tools, state: { finished: false }, finished: state => state.finished,
    send: (request, turn) => runMathProviderStage({ draftDir, stage: `decision-tools-turn-${turn}`, model: request.model, request, execute: async () => provider(request) }),
  });
}

it("after a restart, replays a turn that fell back to unlocked tools without blocking or paying again", async () => {
  const draftDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-planner-replay-")); roots.push(draftDir);
  const strictFirst = vi.fn((request: any) => { if (request.tools.some((tool: any) => tool.strict)) throw tooLarge(); return reply("finish"); });
  expect((await runOnce(draftDir, strictFirst)).stats.stop).toBe("finished");
  expect(strictFirst).toHaveBeenCalledTimes(2);

  const afterRestart = vi.fn((): Anthropic.Messages.Message => { throw new Error("paid_call_after_restart"); });
  const replayed = await runOnce(draftDir, afterRestart);
  expect(replayed.stats.stop).toBe("finished");
  expect(afterRestart).not.toHaveBeenCalled();
});

// I6 (11/12, "a retry re-pays finished turns"): a build that dies on turn 3 and is retried must not buy turns 1 and 2
// again. Saori 11/14–11/21: 18 builds, no re-paid turns seen; this pins it so it cannot return.
it("a retry after a failure on turn 3 pays only from turn 3 on", async () => {
  const draftDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-planner-retry-")); roots.push(draftDir);
  const note = (turn: number): Anthropic.Messages.Message => ({ ...reply("note"), id: `msg_${turn}`,
    content: [{ type: "tool_use", id: `tu_${turn}`, name: "note", input: { title: `turn ${turn}` } }] as Anthropic.Messages.ContentBlock[] });
  const noteTool = { name: "note", description: "Note.", schema: z.object({ title: z.string() }).strict(), run: () => ({ ok: true as const, result: "noted" }) };
  const run = async (provider: (turn: number) => Anthropic.Messages.Message) => {
    vi.resetModules();
    const { runPlannerToolLoop } = await import("./plannerToolLoop");
    const { runMathProviderStage } = await import("./adaptiveMathDiscovery");
    return runPlannerToolLoop<State>({
      label: "retry-lab", prompt: "FACTS", model: "claude-opus-5-5", maxTokens: 1000, tools: [...tools, noteTool], state: { finished: false }, finished: state => state.finished,
      send: (request, turn) => runMathProviderStage({ draftDir, stage: `decision-tools-turn-${turn}`, model: request.model, request, execute: async () => provider(turn) }),
    });
  };
  const firstRun = vi.fn((turn: number) => { if (turn === 3) throw Object.assign(new Error('429 {"type":"error","error":{"type":"rate_limit_error","message":"Rate limited"}}'), { status: 429 }); return note(turn); });
  await expect(run(firstRun)).rejects.toThrow();
  expect(firstRun.mock.calls.map(([turn]) => turn)).toEqual([1, 2, 3]);

  const retry = vi.fn((turn: number) => (turn === 3 ? reply("finish") : note(turn)));
  expect((await run(retry)).stats.stop).toBe("finished");
  expect(retry.mock.calls.map(([turn]) => turn)).toEqual([3]);
});
