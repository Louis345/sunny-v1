import { describe, it, expect } from "vitest";
import { resolveWordRadarInputMode } from "../hooks/useWordRadar";

describe("word-radar input mode audit", () => {
  it("preserves letter-by-letter as its own game mode", () => {
    expect(resolveWordRadarInputMode("letter-by-letter")).toBe("letter-by-letter");
  });

  it("keeps whole-word as whole-word", () => {
    expect(resolveWordRadarInputMode("whole-word")).toBe("whole-word");
  });

  it("defaults to whole-word when undefined", () => {
    expect(resolveWordRadarInputMode(undefined)).toBe("whole-word");
  });

  it("allows keyboard mode to pass through", () => {
    expect(resolveWordRadarInputMode("keyboard")).toBe("keyboard");
  });
});
