import { describe, expect, it } from "vitest";
import { buildItemIntakePrompt, itemIntakeToolkit } from "./itemIntakeTools";

// One pipeline (owner, 2026-11-08): a math worksheet goes through the same Planner tools shape as spelling.
// The Planner records the problems and plans her first board; code checks facts, never how to teach.
const packet = { childId: "lab-child", sourceDocument: { fileHash: "abc", pages: [{ pageNumber: 1 }] }, childChart: { childVoice: { interests: ["races"] } } } as never;
const run = (kit: ReturnType<typeof itemIntakeToolkit>, state: unknown, name: string, input: unknown) =>
  kit.tools.find(tool => tool.name === name)!.run(state as never, input as never) as { ok: boolean; error?: string; result?: unknown };

const items = [
  { id: "p1", problem: "7 + 6. Is the sum even or odd?", page_number: 1, answer: { kind: "choice", options: [{ id: "even", label: "Even" }, { id: "odd", label: "Odd" }], correct_option_id: "odd" } },
  { id: "p2", problem: "15 - 8 =", page_number: 1, answer: { kind: "number", value: 7 } },
];

describe("math intake tools", () => {
  it("records the problems and plans stops, each with its problems and a prediction", () => {
    const kit = itemIntakeToolkit(packet);
    const state = kit.initialState();
    expect(run(kit, state, "record_items", { items, source_notes: [] }).ok).toBe(true);
    expect(run(kit, state, "add_stop", { title: "Scout Camp", story: "a race up the mountain", picture: "a trail", purpose: "see where she is", item_ids: ["p1", "p2"], check_first: true,
      prediction: { expected_correct_min: 0.5, expected_correct_max: 0.9, confidence: 0.6, why: "she knew sums last week" } }).ok).toBe(true);
    expect(run(kit, state, "finish_intake", { title: "Even and odd sums", theory: "Secure on sums; parity is new" }).ok).toBe(true);
    const result = kit.result(state);
    expect(result.items.map(item => item.id)).toEqual(["p1", "p2"]);
    expect(result.items[0]!.response).toEqual({ mode: "selection", options: [{ id: "even", label: "Even", correct: false }, { id: "odd", label: "Odd", correct: true }] });
    expect(result.items[1]!.response).toEqual({ mode: "numeric", expected: 7 });
    expect(result.stops[0]).toMatchObject({ title: "Scout Camp", itemIds: ["p1", "p2"], checkFirst: true });
  });

  it("sends a wrong answer back to the Planner instead of blocking anything", () => {
    const kit = itemIntakeToolkit(packet);
    const state = kit.initialState();
    const wrongSum = run(kit, state, "record_items", { items: [{ ...items[1], answer: { kind: "number", value: 8 } }], source_notes: [] });
    expect(wrongSum.ok).toBe(false);
    expect(wrongSum.error).toMatch(/p2.*7/);
    const wrongParity = run(kit, state, "record_items", { items: [{ ...items[0], answer: { ...items[0]!.answer, correct_option_id: "even" } }], source_notes: [] });
    expect(wrongParity.ok).toBe(false);
    expect(wrongParity.error).toMatch(/p1.*odd/);
  });

  it("checks that a stop uses recorded problems and that the board has a stop", () => {
    const kit = itemIntakeToolkit(packet);
    const state = kit.initialState();
    run(kit, state, "record_items", { items, source_notes: [] });
    expect(run(kit, state, "finish_intake", { title: "t", theory: "t" }).ok).toBe(false);
    expect(run(kit, state, "add_stop", { title: "x", story: "x", picture: "x", purpose: "x", item_ids: ["p9"], check_first: false,
      prediction: { expected_correct_min: 0, expected_correct_max: 1, confidence: 0.5, why: "x" } }).error).toMatch(/p9/);
  });

  it("gives the Planner the goal, the facts and the tools, with no do-not lines", () => {
    const prompt = buildItemIntakePrompt(packet);
    expect(prompt).toContain("she wants to come back to Sunny");
    expect(prompt.split("\n").filter(line => !/^\s*[[{"]/.test(line)).filter(line => /\b(do not|don't|never|must not)\b/i.test(line))).toEqual([]);
  });
});
