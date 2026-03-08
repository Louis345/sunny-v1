import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { spawn, ChildProcess } from "child_process";
import {
  setStreamVoiceId,
  createLiveStream,
  PlaybackHandle,
} from "./stream-speak";
import { runAgent } from "./agents/run";
import { connectFlux, FluxHandle } from "./deepgram-turn";
import type { Profile } from "./profiles";
import { ELLI } from "./companions/loader";
import { type ModelMessage } from "ai";

// Barge-in uses RMS so speaker echo doesn't fool Flux.
// Calibrates against actual speaker output, then requires voice ABOVE that level.
const BARGE_IN_FLOOR = 800;
const BARGE_IN_GUARD_MS = 500;
const BARGE_IN_CONSECUTIVE_NEEDED = 15;
const BARGE_IN_THRESHOLD_MULTIPLIER = 1.2;
const CALIBRATION_MS = 1500;

enum State {
  SPEAKING,
  CALIBRATING,
  LISTENING,
  PROCESSING,
}

let state: State = State.PROCESSING;
let currentPlayback: PlaybackHandle | null = null;
let currentAbort: AbortController | null = null;
let roundNumber = 0;
let consecutiveHits = 0;
let speakingStartTime = 0;
let bargeThreshold = BARGE_IN_FLOOR;
let calibrationSamples: number[] = [];
let calibrationStart = 0;
let calibrated = false;

const history: ModelMessage[] = [];

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

function calcRms(chunk: Buffer): number {
  const samples = Math.floor(chunk.length / 2);
  if (samples === 0) return 0;
  let sum = 0;
  for (let i = 0; i + 1 < chunk.length; i += 2) {
    const s = chunk.readInt16LE(i);
    sum += s * s;
  }
  return Math.sqrt(sum / samples);
}

async function streamAndSpeak(
  userText: string,
  claudeStart: number,
): Promise<void> {
  state = State.PROCESSING;
  consecutiveHits = 0;

  const tts = createLiveStream(() => {
    console.log(
      `  ⏱️  [${ts()}] First audio (${Date.now() - claudeStart}ms from Claude call)`,
    );
    if (!calibrated) {
      state = State.CALIBRATING;
      calibrationSamples = [];
      calibrationStart = Date.now();
      console.log(
        `  🔧 Calibrating speaker bleed (${CALIBRATION_MS / 1000}s)...`,
      );
    } else {
      state = State.SPEAKING;
      speakingStartTime = Date.now();
    }
  });

  currentPlayback = tts;
  const abort = new AbortController();
  currentAbort = abort;

  let response: string;
  try {
    response = await runAgent({
      history,
      userMessage: userText,
      profile: ELLI,
      onToken: (token) => tts.sendText(token),
      signal: abort.signal,
    });
  } catch (err: any) {
    if (abort.signal.aborted) return;
    throw err;
  }

  history.push({ role: "user", content: userText });
  history.push({ role: "assistant", content: response });
  tts.finish();
  currentAbort = null;

  const claudeMs = Date.now() - claudeStart;
  console.log(`  ⏱️  [${ts()}] Claude done streaming (${claudeMs}ms)`);
  console.log(`\n  🌟 Elli: ${response}\n`);

  tts.done.then(() => {
    if (state !== State.SPEAKING) return;
    console.log(`\n  💬 Elli finished. Your turn, Ila!\n`);
    state = State.LISTENING;
  });
}

