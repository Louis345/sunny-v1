import { describe, expect, it } from "vitest";
import { pronunciationBoardCompletion } from "../utils/pronunciationBoardCompletion";

// Human-caught 2026-11-08 (owner watching Ila): Echo Canyon was played five times (3/9 ... 9/9) and never
// counted, so it kept coming back and the board's last stop stayed locked. Why: the board only told Elli the
// game ended; it never sent the stop's completion. Logs showed pronunciation_complete but no
// [learning-cycle-route] [completion] line; the lab tested the game's result, never the board stop.
describe("Echo Canyon completes its board stop", () => {
  const bindings = [{ itemId: "w-charge", word: "charge" }, { itemId: "w-carton", word: "carton" }];
  it("sends the stop's completion with each word bound to her item, as the game's own report", () => {
    const payload = pronunciationBoardCompletion({
      accuracy: 89, wordsAttempted: 9, targetResults: [
        { target: "charge", correct: true, attempts: 1, scaffoldLevel: 0, mode: "read", struggleSignals: [] },
        { target: "Carton", correct: false, attempts: 2, scaffoldLevel: 0, mode: "read", struggleSignals: [] },
      ],
    } as never, bindings);
    expect(payload).toMatchObject({ completed: true, accuracy: 0.89, wordsAttempted: 9 });
    expect(payload.targetResults).toEqual([
      { target: "w-charge", correct: true, attempts: 1, scaffoldLevel: 0 },
      { target: "w-carton", correct: false, attempts: 2, scaffoldLevel: 0 },
    ]);
  });

  it("leaves out words that are not on her list instead of failing the whole stop", () => {
    const payload = pronunciationBoardCompletion({ accuracy: 0.5, wordsAttempted: 2, targetResults: [
      { target: "charge", correct: true, attempts: 1, scaffoldLevel: 0, mode: "read", struggleSignals: [] },
      { target: "zebra", correct: true, attempts: 1, scaffoldLevel: 0, mode: "read", struggleSignals: [] },
    ] } as never, bindings);
    expect(payload.targetResults.map(row => row.target)).toEqual(["w-charge"]);
  });
});
