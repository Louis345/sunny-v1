import type { RewardBreakGame } from "../../../src/shared/rewardBreakGames";

/** A reward game inside the call. Every arcade game waits for {type:"start"}; the call sends it once the frame loads. */
export function CallGamePlayer({ game, childId, childName, companionName, onBack }: {
  game: RewardBreakGame; childId: string; childName: string; companionName: string; onBack: () => void;
}) {
  const start = (frame: HTMLIFrameElement) => {
    frame.contentWindow?.postMessage({ type: "start", childName, companionName, config: {} }, "*");
    console.log(` 🎮 [call-game] [start] [sent] game=${game.gameId} child=${childId}`);
  };
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", alignSelf: "stretch", justifySelf: "stretch" }}>
      <iframe title={game.name} src={`/games/${game.file}?child=${encodeURIComponent(childId)}`}
        onLoad={(event) => start(event.currentTarget)}
        style={{ width: "100%", height: "100%", border: 0, borderRadius: 12 }} />
      <button type="button" aria-label="Back to games" onClick={onBack}
        style={{ position: "absolute", top: 8, right: 8, borderRadius: 8, padding: "6px 12px", fontWeight: 900, background: "rgba(255,255,255,0.92)", color: "#27214a" }}>
        Back to games
      </button>
    </div>
  );
}
