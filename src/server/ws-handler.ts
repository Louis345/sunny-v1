import type { WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { SessionManager } from "./session-manager";

export function handleWsConnection(
  ws: WebSocket,
  req: IncomingMessage
): void {
  const ts = () => new Date().toISOString();
  console.log(
    `  📡 [${ts()}] WebSocket connected from ${req.socket.remoteAddress}`
  );

  let session: SessionManager | null = null;

  ws.on("message", async (raw) => {
    let msg: { type?: string; child?: string; data?: string };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    switch (msg.type) {
      case "start_session": {
        const child = msg.child;
        if (child !== "Ila" && child !== "Reina") {
          ws.send(
            JSON.stringify({ type: "error", message: "Invalid child name" })
          );
          return;
        }
        if (session) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Session already active",
            })
          );
          return;
        }
        session = new SessionManager(ws, child);
        await session.start();
        break;
      }

      case "audio": {
        if (!session) return;
        const pcm = Buffer.from(msg.data ?? "", "base64");
        session.receiveAudio(pcm);
        break;
      }

      case "barge_in": {
        if (!session) return;
        session.bargeIn();
        break;
      }

      case "end_session": {
        if (!session) return;
        await session.end();
        session = null;
        break;
      }

      case "canvas_done": {
        if (!session) return;
        session.canvasDone();
        break;
      }

      case "playback_done": {
        if (!session) return;
        session.playbackDone();
        break;
      }

      default:
        ws.send(
          JSON.stringify({ type: "error", message: `Unknown type: ${msg.type}` })
        );
    }
  });

  ws.on("close", async () => {
    console.log(`  📡 [${ts()}] WebSocket disconnected`);
    if (session) {
      await session.end().catch(console.error);
      session = null;
    }
  });

  ws.on("error", (err) => {
    console.error(`  📡 [${ts()}] WebSocket error:`, err.message);
  });
}
