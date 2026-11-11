import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { PAST_HOMEWORK, PAST_WEEKS_CHILD, WEEK1, WEEK2, seedPastWeeks } from "../scripts/fixtures/pastWeeksChild";
import { pastConclusions, pastWeekIndex, pastWeekLines, pastWeeksForDraft, pastWeeksLine, pastWeeksTool, readPastWeeks, searchPastWeeks } from "./pastWeeks";
import { plannerToolDefinitions } from "./plannerToolLoop";

// 2026-11-10 owner: "The Planner doesn't know what it does week to week. That's insane... The tutor remembers their
// student week to week. So should the planner." Every question was built from one homework cycle; a new list's
// planner-journal began with "No earlier decisions on this list yet." even when last week's journal held the answer.
// No log failed (each week was internally right); the lab only ever built one cycle per child. These tests build two.
const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function seeded() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-past-weeks-")); roots.push(rootDir);
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
  seedPastWeeks(rootDir);
  return { rootDir, archive: readPastWeeks(PAST_WEEKS_CHILD, { rootDir, homework: PAST_HOMEWORK }) };
}

it("indexes every earlier week from her records, newest first, with the school test or that none was uploaded", () => {
  const { archive } = seeded();
  expect(pastWeekIndex(archive)).toEqual([
    { week: WEEK2, domain: "math", title: "Subtraction with regrouping", started: "2026-11-03", lastAnswer: "2026-11-05", testDate: "not recorded", targets: 2, boardsPlayed: 2, decisions: 1,
      firstTriesOnHerOwn: "board 1: 1 of 2 right; board 2: 1 of 1 right", schoolTest: "no graded test uploaded" },
    { week: WEEK1, domain: "spelling", title: "Week 8 words: -ant and -ent", started: "2026-10-26", lastAnswer: "2026-11-02", testDate: "2026-10-30", targets: 6, boardsPlayed: 3, decisions: 1,
      firstTriesOnHerOwn: "board 1: 2 of 6 right; board 2: 0 of 4 right; board 3: 3 of 4 right", schoolTest: "5 of 6 right (83%), graded 2026-11-02" },
  ]);
});

it("opens one week in full: each word's first tries on her own over time, the Planner's decisions with self-reviews and counted evidence, calls, minutes, the test, the journal and every answer", () => {
  const { archive } = seeded();
  const lines = pastWeekLines(archive.weeks.find(week => week.homeworkId === WEEK1)!);
  expect(lines).toContain(`- dormant: first tries on her own: board 1 missed "dorment" (2026-10-26); board 2 missed "dorment" (2026-10-27); board 3 right (2026-10-29); with help 1 of 1 right; school test right; practiced in: word-radar "Word Check" (board 1), visual-explainer "Ending Detectives" (board 2), word-radar "Radar Warm-up" (board 2), generated-game "Recall Race" (board 3)`);
  expect(lines).toContain(`- import: first tries on her own: board 1 missed "inport" (2026-10-26); board 2 missed "inport" (2026-10-27); board 3 missed "inport" (2026-10-29); 1 retry after a first try; school test missed "inport"; practiced in: word-radar "Word Check" (board 1), word-radar "Radar Warm-up" (board 2), generated-game "Recall Race" (board 3)`);
  expect(lines).toContain("- Decision 1 (2026-10-28, after board 2; generate_support; theory revised): \"She writes -ent for -ant on her own.\"");
  expect(lines).toContain("  What I keep: Recall-first worked: she says the word, spells it from memory, then checks.");
  expect(lines).toContain("  What I change now: A recall-first race on the -ant words, aimed at the -ant ending.");
  expect(lines).toContain(`  Built board 3: generated-game "Recall Race" (dormant, pleasant, servant, import; aimed at: -ant endings: say it, recall it, then check)`);
  expect(lines).toContain("  Her first tries on its words on her own, counted by code: before 0 of 8 right -> after (until the next decision) 3 of 4 right: up");
  expect(lines).toContain("Your calls that week: 1 of 2 right (dormant: expected right, she was right; import: expected right, she wrote \"inport\")");
  expect(lines).toContain("Preregistered predictions: 1 evaluated, 1 inside the predicted range");
  expect(lines).toContain("Minutes: learning games 22.5, play (Mystery/arcade) 6, call 3, over 1 session");
  expect(lines).toContain("School test: graded 2026-11-02: 5 of 6 right (83%); missed: import (wrote \"inport\")");
  expect(lines).toContain("- What I keep: Recall-first worked: she says the word, spells it from memory, then checks.");
  expect(lines.some(line => line.startsWith("Journal file:"))).toBe(true);
  expect(lines).toContain(`- 2026-10-29 board 3 "Recall Race": import wrote "import" right, on her own, retry`);
});

