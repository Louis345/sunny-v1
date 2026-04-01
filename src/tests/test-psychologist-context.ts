import { describe, it, expect } from "vitest";
import { PSYCHOLOGIST_CONTEXT } from "../agents/prompts";

describe("PSYCHOLOGIST_CONTEXT child lock", () => {
  it("names Reina as the sole session subject", () => {
    const prompt = PSYCHOLOGIST_CONTEXT(
      "Reina",
      "Some notes mentioning Ila by mistake.",
      "attempts",
      "curriculum",
    );
    expect(prompt).toContain("**Reina**");
    expect(prompt).toContain("SESSION SUBJECT");
    expect(prompt).toContain("ignore other names");
  });

  it("names Ila as the sole session subject", () => {
    const prompt = PSYCHOLOGIST_CONTEXT(
      "Ila",
      "ctx",
      "attempts",
      "curriculum",
    );
    expect(prompt).toContain("**Ila**");
    expect(prompt).toContain("tool results for Ila");
  });
});
