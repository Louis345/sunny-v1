import "dotenv/config";
import {
  setStreamVoiceId,
  createLiveStream,
} from "../stream-speak";
import { runAgent } from "../agents/elli/run";
import { connectFlux, FluxHandle } from "../deepgram-turn";
import { ELLI } from "../companions/loader";
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
let hasTransitionedToWork = false;
let fluxHandle: FluxHandle | null = null;
let micProcHandle: ReturnType<typeof startMic> | null = null;

const history: ModelMessage[] = [];

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

async function streamAndSpeak(
  userText: string,
  claudeStart: number,
  transitionToWorkPhase = false,
): Promise<void> {
  setState(State.PROCESSING);
  resetConsecutiveHits();

  // Pass last 3 Elli utterances so ElevenLabs adapts prosody to conversation flow
  const previousText = history
    .filter((m) => m.role === "assistant")
    .slice(-3)
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .filter(Boolean)
    .join(" ") || undefined;

  const tts = createLiveStream(
    () => {
      console.log(
        `  ⏱️  [${ts()}] First audio (${Date.now() - claudeStart}ms from Claude call)`,
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
      profile: ELLI,
      onToken: (token) => tts.sendText(token),
      signal: abort.signal,
      transitionToWorkPhase,
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
  console.log(`\n  🌟 Elli: ${response}\n`);

  tts.done.then(async () => {
    if (getState() !== State.SPEAKING) return;
    console.log(`\n  💬 Elli finished. Your turn, Ila!\n`);
    setState(State.LISTENING);

    if (sessionEnding) {
      await recordSession(history, "Ila");
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
  console.log(`  🗣️  Ila said: "${transcript}"\n`);

  roundNumber++;
  const transitionToWorkPhase = roundNumber >= 5 && !hasTransitionedToWork;
  if (transitionToWorkPhase) hasTransitionedToWork = true;

  console.log(`  ── Round ${roundNumber} ──────────────────────────────`);
  console.log(`  🌟 Elli is thinking + speaking...`);

  const claudeStart = Date.now();
  streamAndSpeak(transcript, claudeStart, transitionToWorkPhase).catch(console.error);
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

  setSessionLabels({ companionName: "Elli", childName: "Ila" });

  await recordSessionStart("Ila");

  const micProc = startMic();
  micProcHandle = micProc;

  console.log("  🔌 Connecting to Deepgram Flux...");
  const flux: FluxHandle = await connectFlux({
    onOpen() {
      console.log("  ✅ Deepgram Flux connected\n");
    },
    onStartOfTurn() {
      if (getState() === State.LISTENING) {
        console.log(`  🎤 [${ts()}] Ila started speaking`);
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
  setTimeout(() => {
    armed = true;
  }, 300);

  micProc.stdout!.on("data", (chunk: Buffer) => {
    if (!armed) return;
    processAudioChunk(chunk, (c) => flux.sendAudio(c));
  });

  process.on("SIGINT", () => {
    console.log(
      "\n\n  🌟 Elli: Bye Ila! You did amazing today. I'm so proud of you!\n",
    );
    cleanupPlayback();
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
