import { familyDay } from "../utils/familyCalendar";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { listBoardInstances } from "./learningBoardInstances";
import type { LearningCycleNodeContract, LearningCycleRecordV2, PlannerSelfReview } from "./learningCycleRepository";
import { readCanonicalCycles } from "./longitudinalLearning";
import { activityOf, answers, plannerJournalFile, scorePlannerCalls, targetsOf } from "./plannerIntrospection";
import { toolFor, type PlannerTool } from "./plannerToolLoop";
import type { HomeworkSources } from "./schoolTestObjective";
import { timeRecord } from "./sessionScorecard";

/**
 * Week-to-week memory (owner, 2026-11-10: "The tutor remembers their student week to week. So should the planner.").
 * Every earlier homework cycle of a child, read from her records by code: her words or problems, her first tries on her
 * own over time, the Planner's decisions and self-reviews, its scored calls, minutes, and the graded school test.
 * Nothing here is summarized by an AI, ranks or recommends; the Planner pulls it a page at a time with read_past_weeks.
 */
type Count = { right: number; total: number };
type Help = "on her own" | "with help" | "help not recorded";
export type PastWeekAnswer = { target: string; at: string; board?: number; stop?: string; wrote?: string; right: boolean; help: Help; retry: boolean; school: boolean };
export type PastWeekStop = { title: string; game: string; targets: string[]; focus?: string };
export type PastWeekDecision = { number: number; at: string; afterBoard?: number; action: string; status: string; reason: string; change: string[]; testNext: string[];
  selfReview?: PlannerSelfReview; builtBoard?: number; stops: PastWeekStop[]; targets: string[]; before: Count; after: Count };
export type PastWeek = {
  homeworkId: string; domain: string; title: string; lifecycle: string; started: string; lastAnswer?: string; testDate: string | null;
  /** Her words (id = the word) or problems (id = the problem id, text = its prompt), in the order first planned. */
  targets: Array<{ id: string; label: string; text: string }>;
  boards: Array<{ number: number; kind: string; publishedAt?: string; played: boolean; stops: Array<PastWeekStop & { nodeIds: string[] }> }>;
  answers: PastWeekAnswer[];
  decisions: PastWeekDecision[];
  calls: Array<{ label: string; expected: boolean; answered?: { right: boolean; wrote?: string } }>;
  predictions: { evaluated: number; inRange: number };
  minutes: { learning: number; play: number; call: number; sessions: number } | null;
  schoolTest: { gradedAt: string; right: number; total: number; score: number | null; missed: Array<{ target: string; wrote?: string }> } | null;
  journal: { file: string; lines: string[] } | null;
};
export type PastWeeksArchive = { version: 1; childId: string; weeks: PastWeek[] };

const SCHOOL = new Set(["graded_work", "delayed_reassessment"]);
const HELP: Record<string, Help> = { unassisted: "on her own", assisted: "with help", unknown: "help not recorded" };
const day = (iso: string | undefined) => familyDay(iso);
const count = (list: PastWeekAnswer[]): Count => ({ right: list.filter(row => row.right).length, total: list.length });
const firstTry = (row: PastWeekAnswer) => row.help === "on her own" && !row.retry && !row.school;
const ofTotal = (c: Count) => c.total ? `${c.right} of ${c.total} right` : "not answered on her own";
const rate = (c: Count) => c.right / c.total;
const direction = (before: Count, after: Count) => !after.total ? "none yet" : !before.total ? "no earlier answers to compare" : rate(after) > rate(before) ? "up" : rate(after) < rate(before) ? "down" : "same";
const stopLabel = (stop: PastWeekStop) => `${stop.game} "${stop.title}" (${stop.targets.join(", ")}${stop.focus ? `; aimed at: ${stop.focus}` : ""})`;
const percent = (test: NonNullable<PastWeek["schoolTest"]>) => Math.round((test.score ?? test.right / Math.max(1, test.total)) * 100);
const schoolLine = (week: PastWeek) => week.schoolTest ? `${week.schoolTest.right} of ${week.schoolTest.total} right (${percent(week.schoolTest)}%), graded ${day(week.schoolTest.gradedAt)}` : "no graded test uploaded";
const noun = (week: PastWeek) => week.domain === "spelling" ? "words" : "problems";

