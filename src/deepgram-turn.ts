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

export async function connectFlux(callbacks: FluxCallbacks): Promise<FluxHandle> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY not set in .env");

  const client = new DeepgramClient({ apiKey });

  const socket = await client.listen.v2.connect({
    model: "flux-general-en",
    encoding: "linear16",
    sample_rate: 16000,
    eot_threshold: 0.6,
    eager_eot_threshold: 0.45,
    eot_timeout_ms: 3000,
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
