function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function responseText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output.flatMap((item) => {
    const record = object(item);
    const content = Array.isArray(record?.content) ? record.content : [];
    return content.flatMap((part) => {
      const block = object(part);
      return typeof block?.text === "string" ? [block.text] : [];
    });
  }).join("\n");
}

export async function readOpenAiResponseStream(response: Response): Promise<{
  raw: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
}> {
  if (!response.body) throw new Error("openai_stream_missing_body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason = "unknown";

  const consumeEvent = (record: string): void => {
    const data = record.split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data) as Record<string, unknown>;
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      raw += event.delta;
      return;
    }
    if (event.type === "error" || event.type === "response.failed") {
      const failure = object(event.error) ?? object(event.response);
      throw new Error(`openai_stream_failed:${String(failure?.message ?? event.type)}`);
    }
    if (event.type === "response.completed" || event.type === "response.incomplete") {
      const completed = object(event.response);
      const usage = object(completed?.usage);
      const incompleteDetails = object(completed?.incomplete_details);
      inputTokens = Number(usage?.input_tokens ?? 0);
      outputTokens = Number(usage?.output_tokens ?? 0);
      stopReason = String(incompleteDetails?.reason ?? completed?.status ?? "completed");
      if (!raw && completed) raw = responseText(completed);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      consumeEvent(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
  if (buffer.trim()) consumeEvent(buffer);
  return { raw, inputTokens, outputTokens, stopReason };
}
