import { describe, expect, it } from "vitest";
import { pickFreeCorner, layoutCoverageProblems, type LayoutBox } from "../shared/layoutCoverage";

// S40 (Kappa Pond, 11/20 01:40 UTC): the game's instruction banner covered its own rule sign ("Rule −4 subtract 4").
// S41 (arcade reward break, 11/20 01:42 UTC): the companion portrait sat on a game button. One rule for both: nothing
// covers a game's controls or the pieces it marks as key. Why the human caught it: the screenshot. Why the logs missed
// it: nothing measured layout. Why the lab missed it: no check rendered a game and hit-tested its controls.

const box = (x: number, y: number, w: number, h: number, label = "b"): LayoutBox => ({ x, y, w, h, label });

describe("the companion portrait never sits on a game control (S41)", () => {
  const viewport = { w: 1280, h: 800 };
  const size = { w: 140, h: 140 };

  it("keeps the usual bottom-right corner when it is free", () => {
    expect(pickFreeCorner(viewport, size, 16, [box(600, 700, 80, 60, "jump")]).corner).toBe("bottom-right");
  });

  it("moves to a free corner when a button is under bottom-right", () => {
    const choice = pickFreeCorner(viewport, size, 16, [box(1180, 700, 80, 80, "fire")]);
    expect(choice.corner).toBe("bottom-left");
    expect(choice.coveredLabels).toEqual([]);
  });

  it("picks the corner covering the least when none is free, and says what it covers", () => {
    // One control inside each corner's spot, plus an extra one bottom-right: bottom-left is the first least-covered.
    const controls = [box(1150, 670, 80, 80, "fire"), box(1130, 650, 20, 20, "tiny"), box(40, 670, 80, 80, "left"), box(1150, 40, 80, 80, "pause"), box(40, 40, 80, 80, "menu")];
    const choice = pickFreeCorner(viewport, size, 16, controls);
    expect(choice.corner).toBe("bottom-left");
    expect(choice.coveredLabels).toEqual(["left"]);
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
