import type { HatchHuntEventType, HatchHuntPhase } from "./HatchHuntEngine";

export type HatchSoundId =
  | "awaken"
  | "crack"
  | "reseal"
  | "heartbeat"
  | "recovery"
  | "hatch"
  | "orb-flight"
  | "capture-impact"
  | "capture-pull"
  | "capture-lock"
  | "capture-complete";

export interface HatchHuntMotionFrame {
  wobbleAmplitude: number;
  bobAmplitude: number;
  lightIntensity: number;
  heartbeatTempo: number;
  shellSpread: number;
  emergence: number;
}

export type MossyEscapeStage = "hatching" | "reacting" | "escaping" | "handoff-ready";

export interface MossyEscapeMotionFrame {
  positionX: number;
  positionY: number;
  positionZ: number;
  rotationY: number;
  depthProgress: number;
  runBounce: number;
  cameraPositionZ: number;
  cameraTargetX: number;
  cameraTargetZ: number;
}

export type MossyCaptureStage =
  | "targeting"
  | "orb-flight"
  | "impact"
  | "pull"
  | "lock"
  | "capture-complete";

export interface MossyCaptureMotionFrame {
  targetX: number;
  orbProgress: number;
  creatureScale: number;
  creatureLift: number;
  impactRingScale: number;
  impactRingOpacity: number;
  lockPulse: number;
  orbLocked: boolean;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

export function mossyEscapeMotionFrame({
  stage,
  seconds,
}: {
  stage: MossyEscapeStage;
  seconds: number;
}): MossyEscapeMotionFrame {
  const depthProgress = stage === "handoff-ready"
    ? 1
    : stage === "escaping"
      ? smoothstep(seconds / 1.65)
      : 0;
  const running = stage === "escaping" && depthProgress < 1;
  const runBounce = running
    ? Math.abs(Math.sin(seconds * 7.4)) * 0.075 * (1 - depthProgress * 0.45)
    : 0;
  const reactingTurn = stage === "reacting"
    ? 0.34 + Math.sin(Math.min(seconds, 0.85) * 4.2) * 0.12
    : 0;
  const runningTurn = running
    ? Math.sin(seconds * 5.2) * 0.1 * (1 - depthProgress)
    : 0;
  return {
    positionX: 0,
    positionY: 0.1 + runBounce,
    positionZ: -depthProgress * 2.85,
    rotationY: reactingTurn + runningTurn,
    depthProgress,
    runBounce,
    cameraPositionZ: 10.5 - depthProgress * 1.8,
    cameraTargetX: 0,
    cameraTargetZ: -depthProgress * 1.35,
  };
}

export function mossyCaptureMotionFrame({
  stage,
  seconds,
}: {
  stage: MossyCaptureStage;
  seconds: number;
}): MossyCaptureMotionFrame {
  const orbProgress = stage === "targeting"
    ? 0
    : stage === "orb-flight"
      ? smoothstep(seconds / 0.9)
      : 1;
  const pullProgress = stage === "pull"
    ? smoothstep(seconds / 1.05)
    : ["lock", "capture-complete"].includes(stage)
      ? 1
      : 0;
  const impactProgress = stage === "impact" ? smoothstep(seconds / 0.52) : 0;
  const lockProgress = stage === "lock" ? clamp01(seconds / 1.2) : 0;
  return {
    targetX: 0,
    orbProgress,
    creatureScale: 1 - pullProgress,
    creatureLift: pullProgress * 0.62,
    impactRingScale: stage === "impact" ? 0.35 + impactProgress * 2.4 : 0,
    impactRingOpacity: stage === "impact" ? 1 - impactProgress : 0,
    lockPulse: stage === "lock"
      ? Math.sin(lockProgress * Math.PI * 6) * (1 - lockProgress) * 0.12
      : 0,
    orbLocked: stage === "capture-complete",
  };
}

export function captureSoundForStage(stage: MossyCaptureStage): HatchSoundId | null {
  switch (stage) {
    case "targeting":
      return null;
    case "orb-flight":
      return "orb-flight";
    case "impact":
      return "capture-impact";
    case "pull":
      return "capture-pull";
    case "lock":
      return "capture-lock";
    case "capture-complete":
      return "capture-complete";
  }
}

export function hatchHuntMotionFrame({
  phase,
  crackCount,
  seconds,
  reducedMotion,
}: {
  phase: HatchHuntPhase;
  crackCount: number;
  seconds: number;
  reducedMotion: boolean;
}): HatchHuntMotionFrame {
  const boundedCracks = Math.max(0, Math.min(3, crackCount));
  const hatching = phase === "hatched";
  const shellSpread = hatching
    ? reducedMotion
      ? 1
      : smoothstep(seconds / 1.05)
    : 0;
  const emergence = hatching
    ? reducedMotion
      ? 1
      : smoothstep((seconds - 0.2) / 1.3)
    : 0;
  return {
    wobbleAmplitude: reducedMotion ? 0 : 0.022 + boundedCracks * 0.022,
    bobAmplitude: reducedMotion ? 0 : 0.018 + boundedCracks * 0.009,
    lightIntensity: 13 + boundedCracks * 7 + (hatching ? 12 : 0),
    heartbeatTempo: 76 + boundedCracks * 18,
    shellSpread,
    emergence,
  };
}

export function hatchSoundForEvent(
  eventType: HatchHuntEventType,
): HatchSoundId | null {
  switch (eventType) {
    case "egg_selected":
      return "awaken";
    case "shell_cracked":
      return "crack";
    case "shell_resealed":
      return "reseal";
    case "rescue_started":
      return "heartbeat";
    case "rescue_recovered":
      return "recovery";
    case "egg_hatched":
      return "hatch";
    default:
      return null;
  }
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
        console.warn(" 🎮 [hatch-hunt-sfx] [resume] [failed]", { error });
      });
    }
    return context;
  } catch (error) {
    console.warn(" 🎮 [hatch-hunt-sfx] [context] [failed]", { error });
    return null;
  }
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
  oscillator.stop(start + duration + 0.03);
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
  gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.04);
}