function testDateOf(homework: HomeworkSources | undefined, homeworkId: string): string | null {
  const rows = [homework?.waterfall?.current, ...Object.values(homework?.activeByDomain ?? {}), homework?.pending];
  return rows.find(row => row?.homeworkId === homeworkId && /^\d{4}-\d{2}-\d{2}/.test(row.testDate ?? ""))?.testDate?.slice(0, 10) ?? null;
}

/** One cycle, as facts: the reader's only job. */
export function pastWeekOf(cycle: LearningCycleRecordV2, opts: { rootDir?: string; homework?: HomeworkSources } = {}): PastWeek {
  const nodes = new Map(cycle.nodes.map(node => [node.nodeId, node]));
  const targets = new Map<string, { id: string; label: string; text: string }>();
  for (const node of cycle.nodes) {
    for (const item of Object.values(node.evidenceContract?.spellingItems ?? {})) if (!targets.has(item.word)) targets.set(item.word, { id: item.word, label: item.word, text: item.word });
    for (const item of Object.values(node.evidenceContract?.itemContracts ?? {})) if (!targets.has(item.id)) targets.set(item.id, { id: item.id, label: `${item.id} "${item.prompt}"`, text: item.prompt });
  }
  if (!targets.size) for (const target of cycle.assignment.targets) targets.set(target, { id: target, label: target, text: target });
  const rows: PastWeekAnswer[] = answers(cycle).map(({ row, word, node, board }) => ({ target: word, at: row.observedAt, ...(board ? { board } : {}), ...(node ? { stop: node.title } : {}),
    ...(row.childResponse?.trim() ? { wrote: row.childResponse.trim() } : {}), right: row.result.correct === true, help: HELP[row.assistance?.status] ?? "help not recorded",
    retry: (row.confounds ?? []).includes("retry"), school: SCHOOL.has(String(row.provenance)) }));
  const answered = new Set(answers(cycle).flatMap(row => row.node ? [row.node.nodeId] : []));
  const stopOf = (node: LearningCycleNodeContract) => ({ title: node.title, game: activityOf(node) ?? "activity", targets: targetsOf(node), ...(node.focus ? { focus: node.focus } : {}) });
  const boards = listBoardInstances(cycle).map((board, index) => {
    const stops = board.nodeIds.flatMap(id => nodes.get(id) ? [{ ...stopOf(nodes.get(id)!), nodeIds: [id] }] : []);
    return { number: index + 1, kind: board.kind, ...(board.publishedAt ? { publishedAt: board.publishedAt } : {}), stops,
      played: board.nodeIds.some(id => nodes.get(id)?.state === "completed" || answered.has(id)) };
  });
  const decided = cycle.decisionHistory.filter(row => row.eventType === "theory_decided");
  const decisions = decided.map((decision, index): PastWeekDecision => {
    const at = Date.parse(decision.createdAt), until = decided[index + 1] ? Date.parse(decided[index + 1].createdAt) : Infinity;
    const built = boards.find(board => listBoardInstances(cycle)[board.number - 1].plannerDecisionId === decision.decisionId);
    const after = boards.filter(board => board.publishedAt && Date.parse(board.publishedAt) <= at && board !== built).at(-1);
    const stops = (built?.stops ?? []).map(({ nodeIds: _ids, ...stop }) => stop);
    const aimed = new Set(stops.flatMap(stop => stop.targets));
    const own = (from: number, to: number) => count(rows.filter(row => firstTry(row) && aimed.has(row.target) && Date.parse(row.at) >= from && Date.parse(row.at) < to));
    return { number: index + 1, at: decision.createdAt, ...(after ? { afterBoard: after.number } : {}), action: decision.nextAction ?? "none", status: decision.status ?? "unstated",
      reason: decision.reason, change: [...(decision.change ?? [])], testNext: [...(decision.testNext ?? [])], ...(decision.selfReview ? { selfReview: structuredClone(decision.selfReview) } : {}),
      ...(built ? { builtBoard: built.number } : {}), stops, targets: [...aimed], before: own(-Infinity, at), after: own(at, until) };
  });
  const evaluated = cycle.predictionEvaluations ?? [];
  const sessions = (() => { try { return timeRecord(cycle, { rootDir: opts.rootDir }).sessions; } catch { return []; } })();
  const sum = (key: "learning" | "play" | "call") => Math.round(sessions.reduce((total, row) => total + (row.minutes[key] ?? 0), 0) * 10) / 10;
  const graded = rows.filter(row => row.school);
  const calibration = (cycle.calibrations ?? []).at(-1);
  const journalFile = plannerJournalFile(cycle, { rootDir: opts.rootDir });
  return {
    homeworkId: cycle.homeworkId, domain: cycle.domain, title: cycle.assignment.title, lifecycle: cycle.lifecycle, started: cycle.createdAt,
    ...(rows.length ? { lastAnswer: rows.map(row => row.at).sort().at(-1) } : {}), testDate: testDateOf(opts.homework, cycle.homeworkId),
    targets: [...targets.values()], boards, answers: rows, decisions,
    calls: scorePlannerCalls(cycle).map(call => ({ label: call.label, expected: call.onHerOwn, ...(call.answer ? { answered: { right: call.answer.result.correct === true, ...(call.answer.childResponse ? { wrote: call.answer.childResponse } : {}) } } : {}) })),
    predictions: { evaluated: evaluated.length, inRange: evaluated.filter(row => row.observedMetric !== null && row.observedMetric >= row.predictedMetric.min && row.observedMetric <= row.predictedMetric.max).length },
    minutes: sessions.length ? { learning: sum("learning"), play: sum("play"), call: sum("call"), sessions: sessions.length } : null,
    schoolTest: calibration || graded.length ? {
      gradedAt: calibration?.gradedAt ?? graded.at(-1)!.at,
      ...(calibration?.gradedItems.length ? { right: calibration.gradedItems.filter(row => row.correct).length, total: calibration.gradedItems.length } : count(graded)),
      score: calibration?.score ?? null,
      missed: graded.length ? graded.filter(row => !row.right).map(row => ({ target: row.target, ...(row.wrote ? { wrote: row.wrote } : {}) }))
        : (calibration?.gradedItems ?? []).filter(row => !row.correct).map(row => ({ target: row.target })),
    } : null,
    journal: fs.existsSync(journalFile) ? { file: path.relative(path.resolve(journalFile, "../../.."), journalFile), lines: fs.readFileSync(journalFile, "utf8").split("\n").filter(line => line.trim()) } : null,
  };
}

