import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";
import type { LearningCycleRecordV2, LearningCycleRepositoryOptions } from "./learningCycleRepository";
import { observationNode } from "./observationNode";

/** The Planner's own note on a game she played: keep it, fix it, or retire it, and why (2026-11-10). */
export type GameNote = { nodeId: string; verdict: "keep" | "fix" | "retire"; why: string };

/**
 * Each game she played on this homework, with its track record (2026-11-10, both audits: the builder invented a new
 * world every time, never told which game she finished fast, which walled her, or what the Planner concluded).
 * Answers and right answers from the saved score; minutes to her first answer from the session scorecards; the
 * Planner's latest keep / fix / retire note. Facts for the Planner and the builder; code decides nothing here.
 */
export function gameTrackRecord(cycle: LearningCycleRecordV2, opts: Pick<LearningCycleRepositoryOptions, "rootDir"> = {}) {
  const file = path.join(resolveChildContextDir(cycle.childId, { rootDir: opts.rootDir }), "homework", "scorecards", `${cycle.homeworkId.replace(/[^a-zA-Z0-9_.-]+/g, "_")}.ndjson`);
  const minutes = new Map<string, number>();
  if (fs.existsSync(file)) for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    try { for (const game of (line.trim() ? JSON.parse(line).games ?? [] : []) as Array<{ title: string; minutesToFirstAnswer: number | null }>) if (typeof game.minutesToFirstAnswer === "number") minutes.set(game.title, game.minutesToFirstAnswer); }
    catch { /* A damaged line is skipped; the rest still count. */ }
  }
  const notes = new Map<string, GameNote>();
  for (const decision of cycle.decisionHistory ?? []) for (const note of decision.gameNotes ?? []) notes.set(note.nodeId, note);
  return cycle.nodes.filter(node => node.state === "completed").map(node => {
    const answers = cycle.observations.filter(row => observationNode(cycle, row)?.nodeId === node.nodeId && typeof row.result?.correct === "boolean");
    const note = notes.get(node.nodeId);
    return { nodeId: node.nodeId, title: node.title, game: String(node.implementationType ?? node.mechanic), answers: answers.length, right: answers.filter(row => row.result.correct).length,
      minutesToFirstAnswer: minutes.get(node.title) ?? null, ...(note ? { tutorNote: `${note.verdict}: ${note.why}` } : {}) };
  });
}
