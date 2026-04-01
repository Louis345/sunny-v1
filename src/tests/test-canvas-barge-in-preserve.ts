import { describe, it, expect } from "vitest";
import { canvasStatePersistsThroughBargeIn } from "../shared/canvasRenderability";

describe("canvasStatePersistsThroughBargeIn", () => {
  it("preserves worksheet_pdf", () => {
    expect(
      canvasStatePersistsThroughBargeIn({
        mode: "worksheet_pdf",
        pdfAssetUrl: "/x.pdf",
      }),
    ).toBe(true);
  });

  it("preserves word-builder and spell-check", () => {
    expect(canvasStatePersistsThroughBargeIn({ mode: "word-builder" })).toBe(
      true,
    );
    expect(canvasStatePersistsThroughBargeIn({ mode: "spell-check" })).toBe(
      true,
    );
  });

  it("preserves registered iframe game modes", () => {
    expect(
      canvasStatePersistsThroughBargeIn({ mode: "coin-counter", gameUrl: "/x" }),
    ).toBe(true);
  });

  it("does not preserve ephemeral teaching / idle-ish modes", () => {
    expect(canvasStatePersistsThroughBargeIn({ mode: "teaching" })).toBe(
      false,
    );
    expect(canvasStatePersistsThroughBargeIn({ mode: "spelling" })).toBe(
      false,
    );
    expect(canvasStatePersistsThroughBargeIn({ mode: "place_value" })).toBe(
      false,
    );
    expect(canvasStatePersistsThroughBargeIn(null)).toBe(false);
    expect(canvasStatePersistsThroughBargeIn(undefined)).toBe(false);
  });
});
