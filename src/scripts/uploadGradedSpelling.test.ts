import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { linearJourneyFixture } from "./fixtures/authoredJourney";
import { buildSpellingRecallItems, createSpellingDiscoveryCycle } from "../engine/learningCycleIngest";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { readPastWeeks } from "../engine/pastWeeks";
import { parseTickedSpellingTest, runUploadGradedHomework } from "./uploadGradedHomework";
import { openChart } from "../chart/db";
import { exportEvents } from "../chart/exportEvents";
import { recordAssignment } from "../chart/spelling/record";

const roots: string[] = [];
afterEach(() => vi.unstubAllEnvs());
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

function spellingWeek() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "graded-spelling-")); roots.push(rootDir);
  const childId = "lab", homeworkId = "words";
  const items = buildSpellingRecallItems({ homeworkId, words: ["night", "light", "right"], evidenceIds: ["source"], measurementRole: "fresh_checkpoint" });
  createSpellingDiscoveryCycle({ childId, homeworkId, title: "Words", contentFingerprint: "f", items, boardDefinition: linearJourneyFixture([`${homeworkId}:discovery`]) }, { rootDir });
  // Her chart database, as on the kiosk: a graded test is bonded there first or not recorded at all.
  vi.stubEnv("SUNNY_CHART_DIR", path.join(rootDir, "charts"));
  const db = openChart(childId);
  recordAssignment(db, { assignmentId: homeworkId, words: ["night", "light", "right"], testDate: null, sourcePhotoHash: "a".repeat(64) });
  db.close();
  return { rootDir, childId, homeworkId, items };
}

const interpret = vi.fn(async (cycle: { observations: Array<{ observationId: string }> }) => ({
  status: "inconclusive" as const, reason: "recorded", nextAction: "plan", evidenceIds: cycle.observations.map(row => row.observationId),
  predictionEvaluationIds: [], preserve: [], change: [], testNext: [], nextEvidenceRequired: ["delayed"],
}));

