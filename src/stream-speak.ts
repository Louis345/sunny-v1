import "dotenv/config";
import WebSocket from "ws";
import { spawn, ChildProcess, execSync } from "child_process";

const WS_BASE = "wss://api.elevenlabs.io/v1/text-to-speech";
const FLUSH_INTERVAL_MS = 150;

/** Normalize text for TTS so names and Japanese are pronounced correctly. */
function normalizeForTTS(text: string): string {
  return text.replace(/\bIla\b/gi, "EYE-lah");
}

function getPronunciationLocators(): object[] | undefined {
  const dictId = process.env.ELEVENLABS_PRONUNCIATION_DICT_ID;
  const versionId = process.env.ELEVENLABS_PRONUNCIATION_DICT_VERSION;
  if (!dictId || !versionId) return undefined;
  return [{ pronunciation_dictionary_id: dictId, version_id: versionId }];
}

let activeVoiceId = "21m00Tcm4TlvDq8ikWAM";

export function setStreamVoiceId(voiceId: string): void {
  activeVoiceId = voiceId;
}

export interface PlaybackHandle {
  stop: () => void;
  done: Promise<void>;
}

export interface LiveStreamHandle extends PlaybackHandle {
  sendText: (chunk: string) => void;
  finish: () => void;
}

function detectPlayer(): { cmd: string; args: string[] } {
  try {
    execSync("which mpv", { stdio: "ignore" });
    return { cmd: "mpv", args: ["--no-terminal", "--no-cache", "-"] };
  } catch {}
  try {
    execSync("which ffplay", { stdio: "ignore" });
    return {
      cmd: "ffplay",
      args: ["-nodisp", "-autoexit", "-loglevel", "quiet", "-i", "pipe:0"],
    };
  } catch {}
  throw new Error("No audio player found. Install mpv or ffplay.");
}

function spawnPlayer(): {
  player: ChildProcess;
  resolvePromise: () => void;
  done: Promise<void>;
} {
  let resolvePromise: () => void;
  const done = new Promise<void>((r) => {
    resolvePromise = r;
  });

  const { cmd, args } = detectPlayer();
  const player = spawn(cmd, args, { stdio: ["pipe", "ignore", "pipe"] });

  player.stdin!.on("error", () => {});
  player.stderr!.on("data", (d: Buffer) => {
    const m = d.toString().trim();
    if (m) console.error(`  [ffplay] ${m}`);
  });
  player.on("error", (err) => {
    console.error("  Audio player error:", err.message);
    resolvePromise!();
  });

  return { player, resolvePromise: resolvePromise!, done };
}

function buildWsUrl(): string {
  return (
    `${WS_BASE}/${activeVoiceId}/stream-input` +
    `?model_id=${encodeURIComponent("eleven_multilingual_v2")}` +
    `&output_format=mp3_44100_128` +
    `&optimize_streaming_latency=3`
  );
}

function handleWsAudio(
  ws: WebSocket,
  player: ChildProcess,
  resolvePromise: () => void,
  onFirstAudio: (() => void) | undefined,
  stoppedRef: { value: boolean },
  statsRef: { chunks: number; firstFired: boolean },
  onTtsDiedWithoutAudio?: () => void
): void {
  let diedWithoutAudioFired = false;
  function maybeFireDiedWithoutAudio(): void {
    if (statsRef.chunks === 0 && !diedWithoutAudioFired) {
      diedWithoutAudioFired = true;
      onTtsDiedWithoutAudio?.();
    }
  }

  ws.on("message", (data) => {
    if (stoppedRef.value) return;
    const msg = JSON.parse(data.toString());

    if (msg.audio && player.stdin?.writable) {
      statsRef.chunks++;
      if (!statsRef.firstFired) {
        statsRef.firstFired = true;
        onFirstAudio?.();
      }
      player.stdin.write(Buffer.from(msg.audio, "base64"));
    }

    if (msg.isFinal) {
      player.stdin?.end();
    }
  });

  ws.on("error", (err) => {
    console.error("  🔴 TTS WebSocket error:", err.message);
    player.kill();
  });

  ws.on("close", (code, reason) => {
    if (statsRef.chunks === 0) {
      console.error(
        `  🔴 TTS WebSocket closed before audio (code: ${code}, reason: ${reason || "none"})`
      );
      maybeFireDiedWithoutAudio();
    }
    if (!stoppedRef.value && player.stdin?.writable) {
      player.stdin.end();
    }
  });

  player.on("close", (exitCode) => {
    if (!stoppedRef.value) {
      if (statsRef.chunks === 0) {
        console.error(
          `  ⚠️  Player exited (code ${exitCode}) with 0 audio chunks`
        );
        maybeFireDiedWithoutAudio();
      }
      resolvePromise();
    }
  });
}

