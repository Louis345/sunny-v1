import "dotenv/config";
import {
  setStreamVoiceId,
  createLiveStream,
} from "../stream-speak";
import { runAgent } from "../agents/elli/run";
import { connectFlux, FluxHandle } from "../deepgram-turn";
import { MATILDA } from "../companions/loader";
import { type ModelMessage } from "ai";
import {
  State,
  startMic,
  setSessionLabels,
  getState,
  setState,
  setCurrentPlayback,
  setCurrentAbort,
  getCalibrated,
  resetConsecutiveHits,
  startCalibration,
  startSpeaking,
  processAudioChunk,
  cleanupPlayback,
} from "../utils/audio";
import { isGoodbye } from "../utils/goodbye";
import { recordSession } from "../agents/slp-recorder/recorder";
import { recordSessionStart } from "../agents/elli/tools/startSession";

let sessionEnding = false;
let roundNumber = 0;
let fluxHandle: FluxHandle | null = null;
let micProcHandle: ReturnType<typeof startMic> | null = null;

const history: ModelMessage[] = [];

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

async function streamAndSpeak(
  userText: string,
  claudeStart: number
): Promise<void> {
  setState(State.PROCESSING);
  resetConsecutiveHits();

  // Pass last 3 Matilda utterances so ElevenLabs adapts prosody to conversation flow
  const previousText = history
    .filter((m) => m.role === "assistant")
    .slice(-3)
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .filter(Boolean)
    .join(" ") || undefined;

  const tts = createLiveStream(
    () => {
      console.log(
        `  ⏱️  [${ts()}] First audio (${Date.now() - claudeStart}ms from Claude call)`
      );
      if (!getCalibrated()) {
        startCalibration();
      } else {
        startSpeaking();
      }
    },
    () => {
      console.error(
        "  ⚠️  TTS died without audio — falling back to listening",
      );
      setState(State.LISTENING);
    },
    previousText,
  );

  setCurrentPlayback(tts);
  const abort = new AbortController();
  setCurrentAbort(abort);

  let response: string;
  try {
    response = await runAgent({
      history,
      userMessage: userText,
      profile: MATILDA,
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
  setCurrentAbort(null);

  const claudeMs = Date.now() - claudeStart;
  console.log(`  ⏱️  [${ts()}] Claude done streaming (${claudeMs}ms)`);
  console.log(`\n  📚 Matilda: ${response}\n`);

  tts.done.then(async () => {
    if (getState() !== State.SPEAKING) return;
    console.log(`\n  💬 Matilda finished. Your turn, Reina!\n`);
    setState(State.LISTENING);

    if (sessionEnding) {
      await recordSession(history, "Reina");
      fluxHandle?.close();
      micProcHandle?.kill();
      process.exit(0);
    }
  });
}

function handleEndOfTurn(transcript: string): void {
  if (getState() === State.PROCESSING) return;

  if (!transcript.trim()) {
    console.log("  ⚠️  Couldn't make that out. Still listening...\n");
    setState(State.LISTENING);
    return;
  }

  setState(State.PROCESSING);

  if (isGoodbye(transcript)) {
    sessionEnding = true;
  }

  console.log(`  ⏱️  [${ts()}] Deepgram EndOfTurn`);
  console.log(`  🗣️  Reina said: "${transcript}"\n`);

  roundNumber++;
  console.log(`  ── Round ${roundNumber} ──────────────────────────────`);
  console.log(`  📚 Matilda is thinking + speaking...`);

  const claudeStart = Date.now();
  streamAndSpeak(transcript, claudeStart).catch(console.error);
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

  setStreamVoiceId(MATILDA.voiceId);
  console.log(`  Voice: ${MATILDA.voiceId}`);
  console.log(`  Turn detection: Deepgram Flux (listening) + RMS barge-in (speaking)\n`);

  setSessionLabels({ companionName: "Matilda", childName: "Reina" });

  await recordSessionStart("Reina");

  const micProc = startMic();
  micProcHandle = micProc;

  console.log("  🔌 Connecting to Deepgram Flux...");
  const flux: FluxHandle = await connectFlux({
    onOpen() {
      console.log("  ✅ Deepgram Flux connected\n");
    },
    onStartOfTurn() {
      if (getState() === State.LISTENING) {
        console.log(`  🎤 [${ts()}] Reina started speaking`);
      }
    },
    onInterim(transcript) {
      if (getState() === State.LISTENING) {
        process.stdout.write(`\r  🎤 hearing: "${transcript}"  `);
      }
    },
    onEagerEndOfTurn(transcript) {
      if (getState() === State.LISTENING && transcript.trim()) {
        process.stdout.write(`\r  ⚡ eager: "${transcript}"  \n`);
      }
    },
    onTurnResumed() {
      if (getState() === State.PROCESSING) {
        console.log(`  ↩️  Turn resumed — still listening`);
        setState(State.LISTENING);
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
  fluxHandle = flux;

  let armed = false;
  setTimeout(() => { armed = true; }, 300);

  micProc.stdout!.on("data", (chunk: Buffer) => {
    if (!armed) return;
    processAudioChunk(chunk, (c) => flux.sendAudio(c));
  });

  process.on("SIGINT", () => {
    console.log(
      "\n\n  📚 Matilda: That was a championship round, Reina! やった! See you next time, champ!\n"
    );
    cleanupPlayback();
    flux.close();
    micProc.kill();
    process.exit(0);
  });

  console.log("  📚 Matilda is thinking + speaking...");
  const claudeStart = Date.now();
  await streamAndSpeak(MATILDA.openingLine, claudeStart);
}

main().catch((err) => {
  console.error("  Fatal:", err);
  process.exit(1);
});