/** Every earlier homework cycle of this child, newest first. The week being planned is left out by id. */
export function readPastWeeks(childId: string, opts: { rootDir?: string; homework?: HomeworkSources; excludeHomeworkIds?: string[] } = {}): PastWeeksArchive {
  const id = childId.trim().toLowerCase(), skip = new Set(opts.excludeHomeworkIds ?? []);
  const weeks = readCanonicalCycles(id, opts.rootDir).filter(cycle => !skip.has(cycle.homeworkId)).map(cycle => pastWeekOf(cycle, opts))
    .sort((a, b) => b.started.localeCompare(a.started) || a.homeworkId.localeCompare(b.homeworkId));
  console.log(` 🎮 [past-weeks] [read] [ok] child=${id} weeks=${weeks.length} excluded=${[...skip].join(",") || "none"}`);
  return { version: 1, childId: id, weeks };
}

const tryText = (row: PastWeekAnswer) => `board ${row.board ?? "unknown"} ${row.right ? "right" : `missed${row.wrote ? ` "${row.wrote}"` : ""}`} (${day(row.at)})`;
function targetFacts(week: PastWeek, target: string) {
  const rows = week.answers.filter(row => row.target === target);
  const first = rows.filter(firstTry), helped = rows.filter(row => row.help === "with help" && !row.school), unknown = rows.filter(row => row.help === "help not recorded" && !row.school);
  const retries = rows.filter(row => row.retry && !row.school).length, school = rows.filter(row => row.school).at(-1);
  const practicedIn = week.boards.flatMap(board => board.played ? board.stops.filter(stop => stop.targets.includes(target)).map(stop => `${stop.game} "${stop.title}" (board ${board.number})`) : []);
  return { firstTries: first.length ? first.map(tryText).join("; ") : "none", ...(helped.length ? { withHelp: ofTotal(count(helped)) } : {}), ...(unknown.length ? { helpNotRecorded: ofTotal(count(unknown)) } : {}),
    retries, schoolTest: school ? (school.right ? "right" : `missed${school.wrote ? ` "${school.wrote}"` : ""}`) : "not on a graded test", practicedIn };
}

