import Anthropic from "@anthropic-ai/sdk";
import { runMathProviderStage } from "./adaptiveMathDiscovery";
import type { ToolLoopRequest } from "./plannerToolLoop";
import { requestPlannerMessage } from "./plannerTransport";

/** Sends one tool-loop turn. Each turn is saved before it is read, under its own stage, so a
 * restart replays received turns at no cost and only the next unsent turn is new. Logs the
 * paid-call ledger (measure M5): tokens read from cache versus sent fresh. */
export function providerTurnSender(input: { label: string; stagePrefix: string; draftDir?: string; client?: Anthropic; timeoutMs?: number }) {
  const client = input.client ?? new Anthropic({ maxRetries: 0 });
  return async (request: ToolLoopRequest, turn: number): Promise<Anthropic.Messages.Message> => {
    const execute = () => requestPlannerMessage(client, request as Anthropic.Messages.MessageCreateParamsNonStreaming, { timeout: input.timeoutMs });
    const message = input.draftDir
      ? await runMathProviderStage({ draftDir: input.draftDir, stage: `${input.stagePrefix}-turn-${turn}`, model: request.model, request, execute })
      : await execute();
    const usage = message.usage;
    console.log(` 🎮 [planner-tools] [${input.label}] [usage] turn=${turn} model=${request.model} input=${usage?.input_tokens ?? 0} cache_read=${usage?.cache_read_input_tokens ?? 0} cache_write=${usage?.cache_creation_input_tokens ?? 0} output=${usage?.output_tokens ?? 0}`);
    return message;
  };
}
