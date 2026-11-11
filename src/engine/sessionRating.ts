/**
 * The pre-registered rating (owner, 2026-11-10: "I want to know if this is successful or not"). Each line is one
 * criterion from docs/audits/2026-11-10-success-criteria.md, fixed before any fix was built, and is read from the
 * session's own facts. A line that cannot be read fails: proving it is part of the goal. Facts in, verdict out; the
 * packet loader lives in sessionRatingPacket.ts.
 */
export type SessionPacket = {
  childId: string; domain: string; sessionId: string; startedAt: string; endedAt?: string;
  traces: Array<{ ts?: string; launchToken?: string; nodeId?: string; activityTitle?: string; type?: string; phase?: string; target?: unknown; correct?: unknown }>;
  events: Array<{ ts?: string; component?: string; action?: string; [key: string]: unknown }>;
  transcript: Array<{ ts: string; role: "child" | "companion"; text: string }>;
  observations: Array<{ observedAt: string; itemId: string; childResponse?: string; word?: string; result: { correct: boolean }; assistance: { status: string }; provenance?: string }>;
  evidence: Array<{ evidenceId: string; summary: string }>;
  productIssues: Array<{ createdAt: string; source?: string; issueType?: string; childUtterance?: string }>;
  handoffWritten: boolean;
  serverLog?: string[];
  /** Startup check lines from earlier days' dated server logs: the kiosk keeps running overnight (2026-11-10). */
  startupLog?: string[];
  /** Where the session's minutes went (owner, 2026-11-10): shown beside the verdict, never a criterion. */
  minutes?: SessionMinutes;
  /** Facts read outside the session, each named after its line (G9, G11...). Absent means not measurable yet. */
  extra?: Partial<Record<string, { value: string; pass: boolean }>>;
};

import { minutesLine, type SessionMinutes } from "./sessionTime";

export type RatingLine = { id: string; what: string; target: string; value: string; pass: boolean };

const minutes = (from: string, to: string | undefined) => to ? (Date.parse(to) - Date.parse(from)) / 60_000 : NaN;
const round1 = (value: number) => Math.round(value * 10) / 10;
const FAILURE = /\[(failed|error)\]|\bError:/;
const REASSURANCE = /\b(will|'ll|going to) (count|be saved|save)\b|\b(it|that)('s| is| was) saved\b/i;
const BUG_WORDS = /\bbug\b|\bglitch\b|could not be saved|not working|broken/i;
const STRETCH_MIN = 3;
const STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s/;

/**
 * The startup check of the kiosk run this session belongs to (2026-11-10): it runs once per kiosk start and never names
 * a session, so it is the latest `[startup-check]` for this child (or for every child) before the session started.
 * Dated log lines are compared by time; an undated log counts only lines above its first mention of the session.
 */
function startupCheckFor(packet: SessionPacket): string | undefined {
  const log = [...(packet.startupLog ?? []), ...(packet.serverLog ?? [])];
  const named = log.findIndex(line => line.includes(packet.sessionId));
  const mine = (line: string) => line.includes("[startup-check]") && (!/\bchild=/.test(line) || new RegExp(`\\bchild=${packet.childId}\\b`).test(line));
  return log.filter((line, index) => {
    if (!mine(line)) return false;
    const stamp = STAMP.exec(line)?.[1];
    return stamp ? Date.parse(stamp) <= Date.parse(packet.startedAt) : named >= 0 && index < named;
  }).at(-1);
}

