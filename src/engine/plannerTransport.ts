import type Anthropic from '@anthropic-ai/sdk';

// These documented model capabilities replace transport checks at each caller.
const adaptiveModels = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1']);
export function plannerTransportPolicy(model: string, maxTokens: number, timeout = 300000) {
  const deadline = Number(process.env.SUNNY_PLANNER_TIMEOUT_MS ?? timeout);
  if (!Number.isSafeInteger(deadline) || deadline < 1000 || deadline > 600000) throw Error('planner_timeout_invalid');
  if (!adaptiveModels.has(model)) return { streaming: model === 'claude-sonnet-5', maxTokens, timeout: deadline };
  const effort = process.env.SUNNY_PLANNER_EFFORT ?? 'high';
  if (effort !== 'low' && effort !== 'medium' && effort !== 'high') throw Error('planner_effort_invalid');
  const budget = Math.max(32000, maxTokens, Number(process.env.SUNNY_PLANNER_MAX_TOKENS ?? 32000));
  if (!Number.isSafeInteger(budget) || budget > 128000) throw Error('planner_token_budget_invalid');
  return { streaming: true, maxTokens: budget, timeout: deadline, effort };
}

/** How each model is asked: the one place for model differences on calls that do not go through
 * requestPlannerMessage. A model that refuses a forced tool is asked to choose the tool itself;
 * every other request is returned unchanged, the same object, so its bytes and receipts stay identical. */
export function requestForModel<P extends Anthropic.Messages.MessageCreateParams>(request: P): P {
  const choice = request.tool_choice?.type;
  if (!adaptiveModels.has(request.model) || (choice !== 'tool' && choice !== 'any')) return request;
  console.log(` 🎮 [planner-transport] [tool-choice] [auto] model=${request.model} requested=${choice}`);
  return { ...request, tool_choice: { type: 'auto' } };
}

