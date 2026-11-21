import { describe, expect, it, vi } from "vitest";
import { BASELINE_FORECASTER, schoolForecastPredictions } from "./schoolForecast";

// 2026-11-13 Ila's first graded test (8/8): every one of the Planner's 12 locked predictions said the same 50-75%,
// written once on 11/08 and never updated, though her own record showed dormant far harder than forgot. The owner:
// predictions must be grounded in reality, per word, updated as evidence arrives, and compared with plain code.
// Each Planner decision now locks a per-word (spelling) or score (math) school-test forecast with its model, and code
// locks its own baseline beside it, so we can see whether the AI predicts better than arithmetic.
const word = (wordId: string, w: string, constructId: string) => ({ id: `item:${wordId}`, wordId, word: w, constructId });
const obs = (constructId: string, correct: boolean, own = true, first = true, at = "2026-11-10T10:00:00Z") => ({
  observationId: `${constructId}:${at}:${correct}:${Math.random()}`, itemId: "x", observedAt: at, result: { correct },
  assistance: { status: own ? "unassisted" : "assisted", scaffolds: [] }, constructLinks: [{ constructId, role: "primary", confidence: 1 }],
  confounds: first ? ["first_try"] : ["retry"], provenance: "practice" });
const spellingCycle = (observations: unknown[]) => ({
  childId: "ila", homeworkId: "hw-spelling-test", domain: "spelling", academicTheory: { theoryId: "hw-spelling-test:theory" },
  nodes: [{ nodeId: "n1", evidenceContract: { spellingItems: {
    a: word("w-dormant", "dormant", "spelling.word.dormant"), b: word("w-forgot", "forgot", "spelling.word.forgot") } } }],
  observations, academicPredictions: [],
}) as never;

describe("school-test forecasts at each Planner decision", () => {
  it("locks the Planner's per-word chance with its model, and a code baseline from her first tries on her own", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const cycle = spellingCycle([
      obs("spelling.word.dormant", false), obs("spelling.word.dormant", false), obs("spelling.word.dormant", true),
      obs("spelling.word.dormant", true, false), obs("spelling.word.dormant", true, true, false),
      obs("spelling.word.forgot", true), obs("spelling.word.forgot", true),
    ]);
    const rows = schoolForecastPredictions(cycle, { forecaster: "claude-opus-5-5", words: [
      { wordId: "w-dormant", chance: 0.4, why: "Missed twice on her own" }, { wordId: "w-forgot", chance: 0.9, why: "Right every time" }] }, "2026-11-12T00:00:00.000Z");
    const planner = rows.filter(row => row.modelId === "claude-opus-5-5"), baseline = rows.filter(row => row.modelId === BASELINE_FORECASTER);
    expect(planner.map(row => [row.constructId, row.expectedMetric.min, row.context])).toEqual([
      ["spelling.word.dormant", 0.4, "Missed twice on her own"], ["spelling.word.forgot", 0.9, "Right every time"]]);
    // Only first tries on her own count: dormant 1 of 3, smoothed (1+1)/(3+2); forgot 2 of 2 -> (2+1)/(2+2).
    expect(baseline.map(row => [row.constructId, row.expectedMetric.min])).toEqual([["spelling.word.dormant", 0.4], ["spelling.word.forgot", 0.75]]);
    expect(new Set(rows.map(row => row.predictionId)).size).toBe(4);
    expect(rows.every(row => row.lockedAt === "2026-11-12T00:00:00.000Z" && row.expectedMetric.key === "school_test_correct")).toBe(true);
  });

  it("still locks the code baseline, and says so in the log, when the Planner gave no forecast", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const rows = schoolForecastPredictions(spellingCycle([]), undefined, "2026-11-12T00:00:00.000Z");
    expect(rows.map(row => [row.modelId, row.expectedMetric.min])).toEqual([[BASELINE_FORECASTER, 0.5], [BASELINE_FORECASTER, 0.5]]);
    expect(log.mock.calls.some(call => String(call[0]).includes("[school-forecast] [planner] [missing]"))).toBe(true);
  });

  it("locks a math week's school score forecast from the Planner and from code", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const math = { childId: "reina", homeworkId: "hw-math-test", domain: "math", academicTheory: { theoryId: "t" }, nodes: [], academicPredictions: [],
      observations: [obs("math.division", true), obs("math.division", true), obs("math.division", false), obs("math.division", false, false)] } as never;
    const rows = schoolForecastPredictions(math, { forecaster: "claude-opus-5-5", score: { min: 0.7, max: 0.85, why: "Neighbour facts still shaky" } }, "2026-11-14T00:00:00.000Z");
    expect(rows.map(row => [row.modelId, row.constructId, row.expectedMetric])).toEqual([
      ["claude-opus-5-5", "hw-math-test:school-test-score", { key: "school_test_percent", min: 0.7, max: 0.85 }],
      [BASELINE_FORECASTER, "hw-math-test:school-test-score", { key: "school_test_percent", min: 0.6, max: 0.6 }],
    ]);
  });
});

