/**
 * The one rule for when an earned companion call may be offered. The ticket is always granted and saved by
 * the server. Owner 2026-11-08: FaceTime comes the moment a board ends; the wait for the next board is when
 * she calls Elli, so nothing holds it (the 11/5 hold left her on the loading screen with no call).
 * Returns why it is held, or null when the offer may show.
 */
export type RewardCallHeldReason = never;

export function rewardCallHeldReason(
  _cycle: { lifecycle?: string; nodes?: ReadonlyArray<{ role?: string; state?: string }> } | null | undefined,
  _revealPending: boolean,
): RewardCallHeldReason | null {
  return null;
}

/** The earned call's page. The server redirects /companions to /companions/ because the companion
 * models live in a folder of that name, so both spellings must open the call (BUGS.md 2026-11-07). */
export function isCompanionCallPath(pathname: string): boolean {
  return /^\/companions\/?$/.test(pathname);
}
