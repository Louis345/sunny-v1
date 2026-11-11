import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";
import { getLearningCycle, type LearningCycleRecordV2, type LearningCycleRepositoryOptions } from "./learningCycleRepository";
import { listChildProductIssues } from "./productIssues";
import { isFirstTryOnHerOwn, sessionGames, type SessionGame } from "./sessionTimeline";
import { raiseParentAlert } from "./sunnyHealth";
import { scorePlannerCalls } from "./plannerIntrospection";
import { minutesByDay, minutesLine, sessionMinutes, type SessionMinutes } from "./sessionTime";

/**
 * One scorecard per session, counted by code (owner, 2026-11-09: "how do we measure we are heading in the right
 * direction?"). Her answers on her own and with help, each game's time to first answer, how often she asked for
 * help, bugs she reported, and how the Planner's predictions landed. Read as a trend by the Planner; never judged here.
 */
export type SessionScorecard = {
  sessionId: string; startedAt: string; homeworkId: string;
  /** firstTries/retries: each try on an item is saved (2026-11-10); the first try is the measure, retries are practice. Absent on older cards. */
  answers: { total: number; right: number; onHerOwn: number; onHerOwnRight: number; withHelp: number; helpNotRecorded: number; given: number; firstTries?: number; firstTryRight?: number; retries?: number };
  games: Array<Pick<SessionGame, "title" | "answers" | "right" | "finished"> & { minutesToFirstAnswer: number | null }>;
  helpRequests: number; bugsReported: number;
  predictions: { checked: number; inRange: number };
  /** Where the session's minutes went, from its own records (owner, 2026-11-10). Absent on older cards. */
  minutes?: SessionMinutes;
};

const SYNTHETIC = /(^|[:_-])(synthetic|playwright|browser-acceptance|readiness)([:_-]|$)/i;
const SCHOOL = new Set(["graded_work", "delayed_reassessment"]);
const round1 = (value: number) => Math.round(value * 10) / 10;

function scorecardFile(cycle: Pick<LearningCycleRecordV2, "childId" | "homeworkId">, opts: LearningCycleRepositoryOptions = {}): string {
  return path.join(resolveChildContextDir(cycle.childId, { rootDir: opts.rootDir }), "homework", "scorecards", `${cycle.homeworkId.replace(/[^a-zA-Z0-9_.-]+/g, "_")}.ndjson`);
}

