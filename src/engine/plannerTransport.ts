import type Anthropic from '@anthropic-ai/sdk';

// These documented model capabilities replace transport checks at each caller.
const adaptiveModels = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1']);
export function plannerTransportPolicy(model: string, maxTokens: number, timeout = 120000) {
  if (!adaptiveModels.has(model)) return { streaming: false, maxTokens, timeout };
  const effort = process.env.SUNNY_PLANNER_EFFORT ?? 'high';
  if (effort !== 'low' && effort !== 'medium' && effort !== 'high') throw Error('planner_effort_invalid');
  const budget = Math.max(32000, maxTokens, Number(process.env.SUNNY_PLANNER_MAX_TOKENS ?? 32000));
  const deadline = Number(process.env.SUNNY_PLANNER_TIMEOUT_MS ?? 300000);
  if (!Number.isSafeInteger(budget) || budget > 128000) throw Error('planner_token_budget_invalid');
  if (!Number.isSafeInteger(deadline) || deadline < 1000 || deadline > 600000) throw Error('planner_timeout_invalid');
  return { streaming: true, maxTokens: budget, timeout: deadline, effort };
}

/** Return the raw message. Callers must checkpoint it BEFORE interpreting stop/content. */
export async function requestPlannerMessage(
  client: Anthropic,
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  options: { timeout?: number } = {},
): Promise<Anthropic.Messages.Message> {
  const policy = plannerTransportPolicy(params.model, params.max_tokens, options.timeout);
  const requestOptions = { timeout: policy.timeout, maxRetries: 0, signal: AbortSignal.timeout(policy.timeout) };
  if (!policy.streaming) return client.messages.create(params, requestOptions);
  const request = { ...params, max_tokens: policy.maxTokens, tool_choice: { type: 'auto' as const }, output_config: { effort: policy.effort } };
  console.log(` 🎮 [planner-transport] [stream] [requested] model=${params.model} effort=${policy.effort} max_tokens=${policy.maxTokens}`);
  return client.messages.stream(request, requestOptions).finalMessage();
}

export function assertPlannerResponseComplete(message: { stop_reason?: string | null }): void {
  if (['max_tokens', 'refusal', 'model_context_window_exceeded', 'pause_turn'].includes(message.stop_reason ?? '')) {
    throw Error(`planner_response_${message.stop_reason}`);
  }
}

/** Old durable proposals remain readable; new receipts preserve all provider blocks. */
export function readPlannerToolReceipt(raw: unknown, toolName: string): unknown {
  if (!raw || typeof raw !== 'object' || !('plannerMessage' in raw)) return raw;
  const message = raw.plannerMessage as Anthropic.Messages.Message;
  assertPlannerResponseComplete(message);
  const tools = message.content.filter(block => block.type === 'tool_use' && block.name === toolName);
  if (tools.length !== 1 || tools[0].type !== 'tool_use') throw Error(`planner_tool_output_missing_or_multiple:${toolName}`);
  return tools[0].input;
}
