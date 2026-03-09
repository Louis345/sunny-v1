import { spawn, ChildProcess } from "child_process";
import type { PlaybackHandle } from "../stream-speak";

// Barge-in uses RMS so speaker echo doesn't fool Flux.
// Calibrates against actual speaker output, then requires voice ABOVE that level.
export const BARGE_IN_FLOOR = 200;
export const BARGE_IN_GUARD_MS = 500;
export const BARGE_IN_CONSECUTIVE_NEEDED = 15;
export const BARGE_IN_THRESHOLD_MULTIPLIER = 1.2;
export const CALIBRATION_MS = 1500;

export enum State {
  SPEAKING,
  CALIBRATING,
  LISTENING,
  PROCESSING,
}

let state: State = State.PROCESSING;
let currentPlayback: PlaybackHandle | null = null;
let currentAbort: AbortController | null = null;
let consecutiveHits = 0;
let speakingStartTime = 0;
let bargeThreshold = BARGE_IN_FLOOR;
let calibrationSamples: number[] = [];
let calibrationStart = 0;
let calibrated = false;
let sessionLabels: { companionName?: string; childName?: string } = {};

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

export function calcRms(chunk: Buffer): number {
  const samples = Math.floor(chunk.length / 2);
  if (samples === 0) return 0;
  let sum = 0;
  for (let i = 0; i + 1 < chunk.length; i += 2) {
    const s = chunk.readInt16LE(i);
    sum += s * s;
  }
  return Math.sqrt(sum / samples);
}

export function startMic(): ChildProcess {
  const proc = spawn(
    "ffmpeg",
    [
      "-f",
      "avfoundation",
      "-i",
      `:${process.env.AUDIO_DEVICE_INDEX ?? "0"}`,
      "-f",
      "s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-loglevel",
      "quiet",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "ignore"] },
  );

  proc.on("error", (err) => {
    console.error("  Mic error:", err.message);
    process.exit(1);
  });

  return proc;
}

export function setSessionLabels(labels: {
  companionName?: string;
  childName?: string;
}): void {
  sessionLabels = labels;
}

export function getState(): State {
  return state;
}

export function setState(s: State): void {
  state = s;
}

export function setCurrentPlayback(p: PlaybackHandle | null): void {
  currentPlayback = p;
}

export function setCurrentAbort(a: AbortController | null): void {
  currentAbort = a;
}

export function cleanupPlayback(): void {
  currentAbort?.abort();
  currentAbort = null;
  currentPlayback?.stop();
  currentPlayback = null;
}

export function getCalibrated(): boolean {
  return calibrated;
}

export function resetConsecutiveHits(): void {
  consecutiveHits = 0;
}

export function startCalibration(): void {
  state = State.CALIBRATING;
  calibrationSamples = [];
  calibrationStart = Date.now();
  console.log(
    `  🔧 Calibrating speaker bleed (${CALIBRATION_MS / 1000}s)...`,
  );
}

export function startSpeaking(): void {
  state = State.SPEAKING;
  speakingStartTime = Date.now();
}

export function finishCalibration(): void {
  if (calibrationSamples.length > 0) {
    const sorted = [...calibrationSamples].sort((a, b) => a - b);
    const avg =
      calibrationSamples.reduce((a, b) => a + b, 0) / calibrationSamples.length;
    const p95idx = Math.ceil(0.95 * sorted.length) - 1;
    const p95 = sorted[Math.max(0, p95idx)];
    bargeThreshold = Math.max(BARGE_IN_FLOOR, Math.round(p95 * 0.8));
    console.log(
      `  🔧 Calibrated — speaker bleed avg: ${Math.round(avg)}, P95: ${Math.round(p95)}, barge-in threshold: ${bargeThreshold} RMS`,
    );
  } else {
    bargeThreshold = BARGE_IN_FLOOR;
  }
  calibrated = true;
  state = State.SPEAKING;
  speakingStartTime = Date.now();
}

export function handleBargeIn(): void {
  if (state !== State.SPEAKING) return;

  const comp = sessionLabels.companionName ?? "Companion";
  const child = sessionLabels.childName ?? "child";

  console.log(`\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  🛑 BARGE-IN DETECTED at [${ts()}]`);

  const t0 = Date.now();
  currentAbort?.abort();
  currentAbort = null;
  currentPlayback?.stop();
  currentPlayback = null;
  const killMs = Date.now() - t0;

  console.log(`  ⏱️  Playback killed in ${killMs}ms`);
  if (killMs <= 200) {
    console.log(`  ✅ ${comp} stopped within 200ms (${killMs}ms)`);
  } else {
    console.log(`  ❌ Took ${killMs}ms to stop (target: ≤200ms)`);
  }
  console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n  🎤 Listening to ${child}...\n`);

  state = State.LISTENING;
}

export function processAudioChunk(
  chunk: Buffer,
  sendToFlux: (chunk: Buffer) => void,
): void {
  const rms = calcRms(chunk);

  switch (state) {
    case State.CALIBRATING:
      calibrationSamples.push(rms);
      if (Date.now() - calibrationStart >= CALIBRATION_MS) {
        finishCalibration();
      }
      break;

    case State.SPEAKING: {
      const effectiveThreshold = Math.round(
        bargeThreshold * BARGE_IN_THRESHOLD_MULTIPLIER,
      );
      const hit = rms > effectiveThreshold;
      if (Date.now() - speakingStartTime < BARGE_IN_GUARD_MS) {
        consecutiveHits = 0;
        break;
      }
      if (hit) {
        consecutiveHits++;
        process.stdout.write(
          `\r  🎤 RMS ${Math.round(rms)} / ${effectiveThreshold} | ${consecutiveHits}/${BARGE_IN_CONSECUTIVE_NEEDED}  `,
        );
        if (consecutiveHits >= BARGE_IN_CONSECUTIVE_NEEDED) {
          process.stdout.write("\n");
          handleBargeIn();
        }
      } else {
        consecutiveHits = 0;
      }
      break;
    }

    case State.LISTENING:
      sendToFlux(chunk);
      break;

    case State.PROCESSING:
      break;
  }
}
