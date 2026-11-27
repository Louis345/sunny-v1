import { REWARD_CATALOG } from "./rewardCatalog";

export type RewardBreakGame = { gameId: string; name: string; icon: string; file: string };

/**
 * The games a reward break offers her (owner, 2026-11-09): the 8-bit game cards she owns, as facts from her wallet;
 * with none yet, every arcade game. The catalog is the one list; nothing here picks for her.
 */
export function rewardBreakGameChoices(ownedRewardIds: readonly string[] | undefined): RewardBreakGame[] {
  const games = REWARD_CATALOG.filter(item => item.kind === "game" && item.gameId)
    .map(item => ({ gameId: item.gameId!, name: item.name, icon: item.icon, file: `${item.gameId}.html`, rewardId: item.id }));
  const owned = new Set(ownedRewardIds ?? []);
  const mine = games.filter(game => owned.has(game.rewardId));
  return (mine.length ? mine : games).map(({ rewardId: _rewardId, ...game }) => game);
}
