import { describe, expect, it } from "vitest";
import { pickPortraitLift, layoutCoverageProblems, type LayoutBox } from "../shared/layoutCoverage";

// S40 (Kappa Pond, 11/20 01:40 UTC): the game's instruction banner covered its own rule sign ("Rule −4 subtract 4").
// S41 (arcade reward break, 11/20 01:42 UTC): the companion portrait sat on a game button. One rule for both: nothing
// covers a game's controls or the pieces it marks as key. Why the human caught it: the screenshot. Why the logs missed
// it: nothing measured layout. Why the lab missed it: no check rendered a game and hit-tested its controls.

const box = (x: number, y: number, w: number, h: number, label = "b"): LayoutBox => ({ x, y, w, h, label });

describe("the companion portrait stays home and never sits on a game control (S41)", () => {
  const viewport = { w: 1470, h: 956 };
  const portrait = { w: 188, h: 188 };

  it("stays in the bottom-right corner when its circle covers nothing", () => {
    expect(pickPortraitLift(viewport, portrait, 16, [box(600, 850, 80, 60, "jump")])).toEqual({ lift: 0, coveredLabels: [] });
  });

  // 11/22 (owner's screenshot, Ila's rounding game): the game filled the screen except a dark strip on the right; the
  // check measured the portrait together with its "Quiet companion" pill and hint text, saw the Roll! button under that
  // larger box, and jumped Elli to the top-left corner. Her circle alone covered nothing.
  it("does not move for the rounding game's Roll! button, which sits left of her circle", () => {
    const controls = [box(1085, 870, 150, 70, "Roll!"), box(1000, 780, 235, 75, "answer"), box(1145, 30, 80, 80, "sound")];
    expect(pickPortraitLift(viewport, portrait, 16, controls).lift).toBe(0);
  });

  it("slides up the right edge just enough when a button is really under her, never to another corner", () => {
    const choice = pickPortraitLift(viewport, portrait, 16, [box(1300, 860, 120, 70, "fire")]);
    expect(choice.lift).toBeGreaterThan(0);
    expect(viewport.h - 16 - choice.lift).toBeLessThanOrEqual(860);
    expect(choice.lift).toBeLessThanOrEqual(viewport.h / 2);
  });

  it("stays home and reports what it covers when no spot on the right edge is free", () => {
    const column = Array.from({ length: 12 }, (_, i) => box(1250, i * 80, 220, 70, `b${i}`));
    const choice = pickPortraitLift(viewport, portrait, 16, column);
    expect(choice.lift).toBe(0);
    expect(choice.coveredLabels.length).toBeGreaterThan(0);
  });
});

describe("game text never covers the game's controls or key pieces (S40)", () => {
  it("reports each covered control by what covers it", () => {
    expect(layoutCoverageProblems([{ target: "Rule −4 subtract 4", coveredBy: "That is 4 fingers. Where does Kappa land? Type the number." }]))
      .toEqual(['the text "That is 4 fingers. Where does Kappa land? Type the…" covers "Rule −4 subtract 4"; move it so nothing she needs is hidden']);
  });

  it("reports nothing when every control is visible", () => {
    expect(layoutCoverageProblems([])).toEqual([]);
  });
});
