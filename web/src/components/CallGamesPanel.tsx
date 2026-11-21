import { rewardBreakGameChoices, type RewardBreakGame } from "../../../src/shared/rewardBreakGames";
import type { RewardItem } from "../../../src/shared/rewardCatalog";
import { RewardCollection } from "./RewardCollection";

/**
 * Games in FaceTime (owner, 2026-11-09): her collection, the games she won lit and the rest dark until she wins
 * them. Play opens an owned game inside the call; the call's clock keeps running.
 */
export function CallGamesPanel(props: {
  ownedRewardIds: readonly string[];
  onPlay: (game: RewardBreakGame) => void;
  onClose: () => void;
}) {
  const owned = rewardBreakGameChoices(props.ownedRewardIds).filter(game => props.ownedRewardIds.includes(`game:${game.gameId}`));
  const play = (item: RewardItem) => {
    const game = owned.find(row => row.gameId === item.gameId);
    if (!game) return;
    console.log(` 🎮 [call-games] [play] game=${game.gameId}`);
    props.onPlay(game);
  };
  return (
    <div className="h-full w-full overflow-y-auto rounded-xl bg-slate-950/85 p-4 text-white">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-black">Games</h2>
        <button type="button" aria-label="Close games" className="rounded-lg bg-white/90 px-3 py-1 text-sm font-black text-slate-900" onClick={props.onClose}>Back to call</button>
      </div>
      <RewardCollection ownedIds={props.ownedRewardIds} onUse={play} kinds={["game"]} />
    </div>
  );
}