function closeContext(context: AudioContext, delayMs: number): void {
  window.setTimeout(() => {
    void context.close().catch((error: unknown) => {
      console.warn(" 🎮 [hatch-hunt-sfx] [close] [failed]", { error });
    });
  }, delayMs);
}

export function playHatchHuntSfx(id: HatchSoundId): void {
  const context = createAudioContext();
  if (!context) return;
  try {
    switch (id) {
      case "awaken":
        tone(context, 392, 0, 0.24, 0.055, "triangle");
        tone(context, 659.25, 0.08, 0.32, 0.07);
        closeContext(context, 720);
        break;
      case "crack":
        tone(context, 118, 0, 0.13, 0.11, "square");
        tone(context, 987.77, 0.055, 0.26, 0.075, "triangle");
        tone(context, 1567.98, 0.13, 0.3, 0.04);
        closeContext(context, 760);
        break;
      case "reseal":
        sweep(context, 620, 155, 0.48, 0.075);
        tone(context, 110, 0.3, 0.2, 0.045, "sawtooth");
        closeContext(context, 850);
        break;
      case "heartbeat":
        tone(context, 72, 0, 0.16, 0.11, "sine");
        tone(context, 64, 0.19, 0.2, 0.085, "sine");
        closeContext(context, 700);
        break;
      case "recovery":
        [392, 523.25, 783.99].forEach((frequency, index) => {
          tone(context, frequency, index * 0.09, 0.4, 0.065, "triangle");
        });
        closeContext(context, 900);
        break;
      case "hatch":
        sweep(context, 220, 1320, 0.75, 0.095);
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
          tone(context, frequency, 0.28 + index * 0.1, 0.62, 0.075, "triangle");
        });
        closeContext(context, 1_500);
        break;
      case "orb-flight":
        sweep(context, 240, 1_180, 0.62, 0.085);
        tone(context, 1567.98, 0.42, 0.26, 0.045, "triangle");
        closeContext(context, 1_050);
        break;
      case "capture-impact":
        tone(context, 92, 0, 0.28, 0.13, "sine");
        tone(context, 1318.51, 0.025, 0.38, 0.09, "triangle");
        tone(context, 1975.53, 0.11, 0.3, 0.045);
        closeContext(context, 820);
        break;
      case "capture-pull":
        sweep(context, 1_280, 190, 0.86, 0.075);
        tone(context, 146.83, 0.58, 0.4, 0.055, "sine");
        closeContext(context, 1_250);
        break;
      case "capture-lock":
        [392, 329.63, 261.63].forEach((frequency, index) => {
          tone(context, frequency, index * 0.31, 0.22, 0.085, "triangle");
          tone(context, frequency * 2, index * 0.31 + 0.025, 0.16, 0.035);
        });
        closeContext(context, 1_350);
        break;
      case "capture-complete":
        [261.63, 392, 523.25, 783.99].forEach((frequency, index) => {
          tone(context, frequency, index * 0.08, 0.72, 0.065, "triangle");
        });
        closeContext(context, 1_400);
        break;
    }
    console.info(" 🎮 [hatch-hunt-sfx] [play] [ok]", { id });
  } catch (error) {
    console.warn(" 🎮 [hatch-hunt-sfx] [play] [failed]", { id, error });
    void context.close().catch((closeError: unknown) => {
      console.warn(" 🎮 [hatch-hunt-sfx] [close] [failed]", {
        error: closeError,
      });
    });
  }
}
