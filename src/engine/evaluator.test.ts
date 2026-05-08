import { describe, expect, it } from "vitest";
import type { WordBankFile } from "../context/schemas/wordBank";
import {
  buildEvaluatorSummary,
  evaluateNodeCompletion,
} from "./evaluator/evaluator";

function emptyWordBank(childId: string): WordBankFile {
  return {
    childId,
    version: 1,
    lastUpdated: "2026-05-05T00:00:00.000Z",
    words: [],
  };
}

describe("evaluator source of truth", () => {
  it("wraps a node completion into canonical evaluator buckets", () => {
    const evaluation = evaluateNodeCompletion({
      childId: "reina",
      homeworkId: "hw-spelling-week",
      nodeId: "n-word-radar",
      nodeType: "word-radar",
      domain: "spelling",
      targets: ["sunny", "neatly", "shiny", "carrying"],
      targetResults: [
        { target: "sunny", correct: true, attempts: 1, responseTime_ms: 850 },
        { target: "neatly", correct: true, attempts: 2, responseTime_ms: 4200 },
        { target: "shiny", correct: false, attempts: 1, attemptedValue: "shiney" },
      ],
    });

    expect(evaluation.buckets.mastered_now).toEqual(["sunny"]);
    expect(evaluation.buckets.known_but_slow).toEqual(["neatly"]);
    expect(evaluation.buckets.fragile).toEqual(["shiny"]);
    expect(evaluation.buckets.unknown).toEqual(["carrying"]);
    expect(evaluation.items.find((item) => item.target === "neatly")?.reasons)
      .toContain("multiple_attempts_or_slow_response");
  });

  it("builds the snapshot evaluator summary through the same canonical buckets", () => {
    const summary = buildEvaluatorSummary({
      rootDir: "/tmp/unused",
      childId: "reina",
      cycle: {
        homeworkId: "hw-spelling-week",
        subject: "spelling_test",
        wordList: ["sunny", "neatly"],
        capturedContent: null,
        contentProfile: null,
        ingestedAt: "2026-05-05T00:00:00.000Z",
        testDate: null,
        assumptions: null,
        theory: null,
        postAnalysis: null,
        scanResult: null,
        delta: null,
        metrics: null,
      },
      profile: {
        pendingHomework: undefined,
      },
      wordBank: {
        ...emptyWordBank("reina"),
        words: [
          {
            word: "sunny",
            addedAt: "2026-05-05",
            source: "homework",
            tracks: {
              spelling: {
                quality: 5,
                easinessFactor: 2.6,
                interval: 3,
                repetition: 2,
                nextReviewDate: "2026-05-10",
                lastReviewDate: "2026-05-05",
                scaffoldLevel: 0,
                history: [
                  { date: "2026-05-05", quality: 5, scaffoldLevel: 0, correct: true },
                ],
                mastered: true,
                masteredDate: "2026-05-05",
                regressionCount: 0,
              },
            },
          },
        ],
      },
    });

    expect(summary.buckets.mastered_now).toEqual(["sunny"]);
    expect(summary.buckets.unknown).toEqual(["neatly"]);
    expect(summary.evidenceIds).toContain("evaluator:sunny:word_bank");
  });
});
