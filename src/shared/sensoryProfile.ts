/**
 * Sensory sheet on the child chart: how loud, how bright, and how lively games should be.
 * Games stay child-agnostic and read this; each child's chart (child_profile.json `sensory`) sets it.
 */
export type SensorySoundBrightness = "soft" | "standard" | "bright";
export type SensoryMotion = "calm" | "standard" | "lively";

export interface SensoryProfile {
  soundEnabled: boolean;
  /** 0..1 multiplier on every game sound. */
  soundVolume: number;
  /** soft rounds off sharp highs; bright keeps the full sparkle. */
  soundBrightness: SensorySoundBrightness;
  /** calm = gentle bob only; lively = more frequent idle moves. */
  motion: SensoryMotion;
}

export const DEFAULT_SENSORY_PROFILE: SensoryProfile = {
  soundEnabled: true,
  soundVolume: 0.8,
  soundBrightness: "standard",
  motion: "standard",
};

const BRIGHTNESS: readonly SensorySoundBrightness[] = ["soft", "standard", "bright"];
const MOTION: readonly SensoryMotion[] = ["calm", "standard", "lively"];

export function resolveSensoryProfile(partial: Partial<SensoryProfile> | null | undefined): SensoryProfile {
  const volume = Number(partial?.soundVolume);
  return {
    soundEnabled: partial?.soundEnabled === false ? false : DEFAULT_SENSORY_PROFILE.soundEnabled,
    soundVolume: Number.isFinite(volume)
      ? Math.max(0, Math.min(1, volume))
      : DEFAULT_SENSORY_PROFILE.soundVolume,
    soundBrightness: BRIGHTNESS.includes(partial?.soundBrightness as SensorySoundBrightness)
      ? (partial!.soundBrightness as SensorySoundBrightness)
      : DEFAULT_SENSORY_PROFILE.soundBrightness,
    motion: MOTION.includes(partial?.motion as SensoryMotion)
      ? (partial!.motion as SensoryMotion)
      : DEFAULT_SENSORY_PROFILE.motion,
  };
}
