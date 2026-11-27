import { describe, expect, it } from "vitest";
import { companionMathTestObjective } from "./schoolTestObjective";

// Owner 2026-11-08: Reina's math test is tomorrow; Matilda should know it as her goal plus facts, as Elli does
// for spelling. Found by the owner asking whether Matilda knows; the spelling objective was wired for spelling only.
describe("Matilda is told the math test goal and the facts", () => {
  const cycle = {
    homeworkId: "hw-math", domain: "math",
    nodes: [{ nodeId: "warm-up", evidenceContract: { itemContracts: { p1: { id: "p1", prompt: "7 + 6, even or odd?" }, p2: { id: "p2", prompt: "15 - 8" } } } }],
    observations: [
      { itemId: "p1", result: { correct: true }, assistance: { status: "unassisted" }, observedAt: "2026-11-08T21:00:00Z" },
      { itemId: "p2", result: { correct: false }, assistance: { status: "assisted" }, observedAt: "2026-11-08T21:01:00Z" },
    ],
  } as never;
  const homework = { waterfall: { current: { homeworkId: "hw-math", testDate: "2026-11-09" } } };
  it("gives the goal, tomorrow's date and how her problems have gone", () => {
    const text = companionMathTestObjective({ cycle, homework, now: new Date(2026, 10, 8, 16) });
    expect(text).toContain("Her goal is to solve problems like these on her own by the school test.");
    expect(text).toContain("School test: Monday 2026-11-09. Today is 2026-11-08: 1 day left.");
    expect(text).toContain("on her own 1 of 1 right");
    expect(text).toContain("with help 0 of 1 right");
    expect(text.split("\n").filter(line => /\b(do not|don't|never|must not)\b/i.test(line))).toEqual([]);
  });
});
