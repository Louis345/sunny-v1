import WebSocket from "ws";

const WS_BASE = "wss://api.elevenlabs.io/v1/text-to-speech";
const FLUSH_INTERVAL_MS = 150;

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
    `?model_id=${encodeURIComponent("eleven_multilingual_v2")}` +
    `&output_format=pcm_22050_16` +
    `&optimize_streaming_latency=3`
  );
}

export class WsTtsBridge {
  private browserWs: WebSocket;
  private voiceId: string;
  private elevenWs: WebSocket | null = null;
  private apiKey: string;
  private wsReady = false;
  private buffer = "";
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(browserWs: WebSocket, voiceId: string) {
    this.browserWs = browserWs;
    this.voiceId = voiceId;
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error("ELEVENLABS_API_KEY not set in .env");
    this.apiKey = key;
  }

  async connect(): Promise<void> {
    if (this.elevenWs && this.elevenWs.readyState === WebSocket.OPEN) {
      this.elevenWs.close();
      this.elevenWs = null;
      this.wsReady = false;
    }

    return new Promise((resolve, reject) => {
      const url = buildWsUrl(this.voiceId);
      this.elevenWs = new WebSocket(url);

      this.elevenWs.on("open", () => {
        const locators = getPronunciationLocators();
        this.elevenWs!.send(
          JSON.stringify({
            text: " ",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            xi_api_key: this.apiKey,
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

      this.elevenWs.on("message", (data: Buffer) => {
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

      this.elevenWs.on("error", (err) => {
        console.error("  🔴 ElevenLabs TTS error:", err.message);
        reject(err);
      });
    });
  }

  private flushBuffer(trigger: boolean): void {
    if (!this.buffer || this.stopped || !this.elevenWs) return;
    if (this.elevenWs.readyState !== WebSocket.OPEN) return;
    const toSend = normalizeForTTS(this.buffer) + " ";
    this.elevenWs.send(
      JSON.stringify({
        text: toSend,
        ...(trigger && { try_trigger_generation: true }),
      })
    );
    this.buffer = "";
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
    if (!this.wsReady || !this.elevenWs) return;

    if (/[.!?,;:\n]/.test(chunk)) {
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
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
    if (this.elevenWs && this.elevenWs.readyState === WebSocket.OPEN) {
      this.elevenWs.send(JSON.stringify({ text: "" }));
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.elevenWs) {
      this.elevenWs.close();
      this.elevenWs = null;
    }
  }

  close(): void {
    this.stop();
  }
}