export function pastWeekIndex(archive: PastWeeksArchive) {
  return archive.weeks.map(week => ({ week: week.homeworkId, domain: week.domain, title: week.title, started: day(week.started), lastAnswer: day(week.lastAnswer) || "none",
    testDate: week.testDate ?? "not recorded", targets: week.targets.length, boardsPlayed: week.boards.filter(board => board.played).length, decisions: week.decisions.length,
    firstTriesOnHerOwn: [...new Set(week.answers.filter(firstTry).map(row => row.board ?? 0))].sort((a, b) => a - b)
      .map(board => `board ${board || "unknown"}: ${ofTotal(count(week.answers.filter(row => firstTry(row) && (row.board ?? 0) === board)))}`).join("; ") || "none",
    schoolTest: schoolLine(week) }));
}

/** One week in full, as lines (the tool pages them). */
export function pastWeekLines(week: PastWeek): string[] {
  const label = new Map(week.targets.map(row => [row.id, row.label]));
  const ownWord = week.domain === "spelling" ? "word" : "problem";
  return [
    `Week ${week.homeworkId}: "${week.title}" (${week.domain}), from ${day(week.started)}${week.lastAnswer ? `, last answer ${day(week.lastAnswer)}` : ""}; lifecycle ${week.lifecycle}`,
    `Test date: ${week.testDate ?? "not recorded"}`,
    `${week.domain === "spelling" ? "Words" : "Problems"}: ${week.targets.map(row => row.label).join(", ") || "none recorded"}`,
    `Boards: ${week.boards.map(board => `board ${board.number} (${board.kind}${board.publishedAt ? `, ${day(board.publishedAt)}` : ""}${board.played ? "" : ", not played"}): ${board.stops.map(stop => `${stop.game} "${stop.title}"`).join(", ") || "no stops"}`).join("; ") || "none"}`,
    `Her first tries on her own by ${ownWord} (retries, help and the school test apart; counted by code):`,
    ...week.targets.map(target => { const f = targetFacts(week, target.id);
      return `- ${target.label}: first tries on her own: ${f.firstTries}${f.withHelp ? `; with help ${f.withHelp}` : ""}${f.helpNotRecorded ? `; help not recorded ${f.helpNotRecorded}` : ""}${f.retries ? `; ${f.retries} retr${f.retries === 1 ? "y" : "ies"} after a first try` : ""}; school test ${f.schoolTest}${f.practicedIn.length ? `; practiced in: ${f.practicedIn.join(", ")}` : ""}`; }),
    `Your decisions that week (your words; her answers counted by code):`,
    ...(week.decisions.length ? week.decisions.flatMap(d => [
      `- Decision ${d.number} (${day(d.at)}${d.afterBoard ? `, after board ${d.afterBoard}` : ""}; ${d.action}; theory ${d.status}): "${d.reason}"`,
      ...d.change.map(line => `  You said you would change: "${line}"`), ...d.testNext.map(line => `  You said you would test next: "${line}"`),
      ...(d.selfReview ? [`  What I tried: ${d.selfReview.whatITried}`, `  What happened: ${d.selfReview.whatHappened}`, `  Why: ${d.selfReview.why}`,
        ...(d.selfReview.whatIKeep ? [`  What I keep: ${d.selfReview.whatIKeep}`] : []), `  What I change now: ${d.selfReview.whatIChangeNow}`] : ["  No self-review was recorded with this decision."]),
      d.builtBoard ? `  Built board ${d.builtBoard}: ${d.stops.map(stopLabel).join("; ")}` : "  No board was built from this decision.",
      ...(d.targets.length ? [`  Her first tries on its ${noun(week)} on her own, counted by code: before ${ofTotal(d.before)} -> after (until the next decision) ${ofTotal(d.after)}: ${direction(d.before, d.after)}`] : []),
    ]) : ["- No decisions recorded."]),
    week.calls.length ? `Your calls that week: ${week.calls.filter(call => call.answered && call.answered.right === call.expected).length} of ${week.calls.filter(call => call.answered).length} right${week.calls.some(call => !call.answered) ? `, ${week.calls.filter(call => !call.answered).length} not answered on her own` : ""} (${
      week.calls.map(call => `${call.label}: expected ${call.expected ? "right" : "not yet"}, ${!call.answered ? "no answer on her own yet" : call.answered.right ? "she was right" : `she wrote "${call.answered.wrote ?? "?"}"`}`).join("; ")})` : "Your calls that week: none made",
    week.predictions.evaluated ? `Preregistered predictions: ${week.predictions.evaluated} evaluated, ${week.predictions.inRange} inside the predicted range` : "Preregistered predictions: none evaluated",
    week.minutes ? `Minutes: learning games ${week.minutes.learning}, play (Mystery/arcade) ${week.minutes.play}, call ${week.minutes.call}, over ${week.minutes.sessions} session${week.minutes.sessions === 1 ? "" : "s"}` : "Minutes: not recorded",
    week.schoolTest ? `School test: graded ${day(week.schoolTest.gradedAt)}: ${week.schoolTest.right} of ${week.schoolTest.total} right (${percent(week.schoolTest)}%)${week.schoolTest.missed.length ? `; missed: ${week.schoolTest.missed.map(row => `${label.get(row.target) ?? row.target}${row.wrote ? ` (wrote "${row.wrote}")` : ""}`).join(", ")}` : ""}` : "School test: no graded test uploaded",
    ...(week.journal ? [`Journal file: ${week.journal.file}`, ...week.journal.lines] : ["Journal file: none"]),
    "Every recorded answer (oldest first):",
    ...week.answers.map(row => row.school ? `- ${day(row.at)} school test: ${label.get(row.target) ?? row.target}${row.wrote ? ` wrote "${row.wrote}"` : ""} ${row.right ? "right" : "missed"}`
      : `- ${day(row.at)} board ${row.board ?? "unknown"}${row.stop ? ` "${row.stop}"` : ""}: ${label.get(row.target) ?? row.target}${row.wrote ? ` wrote "${row.wrote}"` : ""} ${row.right ? "right" : "missed"}, ${row.help}${row.retry ? ", retry" : ""}`),
  ];
}

