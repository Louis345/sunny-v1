import { describe, expect, it } from "vitest";
import type { LearningCycleRecordV2, LearningObservation } from "./learningCycleRepository";
import { baselineChance, paperConceptId, readinessCalibration, readyNow, readyOnPaperSection, readyReportLines, scoreReadyCalls, spearman } from "./readyOnPaper";

// Owner 2026-11-15/16: "we should figure out if the ai-planner is properly set up to tell us when it feels confident
// that Ila understands the concepts." It judged each concept only in prose ("rounding mostly secure"), nobody was
// told, and the judgment was never checked against paper. Now the Planner gives each concept a chance she gets it
// right alone on paper; code scores that chance against the next home check done alone or school test, and checks
// across calls whether a higher chance goes with a better paper result (a monotonic relationship).

const paper = (id: string, at: string, concept: string, correct: boolean, kind: "home" | "home-helped" | "school" | "practice"): LearningObservation => ({
  observationId: `${id}`, sourceId: kind === "school" ? `school:${at}` : `home:${at}`, itemId: id, prompt: id,
  constructLinks: [{ constructId: id, role: "primary", confidence: 1 }, { constructId: paperConceptId(concept), role: "secondary", confidence: 1 }],
  result: { correct }, assistance: { status: kind === "home-helped" ? "assisted" : kind === "practice" ? "unknown" : "unassisted", scaffolds: [] },
  exposure: "unknown", provenance: kind === "school" ? "graded_work" : kind === "practice" ? "practice" : "delayed_reassessment", observedAt: at, confounds: [],
});

const decision = (id: string, at: string, calls: Array<{ concept: string; chance: number }>) => ({
  decisionId: id, eventType: "theory_decided", reason: "r", evidenceIds: [], fromLifecycle: "baseline_evaluating", toLifecycle: "baseline_ready", createdAt: at,
  readyOnPaper: calls.map(call => ({ ...call, why: `why ${call.concept}`, proof: "Lesson 1.2 sheet" })),
});

const cycle = (decisions: unknown[], observations: LearningObservation[]) =>
  ({ childId: "ila", homeworkId: "hw-math-1", domain: "math", decisionHistory: decisions, observations }) as unknown as LearningCycleRecordV2;

describe("the Planner's ready-on-paper calls, scored by code", () => {
  it("scores each call against her next paper done alone, by the concept the parent tagged on each item", () => {
    const c = cycle([decision("d1", "2026-11-15T23:00:00Z", [{ concept: "Rounding", chance: 0.85 }, { concept: "Counting-down patterns", chance: 0.3 }])], [
      paper("r-before", "2026-11-14T10:00:00Z", "rounding", false, "home"),
      paper("r1", "2026-11-16T15:00:00Z", "rounding", true, "home"),
      paper("r2", "2026-11-16T15:00:00Z", " ROUNDING ", true, "home"),
      paper("r3", "2026-11-16T15:00:00Z", "rounding", false, "home"),
      paper("p1", "2026-11-16T15:00:00Z", "counting-down patterns", false, "home"),
    ]);
    const scored = scoreReadyCalls(c);
    expect(scored.find(row => row.concept === "Rounding")!.paper).toMatchObject({ kind: "home_check", right: 2, total: 3 });
    expect(scored.find(row => row.concept === "Rounding")!.paper!.share).toBeCloseTo(2 / 3);
    expect(scored.find(row => row.concept === "Counting-down patterns")!.paper).toMatchObject({ right: 0, total: 1 });
  });

  it("does not score a call against paper done with help, practice, or paper from before the call", () => {
    const c = cycle([decision("d1", "2026-11-15T23:00:00Z", [{ concept: "Rounding", chance: 0.85 }])], [
      paper("old", "2026-11-14T10:00:00Z", "rounding", true, "home"),
      paper("helped", "2026-11-16T15:00:00Z", "rounding", true, "home-helped"),
      paper("game", "2026-11-16T15:00:00Z", "rounding", true, "practice"),
    ]);
    expect(scoreReadyCalls(c)[0].paper).toBeUndefined();
  });

  it("a school test counts as paper done alone", () => {
    const c = cycle([decision("d1", "2026-11-15T23:00:00Z", [{ concept: "Rounding", chance: 0.7 }])], [paper("s1", "2026-11-18T10:00:00Z", "rounding", true, "school")]);
    expect(scoreReadyCalls(c)[0].paper).toMatchObject({ kind: "school_test", right: 1, total: 1 });
  });

  it("tells the parent only concepts called ready (0.8 or more) from the latest decision that paper has not checked yet", () => {
    const c = cycle([
      decision("d1", "2026-11-14T23:00:00Z", [{ concept: "Adding", chance: 0.9 }]),
      decision("d2", "2026-11-15T23:00:00Z", [{ concept: "Rounding", chance: 0.85 }, { concept: "Adding", chance: 0.6 }, { concept: "Patterns", chance: 0.8 }]),
    ], [paper("pt", "2026-11-16T10:00:00Z", "patterns", true, "home")]);
    expect(readyNow(c).map(row => row.concept)).toEqual(["Rounding"]);
  });

  it("shows the Planner its calls and how paper answered them", () => {
    const c = cycle([decision("d1", "2026-11-15T23:00:00Z", [{ concept: "Rounding", chance: 0.85 }, { concept: "Patterns", chance: 0.3 }])],
      [paper("r1", "2026-11-16T15:00:00Z", "rounding", true, "home")]);
    const section = readyOnPaperSection(c);
    expect(section).toContain("Rounding: you said 0.85");
    expect(section).toContain("home check done alone: 1 of 1 right");
    expect(section).toContain("Patterns: you said 0.3; no paper done alone on it yet");
    expect(readyOnPaperSection(cycle([], []))).toContain("No calls yet");
  });
});