/** Return the raw message. Callers must checkpoint it BEFORE interpreting stop/content. */
export async function requestPlannerMessage(
  client: Anthropic,
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  options: { timeout?: number; onRequest?: (request: unknown) => void } = {},
): Promise<Anthropic.Messages.Message> {
  const policy = plannerTransportPolicy(params.model, params.max_tokens, options.timeout);
  const requestOptions = { timeout: policy.timeout, maxRetries: 0, signal: AbortSignal.timeout(policy.timeout) };
  const request = policy.effort ? { ...params, max_tokens: policy.maxTokens, tool_choice: { type: 'auto' as const }, output_config: { effort: policy.effort } } : params;
  options.onRequest?.(request);
  const started = Date.now();
  console.log(` 🎮 [planner-transport] [request] [requested] model=${params.model} streaming=${policy.streaming} timeout_ms=${policy.timeout} max_tokens=${policy.maxTokens} request_chars=${JSON.stringify(request).length}`);
  try {
    const message = await (policy.streaming ? client.messages.stream(request, requestOptions).finalMessage() : client.messages.create(request, requestOptions));
    console.log(` 🎮 [planner-transport] [request] [received] id=${message.id} elapsed_ms=${Date.now()-started} stop=${message.stop_reason} input_tokens=${message.usage?.input_tokens} output_tokens=${message.usage?.output_tokens}`);
    return message;
  } catch (error) {
    console.error(` 🎮 [planner-transport] [request] [failed] elapsed_ms=${Date.now()-started} error=${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/** The provider's own reason for a refusal (type, category, explanation), or null. */
export function refusalDetails(message: unknown): Record<string, unknown> | null {
  const details = (message as { stop_details?: unknown } | null)?.stop_details;
  return details && typeof details === 'object' && !Array.isArray(details) ? details as Record<string, unknown> : null;
}
export function describeRefusal(message: unknown): string {
  const details = refusalDetails(message);
  return details ? `category=${String(details.category ?? 'none')} explanation=${String(details.explanation ?? 'none')}` : 'stop_details=missing';
}
export function assertPlannerResponseComplete(message: { stop_reason?: string | null }): void {
  if (message.stop_reason === 'refusal') console.error(` 🎮 [planner] [response] [refused] ${describeRefusal(message)}`);
  if (['max_tokens', 'refusal', 'model_context_window_exceeded', 'pause_turn'].includes(message.stop_reason ?? '')) {
    throw Error(`planner_response_${message.stop_reason}`);
  }
}

/** Old durable proposals remain readable; new receipts preserve all provider blocks. */
type JsonSchema = Record<string, unknown>;
const schemaAt = (schema: unknown, root: JsonSchema): JsonSchema => {
  let current = (schema && typeof schema === 'object' ? schema : {}) as JsonSchema;
  for (let depth = 0; typeof current.$ref === 'string' && depth < 16; depth++) {
    const ref = current.$ref as string;
    if (!ref.startsWith('#/')) break;
    let target: unknown = root;
    for (const part of ref.slice(2).split('/')) target = target && typeof target === 'object' ? (target as JsonSchema)[part.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined;
    current = (target && typeof target === 'object' ? target : {}) as JsonSchema;
  }
  return current;
};
const alternatives = (schema: JsonSchema, root: JsonSchema): JsonSchema[] =>
  [schema, ...[...(Array.isArray(schema.anyOf) ? schema.anyOf : []), ...(Array.isArray(schema.oneOf) ? schema.oneOf : [])].flatMap(option => alternatives(schemaAt(option, root), root))];
const accepts = (options: JsonSchema[], kind: string) => options.some(option => option.type === kind || (Array.isArray(option.type) && option.type.includes(kind))
  || (kind === 'object' && option.type === undefined && Boolean(option.properties)) || (kind === 'array' && option.type === undefined && Boolean(option.items)));
/** Models sometimes send a list or object inside a tool answer as JSON text. Where the tool's own
 * schema expects a list or object, and never text, that text is decoded once here, for every tool.
 * Real text and broken JSON are left exactly as sent; the usual validation still decides. */
export function decodeToolInput(value: unknown, schema: unknown, root: JsonSchema = schemaAt(schema, {}), path = '$', fieldName?: string): unknown {
  const options = alternatives(schemaAt(schema, root), root);
  if (typeof value === 'string' && !accepts(options, 'string')) {
    const text = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      const parsed: unknown = JSON.parse(text);
      const wrapped = fieldName && parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        && Object.keys(parsed).length === 1 && fieldName in parsed ? (parsed as JsonSchema)[fieldName] : parsed;
      if ((Array.isArray(wrapped) && accepts(options, 'array')) || (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped) && accepts(options, 'object'))) {
        console.log(` 🎮 [provider] [tool-input] [decoded] path=${path}`);
        value = wrapped;
      }
    } catch { /* Not JSON: left as sent, so validation reports it. */ }
  }
  if (Array.isArray(value)) {
    const items = options.find(option => option.items)?.items;
    return items ? value.map((item, index) => decodeToolInput(item, items, root, `${path}[${index}]`)) : value;
  }
  if (value && typeof value === 'object') {
    const properties: JsonSchema = {};
    for (const option of options) for (const [key, child] of Object.entries((option.properties ?? {}) as JsonSchema)) if (!(key in properties)) properties[key] = child;
    // A field whose text holds an object carrying that same field and its siblings is the
    // parent itself: lift it back out. Fields sent on their own win over the packed copy.
    for (const [key, child] of Object.entries(value as JsonSchema)) {
      if (typeof child !== 'string') continue;
      let packed: unknown;
      try { packed = JSON.parse(child.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { continue; }
      if (!packed || typeof packed !== 'object' || Array.isArray(packed) || !(key in packed)) continue;
      const keys = Object.keys(packed);
      if (keys.length < 2 || !keys.every(name => name in properties)) continue;
      console.log(` 🎮 [provider] [tool-input] [lifted] path=${path}.${key} keys=${keys.join(',')}`);
      const { [key]: _packedField, ...sent } = value as JsonSchema;
      value = { ...(packed as JsonSchema), ...sent };
    }
    return Object.fromEntries(Object.entries(value as JsonSchema).map(([key, child]) => [key, key in properties ? decodeToolInput(child, properties[key], root, `${path}.${key}`, key) : child]));
  }
  return value;
}
export function readPlannerToolReceipt(raw: unknown, toolName: string, schema?: unknown): unknown {
  if (!raw || typeof raw !== 'object' || !('plannerMessage' in raw)) return schema ? decodeToolInput(raw, schema) : raw;
  const message = raw.plannerMessage as Anthropic.Messages.Message;
  assertPlannerResponseComplete(message);
  const tools = message.content.filter(block => block.type === 'tool_use' && block.name === toolName);
  if (tools.length !== 1 || tools[0].type !== 'tool_use') throw Error(`planner_tool_output_missing_or_multiple:${toolName}`);
  return schema ? decodeToolInput(tools[0].input, schema) : tools[0].input;
}

// Strict tools: the API locks the model's output to the schema while it is written, so a list can
// never arrive as text. The lock supports a subset of JSON Schema; rules outside it move into the
// field's description and Zod still checks them on arrival.
const STRICT_DROPPED = ['$schema', 'pattern', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties'];
function strictWords(node: JsonSchema): string[] {
  const words: string[] = [];
  if (typeof node.minItems === 'number' && node.minItems > 1) words.push(`At least ${node.minItems} items.`);
  if (typeof node.maxItems === 'number') words.push(`At most ${node.maxItems} items.`);
  if (typeof node.maxLength === 'number') words.push(`At most ${node.maxLength} characters.`);
  const low = node.minimum ?? node.exclusiveMinimum, high = node.maximum ?? node.exclusiveMaximum;
  if (low !== undefined && high !== undefined) words.push(`From ${low} to ${high}.`);
  else if (low !== undefined) words.push(`At least ${low}.`);
  else if (high !== undefined) words.push(`At most ${high}.`);
  return words;
}
export function strictToolSchema(schema: unknown, path = '$'): JsonSchema {
  if (Array.isArray(schema)) return schema.map((item, index) => strictToolSchema(item, `${path}[${index}]`)) as unknown as JsonSchema;
  if (!schema || typeof schema !== 'object') return schema as JsonSchema;
  const node = schema as JsonSchema, words = strictWords(node), out: JsonSchema = {};
  for (const [key, value] of Object.entries(node)) {
    if (STRICT_DROPPED.includes(key)) continue;
    const name = key === 'oneOf' ? 'anyOf' : key;
    out[name] = key === 'properties' || key === '$defs' || key === 'definitions'
      ? Object.fromEntries(Object.entries(value as JsonSchema).map(([child, sub]) => [child, strictToolSchema(sub, `${path}.${child}`)]))
      : typeof value === 'object' && value !== null && key !== 'enum' && key !== 'const' && key !== 'required' && key !== 'default' ? strictToolSchema(value, `${path}.${key}`) : value;
  }
  if (typeof out.minItems === 'number' && out.minItems > 1) out.minItems = 1;
  if (node.type === 'object' || node.properties) {
    if (node.additionalProperties !== undefined && node.additionalProperties !== false) throw Error(`strict_schema_free_form:${path}`);
    out.additionalProperties = false;
  }
  if (words.length) out.description = [node.description, ...words].filter(Boolean).join(' ');
  return out;
}
export function strictTool<T extends { input_schema: unknown }>(tool: T): T & { strict: true } {
  return { ...tool, strict: true, input_schema: strictToolSchema(tool.input_schema) as T['input_schema'] };
}
/** Measures one request against the documented strict limits (24 optional fields, 16 either-or fields). */
export function strictBudget(tools: Array<{ input_schema: unknown; strict?: boolean }>): { optional: number; unions: number; unsupported: string[] } {
  let optional = 0, unions = 0;
  const unsupported: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) return node.forEach((item, index) => walk(item, `${path}[${index}]`));
    if (!node || typeof node !== 'object') return;
    const schema = node as JsonSchema;
    for (const key of [...STRICT_DROPPED, 'oneOf']) if (key in schema) unsupported.push(`${path}.${key}`);
    if (typeof schema.minItems === 'number' && schema.minItems > 1) unsupported.push(`${path}.minItems`);
    if ((schema.type === 'object' || schema.properties) && schema.additionalProperties !== false) unsupported.push(`${path}.additionalProperties`);
    if (schema.properties) {
      const required = new Set((schema.required ?? []) as string[]);
      optional += Object.keys(schema.properties as JsonSchema).filter(key => !required.has(key)).length;
    }
    if (schema.anyOf || Array.isArray(schema.type)) unions += 1;
    for (const [key, value] of Object.entries(schema)) {
      if (typeof value !== 'object' || value === null || key === 'enum' || key === 'const' || key === 'required') continue;
      // A properties map names fields; its keys are never schema keywords.
      if (key === 'properties' || key === '$defs' || key === 'definitions') for (const [child, sub] of Object.entries(value as JsonSchema)) walk(sub, key === 'properties' ? `${path}.${child}` : `#${child}`);
      else walk(value, `${path}.${key}`);
    }
  };
  for (const tool of tools) if (tool.strict !== false) walk(tool.input_schema, '$');
  return { optional, unions, unsupported };
}
