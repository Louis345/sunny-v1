import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { setupRoutes } from "./server/routes";
import { handleWsConnection } from "./server/ws-handler";

const PORT = parseInt(process.env.PORT || "3001", 10);
const isKiosk = process.argv.includes("--kiosk");
const serveStatic = process.argv.includes("--serve-static");

const app = express();
app.use(cors());
app.use(express.json());

setupRoutes(app);

// Serve built frontend in production (--serve-static flag)
if (serveStatic) {
  const distPath = path.resolve(process.cwd(), "web/dist");
  app.use(express.static(distPath));

  // SPA fallback — serve index.html for all non-API routes (Express 5 uses named wildcard)
  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (ws, req) => {
  handleWsConnection(ws, req);
});

httpServer.listen(PORT, () => {
  console.log(`\n  🌟 Project Sunny server on http://localhost:${PORT}`);
  console.log(`  📡 WebSocket at ws://localhost:${PORT}/ws\n`);

  if (serveStatic) {
    console.log("  📁 Serving static frontend from web/dist\n");
  }
  if (isKiosk) {
    console.log(
      "  🖥️  Kiosk mode enabled — Chromium launch coming in Phase 3\n"
    );
  }
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`  🛑 Shutting down (${signal})...`);

  try {
    wss.close();
    httpServer.close();
  } catch (_) {
    // ignore cleanup errors
  }

  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