/** The 27 lines, in the criteria's order. Lines with no measurement yet read from `extra` or fail. */
const LINES: Array<{ id: string; what: string; target: string }> = [
  { id: "N1", what: "Answers given but not saved", target: "given = saved" },
  { id: "N2", what: "Child reports a bug that was already in the log", target: "0" },
  { id: "N3", what: "Companion promises what Sunny can't back up", target: "0" },
  { id: "N4", what: "Start check ran before her name appeared", target: "ran" },
  { id: "G1", what: "Failure line to parent told", target: "under 1 min" },
  { id: "G2", what: "Bug tickets per sentence", target: "1" },
  { id: "G3", what: "Server logs kept across restarts", target: "7 days" },
  { id: "G4", what: "Files that disagree on the test date", target: "0" },
  { id: "G5", what: "Answers shown right in the retro vs saved score", target: "equal" },
  { id: "G6", what: "Helped math answers marked on her own", target: "0" },
  { id: "G7", what: "Built games recording 0 ms", target: "0" },
  { id: "G8", what: "Letter-tap fragments saved as misspellings", target: "0" },
  { id: "G9", what: "Built games shown with 0 answers to the Planner", target: "true counts" },
  { id: "G10", what: "Lesson retros for sessions with no answers", target: "0" },
  { id: "G11", what: "Board decisions with their own session's retro", target: "all" },
  { id: "G12", what: "Planner predictions scored by code", target: "every board (week)" },
  { id: "G13", what: "Played games with a keep/fix/retire note", target: "all (week)" },
  { id: "G14", what: "Planner question size", target: "under 120,000 chars" },
  { id: "G15", what: "Wrong profile facts given to the AIs", target: "0" },
  { id: "G16", what: "New built games that report their step", target: "all" },
  { id: "G17", what: "Longest wait to first answer in a game", target: "under 3 min" },
  { id: "G18", what: "Quiet stretches over 3 min with a companion offer", target: "all" },
  { id: "G19", what: "Games where the companion gets per-turn facts", target: "all" },
  { id: "G20", what: "New problems written for her", target: "1+ per board" },
  { id: "G21", what: "Quest/Boss available after the worksheet", target: "on the menu" },
  { id: "G22", what: "Builder sees each played game's record", target: "yes" },
  { id: "G23", what: "A loved game returns with new content", target: "once (week)" },
];

