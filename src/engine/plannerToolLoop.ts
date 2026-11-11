import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { assertPlannerResponseComplete, decodeToolInput, strictTool } from "./plannerTransport";

/** One small locked tool. The model fills in decisions; `run` is code: it stamps identity,
 * keeps the board so far, and answers. A mistake is an answer the model can fix, never a throw. */
export type PlannerTool<S, I = any> = {
  name: string;
  description: string;
  schema: z.ZodType<I>;
  /** Locked by default. A tool whose content is too large for the API's strict grammar sets false:
   * its handler still validates every field and answers mistakes in the conversation. */
  strict?: boolean;
  run: (state: S, input: I) => { ok: true; result: unknown } | { ok: false; error: string };
};
/** Types each handler's input from its own schema: `const tool = toolFor<State>(); tool({ ... })`. */
export const toolFor = <S>() => <Sch extends z.ZodType>(tool: Omit<PlannerTool<S, z.infer<Sch>>, "schema"> & { schema: Sch }): PlannerTool<S> => tool as PlannerTool<S>;
export type ToolLoopCaps = { maxCalls: number; maxErrors: number; maxTurns: number };
export const DEFAULT_TOOL_LOOP_CAPS: ToolLoopCaps = { maxCalls: 40, maxErrors: 3, maxTurns: 10 };
export type ToolLoopStop = "finished" | "cap_calls" | "cap_errors" | "cap_turns";
export type ToolLoopRequest = {
  model: string; max_tokens: number; system?: string;
  messages: Anthropic.Messages.MessageParam[];
  tools: Anthropic.Messages.Tool[];
  tool_choice: { type: "auto" };
};

export function plannerToolDefinitions(tools: ReadonlyArray<PlannerTool<any>>, opts: { unlocked?: boolean } = {}): Anthropic.Messages.Tool[] {
  return tools.map(tool => {
    const definition = { name: tool.name, description: tool.description, input_schema: z.toJSONSchema(tool.schema, { io: "input" }) as Anthropic.Messages.Tool.InputSchema };
    return tool.strict === false || opts.unlocked ? definition : strictTool(definition);
  });
}

/** Stages whose strict grammar the provider rejected as too large since this server started: they start unlocked,
 * so every later board does not pay for one rejected request first (Reina, 2026-11-11). */
const GRAMMAR_TOO_LARGE = new Set<string>();

/** The Planner talks to Sunny through small strict tools until the board is finished.
 * Every call in a turn runs in order and all answers return together. Bounded by caps
 * (Law 2): a stuck conversation stops; it never loops or buys a correction. */
export async function runPlannerToolLoop<S>(input: {
  label: string; prompt: string; model: string; maxTokens: number;
  /** Persona, and how the first message wraps the prompt (for example with the worksheet page). */
  system?: string; content?: (prompt: string) => Anthropic.Messages.MessageParam["content"];
  tools: ReadonlyArray<PlannerTool<S>>; state: S; finished: (state: S) => boolean;
  send: (request: ToolLoopRequest, turn: number) => Promise<Anthropic.Messages.Message>;
  caps?: ToolLoopCaps;
}): Promise<{ state: S; stats: { turns: number; calls: number; errors: number; stop: ToolLoopStop } }> {
  const caps = input.caps ?? DEFAULT_TOOL_LOOP_CAPS;
  const byName = new Map(input.tools.map(tool => [tool.name, tool]));
  // Everything up to and including the facts is cached, so later turns re-read it cheaply.
  const opening = input.content?.(input.prompt) ?? input.prompt;
  const blocks: Anthropic.Messages.ContentBlockParam[] = typeof opening === "string" ? [{ type: "text", text: opening }] : [...opening];
  blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral" } } as Anthropic.Messages.ContentBlockParam;
  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: blocks }];
  let unlocked = GRAMMAR_TOO_LARGE.has(input.label);
  let tools = plannerToolDefinitions(input.tools, { unlocked });
  if (unlocked) console.log(` 🎮 [planner-tools] [${input.label}] [strict-grammar-too-large] [start-unlocked] tools=${tools.length}`);
  let turns = 0, calls = 0, errors = 0;
  const done = (stop: ToolLoopStop) => {
    console.log(` 🎮 [planner-tools] [${input.label}] [${stop}] turns=${turns} calls=${calls} errors=${errors}`);
    return { state: input.state, stats: { turns, calls, errors, stop } };
  };
  while (true) {
    if (turns >= caps.maxTurns) return done("cap_turns");
    turns += 1;
    const ask = () => input.send({ model: input.model, max_tokens: input.maxTokens, ...(input.system ? { system: input.system } : {}), messages: structuredClone(messages), tools, tool_choice: { type: "auto" } }, turns);
    // A real child's history can outgrow the provider's strict grammar (Ila, 2026-11-10: 8 boards of games and words
    // as allowed values). Degrade once to the same tools unlocked; code still checks every answer below.
    const response = await ask().catch(async (error: unknown) => {
      if (unlocked || !/compiled grammar is too large/i.test(error instanceof Error ? error.message : String(error))) throw error;
      unlocked = true; GRAMMAR_TOO_LARGE.add(input.label); tools = plannerToolDefinitions(input.tools, { unlocked });
      console.warn(` 🎮 [planner-tools] [${input.label}] [strict-grammar-too-large] [retry-unlocked] turn=${turns} tools=${tools.length}`);
      return ask();
    });
    assertPlannerResponseComplete(response);
    messages.push({ role: "assistant", content: response.content });
    const uses = response.content.filter((block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use");
    if (!uses.length) {
      errors += 1;
      console.log(` 🎮 [planner-tools] [${input.label}] [text-only] turn=${turns}`);
      if (errors >= caps.maxErrors) return done("cap_errors");
      messages.push({ role: "user", content: "Use the tools to build the board. Call the finish tool when it is complete." });
      continue;
    }
    const answers: Anthropic.Messages.ToolResultBlockParam[] = [];
    let capped: ToolLoopStop | undefined;
    for (const use of uses) {
      if (calls >= caps.maxCalls) { capped = "cap_calls"; break; }
      calls += 1;
      const tool = byName.get(use.name);
      const definition = tools.find(row => row.name === use.name);
      const parsed = tool?.schema.safeParse(tool.strict === false || unlocked ? decodeToolInput(use.input, definition!.input_schema) : use.input);
      const outcome = !tool ? { ok: false as const, error: `unknown tool ${use.name}` }
        : !parsed!.success ? { ok: false as const, error: `invalid input: ${parsed!.error.issues.map(issue => `${issue.path.join(".") || "input"} ${issue.message}`).join("; ")}` }
        : tool.run(input.state, parsed!.data);
      console.log(` 🎮 [planner-tools] [${input.label}] [call] [${outcome.ok ? "ok" : "error"}] tool=${use.name} turn=${turns}${outcome.ok ? "" : ` reason=${outcome.error}`}`);
      if (outcome.ok) answers.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(outcome.result) });
      else { errors += 1; answers.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: outcome.error }); }
    }
    if (capped) return done(capped);
    messages.push({ role: "user", content: answers });
    if (input.finished(input.state)) return done("finished");
    if (errors >= caps.maxErrors) return done("cap_errors");
  }
}
