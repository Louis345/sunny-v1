import Anthropic from "@anthropic-ai/sdk";
import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { ELLI, MATILDA } from "../companions/loader";
import { generateStoryImage } from "../utils/generateStoryImage";
import { buildProfile } from "../profiles/buildProfile";
import type { NodeResult } from "../shared/adventureTypes";
import {
  applyNodeResult,
  broadcastTestMapCompanionAct,
  broadcastTestMapCompanionEmote,
  broadcastTestMapCompanionEvent,
  handleMapClientMessage,
  MapSessionError,
  recordExplicitMapRating,
  startMapSession,
} from "./map-coordinator";
import { tryPushCreatorDiagReadingKaraoke } from "./session-manager";
import { loadChildFiles } from "../utils/loadChildFiles";
import { loadAttemptHistory } from "../utils/attempts";

const companions = {
  Ila: ELLI,
  Reina: MATILDA,
} as const;

type ChildName = keyof typeof companions;

const GAME_GRADE_HAIKU_MODEL = "claude-haiku-4-5-20251001";

function isValidChild(name: string): name is ChildName {
  return name === "Ila" || name === "Reina";
}

function stripJsonFences(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return t;
}

function normalizeWrittenScore(raw: unknown): 0 | 0.5 | 1 {
  if (raw === 0 || raw === "0") return 0;
  if (raw === 0.5 || raw === "0.5") return 0.5;
  if (raw === 1 || raw === "1") return 1;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw <= 0) return 0;
    if (raw < 1) return 0.5;
    return 1;
  }
  return 0;
}

