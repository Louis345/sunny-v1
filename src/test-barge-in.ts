import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { spawn, ChildProcess } from "child_process";
import { setStreamVoiceId, streamSpeak, PlaybackHandle } from "./stream-speak";

const SYSTEM_PROMPT =
  "You are Sunny. Give long warm responses so we can test interruption. " +
  "Always respond with at least 5 sentences.";

const OPENING_PROMPT =
  "Say hello and introduce yourself warmly to ILA, an awesome 8-year-old. " +
  "Tell her about all the fun things you two can learn together. " +
  "Be enthusiastic and go into detail — at least 6 sentences!";

const VAD_FLOOR = 2000;
const VAD_HITS_NEEDED = 12;
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
let audioChunks: Buffer[] = [];
let silenceStart = 0;
let speechHeard = false;
let vadHits = 0;
let roundNumber = 0;

let calibrationSamples: number[] = [];
let calibrationStart = 0;
let activeThreshold = VAD_FLOOR;
let calibrated = false;

const anthropic = new Anthropic();
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});
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

async function askClaude(text: string): Promise<string> {
  history.push({ role: "user", content: text });
  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: history,
  });
  const block = resp.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  history.push({ role: "assistant", content: block.text });
  return block.text;
}

function beginSpeaking(text: string): void {
  vadHits = 0;

  if (calibrated) {
    state = State.SPEAKING;
  } else {
    state = State.CALIBRATING;
    calibrationSamples = [];
    calibrationStart = Date.now();
  }

  const streamStart = Date.now();
  currentPlayback = streamSpeak(text, () => {
    console.log(
      `  ⏱️  [${ts()}] First audio chunk (${Date.now() - streamStart}ms)`
    );
    if (!calibrated) {
      console.log(`  🔧 Calibrating mic (1s)...`);
    }
  });

  currentPlayback.done.then(() => {
    if (state !== State.SPEAKING && state !== State.CALIBRATING) return;
    console.log(`\n  💬 Sunny finished. Your turn, ILA!\n`);
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
  const bargeAt = Date.now();

  console.log(`\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  🛑 BARGE-IN DETECTED at [${ts()}]`);

  const t0 = Date.now();
  currentPlayback?.stop();
  currentPlayback = null;
  const killMs = Date.now() - t0;

  console.log(`  ⏱️  Playback killed in ${killMs}ms`);
  if (killMs <= 200) {
    console.log(`  ✅ Sunny stopped within 200ms (${killMs}ms)`);
  } else {
    console.log(`  ❌ Took ${killMs}ms to stop (target: ≤200ms)`);
  }
  console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n  🎤 Listening to ILA... (silence for 1.5s → process)\n`);

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
  console.log(`  🗣️  ILA said: "${transcript}"\n`);

  if (!transcript.trim()) {
    console.log("  ⚠️  Couldn't make that out. Try again!\n");
    enterRecording();
    return;
  }

  roundNumber++;
  console.log(`  ── Round ${roundNumber} ──────────────────────────────`);
  console.log(`  🤔 Sunny is thinking...`);

  const claudeStart = Date.now();
  const response = await askClaude(transcript);
  const claudeMs = Date.now() - claudeStart;

  console.log(`  ⏱️  [${ts()}] Claude responded in ${claudeMs}ms`);
  console.log(`\n  🌞 Sunny: ${response}\n`);
  console.log(`  (Interrupt anytime to barge in!)\n`);

  beginSpeaking(response);
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

      case State.SPEAKING:
        if (rms > activeThreshold) {
          vadHits++;
          if (vadHits >= VAD_HITS_NEEDED) {
            handleBargeIn(chunk);
          }
        } else {
          vadHits = 0;
        }
        break;

      case State.RECORDING:
        audioChunks.push(chunk);
        if (rms > activeThreshold) {
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
  console.log("║     🧪  BARGE-IN CONVERSATION TEST  🧪         ║");
  console.log("║                                                  ║");
  console.log("║  Sunny will talk. Interrupt anytime!             ║");
  console.log("║  She'll stop, listen, and respond.               ║");
  console.log("║  A real conversation — barge in all you want.    ║");
  console.log("║                                                  ║");
  console.log("║  🔧 Auto-calibrates mic (no headphones needed!)  ║");
  console.log("║  Press Ctrl+C to exit.                           ║");
  console.log("║                                                  ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const voiceId = process.env.ELEVENLABS_VOICE_ID_ILA;
  if (!voiceId) {
    console.error("  ❌ Set ELEVENLABS_VOICE_ID_ILA in .env first.");
    process.exit(1);
  }

  setStreamVoiceId(voiceId);

  console.log(`  Voice: ${voiceId}`);
  console.log(
    `  VAD: auto-calibrating (floor: ${VAD_FLOOR}, 2x P95 of speaker bleed)\n`
  );

  const micProc = startMic();

  process.on("SIGINT", () => {
    console.log("\n\n  👋 Bye ILA! Great testing!\n");
    currentPlayback?.stop();
    micProc.kill();
    process.exit(0);
  });

  console.log("  🤔 Sunny is preparing her greeting...");
  const greeting = await askClaude(OPENING_PROMPT);
  console.log(`\n  🌞 Sunny: ${greeting}\n`);
  console.log("  (Interrupt anytime to barge in!)\n");

  beginSpeaking(greeting);
}

main().catch((err) => {
  console.error("  Fatal:", err);
  process.exit(1);
});
