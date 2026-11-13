import { describe, expect, it } from "vitest";
import { measurePlannerQuestion, renderPlannerQuestionMeasure } from "./measurePlannerQuestion";

// A made-up next-board question shaped like the frozen progression-decision-*-tools.question.json.
const words = [{ wordId: "w-zebra", word: "zebra" }, { wordId: "w-quilt", word: "quilt" }];
const cycle = {
  lifecycle: "quest_evaluating",
  assignment: { title: "List" },
  evidence: [{ id: "e1", byWord: { zebra: 1, quilt: 0 } }, { id: "e2", byWord: { zebra: 1 } }],
  observations: [{ id: "o1" }],
  nodes: [],
};
const prompt = [
  "You are Sunny's AI Planner.",
  "1. decide",
  "Saved spelling words:",
  JSON.stringify(words),
  "Child chart context:",
  JSON.stringify({ interests: ["cats"], recentWords: { zebra: { misses: 2 } } }),
  "Baseline Quest eligibility (runtime truth boundary, not a mastery judgment):",
  JSON.stringify({ eligible: true }),
  "Allowed progression actions: generate_quest, generate_support",
  "Cycle:",
  JSON.stringify(cycle),
].join("\n");
const question = { prompt, model: "m", facts: { builtIns: [], activities: [] } };

describe("measurePlannerQuestion", () => {
  it("accounts for every character of the prompt in exactly one section", () => {
    const measure = measurePlannerQuestion(question);
    expect(measure.promptChars).toBe(prompt.length);
    expect(measure.sections.reduce((sum, row) => sum + row.chars, 0)).toBe(prompt.length);
    expect(measure.sections.map(row => row.section)).toEqual(["instructions", "Saved spelling words", "Child chart context", "Baseline Quest eligibility", "Cycle"]);
  });

  it("breaks each JSON section into its fields, with item counts for lists", () => {
    const rows = measurePlannerQuestion(question).fields;
    const evidence = rows.find(row => row.path === "Cycle.evidence")!;
    expect(evidence.chars).toBe(JSON.stringify(cycle.evidence).length);
    expect(evidence.items).toBe(2);
    expect(rows.find(row => row.path === "Child chart context.interests")?.items).toBe(1);
  });

  it("never names a saved spelling word, even where the chart uses one as a key", () => {
    const measure = measurePlannerQuestion(question);
    const text = renderPlannerQuestionMeasure([{ file: "q.json", measure }]);
    expect(text).not.toMatch(/zebra|quilt|cats/);
    expect(measure.fields.map(row => row.path)).toContain("Child chart context.recentWords.<word>");
  });

  it("sizes the tool definitions sent beside the prompt", () => {
    const tools = [{ name: "decide", input_schema: { type: "object" } }];
    const measure = measurePlannerQuestion(question, tools);
    expect(measure.toolChars).toBe(JSON.stringify(tools).length);
    expect(measure.totalChars).toBe(prompt.length + JSON.stringify(tools).length);
  });

  it("shows each saved question's total in a growth table", () => {
    const small = measurePlannerQuestion(question);
    const big = measurePlannerQuestion({ ...question, prompt: `${prompt}\nMore instructions.` });
    const text = renderPlannerQuestionMeasure([{ file: "a.json", measure: small }, { file: "b.json", measure: big }]);
    expect(text).toMatch(new RegExp(`a\\.json.*${small.totalChars}`));
    expect(text).toMatch(new RegExp(`b\\.json.*${big.totalChars}`));
  });
});