export function setupRoutes(app: Express): void {
  const themesDir = path.resolve(process.cwd(), "src", "themes");
  if (fs.existsSync(themesDir)) {
    app.use("/themes", express.static(themesDir));
  }

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  /** Visual PoC — `web/public/worlds/proof-of-concept.html`; uses server-side GROK_API_KEY. */
  app.get("/api/grok-image", async (req: Request, res: Response) => {
    const prompt =
      typeof req.query.prompt === "string" ? req.query.prompt.trim() : "";
    if (!prompt) {
      return res.status(400).json({ error: "prompt required" });
    }
    try {
      const url = await generateStoryImage(prompt, { useDirectScene: true });
      res.json({ url });
    } catch (e: unknown) {
      res.status(500).json({ error: String(e) });
    }
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

  app.get("/api/companions", async (_req: Request, res: Response) => {
    const rows = await Promise.all(
      Object.entries(companions).map(async ([childName, config]) => {
        const profile = await buildProfile(childName.toLowerCase());
        const ui = profile?.ui as { accentColor?: string; accentBg?: string } | undefined;
        return {
          childName,
          companionName: config.name,
          emoji: config.emoji,
          voiceId: config.voiceId,
          openingLine: config.openingLine,
          goodbye: config.goodbye,
          accentColor: ui?.accentColor ?? "#7C3AED",
          accentBg: ui?.accentBg ?? "#F3E8FF",
        };
      }),
    );
    const configs = [
      ...rows,
      {
        childName: "creator",
        companionName: "Charlotte",
        emoji: "🌟",
        voiceId: "",
        openingLine: "",
        goodbye: "",
        accentColor: "#fbbf24",
        accentBg: "#1e1b2e",
      },
    ];
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
        const { mapState, companionEvent } = await applyNodeResult(
          sessionId,
          body.result,
        );
        return res.json({ mapState, companionEvent });
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

  /** Diag: push karaoke reading onto an active creator diag voice WebSocket session. */
  app.post("/api/map/test-reading-mode", (req: Request, res: Response) => {
    const childId =
      typeof req.body?.childId === "string"
        ? req.body.childId.trim().toLowerCase()
        : "";
    const bodyText =
      typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const text =
      bodyText ||
      "Chimpanzees are apes. They inhabit steamy rainforests and other parts of Africa. Chimps gather in bands that number from 15 to 150 chimps.";
    if (childId !== "creator") {
      return res.status(400).json({ error: "childId must be creator" });
    }
    const out = tryPushCreatorDiagReadingKaraoke(text);
    if (!out.ok) {
      return res.status(409).json({ error: out.error });
    }
    res.json({ ok: true });
  });

  /** TEMP TEST ONLY — trigger-based or emote+intensity for map WebSocket. */
  app.post("/api/map/test-companion-event", (req: Request, res: Response) => {
    const childId =
      typeof req.body?.childId === "string" ? req.body.childId : "";
    const emoteRaw = req.body?.emote;
    if (typeof emoteRaw === "string" && emoteRaw.trim() !== "") {
      const intensityRaw = req.body?.intensity;
      const intensity =
        typeof intensityRaw === "number" && Number.isFinite(intensityRaw)
          ? intensityRaw
          : 0.8;
      const out = broadcastTestMapCompanionEmote(childId, emoteRaw.trim(), intensity);
      if (!out.ok) {
        return res.status(400).json(out);
      }
      return res.json(out);
    }
    const actType = req.body?.type;
    const actPayload = req.body?.payload;
    if (
      typeof actType === "string" &&
      actType.trim() !== "" &&
      actPayload &&
      typeof actPayload === "object" &&
      !Array.isArray(actPayload)
    ) {
      const out = broadcastTestMapCompanionAct(childId, {
        type: actType.trim(),
        payload: actPayload as Record<string, unknown>,
      });
      if (!out.ok) {
        return res.status(400).json(out);
      }
      return res.json(out);
    }
    const trigger =
      typeof req.body?.trigger === "string"
        ? req.body.trigger
        : "correct_answer";
    const out = broadcastTestMapCompanionEvent(childId, trigger);
    if (!out.ok) {
      return res.status(400).json(out);
    }
    res.json(out);
  });

  /** Haiku grades written homework answers for static game iframes (see generateGame.ts). */
  app.post("/api/game-grade-written", async (req: Request, res: Response) => {
    try {
      const question =
        typeof req.body?.question === "string" ? req.body.question.trim() : "";
      const studentAnswer =
        typeof req.body?.studentAnswer === "string"
          ? req.body.studentAnswer.trim()
          : "";
      if (!question || !studentAnswer) {
        return res
          .status(400)
          .json({ error: "question and studentAnswer required" });
      }
      const rawKp = req.body?.keyPoints;
      const keyPoints = Array.isArray(rawKp)
        ? rawKp.filter((x): x is string => typeof x === "string")
        : [];
      const glRaw = req.body?.gradeLevel;
      const gradeLevel =
        typeof glRaw === "number" && Number.isFinite(glRaw)
          ? glRaw
          : typeof glRaw === "string" && glRaw.trim() !== ""
            ? Number(glRaw)
            : 2;
      const gradeLevelSafe = Number.isFinite(gradeLevel) ? gradeLevel : 2;

      const client = new Anthropic();
      const gradeUser = `question: ${question}
studentAnswer: ${studentAnswer}
keyPoints: ${JSON.stringify(keyPoints)}
gradeLevel: ${gradeLevelSafe}

Grade this student answer. Return JSON only:
{ "correct": boolean, "partial": boolean,
  "feedback": string (one encouraging sentence),
  "score": 0|0.5|1 }`;

      const msg = await client.messages.create({
        model: GAME_GRADE_HAIKU_MODEL,
        max_tokens: 256,
        messages: [{ role: "user", content: gradeUser }],
      });
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const stripped = stripJsonFences(text);
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(stripped) as Record<string, unknown>;
      } catch {
        const start = stripped.indexOf("{");
        const end = stripped.lastIndexOf("}");
        if (start < 0 || end <= start) {
          return res.status(502).json({ error: "invalid_grade_json" });
        }
        parsed = JSON.parse(stripped.slice(start, end + 1)) as Record<
          string,
          unknown
        >;
      }

      const score = normalizeWrittenScore(parsed.score);
      const correct = Boolean(parsed.correct);
      const partial = Boolean(parsed.partial);
      const feedback =
        typeof parsed.feedback === "string" && parsed.feedback.trim() !== ""
          ? parsed.feedback.trim()
          : "Nice try — keep going!";

      res.json({ correct, partial, feedback, score });
    } catch (err: unknown) {
      console.error("  🎮 [game-grade-written] failed", err);
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  const webPublic = path.resolve(process.cwd(), "web", "public");
  if (fs.existsSync(webPublic)) {
    app.use(express.static(webPublic));
  }
}
