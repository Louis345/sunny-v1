import { useEffect, useState } from "react";
import { rewardBreakGameChoices, type RewardBreakGame } from "../../../src/shared/rewardBreakGames";

/**
 * Her reward break (owner, 2026-11-09): she picks one of the 8-bit games she owns. Her wallet is the fact; the
 * choice is hers. Until the wallet answers (or if it cannot), every arcade game is offered so the break never stalls.
 */
export function RewardBreakPicker(props: {
  childId: string;
  fetchWallet?: (childId: string) => Promise<{ ownedRewardIds?: string[] }>;
  onPick: (game: RewardBreakGame) => void;
}) {
  const [games, setGames] = useState<RewardBreakGame[]>(() => rewardBreakGameChoices(undefined));
  useEffect(() => {
    let current = true;
    const fetchWallet = props.fetchWallet ?? ((id: string) => fetch(`/api/rewards/wallet/${encodeURIComponent(id)}`).then(response => response.json()));
    fetchWallet(props.childId)
      .then(wallet => {
        if (!current) return;
        const choices = rewardBreakGameChoices(wallet.ownedRewardIds);
        console.log(` 🎮 [reward-break] [choices] child=${props.childId} games=${choices.map(game => game.gameId).join(",")}`);
        setGames(choices);
      })
      .catch(error => console.error(` 🎮 [reward-break] [wallet] [failed] child=${props.childId}`, error));
    return () => { current = false; };
  }, [props.childId, props.fetchWallet]);
  return (
    <div role="dialog" aria-label="Pick your reward game" className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-slate-950/80 p-6">
      <h2 className="text-3xl font-black text-white">Pick your reward game!</h2>
      <div className="flex flex-wrap justify-center gap-4">
        {games.map(game => (
          <button key={game.gameId} type="button" aria-label={`Play ${game.name}`}
            className="flex w-40 flex-col items-center gap-2 rounded-2xl border-4 border-amber-300 bg-indigo-700 p-4 text-white shadow-xl hover:scale-105"
            onClick={() => { console.log(` 🎮 [reward-break] [picked] child=${props.childId} game=${game.gameId}`); props.onPick(game); }}>
            <span className="text-5xl">{game.icon}</span>
            <span className="text-lg font-bold">{game.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
