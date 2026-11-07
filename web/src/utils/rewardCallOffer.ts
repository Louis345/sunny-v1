/**
 * The one rule for when an earned companion call may be offered. The ticket itself is
 * always granted and saved by the server; this only decides whether leaving for the call
 * is allowed right now. A call never pulls her away from a board that is still being
 * decided or built, a just-published board whose reveal is pending, or a Quest/Boss board.
 * Returns why it is held, or null when the moment is calm and the offer may show.
 */
export type RewardCallHeldReason = "reveal_pending" | "next_board_coming" | "encounter_board" | "encounter_on_board";

export function rewardCallHeldReason(
  cycle: { lifecycle?: string; nodes?: ReadonlyArray<{ role?: string; state?: string }> } | null | undefined,
  revealPending: boolean,
): RewardCallHeldReason | null {
  if (revealPending) return "reveal_pending";
  const lifecycle = cycle?.lifecycle ?? "";
  if (/_(evaluating|generating)$/.test(lifecycle)) return "next_board_coming";
  if (/^(quest|boss)_/.test(lifecycle)) return "encounter_board";
  if (cycle?.nodes?.some(node => (node.role === "quest" || node.role === "boss") && node.state !== "completed")) return "encounter_on_board";
  return null;
}

/** The earned call's page. The server redirects /companions to /companions/ because the companion
 * models live in a folder of that name, so both spellings must open the call (BUGS.md 2026-11-07). */
export function isCompanionCallPath(pathname: string): boolean {
  return /^\/companions\/?$/.test(pathname);
}
