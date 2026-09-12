import { describe, expect, it } from "vitest";

import { shouldResumeAdaptiveMathWorker } from "./routes";

describe("adaptive math worker startup reconciliation", () => {
  it("revisits board_ready jobs so interrupted canonical publication is repaired", () => {
    expect(shouldResumeAdaptiveMathWorker("board_ready")).toBe(true);
  });

  it("leaves parent-attention jobs stopped", () => {
    expect(shouldResumeAdaptiveMathWorker("needs_attention")).toBe(false);
  });
});
