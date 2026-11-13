import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openChart, type ChartDatabase } from "../chart/db";
import { exportEvents } from "../chart/exportEvents";
import { recordAssignment, recordFact, recordSchoolTest } from "../chart/spelling/record";
import { predictionHistoryLines, scoreLockedPredictions } from "../chart/spelling/predictionBond";
import { bondLockedPredictions, lockedPredictionsFromCycle, recordGradedTestBond } from "./predictionBond";
import type { LearningCycleRecordV2 } from "./learningCycleRepository";

// Owner 2026-11-12 (Ila's test day): "AI planner predictions get locked in and the test's actual results are paired
// together, bonded, married, so when it checks its predictions from 3 months ago it's easy to parse, so any model can
// see the past and use it to predict the future ... garbage in is garbage out." In six weeks of spelling no school test
// had ever been paired with a prediction, and the Planner's own locked predictions were never in her chart database.
let root: string, db: ChartDatabase;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "prediction-bond-")); db = openChart("lab-bond", { chartDir: root }); });
afterEach(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });

const WORDS = ["pardon", "dormant", "ornament", "march"];
const HW = "hw-spelling-lab";
function cycle(extra: Partial<LearningCycleRecordV2> = {}): LearningCycleRecordV2 {
  const spellingItems = Object.fromEntries(WORDS.map(word => [`item-${word}`, { id: `item-${word}`, wordId: `spelling.word.${word}`, word, constructId: `spelling.word.${word}` }]));
  return {
    childId: "lab-bond", homeworkId: HW, domain: "spelling",
    nodes: [{ nodeId: "eval", role: "evaluation", evidenceContract: { spellingItems } }],
    academicPredictions: WORDS.map(word => ({
      predictionId: `act-5:spelling.word.${word}:prediction`, theoryId: "t", constructId: `spelling.word.${word}`,
      context: "Checkpoint mirroring the real test; expect real gains but not full mastery.", horizon: "Immediate unassisted recall after the named intervention; not retention or causation.",
      eligibility: { sources: ["practice"], maxDelayDays: 14, checkpointItemIds: [`item-${word}`] },
      expectedMetric: { key: "unassisted_recall_accuracy", min: 0.5, max: 0.75 }, predictedErrorPatterns: [`${word} keeps its old error`], confidence: 0.45,
      evidenceIds: ["e1"], intervention: "Hidden Word Lanterns", evidenceLimit: "practice_only", createdAt: "2026-11-08T00:14:17.248Z", lockedAt: "2026-11-08T00:14:17.248Z",
    })),
    ...extra,
  } as unknown as LearningCycleRecordV2;
}
function assignment() { recordAssignment(db, { assignmentId: HW, words: WORDS, testDate: "2026-11-12", sourcePhotoHash: "a".repeat(64) }); }
const test = (right: Record<string, string | true>) => ({ assignmentId: HW, testDate: "2026-11-12", photoHash: "b".repeat(64), sourceKind: "parent_transcription" as const,
  results: WORDS.map(word => ({ word, correct: right[word] === true, writtenResponse: right[word] === true ? word : (right[word] as string | undefined) ?? null })) });

describe("the Planner's locked predictions live in her chart database", () => {
  it("maps each locked prediction to its word, with when it was locked and what it expected", () => {
    const rows = lockedPredictionsFromCycle(cycle());
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ assignmentId: HW, word: "pardon", predictionId: "act-5:spelling.word.pardon:prediction", metric: "unassisted_recall_accuracy",
      expected: { min: 0.5, max: 0.75 }, confidence: 0.45, lockedAt: "2026-11-08T00:14:17.248Z", modelId: null });
  });

  it("records them once; running the bond again adds nothing", () => {
    assignment();
    expect(bondLockedPredictions(db, cycle())).toEqual({ recorded: 4, already: 0 });
    expect(bondLockedPredictions(db, cycle())).toEqual({ recorded: 0, already: 4 });
    expect(exportEvents(db).filter(e => e.type === "prediction.locked")).toHaveLength(4);
  });

  it("refuses a prediction recorded after the school test, so no prediction can be written with the answer known", () => {
    assignment();
    recordSchoolTest(db, test({ pardon: true, dormant: "bormant", ornament: true, march: true }), { actor: "parent", occurred_at: "2026-11-12T12:00:00.000Z" });
    expect(() => bondLockedPredictions(db, cycle())).toThrow(/prediction_after_result/);
  });
});

