import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnswerRevealFilter, openAnswerItem, statesAnswer, type OpenAnswerItem } from "./answerRevealGate";

// Lab invariant for a human-caught bug (owner, 11/23 01:53 UTC, Ila's math board 12): Elli said "That's 49. Try typing 49
// this time." on try 5 of a fresh_checkpoint item (expected 49) while it was still open, and while the companion was muted
// the same sentence showed as text ("it showed me the answer"). Why the human caught it: Ila said so out loud. Why the
// logs did not flag it: the reply was logged as ordinary TTS text; no code compared a reply with the open item's answer
// (GAME_REVEAL_RULE lived only in the prompt). Why the lab missed it: no lab turn had a model that computes the answer
// from the visible problem; spelling is protected by keeping the word out of the model's input, math never was.

const checkpoint: OpenAnswerItem = {
  nodeId: "n", itemId: "problem-6", expected: 49, role: "fresh_checkpoint",
  prompt: "The pattern is 61, 58, 55, 52. The rule is −3. What number comes next after 52?",
};

function run(item: OpenAnswerItem | undefined, chunks: string[]) {
  const reveals: Array<{ sentence: string; allowed: boolean }> = [];
  const filter = createAnswerRevealFilter(() => item, (sentence, _item, allowed) => reveals.push({ sentence, allowed }));
  const out = chunks.map(chunk => filter.push(chunk)).join("") + filter.flush();
  return { out, reveals };
}

describe("an open item's answer never reaches her ears or screen unless the record allows it", () => {
  afterEach(() => vi.restoreAllMocks());

  it("withholds the 11/23 sentence on a checkpoint and keeps the rest of the reply", () => {
    const { out, reveals } = run(checkpoint, ["Let's sl", "ow it right down. The pattern dr", "ops by 3 each time: 61, 58, 55", ", 52... so the next one is 3 less than 52. That's", " 49. Try typing ", "49 this time."]);
    expect(out).toBe("Let's slow it right down. The pattern drops by 3 each time: 61, 58, 55, 52... so the next one is 3 less than 52. ");
    expect(reveals.map(r => r.allowed)).toEqual([false, false]);
  });

  it("catches the answer in words, not only digits", () => {
    expect(statesAnswer("It lands on forty-nine!", checkpoint)).toBe(true);
    expect(statesAnswer("Forty nine is the one.", checkpoint)).toBe(true);
    expect(statesAnswer("What is 52 take away 3?", checkpoint)).toBe(false);
    expect(statesAnswer("Is it 490?", checkpoint)).toBe(false);
  });

  it("a number already printed in the problem is not a reveal", () => {
    expect(statesAnswer("You typed 52, look again.", { ...checkpoint, expected: 52 })).toBe(false);
  });

  it("on a practice item the answer may be said, and the record is told (to mark it assisted)", () => {
    const { out, reveals } = run({ ...checkpoint, role: "practice" }, ["That's 49. Nice."]);
    expect(out).toBe("That's 49. Nice.");
    expect(reveals).toEqual([{ sentence: "That's 49. ", allowed: true }]);
  });

  it("with no open item the reply passes through unchanged, chunk for chunk", () => {
    const filter = createAnswerRevealFilter(() => undefined, () => { throw new Error("no item"); });
    expect(filter.push("That's 49")).toBe("That's 49");
    expect(filter.flush()).toBe("");
  });

  it("an item is open only while unsolved and only for a numeric answer the chart froze", () => {
    const cycle = { domain: "math", nodes: [{ nodeId: "n", evidenceContract: {
      itemRoles: { "problem-6": "fresh_checkpoint" },
      itemContracts: { "problem-6": { id: "problem-6", prompt: checkpoint.prompt, response: { mode: "numeric", expected: 49 } } },
    } }] } as never;
    expect(openAnswerItem(cycle, { nodeId: "n", itemId: "problem-6" }, false)).toEqual(checkpoint);
    expect(openAnswerItem(cycle, { nodeId: "n", itemId: "problem-6" }, true)).toBeUndefined();
    expect(openAnswerItem(cycle, undefined, false)).toBeUndefined();
  });

  it("is the one door: every companion reply goes through the gate before text or voice", () => {
    const runner = fs.readFileSync(path.join(process.cwd(), "src/server/companion-response-runner.ts"), "utf8");
    expect(runner).toMatch(/const spoken = answerGate\.push\(expressionTags\.push\(chunk\)\)/);
    expect(runner).toMatch(/answerGate\.push\(expressionTags\.flush\(\)\) \+ answerGate\.flush\(\)/);
    expect(runner).toMatch(/text = filterAnswerReveal\(session, text\)/);
    expect(fs.readFileSync(path.join(process.cwd(), "src/souls/companion-base.md"), "utf8")).toMatch(/GAME_REVEAL_RULE[\s\S]*code withholds/i);
  });
});

describe("the session records each reveal (11/23)", () => {
  it("a practice reveal marks the item assisted; a withheld one tells the companion why, in facts", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { SessionManager } = await import("./session-manager");
    const facts: string[] = [];
    const fake = { sessionId: "s1", mathDiscoverySupport: { itemId: "problem-6", nodeId: "n", supportIds: [] as string[] },
      debugRecorder: { recordEvent: () => {} }, noteExternalEvent: (event: { summary: string }) => facts.push(event.summary) };
    const note = (SessionManager.prototype as unknown as { noteAnswerReveal: (...args: unknown[]) => void }).noteAnswerReveal;
    note.call(fake, "That's 49. ", { ...checkpoint, role: "practice" }, true);
    expect(fake.mathDiscoverySupport.supportIds).toEqual(["answer_revealed:s1:problem-6"]);
    expect(facts).toEqual([]);
    note.call(fake, "That's 49. ", checkpoint, false);
    expect(facts[0]).toMatch(/check of what she can do alone/);
  });
});
