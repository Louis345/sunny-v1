import WebSocket from "ws";
import { sanitizeForTTS } from "./session-state";

const WS_BASE = "wss://api.elevenlabs.io/v1/text-to-speech";
const FLUSH_INTERVAL_MS = 50;
const STREAM_DEADLINE_MS = 10_000;
type StreamOutcome = "final" | "closed" | "cancelled" | "tts_provider_error" | "tts_stream_timeout";
type StreamTerminal = { outcome?: StreamOutcome; done: Promise<StreamOutcome>; settle: (outcome: StreamOutcome) => void; wordPcm: Buffer[]; wordBytes: number; atomicWord: boolean };


function normalizeForTTS(text: string): string {
  let t = text.replace(/-(?=[A-Z])/g, " ");
  t = t.replace(/\bIla\b/gi, "EYE-lah");
  return t;
}

function getPronunciationLocators(): object[] | undefined {
  const dictId = process.env.ELEVENLABS_PRONUNCIATION_DICT_ID;
  const versionId = process.env.ELEVENLABS_PRONUNCIATION_DICT_VERSION;
  if (!dictId || !versionId) return undefined;
  return [
    { pronunciation_dictionary_id: dictId, version_id: versionId },
  ];
}

function buildWsUrl(voiceId: string): string {
  const base = (process.env.ELEVENLABS_WS_BASE_URL ?? WS_BASE).replace(/\/$/, "");
  return (
    `${base}/${voiceId}/stream-input` +
    `?model_id=${encodeURIComponent("eleven_flash_v2_5")}` +
    `&output_format=pcm_24000` +
    `&optimize_streaming_latency=3`
  );
}

export class WsTtsBridge {
  private readonly terminals = new WeakMap<WebSocket, StreamTerminal>();
  private browserWs: WebSocket;
  private voiceId: string;
  private elevenWs: WebSocket | null = null;
  private apiKey: string;
  /** When true, skip ElevenLabs — console-only TTS lines; no audio to browser. */
  private readonly disabled: boolean;
  private wsReady = false;
  private buffer = "";
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private connectingPromise: Promise<void> | null = null;
  private hasFlushedThisTurn = false;
  private audioChunksThisTurn = 0;
  private requiresCompleteAudio = false;
  private playbackOwner?: { requestId: string; itemId?: string };

  beginPlayback(requestId: string, itemId?: string, requiresAudio = false, activity = false): void {
    if (this.playbackOwner?.requestId !== requestId && this.playbackOwner) this.stop();
    this.requiresCompleteAudio = requiresAudio;
    if (this.elevenWs) this.trackTerminal(this.elevenWs).atomicWord = requiresAudio;
    this.playbackOwner = { requestId, ...(itemId ? { itemId } : {}) };
    if (this.browserWs.readyState === WebSocket.OPEN) {
      this.browserWs.send(JSON.stringify({ type: "audio_start", ...this.playbackOwner, requiresAudio, source: activity ? "activity" : "companion" }));
    }
    console.log(` 🎮 [session-audio] [owner] [started] request=${requestId}`);
  }

  constructor(browserWs: WebSocket, voiceId: string, private readonly streamDeadlineMs = STREAM_DEADLINE_MS) {
    this.browserWs = browserWs;
    this.voiceId = voiceId;
    this.disabled = process.env.TTS_ENABLED === "false";
    if (this.disabled) {
      this.apiKey = "";
      console.log("  🔇 TTS disabled (TTS_ENABLED=false) — no ElevenLabs");
    } else {
      const key = process.env.ELEVENLABS_API_KEY;
      if (!key) throw new Error("ELEVENLABS_API_KEY not set in .env");
      this.apiKey = key;
    }
  }

  currentPlaybackIdentity(): { requestId: string; itemId?: string } | undefined {
    return this.playbackOwner;
  }

  /** Call this as soon as the session starts — before first token */
  async prime(): Promise<void> {
    return this.connect();
  }

  /**
   * Connect (or reuse) the ElevenLabs WebSocket for this turn.
   * Pass the last few turns of Elli's speech as previousText so ElevenLabs
   * can adapt prosody and expressiveness based on conversation flow.
   */
  async connect(previousText?: string): Promise<void> {
    if (this.elevenWs && this.elevenWs.readyState === WebSocket.OPEN) {
      this.wsReady = true;
      return;
    }

    // If a connection is already in progress, wait for it instead of opening a second one
    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.stopped = false;
    this.buffer = "";
    this.hasFlushedThisTurn = false;
    this.audioChunksThisTurn = 0;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.disabled) {
      this.wsReady = true;
      this.connectingPromise = null;
      this.elevenWs = null;
      return;
    }

