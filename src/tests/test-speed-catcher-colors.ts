/**
 * BUG 7 — speed-catcher bubble colors must not reveal the answer.
 * Correct and distractor bubbles must use the same random color pool,
 * not a fixed correct=purple / wrong=cyan scheme.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const html = readFileSync(
  resolve(__dirname, "../../web/public/games/speed-catcher.html"),
  "utf8",
);

describe("speed-catcher bubble colors (BUG 7)", () => {
  it("bubble background is NOT gated on bubble.correct / isCorrect", () => {
    // The old code: `background: isCorrect ? T.bubbleCorrect : T.bubbleWrong`
    expect(html).not.toMatch(/isCorrect\s*\?\s*T\.bubbleCorrect/);
    expect(html).not.toMatch(/bubble\.correct\s*\?\s*T\.bubbleCorrect/);
  });

  it("bubble border is NOT gated on bubble.correct / isCorrect", () => {
    expect(html).not.toMatch(/isCorrect\s*\?\s*T\.bubbleCorrectBorder/);
  });

  it("uses a random color palette for all bubbles", () => {
    // Must reference a palette or random color assignment
    expect(html).toMatch(/BUBBLE_COLORS|bubbleColors|bubble_colors|randomColor|palette/i);
  });
});
