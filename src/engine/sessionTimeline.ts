import fs from "node:fs";
import path from "node:path";
import type { LearningObservation } from "./learningCycleRepository";
import { observationNode } from "./observationNode";

/**
 * The session's own timeline (owner, 2026-11-09: the system runs a retro on itself). Built by code from the saved
 * session packet: per game, when it opened, its reported steps and progress, her first answer, her answers, and
 * when it finished; and everything she said, with times. Facts only; what went well or wrong is the reader's call.
 */
type Trace = { ts?: string; type?: string; nodeId?: string; activityTitle?: string; game?: string; phase?: string; progress?: string;
  gameStep?: string; currentChallenge?: string; correct?: unknown; attemptedValue?: unknown };

const minutes = (from: number, ts: string | undefined) => ts ? Math.max(0, (Date.parse(ts) - from) / 60_000) : NaN;
const fmt = (value: number) => `${value.toFixed(1)} min`;
const clip = (text: string, max = 180) => { const flat = text.replace(/\s+/g, " ").trim(); return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat; };

function readLines(file: string): Trace[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").flatMap(line => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line) as Trace]; } catch { return []; }
  });
}

export type SessionGame = { nodeId: string; title: string; openedMin: number; firstAnswerMin: number | null; answers: number; right: number; finished: boolean };

/**
 * The learning measure (owner, 2026-11-10): an answer right on her first try with no help recorded. Every try is saved
 * (retries are practice) and helped answers are saved; the retro, the scorecard and the rating count this one thing.
 */
export const RIGHT_ON_HER_OWN = "Right on her first try on her own (the learning measure)";
/** A later try on an item: built games tag it "retry", spelling tags it "repeated_attempt" (one rule, 2026-11-13 audit). */
export const isRetry = (row: { confounds?: string[] }) => (row.confounds ?? []).some(tag => tag === "retry" || tag === "repeated_attempt");
export const isFirstTryOnHerOwn = (row: { assistance?: { status?: string }; confounds?: string[] }) =>
  row.assistance?.status === "unassisted" && !isRetry(row);

/** Her saved answers, for counting right answers the way Sunny scored them (math games never log right or wrong). */
type SavedAnswers = { nodes: Array<{ nodeId: string }>; observations: Array<Pick<LearningObservation, "sourceId" | "observedAt" | "result">> };

/** Each game in the session, counted from its traces; right answers from the saved score when there is one. */
export function sessionGames(sessionDir: string, saved?: SavedAnswers): SessionGame[] {
  const metadata = JSON.parse(fs.readFileSync(path.join(sessionDir, "metadata.json"), "utf8")) as { startedAt?: string };
  const start = Date.parse(metadata.startedAt ?? "");
  if (!Number.isFinite(start)) return [];
  const games = new Map<string, Trace[]>();
  for (const row of readLines(path.join(sessionDir, "game-traces.ndjson")).filter(row => row.ts && row.nodeId)) games.set(row.nodeId!, [...(games.get(row.nodeId!) ?? []), row]);
  return [...games.values()].map(rows => {
    const opened = rows.find(row => row.phase === "opening") ?? rows[0];
    const answers = rows.filter(row => row.type === "attempt_event");
    const nodeId = rows[0].nodeId!;
    const scored = (saved?.observations ?? []).filter(row => Date.parse(row.observedAt) >= start && observationNode(saved!, row)?.nodeId === nodeId && typeof row.result?.correct === "boolean");
    return { nodeId, title: rows.find(row => row.activityTitle)?.activityTitle ?? rows[0].game ?? "a game", openedMin: minutes(start, opened.ts),
      firstAnswerMin: answers[0] ? minutes(start, answers[0].ts) : null, answers: answers.length,
      right: scored.length ? scored.filter(row => row.result.correct === true).length : answers.filter(row => row.correct === true).length,
      finished: rows.some(row => row.type === "game_complete") };
  });
}

export function buildSessionTimeline(sessionDir: string, saved?: SavedAnswers): string {
  const metadata = JSON.parse(fs.readFileSync(path.join(sessionDir, "metadata.json"), "utf8")) as { startedAt?: string };
  const start = Date.parse(metadata.startedAt ?? "");
  if (!Number.isFinite(start)) return "Session timeline: no start time recorded.";
  const traces = readLines(path.join(sessionDir, "game-traces.ndjson")).filter(row => row.ts && row.nodeId);
  const games = new Map<string, Trace[]>();
  for (const row of traces) games.set(row.nodeId!, [...(games.get(row.nodeId!) ?? []), row]);
  const counted = sessionGames(sessionDir, saved);
  const lines = ["Session timeline (built by code from the session's game traces and conversation; minutes from the session start):"];
  for (const rows of games.values()) {
    const title = rows.find(row => row.activityTitle)?.activityTitle ?? rows[0].game ?? "a game";
    const opened = rows.find(row => row.phase === "opening") ?? rows[0];
    const answers = rows.filter(row => row.type === "attempt_event");
    const finished = rows.find(row => row.type === "game_complete");
    const openedAt = minutes(start, opened.ts);
    const first = answers[0] ? minutes(start, answers[0].ts) : NaN;
    const right = counted.find(game => game.nodeId === rows[0].nodeId)?.right ?? 0;
    lines.push(`Game "${title}": opened at ${fmt(openedAt)}; ${answers.length ? `first answer at ${fmt(first)} (${fmt(first - openedAt)} after it opened); ${answers.length} answers, ${right} right` : "no answer recorded"}; ${finished ? `finished at ${fmt(minutes(start, finished.ts))}.` : "not finished."}`);
    let lastProgress = "", lastStep = "", shown = 0;
    const detail = (text: string) => { shown += 1; if (shown <= 14) lines.push(text); };
    for (const row of rows) {
      if (row.progress && row.progress !== lastProgress && row.type === "game_state_update") { lastProgress = row.progress; detail(`  ${fmt(minutes(start, row.ts))}: ${clip(row.progress, 80)}`); }
      if (row.gameStep && row.gameStep !== lastStep) { lastStep = row.gameStep; detail(`  ${fmt(minutes(start, row.ts))}: step "${row.gameStep}": ${clip(row.currentChallenge ?? "", 100)}`); }
      if (row.phase === "closed") detail(`  ${fmt(minutes(start, row.ts))}: left the game`);
    }
    if (shown > 14) lines.push(`  (${shown - 14} more moments in this game)`);
  }
  const transcriptFile = path.join(sessionDir, "transcript.md");
  if (fs.existsSync(transcriptFile)) {
    let last = "";
    for (const block of fs.readFileSync(transcriptFile, "utf8").split(/\n### /)) {
      const ts = block.replace(/^### /, "").slice(0, 24);
      const said = block.split("**user:**")[1];
      if (!said) continue;
      const text = clip(said.split("**assistant:**")[0]);
      if (text.slice(0, 60) === last.slice(0, 60)) continue;
      last = text;
      lines.push(`${fmt(minutes(start, ts))}, she said: "${text}"`);
    }
  }
  return lines.join("\n");
}
