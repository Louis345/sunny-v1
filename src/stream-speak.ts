import "dotenv/config";
import WebSocket from "ws";
import { spawn, ChildProcess, execSync } from "child_process";

const WS_BASE = "wss://api.elevenlabs.io/v1/text-to-speech";

let activeVoiceId = "21m00Tcm4TlvDq8ikWAM";

export function setStreamVoiceId(voiceId: string): void {
  activeVoiceId = voiceId;
}

export interface PlaybackHandle {
  stop: () => void;
  done: Promise<void>;
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

export function streamSpeak(
  text: string,
  onFirstAudio?: () => void
): PlaybackHandle {
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const modelId = "eleven_multilingual_v2";
  const url =
    `${WS_BASE}/${activeVoiceId}/stream-input` +
    `?model_id=${encodeURIComponent(modelId)}` +
    `&output_format=mp3_44100_128` +
    `&optimize_streaming_latency=3`;

  let stopped = false;
  let ws: WebSocket | null = null;
  let player: ChildProcess | null = null;
  let firstChunkFired = false;
  let audioChunkCount = 0;
  let resolvePromise: () => void;

  const done = new Promise<void>((r) => {
    resolvePromise = r;
  });

  try {
    const { cmd, args } = detectPlayer();
    player = spawn(cmd, args, { stdio: ["pipe", "ignore", "pipe"] });

    player.stdin!.on("error", () => {});

    player.stderr!.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error(`  [ffplay] ${msg}`);
    });

    player.on("close", (code) => {
      if (!stopped) {
        if (audioChunkCount === 0) {
          console.error(
            `  ⚠️  Player exited (code ${code}) with 0 audio chunks — WebSocket may have failed`
          );
        }
        resolvePromise();
      }
    });

    player.on("error", (err) => {
      console.error("  Audio player error:", err.message);
      resolvePromise();
    });
  } catch (err: any) {
    console.error(`  ${err.message}`);
    resolvePromise!();
    return { stop: () => {}, done };
  }

  ws = new WebSocket(url);

  ws.on("open", () => {
    ws!.send(
      JSON.stringify({
        text: " ",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        xi_api_key: apiKey,
      })
    );

    ws!.send(
      JSON.stringify({
        text: text + " ",
        try_trigger_generation: true,
      })
    );

    ws!.send(JSON.stringify({ text: "" }));
  });

  ws.on("message", (data) => {
    if (stopped) return;

    const msg = JSON.parse(data.toString());

    if (msg.audio && player?.stdin?.writable) {
      audioChunkCount++;
      if (!firstChunkFired) {
        firstChunkFired = true;
        onFirstAudio?.();
      }
      player.stdin.write(Buffer.from(msg.audio, "base64"));
    }

    if (msg.isFinal) {
      player?.stdin?.end();
    }
  });

  ws.on("error", (err) => {
    console.error("  🔴 TTS WebSocket error:", err.message);
    player?.kill();
  });

  ws.on("close", (code, reason) => {
    if (audioChunkCount === 0) {
      console.error(
        `  🔴 TTS WebSocket closed before sending audio (code: ${code}, reason: ${reason || "none"})`
      );
    }
    if (!stopped && player?.stdin?.writable) {
      player.stdin.end();
    }
  });

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      try {
        ws?.close();
      } catch {}
      try {
        player?.kill("SIGKILL");
      } catch {}
      resolvePromise();
    },
    done,
  };
}
