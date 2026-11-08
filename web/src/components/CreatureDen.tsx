import { useEffect, useState, type CSSProperties } from "react";
import "./CreatureEncounter.css";
import type { CapturedMonsterConfig } from "./capturedMonsterCatalog";
import { creatureArtStyle, dexLabel } from "./CreatureEncounterReveal";
import {
  DEN_FOOD_BOND,
  DEN_FOODS,
  MAX_BOND,
  denRoster,
  dismissSidekick,
  feedDenCreature,
  recallSidekick,
  type DenCreature,
  type DenState,
} from "./creatureDenRules";
import { useCreatureIdleLife } from "../hooks/useCreatureIdleLife";
import { playSparkOrbSfx } from "../utils/sparkOrbSfx";

const RARITY_NAME = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" } as const;
const FOOD_ICON: Record<string, string> = { apple_bite: "🍎", star_candy: "🍬", mystery_snack: "🎁" };
const DEN_BACKGROUND = "/encounters/spark-orb/park-background.png";
/** Where creatures roam in the park: front of the meadow is lower and bigger, the back is higher and smaller. */
const WILD_SPOTS: ReadonlyArray<{ left: number; bottom: number }> = [
  { left: 24, bottom: 10 },
  { left: 52, bottom: 6 },
  { left: 78, bottom: 12 },
  { left: 38, bottom: 26 },
  { left: 66, bottom: 28 },
  { left: 12, bottom: 30 },
  { left: 88, bottom: 32 },
  { left: 52, bottom: 36 },
];

type Reaction = { id: string; key: number; text: string };

function WildCreature({
  species,
  creature,
  index,
  selected,
  isSidekick,
  reaction,
  onSelect,
}: {
  species: CapturedMonsterConfig;
  creature: DenCreature;
  index: number;
  selected: boolean;
  isSidekick: boolean;
  reaction: Reaction | null;
  onSelect: () => void;
}) {
  // Out in the wild they stay quiet; they chirp only when she taps them.
  const idleFidget = useCreatureIdleLife({ active: !reaction, label: `creature-den:${species.id}` });
  const spot = WILD_SPOTS[index % WILD_SPOTS.length];
  const depth = 1 - spot.bottom / 60;
  const style = {
    left: `${spot.left}%`,
    bottom: `${spot.bottom}%`,
    "--depth": depth.toFixed(2),
    "--wander-s": `${9 + (index % 3) * 3}s`,
    "--wander-delay": `${-index * 2.3}s`,
    zIndex: 10 + Math.round(depth * 10),
  } as CSSProperties;
  return (
    <button
      type="button"
      className="creature-den__wild"
      data-testid={`den-wild-${species.id}`}
      data-rarity={species.rarity}
      data-selected={selected ? "true" : "false"}
      data-sidekick={isSidekick ? "true" : "false"}
      data-idle-life={reaction ? undefined : "breathing"}
      data-idle-fidget={reaction || !idleFidget ? undefined : idleFidget}
      aria-label={`${creature.nickname}, ${species.speciesName}`}
      style={style}
      onClick={onSelect}
    >
      {isSidekick ? <span className="creature-den__badge">With Elli</span> : null}
      {reaction ? (
        <span key={reaction.key} className="creature-den__reaction">
          {reaction.text}
        </span>
      ) : null}
      <img
        key={reaction?.key ?? 0}
        className="creature-den__art"
        data-reacting={reaction ? "true" : "false"}
        src={species.imageSrc}
        alt=""
        aria-hidden="true"
        style={creatureArtStyle(species)}
      />
      <span className="creature-den__wild-shadow" aria-hidden="true" />
      <span className="creature-den__wild-name">{creature.nickname}</span>
    </button>
  );
}

/** Her creature den (Storybook draft, owner 2026-11-08): everyone she caught roams the park; tapping one opens
 * its den card (bond, food, pet, recall or send home). Changes go out through onChange. */
export function CreatureDen({ state, onChange }: { state: DenState; onChange: (next: DenState) => void }) {
  const roster = denRoster(state);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const selected = roster.find((entry) => entry.species.id === selectedId);
  const anyFoodOut = DEN_FOODS.some((food) => (state.food[food.id] ?? 0) <= 0);

  function react(id: string, text: string): void {
    playSparkOrbSfx("chirp", {});
    setReaction((previous) => ({ id, key: (previous?.key ?? 0) + 1, text }));
  }

  // A reaction plays once, then the creature goes back to its idle life.
  useEffect(() => {
    if (!reaction) return;
    const timer = window.setTimeout(() => setReaction(null), 1_100);
    return () => window.clearTimeout(timer);
  }, [reaction]);

  return (
    <div className="creature-den" aria-label="Your den">
      <section className="creature-den__park" aria-label="Your creatures in the wild">
        <img className="creature-den__backdrop" src={DEN_BACKGROUND} alt="" aria-hidden="true" />
        <header className="creature-den__title">
          <h2>Your Den</h2>
          <span>{roster.length ? `${roster.length} friends · tap one to visit` : "No creatures yet"}</span>
        </header>
        {roster.length === 0 ? <p className="creature-den__empty">Finish stops and watch the grass!</p> : null}
        {roster.map(({ species, creature, isSidekick }, index) => (
          <WildCreature
            key={species.id}
            species={species}
            creature={creature}
            index={index}
            selected={selectedId === species.id}
            isSidekick={isSidekick}
            reaction={reaction?.id === species.id ? reaction : null}
            onSelect={() => {
              setSelectedId(species.id);
              react(species.id, "♥");
            }}
          />
        ))}
      </section>

      {selected ? (
        <section
          className="creature-den__card"
          role="dialog"
          aria-label={`${selected.creature.nickname} in your den`}
          data-rarity={selected.species.rarity}
        >
          <button type="button" className="creature-den__close" aria-label="Close" onClick={() => setSelectedId(null)}>
            ×
          </button>
          <span className="creature-den__eyebrow">Your Den</span>
          <h3>{selected.creature.nickname}</h3>
          <span className="creature-den__species">{`${dexLabel(selected.species)} ${selected.species.speciesName} · ${RARITY_NAME[selected.species.rarity]}`}</span>
          <div className="creature-den__chips">
            <span>{`${selected.species.statLabel} ${selected.species.statValue}`}</span>
            {selected.species.personalityTags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
            <span>{selected.isSidekick ? "With Elli" : "In the den"}</span>
          </div>
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
                    react(selected.species.id, `+${result.bondGained} bond`);
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
            <button type="button" className="creature-den__pet" onClick={() => react(selected.species.id, "♥")}>
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
        </section>
      ) : null}
    </div>
  );
}
