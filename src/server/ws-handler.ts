import type { WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { registerMapSessionWebSocket } from "./map-coordinator";
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
      case "map_session_attach": {
        const body = msg as { childId?: string; sessionId?: string };
        const childId =
          typeof body.childId === "string"
            ? body.childId.trim()
            : typeof body.sessionId === "string"
              ? body.sessionId.trim()
              : "";
        if (!childId) {
          ws.send(
            JSON.stringify({ type: "error", message: "childId required" }),
          );
          return;
        }
        console.log("[ws-handler] map_session_attach for:", childId);
        registerMapSessionWebSocket(childId, ws);
        break;
      }

      case "start_session": {
        const raw = msg as {
          child?: string;
          diagKiosk?: boolean;
        };
        const child = raw.child;
        const diagKiosk = raw.diagKiosk === true;
        const validChild =
          child === "Ila" ||
          child === "Reina" ||
          (child === "creator" && diagKiosk);
        if (!validChild) {
          ws.send(
            JSON.stringify({ type: "error", message: "Invalid child name" })
          );
          return;
        }
        if (diagKiosk && child !== "creator") {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Creator / Diag kiosk requires child=creator (Charlotte + diagnostic prompt)",
            })
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
        session = new SessionManager(ws, child, diagKiosk);
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
        session.canvasDone(msg as unknown as Record<string, unknown>);
        break;
      }

      case "playback_done": {
        if (!session) return;
        session.playbackDone();
        break;
      }

      case "test_transcript": {
        if (!session) return;
        const text = (msg as Record<string, string>).text;
        if (text) session.injectTranscript(text);
        break;
      }

      case "worksheet_answer": {
        if (!session) return;
        session.receiveWorksheetAnswer(
          msg as unknown as {
            problemId?: string;
            fieldId?: string;
            value?: string;
          },
        );
        break;
      }

      case "game_event": {
        if (!session) return;
        const raw = msg as { event?: unknown };
        const ev = raw.event;
        if (ev && typeof ev === "object") {
          session.handleGameEvent(ev as Record<string, unknown>);
        }
        break;
      }

      case "tool_call": {
        if (!session) return;
        const m = msg as Record<string, unknown>;
        const tool = String(m.tool ?? "");
        const args = (m.args ?? {}) as Record<string, unknown>;
        session.applyClientToolCall(tool, args);
        break;
      }

      case "reading_progress": {
        if (!session) return;
        session.receiveReadingProgress(msg as Record<string, unknown>);
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
