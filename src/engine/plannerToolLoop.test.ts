import { describe, expect, it } from "vitest";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { strictBudget } from "./plannerTransport";
import { DEFAULT_TOOL_LOOP_CAPS, plannerToolDefinitions, runPlannerToolLoop, type PlannerTool } from "./plannerToolLoop";

type State = { added: string[]; finished: boolean };
const tools: PlannerTool<State>[] = [
  { name: "add", description: "Add a word.", schema: z.object({ word: z.enum(["sign", "know"]) }).strict(),
    run: (state, input) => input.word === "know" && state.added.includes("know") ? { ok: false, error: "know is already added" } : (state.added.push(input.word), { ok: true, result: { added: input.word } }) },
  { name: "finish", description: "Finish.", schema: z.object({ title: z.string().min(1) }).strict(),
    run: (state) => state.added.length ? (state.finished = true, { ok: true, result: "accepted" }) : { ok: false, error: "add a word first" } },
];
let messageId = 0;
const reply = (...blocks: Array<{ name: string; input: unknown } | string>): Anthropic.Messages.Message => ({
  id: `msg_${++messageId}`, type: "message", role: "assistant", model: "claude-sonnet-5", stop_reason: blocks.some(b => typeof b !== "string") ? "tool_use" : "end_turn", stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 } as Anthropic.Messages.Usage,
  content: blocks.map((block, index) => typeof block === "string" ? { type: "text", text: block, citations: null } : { type: "tool_use", id: `tu_${messageId}_${index}`, name: block.name, input: block.input }) as Anthropic.Messages.ContentBlock[],
});
function scripted(...turns: Anthropic.Messages.Message[]) {
  const requests: any[] = [];
  return { requests, send: async (request: any) => { requests.push(structuredClone(request)); const next = turns.shift(); if (!next) throw new Error("script_exhausted"); return next; } };
}
const run = (send: (request: any) => Promise<Anthropic.Messages.Message>, caps = DEFAULT_TOOL_LOOP_CAPS) =>
  runPlannerToolLoop<State>({ label: "test", prompt: "FACTS", model: "claude-sonnet-5", maxTokens: 1000, tools, state: { added: [], finished: false }, finished: state => state.finished, send, caps });

