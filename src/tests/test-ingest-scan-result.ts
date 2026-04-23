/**
 * Phase 3 tests: ingestScanResult
 * These must be RED before implementation, GREEN after.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  loadCycles,
  writeCycle,
  buildPostAnalysisPrompt,
} from "../scripts/ingestScanResult";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import { matchScanToHomework, computeCycleDelta, computeIndependenceRate } from "../context/schemas/homeworkCycle";

const TEST_CHILD = "scan-result-test-child";
const ctxRoot = path.join(process.cwd(), "src", "context", TEST_CHILD);
const cyclesDir = path.join(ctxRoot, "homework", "cycles");

function cleanup(): void {
  if (fs.existsSync(ctxRoot)) {
    fs.rmSync(ctxRoot, { recursive: true, force: true });
  }
}

beforeEach(() => {
  cleanup();
  fs.mkdirSync(cyclesDir, { recursive: true });
});

afterEach(cleanup);

describe("loadCycles", () => {
  test("returns empty array when cycles dir does not exist", () => {
    cleanup();
    const cycles = loadCycles(TEST_CHILD);
    expect(cycles).toEqual([]);
  });

  test("loads all cycle JSON files from cycles dir", () => {
    const cycle: HomeworkCycle = {
      homeworkId: "hw-spelling_test-abc123",
      subject: "spelling_test",
      wordList: ["feet", "teeth"],
      ingestedAt: "2026-04-13",
      testDate: null,
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    };
    fs.writeFileSync(
      path.join(cyclesDir, "hw-spelling_test-abc123.json"),
      JSON.stringify(cycle),
      "utf8",
    );
    const cycles = loadCycles(TEST_CHILD);
    expect(cycles.length).toBe(1);
    expect(cycles[0]?.homeworkId).toBe("hw-spelling_test-abc123");
  });
});

describe("writeCycle", () => {
  test("writes cycle back to cycles/{homeworkId}.json", () => {
    const cycle: HomeworkCycle = {
      homeworkId: "hw-spelling_test-write001",
      subject: "spelling_test",
      wordList: ["feet"],
      ingestedAt: "2026-04-13",
      testDate: null,
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    };
    writeCycle(TEST_CHILD, cycle);
    const p = path.join(cyclesDir, "hw-spelling_test-write001.json");
    expect(fs.existsSync(p)).toBe(true);
    const loaded = JSON.parse(fs.readFileSync(p, "utf8")) as HomeworkCycle;
    expect(loaded.homeworkId).toBe("hw-spelling_test-write001");
  });
});

describe("ingestScanResult: cycle matching pipeline", () => {
  test("links scan to correct cycle by word overlap (unit)", () => {
    const cycles: HomeworkCycle[] = [
      {
        homeworkId: "hw-spelling_test-abc123",
        subject: "spelling_test",
        wordList: ["feet", "teeth", "lives", "sheep", "men"],
        ingestedAt: "2026-04-13",
        testDate: null,
        assumptions: null,
        postAnalysis: null,
        scanResult: null,
        delta: null,
        metrics: null,
      },
    ];
    const scanWords = ["feet", "teeth", "lives", "sheep", "men"];
    const match = matchScanToHomework(scanWords, cycles);
    expect(match?.homeworkId).toBe("hw-spelling_test-abc123");
  });

  test("computeCycleDelta populates all word delta entries", () => {
    const inSystem = [
      { word: "feet", correct: true },
      { word: "teeth", correct: false },
    ];
    const isolated = [
      { word: "feet", correct: false },
      { word: "teeth", correct: true },
    ];
    const delta = computeCycleDelta(inSystem, isolated);
    expect(delta.length).toBe(2);
    expect(delta.find((d) => d.word === "feet")?.isolatedImprovedOverSystem).toBe(false);
    expect(delta.find((d) => d.word === "teeth")?.isolatedImprovedOverSystem).toBe(true);
  });

  test("computeIndependenceRate is null when no independent words", () => {
    const isolated = [{ word: "feet", correct: true }];
    const rate = computeIndependenceRate(isolated, ["feet"]);
    expect(rate).toBeNull();
  });
});

describe("buildPostAnalysisPrompt", () => {
  test("includes pre.md assumptions in prompt", () => {
    const prompt = buildPostAnalysisPrompt({
      preAssumptions: "I assume feet will be easy.",
      deltaData: [
        {
          word: "feet",
          inSystemAccuracy: 1,
          isolatedAccuracy: 0,
          accuracyDelta: -1,
          isolatedImprovedOverSystem: false,
          sm2EasinessFactorBefore: 2.5,
          sm2EasinessFactorAfter: 2.3,
          sm2Growth: -0.2,
        },
      ],
      independenceRate: 0,
    });
    expect(prompt).toContain("I assume feet will be easy.");
    expect(prompt).toContain("feet");
    expect(prompt).toContain("## What was predicted");
    expect(prompt).toContain("## What actually happened");
    expect(prompt).toContain("## SM-2 dial adjustments recommended");
  });

  test("handles null pre.md assumptions gracefully", () => {
    const prompt = buildPostAnalysisPrompt({
      preAssumptions: null,
      deltaData: [],
      independenceRate: null,
    });
    expect(typeof prompt).toBe("string");
    expect(prompt).toContain("No prior assumptions");
  });
});
