export const GAME_SFX = {
  pronunciation: {
    comboBreaker: "/sfx/pronunciation/combo_breaker.mp3",
    hitPop: "synth:pronunciation-hit-pop",
    missThunk: "synth:pronunciation-miss-thunk",
    replayStart: "synth:pronunciation-replay-start",
    completeFanfare: "synth:pronunciation-complete-fanfare",
    heatUp: "synth:pronunciation-heat-up",
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

export function playGameSfx<G extends GameSfxGame>(
  game: G,
  id: GameSfxId<G>,
): void {
  const src = GAME_SFX[game][id] as string | undefined;
  if (!src) return;
  if (src.startsWith("synth:")) {
    try {
      playSynthSfx(src);
    } catch (error) {
      console.warn(" 🎮 [sfx] synth failed", { game, id, error });
    }
    return;
  }
  if (typeof Audio === "undefined") return;
  try {
    const audio = new Audio(src);
    audio.volume = 0.85;
    void audio.play().catch((error: unknown) => {
      console.warn(" 🎮 [sfx] play failed", { game, id, error });
    });
  } catch (error) {
    console.warn(" 🎮 [sfx] create failed", { game, id, error });
  }
}
