import "dotenv/config";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { spawn, ChildProcess } from "child_process";
import type { ModelMessage } from "ai";
import { setStreamVoiceId, createLiveStream, PlaybackHandle } from "./stream-speak";
import { runAgent } from "./agents/elli/run";
import type { Profile } from "./profiles";

const REINA_PROFILE: Profile = {
  name: "Reina",
  voiceId: process.env.ELEVENLABS_VOICE_ID_REINA || "jBpfuIE2acCO8z3wKNLl",
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
    "CRITICAL: This is voice-only. NEVER use asterisk actions like *laughs* or *giggles* — the TTS reads them literally. " +
    "Use natural sounds instead: Ha!, Haha!, Wooo!, Oh my gosh! Express emotion through words, not stage directions.",
};

const OPENING_PROMPT =
  "Introduce yourself to Reina for the first time. Tell her that her dad built you just for her. " +
  "Say her dad told you she's super smart. Reference the movie Matilda — you're like her, a smart girl " +
  "who loves books and never backs down. Ask Reina what she wants to do today. " +
  "Keep it short, warm, and confident. Do NOT mention being a year ahead or test scores. " +
  "Do NOT combine Japanese and wrestling — they are separate parts of her life.";

const VAD_FLOOR = 600;
const RECORDING_THRESHOLD = 300;
const VAD_WINDOW_SIZE = 20;
const VAD_HITS_NEEDED = 10;
const CALIBRATION_MS = 1000;
const SILENCE_TIMEOUT_MS = 1200;
const MIN_RECORDING_SECS = 0.5;
const SAMPLE_RATE = 16000;
const BYTES_PER_SEC = SAMPLE_RATE * 2;

enum State {
  CALIBRATING,
  SPEAKING,
  RECORDING,
  PROCESSING,
}

let state: State = State.PROCESSING;
let currentPlayback: PlaybackHandle | null = null;
let currentAbort: AbortController | null = null;
let audioChunks: Buffer[] = [];
let silenceStart = 0;
let speechHeard = false;
let vadWindow: boolean[] = [];
let roundNumber = 0;

let calibrationSamples: number[] = [];
let calibrationStart = 0;
let activeThreshold = VAD_FLOOR;
let calibrated = false;

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});
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

