import fs from "node:fs";
import path from "node:path";
import type { LearningCycleRecordV2 } from "./learningCycleRepository";

/**
 * Where a session's minutes went, from its own saved records (owner, 2026-11-10: "how much time she spent studying,
 * minus the dopamine time... granular"). Learning games are stops on her homework board; play is Mystery, arcade and
 * any game outside her homework; call is the companion video call; waiting is loading or preparing screens; map is
 * the board between stops; other is the resting screen. A second with no record is unmeasured, never guessed.
 */
export type SessionMinutes = { learning: number; play: number; call: number; waiting: number; map: number; other: number; unmeasured: number; total: number };
type Kind = Exclude<keyof SessionMinutes, "total">;
type Row = { ts?: string; type?: string; nodeId?: string; phase?: string; eventName?: string; component?: string; action?: string; screen?: string };

const KINDS: Kind[] = ["learning", "play", "call", "waiting", "map", "other", "unmeasured"];
const MAX_SECONDS = 6 * 3600;
const read = (file: string): Row[] => fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").flatMap(line => { try { return line.trim() ? [JSON.parse(line) as Row] : []; } catch { return []; } }) : [];
const time = (row: Row) => Date.parse(row.ts ?? "");
const round1 = (value: number) => Math.round(value * 10) / 10;

export function sessionMinutes(sessionDir: string, cycle?: Pick<LearningCycleRecordV2, "nodes"> | null): SessionMinutes | undefined {
  const metadata = JSON.parse(fs.readFileSync(path.join(sessionDir, "metadata.json"), "utf8")) as { startedAt?: string };
  const start = Date.parse(metadata.startedAt ?? "");
  if (!Number.isFinite(start)) return undefined;
  const traces = read(path.join(sessionDir, "game-traces.ndjson")).filter(row => Number.isFinite(time(row))).sort((a, b) => time(a) - time(b));
  const events = read(path.join(sessionDir, "events.ndjson")).filter(row => Number.isFinite(time(row)));
  const summary = path.join(sessionDir, "summary.md");
  const endedAt = fs.existsSync(summary) ? Date.parse(fs.readFileSync(summary, "utf8").match(/^endedAt: (\S+)/m)?.[1] ?? "") : NaN;
  const end = Number.isFinite(endedAt) ? endedAt : Math.max(start, ...[...traces, ...events].map(time));
  const nodeKind = (nodeId: string | undefined): Kind => {
    const node = cycle?.nodes.find(candidate => candidate.nodeId === nodeId) as { role?: string; implementationType?: string } | undefined;
    return node && node.role !== "mystery" && node.implementationType !== "mystery" ? "learning" : "play";
  };
  // Intervals with the kind they claim, strongest first: the call, then a game's own run, then the kiosk's screen report.
  const intervals: Array<{ from: number; to: number; kind: Kind; rank: number }> = [];
  let callFrom: number | undefined, callLast = 0;
  const runs = new Map<string, { from: number; last: number }>();
  const closeRun = (nodeId: string, to: number) => { const run = runs.get(nodeId); if (run) intervals.push({ from: run.from, to, kind: nodeKind(nodeId), rank: 1 }); runs.delete(nodeId); };
  for (const row of traces) {
    const at = time(row);
    if (row.type === "companion_video_call_trace" || row.type === "video_chat_started") {
      if (callFrom === undefined && (row.type === "video_chat_started" || row.eventName === "call_started")) callFrom = at;
      callLast = at;
      if (row.eventName === "call_ended" && callFrom !== undefined) { intervals.push({ from: callFrom, to: at, kind: "call", rank: 0 }); callFrom = undefined; }
      continue;
    }
    if (!row.nodeId) continue;
    const run = runs.get(row.nodeId) ?? { from: at, last: at };
    run.last = at; runs.set(row.nodeId, run);
    if (row.phase === "closed" || row.type === "game_complete" || row.type === "node_complete") closeRun(row.nodeId, at);
  }
  for (const [nodeId, run] of [...runs]) closeRun(nodeId, run.last);
  if (callFrom !== undefined) intervals.push({ from: callFrom, to: callLast, kind: "call", rank: 0 });
  const screens = events.filter(row => row.component === "screen" && row.action === "report").sort((a, b) => time(a) - time(b));
  screens.forEach((row, index) => {
    const kind: Kind = row.screen === "board" ? "map" : row.screen === "activity" || row.screen === "evaluation" ? nodeKind(row.nodeId)
      : row.screen === "loading" || row.screen === "waiting" || row.screen === "unavailable" ? "waiting" : "other";
    intervals.push({ from: time(row), to: index + 1 < screens.length ? time(screens[index + 1]) : end, kind, rank: 2 });
  });
  const totals = Object.fromEntries(KINDS.map(kind => [kind, 0])) as Record<Kind, number>;
  const seconds = Math.min(MAX_SECONDS, Math.max(0, Math.round((end - start) / 1000)));
  for (let second = 0; second < seconds; second += 1) {
    const at = start + second * 1000 + 500;
    const claim = intervals.filter(row => row.from <= at && at < row.to).sort((a, b) => a.rank - b.rank)[0];
    totals[claim?.kind ?? "unmeasured"] += 1;
  }
  const minutes = Object.fromEntries(KINDS.map(kind => [kind, round1(totals[kind] / 60)])) as Record<Kind, number>;
  return { ...minutes, total: round1(seconds / 60) };
}

/** Sessions added up per local calendar day, oldest first. */
export function minutesByDay(sessions: Array<{ startedAt: string; minutes?: SessionMinutes }>): Array<{ day: string; sessions: number; minutes: SessionMinutes }> {
  const days = new Map<string, { sessions: number; minutes: SessionMinutes }>();
  for (const session of sessions) {
    if (!session.minutes) continue;
    const day = new Date(session.startedAt).toLocaleDateString("en-CA");
    const sum = days.get(day) ?? { sessions: 0, minutes: { learning: 0, play: 0, call: 0, waiting: 0, map: 0, other: 0, unmeasured: 0, total: 0 } };
    sum.sessions += 1;
    for (const key of Object.keys(sum.minutes) as Array<keyof SessionMinutes>) sum.minutes[key] = round1(sum.minutes[key] + (session.minutes[key] ?? 0));
    days.set(day, sum);
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, sum]) => ({ day, ...sum }));
}

export function minutesLine(minutes: SessionMinutes): string {
  return `learning games ${minutes.learning} min, play (Mystery/arcade) ${minutes.play} min, call ${minutes.call} min, waiting/loading ${minutes.waiting} min, map ${minutes.map} min, other ${minutes.other} min, unmeasured ${minutes.unmeasured} min, of ${minutes.total} min`;
}