    this.elevenWs = null;
    this.wsReady = false;

    this.connectingPromise = new Promise<void>((resolve, reject) => {
      const url = buildWsUrl(this.voiceId);
      const ws = new WebSocket(url);
      this.elevenWs = ws;
      const terminal = this.trackTerminal(ws);
      let opened = false;
      const handshakeDeadline = setTimeout(() => {
        terminal.settle("tts_stream_timeout");
        ws.terminate();
        reject(new Error("tts_stream_timeout: connection"));
      }, this.streamDeadlineMs);
      ws.once("close", () => {
        clearTimeout(handshakeDeadline);
        if (!opened) {
          if (this.elevenWs === ws) this.connectingPromise = null;
          if (terminal.outcome === "cancelled") resolve();
          else reject(new Error("tts_provider_error: connection closed"));
        }
      });

      ws.on("open", () => {
        clearTimeout(handshakeDeadline);
        opened = true;
        console.log("  🔊 TTS model: eleven_flash_v2_5");
        if (this.elevenWs !== ws) {
          ws.close();
          resolve();
          return;
        }
        this.connectingPromise = null;
        const locators = getPronunciationLocators();
        ws.send(
          JSON.stringify({
            text: " ",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            xi_api_key: this.apiKey,
            ...(previousText && { previous_text: previousText }),
            ...(locators && {
              pronunciation_dictionary_locators: locators,
            }),
          })
        );
        this.wsReady = true;
        if (this.buffer) {
          this.flushBuffer(true);
        }
        resolve();
      });

      ws.on("message", (data: Buffer) => {
        if (this.stopped || this.elevenWs !== ws) return;
        let msg: { audio?: string | null; error?: unknown; isFinal?: boolean; is_final?: boolean };
        try { msg = JSON.parse(data.toString()); }
        catch { terminal.settle("tts_provider_error"); return; }
        if (!msg || typeof msg !== "object" || Array.isArray(msg)) { terminal.settle("tts_provider_error"); return; }
        if (terminal.outcome) return;
        if (msg.error) { terminal.settle("tts_provider_error"); return; }
        if (msg.audio != null && typeof msg.audio !== "string") { terminal.settle("tts_provider_error"); return; }
        if (msg.audio) {
          if (terminal.atomicWord) {
            const pcm = Buffer.from(msg.audio, "base64");
            terminal.wordBytes += pcm.length;
            if (terminal.wordBytes > 10 * 1024 * 1024) { terminal.settle("tts_provider_error"); return; }
            terminal.wordPcm.push(pcm);
          } else this.deliverAudio(msg.audio);
        }
        if (msg.isFinal === true || msg.is_final === true) terminal.settle("final");
      });

      ws.on("error", (err) => {
        clearTimeout(handshakeDeadline);
        terminal.settle(this.stopped || this.elevenWs !== ws ? "cancelled" : "tts_provider_error");
        if (this.stopped || this.elevenWs !== ws) {
          console.warn("  🔇 ElevenLabs TTS connect cancelled during shutdown");
          resolve();
          return;
        }
        this.connectingPromise = null;
        console.error("  🔴 ElevenLabs TTS error:", err.message);
        reject(err);
      });
    });

