import { useEffect, useState, type CSSProperties } from "react";
import "./CreatureEncounter.css";
import type { CapturedMonsterConfig } from "../../../src/shared/capturedMonsterCatalog";
import { playSparkOrbSfx } from "../utils/sparkOrbSfx";

/** Suspense first, then the creature: something rustles, a silhouette in its rarity's light, then the reveal. */
export const CREATURE_REVEAL_MS = { silhouette: 1400, reveal: 2700 } as const;
const RARITY_NAME = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" } as const;

type RevealPhase = "rustle" | "silhouette" | "revealed";

export function creatureArtStyle(creature: CapturedMonsterConfig): CSSProperties | undefined {
  return creature.placeholderHue ? { filter: `hue-rotate(${creature.placeholderHue}deg) saturate(1.15)` } : undefined;
}

export function dexLabel(creature: CapturedMonsterConfig): string {
  return `#${String(creature.dexNumber).padStart(3, "0")}`;
}

/** Storybook prototype of the moment a creature appears after a finished stop (owner, 2026-11-08). It only shows
 * a roll it is given; rolling and saving belong to the server, and nothing here touches learning evidence. */
export function CreatureEncounterReveal({
  creature,
  isNew,
  charges,
  onCatch,
  onRun,
}: {
  creature: CapturedMonsterConfig;
  isNew: boolean;
  charges: number;
  onCatch: () => void;
  onRun: () => void;
}) {
  const [phase, setPhase] = useState<RevealPhase>("rustle");

  useEffect(() => {
    console.log(` 🎮 [creature-encounter] [rustle] creature=${creature.id} rarity=${creature.rarity}`);
    playSparkOrbSfx("grab");
    const silhouette = window.setTimeout(() => {
      setPhase("silhouette");
      playSparkOrbSfx("charge");
    }, CREATURE_REVEAL_MS.silhouette);
    const reveal = window.setTimeout(() => {
      setPhase("revealed");
      playSparkOrbSfx("chirp");
      if (creature.rarity !== "common") playSparkOrbSfx("ready");
      console.log(` 🎮 [creature-encounter] [revealed] creature=${creature.id} new=${isNew}`);
    }, CREATURE_REVEAL_MS.reveal);
    return () => {
      window.clearTimeout(silhouette);
      window.clearTimeout(reveal);
    };
  }, [creature.id, creature.rarity, isNew]);

  return (
    <div className="creature-reveal" data-testid="creature-reveal" data-phase={phase} data-rarity={phase === "rustle" ? undefined : creature.rarity}>
      <div className="creature-reveal__beam" aria-hidden="true" />
      <div className="creature-reveal__bushes" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {phase === "rustle" ? <p className="creature-reveal__whisper">Something is rustling in the grass…</p> : null}
      {phase !== "rustle" ? (
        <img className="creature-reveal__art" src={creature.imageSrc} alt="" aria-hidden="true" style={creatureArtStyle(creature)} />
      ) : null}
      {phase === "silhouette" ? <p className="creature-reveal__whisper">{`A ${RARITY_NAME[creature.rarity].toLowerCase()} creature!`}</p> : null}
      {phase === "revealed" ? (
        <div className="creature-reveal__card">
          <div className="creature-reveal__tags">
            <span className="creature-reveal__dex">{dexLabel(creature)}</span>
            <span className="creature-reveal__rarity">{RARITY_NAME[creature.rarity]}</span>
            {isNew ? <span className="creature-reveal__new">NEW!</span> : null}
          </div>
          <strong className="creature-reveal__name">{creature.speciesName}</strong>
          <span className="creature-reveal__stakes">{`Answer ${charges} to charge the orb, then throw!`}</span>
          <div className="creature-reveal__actions">
            <button type="button" className="creature-reveal__catch" onClick={onCatch}>
              Catch it!
            </button>
            <button type="button" className="creature-reveal__run" onClick={onRun}>
              Let it go
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
