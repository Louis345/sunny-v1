import { useEffect, useState } from "react";
import { useCreatureIdleLife } from "../hooks/useCreatureIdleLife";
import { playSparkOrbSfx } from "../utils/sparkOrbSfx";
import "./CreatureEncounter.css";
import { creatureArtStyle, dexLabel } from "./CreatureEncounterReveal";
import {
  DEN_FOOD_BOND,
  DEN_FOODS,
  MAX_BOND,
  denRoster,
  dismissSidekick,
  feedDenCreature,
  recallSidekick,
  type DenState,
} from "./creatureDenRules";

const RARITY_NAME = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" } as const;
const FOOD_ICON: Record<string, string> = { apple_bite: "🍎", star_candy: "🍬", mystery_snack: "🎁" };

/** Her creature den (Storybook draft, owner 2026-11-08): everyone she caught, one room per creature, recall one
 * as her sidekick or send it home, and feed with store food she owns. Changes go out through onChange. */
export function CreatureDen({ state, onChange }: { state: DenState; onChange: (next: DenState) => void }) {
  const roster = denRoster(state);
  const [selectedId, setSelectedId] = useState<string | null>(state.sidekickId ?? roster[0]?.species.id ?? null);
  const [reaction, setReaction] = useState<{ key: number; text: string } | null>(null);
  const selected = roster.find((entry) => entry.species.id === selectedId) ?? roster[0];
  const anyFoodOut = DEN_FOODS.some((food) => (state.food[food.id] ?? 0) <= 0);

  function react(text: string): void {
    setReaction((previous) => ({ key: (previous?.key ?? 0) + 1, text }));
  }

  // A reaction plays once, then the creature goes back to its idle life.
  useEffect(() => {
    if (!reaction) return;
    const timer = window.setTimeout(() => setReaction(null), 1_100);
    return () => window.clearTimeout(timer);
  }, [reaction]);

  const idleFidget = useCreatureIdleLife({
    active: Boolean(selected) && !reaction,
    label: "creature-den",
    onFidget: () => playSparkOrbSfx("chirp", {}),
  });

  return (
    <div className="creature-den">
      <section className="creature-den__roster" aria-label="Your creatures">
        <h2>Your Den</h2>
        <div className="creature-den__grid">
          {roster.map(({ species, creature, isSidekick }) => (
            <button
              key={species.id}
              type="button"
              className="creature-den__tile"
              data-testid={`den-tile-${species.id}`}
              data-rarity={species.rarity}
              data-selected={selected?.species.id === species.id ? "true" : "false"}
              data-sidekick={isSidekick ? "true" : "false"}
              onClick={() => setSelectedId(species.id)}
            >
              {isSidekick ? <span className="creature-den__badge">With Elli</span> : null}
              <img src={species.imageSrc} alt="" aria-hidden="true" style={creatureArtStyle(species)} />
              <span className="creature-den__tile-name">{creature.nickname}</span>
              <span className="creature-den__tile-dex">{dexLabel(species)}</span>
            </button>
          ))}
        </div>
      </section>

      {selected ? (
        <section className="creature-den__room" data-rarity={selected.species.rarity} aria-label={`${selected.creature.nickname}'s room`}>
          <div className="creature-den__stage">
            <img
              key={reaction?.key ?? 0}
              className="creature-den__art"
              data-testid="den-creature-art"
              data-reacting={reaction ? "true" : "false"}
              data-idle-life={reaction ? undefined : "breathing"}
              data-idle-fidget={reaction || !idleFidget ? undefined : idleFidget}
              src={selected.species.imageSrc}
              alt=""
              aria-hidden="true"
              style={creatureArtStyle(selected.species)}
            />
            {reaction ? (
              <span key={`r-${reaction.key}`} className="creature-den__reaction">
                {reaction.text}
              </span>
            ) : null}
          </div>
          <div className="creature-den__panel">
            <span className="creature-den__species">{`${dexLabel(selected.species)} ${selected.species.speciesName} · ${RARITY_NAME[selected.species.rarity]}`}</span>
            <h3>{selected.creature.nickname}</h3>
            <div className="creature-den__bond" aria-label={`Bond ${selected.creature.bond} of ${MAX_BOND}`}>
              <span>Bond</span>
              <div className="creature-den__bond-bar">
                <span style={{ width: `${(selected.creature.bond / MAX_BOND) * 100}%` }} />
              </div>
              <strong>{selected.creature.bond}</strong>
            </div>
            <div className="creature-den__foods">
              {DEN_FOODS.map((food) => {
                const count = state.food[food.id] ?? 0;
                return (
                  <button
                    key={food.id}
                    type="button"
                    className="creature-den__food"
                    disabled={count <= 0}
                    aria-label={`${food.label} ×${count}`}
                    onClick={() => {
                      const result = feedDenCreature(state, selected.species.id, food.id);
                      if (!result.ok) return;
                      react(`+${result.bondGained} bond`);
                      onChange(result.state);
                    }}
                  >
                    <span aria-hidden="true">{FOOD_ICON[food.id] ?? "🍽️"}</span>
                    <span>{food.label}</span>
                    <small>{`×${count} · +${DEN_FOOD_BOND[food.id]}`}</small>
                  </button>
                );
              })}
            </div>
            {anyFoodOut ? <p className="creature-den__hint">Buy more food in the store with your coins.</p> : null}
            <div className="creature-den__actions">
              <button type="button" className="creature-den__pet" onClick={() => react("♥")}>
                {`Pet ${selected.creature.nickname}`}
              </button>
              {selected.isSidekick ? (
                <button type="button" className="creature-den__home" onClick={() => onChange(dismissSidekick(state))}>
                  {`Send ${selected.creature.nickname} home`}
                </button>
              ) : (
                <button
                  type="button"
                  className="creature-den__recall"
                  onClick={() => onChange(recallSidekick(state, selected.species.id))}
                >
                  {`Recall ${selected.creature.nickname}`}
                </button>
              )}
            </div>
          </div>
        </section>
      ) : (
        <p className="creature-den__empty">No creatures yet. Finish stops and watch the grass!</p>
      )}
    </div>
  );
}
