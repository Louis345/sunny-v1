import fs from "fs";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildMeasurementReport } from "./measurementReport";

const childId = "ila";
const ctxRoot = path.resolve(process.cwd(), "src", "context", childId);
const wordBankPath = path.join(ctxRoot, "word_bank.json");
let savedWordBank: string | null = null;

describe("buildMeasurementReport", () => {
  beforeEach(() => {
    savedWordBank = fs.existsSync(wordBankPath)
      ? fs.readFileSync(wordBankPath, "utf-8")
      : null;
    fs.mkdirSync(path.dirname(wordBankPath), { recursive: true });
    fs.writeFileSync(
      wordBankPath,
      JSON.stringify({
        childId,
        version: 1,
        lastUpdated: new Date().toISOString(),
        words: [
          {
            word: "measword",
            addedAt: "2026-01-01",
            source: "test",
            tracks: {
              spelling: {
                quality: 5,
                easinessFactor: 2.5,
                interval: 2,
                repetition: 1,
                nextReviewDate: "2026-01-01",
                lastReviewDate: "2026-01-01",
                scaffoldLevel: 0,
                history: [],
                mastered: false,
                regressionCount: 0,
              },
              reading: {
                quality: 1,
                easinessFactor: 2.5,
                interval: 1,
                repetition: 0,
                nextReviewDate: "2026-01-01",
                lastReviewDate: "2026-01-01",
                scaffoldLevel: 0,
                history: [],
                mastered: false,
                regressionCount: 0,
              },
            },
          },
        ],
      }),
      "utf-8",
    );
  });
  afterEach(() => {
    if (savedWordBank !== null) {
      fs.mkdirSync(path.dirname(wordBankPath), { recursive: true });
      fs.writeFileSync(wordBankPath, savedWordBank, "utf-8");
    } else if (fs.existsSync(wordBankPath)) {
      fs.unlinkSync(wordBankPath);
    }
  });

  it("includes word bank mastery counts", () => {
    const report = buildMeasurementReport(childId);
    expect(report.length).toBeGreaterThan(0);
    expect(report).toContain("Word Bank Summary (spelling)");
    expect(report).toMatch(/Total words tracked:\s*\d+/);
    expect(report).toMatch(/Mastered:\s*\d+/);
  });

  it("includes cross-session accuracy trend", () => {
    const report = buildMeasurementReport(childId);
    expect(report.length).toBeGreaterThan(0);
    expect(report).toContain("Cross-Session Accuracy");
    expect(report).toMatch(/Trend:\s*(improving|stable|declining)/);
  });

  it("includes mastery gate status", () => {
    const report = buildMeasurementReport(childId);
    expect(report.length).toBeGreaterThan(0);
    expect(report).toContain("Wilson Step Status");
    expect(report).toMatch(/Gate:\s*(locked|ready_to_advance|regressed)/);
  });

  it("returns empty string when no data exists", () => {
    expect(buildMeasurementReport("__no_such_child_zz__")).toBe("");
  });
});