/** Across weeks: targets matching a word, an ending ("-ant") or text, and the Planner's own words and stops that mention it. */
export function searchPastWeeks(archive: PastWeeksArchive, query: string) {
  const q = query.trim().toLowerCase(), ending = q.startsWith("-") && q.length > 1 ? q.slice(1) : undefined;
  const hits = (text: string | undefined) => Boolean(text && text.toLowerCase().includes(q));
  const targets = archive.weeks.flatMap(week => week.targets.filter(target => ending ? target.text.toLowerCase().endsWith(ending) : hits(target.text) || hits(target.label)).map(target => {
    const f = targetFacts(week, target.id);
    return { week: week.homeworkId, title: week.title, date: day(week.started), testDate: week.testDate ?? "not recorded", target: target.label, firstTriesOnHerOwn: f.firstTries,
      ...(f.withHelp ? { withHelp: f.withHelp } : {}), ...(f.retries ? { retries: f.retries } : {}), schoolTest: f.schoolTest, practicedIn: f.practicedIn };
  }));
  const notes = archive.weeks.flatMap(week => [
    ...(hits(week.title) ? [{ week: week.homeworkId, date: day(week.started), where: "assignment title", text: week.title }] : []),
    ...week.boards.flatMap(board => board.stops.filter(stop => hits(stopLabel(stop))).map(stop => ({ week: week.homeworkId, date: day(board.publishedAt), where: `board ${board.number} stop`, text: stopLabel(stop) }))),
    ...week.decisions.flatMap(d => {
      const review = d.selfReview;
      const fields: Array<[string, string | undefined]> = [["reason", d.reason], ...d.change.map(line => ["change", line] as [string, string]), ...d.testNext.map(line => ["test next", line] as [string, string]),
        ["what I tried", review?.whatITried], ["what happened", review?.whatHappened], ["why", review?.why], ["what I keep", review?.whatIKeep], ["what I change now", review?.whatIChangeNow]];
      return fields.filter(([, text]) => hits(text)).map(([where, text]) => ({ week: week.homeworkId, date: day(d.at), where: `decision ${d.number} ${where}`, text: text! }));
    }),
  ]);
  return { targets, notes };
}

