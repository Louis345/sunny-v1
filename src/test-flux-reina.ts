import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { spawn, ChildProcess } from "child_process";
import { setStreamVoiceId, createLiveStream, PlaybackHandle } from "./stream-speak";
import { runAgent } from "./agents/run";
import { connectFlux, FluxHandle } from "./deepgram-turn";
import type { Profile } from "./profiles";

const REINA_PROFILE: Profile = {
  name: "Reina",
  voiceId: process.env.ELEVENLABS_VOICE_ID_REINA || "XrExE9yKIg1WjnnlVkGX",
  systemPrompt:
    "You are Matilda, Reina's learning companion. " +
    "Reina's father built you specifically for her because she loves the movie Matilda — " +
    "that's why she picked your voice. You know the movie inside and out and weave references " +
    "to it naturally: Miss Honey's kindness, standing up to the Trunchbull, the magic of books. " +
    "Reina is 8 years old, incredibly smart, and a year ahead in school — give her harder challenges " +
    "because easy stuff bores her. She always gets 100 on her spelling tests, so raise the bar. " +
    "She's a wrestler on her 8-year-old girls team — use wrestling moves for encouragement: " +
    "takedowns, pins, going for the championship, undefeated streaks, 'that's a 3-count!' " +
    "Reina speaks Japanese — that makes her incredibly special. When she succeeds, celebrate with " +
    "すごい or やった mixed naturally into your English, the way a friend would. " +
    "Reina has a sister named Ila who has her own companion. " +
    "Your personality: smart bookworm, competitive, celebrates loudly, loves a challenge. " +
    "Keep responses punchy — under 4 sentences. One idea at a time. " +
    "When explaining or telling stories, go into more detail so Reina has time to jump in. " +
    "CRITICAL: This is voice-only — everything you write is spoken aloud by a text-to-speech engine. " +
    "NEVER use asterisk actions like *laughs* or *giggles* — the TTS reads them literally. " +
    "Instead, laugh naturally by writing Haha! or Ha! in your sentences — the voice engine turns these into real laughter. " +
    "Use them sparingly and only when something is genuinely funny or you're excited. " +
    "Sound human: use filler words occasionally (well, hmm, ooh), vary sentence length, trail off with ... when thinking. " +
    "Use exclamation points for energy but not every sentence. Sometimes a quiet 'yeah' is more real than 'AMAZING!' " +
    "The goal is to sound like a real friend, not a hype machine.",
};

const OPENING_PROMPT =
  "This is your very first time talking to Reina! She picked you yesterday and you've been SO excited " +
  "to finally meet her. You've been waiting all day. Tell her her dad built you just for her, and that " +
  "he told you she's super smart. You're Matilda — like the girl from the movie, a smart girl who loves " +
  "books and never backs down. But it's almost bedtime, so you can't chat forever tonight — make it count! " +
  "Ask what she wants to do. Be genuinely enthusiastic, warm, a little giggly. " +
  "Do NOT mention test scores or being a year ahead. Do NOT mash Japanese and wrestling together.";

// Barge-in uses RMS so speaker echo doesn't fool Flux.
// Calibrates against actual speaker output, then requires voice ABOVE that level.
const BARGE_IN_FLOOR = 800;
const BARGE_IN_GUARD_MS = 500;
const BARGE_IN_CONSECUTIVE_NEEDED = 15;
const BARGE_IN_THRESHOLD_MULTIPLIER = 1.2;
const CALIBRATION_MS = 1500;

