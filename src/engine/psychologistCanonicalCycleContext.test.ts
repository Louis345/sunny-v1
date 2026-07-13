import { describe, expect, it } from "vitest";
import { formatLatestCycleContext } from "../agents/psychologist/natalie-context";

describe("psychologist canonical cycle context", () => {
  it("reads and sorts V2 cycles without requiring legacy ingestedAt or wordList", () => {
    const text = formatLatestCycleContext([
      { schemaVersion: 2, homeworkId: "older", updatedAt: "2026-07-10T00:00:00.000Z", domain: "math", assignment: { targets: ["2x5"] }, academicTheory: { hypothesis: "older" } },
      { schemaVersion: 2, homeworkId: "newer", updatedAt: "2026-07-11T00:00:00.000Z", domain: "math", assignment: { targets: ["5x5", "5x10"] }, academicTheory: { hypothesis: "test multiplication transfer" } },
    ]);
    expect(text).toContain("newer");
    expect(text).toContain("5x5, 5x10");
    expect(text).toContain("test multiplication transfer");
  });
});