describe("is a higher chance followed by a better paper result? (monotonic check)", () => {
  it("Spearman's rank correlation: 1 when results rise with the chance, -1 when they fall, ties averaged", () => {
    expect(spearman([0.2, 0.5, 0.9], [0.1, 0.4, 0.95])).toBeCloseTo(1);
    expect(spearman([0.2, 0.5, 0.9], [0.9, 0.5, 0.1])).toBeCloseTo(-1);
    expect(spearman([0.2, 0.5, 0.9, 0.9], [0, 0.5, 1, 1])).toBeCloseTo(1);
    expect(spearman([0.5, 0.5], [0, 1])).toBeNull();
    expect(spearman([0.5], [1])).toBeNull();
  });

  it("uses the latest call before each paper, across assignments, and says too few until 5 pairs", () => {
    const one = cycle([
      decision("d1", "2026-11-14T23:00:00Z", [{ concept: "Rounding", chance: 0.4 }]),
      decision("d2", "2026-11-15T23:00:00Z", [{ concept: "Rounding", chance: 0.9 }, { concept: "Patterns", chance: 0.2 }]),
    ], [paper("r1", "2026-11-16T15:00:00Z", "rounding", true, "home"), paper("p1", "2026-11-16T15:00:00Z", "patterns", false, "home")]);
    const few = readinessCalibration([one]);
    expect(few.pairs).toEqual([{ chance: 0.9, share: 1 }, { chance: 0.2, share: 0 }]);
    expect(few.enough).toBe(false);
    const more = cycle([decision("d3", "2026-11-17T23:00:00Z", [{ concept: "A", chance: 0.5 }, { concept: "B", chance: 0.7 }, { concept: "C", chance: 0.6 }])],
      [paper("a", "2026-11-18T10:00:00Z", "a", false, "home"), paper("b", "2026-11-18T10:00:00Z", "b", true, "home"), paper("c", "2026-11-18T10:00:00Z", "c", true, "home"),
        paper("c2", "2026-11-18T10:00:00Z", "c", false, "home")]);
    const all = readinessCalibration([one, more]);
    expect(all.pairs).toHaveLength(5);
    expect(all.enough).toBe(true);
    expect(all.rho).toBeGreaterThan(0.8);
  });
});

