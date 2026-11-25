import { describe, expect, it } from "vitest";
import type { LearningCycleNodeContract } from "./learningCycleRepository";
import { gameItemLines, gameProblems } from "./spellingGameBuilder";

// One pipeline for every subject (owner, 2026-11-08): the builder that makes "Her Game" builds math games too.
// Human-caught 2026-11-23 (Ila's board 15 Quest): math games were never given the answers (74d1d79e), so the Quest lit
// a lantern for 64→70 and 428→500 and she believed she was right. Spelling games always knew her words and could
// react. Why logs did not catch it: the record was scored correctly. Why the lab missed it: tests checked the answer
// was hidden from the game, never what she sees after answering. Now math games know the answer, as spelling games
// do; code still scores her answers from the answer recorded at intake.
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
  it("lists each math problem, how she answers it, and its answer, so the game can tell her", () => {
    const lines = gameItemLines(mathNode).join("\n");
    expect(lines).toContain("m1: 7 + 6. Is the sum even or odd?");
    expect(lines).toContain("Even [even]");
    expect(lines).toContain("Odd [odd]");
    expect(lines).toContain("m2: 15 - 8 =");
    expect(lines).toMatch(/m2[^\n]*number/);
    expect(lines).toMatch(/m1[^\n]*answer: Odd \[odd\]/);
    expect(lines).toMatch(/m2[^\n]*answer: 7/);
  });

  it("needs a math game to open each problem through openItem so her answers bind", () => {
    const game = `<html><body><script>window.openItem("m1");window.reportStep("answer","Pick odd or even.");window.fireAttemptEvent({target:"m1",attemptedValue:"odd"});window.sendNodeComplete({completed:true});</script></body></html>`;
    expect(gameProblems(game, "math")).toEqual([]);
    expect(gameProblems(game.replace("window.openItem", "console.log"), "math").join(" ")).toMatch(/openItem/);
    // Spelling keeps its own opener.
    expect(gameProblems(game, "spelling").join(" ")).toMatch(/openSpellingItem/);
  });

  // Ila, 2026-11-25 (board 16): games with problem ids written into their code reported her answers under another
  // board's problems; 8 answers were refused. The builder is told to read ids from itemBindings; now code checks it, and
  // the one repair turn the builder already gets fixes it, with no person involved.
  it("sends a math game back for repair when it writes problem ids into its code", () => {
    const reads = `<html><body><script>const items=window.GAME_PARAMS.itemBindings;window.openItem(items[0].itemId);window.reportStep("answer","Go.");window.fireAttemptEvent({target:items[0].itemId,attemptedValue:"4"});window.sendNodeComplete({completed:true});</script></body></html>`;
    expect(gameProblems(reads, "math")).toEqual([]);
    const written = reads.replace("items[0].itemId,attemptedValue", '"hw-math-21cc76a6-r248-step-problem-6",attemptedValue');
    expect(gameProblems(written, "math").join(" ")).toMatch(/hw-math-21cc76a6-r248-step-problem-6[^]*GAME_PARAMS\.itemBindings/);
  });
});
