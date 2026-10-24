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
export type ToolLoopCaps = { maxCalls: number; maxErrors: number; maxTurns: number };
export const DEFAULT_TOOL_LOOP_CAPS: ToolLoopCaps = { maxCalls: 40, maxErrors: 3, maxTurns: 10 };
export type ToolLoopStop = "finished" | "cap_calls" | "cap_errors" | "cap_turns";
export type ToolLoopRequest = {
  model: string; max_tokens: number;
  messages: Anthropic.Messages.MessageParam[];
  tools: Anthropic.Messages.Tool[];
  tool_choice: { type: "auto" };
};

export function plannerToolDefinitions(tools: ReadonlyArray<PlannerTool<any>>): Anthropic.Messages.Tool[] {
  return tools.map(tool => {
    const definition = { name: tool.name, description: tool.description, input_schema: z.toJSONSchema(tool.schema, { io: "input" }) as Anthropic.Messages.Tool.InputSchema };
    return tool.strict === false ? definition : strictTool(definition);
  });
}

/** The Planner talks to Sunny through small strict tools until the board is finished.
 * Every call in a turn runs in order and all answers return together. Bounded by caps
 * (Law 2): a stuck conversation stops; it never loops or buys a correction. */
export async function runPlannerToolLoop<S>(input: {
  label: string; prompt: string; model: string; maxTokens: number;
  tools: ReadonlyArray<PlannerTool<S>>; state: S; finished: (state: S) => boolean;
  send: (request: ToolLoopRequest, turn: number) => Promise<Anthropic.Messages.Message>;
  caps?: ToolLoopCaps;
}): Promise<{ state: S; stats: { turns: number; calls: number; errors: number; stop: ToolLoopStop } }> {
  const caps = input.caps ?? DEFAULT_TOOL_LOOP_CAPS;
  const byName = new Map(input.tools.map(tool => [tool.name, tool]));
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: [{ type: "text", text: input.prompt, cache_control: { type: "ephemeral" } }] },
  ];
  const tools = plannerToolDefinitions(input.tools);
  let turns = 0, calls = 0, errors = 0;
  const done = (stop: ToolLoopStop) => {
    console.log(` 🎮 [planner-tools] [${input.label}] [${stop}] turns=${turns} calls=${calls} errors=${errors}`);
    return { state: input.state, stats: { turns, calls, errors, stop } };
  };
  while (true) {
    if (turns >= caps.maxTurns) return done("cap_turns");
    turns += 1;
    const response = await input.send({ model: input.model, max_tokens: input.maxTokens, messages: structuredClone(messages), tools, tool_choice: { type: "auto" } }, turns);
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
      const parsed = tool?.schema.safeParse(tool.strict === false ? decodeToolInput(use.input, definition!.input_schema) : use.input);
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