describe("the parent's ready report", () => {
  it("lists ready concepts first, then every call with its paper result, then the monotonic check or why it is too early", () => {
    const c = cycle([decision("d1", "2026-11-15T23:00:00Z", [{ concept: "Rounding", chance: 0.85 }, { concept: "Patterns", chance: 0.3 }])],
      [paper("p1", "2026-11-16T15:00:00Z", "patterns", false, "home")]);
    const lines = readyReportLines("ila", [c]).join("\n");
    expect(lines).toContain("Ready for paper alone: Rounding (0.85; proof: Lesson 1.2 sheet)");
    expect(lines).toContain("Patterns: you said 0.3; home check done alone: 0 of 1 right");
    expect(lines).toContain("Monotonic check: 1 scored call; needs 5 before it means anything");
  });
});

// 2026-11-16 (owner: "my goal has always been to make Sunny predictive and grounded in reality"): ranking right is not
// enough; a Planner that always says 0.9 when she gets 60% ranks well and is still wrong. Calibration checks the
// numbers themselves, and a plain arithmetic guess (her own first-try rate on the concept's items, locked with each
// call) is scored the same way, so the report shows whether the AI beats arithmetic.
describe("are the numbers honest, and does the Planner beat arithmetic?", () => {
  const own = (id: string, at: string, correct: boolean, status: "unassisted" | "assisted" = "unassisted"): LearningObservation => ({
    observationId: `${id}:${at}`, sourceId: "activity:x", itemId: id, constructLinks: [], result: { correct }, assistance: { status, scaffolds: [] },
    exposure: "unknown", provenance: "independent_probe", observedAt: at, confounds: [] });

  it("baselineChance: her last first tries on her own on the concept's items before the call, smoothed (right+1)/(tries+2)", () => {
    const c = cycle([], [own("p1", "2026-11-15T10:00:00Z", true), own("p2", "2026-11-15T10:01:00Z", true), own("p2", "2026-11-15T10:02:00Z", false, "assisted"),
      own("p3", "2026-11-15T10:03:00Z", false), own("p1", "2026-11-17T10:00:00Z", false)]);
    expect(baselineChance(c, ["p1", "p2", "p3"], "2026-11-16T00:00:00Z")).toEqual({ chance: 0.6, right: 2, tries: 3 });
    expect(baselineChance(c, [], "2026-11-16T00:00:00Z")).toBeUndefined();
  });

  it("measures how far the average chance is from the average paper result, for the Planner and for arithmetic", () => {
    const withBaseline = (concept: string, chance: number, base: number) => ({ concept, chance, baseline: { chance: base, right: 0, tries: 0 } });
    const c = cycle([{ ...decision("d1", "2026-11-15T23:00:00Z", []), readyOnPaper: [withBaseline("A", 0.9, 0.6), withBaseline("B", 0.7, 0.4)].map(row => ({ ...row, why: "w", proof: "p" })) }],
      [paper("a1", "2026-11-16T15:00:00Z", "a", true, "home"), paper("a2", "2026-11-16T15:00:00Z", "a", false, "home"), paper("b1", "2026-11-16T15:00:00Z", "b", false, "home")]);
    const result = readinessCalibration([c]);
    expect(result.meanChance).toBeCloseTo(0.8);
    expect(result.meanShare).toBeCloseTo(0.25);
    expect(result.gap).toBeCloseTo(0.55);
    expect(result.meanError).toBeCloseTo(0.55);
    expect(result.baseline.pairs).toEqual([{ chance: 0.6, share: 0.5 }, { chance: 0.4, share: 0 }]);
    expect(result.baseline.meanError).toBeCloseTo(0.25);
    const lines = readyReportLines("ila", [c]).join("\n");
    expect(lines).toContain("Planner: says 0.80 on average; she got 25% alone on paper: too optimistic by 55 points");
    expect(lines).toContain("Arithmetic: says 0.50 on average; she got 25% alone on paper: too optimistic by 25 points");
    expect(lines).toContain("Closer to her paper so far: arithmetic (off by 25 points per call vs the Planner's 55)");
  });
});
