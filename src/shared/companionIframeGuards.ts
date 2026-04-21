/**
 * Shared helpers for iframe game companion injection (web + tests).
 */

export function isDopamineGameUrl(
  launchedUrl: string | null | undefined,
  dopamineGames: string[],
): boolean {
  if (!launchedUrl) return false;
  return dopamineGames.some((g) => launchedUrl.includes(g));
}
