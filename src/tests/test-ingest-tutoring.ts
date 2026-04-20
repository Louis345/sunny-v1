import { describe, expect, it } from "vitest";
import {
  appendTutoringSessionSection,
  parseCoveredWords,
  parseStruggledWords,
} from "../scripts/ingestTutoring";

describe("ingestTutoring", () => {
  it("extracts coveredWords from transcript", () => {
    const words = parseCoveredWords("coveredWords: cat,dog,moon");
    expect(words).toEqual(["cat", "dog", "moon"]);
  });

  it("extracts struggledWords from transcript", () => {
    const words = parseStruggledWords("struggledWords: though,through");
    expect(words).toEqual(["though", "through"]);
  });

  it("curriculum.md updated with session section", () => {
    const next = appendTutoringSessionSection("## Existing\n", {
      date: "2026-04-21",
      coveredWords: ["cat"],
      struggledWords: ["though"],
      tutorStrategies: ["segmenting"],
      conceptsCovered: ["blends"],
    });
    expect(next).toContain("## Tutoring Session 2026-04-21");
  });

  it("transcript moved to processed/", () => {
    expect(false).toBe(true);
  });
});
