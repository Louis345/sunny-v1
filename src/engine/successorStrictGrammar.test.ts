import { describe, expect, it } from "vitest";
import { plannerToolDefinitions } from "./plannerToolLoop";
import { strictBudget } from "./plannerTransport";
import { spellingSuccessorToolkit, type SuccessorFacts } from "./spellingSuccessorTools";
import type { LearningCycleMathItem } from "./learningCycleRepository";

// 2026-11-10, Ila on the kiosk: after board 8 the provider refused the next-board request with
// "The compiled grammar is too large", and she sat about 15 minutes on "next board coming".
// Why the human caught it: the only visible symptom was a child waiting on a board that never came.
// Why the logs did not alert: the 400 was logged by planner-transport, but nothing raised a parent alert for it.
// Why the lab missed it: every fixture had 2 or 3 games, a few words and evaluations. The strict tools listed
// her played games, built-ins, words, problems and evaluation ids as enums, so the compiled grammar grew with
// every board, and only a real 8-board history reached the provider's limit. Invariant: the strict grammar
// is the same size for a long history as for a short one; the history's ids are checked by code instead.
const longId = (i: number) => `hw-spelling-caaeebeb:b${i % 9}:hw-spelling-caaeebeb-r${300 + i}-step-${i % 5}`;
const wordId = (i: number) => `hw-spelling-caaeebeb:word-${i}-${"x".repeat(12)}`;
const problem = (id: string): LearningCycleMathItem => ({ id, prompt: `Problem ${id}`, lineage: { sourceEvidenceIds: ["school:lab"], exposure: "unseen", measurementRole: "practice" }, response: { mode: "numeric", expected: 4 } } as LearningCycleMathItem);
const activities: NonNullable<SuccessorFacts["activities"]> = [
  { id: "word-radar:hidden_word_recall", checkpoint: true, setup: { type: "word-radar" } },
  { id: "generated-game", checkpoint: false, setup: { type: "generated-game" } },
];
const history = (size: { games: number; words: number; evaluations: number; problems?: number }): SuccessorFacts => {
  const words = Array.from({ length: size.words }, (_, i) => wordId(i));
  return {
    builtIns: Array.from({ length: size.games }, (_, i) => ({ nodeId: longId(i), title: `Game ${i}`, implementationType: "word-radar", wordIds: words.slice(i % words.length, (i % words.length) + 3), responseMode: "spelling_letters", checkpoint: i % 2 === 0 })),
    activities, explainer: { grade: "3", words: words.map((id, i) => ({ wordId: id, word: `word${i}` })) },
    evaluationIds: Array.from({ length: size.evaluations }, (_, i) => `eval:hw-spelling-caaeebeb:r${i}:prediction-${i}`),
    allowedActions: ["generate_support", "generate_quest", "collect_more_evidence"], idPrefix: "next-r9",
    creatureEncounters: true, selfReview: true, aimedGames: true, rewardBreak: true,
    playedGames: Array.from({ length: size.games }, (_, i) => ({ nodeId: `${longId(i)}-built`, title: `Built ${i}`, answers: 4, right: 2 })),
    record: { lifecycle: "board_ready", observations: [] },
    ...(size.problems ? { builtIns: [], problems: Array.from({ length: size.problems }, (_, i) => problem(`hw-math-feedbeef:item-${i}`)), answeredProblemIds: [], writeProblems: true } : {}),
    rerunnable: () => true,
  };
};
const small = { games: 2, words: 3, evaluations: 2 }, large = { games: 40, words: 60, evaluations: 200 };
/** What the provider compiles: every strict tool's schema without its descriptions, which are read, never compiled. */
const grammar = (facts: SuccessorFacts) => {
  const strict = plannerToolDefinitions(spellingSuccessorToolkit(facts).tools).filter(tool => (tool as { strict?: boolean }).strict);
  const strip = (node: unknown): unknown => Array.isArray(node) ? node.map(strip)
    : node && typeof node === "object" ? Object.fromEntries(Object.entries(node).filter(([key]) => key !== "description").map(([key, value]) => [key, key === "properties"
      ? Object.fromEntries(Object.entries(value as object).map(([field, sub]) => [field, strip(sub)])) : strip(value)])) : node;
  const enums: string[] = [];
  const collect = (node: unknown): void => { if (Array.isArray(node)) node.forEach(collect); else if (node && typeof node === "object") for (const [key, value] of Object.entries(node)) key === "enum" ? enums.push(...(value as string[])) : collect(value); };
  strict.forEach(tool => collect(tool.input_schema));
  return { chars: JSON.stringify(strict.map(tool => ({ name: tool.name, input_schema: strip(tool.input_schema) }))).length, enumChars: enums.join("").length, budget: strictBudget(strict) };
};

describe("the next-board strict grammar does not grow with her history", () => {
  for (const [subject, extra] of [["spelling", {}], ["math", { problems: 30 }]] as const) {
    it(`${subject}: a 40-game history compiles to the same strict grammar as a 2-game one`, () => {
      const short = grammar(history({ ...small, ...(subject === "math" ? { problems: 3 } : {}) })), long = grammar(history({ ...large, ...extra }));
      expect(long.chars).toBe(short.chars);
      expect(long.enumChars).toBe(short.enumChars);
      expect(long.budget.unsupported).toEqual([]);
      expect(long.budget).toEqual(short.budget);
    });
  }
});

