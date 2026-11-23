import { describe, expect, it } from "vitest";
import { spellingSuccessorToolkit, type SuccessorFacts } from "./spellingSuccessorTools";
import type { LearningCycleMathItem } from "./learningCycleRepository";

// 2026-11-23, Ila's board 13 on Saori (owner replan): the new Planner read its board-12 wording, then in one turn sent
// seven add_problem calls. Three named board-12 STEP ids (hw-math-21cc76a6-r198-step-1) as based_on, were refused, and
// the loop's error cap (3 errors in total) ended the decision before the Planner could read the refusals; the board
// was blocked and her cycle sat in baseline_evaluating. Why the human caught it: board 13 never appeared after the
// approved replan. Why logs did not alert: cap_errors is logged as a stop, not as a child waiting. Why the lab missed
// it: every lab Planner made one mistake per turn, so the total cap and the per-turn cap were the same thing, and no
// lab board offered a step id the Planner could mistake for a problem. Invariants: (1) errors go back to the model;
// only consecutive erroring turns stop the loop; (2) a step id that showed exactly one problem is read as that problem,
// and any other non-problem id is refused with how to find problem ids.
const problem = (id: string): LearningCycleMathItem => ({ id, prompt: `Problem ${id}`, lineage: { sourceEvidenceIds: ["school:lab"], exposure: "unseen", measurementRole: "practice" }, response: { mode: "numeric", expected: 4 } } as LearningCycleMathItem);
const facts = (): SuccessorFacts => ({
  builtIns: [], activities: [{ id: "generated-game", checkpoint: false, setup: { type: "generated-game" } }], explainer: { grade: "3", words: [] },
  evaluationIds: [], allowedActions: ["generate_support"], idPrefix: "hw-r213", selfReview: true, aimedGames: true,
  record: { lifecycle: "board_ready", observations: [] }, problems: [problem("p3-9"), problem("hw-r198-step-problem-6"), problem("p2-1a")],
  answeredProblemIds: [], writeProblems: true, rerunnable: () => false,
  stepProblems: { "hw-r198-step-1": ["hw-r198-step-problem-6"], "hw-r198-step-2": ["p3-9", "p2-1a"] },
});
const addProblem = (based_on: string) => {
  const kit = spellingSuccessorToolkit(facts());
  const tool = kit.tools.find(row => row.name === "add_problem")!;
  const input = { based_on, prompt: "Round 648 to the nearest hundred.", answer_expression: "600", why: "place value" };
  const parsed = tool.schema.safeParse(input);
  return parsed.success ? tool.run(kit.initialState(), parsed.data) : { ok: false as const, error: parsed.error.message };
};

describe("based_on names a real recorded problem", () => {
  it("reads a board step id that showed exactly one problem as that problem", () => {
    expect(addProblem("hw-r198-step-1")).toMatchObject({ ok: true, result: { based_on: "hw-r198-step-problem-6" } });
  });
  it("refuses a step that showed several problems and names them", () => {
    const outcome = addProblem("hw-r198-step-2");
    expect(outcome.ok).toBe(false);
    expect(JSON.stringify(outcome)).toContain("p3-9");
    expect(JSON.stringify(outcome)).toContain("p2-1a");
  });
  it("refuses an unknown id and says where problem ids are", () => {
    const outcome = addProblem("nothing-like-it");
    expect(outcome.ok).toBe(false);
    expect(JSON.stringify(outcome)).toContain("Her recorded problems");
  });
  it("still accepts a recorded problem id as it is", () => {
    expect(addProblem("p3-9")).toMatchObject({ ok: true });
  });
});

describe("the steps the Planner can name", () => {
  it("keys each step by its node id and by the step id after the last colon", async () => {
    const { stepProblemsOf } = await import("./learningCycleRuntime");
    const node = (nodeId: string, items: string[]) => ({ nodeId, evidenceContract: { itemContracts: Object.fromEntries(items.map(id => [id, problem(id)])) } });
    const map = stepProblemsOf({ nodes: [node("hw-math-21cc76a6:b12:hw-math-21cc76a6-r198-step-1", ["p3-9"]), node("hw-math-21cc76a6:b12:hw-math-21cc76a6-r198-step-3", [])] } as never);
    expect(map["hw-math-21cc76a6-r198-step-1"]).toEqual(["p3-9"]);
    expect(map["hw-math-21cc76a6:b12:hw-math-21cc76a6-r198-step-1"]).toEqual(["p3-9"]);
    expect(map["hw-math-21cc76a6-r198-step-3"]).toBeUndefined();
  });
});
