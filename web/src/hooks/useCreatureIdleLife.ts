import { useEffect, useRef, useState } from "react";
import type { SensoryMotion } from "../../../src/shared/sensoryProfile";

/** Little idle moves a creature picks from at random while it waits (orb scene, den, sidekick). */
export const CREATURE_IDLE_FIDGETS = ["hop", "tilt", "wiggle", "look"] as const;
export type CreatureIdleFidget = (typeof CREATURE_IDLE_FIDGETS)[number];
/** Law 2 guard: after this many fidgets in one stretch, the creature only breathes. */
export const CREATURE_MAX_IDLE_FIDGETS = 40;
const IDLE_FIDGET_MIN_GAP_MS = 2_600;
const IDLE_FIDGET_GAP_SPREAD_MS = 3_200;
export const CREATURE_IDLE_FIDGET_MS = 900;
/** Idle chirps are a treat, not a metronome: at most one every 20 seconds (owner, 2026-11-08). */
export const CREATURE_IDLE_CHIRP_COOLDOWN_MS = 20_000;

/**
 * One idle-life clock for every creature: random gaps between small fidgets so it never loops on a fixed
 * beat. Exit: effect cleanup when `active` turns off or on unmount; capped at CREATURE_MAX_IDLE_FIDGETS.
 */
export function useCreatureIdleLife({
  active,
  motion = "standard",
  label,
  onFidget,
}: {
  active: boolean;
  motion?: SensoryMotion;
  /** Component name for the log line. */
  label: string;
  /** `chirp` is true only when the idle-chirp cooldown has passed; callers that make sound respect it. */
  onFidget?: (fidget: CreatureIdleFidget, sound: { chirp: boolean }) => void;
}): CreatureIdleFidget | null {
  const [fidget, setFidget] = useState<CreatureIdleFidget | null>(null);
  const onFidgetRef = useRef(onFidget);
  onFidgetRef.current = onFidget;
  const running = active && motion !== "calm";

  useEffect(() => {
    if (!running) return;
    const gapScale = motion === "lively" ? 0.6 : 1;
    console.info(` 🎮 [${label}] [idle-life] [started]`, { motion });
    let fidgetCount = 0;
    let lastChirpAt = Number.NEGATIVE_INFINITY;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleNext = () => {
      if (fidgetCount >= CREATURE_MAX_IDLE_FIDGETS) {
        console.info(` 🎮 [${label}] [idle-life] [fidget-cap-reached]`);
        return;
      }
      timer = setTimeout(() => {
        fidgetCount += 1;
        const index = Math.min(
          CREATURE_IDLE_FIDGETS.length - 1,
          Math.floor(Math.random() * CREATURE_IDLE_FIDGETS.length),
        );
        const next = CREATURE_IDLE_FIDGETS[index];
        setFidget(next);
        const now = Date.now();
        const chirp = now - lastChirpAt >= CREATURE_IDLE_CHIRP_COOLDOWN_MS;
        if (chirp) lastChirpAt = now;
        onFidgetRef.current?.(next, { chirp });
        timer = setTimeout(() => {
          setFidget(null);
          scheduleNext();
        }, CREATURE_IDLE_FIDGET_MS);
      }, (IDLE_FIDGET_MIN_GAP_MS + Math.random() * IDLE_FIDGET_GAP_SPREAD_MS) * gapScale);
    };
    scheduleNext();
    return () => {
      if (timer) clearTimeout(timer);
      setFidget(null);
      console.info(` 🎮 [${label}] [idle-life] [stopped]`);
    };
  }, [running, motion, label]);

  return running ? fidget : null;
}
