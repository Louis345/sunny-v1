import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { ELLI, MATILDA } from "../companions/loader";
import { buildProfile } from "../profiles/buildProfile";
import type { NodeResult } from "../shared/adventureTypes";
import {
  applyNodeResult,
  handleMapClientMessage,
  MapSessionError,
  recordExplicitMapRating,
  startMapSession,
} from "./map-coordinator";
import { loadChildFiles } from "../utils/loadChildFiles";
import { loadAttemptHistory } from "../utils/attempts";

const companions = {
  Ila: ELLI,
  Reina: MATILDA,
} as const;

type ChildName = keyof typeof companions;

function isValidChild(name: string): name is ChildName {
  return name === "Ila" || name === "Reina";
}

export function setupRoutes(app: Express): void {
  const themesDir = path.resolve(process.cwd(), "src", "themes");
  if (fs.existsSync(themesDir)) {
    app.use("/themes", express.static(themesDir));
  }

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/profile/:childId", async (req: Request, res: Response) => {
    const childId =
      typeof req.params.childId === "string" ? req.params.childId : "";
    if (!childId.trim()) {
      return res.status(400).json({ error: "Missing childId" });
    }
    try {
      const profile = await buildProfile(childId);
      if (!profile) {
        return res.status(404).json({ error: "Unknown profile" });
      }
      res.json(profile);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/companions", (_req: Request, res: Response) => {
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

  app.get("/api/child/:name/context", (req: Request, res: Response) => {
    const name = typeof req.params.name === "string" ? req.params.name : "";
    if (!isValidChild(name)) {
      return res.status(404).json({ error: "Unknown child" });
    }
    try {
      const data = loadChildFiles(name);
      res.json(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/child/:name/stats", (req: Request, res: Response) => {
    const name = typeof req.params.name === "string" ? req.params.name : "";
    if (!isValidChild(name)) {
      return res.status(404).json({ error: "Unknown child" });
    }
    try {
      const attempts = loadAttemptHistory(name);
      res.json({ attempts, streak: 0, totalSessions: 0 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/homework/:name/:date/:filename", (req: Request, res: Response) => {
    const name = typeof req.params.name === "string" ? req.params.name : "";
    const date = typeof req.params.date === "string" ? req.params.date : "";
    const filename = typeof req.params.filename === "string" ? req.params.filename : "";
    if (!isValidChild(name)) {
      return res.status(404).json({ error: "Unknown child" });
    }
    if (!/^[\w.\- ]+$/.test(filename)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    const base = path.resolve(process.cwd(), "homework", name.toLowerCase(), date);
    const filePath = path.resolve(base, filename);
    if (!filePath.startsWith(base)) {
      return res.status(400).json({ error: "Invalid path" });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    res.sendFile(filePath);
  });

  app.post("/api/map/start", async (req: Request, res: Response) => {
    const childId =
      typeof req.body?.childId === "string" ? req.body.childId : "";
    if (!childId.trim()) {
      return res.status(400).json({ error: "childId required" });
    }
    try {
      const out = await startMapSession(childId);
      res.json(out);
    } catch (err: unknown) {
      if (err instanceof MapSessionError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/map/node-complete", async (req: Request, res: Response) => {
    const body = req.body as {
      sessionId?: string;
      result?: NodeResult;
      phase?: string;
      nodeId?: string;
      rating?: unknown;
    };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }
    try {
      if (body.phase === "click" && typeof body.nodeId === "string") {
        const events = handleMapClientMessage(sessionId, {
          type: "node_click",
          payload: { nodeId: body.nodeId },
        });
        return res.json({ events });
      }
      if (body.phase === "rating" && typeof body.nodeId === "string") {
        const raw = body.rating;
        const norm: "like" | "dislike" | null =
          raw === "like" ? "like" : raw === "dislike" ? "dislike" : null;
        await recordExplicitMapRating(sessionId, body.nodeId, norm);
        return res.json({ ok: true });
      }
      if (body.result) {
        const mapState = await applyNodeResult(sessionId, body.result);
        return res.json({ mapState });
      }
      return res.status(400).json({ error: "invalid body" });
    } catch (err: unknown) {
      if (err instanceof MapSessionError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });
}
