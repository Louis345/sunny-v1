import WebSocket from "ws";
import { sanitizeForTTS } from "./session-state";

/**
 * Streaming leg of the companion talk pipeline: sentence-buffered text goes to
 * the ElevenLabs websocket (flash model, PCM 24kHz) and audio chunks flow back
 * through a callback so the route can relay them as SSE frames.
 * Chunking heuristics mirror src/server/ws-tts-bridge.ts.
 */

const WS_BASE = "wss://api.elevenlabs.io/v1/text-to-speech";
const FLUSH_INTERVAL_MS = 50;
const FINISH_DRAIN_TIMEOUT_MS = 4000;

export const COMPANION_TALK_STREAM_PCM_SAMPLE_RATE = 24_000;

export type CompanionTalkStreamSpeaker = {
  connect(): Promise<void>;
  sendText(chunk: string): void;
  finish(): Promise<void>;
  stop(): void;
};

export type CreateCompanionTalkSpeaker = (opts: {
  voiceId: string;
  apiKey: string;
  onAudioChunk: (base64Pcm: string) => void;
}) => CompanionTalkStreamSpeaker;

function normalizeForTTS(text: string): string {
  let t = text.replace(/-(?=[A-Z])/g, " ");
  t = t.replace(/\bIla\b/gi, "EYE-lah");
  return t;
}

function buildWsUrl(voiceId: string, modelId: string): string {
  return (
    `${WS_BASE}/${voiceId}/stream-input` +
    `?model_id=${encodeURIComponent(modelId)}` +
    `&output_format=pcm_24000` +
    `&optimize_streaming_latency=3`
  );
}

export const createElevenLabsPcmSpeaker: CreateCompanionTalkSpeaker = ({
  voiceId,
  apiKey,
  onAudioChunk,
}) => {
  const modelId = process.env.SUNNY_VIDEO_CALL_TTS_MODEL || "eleven_flash_v2_5";
  let ws: WebSocket | null = null;
  let wsReady = false;
  let stopped = false;
  let buffer = "";
  let hasFlushed = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let connectingPromise: Promise<void> | null = null;

  const clearFlushTimer = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  const flushBuffer = () => {
    if (!buffer || stopped) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const toSend = sanitizeForTTS(normalizeForTTS(buffer)) + " ";
    ws.send(JSON.stringify({ text: toSend, try_trigger_generation: true }));
    buffer = "";
    hasFlushed = true;
  };

  const connect = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (connectingPromise) return connectingPromise;
    connectingPromise = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(buildWsUrl(voiceId, modelId));
      ws = socket;
      socket.on("open", () => {
        connectingPromise = null;
        if (ws !== socket || stopped) {
          socket.close();
          resolve();
          return;
        }
        socket.send(
          JSON.stringify({
            text: " ",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            xi_api_key: apiKey,
          }),
        );
        wsReady = true;
        if (buffer) flushBuffer();
        resolve();
      });
      socket.on("message", (data: Buffer) => {
        if (stopped) return;
        try {
          const msg = JSON.parse(data.toString()) as { audio?: string };
          if (msg.audio) onAudioChunk(msg.audio);
        } catch (err: unknown) {
          console.warn(" 🔴 [companion-talk-stream] tts_message_parse_failed", err);
        }
      });
      socket.on("error", (err) => {
        connectingPromise = null;
        if (stopped || ws !== socket) {
          resolve();
          return;
        }
        console.error(" 🔴 [companion-talk-stream] tts_ws_error", err.message);
        reject(err);
      });
    });
    return connectingPromise;
  };

  return {
    connect,
    sendText(chunk: string): void {
      if (stopped || !chunk) return;
      let piece = chunk;
      const bufTrim = buffer.trimEnd();
      if (bufTrim.length > 0 && piece.trim().length > 0) {
        if (!/[.!?]["']?\s*$/.test(bufTrim)) {
          piece = piece.replace(/^\s+/, " ");
        }
      }
      buffer += piece;
      if (!wsReady || !ws) return;
      if (/[.!?,;:\n]/.test(chunk)) {
        clearFlushTimer();
        flushBuffer();
      } else if (!hasFlushed && buffer.length >= 10) {
        // Prime generation with the first fragment so audio starts ASAP.
        flushBuffer();
      } else if (!flushTimer) {
        flushTimer = setTimeout(() => {
          flushTimer = null;
          flushBuffer();
        }, FLUSH_INTERVAL_MS);
      }
    },
    async finish(): Promise<void> {
      if (stopped) return;
      clearFlushTimer();
      await connect().catch(() => undefined);
      flushBuffer();
      if (ws && ws.readyState === WebSocket.OPEN) {
        const socket = ws;
        socket.send(JSON.stringify({ text: "" }));
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, FINISH_DRAIN_TIMEOUT_MS);
          socket.on("close", () => {
            clearTimeout(timeout);
            resolve();
          });
        });
        wsReady = false;
        ws = null;
      }
    },
    stop(): void {
      stopped = true;
      wsReady = false;
      connectingPromise = null;
      clearFlushTimer();
      if (ws) {
        const socket = ws;
        ws = null;
        try {
          if (
            socket.readyState === WebSocket.CONNECTING ||
            socket.readyState === WebSocket.OPEN
          ) {
            socket.terminate();
          }
        } catch (err: unknown) {
          console.warn(" 🔴 [companion-talk-stream] tts_ws_terminate_failed", err);
        }
      }
    },
  };
};

export type SseWritable = {
  write(chunk: string): void;
};

export function writeCompanionTalkSseEvent(
  res: SseWritable,
  event: string,
  data: unknown,
): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
