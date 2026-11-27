import type { SensoryProfile } from "../../../src/shared/sensoryProfile";
import { GAME_SFX, getGameSfxSensory, getSharedAudioContext, playSfxFile, playSynth, sfxOutput } from "./gameSfx";

export type SparkOrbSfxId =
  | "charge"
  | "ready"
  | "grab"
  | "launch"
  | "impact"
  | "perfect"
  | "chirp"
  | "capturePull"
  | "captureShrink"
  | "captureLock"
  | "collected"
  | "miss";

/** file = only the given audioAssets; synthetic = never files; unset = registry files for big moments, synth for the rest. */
export type SparkOrbSfxAudioMode = "synthetic" | "file";

export interface SparkOrbSfxOptions {
  audioMode?: SparkOrbSfxAudioMode;
  audioAssets?: Partial<Record<SparkOrbSfxId, string>>;
  volume?: number;
  /** The child's sensory sheet from the chart; the kiosk's current sheet when absent. */
  sensory?: SensoryProfile;
}

export interface SparkOrbPullTone {
  /** 0..1 how far the orb is pulled back. */
  update(strength: number): void;
  stop(): void;
}

const DEFAULT_FILE_VOLUME = 0.82;
const PITCH_VARIATION = 0.06;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Small random detune so repeated sounds never feel copy-pasted. */
function pitchJitter(): number {
  return 1 + (Math.random() * 2 - 1) * PITCH_VARIATION;
}

function fileSourceFor(id: SparkOrbSfxId, options: SparkOrbSfxOptions): string | undefined {
  if (options.audioMode === "synthetic") return undefined;
  const asset = options.audioAssets?.[id];
  if (asset) return asset;
  if (options.audioMode === "file") return undefined;
  return (GAME_SFX.sparkOrb as Partial<Record<SparkOrbSfxId, string>>)[id];
}

function tone(
  context: AudioContext,
  out: AudioNode,
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
  oscillator.connect(gain).connect(out);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.04);
}