function finishCalibration(): void {
  if (calibrationSamples.length > 0) {
    const sorted = [...calibrationSamples].sort((a, b) => a - b);
    const avg =
      calibrationSamples.reduce((a, b) => a + b, 0) / calibrationSamples.length;
    const p95idx = Math.ceil(0.95 * sorted.length) - 1;
    const p95 = sorted[Math.max(0, p95idx)];
    bargeThreshold = Math.max(BARGE_IN_FLOOR, Math.round(p95 * 2));
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

function handleBargeIn(): void {
  if (state !== State.SPEAKING) return;

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
    console.log(`  ✅ Elli stopped within 200ms (${killMs}ms)`);
  } else {
    console.log(`  ❌ Took ${killMs}ms to stop (target: ≤200ms)`);
  }
  console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n  🎤 Listening to Ila...\n`);

  state = State.LISTENING;
}

function handleEndOfTurn(transcript: string): void {
  if (state === State.PROCESSING) return;

  if (!transcript.trim()) {
    console.log("  ⚠️  Couldn't make that out. Still listening...\n");
    state = State.LISTENING;
    return;
  }

  state = State.PROCESSING;

  console.log(`  ⏱️  [${ts()}] Deepgram EndOfTurn`);
  console.log(`  🗣️  Ila said: "${transcript}"\n`);

  roundNumber++;
  console.log(`  ── Round ${roundNumber} ──────────────────────────────`);
  console.log(`  🌟 Elli is thinking + speaking...`);

  const claudeStart = Date.now();
  streamAndSpeak(transcript, claudeStart).catch(console.error);
}

function startMic(): ChildProcess {
  const proc = spawn(
    "ffmpeg",
    [
      "-f",
      "avfoundation",
      "-i",
      ":0",
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

async function main(): Promise<void> {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║                                                  ║");
  console.log("║     🌟  ELLI — Ila's Companion (Flux)  🌟       ║");
  console.log("║                                                  ║");
  console.log("║  Deepgram Flux + RMS barge-in (hybrid)            ║");
  console.log("║  Elli will talk. Interrupt anytime!               ║");
  console.log("║  Real conversation — barge in all you want.      ║");
  console.log("║                                                  ║");
  console.log("║  Press Ctrl+C to exit.                           ║");
  console.log("║                                                  ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  setStreamVoiceId(ELLI.voiceId);
  console.log(`  Voice: ${ELLI.voiceId}`);
  console.log(
    `  Turn detection: Deepgram Flux (listening) + RMS barge-in (speaking)\n`,
  );

  const micProc = startMic();

  console.log("  🔌 Connecting to Deepgram Flux...");
  const flux: FluxHandle = await connectFlux({
    onOpen() {
      console.log("  ✅ Deepgram Flux connected\n");
    },
    onStartOfTurn() {
      if (state === State.LISTENING) {
        console.log(`  🎤 [${ts()}] Ila started speaking`);
      }
    },
    onInterim(transcript) {
      if (state === State.LISTENING) {
        process.stdout.write(`\r  🎤 hearing: "${transcript}"  `);
      }
    },
    onEagerEndOfTurn(transcript) {
      if (state === State.LISTENING && transcript.trim()) {
        process.stdout.write(`\r  ⚡ eager: "${transcript}"  \n`);
      }
    },
    onTurnResumed() {
      if (state === State.PROCESSING) {
        console.log(`  ↩️  Turn resumed — still listening`);
        state = State.LISTENING;
      }
    },
    onEndOfTurn(transcript) {
      process.stdout.write("\n");
      handleEndOfTurn(transcript);
    },
    onError(err) {
      console.error("  🔴 Deepgram error:", err.message);
    },
  });

  let armed = false;
  setTimeout(() => {
    armed = true;
  }, 300);

  micProc.stdout!.on("data", (chunk: Buffer) => {
    if (!armed) return;
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
        flux.sendAudio(chunk);
        break;

      case State.PROCESSING:
        break;
    }
  });

  process.on("SIGINT", () => {
    console.log(
      "\n\n  🌟 Elli: Bye Ila! You did amazing today. I'm so proud of you!\n",
    );
    currentAbort?.abort();
    currentPlayback?.stop();
    flux.close();
    micProc.kill();
    process.exit(0);
  });

  console.log("  🌟 Elli is thinking + speaking...");
  const claudeStart = Date.now();
  await streamAndSpeak(ELLI.openingLine, claudeStart);
}

main().catch((err) => {
  console.error("  Fatal:", err);
  process.exit(1);
});
