import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";
import { getChildChart } from "../profiles/childChart";
import type { LearningCycleRepositoryOptions } from "./learningCycleRepository";
import { listChildProductIssues } from "./productIssues";
import type { SessionPacket } from "./sessionRating";

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
  return {
    childId: input.childId, domain: cycle?.domain ?? "unknown", sessionId: metadata.sessionId ?? path.basename(input.sessionDir), startedAt, endedAt,
    traces: lines("game-traces.ndjson"), events: lines("events.ndjson"), transcript, observations,
    evidence: [...(cycle?.evidence.academic ?? []), ...(cycle?.evidence.engagement ?? [])].map(row => ({ evidenceId: row.evidenceId, summary: row.summary })),
    productIssues: listChildProductIssues(input.childId, { rootDir: opts.rootDir, limit: 500 }).filter(row => { const t = Date.parse(row.createdAt); return t >= from && t <= to; }),
    handoffWritten: Boolean(handoffDir && fs.existsSync(handoffDir) && fs.readdirSync(handoffDir).some(name => name.startsWith(stamp.slice(0, 19)))),
    ...(input.serverLogFile && fs.existsSync(input.serverLogFile) ? { serverLog: fs.readFileSync(input.serverLogFile, "utf8").split("\n") } : {}),
  };
}
