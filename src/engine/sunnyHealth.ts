import fs from "node:fs";
import path from "node:path";
import { getChildChart } from "../profiles/childChart";
import { resolveChildContextDir } from "../utils/contextRoot";
import { assertPublishedBoardsImmutable } from "./learningBoardInstances";
import { getLatestLearningCycle, type LearningCycleRepositoryOptions } from "./learningCycleRepository";
import { recordCanonicalNodeCompletion } from "./learningCycleRuntime";
import { schoolTestFacts } from "./schoolTestObjective";

/**
 * Sunny's own health (2026-11-10, Reina's test morning: 37 answers refused and lost, nobody told). Sunny checks that
 * each child's record can accept a save before she sits down; answers a save refuses are held, never lost, and
 * replayed once the record accepts them; the parent is told; her companion is told, as a fact. Facts only: what to
 * say to her stays the companion's judgment.
 */
type Problem = { kind: "seal" | "save_failed"; at: string; text: string };
type Held = Parameters<typeof recordCanonicalNodeCompletion>[0] & { error: string; heldAt: string };
type Opts = Pick<LearningCycleRepositoryOptions, "rootDir">;

const dirOf = (childId: string, opts: Opts) => path.join(resolveChildContextDir(childId, { rootDir: opts.rootDir }), "sunny_health");
const readJson = <T>(file: string, fallback: T): T => { try { return JSON.parse(fs.readFileSync(file, "utf8")) as T; } catch { return fallback; } };
const writeJson = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2)); fs.renameSync(`${file}.tmp`, file); };
const problemsFile = (childId: string, opts: Opts) => path.join(dirOf(childId, opts), "problems.json");
const heldFile = (childId: string, opts: Opts) => path.join(dirOf(childId, opts), "held-completions.json");

function setProblem(childId: string, kind: Problem["kind"], text: string | undefined, opts: Opts): void {
  const rest = readJson<Problem[]>(problemsFile(childId, opts), []).filter(row => row.kind !== kind);
  writeJson(problemsFile(childId, opts), text ? [...rest, { kind, at: new Date().toISOString(), text }] : rest);
}

/** Before she sits down: every published board of her current homework must still match its seal. */
export function runStartupCheck(childIds: string[], opts: Opts = {}): Array<{ childId: string; ok: boolean; boards: number; testDate?: string | null; problem?: string }> {
  return childIds.map(childId => {
    try {
      const chart = getChildChart(childId, { rootDir: opts.rootDir });
      const cycle = chart.learningCycle ?? getLatestLearningCycle(childId, { rootDir: opts.rootDir });
      if (!cycle) { console.log(` 🎮 [startup-check] [passed] child=${childId} boards=0 reason=no_current_homework`); return { childId, ok: true, boards: 0 }; }
      assertPublishedBoardsImmutable(cycle, cycle);
      setProblem(childId, "seal", undefined, opts);
      // The school test date she is practising toward, so a missing one shows on every start (owner, 2026-11-21).
      const testDate = schoolTestFacts(chart.homework, cycle.homeworkId)?.testDate ?? null;
      console.log(` 🎮 [startup-check] [passed] child=${childId} homework=${cycle.homeworkId} boards=${cycle.boards?.length ?? 0} test-date=${testDate ?? "unknown"}`);
      return { childId, ok: true, boards: cycle.boards?.length ?? 0, testDate };
    } catch (error) {
      const problem = error instanceof Error ? error.message : String(error);
      setProblem(childId, "seal", `her saved record no longer matches its seal (${problem})`, opts);
      console.error(` 🎮 [startup-check] [failed] child=${childId} problem=${problem}`);
      void raiseParentAlert({ childId, kind: "startup_check_failed", text: `Sunny cannot save ${childId}'s answers: ${problem}. Fix before she starts.` }, opts);
      return { childId, ok: false, boards: 0, problem };
    }
  });
}

/** A refused save: her answers are kept exactly as sent, to replay once the record accepts them. */
export function holdCompletion(input: Parameters<typeof recordCanonicalNodeCompletion>[0] & { error: string }, opts: Opts = {}): void {
  const held = readJson<Held[]>(heldFile(input.childId, opts), []);
  writeJson(heldFile(input.childId, opts), [...held, { ...input, heldAt: new Date().toISOString() }]);
  setProblem(input.childId, "save_failed", `saving failed: ${input.error}`, opts);
  console.error(` 🎮 [sunny-health] [completion-held] child=${input.childId} homework=${input.homeworkId} node=${input.nodeId} held=${held.length + 1}`);
}

