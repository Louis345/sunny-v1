import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
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
  listSavedThemes,
} from "./map-coordinator";
import {
  tryPushCreatorDiagPronunciation,
  tryPushCreatorDiagReadingKaraoke,
} from "./session-manager";
import { loadChildFiles } from "../utils/loadChildFiles";
import { loadAttemptHistory } from "../utils/attempts";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import { readWordBank, ensureWordInBank, updateWordTrack } from "../utils/wordBankIO";
import { createFreshSM2Track } from "../context/schemas/wordBank";
import { recordAttempt } from "../engine/learningEngine";
import { computeProgression } from "../engine/progression";
import { WILSON_STEPS } from "../modes/wilson/wilsonSteps";
import { isSunnyDiagMode } from "../utils/runtimeMode";
import {
  applyPassiveDepletion,
  applyTamagotchiFill,
} from "../engine/vrrEngine";
import { DEFAULT_TAMAGOTCHI } from "../shared/vrrTypes";
import { ensureQuestHtmlContract } from "../scripts/ingestHomework";
import { generateQuestGameHtml } from "../scripts/generateGame";
import { applySpellCheckMapResults } from "./spellCheckMapResults";

const companions = {
  Ila: ELLI,
  Reina: MATILDA,
} as const;

type ChildName = keyof typeof companions;

const GAME_GRADE_HAIKU_MODEL = "claude-haiku-4-5-20251001";
const HOMEWORK_SONNET_MODEL = "claude-sonnet-4-20250514";

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

const DIAG_REWARD_TRIGGER_TYPES = new Set([
  "correct_attempt",
  "mastered_word",
  "session_complete",
  "wilson_step",
  "castle_bonus",
  "level_up",
]);

function pickDiagSpellingWord(childId: string): string {
  const bank = readWordBank(childId);
  const first = bank.words[0]?.word;
  if (first) return first;
  const nw = `diag-mastered-seed-${randomUUID().slice(0, 8)}`;
  ensureWordInBank(childId, nw, "spelling", "diag_trigger");
  return nw;
}

/**
 * Diag-only reward / progression trigger (see POST /api/diag/trigger-reward).
 * Exported for unit tests.
 */
export function handleDiagTriggerReward(
  body: unknown,
  env: NodeJS.ProcessEnv = process.env,
): { status: number; body: Record<string, unknown> } {
  if (!isSunnyDiagMode(env)) {
    return { status: 403, body: { ok: false, error: "diag_only" } };
  }

  const b = body as Record<string, unknown>;
  const type = typeof b.type === "string" ? b.type.trim() : "";
  const childIdRaw = typeof b.childId === "string" ? b.childId.trim() : "";
  const childId = childIdRaw.toLowerCase();

  if (!DIAG_REWARD_TRIGGER_TYPES.has(type)) {
    return { status: 400, body: { ok: false, error: "unknown_type" } };
  }
  if (!childId) {
    return { status: 400, body: { ok: false, error: "childId_required" } };
  }

  const profile = readLearningProfile(childId);
  if (!profile) {
    return { status: 400, body: { ok: false, error: "unknown_child" } };
  }

  try {
    switch (type) {
      case "correct_attempt":
        recordAttempt(childId, {
          word: `diag-correct-${randomUUID()}`,
          domain: "spelling",
          correct: true,
          quality: 4,
          scaffoldLevel: 2,
          responseTimeMs: 1,
        });
        break;
      case "mastered_word": {
        const word = pickDiagSpellingWord(childId);
        ensureWordInBank(childId, word, "spelling", "diag_trigger");
        const bank = readWordBank(childId);
        const entry = bank.words.find((w) => w.word === word);
        if (!entry) {
          return { status: 500, body: { ok: false, error: "diag_mastered_word_bank" } };
        }
        const today = new Date().toISOString().slice(0, 10);
        const prev = entry.tracks.spelling ?? createFreshSM2Track(today);
        const next = {
          ...prev,
          mastered: true,
          masteredDate: new Date().toISOString(),
          history: [
            ...prev.history,
            {
              date: today,
              quality: 4 as const,
              scaffoldLevel: 2 as const,
              correct: true,
            },
          ],
        };
        updateWordTrack(childId, word, "spelling", next);
        break;
      }
      case "session_complete": {
        writeLearningProfile(childId, {
          ...profile,
          sessionStats: {
            ...profile.sessionStats,
            totalSessions: profile.sessionStats.totalSessions + 1,
          },
        });
        break;
      }
      case "wilson_step": {
        const maxStep = WILSON_STEPS.length;
        const nextStep = Math.min(
          maxStep,
          (profile.sessionStats.currentWilsonStep ?? 1) + 1,
        );
        writeLearningProfile(childId, {
          ...profile,
          sessionStats: {
            ...profile.sessionStats,
            currentWilsonStep: nextStep,
          },
        });
        break;
      }
      case "castle_bonus": {
        for (let i = 0; i < 5; i++) {
          recordAttempt(childId, {
            word: `diag-castle-${randomUUID()}-${i}`,
            domain: "spelling",
            correct: true,
            quality: 4,
            scaffoldLevel: 2,
            responseTimeMs: 1,
          });
        }
        break;
      }
      case "level_up": {
        for (let i = 0; i < 10; i++) {
          recordAttempt(childId, {
            word: `diag-level-${randomUUID()}-${i}`,
            domain: "spelling",
            correct: true,
            quality: 4,
            scaffoldLevel: 2,
            responseTimeMs: 1,
          });
        }
        break;
      }
      default:
        return { status: 400, body: { ok: false, error: "unknown_type" } };
    }

    const snap = computeProgression(childId);
    const event = {
      timestamp: Date.now(),
      type: "progression" as const,
      payload: { ...snap } as Record<string, unknown>,
    };
    return { status: 200, body: { ok: true, event } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 500, body: { ok: false, error: message } };
  }
}

