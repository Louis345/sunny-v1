import { useEffect, useRef, useState } from "react";
import { useCreatureIdleLife } from "../hooks/useCreatureIdleLife";
import "./CreatureEncounter.css";
import type { CapturedMonsterConfig } from "../../../src/shared/capturedMonsterCatalog";
import { creatureArtStyle } from "./CreatureEncounterReveal";
import { playSparkOrbSfx } from "../utils/sparkOrbSfx";

export const SIDEKICK_CHEER_MS = 1_200;
/** With nothing happening for this long, the sidekick dozes off (wakes on the next right answer). */
export const SIDEKICK_SLEEP_MS = 20_000;

type SidekickMood = "idle" | "cheer" | "sleep";

/** The recalled creature riding along next to Elli (owner, 2026-11-08). It reacts to her right answers and
 * goes home when she taps it. Pure presentation: it never touches learning evidence. */
export function SidekickBuddy({
  creature,
  nickname,
  cheerKey,
  onDismiss,
  placement = "beside-companion",
}: {
  creature: CapturedMonsterConfig;
  nickname: string;
  /** Bump this on each right answer to make the sidekick cheer. */
  cheerKey: number;
  onDismiss: () => void;
  /** beside-companion pins it just left of Elli's portrait and above it; inline leaves layout to the parent. */
  placement?: "beside-companion" | "inline";
}) {
  const [mood, setMood] = useState<SidekickMood>("idle");
  const firstKey = useRef(cheerKey);
  // Silent fidgets: a chirp every few seconds next to her homework would pull her attention.
  const idleFidget = useCreatureIdleLife({ active: mood === "idle", label: "sidekick" });

  useEffect(() => {
    if (cheerKey === firstKey.current) return;
    setMood("cheer");
    playSparkOrbSfx("chirp");
    const timer = window.setTimeout(() => setMood("idle"), SIDEKICK_CHEER_MS);
    return () => window.clearTimeout(timer);
  }, [cheerKey]);

  useEffect(() => {
    if (mood !== "idle") return;
    const timer = window.setTimeout(() => setMood("sleep"), SIDEKICK_SLEEP_MS);
    return () => window.clearTimeout(timer);
  }, [mood, cheerKey]);

  return (
    <button
      type="button"
      className={placement === "beside-companion" ? "sidekick-buddy sidekick-buddy--beside-companion" : "sidekick-buddy"}
      data-testid="sidekick-buddy"
      data-mood={mood}
      data-idle-life={mood === "idle" ? "breathing" : undefined}
      data-idle-fidget={mood === "idle" && idleFidget ? idleFidget : undefined}
      data-rarity={creature.rarity}
      aria-label={`Send ${nickname} home`}
      onClick={() => {
        console.log(` 🎮 [sidekick] [dismiss] [tapped] creature=${creature.id}`);
        onDismiss();
      }}
    >
      {mood === "cheer" ? <span className="sidekick-buddy__sparkles" aria-hidden="true">✦ ✧ ✦</span> : null}
      {mood === "sleep" ? <span className="sidekick-buddy__zzz" aria-hidden="true">z z Z</span> : null}
      <img className="sidekick-buddy__art" src={creature.imageSrc} alt="" aria-hidden="true" style={creatureArtStyle(creature)} />
      <span className="sidekick-buddy__name">{nickname}</span>
    </button>
  );
}
