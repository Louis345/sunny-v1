/**
 * The open problem's attempt facts for her companion (2026-11-10: Ila typed 34 three times while Elli did not know she
 * had tried). When the problem appeared, each answer in order and whether code scores it right, and her pace across
 * this homework from her chart. Facts only: whether to wait, hint or help is her companion's judgment.
 * In memory per child and game: a restart loses only the live view; every answer is saved separately.
 */
import type { LearningCycleRecordV2 } from "../engine/learningCycleRepository";
import { scoreMathResponse, scoreSpellingRecall } from "../engine/learningCycleRuntime";

type Answer = { value: string; at: number; correct?: boolean };
type ItemState = { openedAt: number; answers: Answer[]; hintBeforeTry?: number };
const items = new Map<string, Map<string, ItemState>>();
const MAX_GAMES = 50, MAX_ANSWERS = 20;
const gameKey = (childId: string, nodeId: string) => `${childId}\u0000${nodeId}`;

function stateFor(childId: string, nodeId: string, itemId: string, at: number): ItemState {
  const key = gameKey(childId, nodeId);
  if (!items.has(key) && items.size >= MAX_GAMES) items.delete(items.keys().next().value!);
  const game = items.get(key) ?? new Map<string, ItemState>();
  items.set(key, game);
  const state = game.get(itemId) ?? { openedAt: at, answers: [] };
  game.set(itemId, state);
  return state;
}

export function noteItemOpened(childId: string, nodeId: string, itemId: string, at = Date.now()): void {
  if (!items.get(gameKey(childId, nodeId))?.has(itemId)) console.log(` 🎮 [item-attempts] [opened] child=${childId} node=${nodeId} item=${itemId}`);
  stateFor(childId, nodeId, itemId, at);
}

/** Code scores the answer from the item's frozen contract; the game's own claim is never used. */
export function noteItemAnswer(childId: string, nodeId: string, itemId: string, value: string, readCycle: LearningCycleRecordV2 | null | undefined | (() => LearningCycleRecordV2 | null | undefined), at = Date.now()): void {
  const state = stateFor(childId, nodeId, itemId, at);
  let cycle: LearningCycleRecordV2 | null | undefined;
  try { cycle = typeof readCycle === "function" ? readCycle() : readCycle; }
  catch (error) { console.warn(` 🎮 [item-attempts] [chart-unavailable] child=${childId} reason=${error instanceof Error ? error.message : String(error)}`); }
  const node = cycle?.nodes.find(candidate => candidate.nodeId === nodeId);
  const math = node?.evidenceContract.itemContracts?.[itemId], word = node?.evidenceContract.spellingItems?.[itemId];
  const correct = math ? scoreMathResponse(math as never, value).correct : word ? scoreSpellingRecall(word, value).correct : undefined;
  if (state.answers.length < MAX_ANSWERS) state.answers.push({ value: value.slice(0, 60), at, ...(typeof correct === "boolean" ? { correct } : {}) });
  console.log(` 🎮 [item-attempts] [answer] child=${childId} node=${nodeId} item=${itemId} try=${state.answers.length} result=${correct === undefined ? "not-scored" : correct ? "right" : "not-right"}`);
}


/** The game showed her a hint on this problem: every later try on it is helped (BUGS.md 2026-11-08, owner 2026-11-13). */
export function noteItemHint(childId: string, nodeId: string, itemId: string, at = Date.now()): void {
  const state = stateFor(childId, nodeId, itemId, at);
  if (state.hintBeforeTry === undefined) state.hintBeforeTry = state.answers.length;
  console.log(` 🎮 [item-attempts] [hint] child=${childId} node=${nodeId} item=${itemId} before_try=${state.answers.length + 1}`);
}

// A finished game's tries wait here for its completion to save them; the companion's live view starts clean.
const finished = new Map<string, Map<string, ItemState>>();

/** The game ended: its tries are held for saving, not dropped (clearing raced the completion, BUGS.md 2026-11-13). */
export function finishItemAttempts(childId: string, nodeId: string): void {
  const key = gameKey(childId, nodeId), game = items.get(key);
  items.delete(key);
  if (!game) return;
  if (finished.size >= MAX_GAMES) finished.delete(finished.keys().next().value!);
  finished.set(key, game);
}

