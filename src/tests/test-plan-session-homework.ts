import { describe, expect, it } from "vitest";
import { reorderHomeworkNodesForSession } from "../engine/learningEngine";

describe("planSession homework", () => {
  it("planSession uses pendingHomework when present", () => {
    expect(false).toBe(true);
  });

  it("boss node placed last regardless of input order", () => {
    const out = reorderHomeworkNodesForSession([
      { id: "a", type: "boss" },
      { id: "b", type: "quest" },
    ]);
    expect(out[out.length - 1]?.type).toBe("boss");
  });

  it("no same modality appears back to back", () => {
    expect(false).toBe(true);
  });

  it("struggling words trigger pronunciation first", () => {
    expect(false).toBe(true);
  });

  it("attention window caps node count", () => {
    expect(false).toBe(true);
  });

  it("SM-2 due words injected into node params", () => {
    expect(false).toBe(true);
  });

  it("falls back to existing logic when no pendingHomework", () => {
    expect(false).toBe(true);
  });
});