    return this.connectingPromise;
  }

  private flushBuffer(trigger: boolean): void {
    if (!this.buffer || this.stopped) return;
    const toSend = sanitizeForTTS(normalizeForTTS(this.buffer)) + " ";
    const trimmed = toSend.trim();
    if (this.disabled) {
      console.log(`  🔊 TTS (disabled): "${trimmed}"`);
      this.buffer = "";
      this.hasFlushedThisTurn = true;
      return;
    }
    if (!this.elevenWs || this.elevenWs.readyState !== WebSocket.OPEN) return;
    console.log(`  🔊 TTS: "${trimmed}"`);
    this.elevenWs.send(
      JSON.stringify({
        text: toSend,
        ...(trigger && { try_trigger_generation: true }),
      })
    );
    this.buffer = "";
    this.hasFlushedThisTurn = true;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushBuffer(true);
    }, FLUSH_INTERVAL_MS);
  }

  sendText(chunk: string): void {
    if (this.stopped) return;
    let piece = chunk;
    const bufTrim = this.buffer.trimEnd();
    if (bufTrim.length > 0 && piece.trim().length > 0) {
      if (!/[.!?]["']?\s*$/.test(bufTrim)) {
        piece = ". " + piece.replace(/^\s+/, "");
      }
    }
    this.buffer += piece;

    if (this.disabled) {
      if (/[.!?,;:\n]/.test(chunk)) {
        if (this.flushTimer) {
          clearTimeout(this.flushTimer);
          this.flushTimer = null;
        }
        this.flushBuffer(true);
      } else if (!this.hasFlushedThisTurn && this.buffer.length >= 10) {
        this.flushBuffer(true);
      } else {
        this.scheduleFlush();
      }
      return;
    }

    if (!this.wsReady || !this.elevenWs) return;

    if (/[.!?,;:\n]/.test(chunk)) {
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
      this.flushBuffer(true);
    } else if (!this.hasFlushedThisTurn && this.buffer.length >= 10) {
      // Prime the ElevenLabs pipeline with the first text fragment
      // so audio generation starts ASAP — no timer delay.
      this.flushBuffer(true);
    } else {
      this.scheduleFlush();
    }
  }

  async finish(): Promise<void> {
    if (this.stopped) return;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushBuffer(true);
    if (this.disabled) {
      return;
    }
    const ws = this.elevenWs;
    if (!ws) return;
    const terminal = this.trackTerminal(ws);
    // Install the deadline before EOS; retain errors/final packets received before finish.
    const timeout = setTimeout(() => terminal.settle("tts_stream_timeout"), this.streamDeadlineMs);
    try {
      if (!terminal.outcome && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ text: "" }));
      const outcome = await terminal.done;
      if (outcome === "tts_provider_error" || outcome === "tts_stream_timeout") throw new Error(outcome);
    } finally {
      clearTimeout(timeout);
      if (this.elevenWs === ws) {
        this.wsReady = false;
        this.elevenWs = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.terminate();
      }
    }
  }

  private deliverAudio(data: string): void {
    if (this.browserWs.readyState !== WebSocket.OPEN) return;
    this.browserWs.send(JSON.stringify({ type: "audio", ...this.playbackOwner, timestamp: new Date().toISOString(), data }));
    this.audioChunksThisTurn += 1;
  }

  private trackTerminal(ws: WebSocket): StreamTerminal {
    const existing = this.terminals.get(ws);
    if (existing) return existing;
    let resolve!: (outcome: StreamOutcome) => void;
    const started = Date.now();
    const owner = this.playbackOwner;
    const terminal: StreamTerminal = {
      wordPcm: [], wordBytes: 0, atomicWord: this.requiresCompleteAudio,
      done: new Promise<StreamOutcome>(complete => { resolve = complete; }),
      settle: outcome => {
        if (terminal.outcome) return;
        terminal.outcome = outcome;
        if (terminal.atomicWord && this.elevenWs === ws && !this.stopped &&
            (outcome === "final" || outcome === "closed") && terminal.wordBytes > 0) {
          this.deliverAudio(Buffer.concat(terminal.wordPcm).toString("base64"));
        }
        terminal.wordPcm = [];
        terminal.wordBytes = 0;
        console.log(` 🎮 [session-audio] [stream-terminal] [${outcome}] request=${owner?.requestId ?? "unowned"} elapsedMs=${Date.now()-started} chunks=${this.elevenWs === ws ? this.audioChunksThisTurn : "retired"}`);
        resolve(outcome);
      },
    };
    this.terminals.set(ws, terminal);
    ws.once("close", (code: number | undefined) => terminal.settle(
      this.stopped || this.elevenWs !== ws ? "cancelled" : code === 1000 || code === 1005 || code === undefined ? "closed" : "tts_provider_error"
    ));
    return terminal;
  }

  /** Proof that this turn emitted playable PCM to the browser, not merely that the provider stream closed. */
  hadAudioThisTurn(): boolean {
    return this.audioChunksThisTurn > 0;
  }

  stop(): void {
    this.playbackOwner = undefined;
    this.requiresCompleteAudio = false;
    this.stopped = true;
    this.wsReady = false;
    this.connectingPromise = null;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.elevenWs) {
      const ws = this.elevenWs;
      this.trackTerminal(ws).settle("cancelled");
      this.elevenWs = null;
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "clear" }));
        }
        // `close()` while CONNECTING throws in some runtimes; `terminate()` is
        // safe for barge-in teardown on in-flight sockets.
        if (
          ws.readyState === WebSocket.CONNECTING ||
          ws.readyState === WebSocket.OPEN
        ) {
          ws.terminate();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("  🔴 ElevenLabs TTS WebSocket terminate:", msg);
      }
    }
  }

  close(): void {
    this.stop();
  }
}
