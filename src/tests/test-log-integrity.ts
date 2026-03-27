/**
 * Contract: logWorksheetAttempt validation binds to server transcript.
 */
import { describe, it, expect } from "vitest";
import { validateLogWorksheetAttempt } from "../server/worksheet-truth";

describe("logWorksheetAttempt integrity", () => {
  it("accepts when childSaid matches actual transcript", () => {
    const result = validateLogWorksheetAttempt({
      modelChildSaid: "I have three quarters",
      actualTranscript: "I have three quarters.",
      modelProblemId: "4",
      serverProblemId: "4",
    });
    expect(result.valid).toBe(true);
    expect(result.effectiveChildSaid).toBe("I have three quarters.");
  });

  it("replaces childSaid with actual transcript when they differ", () => {
    const result = validateLogWorksheetAttempt({
      modelChildSaid:
        "She said three quarters and also mentioned something about nickels",
      actualTranscript: "I have three quarters.",
      modelProblemId: "4",
      serverProblemId: "4",
    });
    expect(result.valid).toBe(true);
    expect(result.effectiveChildSaid).toBe("I have three quarters.");
  });

  it("rejects when problemId mismatches", () => {
    const result = validateLogWorksheetAttempt({
      modelChildSaid: "fifty two cents",
      actualTranscript: "fifty two cents",
      modelProblemId: "3",
      serverProblemId: "2",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("problemId mismatch");
  });

  it("uses actual transcript when model concatenates multiple turns", () => {
    const multiTurn =
      "I have a quarter nickel, dime, dime, penny, penny. " +
      "I have a quarter a nickel, two pennies and a dime. " +
      "And the girl with sixty two cents is the bigger number.";
    const actualTranscript =
      "And the girl with sixty two cents is the bigger number.";
    const result = validateLogWorksheetAttempt({
      modelChildSaid: multiTurn,
      actualTranscript,
      modelProblemId: "3",
      serverProblemId: "3",
    });
    expect(result.valid).toBe(true);
    expect(result.effectiveChildSaid).toBe(actualTranscript);
    expect(result.effectiveChildSaid.length).toBeLessThan(multiTurn.length);
  });

  it("accepts when transcript is empty but warns", () => {
    const result = validateLogWorksheetAttempt({
      modelChildSaid: "three quarters",
      actualTranscript: "",
      modelProblemId: "4",
      serverProblemId: "4",
    });
    expect(result.valid).toBe(true);
    expect(result.warning).toContain("empty transcript");
    expect(result.effectiveChildSaid).toBe("three quarters");
  });
});
