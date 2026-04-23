import type { WebSocket } from "ws";
import type { IncomingMessage } from "http";
import {
  handleMapSocketIframeCompanionEvent,
  registerMapSessionWebSocket,
} from "./map-coordinator";
import { createAudioGate } from "./audioGate";
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
  let audioGate: ReturnType<typeof createAudioGate> | null = null;

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

      case "map_iframe_companion_event": {
        if (handleMapSocketIframeCompanionEvent(ws, msg)) {
          break;
        }
        ws.send(
          JSON.stringify({
            type: "error",
            message:
              "map_iframe_companion_event requires prior map_session_attach on this socket",
          }),
        );
        break;
      }

      case "start_session": {
        const raw = msg as {
          child?: string;
          diagKiosk?: boolean;
          silentTts?: boolean;
          sttOnly?: boolean;
        };
        const child = raw.child;
        const diagKiosk = raw.diagKiosk === true;
        const silentTts = raw.silentTts === true;
        const sttOnly = raw.sttOnly === true;
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
        const sessionOptions =
          silentTts || sttOnly
            ? {
                ...(silentTts ? { silentTts: true as const } : {}),
                ...(sttOnly ? { sttOnly: true as const } : {}),
              }
            : undefined;
        session = new SessionManager(ws, child, diagKiosk, sessionOptions);
        await session.start();
        audioGate = createAudioGate({
          sendAudio: (pcm) => {
            session?.receiveAudio(pcm);
          },
        });
        break;
      }

      case "set_mute": {
        if (!audioGate) return;
        const m = msg as { muted?: boolean };
        audioGate.setMute(m.muted === true);
        break;
      }

      case "audio": {
        if (!session || !audioGate) return;
        const pcm = Buffer.from(msg.data ?? "", "base64");
        audioGate.receiveChunk(pcm);
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
        audioGate = null;
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

      case "screenshot_response": {
        if (!session) return;
        const sr = msg as { data?: string | null };
        session.receiveScreenshot(
          typeof sr.data === "string" ? sr.data : null,
        );
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
      audioGate = null;
    }
  });

  ws.on("error", (err) => {
    console.error(`  📡 [${ts()}] WebSocket error:`, err.message);
  });
}