describe("parent uploads a graded spelling test as ticks", () => {
  it("reads a date line and one word per line with a tick, a cross, and what she wrote", () => {
    expect(parseTickedSpellingTest("date: 2026-11-12\nnight ✓\nlight ✗ lite\nRight right\n")).toEqual({
      testDate: "2026-11-12",
      rows: [
        { word: "night", correct: true },
        { word: "light", correct: false, wrote: "lite" },
        { word: "right", correct: true },
      ],
    });
  });

  it("links each word to its frozen spelling ID, scores from the ticks, and dates the grade by the test day", async () => {
    const { rootDir, childId, homeworkId, items } = spellingWeek();
    const file = path.join(rootDir, "test.txt");
    fs.writeFileSync(file, "date: 2026-11-12\nnight ✓\nlight ✗ lite\nright ✓\n", "utf8");

    await runUploadGradedHomework([`--child=${childId}`, `--pdf=${file}`, `--homework=${homeworkId}`, "--yes"], {
      rootDir, now: new Date("2026-11-14T15:00:00.000Z"), logger: { log: () => undefined }, interpret,
    });

    const cycle = getLearningCycle(childId, homeworkId, { rootDir })!;
    const calibration = cycle.calibrations!.at(-1)!;
    expect(calibration.gradedItems.map(row => row.target)).toEqual(items.map(item => item.constructId));
    expect(calibration.score).toBeCloseTo(2 / 3, 2);
    expect(calibration.gradedAt.slice(0, 10)).toBe("2026-11-12");
    expect(cycle.evidenceSources[0]).toMatchObject({ testDate: "2026-11-12" });
    expect(cycle.observations.find(row => row.prompt === "light")).toMatchObject({ childResponse: "lite", result: { correct: false } });

    const week = readPastWeeks(childId, { rootDir }).weeks[0];
    expect(week.schoolTest).toMatchObject({ right: 2, total: 3 });
    expect(week.schoolTest!.gradedAt.slice(0, 10)).toBe("2026-11-12");
  });

  it("records nothing and names the word when a typed word is not on the week's list", async () => {
    const { rootDir, childId, homeworkId } = spellingWeek();
    const file = path.join(rootDir, "test.txt");
    fs.writeFileSync(file, "night ✓\nlite ✗\n", "utf8");
    const lines: string[] = [];

    await runUploadGradedHomework([`--child=${childId}`, `--pdf=${file}`, `--homework=${homeworkId}`, "--yes"], {
      rootDir, logger: { log: (line: string) => lines.push(line) }, interpret,
    });

    expect(getLearningCycle(childId, homeworkId, { rootDir })!.evidenceSources).toHaveLength(0);
    expect(lines.join("\n")).toContain("Not on this week's list: lite");
  });

  it("also records the school test in her chart database, so cross-week claims can be scored against it", async () => {
    const { rootDir, childId, homeworkId } = spellingWeek();
    const file = path.join(rootDir, "test.txt");
    fs.writeFileSync(file, "date: 2026-11-12\nnight ✓\nlight ✗ lite\nright ✓\n", "utf8");

    await runUploadGradedHomework([`--child=${childId}`, `--pdf=${file}`, `--homework=${homeworkId}`, "--yes"], {
      rootDir, logger: { log: () => undefined }, interpret,
    });

    const reopened = openChart(childId, { readonly: true });
    const school = exportEvents(reopened).find(event => event.type === "school_test.recorded");
    const bonded = exportEvents(reopened).find(event => event.type === "prediction.scored");
    reopened.close();
    expect(school).toMatchObject({ actor: "parent", payload: { assignmentId: homeworkId, testDate: "2026-11-12", sourceKind: "parent_transcription", results: [
      { word: "night", correct: true, writtenResponse: "night" },
      { word: "light", correct: false, writtenResponse: "lite" },
      { word: "right", correct: true, writtenResponse: "right" },
    ] } });
    expect(bonded).toMatchObject({ actor: "system", cites: [school!.event_id], payload: { assignmentId: homeworkId, schoolTestEventId: school!.event_id, testDate: "2026-11-12",
      summary: { words: 3, right: 2, predictedRight: null, inRange: null } } });
  });

  // Owner 2026-11-12: a graded test that cannot be bonded in her chart is not half-recorded and not silently skipped.
  it("stops loudly and records nothing when her chart database is not set up", async () => {
    const { rootDir, childId, homeworkId } = spellingWeek();
    vi.stubEnv("SUNNY_CHART_DIR", "");
    const file = path.join(rootDir, "test.txt");
    fs.writeFileSync(file, "date: 2026-11-12\nnight ✓\nlight ✗ lite\nright ✓\n", "utf8");
    const lines: string[] = [];
    await expect(runUploadGradedHomework([`--child=${childId}`, `--pdf=${file}`, `--homework=${homeworkId}`, "--yes"], {
      rootDir, logger: { log: (line: string) => lines.push(line) }, interpret,
    })).rejects.toThrow(/chart_bond_failed:no_chart_dir/);
    expect(lines.join("\n")).toContain("NOT RECORDED");
    expect(getLearningCycle(childId, homeworkId, { rootDir })!.evidenceSources).toHaveLength(0);
  });

  // 2026-11-13 Ila's real test (8/8, owner-caught when recording it): the teacher tested 8 of the week's 12 words, and
  // her chart refused any test that did not cover every word, so the first real grade could not be recorded. The
  // contract says untested words stay unknown. A test may cover part of the list; untested words stay unscored.
  it("records a school test that covers only part of the week's words; untested words stay unknown", async () => {
    const { rootDir, childId, homeworkId } = spellingWeek();
    const file = path.join(rootDir, "test.txt");
    fs.writeFileSync(file, "date: 2026-11-12\nnight ✓\nlight ✗ lite\n", "utf8");
    await runUploadGradedHomework([`--child=${childId}`, `--pdf=${file}`, `--homework=${homeworkId}`, "--yes"], {
      rootDir, logger: { log: () => undefined }, interpret,
    });
    expect(getLearningCycle(childId, homeworkId, { rootDir })!.evidenceSources).toHaveLength(1);
    const db = openChart(childId);
    const school = exportEvents(db).find(event => event.type === "school_test.recorded")!;
    db.close();
    expect((school.payload as { results: Array<{ word: string }> }).results.map(row => row.word)).toEqual(["night", "light"]);
  });

  it("does not read a JSON score of 1 as 100% when the ticks say otherwise", async () => {
    const { rootDir, childId, homeworkId } = spellingWeek();
    const file = path.join(rootDir, "test.json");
    fs.writeFileSync(file, JSON.stringify({ score: 1, testDate: "2026-11-12", gradedItems: [
      { target: "night", correct: true }, { target: "light", correct: false }, { target: "right", correct: false },
    ] }), "utf8");

    await runUploadGradedHomework([`--child=${childId}`, `--pdf=${file}`, `--homework=${homeworkId}`, "--yes"], {
      rootDir, logger: { log: () => undefined }, interpret,
    });

    expect(getLearningCycle(childId, homeworkId, { rootDir })!.calibrations!.at(-1)!.score).toBeCloseTo(1 / 3, 2);
  });

  // 2026-11-13 Ila's 8/8 test (AI-caught before recording): a teacher's count "2" on a 2-word test was read as 2 out of
  // 100. A whole-number score no bigger than the number of graded words is a count of right words.
  it("reads a teacher's count of right words as a count, not a percent", async () => {
    const { rootDir, childId, homeworkId } = spellingWeek();
    const file = path.join(rootDir, "test.json");
    fs.writeFileSync(file, JSON.stringify({ score: 2, testDate: "2026-11-12", gradedItems: [
      { target: "night", correct: true }, { target: "light", correct: true },
    ] }), "utf8");
    await runUploadGradedHomework([`--child=${childId}`, `--pdf=${file}`, `--homework=${homeworkId}`, "--yes"], {
      rootDir, logger: { log: () => undefined }, interpret,
    });
    expect(getLearningCycle(childId, homeworkId, { rootDir })!.calibrations!.at(-1)!.score).toBeCloseTo(1, 2);
  });
});