/** Every try code saw on this game, per problem in order, taken once at completion (BUGS.md 2026-11-13). */
export type ServerTry = { attemptedValue: string; hinted?: true };
export function takeServerTries(childId: string, nodeId: string): Map<string, ServerTry[]> {
  const key = gameKey(childId, nodeId);
  const game = items.get(key) ?? finished.get(key);
  items.delete(key);
  finished.delete(key);
  return new Map([...(game ?? new Map<string, ItemState>()).entries()].filter(([, state]) => state.answers.length).map(([itemId, state]) =>
    [itemId, state.answers.map((answer, index) => ({ attemptedValue: answer.value, ...(state.hintBeforeTry !== undefined && index >= state.hintBeforeTry ? { hinted: true as const } : {}) }))]));
}

type TriedRow = { target: string; tries?: Array<{ attemptedValue?: string; hinted?: boolean }> } & Record<string, unknown>;
/**
 * A built game's summary can list fewer tries than she made (Reina 2026-11-13: 6, 6, 8 saved as one right first try)
 * and never knows which came after a hint. Code's own record wins when it saw more tries, or as many with a hint shown;
 * the game's wins only when it saw more than code did.
 */
export function withServerTries<T extends TriedRow>(rows: T[], serverTries: ReadonlyMap<string, ServerTry[]>): T[] {
  return rows.map(row => {
    const seen = serverTries.get(row.target);
    const reported = Array.isArray(row.tries) ? row.tries.length : 1;
    if (!seen || seen.length < reported || (seen.length === reported && !seen.some(entry => entry.hinted))) return row;
    console.log(` 🎮 [item-attempts] [tries-restored] item=${row.target} game_reported=${reported} code_saw=${seen.length} hinted=${seen.filter(entry => entry.hinted).length}`);
    return { ...row, tries: seen.map(entry => ({ ...entry })) };
  });
}

const span = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 120 ? `${s} second${s === 1 ? "" : "s"}` : `${Math.round(s / 60)} minutes`; };

export function itemAttemptFacts(childId: string, nodeId: string | undefined, itemId: string | undefined, now = Date.now()): string {
  const state = nodeId && itemId ? items.get(gameKey(childId, nodeId))?.get(itemId) : undefined;
  if (!state) return "";
  const open = `This problem: on her screen ${span(now - state.openedAt)}`;
  if (!state.answers.length) return `${open}; she has not answered it yet.`;
  const list = state.answers.map(answer => `${answer.value} (${answer.correct === undefined ? "not scored" : answer.correct ? "right" : "not right"})`).join(", ");
  const last = state.answers.at(-1)!, before = state.answers.at(-2);
  return `${open}; her answers so far: ${list}; her last answer ${span(now - last.at)} ago${before ? `, ${span(last.at - before.at)} after the one before` : ""}.`;
}

/** Her pace facts from her chart: recorded traits and how she has answered on this homework, counted by code. */
export function childPaceFacts(demographics: { diagnoses?: string[]; attentionSpan?: string } | undefined, cycle: Pick<LearningCycleRecordV2, "observations"> | null | undefined): string {
  const lines: string[] = [];
  if (demographics) lines.push(`Her chart: diagnoses ${demographics.diagnoses?.length ? demographics.diagnoses.join(", ") : "none recorded"}; attention span ${demographics.attentionSpan ?? "not recorded"}.`);
  const rows = (cycle?.observations ?? []).filter(row => row.confounds.includes("first_try") || row.confounds.includes("retry"));
  if (rows.length) {
    const first = rows.filter(row => row.confounds.includes("first_try"));
    const retried = new Set(rows.filter(row => row.confounds.includes("retry")).map(row => row.itemId));
    const repeatedWrong = new Set(rows.flatMap((row, index) => {
      const previous = rows.slice(0, index).reverse().find(candidate => candidate.itemId === row.itemId);
      return previous && previous.result.correct === false && row.result.correct === false && previous.childResponse === row.childResponse ? [row.itemId] : [];
    }));
    lines.push(`On this homework so far: first tries ${first.length}, right ${first.filter(row => row.result.correct === true).length}; she tried again after her first try on ${retried.size} problem${retried.size === 1 ? "" : "s"}; the same wrong answer twice in a row on ${repeatedWrong.size} problem${repeatedWrong.size === 1 ? "" : "s"}.`);
  }
  return lines.length ? ["[Her pace, from her chart]", ...lines].join("\n") : "";
}