describe("locking a baseline forecast outside a decision", () => {
  // 2026-11-13: Reina's math test is Monday 11/16. If she does not finish a board before then, no decision locks a
  // forecast, and her grade would have nothing to be compared with. A parent command locks code's baseline now.
  it("appends code's baseline to the week's forecasts through a cycle event, and keeps earlier locks", async () => {
    const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path");
    const { getLearningCycle, lockBaselineSchoolForecast } = await import("./learningCycleRepository");
    const { linearJourneyFixture } = await import("../scripts/fixtures/authoredJourney");
    const { buildSpellingRecallItems, createSpellingDiscoveryCycle } = await import("./learningCycleIngest");
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-forecast-lock-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const items = buildSpellingRecallItems({ homeworkId: "words", words: ["night", "light"], evidenceIds: ["source"], measurementRole: "fresh_checkpoint" });
      createSpellingDiscoveryCycle({ childId: "lab", homeworkId: "words", title: "Words", contentFingerprint: "f", items, boardDefinition: linearJourneyFixture(["words:discovery"]) }, { rootDir });
      lockBaselineSchoolForecast("lab", "words", { rootDir });
      lockBaselineSchoolForecast("lab", "words", { rootDir });
      const forecasts = getLearningCycle("lab", "words", { rootDir })!.schoolForecasts!;
      expect(forecasts).toHaveLength(4);
      expect(forecasts.every(row => row.modelId === BASELINE_FORECASTER)).toBe(true);
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  });
});

describe("one rule for a first try", () => {
  // 2026-11-13 measurement audit (AI-caught): spelling marks a second try "repeated_attempt", but every counter looked
  // only for "retry", so a word typed again counted as a first try on her own. One rule now covers both tags.
  it("never counts a repeated spelling attempt as a first try on her own", async () => {
    const { isFirstTryOnHerOwn } = await import("./sessionTimeline");
    expect(isFirstTryOnHerOwn({ assistance: { status: "unassisted" }, confounds: ["first_response"] })).toBe(true);
    expect(isFirstTryOnHerOwn({ assistance: { status: "unassisted" }, confounds: ["repeated_attempt"] })).toBe(false);
    expect(isFirstTryOnHerOwn({ assistance: { status: "unassisted" }, confounds: ["retry"] })).toBe(false);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const repeated = { ...obs("spelling.word.forgot", true), confounds: ["repeated_attempt"] };
    const rows = schoolForecastPredictions(spellingCycle([obs("spelling.word.forgot", false), repeated, repeated]), undefined, "2026-11-12T00:00:00.000Z");
    expect(rows.find(row => row.constructId === "spelling.word.forgot")!.expectedMetric.min).toBe(round(1 / 3));
  });
});
const round = (value: number) => Math.round(value * 1000) / 1000;