it("never summarizes with AI and leaves out the week being planned", () => {
  const { rootDir } = seeded();
  const archive = readPastWeeks(PAST_WEEKS_CHILD, { rootDir, excludeHomeworkIds: [WEEK2] });
  expect(archive.weeks.map(week => week.homeworkId)).toEqual([WEEK1]);
  expect(pastWeekLines(archive.weeks[0]).find(line => line.startsWith("Test date"))).toBe("Test date: not recorded");
  expect(readPastWeeks("nobody-here", { rootDir }).weeks).toEqual([]);
});

it("searches across weeks by a word, an ending or a pattern, returning what was tried and how she did", () => {
  const { archive } = seeded();
  const ant = searchPastWeeks(archive, "-ant");
  expect(ant.targets.map(row => row.target)).toEqual(["dormant", "pleasant", "servant"]);
  expect(ant.targets[0]).toMatchObject({ week: WEEK1, title: "Week 8 words: -ant and -ent", testDate: "2026-10-30",
    firstTriesOnHerOwn: `board 1 missed "dorment" (2026-10-26); board 2 missed "dorment" (2026-10-27); board 3 right (2026-10-29)`, schoolTest: "right" });
  expect(ant.targets[0].practicedIn).toContain(`generated-game "Recall Race" (board 3)`);
  // Plain text finds her words, the Planner's words and the stops: "recall" is in a self-review and a stop title.
  const recall = searchPastWeeks(archive, "recall");
  expect(recall.notes).toContainEqual({ week: WEEK1, date: "2026-10-28", where: "decision 1 what I keep", text: "Recall-first worked: she says the word, spells it from memory, then checks." });
  expect(recall.notes).toContainEqual({ week: WEEK1, date: "2026-10-28", where: "board 3 stop", text: `generated-game "Recall Race" (dormant, pleasant, servant, import; aimed at: -ant endings: say it, recall it, then check)` });
  expect(searchPastWeeks(archive, "subtract").targets.map(row => row.target)).toEqual([`p2 "Subtract 165 from 400."`]);
  expect(searchPastWeeks(archive, "subtract").notes.map(row => row.where)).toContain("decision 1 reason");
  expect(searchPastWeeks(archive, "zebra")).toEqual({ targets: [], notes: [] });
});

it("carries her learner conclusions across weeks, labelled by week and date, with the counted evidence after each", () => {
  const { archive } = seeded();
  expect(pastConclusions(archive)).toEqual([
    { week: WEEK2, title: "Subtraction with regrouping", date: "2026-11-04", decision: 1, selfReview: "no self-review recorded with this decision",
      change: ["Base-ten blocks for borrowing across a zero."], evidence: "her first tries on its problems on her own: before 1 of 2 right -> after 1 of 1 right: up" },
    { week: WEEK1, title: "Week 8 words: -ant and -ent", date: "2026-10-28", decision: 1,
      selfReview: { whatITried: "Word Radar practice and a picture page on the -ant endings.", whatHappened: "On her own she still wrote dorment, plesant and servent.",
        why: "Seeing the word first let her copy it; she never pulled it from memory.", whatIKeep: "Recall-first worked: she says the word, spells it from memory, then checks.",
        whatIChangeNow: "A recall-first race on the -ant words, aimed at the -ant ending." },
      change: ["Recall-first race on the -ant words."], evidence: "her first tries on its words on her own: before 0 of 8 right -> after 3 of 4 right: up" },
  ]);
});