describe("planner tool loop", () => {
  it("runs every call in order, answers them together, and stops when the board is finished", async () => {
    const script = scripted(reply({ name: "add", input: { word: "sign" } }, { name: "add", input: { word: "know" } }), reply({ name: "finish", input: { title: "Board" } }));
    const result = await run(script.send);
    expect(result.state.added).toEqual(["sign", "know"]);
    expect(result.stats).toEqual({ turns: 2, calls: 3, errors: 0, stop: "finished" });
    const second = script.requests[1].messages;
    expect(second.at(-1).role).toBe("user");
    expect(second.at(-1).content.map((block: any) => [block.type, block.is_error ?? false])).toEqual([["tool_result", false], ["tool_result", false]]);
    expect(second.at(-1).content.map((block: any) => block.tool_use_id)).toEqual(second.at(-2).content.map((block: any) => block.id));
  });

  it("returns a mistake to the model as an error it can fix, and counts it", async () => {
    const script = scripted(reply({ name: "finish", input: { title: "Board" } }), reply({ name: "add", input: { word: "sign" } }, { name: "finish", input: { title: "Board" } }));
    const result = await run(script.send);
    expect(result.stats).toEqual({ turns: 2, calls: 3, errors: 1, stop: "finished" });
    const answer = script.requests[1].messages.at(-1).content[0];
    expect(answer).toMatchObject({ type: "tool_result", is_error: true });
    expect(String(answer.content)).toContain("add a word first");
  });

  it("rejects input outside the schema and unknown tools as errors instead of throwing", async () => {
    const script = scripted(reply({ name: "add", input: { word: "zebra" } }, { name: "draw", input: {} }), reply({ name: "add", input: { word: "sign" } }, { name: "finish", input: { title: "Board" } }));
    const result = await run(script.send);
    expect(result.stats.errors).toBe(2);
    const answers = script.requests[1].messages.at(-1).content;
    expect(answers.every((block: any) => block.is_error)).toBe(true);
    expect(String(answers[1].content)).toContain("unknown tool draw");
  });

  it("nudges once when the model answers in text without using tools", async () => {
    const script = scripted(reply("Here is my plan."), reply({ name: "add", input: { word: "sign" } }, { name: "finish", input: { title: "Board" } }));
    const result = await run(script.send);
    expect(result.stats).toEqual({ turns: 2, calls: 2, errors: 1, stop: "finished" });
    expect(JSON.stringify(script.requests[1].messages.at(-1))).toContain("finish");
  });

  it("stops at the error cap without another request", async () => {
    const bad = () => reply({ name: "finish", input: { title: "Board" } });
    const script = scripted(bad(), bad(), bad(), bad());
    const result = await run(script.send, { ...DEFAULT_TOOL_LOOP_CAPS, maxErrors: 3 });
    expect(result.stats).toMatchObject({ errors: 3, stop: "cap_errors", turns: 3 });
    expect(script.requests).toHaveLength(3);
  });

  it("stops at the call cap and does not run calls beyond it", async () => {
    const script = scripted(reply({ name: "add", input: { word: "sign" } }, { name: "add", input: { word: "sign" } }, { name: "add", input: { word: "sign" } }));
    const result = await run(script.send, { maxCalls: 2, maxErrors: 3, maxTurns: 10 });
    expect(result.state.added).toEqual(["sign", "sign"]);
    expect(result.stats).toMatchObject({ calls: 2, stop: "cap_calls" });
  });

  it("stops at the turn cap", async () => {
    const script = scripted(...Array.from({ length: 5 }, () => reply({ name: "add", input: { word: "sign" } })));
    const result = await run(script.send, { maxCalls: 40, maxErrors: 3, maxTurns: 3 });
    expect(result.stats).toMatchObject({ turns: 3, stop: "cap_turns" });
    expect(script.requests).toHaveLength(3);
  });

  it("refuses to read a truncated reply", async () => {
    const truncated = { ...reply({ name: "add", input: { word: "sign" } }), stop_reason: "max_tokens" as const };
    await expect(run(scripted(truncated).send)).rejects.toThrow("planner_response_max_tokens");
  });

  it("sends every tool in strict mode, lets the model choose, and caches the facts", async () => {
    const script = scripted(reply({ name: "add", input: { word: "sign" } }, { name: "finish", input: { title: "Board" } }));
    await run(script.send);
    const request = script.requests[0];
    expect(request.tools.every((tool: any) => tool.strict === true)).toBe(true);
    expect(strictBudget(request.tools).unsupported).toEqual([]);
    expect(request.tool_choice).toEqual({ type: "auto" });
    expect(request.messages[0].content[0]).toMatchObject({ type: "text", text: "FACTS", cache_control: { type: "ephemeral" } });
  });

  it("sends a tool marked unlocked without strict and decodes a list sent as text", async () => {
    const loose: PlannerTool<State> = { name: "note", description: "Big content the lock cannot hold.", strict: false, schema: z.object({ items: z.array(z.string()).min(1) }).strict(),
      run: (state, input) => (state.added.push(...input.items), { ok: true, result: "noted" }) };
    const script = scripted(reply({ name: "note", input: { items: '["sign","know"]' } }, { name: "finish", input: { title: "Board" } }));
    const result = await runPlannerToolLoop<State>({ label: "test", prompt: "FACTS", model: "claude-sonnet-5", maxTokens: 1000, tools: [...tools, loose], state: { added: [], finished: false }, finished: state => state.finished, send: script.send });
    expect(result.state.added).toEqual(["sign", "know"]);
    const sent = script.requests[0].tools;
    expect(sent.find((tool: any) => tool.name === "note").strict).toBeUndefined();
    expect(sent.filter((tool: any) => tool.name !== "note").every((tool: any) => tool.strict === true)).toBe(true);
  });

  it("describes tools from their schemas with nothing the strict lock cannot hold", () => {
    const definitions = plannerToolDefinitions([{ name: "bounded", description: "d", schema: z.object({ n: z.number().min(0).max(1), list: z.array(z.string().min(1)).min(2).max(4) }).strict(), run: () => ({ ok: true, result: null }) }]);
    expect(strictBudget(definitions).unsupported).toEqual([]);
    expect(JSON.stringify(definitions[0].input_schema)).toContain("From 0 to 1.");
  });
});
