import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  appendTutoringSessionSection,
  moveTranscriptToProcessed,
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tutoring-"));
    const incoming = path.join(dir, "sample.txt");
    const processedDir = path.join(dir, "processed");
    fs.writeFileSync(incoming, "hello", "utf8");
    const moved = moveTranscriptToProcessed(incoming, processedDir);
    expect(fs.existsSync(moved)).toBe(true);
    expect(fs.existsSync(incoming)).toBe(false);
  });
});
