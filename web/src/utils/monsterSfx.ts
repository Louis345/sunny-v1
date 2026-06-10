import type {
  CapturedMonsterConfig,
  CapturedMonsterSoundCue,
} from "../components/capturedMonsterCatalog";

export type MonsterSfxAudioMode = "synthetic" | "file" | "muted";

export interface MonsterSfxOptions {
  audioMode?: MonsterSfxAudioMode;
  audioAssets?: Partial<Record<CapturedMonsterSoundCue, string>>;
  volume?: number;
}

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function createAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  try {
    const AudioContextCtor =
      window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioContextCtor) return null;

    const context = new AudioContextCtor();
    if (context.state === "suspended") {
      void context.resume().catch((error: unknown) => {
        console.warn(" 🎮 [monster-sfx] [context-resume] [failed]", { error });
      });
    }
    return context;
  } catch (error) {
    console.warn(" 🎮 [monster-sfx] [context] [failed]", { error });
    return null;
  }
}

function normalizedVolume(options: MonsterSfxOptions | undefined): number {
  return Math.max(0, Math.min(1, options?.volume ?? 0.68));
}

function playFileSfx(
  creature: CapturedMonsterConfig,
  cue: CapturedMonsterSoundCue,
  options: MonsterSfxOptions | undefined,
): boolean {
  if (options?.audioMode !== "file") return false;
  const src = options.audioAssets?.[cue];
  if (!src || typeof Audio === "undefined") return false;

  try {
    const audio = new Audio(src);
    audio.volume = normalizedVolume(options);
    audio.currentTime = 0;
    const playResult = audio.play();
    if (playResult && typeof playResult.catch === "function") {
      void playResult.catch((error: unknown) => {
        console.warn(" 🎮 [monster-sfx] [file] [failed]", {
          creatureId: creature.id,
          cue,
          src,
          error,
        });
      });
    }
    console.info(" 🎮 [monster-sfx] [play] [reported]", {
      creatureId: creature.id,
      cue,
      mode: "file",
    });
    return true;
  } catch (error) {
    console.warn(" 🎮 [monster-sfx] [file] [failed]", {
      creatureId: creature.id,
      cue,
      src,
      error,
    });
    return false;
  }
}

function closeLater(context: AudioContext, delayMs: number): void {
  window.setTimeout(() => {
    void context.close().catch((error: unknown) => {
      console.warn(" 🎮 [monster-sfx] [close] [failed]", { error });
    });
  }, delayMs);
}

function tone(
  context: AudioContext,
  frequency: number,
  offset: number,
  duration: number,
  gainPeak: number,
  volume: number,
  type: OscillatorType = "sine",
): void {
  const start = context.currentTime + offset;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(gainPeak * volume, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.04);
}

function sweep(
  context: AudioContext,
  fromFrequency: number,
  toFrequency: number,
  duration: number,
  gainPeak: number,
  volume: number,
): void {
  const start = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(fromFrequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(toFrequency, start + duration);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(gainPeak * volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

function playSyntheticCue(
  context: AudioContext,
  cue: CapturedMonsterSoundCue,
  volume: number,
): void {
  switch (cue) {
    case "idle":
      tone(context, 523.25, 0, 0.24, 0.045, volume, "triangle");
      closeLater(context, 620);
      return;
    case "noticed_orb":
      tone(context, 659.25, 0, 0.18, 0.07, volume, "triangle");
      tone(context, 880, 0.08, 0.22, 0.052, volume, "sine");
      closeLater(context, 720);
      return;
    case "ready":
      [783.99, 1046.5, 1318.51].forEach((frequency, index) => {
        tone(context, frequency, index * 0.055, 0.28, 0.062, volume, "triangle");
      });
      closeLater(context, 860);
      return;
    case "happy":
      [880, 1174.66, 1567.98].forEach((frequency, index) => {
        tone(context, frequency, index * 0.062, 0.26, 0.064, volume, "sine");
      });
      closeLater(context, 840);
      return;
    case "sleepy":
      sweep(context, 392, 220, 0.44, 0.055, volume);
      tone(context, 329.63, 0.24, 0.32, 0.035, volume, "sine");
      closeLater(context, 880);
      return;
    case "captured":
      sweep(context, 220, 880, 0.34, 0.072, volume);
      tone(context, 1046.5, 0.18, 0.22, 0.055, volume, "triangle");
      tone(context, 1567.98, 0.3, 0.3, 0.048, volume, "sine");
      closeLater(context, 980);
      return;
    default: {
      const exhaustive: never = cue;
      console.warn(" 🎮 [monster-sfx] [unknown] [ignored]", { cue: exhaustive });
    }
  }
}

export function playMonsterSfx(
  creature: CapturedMonsterConfig,
  cue: CapturedMonsterSoundCue,
  options?: MonsterSfxOptions,
): void {
  if (!creature.expression.soundProfile.cues.includes(cue)) {
    console.warn(" 🎮 [monster-sfx] [cue] [unsupported]", {
      creatureId: creature.id,
      cue,
      voice: creature.expression.soundProfile.voice,
    });
    return;
  }

  if (options?.audioMode === "muted") {
    console.info(" 🎮 [monster-sfx] [play] [reported]", {
      creatureId: creature.id,
      cue,
      mode: "muted",
    });
    return;
  }

  if (playFileSfx(creature, cue, options)) return;

  const context = createAudioContext();
  if (!context) return;

  try {
    playSyntheticCue(context, cue, normalizedVolume(options));
    console.info(" 🎮 [monster-sfx] [play] [reported]", {
      creatureId: creature.id,
      cue,
      mode: "synthetic",
    });
  } catch (error) {
    console.warn(" 🎮 [monster-sfx] [play] [failed]", {
      creatureId: creature.id,
      cue,
      error,
    });
    void context.close().catch((closeError: unknown) => {
      console.warn(" 🎮 [monster-sfx] [close] [failed]", { error: closeError });
    });
  }
}
