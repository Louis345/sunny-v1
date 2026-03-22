import "dotenv/config";
import { DeepgramClient } from "@deepgram/sdk";

export interface FluxCallbacks {
  onStartOfTurn: () => void;
  onEndOfTurn: (transcript: string) => void;
  onInterim: (transcript: string) => void;
  onEagerEndOfTurn?: (transcript: string) => void;
  onTurnResumed?: () => void;
  onError: (err: Error) => void;
  onOpen: () => void;
}

export interface FluxHandle {
  sendAudio: (chunk: Buffer) => void;
  close: () => void;
}

/** Exported for tests and tuning visibility — keep in sync with connectFlux(). */
export const FLUX_LISTEN_OPTIONS = {
  model: "flux-general-en",
  encoding: "linear16" as const,
  sample_rate: 16000,
  eot_threshold: 0.8,
  eager_eot_threshold: 0.65,
  eot_timeout_ms: 5000,
} as const;

export async function connectFlux(callbacks: FluxCallbacks): Promise<FluxHandle> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY not set in .env");

  const client = new DeepgramClient({ apiKey });

  const socket = await client.listen.v2.connect({
    ...FLUX_LISTEN_OPTIONS,
    Authorization: `Token ${apiKey}`,
  });

  socket.on("open", () => {
    callbacks.onOpen();
  });

  socket.on("message", (msg) => {
    if (msg.type === "Connected") return;

    if (msg.type === "TurnInfo") {
      switch (msg.event) {
        case "StartOfTurn":
          callbacks.onStartOfTurn();
          break;
        case "Update":
          if (msg.transcript) callbacks.onInterim(msg.transcript);
          break;
        case "EagerEndOfTurn":
          callbacks.onEagerEndOfTurn?.(msg.transcript);
          break;
        case "TurnResumed":
          callbacks.onTurnResumed?.();
          break;
        case "EndOfTurn":
          callbacks.onEndOfTurn(msg.transcript);
          break;
      }
    }
  });

  socket.on("error", (err) => {
    callbacks.onError(err);
  });

  socket.on("close", () => {
    // Reconnection handled by SDK's ReconnectingWebSocket
  });

  socket.connect();
  await socket.waitForOpen();

  return {
    sendAudio(chunk: Buffer) {
      if (socket.readyState === 1) {
        socket.sendMedia(chunk);
      }
    },
    close() {
      socket.close();
    },
  };
}