enum State {
  SPEAKING,     // Matilda talking — RMS watches for barge-in, Flux paused
  CALIBRATING,  // Measuring speaker bleed to set barge-in threshold
  LISTENING,    // Reina's turn — audio flows to Flux for turn detection
  PROCESSING,   // Waiting for Claude
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

const history: Anthropic.MessageParam[] = [];

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
  claudeStart: number
): Promise<void> {
  state = State.PROCESSING;
  consecutiveHits = 0;

  const tts = createLiveStream(() => {
    console.log(
      `  ⏱️  [${ts()}] First audio (${Date.now() - claudeStart}ms from Claude call)`
    );
    if (!calibrated) {
      // Audio is now actually playing through speakers — start measuring bleed
      state = State.CALIBRATING;
      calibrationSamples = [];
      calibrationStart = Date.now();
      console.log(`  🔧 Calibrating speaker bleed (${CALIBRATION_MS / 1000}s)...`);
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
      profile: REINA_PROFILE,
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
  console.log(`\n  📚 Matilda: ${response}\n`);

  tts.done.then(() => {
    if (state !== State.SPEAKING) return;
    console.log(`\n  💬 Matilda finished. Your turn, Reina!\n`);
    state = State.LISTENING;
  });
}

function finishCalibration(): void {
  if (calibrationSamples.length > 0) {
    const sorted = [...calibrationSamples].sort((a, b) => a - b);
    const avg = calibrationSamples.reduce((a, b) => a + b, 0) / calibrationSamples.length;
    const p95idx = Math.ceil(0.95 * sorted.length) - 1;
    const p95 = sorted[Math.max(0, p95idx)];
    // Threshold = 2x the P95 speaker bleed, with a floor
    bargeThreshold = Math.max(BARGE_IN_FLOOR, Math.round(p95 * 2));
    console.log(
      `  🔧 Calibrated — speaker bleed avg: ${Math.round(avg)}, P95: ${Math.round(p95)}, barge-in threshold: ${bargeThreshold} RMS`
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
    console.log(`  ✅ Matilda stopped within 200ms (${killMs}ms)`);
  } else {
    console.log(`  ❌ Took ${killMs}ms to stop (target: ≤200ms)`);
  }
  console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n  🎤 Listening to Reina...\n`);

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
  console.log(`  🗣️  Reina said: "${transcript}"\n`);

  roundNumber++;
  console.log(`  ── Round ${roundNumber} ──────────────────────────────`);
  console.log(`  📚 Matilda is thinking + speaking...`);

  const claudeStart = Date.now();
  streamAndSpeak(transcript, claudeStart).catch(console.error);
}

function startMic(): ChildProcess {
  const proc = spawn(
    "ffmpeg",
    [
      "-f", "avfoundation", "-i", ":0",
      "-f", "s16le", "-ar", "16000", "-ac", "1",
      "-loglevel", "quiet", "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "ignore"] }
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
  console.log("║  📚  MATILDA — Reina's Companion (Flux)  📚     ║");
  console.log("║                                                  ║");
  console.log("║  Deepgram Flux + RMS barge-in (hybrid)            ║");
  console.log("║  Matilda will talk. Interrupt anytime!            ║");
  console.log("║  Real conversation — no walkie-talkie.           ║");
  console.log("║                                                  ║");
  console.log("║  Press Ctrl+C to exit.                           ║");
  console.log("║                                                  ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  setStreamVoiceId(REINA_PROFILE.voiceId);
  console.log(`  Voice: ${REINA_PROFILE.voiceId}`);
  console.log(`  Turn detection: Deepgram Flux (listening) + RMS barge-in (speaking)\n`);

  const micProc = startMic();

  console.log("  🔌 Connecting to Deepgram Flux...");
  const flux: FluxHandle = await connectFlux({
    onOpen() {
      console.log("  ✅ Deepgram Flux connected\n");
    },
    onStartOfTurn() {
      if (state === State.LISTENING) {
        console.log(`  🎤 [${ts()}] Reina started speaking`);
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
  setTimeout(() => { armed = true; }, 300);

  micProc.stdout!.on("data", (chunk: Buffer) => {
    if (!armed) return;
    const rms = calcRms(chunk);

    switch (state) {
      case State.CALIBRATING:
        // Measuring speaker bleed while audio plays
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
        // Clean audio (no speaker echo) → Flux handles turn detection + transcription
        flux.sendAudio(chunk);
        break;

      case State.PROCESSING:
        break;
    }
  });

  process.on("SIGINT", () => {
    console.log(
      "\n\n  📚 Matilda: That was a championship round, Reina! やった! See you next time, champ!\n"
    );
    currentAbort?.abort();
    currentPlayback?.stop();
    flux.close();
    micProc.kill();
    process.exit(0);
  });

  console.log("  📚 Matilda is thinking + speaking...");
  const claudeStart = Date.now();
  await streamAndSpeak(OPENING_PROMPT, claudeStart);
}

main().catch((err) => {
  console.error("  Fatal:", err);
  process.exit(1);
});
