import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { sm2 } from "../algorithms/sm2";
import { desirableDifficulty } from "../algorithms/desirableDifficulty";
import { interleaving } from "../algorithms/interleaving";
import { masteryGating } from "../algorithms/masteryGating";
import { retrievalPractice } from "../algorithms/retrievalPractice";

describe("profile algorithm output contracts", () => {
  it("sm2() is pure and maps only to dueWords + sm2Stats", () => {
    const wordBank = {
      words: [
        {
          word: "add",
          tracks: {
            spelling: {
              interval: 1,
              easinessFactor: 2.5,
              nextReviewDate: "2020-01-01",
            },
          },
        },
      ],
    };

    const a = sm2(wordBank);
    const b = sm2(wordBank);

    expect(a).toEqual(b);
    expect(Object.keys(a).sort()).toEqual(["dueWords", "sm2Stats"]);
  });

  it("desirableDifficulty() returns currentDifficulty between 0 and 1", () => {
    const out = desirableDifficulty([
      { correct: true, timestamp: "2026-04-01T00:00:00.000Z" },
      { correct: false, timestamp: "2026-04-01T00:01:00.000Z" },
    ]);
    expect(Object.keys(out)).toEqual(["currentDifficulty"]);
    expect(out.currentDifficulty).toBeGreaterThanOrEqual(0);
    expect(out.currentDifficulty).toBeLessThanOrEqual(1);
  });

  it("masteryGating() returns clockStep, coinStep, and readingLevel", () => {
    const out = masteryGating({ sessions: [] });
    expect(out.masteryGating).toEqual({
      clockStep: expect.any(Number),
      coinStep: expect.any(Number),
      readingLevel: expect.any(Number),
    });
  });

  it("interleaving() returns mathRotation as strings", () => {
    const out = interleaving([]);
    expect(Array.isArray(out.mathRotation)).toBe(true);
    expect(out.mathRotation.every((x) => typeof x === "string")).toBe(true);
  });

  it("retrievalPractice() returns nextScaffoldWords", () => {
    const out = retrievalPractice({ words: [] });
    expect(out).toEqual({ retrievalPractice: { nextScaffoldWords: [] } });
  });

  it("no algorithm imports outside src/algorithms except type-only imports", () => {
    const dir = path.resolve(__dirname, "../algorithms");
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));

    for (const file of files) {
      const source = fs.readFileSync(path.join(dir, file), "utf-8");
      const imports = source.matchAll(/^import\s+(?!type\b).*from\s+["']([^"']+)["']/gm);
      for (const match of imports) {
        const spec = match[1];
        expect(spec, `${file} imports ${spec}`).toMatch(/^\.\/|^node:/);
      }
    }
  });
});
