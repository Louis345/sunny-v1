import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";
import { getLearningCycle, type LearningCycleRecordV2, type LearningCycleRepositoryOptions } from "./learningCycleRepository";
import { listChildProductIssues } from "./productIssues";
import { sessionGames, type SessionGame } from "./sessionTimeline";

/**
 * One scorecard per session, counted by code (owner, 2026-11-09: "how do we measure we are heading in the right
 * direction?"). Her answers on her own and with help, each game's time to first answer, how often she asked for
 * help, bugs she reported, and how the Planner's predictions landed. Read as a trend by the Planner; never judged here.
 */
export type SessionScorecard = {
  sessionId: string; startedAt: string; homeworkId: string;
  answers: { total: number; right: number; onHerOwn: number; onHerOwnRight: number; withHelp: number; helpNotRecorded: number };
  games: Array<Pick<SessionGame, "title" | "answers" | "right" | "finished"> & { minutesToFirstAnswer: number | null }>;
  helpRequests: number; bugsReported: number;
  predictions: { checked: number; inRange: number };
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
    const rows = (cycle.observations ?? []).filter(row => typeof row.result?.correct === "boolean" && Date.parse(row.observedAt) >= from
      && !SCHOOL.has(String(row.provenance)) && !SYNTHETIC.test(`${row.observationId} ${row.sourceId}`));
    // A board's completion repeats its answers with help unknown; those are counted apart, never as her own.
    const known = rows.filter(row => row.assistance.status !== "unknown");
    const own = rows.filter(row => row.assistance.status === "unassisted");
    const transcriptFile = path.join(input.sessionDir, "transcript.md");
    const childTurns = fs.existsSync(transcriptFile) ? fs.readFileSync(transcriptFile, "utf8").split(/\n### /).flatMap(block => block.includes("**user:**") ? [block.split("**user:**")[1].split("**assistant:**")[0]] : []) : [];
    const card: SessionScorecard = {
      sessionId: metadata.sessionId ?? path.basename(input.sessionDir), startedAt: metadata.startedAt, homeworkId: cycle.homeworkId,
      answers: { total: known.length, right: known.filter(row => row.result.correct).length, onHerOwn: own.length, onHerOwnRight: own.filter(row => row.result.correct).length,
        withHelp: rows.filter(row => row.assistance.status === "assisted").length, helpNotRecorded: rows.length - known.length },
      games: sessionGames(input.sessionDir).map(game => ({ title: game.title, answers: game.answers, right: game.right, finished: game.finished,
        minutesToFirstAnswer: game.firstAnswerMin === null ? null : round1(game.firstAnswerMin - game.openedMin) })),
      helpRequests: childTurns.filter(text => /\bhelp\b/i.test(text)).length,
      bugsReported: listChildProductIssues(input.childId, { rootDir: opts.rootDir, limit: 200 }).filter(row => Date.parse(row.createdAt) >= from).length,
      predictions: (() => {
        const checked = (cycle.predictionEvaluations ?? []).filter(row => row.sufficiency === "sufficient" && row.observedMetric !== null && Date.parse(row.evaluatedAt) >= from);
        return { checked: checked.length, inRange: checked.filter(row => row.observedMetric! >= row.predictedMetric.min && row.observedMetric! <= row.predictedMetric.max).length };
      })(),
    };
    const file = scorecardFile(cycle, opts);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(card)}\n`, "utf8");
    console.log(` 🎮 [scorecard] [written] child=${input.childId} homework=${cycle.homeworkId} answers=${card.answers.total} own=${card.answers.onHerOwnRight}/${card.answers.onHerOwn} help=${card.helpRequests}`);
    return card;
  } catch (error) {
    console.error(` 🎮 [scorecard] [failed] child=${input.childId} reason=${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/** The last few scorecards for this homework, oldest first, one line each: the trend the Planner reads. */
export function scorecardSection(cycle: LearningCycleRecordV2, opts: LearningCycleRepositoryOptions = {}, limit = 6): string {
  const header = "Her session scorecards (counted by code after each session, oldest first):";
  const file = scorecardFile(cycle, opts);
  const cards = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").flatMap(line => { try { return line.trim() ? [JSON.parse(line) as SessionScorecard] : []; } catch { return []; } }).slice(-limit) : [];
  if (!cards.length) return `${header}\n- No scorecard yet.`;
  return [header, ...cards.map(card => `- ${card.startedAt.slice(0, 16).replace("T", " ")}: on her own ${card.answers.onHerOwnRight} of ${card.answers.onHerOwn} right; with help ${card.answers.withHelp}; help asked ${card.helpRequests} times; bugs she reported ${card.bugsReported}; games: ${
    card.games.map(game => `${game.title} first answer after ${game.minutesToFirstAnswer === null ? "none" : `${game.minutesToFirstAnswer.toFixed(1)} min`}${game.finished ? "" : " (not finished)"}`).join(", ") || "none"}; predictions checked ${card.predictions.checked}, in range ${card.predictions.inRange}`)].join("\n");
}