export function writeSessionScorecard(input: { childId: string; homeworkId?: string; sessionDir: string }, opts: LearningCycleRepositoryOptions = {}): SessionScorecard | undefined {
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(input.sessionDir, "metadata.json"), "utf8")) as { sessionId?: string; startedAt?: string };
    const cycle = input.homeworkId ? getLearningCycle(input.childId, input.homeworkId, opts) : undefined;
    if (!cycle || !metadata.startedAt) { console.log(` 🎮 [scorecard] [skipped] child=${input.childId} reason=${!cycle ? "no_learning_cycle" : "no_start_time"}`); return undefined; }
    const from = Date.parse(metadata.startedAt);
    const saved = (cycle.observations ?? []).filter(row => Date.parse(row.observedAt) >= from
      && !SCHOOL.has(String(row.provenance)) && !SYNTHETIC.test(`${row.observationId} ${row.sourceId}`));
    const rows = saved.filter(row => typeof row.result?.correct === "boolean");
    // A board's completion repeats its answers with help unknown; those are counted apart, never as her own.
    const known = rows.filter(row => row.assistance.status !== "unknown");
    const retry = (row: (typeof rows)[number]) => row.confounds.includes("retry");
    // On her own means her first try without help; a retry is practice (owner, 2026-11-10).
    const own = rows.filter(isFirstTryOnHerOwn);
    const transcriptFile = path.join(input.sessionDir, "transcript.md");
    const childTurns = fs.existsSync(transcriptFile) ? fs.readFileSync(transcriptFile, "utf8").split(/\n### /).flatMap(block => block.includes("**user:**") ? [block.split("**user:**")[1].split("**assistant:**")[0]] : []) : [];
    const card: SessionScorecard = {
      sessionId: metadata.sessionId ?? path.basename(input.sessionDir), startedAt: metadata.startedAt, homeworkId: cycle.homeworkId,
      answers: { total: known.length, right: known.filter(row => row.result.correct).length, onHerOwn: own.length, onHerOwnRight: own.filter(row => row.result.correct).length,
        withHelp: rows.filter(row => row.assistance.status === "assisted").length, helpNotRecorded: rows.length - known.length,
        given: sessionGames(input.sessionDir, cycle).reduce((sum, game) => sum + game.answers, 0),
        firstTries: rows.filter(row => !retry(row)).length, firstTryRight: rows.filter(row => !retry(row) && row.result.correct).length, retries: rows.filter(retry).length },
      games: sessionGames(input.sessionDir, cycle).map(game => ({ title: game.title, answers: game.answers, right: game.right, finished: game.finished,
        minutesToFirstAnswer: game.firstAnswerMin === null ? null : round1(game.firstAnswerMin - game.openedMin) })),
      helpRequests: childTurns.filter(text => /\bhelp\b/i.test(text)).length,
      bugsReported: listChildProductIssues(input.childId, { rootDir: opts.rootDir, limit: 200 }).filter(row => Date.parse(row.createdAt) >= from).length,
      // The Planner's calls answered in this session, checked by code (2026-11-10).
      predictions: (() => {
        const answered = scorePlannerCalls(cycle).filter(call => call.answer && Date.parse(call.answer.observedAt) >= from);
        return { checked: answered.length, inRange: answered.filter(call => call.hit).length };
      })(),
      ...(() => { const minutes = sessionMinutes(input.sessionDir, cycle); return minutes ? { minutes } : {}; })(),
    };
    // Answers she gave in games against answers saved (2026-11-10: 37 given, 0 saved, and nothing compared them).
    // Every try is saved, retries included, and an answer saved as not scorable is saved, not lost.
    if (card.answers.given > saved.length) void raiseParentAlert({ childId: input.childId, kind: "answers_not_saved",
      text: `${card.answers.given} answers given in games but ${saved.length} saved (${card.answers.retries} of them retries) in session ${card.sessionId}.` }, { rootDir: opts.rootDir });
    const file = scorecardFile(cycle, opts);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(card)}\n`, "utf8");
    console.log(` 🎮 [scorecard] [written] child=${input.childId} homework=${cycle.homeworkId} answers=${card.answers.total} own=${card.answers.onHerOwnRight}/${card.answers.onHerOwn} help=${card.helpRequests} learningMin=${card.minutes?.learning ?? "unknown"} playMin=${card.minutes?.play ?? "unknown"} callMin=${card.minutes?.call ?? "unknown"}`);
    return card;
  } catch (error) {
    console.error(` 🎮 [scorecard] [failed] child=${input.childId} reason=${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function readScorecards(cycle: Pick<LearningCycleRecordV2, "childId" | "homeworkId">, opts: LearningCycleRepositoryOptions = {}): SessionScorecard[] {
  const file = scorecardFile(cycle, opts);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").flatMap(line => { try { return line.trim() ? [JSON.parse(line) as SessionScorecard] : []; } catch { return []; } }) : [];
}

/** Her minutes per session and per day on this homework, for the Planner's read_record (owner, 2026-11-10). */
export function timeRecord(cycle: Pick<LearningCycleRecordV2, "childId" | "homeworkId">, opts: LearningCycleRepositoryOptions = {}) {
  const sessions = readScorecards(cycle, opts).flatMap(card => card.minutes ? [{ sessionId: card.sessionId, startedAt: card.startedAt, minutes: card.minutes }] : []);
  return { sessions, days: minutesByDay(sessions) };
}

/** The last few scorecards for this homework, oldest first, one line each: the trend the Planner reads. */
export function scorecardSection(cycle: LearningCycleRecordV2, opts: LearningCycleRepositoryOptions = {}, limit = 6): string {
  const header = "Her session scorecards (counted by code after each session, oldest first):";
  const cards = readScorecards(cycle, opts).slice(-limit);
  if (!cards.length) return `${header}\n- No scorecard yet.`;
  return [header, ...cards.map(card => `- ${card.startedAt.slice(0, 16).replace("T", " ")}: on her own ${card.answers.onHerOwnRight} of ${card.answers.onHerOwn} right${card.answers.retries ? `; ${card.answers.retries} retries after a first try` : ""}; with help ${card.answers.withHelp}; help asked ${card.helpRequests} times; bugs she reported ${card.bugsReported}; games: ${
    card.games.map(game => `${game.title} first answer after ${game.minutesToFirstAnswer === null ? "none" : `${game.minutesToFirstAnswer.toFixed(1)} min`}${game.finished ? "" : " (not finished)"}`).join(", ") || "none"}; the Planner's calls checked ${card.predictions.checked}, right ${card.predictions.inRange}${card.minutes ? `; minutes: ${minutesLine(card.minutes)}` : ""}`)].join("\n");
}
