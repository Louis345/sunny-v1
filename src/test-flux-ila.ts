import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { spawn, ChildProcess } from "child_process";
import { setStreamVoiceId, createLiveStream, PlaybackHandle } from "./stream-speak";
import { runAgent } from "./agents/run";
import { connectFlux, FluxHandle } from "./deepgram-turn";
import type { Profile } from "./profiles";

const ILA_PROFILE: Profile = {
  name: "Ila",
  voiceId: process.env.ELEVENLABS_VOICE_ID_ILA || "21m00Tcm4TlvDq8ikWAM",
  systemPrompt:
    "You are Elli, Ila's learning companion. Her name is Ila (pronounced EYE-lah). " +
    "Ila's father built you specifically for her. " +
    "Ila is 8 years old with ADHD combined type and dyslexia. She has a twin sister named Reina " +
    "who has her own companion. Ila is the creative, emotional, silly one. " +
    "She loves GeGeGe no Kitaro — the spooky yokai show is her absolute favorite. " +
    "Weave Kitaro references naturally when it fits: Kitaro's bravery, Medama-Oyaji riding on his head, " +
    "the spooky yokai adventures, Neko-Musume being fierce. Don't force it — just sprinkle it in like " +
    "a friend who watches the same show. " +
    "Ila has ADHD — she WILL interrupt, jump ahead, and lose focus. This is not defiance, it's her brain. " +
    "When she goes off track, gently redirect without judgment. Never say 'pay attention' or 'focus.' " +
    "She has dyslexia — never assume she can read something. Always say it out loud. " +
    "Her Sentence Comprehension is her strongest skill (63rd percentile). Her Following Directions " +
    "is very low (2nd percentile) — NEVER give multi-step instructions. One step at a time. " +
    "Use a clear 'ready? go!' signal before giving directions. " +
    "Your personality: warm, gentle, endlessly patient. Like a cozy blanket on a rainy day. " +
    "Celebrate effort over accuracy — never say 'wrong', say 'ooh let's try that again!' " +
    "Keep responses to 2-3 short sentences. One idea at a time. " +
    "If she shuts down, get softer not louder. If she's silly, be silly back. " +
    "CRITICAL: This is voice-only — everything you write is spoken aloud by a text-to-speech engine. " +
    "NEVER use asterisk actions like *laughs* or *giggles* — the TTS reads them literally. " +
    "Instead, laugh naturally by writing Haha! or Ha! in your sentences — the voice engine turns these into real laughter. " +
    "Use them sparingly and only when something is genuinely funny or she makes you laugh. " +
    "Sound human: use filler words occasionally (well, hmm, ooh), vary sentence length, trail off with ... when thinking. " +
    "Use exclamation points for energy but not every sentence. Sometimes a quiet 'yeah' is more real than 'AMAZING!' " +
    "The goal is to sound like a real friend, not a hype machine.",
};

const OPENING_PROMPT =
  "This is your very first time talking to Ila! She picked you yesterday and you've been SO excited " +
  "to finally meet her. You've been waiting all day for this moment. Tell her her dad built you " +
  "just for her. You already know she loves GeGeGe no Kitaro — maybe mention that you love it too, " +
  "like you're bonding over a shared favorite show. But it's almost bedtime, so you can't chat " +
  "forever tonight — make it count! Ask what she wants to do. " +
  "Be genuinely warm, excited, a little giggly. Keep it short — remember she zones out after the first sentence. " +
  "Do NOT mention ADHD, dyslexia, evaluations, or therapy. She's just a kid meeting a new friend.";

// Barge-in uses RMS so speaker echo doesn't fool Flux.
// Calibrates against actual speaker output, then requires voice ABOVE that level.
const BARGE_IN_FLOOR = 800;
const BARGE_IN_WINDOW = 20;
const BARGE_IN_HITS = 10;
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
let bargeWindow: boolean[] = [];
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
  bargeWindow = [];

  const tts = createLiveStream(() => {
    console.log(
      `  ⏱️  [${ts()}] First audio (${Date.now() - claudeStart}ms from Claude call)`
    );
    if (!calibrated) {
      state = State.CALIBRATING;
      calibrationSamples = [];
      calibrationStart = Date.now();
      console.log(`  🔧 Calibrating speaker bleed (${CALIBRATION_MS / 1000}s)...`);
    } else {
      state = State.SPEAKING;
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
      profile: ILA_PROFILE,
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
    const avg = calibrationSamples.reduce((a, b) => a + b, 0) / calibrationSamples.length;
    const p95idx = Math.ceil(0.95 * sorted.length) - 1;
    const p95 = sorted[Math.max(0, p95idx)];
    bargeThreshold = Math.max(BARGE_IN_FLOOR, Math.round(p95 * 2));
    console.log(
      `  🔧 Calibrated — speaker bleed avg: ${Math.round(avg)}, P95: ${Math.round(p95)}, barge-in threshold: ${bargeThreshold} RMS`
    );
  } else {
    bargeThreshold = BARGE_IN_FLOOR;
  }
  calibrated = true;
  state = State.SPEAKING;
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
  console.log("║     🌟  ELLI — Ila's Companion (Flux)  🌟       ║");
  console.log("║                                                  ║");
  console.log("║  Deepgram Flux + RMS barge-in (hybrid)            ║");
  console.log("║  Elli will talk. Interrupt anytime!               ║");
  console.log("║  Real conversation — barge in all you want.      ║");
  console.log("║                                                  ║");
  console.log("║  Press Ctrl+C to exit.                           ║");
  console.log("║                                                  ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  setStreamVoiceId(ILA_PROFILE.voiceId);
  console.log(`  Voice: ${ILA_PROFILE.voiceId}`);
  console.log(`  Turn detection: Deepgram Flux (listening) + RMS barge-in (speaking)\n`);

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
  setTimeout(() => { armed = true; }, 300);

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
        const hit = rms > bargeThreshold;
        bargeWindow.push(hit);
        if (bargeWindow.length > BARGE_IN_WINDOW) bargeWindow.shift();
        const hits = bargeWindow.filter(Boolean).length;
        if (hit) {
          process.stdout.write(`\r  🎤 RMS ${Math.round(rms)} / ${bargeThreshold} | ${hits}/${BARGE_IN_HITS} hits  `);
        }
        if (hits >= BARGE_IN_HITS) {
          process.stdout.write("\n");
          handleBargeIn();
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
      "\n\n  🌟 Elli: Bye Ila! You did amazing today. I'm so proud of you!\n"
    );
    currentAbort?.abort();
    currentPlayback?.stop();
    flux.close();
    micProc.kill();
    process.exit(0);
  });

  console.log("  🌟 Elli is thinking + speaking...");
  const claudeStart = Date.now();
  await streamAndSpeak(OPENING_PROMPT, claudeStart);
}

main().catch((err) => {
  console.error("  Fatal:", err);
  process.exit(1);
});