export function rateSession(packet: SessionPacket): { lines: RatingLine[]; verdict: "PASS" | "FAIL"; text: string } {
  const given = packet.traces.filter(row => row.type === "attempt_event");
  const saved = packet.observations.filter(row => row.provenance !== "graded_work" && row.provenance !== "delayed_reassessment");
  // The server log has no times; it speaks for this session only when it names it (a restart starts a new log).
  const covering = (packet.serverLog ?? []).some(line => line.includes(packet.sessionId)) ? packet.serverLog ?? [] : [];
  const serverFailures = covering.filter(line => FAILURE.test(line));
  // Counts can only be judged honest on answers that were saved.
  const allSaved = saved.length >= given.length;
  const tokens = new Set([packet.sessionId, ...packet.traces.flatMap(row => row.launchToken ? [row.launchToken] : [])]);
  const eventFailures = packet.events.filter(row => /fail|error/i.test(String(row.action ?? "")));
  const failed = serverFailures.length + eventFailures.length > 0;
  const childBugReports = packet.transcript.filter(row => row.role === "child" && BUG_WORDS.test(row.text));
  const promises = packet.transcript.filter(row => row.role === "companion" && REASSURANCE.test(row.text));
  const games = new Map<string, typeof packet.traces>();
  for (const row of packet.traces.filter(row => row.nodeId && row.ts)) games.set(row.nodeId!, [...(games.get(row.nodeId!) ?? []), row]);
  const waits = [...games.values()].flatMap(rows => {
    const opened = rows.find(row => row.phase === "opening") ?? rows[0];
    const first = rows.find(row => row.type === "attempt_event");
    return first ? [{ title: rows.find(row => row.activityTitle)?.activityTitle ?? opened.nodeId ?? "a game", min: round1(minutes(opened.ts!, first.ts)) }] : [];
  }).sort((a, b) => b.min - a.min);
  const zeroMs = packet.evidence.filter(row => tokens.has(row.evidenceId.split(":")[0]) && /completed in 0ms/.test(row.summary));
  // A fragment is a wrong answer shorter than its word whose letters before the last match the word: one tap, not a try.
  const fragments = saved.filter(row => row.word && row.childResponse && !row.result.correct && row.childResponse.length < row.word.length
    && row.word.startsWith(row.childResponse.slice(0, -1)));
  const gameRight = given.filter(row => row.correct === true).length, savedRight = saved.filter(row => row.result.correct).length;
  // Quiet stretches: over three minutes inside a session with no answer and no child turn; an offer is a companion check-in event.
  const moments = [packet.startedAt, ...given.map(row => row.ts!), ...packet.transcript.filter(row => row.role === "child").map(row => row.ts), packet.endedAt ?? packet.startedAt].filter(Boolean).sort();
  const stretches = moments.slice(1).flatMap((to, index) => minutes(moments[index], to) > STRETCH_MIN ? [{ from: moments[index], to }] : []);
  const offers = [...packet.events.filter(row => row.component === "companion-checkin" && /offer|raised|asked/.test(String(row.action))),
    ...packet.traces.filter(row => row.type === "companion_checkin" && (row as { action?: string }).action === "offered")];
  const offered = stretches.filter(stretch => offers.some(row => row.ts! >= stretch.from && row.ts! <= stretch.to));

  const measured: Record<string, { value: string; pass: boolean }> = {
    N1: { value: `${given.length} given, ${saved.length} saved`, pass: saved.length >= given.length },
    N2: { value: childBugReports.length && failed ? `${childBugReports.length} child report(s) after ${serverFailures.length + eventFailures.length} logged failure(s)` : `${childBugReports.length} child report(s)`, pass: !(childBugReports.length && failed) },
    N3: { value: failed && promises.length ? `${promises.length} promise(s) after a failure: "${promises[0].text.slice(0, 60)}"` : "none", pass: !(failed && promises.length) },
    N4: (() => {
      const check = startupCheckFor(packet);
      if (check) return { value: check.trim().slice(0, 100), pass: check.includes("[startup-check] [passed]") };
      return { value: packet.serverLog || packet.startupLog ? `no startup check for ${packet.childId} before the session` : "no server log to read", pass: false };
    })(),
    G2: { value: `${packet.productIssues.length} tickets for ${childBugReports.length || (packet.productIssues.length ? 1 : 0)} sentence${childBugReports.length === 1 || !childBugReports.length ? "" : "s"}`, pass: packet.productIssues.length <= Math.max(childBugReports.length, 0) || packet.productIssues.length === 0 },
    G5: !allSaved ? { value: "not measurable: answers were not saved", pass: false } : packet.domain === "math" || gameRight !== savedRight ? { value: `retro ${gameRight} right, saved ${savedRight} right`, pass: gameRight === savedRight } : { value: `retro ${gameRight}, saved ${savedRight}`, pass: true },
    G7: !allSaved && !zeroMs.length ? { value: "not measurable: answers were not saved", pass: false } : { value: `${zeroMs.length} game${zeroMs.length === 1 ? "" : "s"} recorded 0 ms`, pass: zeroMs.length === 0 },
    G8: !allSaved ? { value: "not measurable: answers were not saved", pass: false } : { value: `${fragments.length} fragment${fragments.length === 1 ? "" : "s"}`, pass: fragments.length === 0 },
    G10: { value: given.length === 0 && packet.handoffWritten ? "a lesson retro for a session with no answers" : "none", pass: !(given.length === 0 && packet.handoffWritten) },
    // No game opened: nothing to wait for (a reopened screen, a FaceTime-only call). Opened but never answered fails.
    G17: waits.length ? { value: `${waits[0].min} min (${waits[0].title})`, pass: waits[0].min < 3 }
      : games.size ? { value: `${games.size} game${games.size === 1 ? "" : "s"} opened, none answered (${[...games.values()].map(rows => rows.find(row => row.activityTitle)?.activityTitle ?? rows[0].nodeId).join(", ")})`, pass: false }
      : { value: "no game this session", pass: true },
    G18: { value: `${offered.length} of ${stretches.length} quiet stretches had an offer`, pass: offered.length === stretches.length },
  };
  const lines = LINES.map(line => ({ ...line, ...(measured[line.id] ?? packet.extra?.[line.id] ?? { value: "not measurable yet", pass: false }) }));
  // A line with nothing to judge this session ("no decision this session") is N/A: it neither passes nor fails.
  const notApplicable = (line: RatingLine) => /^no .+ this session$/.test(line.value);
  const must = lines.filter(line => line.id.startsWith("N")), graded = lines.filter(line => line.id.startsWith("G") && !notApplicable(line));
  const verdict = must.every(line => line.pass) && graded.filter(line => line.pass).length >= Math.ceil(graded.length * 0.8) ? "PASS" : "FAIL";
  const text = [`Rating for ${packet.childId}, session ${packet.sessionId} (${packet.startedAt.slice(0, 16).replace("T", " ")}): ${verdict}`,
    ...(packet.minutes ? [`Time: ${minutesLine(packet.minutes)}.`] : ["Time: not measured for this session."]),
    `Must-never: ${must.filter(line => line.pass).length} of ${must.length} pass. Graded: ${graded.filter(line => line.pass).length} of ${graded.length} pass (80% needed; ${lines.length - must.length - graded.length} not applicable this session).`,
    "", "| # | What | Target | This session | Result |", "|---|---|---|---|---|",
    ...lines.map(line => `| ${line.id} | ${line.what} | ${line.target} | ${line.value.replace(/\|/g, "/")} | ${notApplicable(line) ? "N/A" : line.pass ? "PASS" : "FAIL"} |`)].join("\n");
  return { lines, verdict, text };
}

