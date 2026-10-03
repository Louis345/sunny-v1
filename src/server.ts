import { loadSunnyRuntimeEnvironment } from "./scripts/sunnyMenu";
loadSunnyRuntimeEnvironment();
import "./server/server";
import express from "express";
import cors from "cors";
import path from "path";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { setupRoutes } from "./server/routes";
import { handleWsConnection } from "./server/ws-handler";
import { openKioskCharts } from "./chart/kioskLifecycle";
import { endActiveVoiceSessions } from "./server/voice-session-registry";

import { setupChartSpellingRoutes } from './server/chartSpellingRoutes';
import { setupKioskHealthRoutes } from './server/kioskHealthRoutes';
import { spellingVoice } from './chart/spelling/voice';
import { spellingPlanner } from './chart/spelling/provider';
const spellingChart = process.env.SUNNY_SPELLING_CHART === '1';
const PORT = parseInt(process.env.PORT || "3001", 10);
const isKiosk = process.argv.includes("--kiosk");
const serveStatic = process.argv.includes("--serve-static");

// Validate/open the declared charts before accepting any HTTP or kiosk traffic.
const charts = openKioskCharts(process.env, undefined, isKiosk);
const app = express();
if (!spellingChart) app.use(cors());
app.use(express.json({ limit: "18mb" }));

app.get("/api/chart/status", (_req, res) => res.json({...charts.status(), learningEventsConnected: spellingChart && charts.status().connection === "open"}));
if (spellingChart) {
  if (charts.status().connection !== 'open') throw new Error('spelling_chart_requires_persistent_connection');
  setupKioskHealthRoutes(app);
  setupChartSpellingRoutes(app, {children: charts.status().children, get: charts.get, token: process.env.SUNNY_KIOSK_TOKEN || '', provider: spellingPlanner, voice: spellingVoice});
  console.log(' 🎮 [spelling-chart] [routes] [connected] legacy_learning=disabled');
  app.get('/', (req,res) => res.redirect(302, '/spelling' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')));
} else setupRoutes(app);

// Without the built SPA, `web/public` has no index.html — send `/` straight to the world PoC.
if (!serveStatic) {
  app.get("/", (_req, res) => {
    res.redirect(302, "/worlds/proof-of-concept.html");
  });
}

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
  if (spellingChart) ws.close(1008, 'chart_spelling_uses_http');
  else handleWsConnection(ws, req);
});

httpServer.listen(PORT, () => {
  console.log(`\n  🌟 Project Sunny server on http://localhost:${PORT}`);
  console.log(`  📡 WebSocket at ws://localhost:${PORT}/ws\n`);

  if (serveStatic) {
    console.log("  📁 Serving static frontend from web/dist\n");
  } else {
    console.log(
      `  🗺️  World PoC: http://localhost:${PORT}/ → /worlds/proof-of-concept.html\n`
    );
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

  let exitCode = 0;
  try {
    await endActiveVoiceSessions();
    wss.close();
    httpServer.close();
  } catch (error) {
    exitCode = 1;
    console.error(" 🎮 [server] [shutdown] [failed]", error);
  } finally {
    try { charts.close(); }
    catch (error) { exitCode = 1; console.error(" 🎮 [chart] [shutdown] [failed]", error); }
  }

  process.exit(exitCode);
}

process.on("SIGINT", () => { void shutdown("SIGINT").catch((error) => { console.error(" 🎮 [server] [shutdown] [failed]", error); process.exit(1); }); });
process.on("SIGTERM", () => { void shutdown("SIGTERM").catch((error) => { console.error(" 🎮 [server] [shutdown] [failed]", error); process.exit(1); }); });
