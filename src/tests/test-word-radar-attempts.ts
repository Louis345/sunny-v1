/**
 * BUG 3 — word_radar_complete must call recordAttempt for every word.
 * Previously, only word_bank was updated; the attempt log got no entries.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../engine/learningEngine", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("../engine/learningEngine")>();
  return { ...mod, recordAttempt: vi.fn() };
});

import { recordAttempt } from "../engine/learningEngine";
import { recordWordRadarAttempts } from "../server/recordWordRadarAttempts";

const mockRecordAttempt = recordAttempt as ReturnType<typeof vi.fn>;

describe("recordWordRadarAttempts (BUG 3)", () => {
  beforeEach(() => mockRecordAttempt.mockClear());

  it("calls recordAttempt once per row", () => {
    recordWordRadarAttempts("ila", [
      { item: { display: "cat" }, correct: true, responseTime_ms: 100 },
      { item: { display: "dog" }, correct: false, responseTime_ms: 200 },
    ]);
    expect(mockRecordAttempt).toHaveBeenCalledTimes(2);
  });

  it("passes correct:true and quality:5 for correct words", () => {
    recordWordRadarAttempts("ila", [
      { item: { display: "fast" }, correct: true, responseTime_ms: 500 },
    ]);
    expect(mockRecordAttempt).toHaveBeenCalledWith("ila", {
      word: "fast",
      domain: "spelling",
      correct: true,
      quality: 5,
      scaffoldLevel: 0,
      responseTimeMs: 500,
    });
  });

  it("passes correct:false and quality:1 for missed words", () => {
    recordWordRadarAttempts("ila", [
      { item: { display: "hard" }, correct: false, responseTime_ms: 0 },
    ]);
    expect(mockRecordAttempt).toHaveBeenCalledWith("ila", {
      word: "hard",
      domain: "spelling",
      correct: false,
      quality: 1,
      scaffoldLevel: 0,
      responseTimeMs: undefined,
    });
  });

  it("calls recordAttempt for 10 words", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      item: { display: `word${i}` },
      correct: i % 2 === 0,
      responseTime_ms: 300,
    }));
    recordWordRadarAttempts("reina", rows);
    expect(mockRecordAttempt).toHaveBeenCalledTimes(10);
  });

  it("correctWords → correct:true, missedWords → correct:false", () => {
    recordWordRadarAttempts("reina", [
      { item: { display: "run" }, correct: true, responseTime_ms: 100 },
      { item: { display: "jump" }, correct: false, responseTime_ms: 200 },
    ]);
    const calls = mockRecordAttempt.mock.calls;
    expect(calls[0][1].correct).toBe(true);
    expect(calls[1][1].correct).toBe(false);
  });
});