/** Facts read from Sunny's records for the lines the 11/10 batch fixed (the loader gathers them). */
export type RecordFacts = {
  domain: string; serverFailures: number; alertsInSession: number; datedLogForDay: boolean; testDates: string[];
  helpTurnsInGames: number; helpedSaved: number; playedGames: Array<{ title: string; answers: number; savedAnswers: number }>;
  decisions: Array<{ hasOwnRetro: boolean; hasCalls: boolean; questionChars: number; tools: string[] }>;
  gamesWithNotes: number; playedCount: number; diagnoses: number; builtSinceBatch: Array<{ hasStep: boolean }>;
  gamesOpened: string[]; paceLogged: string[]; newProblems: number; trackRecordGames: number;
};

/** Each line as PASS or FAIL from the facts; a line with nothing to judge this session passes and says so. */
export function measureRecordLines(f: RecordFacts): Record<string, { value: string; pass: boolean }> {
  const none = (what: string) => ({ value: `no ${what} this session`, pass: true });
  const blind = f.playedGames.filter(game => game.savedAnswers > 0 && game.answers === 0);
  const paced = f.gamesOpened.filter(node => f.paceLogged.includes(node));
  const built = f.builtSinceBatch, stepped = built.filter(game => game.hasStep).length;
  return {
    G1: f.serverFailures ? { value: `${f.serverFailures} failure(s), ${f.alertsInSession} parent alert(s)`, pass: f.alertsInSession > 0 } : none("failure"),
    G3: { value: f.datedLogForDay ? "dated server log kept for this day" : "no dated server log for this day", pass: f.datedLogForDay },
    G4: { value: `${new Set(f.testDates).size} test date(s) recorded: ${[...new Set(f.testDates)].join(", ") || "none"}`, pass: new Set(f.testDates).size <= 1 },
    G6: f.domain === "spelling" ? none("math answer") : { value: `help asked ${f.helpTurnsInGames} time(s) in games; ${f.helpedSaved} answer(s) saved as helped`, pass: !(f.helpTurnsInGames > 0 && f.helpedSaved === 0) },
    G9: { value: blind.length ? `shown with 0 answers: ${blind.map(game => game.title).join(", ")}` : `${f.playedGames.length} played game(s) with true counts`, pass: !blind.length },
    G11: f.decisions.length ? { value: `${f.decisions.filter(row => row.hasOwnRetro).length} of ${f.decisions.length} decision(s) had this session's retro`, pass: f.decisions.every(row => row.hasOwnRetro) } : none("decision"),
    G12: f.decisions.length ? { value: `${f.decisions.filter(row => row.hasCalls).length} of ${f.decisions.length} decision(s) made calls code can check`, pass: f.decisions.some(row => row.hasCalls) } : none("decision"),
    G13: { value: `${f.gamesWithNotes} of ${f.playedCount} played game(s) have a keep/fix/retire note (week)`, pass: f.playedCount === 0 || f.gamesWithNotes > 0 },
    G14: f.decisions.length ? { value: `largest question ${Math.max(...f.decisions.map(row => row.questionChars)).toLocaleString("en-US")} characters`, pass: f.decisions.every(row => row.questionChars < 120_000) } : none("decision"),
    G15: { value: `${f.diagnoses} diagnosis fact(s) given to the AIs`, pass: f.diagnoses > 0 },
    G16: built.length ? { value: `${stepped} of ${built.length} game(s) built since the batch report their step`, pass: stepped === built.length } : none("new built game"),
    G19: f.gamesOpened.length ? { value: `pace facts in ${paced.length} of ${f.gamesOpened.length} games`, pass: paced.length === f.gamesOpened.length } : none("game"),
    G20: f.domain === "spelling" ? none("math board") : f.decisions.length ? { value: `${f.newProblems} new problem(s) written`, pass: f.newProblems > 0 } : none("decision"),
    G21: f.domain === "spelling" ? none("math board") : f.decisions.length ? { value: f.decisions.some(row => row.tools.includes("add_problem")) ? "add_problem offered; Quest/Boss stay on the menu" : "no way to write new problems", pass: f.decisions.some(row => row.tools.includes("add_problem")) } : none("decision"),
    G22: { value: `the builder sees ${f.trackRecordGames} played game(s) with their track record`, pass: f.trackRecordGames > 0 || f.playedCount === 0 },
  };
}