it("puts one short line in the question and the rest behind read_past_weeks, whose strict schema never grows with her history", () => {
  const { archive } = seeded();
  expect(pastWeeksLine(archive)).toBe(`Her earlier weeks (2 on record, newest first): ${WEEK2} "Subtraction with regrouping" (math, from 2026-11-03; no graded test uploaded); ${WEEK1} "Week 8 words: -ant and -ent" (spelling, from 2026-10-26; school test 5 of 6 right (83%), graded 2026-11-02). Every week's words, results, your decisions and self-reviews are behind read_past_weeks: index, week, search (a word, an ending like -ant, or any text), conclusions.`);
  expect(pastWeeksLine({ ...archive, weeks: [] })).toBe("");
  const tool = pastWeeksTool(archive);
  const many = pastWeeksTool({ ...archive, weeks: Array.from({ length: 30 }, (_, i) => ({ ...archive.weeks[1], homeworkId: `hw-${i}` })) });
  expect(JSON.stringify(plannerToolDefinitions([tool]))).toBe(JSON.stringify(plannerToolDefinitions([many])));
  expect(JSON.stringify(plannerToolDefinitions([tool]))).not.toContain(WEEK1);
  // Every field is required (no optional-field budget spent); "" and 0 mean not used.
  const run = (input: Record<string, unknown>) => tool.run({}, tool.schema.parse({ week: "", query: "", offset: 0, limit: 20, ...input }));
  expect(run({ view: "week", week: "hw-nope" })).toEqual({ ok: false, error: `hw-nope is not one of her earlier weeks; valid: ${WEEK2}, ${WEEK1}` });
  expect(run({ view: "search" })).toEqual({ ok: false, error: "search needs a query: a word, an ending like -ant, or any text" });
  const page = run({ view: "week", week: WEEK1, offset: 0, limit: 5 }) as { ok: true; result: { total: number; lines: string[] } };
  expect(page.result.lines).toHaveLength(5);
  expect(page.result.total).toBe(pastWeekLines(archive.weeks[1]).length);
  expect(run({ view: "index" })).toMatchObject({ ok: true, result: { total: 2, rows: pastWeekIndex(archive) } });
  expect(run({ view: "conclusions", limit: 1 })).toMatchObject({ ok: true, result: { total: 2, offset: 0, rows: [pastConclusions(archive)[0]] } });
});

it("freezes the archive beside a Planner's turns, so a restart asks the same question; a question started before it replays without it", () => {
  const { rootDir, archive } = seeded();
  const draftDir = path.join(rootDir, "draft");
  let built = 0;
  const build = () => { built += 1; return archive; };
  expect(pastWeeksForDraft({ draftDir, stagePrefix: "spelling-intake-tools", build })).toEqual(archive);
  expect(pastWeeksForDraft({ draftDir, stagePrefix: "spelling-intake-tools", build: () => { throw new Error("rebuilt"); } })).toEqual(archive);
  expect(built).toBe(1);
  const older = path.join(rootDir, "older");
  fs.mkdirSync(path.join(older, "provider-receipts"), { recursive: true });
  fs.writeFileSync(path.join(older, "provider-receipts", "math-intake-tools-turn-1.stage.json"), "{}");
  expect(pastWeeksForDraft({ draftDir: older, stagePrefix: "math-intake-tools", build })).toBeUndefined();
  // A reader failure never stops a board: the Planner plans without past weeks, and the log says why.
  expect(pastWeeksForDraft({ draftDir: path.join(rootDir, "broken"), stagePrefix: "x", build: () => { throw new Error("disk"); } })).toBeUndefined();
});
