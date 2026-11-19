import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { claudeCallPart, recordClaudeUsage, usageFromResponseText } from "./claudeUsageLog";

// BUGS.md S25 (owner, 2026-11-18, after the Anthropic credit ran out): only the Planner logged tokens, so nobody could
// say what spent the money. Rule: every Claude call logs part, model and tokens, and a daily total per part is kept.
it("reads tokens from a JSON reply and from a streamed one", () => {
  expect(usageFromResponseText(JSON.stringify({ usage: { input_tokens: 10, cache_read_input_tokens: 5, output_tokens: 3 } })))
    .toEqual({ input: 10, cacheRead: 5, cacheWrite: 0, output: 3 });
  const sse = 'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":40,"cache_creation_input_tokens":7,"output_tokens":1}}}\n\n'
    + 'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":90}}\n\n';
  expect(usageFromResponseText(sse)).toEqual({ input: 40, cacheRead: 0, cacheWrite: 7, output: 90 });
});

it("names the part from the request and keeps a daily total per part", () => {
  expect(claudeCallPart({ tools: [{ name: "add_step" }] })).toBe("tools:add_step");
  expect(claudeCallPart({ system: "You are Elli, a warm companion" })).toBe("system:you-are-elli-a");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-usage-"));
  try {
    const now = new Date("2026-11-18T12:00:00Z");
    for (const output of [3, 4]) recordClaudeUsage({ part: "tools:add_step", model: "claude-opus-5-5", usage: { input: 10, cacheRead: 0, cacheWrite: 0, output }, logDir: dir, now });
    const totals = JSON.parse(fs.readFileSync(path.join(dir, "2026-11-18.json"), "utf8"));
    expect(totals["tools:add_step claude-opus-5-5"]).toMatchObject({ calls: 2, input: 20, output: 7 });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
