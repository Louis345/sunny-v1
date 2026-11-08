import "./CreatureEncounter.css";
import { creatureDexView, type CreatureEncounterHistory, type CreatureScene } from "./creatureEncounters";
import { creatureArtStyle, dexLabel } from "./CreatureEncounterReveal";

const RARITY_NAME = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" } as const;

/** Her creature dex (owner, 2026-11-08), built like the reward collection: every species is listed, caught in
 * colour, seen in grey, unknown as a ??? shadow, each with where to look, what is left to do (tries this week,
 * boards to go, its season) and who is out right now, so every creature is a goal she can chase. */
export function CreatureCollection({
  history,
  scene,
  nowIso = new Date().toISOString(),
}: {
  history: CreatureEncounterHistory;
  scene: CreatureScene;
  nowIso?: string;
}) {
  const view = creatureDexView({ history, scene, nowIso });
  return (
    <div className="creature-dex">
      <header className="creature-dex__header">
        <h2>Creature Dex</h2>
        <span className="creature-dex__count">{`${view.caught} of ${view.total} caught`}</span>
        <span className="creature-dex__seen">{`${view.seen} seen`}</span>
        <div className="creature-dex__bar" aria-hidden="true">
          <span style={{ width: `${(view.caught / view.total) * 100}%` }} />
        </div>
      </header>
      <div className="creature-dex__grid">
        {view.entries.map((entry) => (
          <div
            key={entry.species.id}
            className="creature-tile"
            data-testid={`creature-tile-${entry.species.id}`}
            data-status={entry.status}
            data-rarity={entry.species.rarity}
            data-out-now={entry.outNow ? "true" : "false"}
          >
            {entry.outNow && entry.status !== "caught" ? <span className="creature-tile__out">Out now!</span> : null}
            <span className="creature-tile__dex">{dexLabel(entry.species)}</span>
            <img className="creature-tile__art" src={entry.species.imageSrc} alt="" aria-hidden="true" style={creatureArtStyle(entry.species)} />
            <span className="creature-tile__rarity">{RARITY_NAME[entry.species.rarity]}</span>
            <span className="creature-tile__name">{entry.displayName}</span>
            {entry.status === "caught" ? (
              <span className="creature-tile__caught">Caught</span>
            ) : (
              <span className="creature-tile__where">
                {entry.where}
                <br />
                <strong className="creature-tile__goal">{entry.goal}</strong>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
