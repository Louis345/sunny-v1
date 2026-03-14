import type { Express, Request, Response } from "express";
import { ELLI, MATILDA } from "../companions/loader";
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
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
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
}
