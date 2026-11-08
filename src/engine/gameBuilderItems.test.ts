import { describe, expect, it } from "vitest";
import type { LearningCycleNodeContract } from "./learningCycleRepository";
import { gameItemLines, gameProblems } from "./spellingGameBuilder";

// One pipeline for every subject (owner, 2026-11-08): the builder that makes "Her Game" builds math games too.
// It sees each problem and how she answers it, never the answer; code scores her answers.
const mathNode = {
  nodeId: "scout-check",
  evidenceContract: {
    itemContracts: {
      m1: { id: "m1", prompt: "7 + 6. Is the sum even or odd?", lineage: { sourceEvidenceIds: [], exposure: "unseen", measurementRole: "fresh_checkpoint" },
        response: { mode: "selection", options: [{ id: "even", label: "Even", correct: false }, { id: "odd", label: "Odd", correct: true }] } },
      m2: { id: "m2", prompt: "15 - 8 =", lineage: { sourceEvidenceIds: [], exposure: "unseen", measurementRole: "fresh_checkpoint" },
        response: { mode: "numeric", expected: 7 } },
    },
  },
} as unknown as LearningCycleNodeContract;

describe("the shared game builder", () => {
  it("lists each math problem and how she answers it, never the answer", () => {
    const lines = gameItemLines(mathNode).join("\n");
    expect(lines).toContain("m1: 7 + 6. Is the sum even or odd?");
    expect(lines).toContain("Even [even]");
    expect(lines).toContain("Odd [odd]");
    expect(lines).toContain("m2: 15 - 8 =");
    expect(lines).toMatch(/m2[^\n]*number/);
    expect(lines).not.toMatch(/correct|\b7\b(?! \+)/);
  });

  it("needs a math game to open each problem through openItem so her answers bind", () => {
    const game = `<html><body><script>window.openItem("m1");window.fireAttemptEvent({target:"m1",attemptedValue:"odd"});window.sendNodeComplete({completed:true});</script></body></html>`;
    expect(gameProblems(game, "math")).toEqual([]);
    expect(gameProblems(game.replace("window.openItem", "console.log"), "math").join(" ")).toMatch(/openItem/);
    // Spelling keeps its own opener.
    expect(gameProblems(game, "spelling").join(" ")).toMatch(/openSpellingItem/);
  });
});
