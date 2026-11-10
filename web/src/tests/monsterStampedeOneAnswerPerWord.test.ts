import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { expect, it } from "vitest";

// 2026-11-10 (Opus audit): Monster Stampede reported every wrong letter tap as a misspelled word, so Ila's record
// filled with fragments like "ornm" and "chae", and the first of them became her answer for the word. The Planner
// read fragments as her spelling. Now there is one answer per word: the word if she made no wrong tap, otherwise
// the word with her first wrong letter where it went, which is the real error and never a fragment.
const source = fs.readFileSync(path.join(process.cwd(), "public", "games", "monster-stampede.html"), "utf8");

it("gives one whole-word answer per word, with her first wrong letter in place", () => {
  const start = source.indexOf("function wordAnswer(");
  expect(start).toBeGreaterThan(-1);
  const fn = source.slice(start, source.indexOf("\n}", start) + 2);
  const sandbox: { wordAnswer?: (word: string, firstWrong: { index: number; letter: string } | null) => string } = {};
  vm.runInNewContext(`${fn}; this.wordAnswer = wordAnswer;`, sandbox);
  expect(sandbox.wordAnswer!("ornament", null)).toBe("ornament");
  expect(sandbox.wordAnswer!("ornament", { index: 3, letter: "m" })).toBe("ornment".replace("ornment", "ornmment"));
});

it("never reports a wrong tap as an answer", () => {
  const wrongBranch = source.slice(source.indexOf("// Wrong tile"), source.indexOf("/* ── End game"));
  expect(wrongBranch).not.toContain("fireAttemptEvent");
});
