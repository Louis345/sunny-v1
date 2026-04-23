import { describe, test, expect } from "vitest";
import {
  generateHomeworkId,
  matchScanToHomework,
  computeCycleDelta,
  computeIndependenceRate,
} from "../context/schemas/homeworkCycle";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";

describe("generateHomeworkId", () => {
  test("is deterministic from subject + wordList", () => {
    const id1 = generateHomeworkId("spelling_test", ["feet", "teeth", "lives"]);
    const id2 = generateHomeworkId("spelling_test", ["teeth", "feet", "lives"]);
    expect(id1).toBe(id2); // order-independent
    expect(id1).toMatch(/^hw-spelling_test-[a-f0-9]{8}$/);
  });

  test("differs when subject differs", () => {
    const id1 = generateHomeworkId("spelling_test", ["feet", "teeth"]);
    const id2 = generateHomeworkId("reading", ["feet", "teeth"]);
    expect(id1).not.toBe(id2);
  });

  test("differs when wordList differs", () => {
    const id1 = generateHomeworkId("spelling_test", ["feet", "teeth"]);
    const id2 = generateHomeworkId("spelling_test", ["feet", "sheep"]);
    expect(id1).not.toBe(id2);
  });
});

describe("matchScanToHomework", () => {
  test("finds correct cycle by word overlap", () => {
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

  test("returns null if no cycle has >80% word overlap", () => {
    const cycles: HomeworkCycle[] = [
      {
        homeworkId: "hw-spelling_test-abc123",
        subject: "spelling_test",
        wordList: ["cat", "dog", "fish", "bird", "tree"],
        ingestedAt: "2026-04-13",
        testDate: null,
        assumptions: null,
        postAnalysis: null,
        scanResult: null,
        delta: null,
        metrics: null,
      },
    ];
    const match = matchScanToHomework(["feet", "teeth", "lives"], cycles);
    expect(match).toBeNull();
  });

  test("picks best match when multiple cycles exist", () => {
    const cycles: HomeworkCycle[] = [
      {
        homeworkId: "hw-spelling_test-old",
        subject: "spelling_test",
        wordList: ["cat", "dog", "fish", "bird", "tree"],
        ingestedAt: "2026-04-06",
        testDate: null,
        assumptions: null,
        postAnalysis: null,
        scanResult: null,
        delta: null,
        metrics: null,
      },
      {
        homeworkId: "hw-spelling_test-new",
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
    const match = matchScanToHomework(["feet", "teeth", "lives", "sheep", "men"], cycles);
    expect(match?.homeworkId).toBe("hw-spelling_test-new");
  });
});

describe("computeCycleDelta", () => {
  test("returns accuracyDelta per word", () => {
    const inSystem = [
      { word: "feet", correct: true },
      { word: "teeth", correct: false },
    ];
    const isolated = [
      { word: "feet", correct: true },
      { word: "teeth", correct: true }, // improved in isolation
    ];
    const delta = computeCycleDelta(inSystem, isolated);
    expect(delta.find((d) => d.word === "teeth")?.isolatedImprovedOverSystem).toBe(true);
  });

  test("accuracyDelta is isolated minus inSystem", () => {
    const inSystem = [{ word: "feet", correct: false }];
    const isolated = [{ word: "feet", correct: true }];
    const delta = computeCycleDelta(inSystem, isolated);
    const d = delta.find((d) => d.word === "feet")!;
    expect(d.inSystemAccuracy).toBe(0);
    expect(d.isolatedAccuracy).toBe(1);
    expect(d.accuracyDelta).toBe(1);
  });

  test("marks isolatedImprovedOverSystem false when system was better", () => {
    const inSystem = [{ word: "feet", correct: true }];
    const isolated = [{ word: "feet", correct: false }];
    const delta = computeCycleDelta(inSystem, isolated);
    expect(delta[0]?.isolatedImprovedOverSystem).toBe(false);
  });
});

describe("computeIndependenceRate", () => {
  test("excludes words drilled this week", () => {
    const isolated = [
      { word: "feet", correct: true },
      { word: "against", correct: false },
    ];
    const drilledThisWeek = ["feet"]; // feet was drilled, against was not
    const rate = computeIndependenceRate(isolated, drilledThisWeek);
    // only "against" counts — not drilled, got it wrong → 0/1
    expect(rate).toBe(0);
  });

  test("returns 1 when all non-drilled words correct", () => {
    const isolated = [
      { word: "feet", correct: true },
      { word: "against", correct: true },
    ];
    const drilledThisWeek = ["feet"];
    const rate = computeIndependenceRate(isolated, drilledThisWeek);
    expect(rate).toBe(1);
  });

  test("returns null when all words were drilled (no independent sample)", () => {
    const isolated = [{ word: "feet", correct: true }];
    const drilledThisWeek = ["feet"];
    const rate = computeIndependenceRate(isolated, drilledThisWeek);
    expect(rate).toBeNull();
  });
});
