export type SparkOrbSfxId =
  | "charge"
  | "ready"
  | "launch"
  | "capturePull"
  | "captureShrink"
  | "captureLock"
  | "collected"
  | "miss";

export type SparkOrbSfxAudioMode = "synthetic" | "file";

export interface SparkOrbSfxOptions {
  audioMode?: SparkOrbSfxAudioMode;
  audioAssets?: Partial<Record<SparkOrbSfxId, string>>;
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
    if (context.state === "suspended") void context.resume();
    return context;
  } catch (error) {
    console.warn(" 🎮 [spark-orb-sfx] [context] [failed]", { error });
    return null;
  }
}

function playFileSfx(id: SparkOrbSfxId, options: SparkOrbSfxOptions): boolean {
  if (options.audioMode !== "file") return false;
  const src = options.audioAssets?.[id];
  if (!src || typeof Audio === "undefined") return false;

  try {
    const audio = new Audio(src);
    audio.volume = Math.max(0, Math.min(1, options.volume ?? 0.82));
    audio.currentTime = 0;
    const playResult = audio.play();
    if (playResult && typeof playResult.catch === "function") {
      void playResult.catch((error: unknown) => {
        console.warn(" 🎮 [spark-orb-sfx] [file] [failed]", { id, src, error });
      });
    }
    return true;
  } catch (error) {
    console.warn(" 🎮 [spark-orb-sfx] [file] [failed]", { id, src, error });
    return false;
  }
}

function closeLater(context: AudioContext, delayMs: number): void {
  window.setTimeout(() => {
    void context.close().catch((error: unknown) => {
      console.warn(" 🎮 [spark-orb-sfx] [close] [failed]", { error });
    });
  }, delayMs);
}

function tone(
  context: AudioContext,
  frequency: number,
  offset: number,
  duration: number,
  gainPeak: number,
  type: OscillatorType = "sine",
): void {
  const start = context.currentTime + offset;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.018);
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
): void {
  const start = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(fromFrequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(toFrequency, start + duration);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

export function playSparkOrbSfx(id: SparkOrbSfxId): void;
export function playSparkOrbSfx(id: SparkOrbSfxId, options?: SparkOrbSfxOptions): void;
export function playSparkOrbSfx(id: SparkOrbSfxId, options?: SparkOrbSfxOptions): void {
  if (options && playFileSfx(id, options)) return;

  const context = createAudioContext();
  if (!context) return;

  try {
    switch (id) {
      case "charge":
        tone(context, 523.25, 0, 0.22, 0.11, "triangle");
        tone(context, 783.99, 0.07, 0.26, 0.08);
        closeLater(context, 700);
        return;
      case "ready":
        [392, 523.25, 659.25, 987.77].forEach((frequency, index) => {
          tone(context, frequency, index * 0.055, 0.34, 0.075);
        });
        closeLater(context, 900);
        return;
      case "launch":
        sweep(context, 180, 980, 0.42, 0.12);
        tone(context, 1318.51, 0.24, 0.18, 0.055, "sine");
        closeLater(context, 900);
        return;
      case "capturePull":
        sweep(context, 320, 1120, 0.72, 0.105);
        tone(context, 1567.98, 0.34, 0.28, 0.045, "triangle");
        closeLater(context, 1100);
        return;
      case "captureShrink":
        [1396.91, 1174.66, 987.77, 783.99].forEach((frequency, index) => {
          tone(context, frequency, index * 0.05, 0.26, 0.07, "triangle");
        });
        closeLater(context, 900);
        return;
      case "captureLock":
        tone(context, 146.83, 0, 0.18, 0.14, "square");
        tone(context, 987.77, 0.08, 0.22, 0.08, "triangle");
        closeLater(context, 700);
        return;
      case "collected":
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
          tone(context, frequency, index * 0.08, 0.46, 0.09, "triangle");
        });
        closeLater(context, 1200);
        return;
      case "miss":
        sweep(context, 520, 120, 0.46, 0.095);
        tone(context, 98, 0.28, 0.2, 0.06, "sawtooth");
        closeLater(context, 900);
        return;
      default: {
        const exhaustive: never = id;
        console.warn(" 🎮 [spark-orb-sfx] [unknown] [ignored]", {
          id: exhaustive,
        });
      }
    }
  } catch (error) {
    console.warn(" 🎮 [spark-orb-sfx] [play] [failed]", { id, error });
    void context.close().catch((closeError: unknown) => {
      console.warn(" 🎮 [spark-orb-sfx] [close] [failed]", { error: closeError });
    });
  }
}
