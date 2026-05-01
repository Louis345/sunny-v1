/**
 * BUG 1 — word-radar must always use whole-word STT regardless of profile.inputMode.
 * Profile's letter-by-letter mode must NOT leak into word-radar.
 */
import { describe, it, expect } from "vitest";
import { resolveWordRadarInputMode } from "../hooks/useWordRadar";

describe("word-radar input mode lock (BUG 1)", () => {
  it("clamps letter-by-letter to whole-word", () => {
    expect(resolveWordRadarInputMode("letter-by-letter")).toBe("whole-word");
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
