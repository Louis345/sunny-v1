import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import path from "path";
import { ELLI, MATILDA } from "../companions/loader";

export { CANVAS_TEST_PRESETS } from "./canvas-test-presets";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const companions = { Ila: ELLI, Reina: MATILDA } as const;

// API routes — so ChildPicker and frontend work without main server
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/companions", (_req, res) => {
  const configs = Object.entries(companions).map(([childName, config]) => ({
    childName,
    companionName: config.name,
    emoji: config.emoji,
    voiceId: config.voiceId,
    openingLine: config.openingLine,
    goodbye: config.goodbye,
  }));
  res.json(configs);
});

// Canvas test page — serves the app so /test/canvas opens the UI directly
app.get("/test/canvas", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "web/dist/index.html"));
});

// Serve the existing frontend (run npm run web:build first)
app.use(express.static(path.resolve(process.cwd(), "web/dist")));

let activeSocket: WebSocket | null = null;

wss.on("connection", (ws) => {
  activeSocket = ws;
  console.log("  🖥️  Canvas test client connected");

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "canvas_done") {
        console.log("  ✅ canvas_done received");
      }
      if (msg.type === "canvas_draw") {
        ws.send(JSON.stringify(msg));
        console.log(
          `  🎨 canvas_draw echoed: mode="${msg.mode}" content="${msg.content ?? ""}" gameUrl="${(msg as { gameUrl?: string }).gameUrl ?? ""}"`
        );
      }
      if (msg.type === "tool_call" && (msg.tool === "showCanvas" || msg.tool === "show_canvas")) {
        ws.send(JSON.stringify(msg));
        const args = (msg.args ?? {}) as Record<string, unknown>;
        console.log(
          `  🎨 tool_call echoed: mode="${args.mode}" content="${args.content ?? ""}"`
        );
      }
      if (msg.type === "start_session") {
        ws.send(
          JSON.stringify({
            type: "session_started",
            childName: msg.child ?? "Ila",
            companionName: "Elli",
            emoji: "🌟",
            voiceId: "",
            openingLine: "",
            goodbye: "",
          })
        );
        ws.send(JSON.stringify({ type: "session_state", state: "IDLE" }));
      }
    } catch {
      // ignore parse errors
    }
  });
});

// Test API — POST to trigger canvas events
app.use(express.json());

app.post("/test/canvas", (req, res) => {
  const { mode, content, label, svg } = req.body;
  if (!activeSocket) {
    return res.status(400).json({ error: "No client connected" });
  }
  // Match server format: client expects args/result with mode, content, label, svg
  activeSocket.send(
    JSON.stringify({
      type: "canvas_draw",
      args: { mode, content, label, svg },
      result: { mode, content, label, svg },
    })
  );
  console.log(
    `  🎨 canvas_draw sent: mode="${mode}" content="${content ?? ""}"`
  );
  res.json({ sent: true });
});

app.post("/test/state", (req, res) => {
  const { state } = req.body;
  if (!activeSocket) {
    return res.status(400).json({ error: "No client connected" });
  }
  activeSocket.send(JSON.stringify({ type: "session_state", state }));
  console.log(`  🔄 session_state sent: "${state}"`);
  res.json({ sent: true });
});

const PORT = parseInt(process.env.PORT ?? "3002", 10);

server.listen(PORT, () => {
  console.log(`
  🎨 Canvas Test Harness
  ─────────────────────────────────────────
  Open: http://localhost:${PORT === 3001 ? 5173 : PORT}
  (no AI — zero tokens burned)
  `);
});