describe("code checks every history id the grammar no longer lists", () => {
  const session = (facts: SuccessorFacts) => {
    const kit = spellingSuccessorToolkit(facts), state = kit.initialState();
    const call = (name: string, input: Record<string, unknown>) => {
      const tool = kit.tools.find(row => row.name === name)!;
      const parsed = tool.schema.safeParse(input);
      return parsed.success ? tool.run(state, parsed.data) : { ok: false as const, error: parsed.error.issues.map(issue => issue.message).join("; ") };
    };
    return { call, facts };
  };
  const decide = (facts: SuccessorFacts, overrides: Record<string, unknown> = {}) => ({ status: "revised", reason: "r", progression_action: "generate_support", preserve: [], change: [], test_next: [], next_evidence_required: [],
    prediction_evaluation_ids: [facts.evaluationIds[5]], revised_hypothesis: "",
    self_review: { what_i_tried: "a", what_happened: "b", why: "c", what_i_keep: "d", what_i_change_now: "e" }, ...overrides });
  const step = { title: "Stop", purpose: "p", story: "s", picture: "pic", encounter: "none" };
  const fixable = (result: unknown, bad: string) => expect(result).toMatchObject({ ok: false, error: expect.stringMatching(new RegExp(`${bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} is not one of .*valid:`)) });

  it("decide: prediction_evaluation_ids, game_notes.game and expect_on_her_own.item", () => {
    const { call, facts } = session(history(large));
    fixable(call("decide", decide(facts, { prediction_evaluation_ids: ["eval-made-up"] })), "eval-made-up");
    fixable(call("decide", decide(facts, { game_notes: [{ game: "game-made-up", verdict: "keep", why: "w" }] })), "game-made-up");
    fixable(call("decide", decide(facts, { expect_on_her_own: [{ item: "word-made-up", right: true }] })), "word-made-up");
    expect(call("decide", decide(facts, { game_notes: [{ game: facts.playedGames![39].nodeId, verdict: "keep", why: "w" }], expect_on_her_own: [{ item: wordId(41), right: true }] }))).toMatchObject({ ok: true });
  });

  it("spelling add_step: built_in, words and build_from", () => {
    const { call, facts } = session(history(large));
    call("decide", decide(facts));
    fixable(call("add_step", { ...step, built_in: "radar-made-up", words: [] }), "radar-made-up");
    fixable(call("add_step", { ...step, built_in: "generated-game", words: ["word-made-up"] }), "word-made-up");
    fixable(call("add_step", { ...step, built_in: "generated-game", words: [wordId(1)], build_from: "game-made-up" }), "game-made-up");
    expect(call("add_step", { ...step, built_in: longId(7), words: [] })).toMatchObject({ ok: true });
    expect(call("add_step", { ...step, built_in: "generated-game", words: [wordId(1)], build_from: facts.playedGames![12].nodeId })).toMatchObject({ ok: true });
  });

  it("math: expect_on_her_own.item, add_step problems and build_from, add_problem based_on", () => {
    const { call, facts } = session(history({ ...large, problems: 30 }));
    const real = facts.problems![29].id;
    fixable(call("decide", decide(facts, { expect_on_her_own: [{ item: "item-made-up", right: true }] })), "item-made-up");
    expect(call("decide", decide(facts, { expect_on_her_own: [{ item: real, right: false }] }))).toMatchObject({ ok: true });
    fixable(call("add_step", { ...step, built_in: "generated-game", problems: ["item-made-up"], check_first: false }), "item-made-up");
    fixable(call("add_step", { ...step, built_in: "generated-game", problems: [real], check_first: false, build_from: "game-made-up" }), "game-made-up");
    expect(call("add_step", { ...step, built_in: "generated-game", problems: [real], check_first: false, build_from: facts.playedGames![3].nodeId })).toMatchObject({ ok: true });
    fixable(call("add_problem", { based_on: "item-made-up", prompt: "2 + 2", answer_expression: "2 + 2", why: "w" }), "item-made-up");
    expect(call("add_problem", { based_on: real, prompt: "2 + 2", answer_expression: "2 + 2", why: "w" })).toMatchObject({ ok: true, result: { problem_id: "next-r9-problem-1" } });
    // A written problem's placeholder id is still accepted once written, and never before.
    expect(call("add_step", { ...step, built_in: "generated-game", problems: ["next-r9-problem-1"], check_first: false })).toMatchObject({ ok: true });
    expect(call("add_step", { ...step, built_in: "generated-game", problems: ["next-r9-problem-2"], check_first: false })).toMatchObject({ ok: false, error: expect.stringContaining("add_problem") });
  });

  it("keeps the none sentinel when there is nothing to name", () => {
    const { call, facts } = session({ ...history(small), playedGames: [], evaluationIds: [] });
    expect(call("decide", decide(facts, { prediction_evaluation_ids: [], expect_on_her_own: [{ item: wordId(0), right: true }] }))).toMatchObject({ ok: true });
  });
});
