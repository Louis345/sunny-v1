import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Audit 2026-11-22 (docs/audits/deterministic-code.md, "Prompt forced lines"): prompts that tell the companion the exact
// words to say make every companion sound the same and script her. Prompts give goals and facts; she chooses the words.
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("prompts give goals and facts, never a line to say", () => {
  it("the worksheet prompt does not hand her quoted lines to say", () => {
    const source = read("src/agents/prompts/worksheetSessionPrompt.ts");
    expect(source).not.toMatch(/say "You're right, let me recount/);
    expect(source).not.toMatch(/say "It should be on your screen/);
  });

  it("the reading-complete event does not dictate her reply shape", () => {
    expect(read("src/server/game-event-handler.ts")).not.toMatch(/Reply with exactly one short sentence/);
  });

  it("the spelling verdict is a fact, not a celebrate/encourage script, and not a hardcoded child name", () => {
    const source = read("src/server/session-manager.ts");
    expect(source).not.toMatch(/celebrate and move on/);
    expect(source).not.toMatch(/encourage and give a hint/);
    expect(source).not.toMatch(/\[Spelling verdict: Ila said/);
  });

  it("Matilda's persona has no fixed opening or closing shape", () => {
    expect(read("src/companions/matilda.md")).not.toMatch(/\b(?:open|close|end|start) (?:every|each)\b|^##\s*(?:Opening|Closing)/im);
  });
});