function sweep(
  context: AudioContext,
  out: AudioNode,
  fromFrequency: number,
  toFrequency: number,
  duration: number,
  gainPeak: number,
  offset = 0,
  type: OscillatorType = "triangle",
): void {
  const start = context.currentTime + offset;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(fromFrequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(toFrequency, start + duration);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain).connect(out);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

/** Filtered noise with a moving band: the "air" in a whoosh or the body of a thump. */
function noise(
  context: AudioContext,
  out: AudioNode,
  duration: number,
  fromHz: number,
  toHz: number,
  gainPeak: number,
): void {
  const start = context.currentTime;
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.2;
  band.frequency.setValueAtTime(fromHz, start);
  band.frequency.exponentialRampToValueAtTime(toHz, start + duration);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(gainPeak, start + duration * 0.35);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.connect(band).connect(gain).connect(out);
  source.start(start);
  source.stop(start + duration + 0.02);
}

function playOrbSynth(id: SparkOrbSfxId, context: AudioContext, out: AudioNode): void {
  const p = pitchJitter();
  switch (id) {
    case "charge":
      tone(context, out, 523.25 * p, 0, 0.22, 0.11, "triangle");
      tone(context, out, 783.99 * p, 0.07, 0.26, 0.08);
      return;
    case "ready":
      [392, 523.25, 659.25, 987.77].forEach((frequency, index) => {
        tone(context, out, frequency * p, index * 0.055, 0.34, 0.075);
      });
      return;
    case "grab":
      sweep(context, out, 360 * p, 720 * p, 0.09, 0.09, 0, "sine");
      tone(context, out, 880 * p, 0.05, 0.08, 0.04, "triangle");
      return;
    case "launch":
      noise(context, out, 0.55, 500 * p, 2_600 * p, 0.32);
      sweep(context, out, 220 * p, 760 * p, 0.38, 0.05);
      return;
    case "impact":
      sweep(context, out, 170 * p, 52, 0.26, 0.3, 0, "sine");
      noise(context, out, 0.12, 900, 260, 0.22);
      tone(context, out, 1567.98 * p, 0.05, 0.3, 0.04, "triangle");
      tone(context, out, 2093 * p, 0.1, 0.32, 0.03, "sine");
      return;
    case "perfect":
      [1046.5, 1318.51, 1567.98, 2093].forEach((frequency, index) => {
        tone(context, out, frequency * p, index * 0.045, 0.28, 0.06, "triangle");
      });
      return;
    case "chirp": {
      const voice = 1 + (Math.random() * 2 - 1) * 0.12;
      sweep(context, out, 880 * voice, 1_480 * voice, 0.09, 0.05, 0, "sine");
      sweep(context, out, 1_180 * voice, 1_760 * voice, 0.08, 0.04, 0.11, "sine");
      return;
    }
    case "capturePull":
      sweep(context, out, 320 * p, 1_120 * p, 0.72, 0.105);
      tone(context, out, 1567.98 * p, 0.34, 0.28, 0.045, "triangle");
      return;
    case "captureShrink":
      [1396.91, 1174.66, 987.77, 783.99].forEach((frequency, index) => {
        tone(context, out, frequency * p, index * 0.05, 0.26, 0.07, "triangle");
      });
      return;
    case "captureLock":
      tone(context, out, 146.83 * p, 0, 0.18, 0.14, "square");
      tone(context, out, 987.77 * p, 0.08, 0.22, 0.08, "triangle");
      return;
    case "collected":
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
        tone(context, out, frequency * p, index * 0.08, 0.46, 0.09, "triangle");
      });
      return;
    case "miss":
      sweep(context, out, 520 * p, 120, 0.46, 0.095);
      tone(context, out, 98, 0.28, 0.2, 0.06, "sawtooth");
      return;
    default: {
      const exhaustive: never = id;
      console.warn(" 🎮 [spark-orb-sfx] [unknown] [ignored]", { id: exhaustive });
    }
  }
}

export function playSparkOrbSfx(id: SparkOrbSfxId, options: SparkOrbSfxOptions = {}): void {
  const sensory = options.sensory ?? getGameSfxSensory();
  const src = fileSourceFor(id, options);
  const label = `spark-orb:${id}`;
  if (src && playSfxFile(src, { label, volume: options.volume ?? DEFAULT_FILE_VOLUME, rate: pitchJitter(), sensory })) return;
  playSynth(label, (context, out) => playOrbSynth(id, context, out), sensory);
}

/** A held tone that rises as the child pulls the orb back, like a stretching band. */
export function startSparkOrbPullTone(options: SparkOrbSfxOptions = {}): SparkOrbPullTone | null {
  const sensory = options.sensory ?? getGameSfxSensory();
  if (!sensory.soundEnabled || sensory.soundVolume <= 0) return null;
  const context = getSharedAudioContext();
  if (!context) return null;
  try {
    const out = sfxOutput(context, sensory, 0.6);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = 180;
    oscillator.frequency.setValueAtTime(180, context.currentTime);
    gain.gain.value = 0.001;
    gain.gain.setValueAtTime(0.001, context.currentTime);
    oscillator.connect(gain).connect(out);
    oscillator.start();
    let stopped = false;
    return {
      update(strength: number) {
        if (stopped) return;
        const amount = clamp01(strength);
        const now = context.currentTime;
        oscillator.frequency.setTargetAtTime(180 + amount * 520, now, 0.03);
        gain.gain.setTargetAtTime(0.012 + amount * 0.05, now, 0.04);
      },
      stop() {
        if (stopped) return;
        stopped = true;
        const now = context.currentTime;
        gain.gain.setTargetAtTime(0.001, now, 0.03);
        oscillator.stop(now + 0.12);
      },
    };
  } catch (error) {
    console.warn(" 🎮 [spark-orb-sfx] [pull-tone] [failed]", { error });
    return null;
  }
}