async function isolateVoice(pcmBuffer: Buffer): Promise<Buffer> {
  const stream = await elevenlabs.audioIsolation.convert({
    audio: pcmBuffer,
    fileFormat: "pcm_s16le_16",
  });

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const ISOLATION_MIN_SECS = 5;

async function transcribeAudio(pcmBuffer: Buffer): Promise<string> {
  const durationSecs = pcmBuffer.length / BYTES_PER_SEC;
  let audioToTranscribe: Buffer;
  let format: "pcm_s16le_16" | undefined;

  if (durationSecs >= ISOLATION_MIN_SECS) {
    console.log(`  🔇 Running voice isolation...`);
    audioToTranscribe = await isolateVoice(pcmBuffer);
    format = undefined;
  } else {
    audioToTranscribe = pcmBuffer;
    format = "pcm_s16le_16";
  }

  const result = await elevenlabs.speechToText.convert({
    file: audioToTranscribe,
    modelId: "scribe_v1",
    ...(format && { fileFormat: format }),
  });

  if ("text" in result) return result.text;
  throw new Error("Unexpected Scribe response format");
}

async function streamAndSpeak(
  userText: string,
  claudeStart: number
): Promise<void> {
  vadWindow = [];

  if (calibrated) {
    state = State.SPEAKING;
  } else {
    state = State.CALIBRATING;
    calibrationSamples = [];
    calibrationStart = Date.now();
  }

  const tts = createLiveStream(() => {
    console.log(
      `  ⏱️  [${ts()}] First audio (${Date.now() - claudeStart}ms from Claude call)`
    );
    if (!calibrated) {
      console.log(`  🔧 Calibrating mic (1s)...`);
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
  console.log(`  (Interrupt anytime to barge in!)\n`);

  tts.done.then(() => {
    if (state !== State.SPEAKING && state !== State.CALIBRATING) return;
    console.log(`\n  💬 Matilda finished. Your turn, Reina!\n`);
    enterRecording();
  });
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function finishCalibration(): void {
  if (calibrationSamples.length > 0) {
    const sorted = [...calibrationSamples].sort((a, b) => a - b);
    const avg =
      calibrationSamples.reduce((a, b) => a + b, 0) /
      calibrationSamples.length;
    const p95 = percentile(sorted, 95);
    activeThreshold = Math.max(VAD_FLOOR, Math.round(p95 * 2));
    console.log(
      `  🔧 Calibrated — bleed avg: ${Math.round(avg)}, P95: ${Math.round(p95)}, threshold: ${activeThreshold} RMS`
    );
  } else {
    activeThreshold = VAD_FLOOR;
  }
  calibrated = true;
  state = State.SPEAKING;
}

function enterRecording(): void {
  state = State.RECORDING;
  audioChunks = [];
  silenceStart = 0;
  speechHeard = false;
}

function handleBargeIn(firstChunk: Buffer): void {
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
  console.log(`\n  🎤 Listening to Reina... (silence for 1.5s → process)\n`);

  state = State.RECORDING;
  audioChunks = [firstChunk];
  silenceStart = 0;
  speechHeard = true;
}

async function finishRecording(): Promise<void> {
  state = State.PROCESSING;

  const pcm = Buffer.concat(audioChunks);
  const durationSecs = pcm.length / BYTES_PER_SEC;

  if (durationSecs < MIN_RECORDING_SECS) {
    console.log(
      `  ⚠️  Too short (${durationSecs.toFixed(1)}s). Listening again...\n`
    );
    enterRecording();
    return;
  }

  console.log(`  🔇 Isolating voice from ${durationSecs.toFixed(1)}s of audio...`);
  const sttStart = Date.now();

  let transcript: string;
  try {
    transcript = await transcribeAudio(pcm);
  } catch (err: any) {
    console.error("  ❌ Transcription failed:", err.message);
    enterRecording();
    return;
  }

  const sttMs = Date.now() - sttStart;
  console.log(`  ⏱️  [${ts()}] STT complete in ${sttMs}ms`);
  console.log(`  🗣️  Reina said: "${transcript}"\n`);

  if (!transcript.trim()) {
    console.log("  ⚠️  Couldn't make that out. Try again!\n");
    enterRecording();
    return;
  }

  roundNumber++;
  console.log(`  ── Round ${roundNumber} ──────────────────────────────`);
  console.log(`  📚 Matilda is thinking + speaking...`);

  const claudeStart = Date.now();
  await streamAndSpeak(transcript, claudeStart);
}

function startMic(): ChildProcess {
  const proc = spawn(
    "ffmpeg",
    [
      "-f", "avfoundation", "-i", ":0",
      "-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", "1",
      "-loglevel", "quiet", "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "ignore"] }
  );

  let armed = false;
  setTimeout(() => {
    armed = true;
  }, 300);

  proc.stdout!.on("data", (chunk: Buffer) => {
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
        const hit = rms > activeThreshold;
        vadWindow.push(hit);
        if (vadWindow.length > VAD_WINDOW_SIZE) vadWindow.shift();
        const hits = vadWindow.filter(Boolean).length;
        if (hit) {
          process.stdout.write(`\r  🎤 RMS ${Math.round(rms)} / ${activeThreshold} | ${hits}/${VAD_HITS_NEEDED} hits  `);
        }
        if (hits >= VAD_HITS_NEEDED) {
          process.stdout.write("\n");
          handleBargeIn(chunk);
        }
        break;
      }

      case State.RECORDING:
        audioChunks.push(chunk);
        if (rms > RECORDING_THRESHOLD) {
          silenceStart = 0;
          speechHeard = true;
        } else if (speechHeard) {
          if (!silenceStart) silenceStart = Date.now();
          if (Date.now() - silenceStart > SILENCE_TIMEOUT_MS) {
            finishRecording().catch(console.error);
          }
        }
        break;

      case State.PROCESSING:
        break;
    }
  });

  proc.on("error", (err) => {
    console.error("  Mic error:", err.message);
    process.exit(1);
  });

  return proc;
}

async function main(): Promise<void> {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║                                                  ║");
  console.log("║     📚  MATILDA — Reina's Companion  📚         ║");
  console.log("║                                                  ║");
  console.log("║  Matilda will talk. Interrupt anytime!            ║");
  console.log("║  She'll stop, listen, and respond.               ║");
  console.log("║  A real conversation — barge in all you want.    ║");
  console.log("║                                                  ║");
  console.log("║  🔧 Auto-calibrates mic (no headphones needed!)  ║");
  console.log("║  Press Ctrl+C to exit.                           ║");
  console.log("║                                                  ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  setStreamVoiceId(REINA_PROFILE.voiceId);

  console.log(`  Voice: ${REINA_PROFILE.voiceId}`);
  console.log(
    `  VAD: auto-calibrating (floor: ${VAD_FLOOR}, 2x P95 of speaker bleed)\n`
  );

  const micProc = startMic();

  process.on("SIGINT", () => {
    console.log("\n\n  📚 Matilda: That was a championship round, Reina! やった! See you next time, champ!\n");
    currentAbort?.abort();
    currentPlayback?.stop();
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
