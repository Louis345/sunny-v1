import { describe, expect, it } from "vitest";
import { answerInWording } from "./answerInWording";
import { spellingSuccessorToolkit, type SuccessorFacts } from "./spellingSuccessorTools";
import type { LearningCycleMathItem } from "./learningCycleRepository";

// Reina, 2026-11-25, Boss board 5: "Matilda, count this as a bug. When we did nine times four, it says the answer."
// The Planner wrote "The picture shows 9 circles. Each circle has 4 counters in it. In the equation 36 ÷ ? = 4, what
// number goes in the box?" (answer 9): the game has no picture, so the Planner put the picture into words, and the
// words held the answer. Why the human caught it: she read the 9 off the screen. Why the logs did not: add_problem
// logged the answer it computed but nothing compared it with the wording. Why the lab missed it: lab problems never
// describe a picture. Code knows both the wording and the computed answer, so code checks; the Planner decides.
const TONIGHT = "Write a division equation for the picture. The picture shows 9 circles. Each circle has 4 counters in it. In the equation 36 ÷ ? = 4, what number goes in the box?";

describe("answerInWording", () => {
  it("finds the answer written as a number or a word", () => {
    expect(answerInWording(TONIGHT, 9)).toBe("9");
    expect(answerInWording("There are nine bags of 4 apples. 36 ÷ ? = 4", 9)).toBe("nine");
    expect(answerInWording("Twenty-four stickers in 6 rows. How many stickers?", 24)).toBe("Twenty-four");
    expect(answerInWording("Half of 3.5 is ?", 1.75)).toBeNull();
    expect(answerInWording("Is it 1.75 or 2?", 1.75)).toBe("1.75");
  });

  it("does not match the answer inside a bigger number", () => {
    expect(answerInWording("36 ÷ 4 = ?", 9)).toBeNull();
    expect(answerInWording("19 + 90 + 1.9 = ?", 9)).toBeNull();
    expect(answerInWording("What is 6 × 7?", 42)).toBeNull();
  });
});

const problem = (id: string): LearningCycleMathItem => ({ id, prompt: `Problem ${id}`, lineage: { sourceEvidenceIds: ["school:lab"], exposure: "unseen", measurementRole: "practice" }, response: { mode: "numeric", expected: 4 } } as LearningCycleMathItem);
const facts = (): SuccessorFacts => ({
  builtIns: [], activities: [{ id: "generated-game", checkpoint: false, setup: { type: "generated-game" } }], explainer: { grade: "3", words: [] },
  evaluationIds: [], allowedActions: ["generate_support"], idPrefix: "hw-r68", selfReview: true, aimedGames: true,
  record: { lifecycle: "board_ready", observations: [] }, problems: [problem("p2-1")],
  answeredProblemIds: [], writeProblems: true, rerunnable: () => false, stepProblems: {},
});
const write = (prompt: string, answer_expression: string) => {
  const kit = spellingSuccessorToolkit(facts());
  const tool = kit.tools.find(row => row.name === "add_problem")!;
  const state = kit.initialState();
  const result = tool.run(state, tool.schema.parse({ based_on: "p2-1", prompt, answer_expression, why: "division from groups" }));
  return { result, state };
};

describe("add_problem tells the Planner when its wording holds the answer, and never blocks", () => {
  it("writes the problem and says the answer is in the wording, so the Planner can rewrite it", () => {
    const { result, state } = write(TONIGHT, "36 / 4");
    expect(result.ok).toBe(true);
    const fact = (result as { result: { answer_in_wording?: string } }).result.answer_in_wording;
    expect(fact).toMatch(/9/);
    expect(fact).toMatch(/rewrite/i);
    expect(Object.values(state.written ?? {})).toHaveLength(1);
  });

  it("says nothing when the answer is not in the wording", () => {
    const { result } = write("36 counters in groups of 4. 36 ÷ 4 = ?", "36 / 4");
    expect((result as { result: Record<string, unknown> }).result).not.toHaveProperty("answer_in_wording");
  });
});