/** Replays held answers in the order she gave them; each one the record still refuses stays held. */
export function replayHeldCompletions(childId: string, opts: Opts = {}): { replayed: number; stillHeld: number } {
  const held = readJson<Held[]>(heldFile(childId, opts), []);
  if (!held.length) return { replayed: 0, stillHeld: 0 };
  const left: Held[] = [];
  for (const row of held) {
    const { error: _error, heldAt: _heldAt, ...input } = row;
    try { recordCanonicalNodeCompletion(input, { rootDir: opts.rootDir }); }
    catch (error) { left.push({ ...row, error: error instanceof Error ? error.message : String(error) }); }
  }
  writeJson(heldFile(childId, opts), left);
  if (!left.length) setProblem(childId, "save_failed", undefined, opts);
  console.log(` 🎮 [sunny-health] [held-replay] [${left.length ? "still-held" : "saved"}] child=${childId} replayed=${held.length - left.length} stillHeld=${left.length}`);
  return { replayed: held.length - left.length, stillHeld: left.length };
}

/** Tells the parent: always recorded and logged; also sent to their phone when SUNNY_PARENT_ALERT_URL is set. */
export async function raiseParentAlert(input: { childId: string; kind: string; text: string }, opts: Opts = {}): Promise<void> {
  const row = { ...input, at: new Date().toISOString() };
  const file = path.join(dirOf(input.childId, opts), "parent-alerts.ndjson");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
  console.error(` 🎮 [parent-alert] [raised] child=${input.childId} kind=${input.kind} text=${JSON.stringify(input.text)}`);
  const url = process.env.SUNNY_PARENT_ALERT_URL?.trim();
  if (!url) return;
  try {
    const response = await fetch(url, { method: "POST", body: `Sunny (${input.childId}): ${input.text}` });
    console.log(` 🎮 [parent-alert] [sent] child=${input.childId} kind=${input.kind} ok=${response.ok}`);
  } catch (error) {
    console.error(` 🎮 [parent-alert] [send-failed] child=${input.childId} reason=${error instanceof Error ? error.message : String(error)}`);
  }
}

/** A failed save older than this is history, not "right now" (S47). */
const FRESH_PROBLEM_MS = 12 * 3_600_000;

/**
 * What her companion knows about Sunny itself, as facts. Empty when nothing is wrong now. Only problems from the last
 * 12 hours on her current homework count, and it never says the parent was told: no alert reaches a parent today
 * (BUGS.md S47, 2026-11-20: three refused saves from an old homework made Elli say saving was broken and the parent knew).
 */
export function sunnyHealthFacts(childId: string, opts: Opts & { now?: Date } = {}): string {
  const now = (opts.now ?? new Date()).getTime();
  const fresh = (at: string) => now - Date.parse(at) <= FRESH_PROBLEM_MS;
  const homeworkId = (() => {
    try { return (getChildChart(childId, { rootDir: opts.rootDir }).learningCycle ?? getLatestLearningCycle(childId, { rootDir: opts.rootDir }))?.homeworkId; }
    catch { return undefined; }
  })();
  const allHeld = readJson<Held[]>(heldFile(childId, opts), []);
  const held = allHeld.filter(row => fresh(row.heldAt) && (!homeworkId || row.homeworkId === homeworkId));
  const problems = readJson<Problem[]>(problemsFile(childId, opts), [])
    .filter(row => row.kind === "seal" || (held.length > 0 && fresh(row.at)));
  if (allHeld.length > held.length) console.log(` 🎮 [sunny-health] [facts] [stale-skipped] child=${childId} held=${allHeld.length - held.length}`);
  if (!problems.length && !held.length) return "";
  return ["[Sunny's own state]",
    `Sunny cannot save her answers right now (${problems.map(row => `${row.text}, since ${row.at.slice(0, 16).replace("T", " ")} UTC`).join("; ") || "saving failed"}).`,
    held.length ? `${held.length} finished game${held.length === 1 ? " is" : "s are"} held: kept safe, not yet saved, and replayed once saving works.` : "",
    "Whether this session's answers will count is not known yet."].filter(Boolean).join("\n");
}
