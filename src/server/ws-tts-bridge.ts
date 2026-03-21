import WebSocket from "ws";

const WS_BASE = "wss://api.elevenlabs.io/v1/text-to-speech";
const FLUSH_INTERVAL_MS = 50;

function normalizeForTTS(text: string): string {
  return text.replace(/\bIla\b/gi, "EYE-lah");
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
  return (
    `${WS_BASE}/${voiceId}/stream-input` +
    `?model_id=${encodeURIComponent("eleven_flash_v2_5")}` +
    `&output_format=pcm_24000` +
    `&optimize_streaming_latency=3`
  );
}

export class WsTtsBridge {
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

  constructor(browserWs: WebSocket, voiceId: string) {
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
    this.stopped = false;
    this.buffer = "";
    this.hasFlushedThisTurn = false;
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

    if (this.elevenWs && this.elevenWs.readyState === WebSocket.OPEN) {
      this.wsReady = true;
      return;
    }

    // If a connection is already in progress, wait for it instead of opening a second one
    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.elevenWs = null;
    this.wsReady = false;

    this.connectingPromise = new Promise<void>((resolve, reject) => {
      const url = buildWsUrl(this.voiceId);
      const ws = new WebSocket(url);
      this.elevenWs = ws;

      ws.on("open", () => {
        this.connectingPromise = null;
        console.log("  🔊 TTS model: eleven_flash_v2_5");
        if (this.elevenWs !== ws) {
          ws.close();
          resolve();
          return;
        }
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
        if (this.stopped) return;
        const msg = JSON.parse(data.toString());
        if (msg.audio && this.browserWs.readyState === this.browserWs.OPEN) {
          this.browserWs.send(
            JSON.stringify({
              type: "audio",
              timestamp: new Date().toISOString(),
              data: msg.audio,
            })
          );
        }
      });

      ws.on("error", (err) => {
        this.connectingPromise = null;
        console.error("  🔴 ElevenLabs TTS error:", err.message);
        reject(err);
      });
    });

    return this.connectingPromise;
  }

  private flushBuffer(trigger: boolean): void {
    if (!this.buffer || this.stopped) return;
    const toSend = normalizeForTTS(this.buffer) + " ";
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
    this.buffer += chunk;

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
    if (this.elevenWs && this.elevenWs.readyState === WebSocket.OPEN) {
      const ws = this.elevenWs;
      // Send empty text to signal end-of-generation.
      // ElevenLabs flushes remaining audio then sends a close frame.
      ws.send(JSON.stringify({ text: "" }));

      // Wait for all audio chunks to arrive before signaling audio_done.
      // The socket will close after ElevenLabs sends the last chunk —
      // we detect that to know when to proceed, then reopen on next turn.
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 3000);
        ws.on("close", () => { clearTimeout(timeout); resolve(); });
      });

      this.wsReady = false;
      this.elevenWs = null;
    }
  }

  stop(): void {
    this.stopped = true;
    this.wsReady = false;
    this.connectingPromise = null;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.elevenWs) {
      const ws = this.elevenWs;
      this.elevenWs = null;
      try {
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
