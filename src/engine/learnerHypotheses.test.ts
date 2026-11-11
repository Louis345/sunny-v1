import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openChart, type ChartDatabase } from "../chart/db";
import { exportEvents } from "../chart/exportEvents";
import { recordAssignment, recordFact, recordPresentation, recordResponse, recordSchoolTest, recordTags } from "../chart/spelling/record";
import { projectLearnerHypotheses } from "../chart/spelling/hypotheses";

// Teaching-record spec, Phase 2 (2026-11-11): "how she learns" is a Planner claim that spans weeks. Code scores it
// against later weeks with a closed query (words or pattern tags, a metric, an expected range); a claim counts as
// supported or contradicted only after evidence from 2 later weeks. Contradicted claims stay visible.
let root: string, db: ChartDatabase;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "learner-hypotheses-")); db = openChart("lab-hypotheses", { chartDir: root }); });
afterEach(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });

const SILENT = "spelling.silent_letters" as const, SHORT = "spelling.short_vowels" as const;
function week(assignmentId: string, words: Record<string, typeof SILENT | typeof SHORT>) {
  recordAssignment(db, { assignmentId, words: Object.keys(words), testDate: null, sourcePhotoHash: "a".repeat(64) });
  recordTags(db, { assignmentId, taxonomyVersion: 1, tags: Object.entries(words).map(([word, pattern]) => ({ word, patterns: [pattern] })) });
}
function firstTry(assignmentId: string, word: string, wrote: string, helped = false) {
  const sessionId = `${assignmentId}-s`, itemId = `${assignmentId}-${word}`;
  const shown = recordPresentation(db, { assignmentId, sessionId, itemId, word, acceptedForms: [word], instrument: "discovery", role: "measure", protocolVersion: 1, shown: { lettersVisible: false, hint: helped, companionHelp: false } });
  recordResponse(db, { assignmentId, sessionId, itemId, attempt: 1, rawResponse: wrote, status: "answered", support: { audioReplays: 0, spellingShown: false, hint: helped, companionHelp: false } }, { cites: [shown.event_id] });
}
function claim(extra: Record<string, unknown> = {}) {
  return recordFact(db, "learner.hypothesis", {
    hypothesisId: "silent-e-drops", claim: "On a new list she drops silent letters on her first try.", decisionIds: ["decision:hw1:3"],
    scope: { patterns: [SILENT], words: [] }, metric: "first_try_unassisted", expected: { min: 0, max: 0.5 },
    falsifier: "She spells most silent-letter words right on her first try on two new lists.", horizonDays: 42, formedInAssignmentId: "w1",
    ...extra,
  } as never, { occurred_at: "2026-11-11T15:00:00.000Z" });
}
const project = (now = "2026-11-20T15:00:00.000Z") => projectLearnerHypotheses(exportEvents(db), { now: new Date(now) });

describe("cross-week claims about how she learns", () => {
  it("stays proposed, with counts, until a second later week has evidence", () => {
    week("w1", { carnivore: SILENT, march: SHORT });
    firstTry("w1", "carnivore", "carnivor");
    claim();
    week("w2", { tribe: SILENT, stamp: SHORT });
    firstTry("w2", "tribe", "trib");
    firstTry("w2", "stamp", "stamp");
    const [only] = project();
    expect(only).toMatchObject({ hypothesisId: "silent-e-drops", status: "proposed", evidence: { right: 0, total: 1, weeks: [{ assignmentId: "w2", right: 0, total: 1 }] } });
  });

  it("is supported when two later weeks land inside the expected range, and contradicted, still listed, when they don't", () => {
    week("w1", { carnivore: SILENT });
    claim();
    week("w2", { tribe: SILENT, stone: SILENT });
    firstTry("w2", "tribe", "trib");
    firstTry("w2", "stone", "stone");
    week("w3", { shine: SILENT });
    firstTry("w3", "shine", "shin");
    expect(project()[0]).toMatchObject({ status: "supported", evidence: { right: 1, total: 3, rate: 0.333 } });

    week("w4", { knee: SILENT, write: SILENT, gnat: SILENT });
    ["knee", "write", "gnat"].forEach(word => firstTry("w4", word, word));
    expect(project()[0]).toMatchObject({ status: "contradicted", evidence: { right: 4, total: 6 } });
  });

  it("counts only first tries on her own, from weeks after the claim, never the week the claim came from", () => {
    week("w1", { carnivore: SILENT, pardon: SILENT });
    firstTry("w1", "carnivore", "carnivor");
    claim();
    firstTry("w1", "pardon", "pardn");
    week("w2", { tribe: SILENT, stone: SILENT });
    firstTry("w2", "tribe", "tribe", true);
    firstTry("w2", "stone", "ston");
    expect(project()[0]).toMatchObject({ status: "proposed", evidence: { right: 0, total: 1 } });
  });

  it("scores a school-test claim from the graded test, by named words when no pattern is given", () => {
    week("w1", { carnivore: SILENT });
    claim({ hypothesisId: "dormant-sticks", scope: { patterns: [], words: ["dormant", "pardon"] }, metric: "school_test", expected: { min: 0.5, max: 1 } });
    for (const id of ["w2", "w3"]) {
      week(id, { dormant: SHORT, pardon: SHORT, march: SHORT });
      recordSchoolTest(db, { assignmentId: id, testDate: "2026-11-19", photoHash: "b".repeat(64), results: [
        { word: "dormant", correct: true, writtenResponse: "dormant" }, { word: "pardon", correct: id === "w3", writtenResponse: id === "w3" ? "pardon" : "pardn" },
        { word: "march", correct: false, writtenResponse: "mrch" },
      ] });
    }
    expect(project()[0]).toMatchObject({ hypothesisId: "dormant-sticks", status: "supported", evidence: { right: 3, total: 4 } });
  });

  it("expires past its horizon without two weeks of evidence", () => {
    week("w1", { carnivore: SILENT });
    claim({ horizonDays: 7 });
    expect(project("2026-11-17T15:00:00.000Z")[0].status).toBe("proposed");
    expect(project("2026-11-19T15:00:00.000Z")[0].status).toBe("expired");
  });

  it("refuses a claim with no scope or a backwards range", () => {
    expect(() => claim({ hypothesisId: "empty", scope: { patterns: [], words: [] } })).toThrow("chart_payload_invalid");
    expect(() => claim({ hypothesisId: "backwards", expected: { min: 0.8, max: 0.2 } })).toThrow("chart_payload_invalid");
    expect(() => recordFact(db, "learner.hypothesis", { hypothesisId: "x" } as never, { actor: "parent" })).toThrow();
  });
});
