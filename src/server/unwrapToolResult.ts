/** Unwrap AI SDK tool result wrapper. The SDK wraps execute() return in { output: ... }. */
export function unwrapToolResult(result: unknown): unknown {
  if (result && typeof result === "object" && "output" in result) {
    return (result as { output: unknown }).output;
  }
  return result;
}
