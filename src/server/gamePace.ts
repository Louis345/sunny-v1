/**
 * Plain pace facts for every game (2026-11-10: the companion learned how long Ila was stuck only when she spoke,
 * and the frustration check ran in five named games). When the game opened, her answers, her last answer, help
 * asked. Facts only: whether a pause is thinking or checking out is her companion's judgment, per child.
 */
type Pace = { openedAt: number; answers: number; lastAnswerAt?: number; help: number };
const paces = new Map<string, Pace>();
const MAX_GAMES = 50;

export function noteGamePace(childId: string, nodeId: string, kind: "state" | "answer" | "help", at = Date.now()): void {
  const key = `${childId}\u0000${nodeId}`;
  if (!paces.has(key) && paces.size >= MAX_GAMES) paces.delete(paces.keys().next().value!);
  const pace = paces.get(key) ?? { openedAt: at, answers: 0, help: 0 };
  if (kind === "answer") { pace.answers += 1; pace.lastAnswerAt = at; }
  if (kind === "help") pace.help += 1;
  paces.set(key, pace);
}

const announced = new Set<string>();

export function gamePaceFacts(childId: string, nodeId: string | undefined, now = Date.now()): string {
  const pace = nodeId ? paces.get(`${childId}\u0000${nodeId}`) : undefined;
  if (!pace) return "";
  // Once per game, so the rating can see that her companion had the facts in this game.
  if (!announced.has(`${childId}\u0000${nodeId}`)) { announced.add(`${childId}\u0000${nodeId}`); console.log(` 🎮 [companion-context] [pace] child=${childId} node=${nodeId}`); }
  const min = (ms: number) => { const m = Math.max(0, Math.round(ms / 60_000)); return `${m} minute${m === 1 ? "" : "s"}`; };
  const answers = pace.answers ? `${pace.answers} answer${pace.answers === 1 ? "" : "s"} so far, the last one ${min(now - pace.lastAnswerAt!)} ago` : "no answer yet";
  return `This game: open ${min(now - pace.openedAt)}; ${answers}; help asked ${pace.help} time${pace.help === 1 ? "" : "s"}.`;
}

/** When she last answered in any game, for the companion's check-in appointment. */
export function lastAnswerAt(childId: string): number | undefined {
  let latest: number | undefined;
  for (const [key, pace] of paces) if (key.startsWith(`${childId}\u0000`) && pace.lastAnswerAt && (!latest || pace.lastAnswerAt > latest)) latest = pace.lastAnswerAt;
  return latest;
}