/** Every self-review the Planner wrote, newest first, labelled by week and date, with her counted first tries after it. */
export function pastConclusions(archive: PastWeeksArchive) {
  return archive.weeks.flatMap(week => week.decisions.map(d => ({ week: week.homeworkId, title: week.title, date: day(d.at), decision: d.number,
    selfReview: d.selfReview ?? "no self-review recorded with this decision", change: d.change,
    evidence: d.targets.length ? `her first tries on its ${noun(week)} on her own: before ${ofTotal(d.before)} -> after ${ofTotal(d.after)}: ${direction(d.before, d.after)}` : "no board was built from this decision" })))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** The one short line a question carries; empty when she has no earlier week. */
export function pastWeeksLine(archive: PastWeeksArchive | undefined): string {
  const weeks = archive?.weeks ?? [];
  if (!weeks.length) return "";
  const shown = weeks.slice(0, 3).map(week => `${week.homeworkId} "${week.title}" (${week.domain}, from ${day(week.started)}; ${week.schoolTest ? `school test ${schoolLine(week)}` : schoolLine(week)})`);
  return `Her earlier weeks (${weeks.length} on record, newest first): ${shown.join("; ")}${weeks.length > 3 ? `; and ${weeks.length - 3} earlier` : ""}. Every week's words, results, your decisions and self-reviews are behind read_past_weeks: index, week, search (a word, an ending like -ant, or any text), conclusions.`;
}

/** read_past_weeks. Its schema is the same for every child and every history: week ids are free text checked here. */
export function pastWeeksTool<S>(archive: PastWeeksArchive): PlannerTool<S> {
  const ids = archive.weeks.map(week => week.homeworkId);
  const page = <T>(list: T[], offset: number, limit: number) => list.slice(offset, offset + limit);
  return toolFor<S>()({ name: "read_past_weeks",
    description: "Her earlier weeks (every earlier homework list, any subject), from her records. index: one row per week. week: one week in full, a page of lines at a time (her words or problems, first tries on her own over time, your decisions and self-reviews with her results before and after, your calls, minutes, the school test, the journal, every answer). search: a word, an ending like -ant, or any text, across weeks. conclusions: every self-review you wrote (what you kept and changed), with her counted results after it.",
    schema: z.object({
      view: z.enum(["index", "week", "search", "conclusions"]),
      week: z.string().describe("For week: a week id from the index. Otherwise empty."),
      query: z.string().describe("For search: a word, an ending like -ant, or any text. Otherwise empty."),
      offset: z.number().int().min(0).describe("First row or line to return; 0 for the start."),
      limit: z.number().int().min(1).max(100).describe("How many rows or lines, at most 100."),
    }).strict(),
    run: (_state, input) => {
      if (input.view === "index") return { ok: true, result: { view: "index", total: ids.length, offset: input.offset, rows: page(pastWeekIndex(archive), input.offset, input.limit) } };
      if (input.view === "conclusions") { const rows = pastConclusions(archive); return { ok: true, result: { view: "conclusions", total: rows.length, offset: input.offset, rows: page(rows, input.offset, input.limit) } }; }
      if (input.view === "week") {
        const week = archive.weeks.find(row => row.homeworkId === input.week.trim());
        if (!week) return { ok: false, error: `${input.week || "(empty)"} is not one of her earlier weeks; valid: ${ids.join(", ") || "none"}` };
        const lines = pastWeekLines(week);
        return { ok: true, result: { view: "week", week: week.homeworkId, total: lines.length, offset: input.offset, lines: page(lines, input.offset, input.limit) } };
      }
      if (!input.query.trim()) return { ok: false, error: "search needs a query: a word, an ending like -ant, or any text" };
      const found = searchPastWeeks(archive, input.query);
      return { ok: true, result: { view: "search", query: input.query.trim(), targetsTotal: found.targets.length, notesTotal: found.notes.length, offset: input.offset,
        targets: page(found.targets, input.offset, input.limit), notes: page(found.notes, input.offset, input.limit) } };
    } });
}

/** The archive a tool conversation reads, frozen beside its turns: a restart sends the same question and tool answers.
 * A conversation that began before this file existed replays without past weeks. A reader failure never stops a board. */
export function pastWeeksForDraft(input: { draftDir?: string; stagePrefix: string; build: () => PastWeeksArchive }): PastWeeksArchive | undefined {
  const file = input.draftDir ? path.join(input.draftDir, `${input.stagePrefix}-past-weeks.json`) : undefined;
  try {
    if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as PastWeeksArchive;
    if (input.draftDir && fs.existsSync(path.join(input.draftDir, "provider-receipts", `${input.stagePrefix}-turn-1.stage.json`))) {
      console.log(` 🎮 [past-weeks] [frozen] [replay-without] stage=${input.stagePrefix}`);
      return undefined;
    }
    const archive = input.build();
    if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(`${file}.tmp`, JSON.stringify(archive)); fs.renameSync(`${file}.tmp`, file); }
    console.log(` 🎮 [past-weeks] [frozen] [saved] stage=${input.stagePrefix} weeks=${archive.weeks.length}`);
    return archive;
  } catch (error) {
    console.error(` 🎮 [past-weeks] [frozen] [failed] stage=${input.stagePrefix} reason=${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}
