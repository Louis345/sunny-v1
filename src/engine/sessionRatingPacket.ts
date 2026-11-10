import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";
import { getChildChart } from "../profiles/childChart";
import type { LearningCycleRepositoryOptions } from "./learningCycleRepository";
import { listChildProductIssues } from "./productIssues";
import { measureRecordLines, type SessionPacket } from "./sessionRating";
import { gameTrackRecord } from "./gameTrackRecord";
import { observationNode } from "./observationNode";
import { sessionMinutes } from "./sessionTime";

/** When the 11/10 batch reached Saori: games built after it must report their step. */
const BATCH_AT = Date.parse("2026-11-10T20:00:00Z");

/** Reads one saved session and the records it touched into the facts the rating reads. Read-only. */
export function loadSessionPacket(input: { childId: string; sessionDir: string; serverLogFile?: string }, opts: LearningCycleRepositoryOptions = {}): SessionPacket {
  const read = (name: string) => { const file = path.join(input.sessionDir, name); return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""; };
  const lines = (name: string) => read(name).split("\n").flatMap(line => { try { return line.trim() ? [JSON.parse(line)] : []; } catch { return []; } });
  const metadata = JSON.parse(read("metadata.json") || "{}") as { sessionId?: string; startedAt?: string };
  const startedAt = metadata.startedAt ?? new Date(0).toISOString();
  const endedAt = read("summary.md").match(/^endedAt: (\S+)/m)?.[1];
  const transcript: SessionPacket["transcript"] = read("transcript.md").split(/\n(?=### )/).flatMap((block): SessionPacket["transcript"] => {
    const ts = block.match(/^### (\S+)/)?.[1];
    const user = block.split("**user:**")[1], assistant = block.split("**assistant:**")[1];
    if (!ts) return [];
    return user ? [{ ts, role: "child", text: user.split("**assistant:**")[0].trim() }] : assistant ? [{ ts, role: "companion", text: assistant.trim() }] : [];
  });
  const chart = getChildChart(input.childId, { rootDir: opts.rootDir });
  const cycle = chart.learningCycle;
  const from = Date.parse(startedAt), to = endedAt ? Date.parse(endedAt) + 10 * 60_000 : Infinity;
  const words = new Map(cycle?.nodes.flatMap(node => Object.values(node.evidenceContract.spellingItems ?? {}).map(item => [item.id, item.word] as const)) ?? []);
  const observations = (cycle?.observations ?? []).filter(row => { const t = Date.parse(row.observedAt); return t >= from && t <= to; })
    .map(row => ({ observedAt: row.observedAt, itemId: row.itemId, childResponse: typeof row.childResponse === "string" ? row.childResponse : undefined, word: words.get(row.itemId),
      result: { correct: row.result?.correct === true }, assistance: { status: row.assistance?.status ?? "unknown" }, provenance: String(row.provenance ?? "") }));
  const handoffDir = cycle ? path.join(resolveChildContextDir(input.childId, { rootDir: opts.rootDir }), "homework", "handoffs", cycle.homeworkId) : "";
  const stamp = startedAt.replace(/[:.]/g, "-");
  const traces = lines("game-traces.ndjson");
  const sessionId = metadata.sessionId ?? path.basename(input.sessionDir);
  const serverLog = input.serverLogFile && fs.existsSync(input.serverLogFile) ? fs.readFileSync(input.serverLogFile, "utf8").split("\n") : undefined;
  const covering = serverLog?.some(line => line.includes(sessionId)) ? serverLog : [];
  const childDir = resolveChildContextDir(input.childId, { rootDir: opts.rootDir });
  const readRows = (file: string) => fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").flatMap(line => { try { return line.trim() ? [JSON.parse(line)] : []; } catch { return []; } }) : [];
  const inWindow = (at: string | number) => { const t = typeof at === "number" ? at : Date.parse(at); return t >= from && t <= to; };
  const questions = cycle ? (() => {
    const dir = path.join(childDir, "homework", "cycles", ".planner", cycle.homeworkId);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { recursive: true }).map(String).filter(name => name.endsWith("tools.question.json")).map(name => path.join(dir, name))
      .filter(file => inWindow(fs.statSync(file).mtimeMs)).map(file => JSON.parse(fs.readFileSync(file, "utf8")) as { prompt: string; facts?: { writeProblems?: boolean } });
  })() : [];
  const decided = (cycle?.decisionHistory ?? []).filter(row => row.eventType === "theory_decided" && inWindow(row.createdAt));
  const track = cycle ? gameTrackRecord(cycle, { rootDir: opts.rootDir }) : [];
  const gamesDir = cycle ? path.join(childDir, "homework", "games", cycle.homeworkId) : "";
  const built = gamesDir && fs.existsSync(gamesDir) ? fs.readdirSync(gamesDir).filter(name => name.endsWith(".html")).map(name => path.join(gamesDir, name))
    .filter(file => fs.statSync(file).mtimeMs >= BATCH_AT && inWindow(fs.statSync(file).mtimeMs)) : [];
  const homework = chart.homework as { waterfall?: { current?: { homeworkId?: string; testDate?: string } }; activeByDomain?: Record<string, { homeworkId?: string; testDate?: string }>; pending?: { homeworkId?: string; testDate?: string } } | undefined;
  const extra = measureRecordLines({
    domain: cycle?.domain ?? "unknown",
    serverFailures: covering.filter(line => /\[(failed|error)\]|\bError:/.test(line)).length,
    alertsInSession: readRows(path.join(childDir, "sunny_health", "parent-alerts.ndjson")).filter(row => inWindow(String(row.at))).length,
    datedLogForDay: fs.existsSync(path.join(opts.rootDir ?? process.cwd(), "logs", "server", `${startedAt.slice(0, 10)}.log`)),
    testDates: [homework?.waterfall?.current, ...Object.values(homework?.activeByDomain ?? {}), homework?.pending].filter(row => row?.homeworkId === cycle?.homeworkId && row?.testDate).map(row => row!.testDate!),
    helpTurnsInGames: covering.filter(line => line.includes("[companion-help] [noted]")).length,
    helpedSaved: (cycle?.observations ?? []).filter(row => inWindow(row.observedAt) && row.assistance?.scaffolds?.includes("companion_help_on_item")).length,
    playedGames: track.map(row => ({ title: row.title, answers: row.answers, savedAnswers: cycle ? cycle.observations.filter(obs => observationNode(cycle, obs)?.nodeId === row.nodeId && typeof obs.result?.correct === "boolean").length : 0 })),
    decisions: questions.map(question => ({ hasOwnRetro: question.prompt.includes(sessionId), hasCalls: decided.some(row => row.expectations?.length), questionChars: question.prompt.length, tools: question.facts?.writeProblems ? ["add_problem"] : [] })),
    gamesWithNotes: track.filter(row => row.tutorNote).length, playedCount: track.length,
    diagnoses: ((chart.demographics as { diagnoses?: unknown[] } | undefined)?.diagnoses ?? []).length,
    builtSinceBatch: built.map(file => ({ hasStep: /reportStep\s*\(/.test(fs.readFileSync(file, "utf8")) })),
    gamesOpened: [...new Set(traces.flatMap(row => typeof row.nodeId === "string" ? [row.nodeId] : []))],
    paceLogged: covering.flatMap(line => line.match(/\[companion-context\] \[pace\] child=\S+ node=(\S+)/)?.[1] ?? []),
    newProblems: (cycle?.nodes ?? []).flatMap(node => Object.values(node.evidenceContract.itemContracts ?? {})).filter(item => item.lineage.sourceEvidenceIds.some(id => id.startsWith("planner-written:"))).length,
    trackRecordGames: track.length,
  });
  const minutes = sessionMinutes(input.sessionDir, cycle);
  return {
    extra, ...(minutes ? { minutes } : {}),
    childId: input.childId, domain: cycle?.domain ?? "unknown", sessionId: metadata.sessionId ?? path.basename(input.sessionDir), startedAt, endedAt,
    traces, events: lines("events.ndjson"), transcript, observations,
    evidence: [...(cycle?.evidence.academic ?? []), ...(cycle?.evidence.engagement ?? [])].map(row => ({ evidenceId: row.evidenceId, summary: row.summary })),
    productIssues: listChildProductIssues(input.childId, { rootDir: opts.rootDir, limit: 500 }).filter(row => { const t = Date.parse(row.createdAt); return t >= from && t <= to; }),
    handoffWritten: Boolean(handoffDir && fs.existsSync(handoffDir) && fs.readdirSync(handoffDir).some(name => name.startsWith(stamp.slice(0, 19)))),
    ...(serverLog ? { serverLog } : {}),
  };
}