function makeStopFn(
  stoppedRef: { value: boolean },
  ws: WebSocket | null,
  player: ChildProcess | null,
  resolvePromise: () => void,
  flushTimer?: { ref: NodeJS.Timeout | null }
): () => void {
  return () => {
    if (stoppedRef.value) return;
    stoppedRef.value = true;
    if (flushTimer?.ref) {
      clearTimeout(flushTimer.ref);
      flushTimer.ref = null;
    }
    try {
      ws?.close();
    } catch {}
    try {
      player?.kill("SIGKILL");
    } catch {}
    resolvePromise();
  };
}

// --- Full-text mode (existing API) ---

export function streamSpeak(
  text: string,
  onFirstAudio?: () => void
): PlaybackHandle {
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const stoppedRef = { value: false };
  const statsRef = { chunks: 0, firstFired: false };

  let player: ChildProcess;
  let resolvePromise: () => void;
  let done: Promise<void>;

  try {
    ({ player, resolvePromise, done } = spawnPlayer());
  } catch (err: any) {
    console.error(`  ${err.message}`);
    return {
      stop: () => {},
      done: Promise.resolve(),
    };
  }

  const ws = new WebSocket(buildWsUrl());

  ws.on("open", () => {
    const locators = getPronunciationLocators();
    ws.send(
      JSON.stringify({
        text: " ",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        xi_api_key: apiKey,
        ...(locators && { pronunciation_dictionary_locators: locators }),
      })
    );
    ws.send(
      JSON.stringify({ text: normalizeForTTS(text) + " ", try_trigger_generation: true })
    );
    ws.send(JSON.stringify({ text: "" }));
  });

  handleWsAudio(ws, player, resolvePromise, onFirstAudio, stoppedRef, statsRef);

  return {
    stop: makeStopFn(stoppedRef, ws, player, resolvePromise),
    done,
  };
}

// --- Live streaming mode (token-by-token) ---

export function createLiveStream(
  onFirstAudio?: () => void,
  onTtsDiedWithoutAudio?: () => void
): LiveStreamHandle {
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const stoppedRef = { value: false };
  const statsRef = { chunks: 0, firstFired: false };
  const flushTimer: { ref: NodeJS.Timeout | null } = { ref: null };

  let player: ChildProcess;
  let resolvePromise: () => void;
  let done: Promise<void>;

  try {
    ({ player, resolvePromise, done } = spawnPlayer());
  } catch (err: any) {
    console.error(`  ${err.message}`);
    return {
      sendText: () => {},
      finish: () => {},
      stop: () => {},
      done: Promise.resolve(),
    };
  }

  const ws = new WebSocket(buildWsUrl());
  let wsReady = false;
  let buffer = "";

  function flushBuffer(trigger: boolean): void {
    if (!buffer || stoppedRef.value) return;
    if (ws.readyState !== WebSocket.OPEN) return;
    const toSend = normalizeForTTS(buffer) + " ";
    ws.send(
      JSON.stringify({
        text: toSend,
        ...(trigger && { try_trigger_generation: true }),
      })
    );
    buffer = "";
  }

  function scheduleFlush(): void {
    if (flushTimer.ref) return;
    flushTimer.ref = setTimeout(() => {
      flushTimer.ref = null;
      flushBuffer(true);
    }, FLUSH_INTERVAL_MS);
  }

  ws.on("open", () => {
    const locators = getPronunciationLocators();
    ws.send(
      JSON.stringify({
        text: " ",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        xi_api_key: apiKey,
        ...(locators && { pronunciation_dictionary_locators: locators }),
      })
    );
    wsReady = true;

    if (buffer) {
      flushBuffer(true);
    }
  });

  handleWsAudio(ws, player, resolvePromise, onFirstAudio, stoppedRef, statsRef, onTtsDiedWithoutAudio);

  return {
    sendText(chunk: string) {
      if (stoppedRef.value) return;
      buffer += chunk;

      if (!wsReady) return;

      if (/[.!?,;:\n]/.test(chunk)) {
        if (flushTimer.ref) {
          clearTimeout(flushTimer.ref);
          flushTimer.ref = null;
        }
        flushBuffer(true);
      } else {
        scheduleFlush();
      }
    },

    finish() {
      if (stoppedRef.value) return;
      if (flushTimer.ref) {
        clearTimeout(flushTimer.ref);
        flushTimer.ref = null;
      }
      flushBuffer(true);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ text: "" }));
      }
    },

    stop: makeStopFn(stoppedRef, ws, player, resolvePromise, flushTimer),
    done,
  };
}
