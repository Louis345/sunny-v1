export const GAME_SFX = {
  pronunciation: {
    comboBreaker: "/sfx/pronunciation/combo_breaker.mp3",
    onFire: "/sfx/kefla-power-up.mp3",
    megaStreak: "/sfx/kefla-power-up.mp3",
    hitPop: "synth:pronunciation-hit-pop",
    missThunk: "synth:pronunciation-miss-thunk",
    replayStart: "synth:pronunciation-replay-start",
    completeFanfare: "synth:pronunciation-complete-fanfare",
    heatUp: "synth:pronunciation-heat-up",
  },
} as const;

export const GAME_SFX_CONFIG = {
  pronunciation: {
    enabled: true,
    arcadeCombos: true,
    comboVolume: 0.9,
    comboMilestones: [
      {
        minStreak: 5,
        label: "COMBO BREAKER!",
        effect: "combo-breaker",
        src: "/sfx/pronunciation/combo_breaker.mp3",
      },
      {
        minStreak: 10,
        label: "ON FIRE!",
        effect: "on-fire",
        src: "/sfx/kefla-power-up.mp3",
      },
      {
        minStreak: 15,
        label: "MEGA STREAK!",
        effect: "mega-streak",
        src: "/sfx/kefla-power-up.mp3",
      },
    ],
  },
} as const;

export type GameSfxGame = keyof typeof GAME_SFX;
export type GameSfxId<G extends GameSfxGame = GameSfxGame> =
  keyof (typeof GAME_SFX)[G];

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (
        window as unknown as {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (Ctor) audioCtx = new Ctor();
  }
  return audioCtx;
}

function playTone(
  frequency: number,
  startOffset: number,
  duration: number,
  gainPeak: number,
  type: OscillatorType = "sine",
): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  void ctx.resume();
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, now + startOffset);
  gain.gain.linearRampToValueAtTime(gainPeak, now + startOffset + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(now + startOffset);
  oscillator.stop(now + startOffset + duration + 0.05);
}

function playSweep(
  fromFrequency: number,
  toFrequency: number,
  duration: number,
  gainPeak: number,
): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  void ctx.resume();
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(fromFrequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(toFrequency, now + duration);
  gain.gain.setValueAtTime(gainPeak, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.05);
}

function playSynthSfx(src: string): void {
  switch (src) {
    case "synth:pronunciation-hit-pop":
      playTone(523.25, 0, 0.5, 0.18);
      playTone(659.25, 0.015, 0.5, 0.16);
      playTone(783.99, 0.03, 0.5, 0.14);
      return;
    case "synth:pronunciation-miss-thunk":
      playSweep(220, 110, 0.25, 0.15);
      return;
    case "synth:pronunciation-replay-start":
      playTone(392, 0, 0.18, 0.12, "triangle");
      playTone(523.25, 0.08, 0.24, 0.14, "triangle");
      return;
    case "synth:pronunciation-complete-fanfare":
      playTone(523.25, 0, 0.3, 0.13, "triangle");
      playTone(659.25, 0.11, 0.32, 0.14, "triangle");
      playTone(783.99, 0.22, 0.42, 0.16, "triangle");
      playTone(1046.5, 0.36, 0.48, 0.13, "triangle");
      return;
    case "synth:pronunciation-heat-up":
      playSweep(330, 880, 0.42, 0.11);
      return;
    default:
      console.warn(" 🎮 [sfx] unknown synth", { src });
  }
}

function srcForPronunciationEffect(effect: string): string | undefined {
  switch (effect) {
    case "combo-breaker":
      return GAME_SFX.pronunciation.comboBreaker;
    case "on-fire":
      return GAME_SFX.pronunciation.onFire;
    case "mega-streak":
      return GAME_SFX.pronunciation.megaStreak;
    default:
      return undefined;
  }
}

function playSfxSource(
  src: string,
  meta: { game: string; id: string },
  volume = 0.85,
): boolean {
  if (src.startsWith("synth:")) {
    try {
      playSynthSfx(src);
      return true;
    } catch (error) {
      console.warn(" 🎮 [sfx] synth failed", { ...meta, error });
      return false;
    }
  }
  if (typeof Audio === "undefined") return false;
  try {
    const audio = new Audio(src);
    audio.volume = volume;
    void audio.play().catch((error: unknown) => {
      console.warn(" 🎮 [sfx] play failed", { ...meta, error });
    });
    return true;
  } catch (error) {
    console.warn(" 🎮 [sfx] create failed", { ...meta, error });
    return false;
  }
}

export function playGameSfx<G extends GameSfxGame>(
  game: G,
  id: GameSfxId<G>,
): boolean {
  const src = GAME_SFX[game][id] as string | undefined;
  if (!src) return false;
  return playSfxSource(src, { game, id: String(id) });
}

export function playPronunciationMilestoneSfx(streak: number): boolean {
  if (!GAME_SFX_CONFIG.pronunciation.enabled) return false;
  const milestone = GAME_SFX_CONFIG.pronunciation.comboMilestones.find(
    (item) => item.minStreak === streak,
  );
  if (!milestone) return false;
  const effect = milestone.effect;
  const src = milestone.src || srcForPronunciationEffect(effect);
  if (!src) return false;
  console.log(" 🎮 [sfx] [pronunciation] [milestone]", {
    streak,
    effect,
    src,
  });
  return playSfxSource(
    src,
    { game: "pronunciation", id: effect },
    GAME_SFX_CONFIG.pronunciation.comboVolume,
  );
}