describe("a graded test is bonded to the predictions made before it", () => {
  it("records the test and one bonded row per word: what was predicted, what she wrote, right or wrong", () => {
    assignment();
    const bond = recordGradedTestBond(db, { cycle: cycle(), schoolTest: test({ pardon: true, dormant: "bormant", ornament: true, march: true }), occurredAt: "2026-11-12T12:00:00.000Z" });
    expect(bond.summary).toEqual({ words: 4, right: 3, predictedRight: { min: 2, max: 3 }, inRange: true });
    const scored = exportEvents(db).filter(e => e.type === "prediction.scored");
    expect(scored).toHaveLength(1);
    const dormant = (scored[0].payload.rows as Array<{ word: string }>).find(row => row.word === "dormant");
    expect(dormant).toMatchObject({ word: "dormant", correct: false, writtenResponse: "bormant",
      predictions: [{ predictionId: "act-5:spelling.word.dormant:prediction", expected: { min: 0.5, max: 0.75 }, confidence: 0.45, lockedAt: "2026-11-08T00:14:17.248Z", modelId: null }] });
    // The bond cites the school test and every prediction it scored.
    expect(scored[0].cites).toHaveLength(5);
  });

  it("is repeatable: uploading the same graded test again changes nothing", () => {
    assignment();
    const input = { cycle: cycle(), schoolTest: test({ pardon: true, dormant: true, ornament: true, march: true }), occurredAt: "2026-11-12T12:00:00.000Z" };
    recordGradedTestBond(db, input);
    const before = exportEvents(db).length;
    recordGradedTestBond(db, input);
    expect(exportEvents(db)).toHaveLength(before);
  });

  it("refuses a bond whose rows differ from code's own scoring", () => {
    assignment();
    bondLockedPredictions(db, cycle());
    const school = recordSchoolTest(db, test({ pardon: true, dormant: true, ornament: true, march: true }), { actor: "parent", occurred_at: "2026-11-12T12:00:00.000Z" });
    const honest = scoreLockedPredictions(exportEvents(db), HW)!;
    const cites = [school.event_id, ...honest.rows.flatMap(row => row.predictions.map(p => p.predictionEventId))];
    const forged = structuredClone(honest);
    forged.summary.right = 0;
    expect(() => recordFact(db, "prediction.scored", forged, { cites })).toThrow(/scored_mismatch/);
    const dropped = structuredClone(honest);
    dropped.rows[0].predictions = [];
    expect(() => recordFact(db, "prediction.scored", dropped, { cites })).toThrow(/scored_mismatch/);
    expect(() => recordFact(db, "prediction.scored", honest, { cites: [school.event_id] })).toThrow(/scored_citation/);
    expect(recordFact(db, "prediction.scored", honest, { cites }).type).toBe("prediction.scored");
  });

  it("scoring with no school test yet returns nothing", () => {
    assignment();
    bondLockedPredictions(db, cycle());
    expect(scoreLockedPredictions(exportEvents(db), HW)).toBeNull();
  });
});

describe("history any model can read months later", () => {
  it("lays out each week: predicted range, confidence, model, lock date, then her actual answer", () => {
    assignment();
    recordGradedTestBond(db, { cycle: cycle(), schoolTest: test({ pardon: true, dormant: "bormant", ornament: true, march: true }), occurredAt: "2026-11-12T12:00:00.000Z" });
    const lines = predictionHistoryLines(exportEvents(db));
    expect(lines.join("\n")).toContain(`${HW}: school test 2026-11-12: 3 of 4 right; predicted 2 to 3 right; inside the prediction`);
    expect(lines).toContain("- dormant: predicted 50-75% right on her own (confidence 0.45, model not recorded, locked 2026-11-08); school test: missed, wrote \"bormant\"");
    expect(lines).toContain("- pardon: predicted 50-75% right on her own (confidence 0.45, model not recorded, locked 2026-11-08); school test: right");
  });
});

describe("a school test of part of the list", () => {
  // 2026-11-13 Ila's real test covered 8 of her 12 words. The words not tested stay unknown, said plainly, never
  // dropped silently and never scored (LEARNING_FEEDBACK_LOOP: untested targets remain unknown).
  it("scores only the tested words and names the untested ones as unknown", () => {
    assignment();
    recordGradedTestBond(db, { cycle: cycle(), schoolTest: { ...test({ pardon: true, dormant: true, ornament: true, march: true }),
      results: test({ pardon: true, dormant: true, ornament: true, march: true }).results.filter(row => row.word !== "ornament") }, occurredAt: "2026-11-12T12:00:00.000Z" });
    const lines = predictionHistoryLines(exportEvents(db));
    expect(lines.join("\n")).toContain(`${HW}: school test 2026-11-12: 3 of 3 right`);
    expect(lines).toContain("- not on the school test, still unknown: ornament");
  });
});

describe("the Planner reads the bond in her past weeks", () => {
  it("shows a week's locked predictions against the graded test in the week view", async () => {
    const { pastWeekLines } = await import("./pastWeeks");
    assignment();
    recordGradedTestBond(db, { cycle: cycle(), schoolTest: test({ pardon: true, dormant: "bormant", ornament: true, march: true }), occurredAt: "2026-11-12T12:00:00.000Z" });
    const week = { homeworkId: HW, domain: "spelling", title: "Words", lifecycle: "awaiting_calibration", started: "2026-11-08T00:00:00.000Z", testDate: "2026-11-12",
      targets: [], boards: [], answers: [], decisions: [], calls: [], predictions: { evaluated: 0, inRange: 0 }, minutes: null, schoolTest: null, journal: null,
      bonded: predictionHistoryLines(exportEvents(db), HW) };
    const lines = pastWeekLines(week);
    expect(lines).toContain("Your locked predictions against the graded school test (bonded in her chart by code; the latest lock per word shown):");
    expect(lines.join("\n")).toContain("- dormant: predicted 50-75% right on her own (confidence 0.45, model not recorded, locked 2026-11-08); school test: missed, wrote \"bormant\"");
  });
});