export function setupRoutes(app: Express): void {
  const themesDir = path.resolve(process.cwd(), "src", "themes");
  if (fs.existsSync(themesDir)) {
    app.use("/themes", express.static(themesDir));
  }

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.post("/api/diag/trigger-reward", (req: Request, res: Response) => {
    const out = handleDiagTriggerReward(req.body ?? {}, process.env);
    res.status(out.status).json(out.body);
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

  app.post("/api/profile/:childId/vrr-claim", (req: Request, res: Response) => {
    const childId =
      typeof req.params.childId === "string" ? req.params.childId.trim() : "";
    if (!childId) {
      return res.status(400).json({ error: "Missing childId" });
    }
    const rewardId = String(
      (req.body as { rewardId?: string } | undefined)?.rewardId ?? "",
    );
    if (!rewardId) {
      return res.status(400).json({ error: "rewardId required" });
    }
    const profile = readLearningProfile(childId);
    if (!profile) {
      return res.status(404).json({ error: "Unknown profile" });
    }
    const nowIso = new Date().toISOString();
    const base = profile.tamagotchi ?? {
      ...DEFAULT_TAMAGOTCHI,
      lastSeenAt: nowIso,
    };
    const depleted = applyPassiveDepletion(base, Date.now());
    profile.tamagotchi = applyTamagotchiFill(depleted, "vrr_reward_claim");
    writeLearningProfile(childId, profile);
    res.json({ ok: true, rewardId, tamagotchi: profile.tamagotchi });
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
          avatarImagePath: profile?.avatarImagePath ?? null,
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
        avatarImagePath: null,
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

  app.post("/api/homework/ingest", async (req: Request, res: Response) => {
    const childId =
      typeof req.body?.childId === "string" ? req.body.childId.trim().toLowerCase() : "";
    if (!childId) {
      return res.status(400).json({ ok: false, error: "childId required" });
    }
    const pendingPath = path.join(
      process.cwd(),
      "src",
      "context",
      childId,
      "homework",
      "pending",
      new Date().toISOString().slice(0, 10),
    );
    const args = ["tsx", "src/scripts/ingestHomework.ts", `--child=${childId}`];
    if (req.body?.opus === true) args.push("--opus");
    const child = spawn("npx", args, {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, SUNNY_NON_INTERACTIVE: "true" },
    });
    child.once("error", (err) => {
      res.status(500).json({ ok: false, error: String(err) });
    });
    child.once("close", (code) => {
      if (code === 0) {
        res.json({ ok: true, pendingPath });
      } else {
        res.status(500).json({ ok: false, error: `ingest exited ${code}` });
      }
    });
  });

  app.get("/api/themes/:childId", (req: Request, res: Response) => {
    const childId =
      typeof req.params.childId === "string" ? req.params.childId.trim().toLowerCase() : "";
    if (!childId) {
      return res.status(400).json({ ok: false, error: "childId required" });
    }
    if (!readLearningProfile(childId)) {
      return res.status(404).json({ ok: false, error: "unknown_child" });
    }
    const themes = listSavedThemes(childId);
    res.json({ ok: true, themes });
  });

  app.get("/api/homework/pending/:childId", (req: Request, res: Response) => {
    const childId =
      typeof req.params.childId === "string" ? req.params.childId.trim().toLowerCase() : "";
    if (!childId) {
      return res.status(400).json({ nodes: [] });
    }
    const profile = readLearningProfile(childId);
    if (!profile?.pendingHomework) {
      return res.json({ nodes: [] });
    }
    res.json(profile.pendingHomework);
  });

  app.post("/api/homework/approve", (req: Request, res: Response) => {
    const childId =
      typeof req.body?.childId === "string" ? req.body.childId.trim().toLowerCase() : "";
    const date = typeof req.body?.date === "string" ? req.body.date.trim() : "";
    const nodeId = typeof req.body?.nodeId === "string" ? req.body.nodeId.trim() : "";
    if (!childId || !date || !nodeId) {
      return res.status(400).json({ ok: false, error: "childId, date, nodeId required" });
    }
    const profile = readLearningProfile(childId);
    if (!profile?.pendingHomework) {
      return res.status(404).json({ ok: false, error: "no pendingHomework" });
    }
    const node = profile.pendingHomework.nodes.find((n) => n.id === nodeId);
    if (!node) {
      return res.status(404).json({ ok: false, error: "node not found" });
    }
    node.approved = true;
    const allApproved = profile.pendingHomework.nodes.every((n) => n.approved === true);
    if (allApproved) {
      const pendingDir = path.join(
        process.cwd(),
        "src",
        "context",
        childId,
        "homework",
        "pending",
        date,
      );
      const gamesDir = path.join(
        process.cwd(),
        "src",
        "context",
        childId,
        "homework",
        "games",
        date,
      );
      fs.mkdirSync(gamesDir, { recursive: true });
      if (fs.existsSync(pendingDir)) {
        for (const file of fs.readdirSync(pendingDir)) {
          fs.renameSync(path.join(pendingDir, file), path.join(gamesDir, file));
        }
      }
    }
    writeLearningProfile(childId, profile);
    res.json({ ok: true, allApproved });
  });

  app.post("/api/homework/regenerate", async (req: Request, res: Response) => {
    try {
      const childId =
        typeof req.body?.childId === "string" ? req.body.childId.trim().toLowerCase() : "";
      const date = typeof req.body?.date === "string" ? req.body.date.trim() : "";
      const nodeId = typeof req.body?.nodeId === "string" ? req.body.nodeId.trim() : "";
      const feedback =
        typeof req.body?.feedback === "string" ? req.body.feedback.trim() : "";
      if (!childId || !date || !nodeId) {
        return res.status(400).json({ ok: false, error: "childId, date, nodeId required" });
      }
      const profile = readLearningProfile(childId);
      const pending = profile?.pendingHomework;
      if (!pending) {
        return res.status(404).json({ ok: false, error: "no pendingHomework" });
      }
      const node = pending.nodes.find((n) => n.id === nodeId);
      if (!node) {
        return res.status(404).json({ ok: false, error: "node not found" });
      }
      const pendingDir = path.join(
        process.cwd(),
        "src",
        "context",
        childId,
        "homework",
        "pending",
        date,
      );
      fs.mkdirSync(pendingDir, { recursive: true });
      let newFile = "";
      if (node.type === "karaoke") {
        const client = new Anthropic();
        const msg = await client.messages.create({
          model: HOMEWORK_SONNET_MODEL,
          max_tokens: 700,
          messages: [
            {
              role: "user",
              content: `Write a grade 2 story, 150 words max, max 8 words per sentence.
Embed these words naturally: ${node.words.join(", ")}.
${feedback ? `Parent feedback: ${feedback}` : ""}
Return plain text only.`,
            },
          ],
        });
        const story = msg.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        newFile = "karaoke-story.txt";
        const storyPath = path.join(pendingDir, newFile);
        fs.writeFileSync(storyPath, story, "utf8");
        node.storyFile = newFile;
        node.storyText = fs.readFileSync(storyPath, "utf8");
      } else if (node.type === "quest" || node.type === "boss") {
        const classificationPath = path.join(pendingDir, "classification.json");
        const extracted = fs.existsSync(classificationPath)
          ? JSON.parse(fs.readFileSync(classificationPath, "utf8"))
          : {};
        const client = new Anthropic();
        const html = await generateQuestGameHtml({
          client,
          extractedJsonPretty: JSON.stringify({ ...extracted, feedback }, null, 2),
        });
        newFile = node.gameFile || `${node.type}-${date}.html`;
        fs.writeFileSync(path.join(pendingDir, newFile), ensureQuestHtmlContract(html), "utf8");
        node.gameFile = newFile;
      } else {
        return res.json({ ok: true, newFile: "" });
      }
      writeLearningProfile(childId, profile);
      res.json({ ok: true, newFile });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
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

  app.get("/homework/:childId/:date/:filename", (req: Request, res: Response) => {
    const childId =
      typeof req.params.childId === "string" ? req.params.childId.trim().toLowerCase() : "";
    const date = typeof req.params.date === "string" ? req.params.date.trim() : "";
    const filename = typeof req.params.filename === "string" ? req.params.filename : "";
    if (!childId || !date || !/^[\w.\- ]+$/.test(filename)) {
      return res.status(400).json({ error: "Invalid request" });
    }
    const pendingBase = path.resolve(
      process.cwd(),
      "src",
      "context",
      childId,
      "homework",
      "pending",
      date,
    );
    const gamesBase = path.resolve(
      process.cwd(),
      "src",
      "context",
      childId,
      "homework",
      "games",
      date,
    );
    const candidatePaths = [
      path.resolve(pendingBase, filename),
      path.resolve(gamesBase, filename),
    ];
    const filePath = candidatePaths.find((candidate) => {
      const inPending = candidate.startsWith(pendingBase) && fs.existsSync(candidate);
      const inGames = candidate.startsWith(gamesBase) && fs.existsSync(candidate);
      return inPending || inGames;
    });
    if (!filePath) return res.status(404).json({ error: "File not found" });
    if (filePath.toLowerCase().endsWith(".html")) {
      res.type("html");
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
      preview?: string | boolean;
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
        const pv = body.preview;
        const clientPreviewFreeOrGoLive =
          pv === "free" || pv === "go-live" || pv === true;
        const { mapState, companionEvent } = await applyNodeResult(
          sessionId,
          body.result,
          { clientPreviewFreeOrGoLive },
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

  app.post("/api/map/spell-check-results", (req: Request, res: Response) => {
    const body = req.body as {
      childId?: string;
      wordsCorrect?: string[];
      wordsStruggled?: string[];
      previewMode?: string | boolean;
    };
    const childId = typeof body.childId === "string" ? body.childId.trim().toLowerCase() : "";
    if (!childId) {
      return res.status(400).json({ error: "childId required" });
    }
    const wordsCorrect = Array.isArray(body.wordsCorrect) ? body.wordsCorrect.map(String) : [];
    const wordsStruggled = Array.isArray(body.wordsStruggled)
      ? body.wordsStruggled.map(String)
      : [];
    try {
      const out = applySpellCheckMapResults({
        childId,
        wordsCorrect,
        wordsStruggled,
        previewMode: body.previewMode,
      });
      return res.json(out);
    } catch (err: unknown) {
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

  /** Diag: push pronunciation canvas onto an active creator diag voice WebSocket session. */
  app.post("/api/map/test-pronunciation-mode", (req: Request, res: Response) => {
    const childId =
      typeof req.body?.childId === "string"
        ? req.body.childId.trim().toLowerCase()
        : "";
    if (childId !== "creator") {
      return res.status(400).json({ error: "childId must be creator" });
    }
    const out = tryPushCreatorDiagPronunciation();
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
