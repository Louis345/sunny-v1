import Anthropic from "@anthropic-ai/sdk";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { randomUUID } from "crypto";
import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { ELLI, MATILDA } from "../companions/loader";
import { generateStoryImage } from "../utils/generateStoryImage";
import { generateStoryVideo } from "../utils/generateStoryVideo";
import { buildProfile } from "../profiles/buildProfile";
import { getChildChart } from "../profiles/childChart";
import { buildChildExperiencePacket } from "../profiles/childExperiencePacket";
import {
  mirrorCompanionCareToLearningProfile,
  saveCompanionCarePlan,
} from "../profiles/companionCarePlan";
import type { NodeResult } from "../shared/adventureTypes";
import {
  applyNodeResult,
  broadcastTestMapCompanionAct,
  broadcastTestMapCompanionEmote,
  broadcastTestMapCompanionEvent,
  handleMapClientMessage,
  MapSessionError,
	  purchaseStoryMovieReward,
	  recordExplicitMapRating,
	  recordMapChoiceEvent,
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
import { getSunnyMode, isSunnyDiagMode } from "../utils/runtimeMode";
import {
  applyPassiveDepletion,
  applyTamagotchiFill,
} from "../engine/vrrEngine";
import { DEFAULT_TAMAGOTCHI } from "../shared/vrrTypes";
import {
  applyCompanionFeedItem,
  companionCareToView,
} from "../engine/companionCareEngine";
import {
  applyChoiceEventPreference,
  recordChoiceEvent,
  type ChoiceEventInput,
} from "../engine/choiceEvents";
import {
  companionCareFeedShouldPersist,
  previewCompanionCareMirror,
} from "./companionCareFeedRoute";
import {
  applyHomeworkClarificationAnswer,
  type CapturedHomeworkContent,
  type HomeworkTargetPurpose,
} from "../scripts/contentAwareHomeworkPlanner";
import { applySpellCheckMapResults } from "./spellCheckMapResults";
import { recordLearningAttempt } from "./learningAttemptEvents";
import {
  generateExperienceArtifactFromChart,
  generateExperienceHtmlWithSonnet,
} from "../engine/generatedExperienceArtifact";
import {
  buildAdaptiveEvidenceSnapshot,
  questGateFromSnapshot,
} from "../engine/adaptiveEvidenceSnapshot";
import { comparePronunciationScienceProviders } from "../engine/pronunciationScienceProviders";
import {
  validateActivityEngineConfig,
  validateLetterRushConfig,
} from "../engine/activityEngineConfig";
import { CompanionRegistry } from "../prompts/companions/registry";
import { tryLoadIntroOnlyShowroomCompanion } from "./introOnlyShowroomCompanion";
import {
  resolveAllowedShowroomVoiceId,
  type ShowroomVoiceOption,
} from "./companionShowroomVoice";
import {
  buildShowroomClaudeMessages,
  buildShowroomTalkSystemPrompt,
  createShowroomCompanionActCommand,
  createShowroomTalkCompletedEvent,
  createShowroomTalkPhaseCommand,
  getShowroomCompanionActTools,
  resolveShowroomSpokenText,
  resolveShowroomTalkRequest,
} from "./companionShowroomTalk";
import type { SunnyRuntimeOverrides } from "../shared/runtimeConfig";
import { resolveSunnyRuntimeConfig } from "../shared/runtimeConfig";

const companions = {
  Ila: ELLI,
  Reina: MATILDA,
} as const;

type ChildName = keyof typeof companions;

const GAME_GRADE_HAIKU_MODEL = "claude-haiku-4-5-20251001";
const HOMEWORK_SONNET_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_ELEVENLABS_MODEL = "eleven_multilingual_v2";

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

type ShowroomLine = "intro" | "plead";

type ShowroomJson = {
  personality?: unknown;
  scripts?: Record<string, Partial<Record<ShowroomLine, unknown>>>;
};

function activityIdFromConfig(config: unknown): string {
  if (!config || typeof config !== "object" || Array.isArray(config)) return "";
  const value = (config as { activityId?: unknown }).activityId;
  return typeof value === "string" ? value.trim() : "";
}

function getPronunciationLocators():
  | Array<{ pronunciationDictionaryId: string; versionId: string }>
  | undefined {
  const dictId = process.env.ELEVENLABS_PRONUNCIATION_DICT_ID;
  const versionId = process.env.ELEVENLABS_PRONUNCIATION_DICT_VERSION;
  if (!dictId || !versionId) return undefined;
  return [{ pronunciationDictionaryId: dictId, versionId }];
}

async function audioLikeToBuffer(audio: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(audio)) return audio;
  if (audio instanceof ArrayBuffer) return Buffer.from(audio);
  if (audio instanceof Uint8Array) return Buffer.from(audio);
  if (
    audio &&
    typeof audio === "object" &&
    "arrayBuffer" in audio &&
    typeof (audio as { arrayBuffer: unknown }).arrayBuffer === "function"
  ) {
    const ab = await (audio as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
    return Buffer.from(ab);
  }
  if (
    audio &&
    typeof audio === "object" &&
    Symbol.asyncIterator in audio
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of audio as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new Error("Unsupported ElevenLabs audio response");
}

function readShowroomScript(
  companionId: string,
  companionName: string,
  line: ShowroomLine,
  language: string,
): string {
  const showroomPath = path.join(
    process.cwd(),
    "src",
    "prompts",
    "companions",
    companionId,
    "showroom.json",
  );
  const raw = fs.existsSync(showroomPath)
    ? (JSON.parse(fs.readFileSync(showroomPath, "utf8")) as ShowroomJson)
    : null;
  const requested = raw?.scripts?.[language]?.[line];
  const fallback = raw?.scripts?.en?.[line];
  const text =
    (typeof requested === "string" && requested.trim()) ||
    (typeof fallback === "string" && fallback.trim()) ||
    (line === "intro"
      ? `Hi! I'm ${companionName}. I'm so excited to meet you.`
      : `Please pick me! I think we could have so much fun learning together.`);
  return text.trim();
}

function readShowroomVoiceOptions(
  companionId: string,
  companionName: string,
  fallbackVoiceId: string | undefined,
): ShowroomVoiceOption[] {
  const showroomPath = path.join(
    process.cwd(),
    "src",
    "prompts",
    "companions",
    companionId,
    "showroom.json",
  );
  const raw = fs.existsSync(showroomPath)
    ? (JSON.parse(fs.readFileSync(showroomPath, "utf8")) as ShowroomJson & { voices?: unknown })
    : null;
  const parsed = Array.isArray(raw?.voices)
    ? raw.voices
        .map((voice): ShowroomVoiceOption | null => {
          if (!voice || typeof voice !== "object") return null;
          const v = voice as Record<string, unknown>;
          const id = typeof v.id === "string" && v.id.trim() ? v.id.trim() : "";
          if (!id) return null;
          return {
            id,
            label:
              typeof v.label === "string" && v.label.trim()
                ? v.label.trim()
                : `${companionName} Voice`,
            language:
              typeof v.language === "string" && v.language.trim()
                ? v.language.trim()
                : "en",
            ...(v.default === true ? { default: true } : {}),
          };
        })
        .filter((voice): voice is ShowroomVoiceOption => voice != null)
    : [];

  if (parsed.length > 0) return parsed;
  return fallbackVoiceId?.trim()
    ? [{ id: fallbackVoiceId.trim(), label: `${companionName} Voice`, language: "en", default: true }]
    : [];
}

function readShowroomPersonality(
  companionId: string,
  fallback: string,
): string {
  const showroomPath = path.join(
    process.cwd(),
    "src",
    "prompts",
    "companions",
    companionId,
    "showroom.json",
  );
  const raw = fs.existsSync(showroomPath)
    ? (JSON.parse(fs.readFileSync(showroomPath, "utf8")) as ShowroomJson)
    : null;
  const personality =
    typeof raw?.personality === "string" && raw.personality.trim()
      ? raw.personality.trim()
      : fallback.trim();
  return personality || "Friendly, patient, and encouraging.";
}

function extractAnthropicText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
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

  app.post("/api/pronunciation-science/compare", async (req: Request, res: Response) => {
    const body = req.body as {
      targetWord?: unknown;
      audioBase64?: unknown;
      mimeType?: unknown;
      audioClipId?: unknown;
    };
    const targetWord = typeof body.targetWord === "string" ? body.targetWord.trim() : "";
    const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64.trim() : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim() : "audio/wav";
    if (!targetWord) return res.status(400).json({ ok: false, error: "targetWord required" });
    if (!audioBase64) return res.status(400).json({ ok: false, error: "audioBase64 required" });
    try {
      const out = await comparePronunciationScienceProviders({
        targetWord,
        audioBase64,
        mimeType,
        audioClipId: typeof body.audioClipId === "string" ? body.audioClipId : undefined,
        sourcePath: "storybook_live_compare",
      });
      console.log(
        `  🎮 [pronunciation-science] [compare] target=${out.targetWord} results=${out.results.length}`,
      );
      res.json({ ok: true, ...out });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /** Visual PoC — `web/public/worlds/proof-of-concept.html`; uses server-side GROK_API_KEY. */
  app.get("/api/grok-image", async (req: Request, res: Response) => {
    if (getSunnyMode() === "diag") {
      return res.status(403).json({ error: "Grok disabled in diag mode" });
    }
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

  app.post("/api/grok-story-video", async (req: Request, res: Response) => {
    if (getSunnyMode() === "diag") {
      return res.status(403).json({ error: "Grok disabled in diag mode" });
    }
    const body = req.body as { imageUrl?: unknown; prompt?: unknown };
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!imageUrl) return res.status(400).json({ error: "imageUrl required" });
    if (!prompt) return res.status(400).json({ error: "prompt required" });
    try {
      const url = await generateStoryVideo({ imageUrl, prompt });
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

  app.get("/api/child-experience/:childId", (req: Request, res: Response) => {
    const childId =
      typeof req.params.childId === "string" ? req.params.childId.trim().toLowerCase() : "";
    if (!childId) {
      return res.status(400).json({ error: "Missing childId" });
    }
    try {
      const chart = getChildChart(childId);
      res.json(buildChildExperiencePacket(chart));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/child/:childId/choice-event", async (req: Request, res: Response) => {
    const childId =
      typeof req.params.childId === "string" ? req.params.childId.trim().toLowerCase() : "";
    if (!childId) {
      return res.status(400).json({ ok: false, error: "Missing childId" });
    }
    const body = req.body as { payload?: Partial<ChoiceEventInput>; preview?: unknown } | undefined;
    const payload = body?.payload;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ ok: false, error: "choice event payload required" });
    }
    if (!Array.isArray(payload.shownOptions) || payload.shownOptions.length === 0) {
      return res.status(400).json({ ok: false, error: "choice event shownOptions required" });
    }
    if (typeof payload.choiceSetId !== "string" || !payload.choiceSetId.trim()) {
      return res.status(400).json({ ok: false, error: "choice event choiceSetId required" });
    }
    const preview = body?.preview;
    const skipPersistence = preview === "free" || preview === "go-live" || preview === true;
    const eventInput = {
      ...payload,
      childId,
      source: payload.source ?? "child_choice",
      createdAt: payload.createdAt ?? new Date().toISOString(),
    } as ChoiceEventInput;
    if (skipPersistence) {
      console.log(
        `  🎮 [choice-event] [planner-board-preview] child=${childId} context=${eventInput.context} source=${eventInput.source}`,
      );
      return res.json({ ok: true, applied: false, skippedPersistence: true });
    }
    try {
      const event = recordChoiceEvent(eventInput);
      const applied = await applyChoiceEventPreference(event);
      return res.json({
        ok: true,
        applied: applied.applied,
        skippedPersistence: false,
        choiceEventId: event.choiceEventId,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ ok: false, error: message });
    }
  });

  app.post(
    "/api/profile/:childId/companion-care/feed",
    (req: Request, res: Response) => {
      const childId =
        typeof req.params.childId === "string" ? req.params.childId.trim() : "";
      if (!childId) {
        return res.status(400).json({ error: "Missing childId" });
      }
      const itemId = String(
        (req.body as { itemId?: string } | undefined)?.itemId ?? "",
      ).trim();
      if (!itemId) {
        return res.status(400).json({ error: "itemId required" });
      }
      try {
        const chart = getChildChart(childId);
        const startingPlan = chart.companionCare.plan;
        const nowIso = new Date().toISOString();
        const result = applyCompanionFeedItem(startingPlan, itemId, nowIso);
        if (!result.ok) {
          return res.status(400).json({ error: result.reason });
        }
        const runtime = resolveSunnyRuntimeConfig(process.env);
        const shouldPersist = companionCareFeedShouldPersist(runtime);
        if (shouldPersist) {
          saveCompanionCarePlan(chart, result.plan);
        }
        const mirrored = shouldPersist
          ? mirrorCompanionCareToLearningProfile(chart, result.plan)
          : previewCompanionCareMirror(result.plan);
        const companionCare = companionCareToView(
          result.plan,
          chart.companion.displayName,
        );
        console.log(
          `  🎮 [companion-care] feed ${itemId} hunger ${startingPlan.state.hunger.toFixed(2)} -> ${result.plan.state.hunger.toFixed(2)}${shouldPersist ? "" : " preview=true"}`,
        );
        res.json({
          ok: true,
          companionCare,
          tamagotchi: mirrored.tamagotchi,
          companionCurrency: mirrored.companionCurrency,
          animation: result.animation,
          preview: !shouldPersist,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: message });
      }
    },
  );

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

  app.post("/api/companions/:companionId/speak", async (req: Request, res: Response) => {
    const companionId =
      typeof req.params.companionId === "string"
        ? req.params.companionId.trim()
        : "";
    const lineRaw = typeof req.body?.line === "string" ? req.body.line.trim() : "";
    const line: ShowroomLine = lineRaw === "plead" ? "plead" : "intro";
    const languageRaw =
      typeof req.body?.language === "string" ? req.body.language.trim().toLowerCase() : "en";
    const language = languageRaw || "en";
    if (!companionId) {
      return res.status(400).json({ ok: false, error: "companionId_required" });
    }

    let companion: {
      id: string;
      name: string;
      voiceId: string;
      voiceModelId?: string;
    };
    try {
      companion = CompanionRegistry.getById(companionId);
    } catch {
      const introOnly = tryLoadIntroOnlyShowroomCompanion(companionId);
      if (!introOnly) {
        return res.status(404).json({ ok: false, error: "unknown_companion" });
      }
      companion = introOnly;
    }

    const voiceOptions = readShowroomVoiceOptions(
      companion.id,
      companion.name,
      companion.voiceId,
    );
    let voiceId: string;
    try {
      voiceId = resolveAllowedShowroomVoiceId(req.body?.voiceId, voiceOptions, companion.voiceId);
    } catch (err) {
      const error = err instanceof Error ? err.message : "voice_unavailable";
      const status = error === "voice_not_allowed" ? 400 : 400;
      return res.status(status).json({ ok: false, error });
    }
    if (!voiceId) {
      return res.status(400).json({ ok: false, error: "voice_unavailable" });
    }
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: "elevenlabs_api_key_missing" });
    }

    try {
      const text = readShowroomScript(companion.id, companion.name, line, language);
      const client = new ElevenLabsClient({ apiKey });
      const locators = getPronunciationLocators();
      const audio = await client.textToSpeech.convert(voiceId, {
        text,
        modelId: companion.voiceModelId ?? DEFAULT_ELEVENLABS_MODEL,
        ...(locators && { pronunciationDictionaryLocators: locators }),
      });
      const buffer = await audioLikeToBuffer(audio);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      res.send(buffer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.post("/api/companions/:companionId/talk", async (req: Request, res: Response) => {
    const companionId =
      typeof req.params.companionId === "string"
        ? req.params.companionId.trim()
        : "";
    if (!companionId) {
      return res.status(400).json({ ok: false, error: "companionId_required" });
    }

    let companion: {
      id: string;
      name: string;
      voiceId: string;
      voiceModelId?: string;
      personalityMarkdown?: string;
    };
    try {
      companion = CompanionRegistry.getById(companionId);
    } catch {
      const introOnly = tryLoadIntroOnlyShowroomCompanion(companionId);
      if (!introOnly) {
        return res.status(404).json({ ok: false, error: "unknown_companion" });
      }
      companion = introOnly;
    }

    const voiceOptions = readShowroomVoiceOptions(
      companion.id,
      companion.name,
      companion.voiceId,
    );
    const resolved = resolveShowroomTalkRequest(req.body, {
      routeCompanionId: companion.id,
      voiceOptions,
      fallbackVoiceId: companion.voiceId,
    });
    if (!resolved.ok) {
      return res.status(resolved.status).json({ ok: false, error: resolved.error });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: "elevenlabs_api_key_missing" });
    }

    try {
      const talk = resolved.request;
      const personality = readShowroomPersonality(
        companion.id,
        companion.personalityMarkdown ?? "",
      );
      const system = buildShowroomTalkSystemPrompt({
        companionId: companion.id,
        companionName: companion.name,
        showroomTheme: talk.showroomTheme,
        personality,
        mode: talk.mode,
        hasFreshVisualSnapshot: Boolean(talk.visualSnapshot),
        lastVisualSummary: talk.lastVisualSummary,
      });
      const messages = buildShowroomClaudeMessages({
        question: talk.question,
        mode: talk.mode,
        visualSnapshot: talk.visualSnapshot,
      });
      const client = new Anthropic();
      const msg = await client.messages.create({
        model: HOMEWORK_SONNET_MODEL,
        max_tokens: 180,
        system,
        messages: messages as Anthropic.MessageParam[],
        tools: getShowroomCompanionActTools(),
      });
      const toolUseBlocks = msg.content
        .filter(
          (block): block is Anthropic.ToolUseBlock =>
            block.type === "tool_use" && block.name === "companionAct",
        )
        .slice(0, 4);
      const commandByToolUseId = new Map<string, ReturnType<typeof createShowroomCompanionActCommand>>();
      for (const block of toolUseBlocks) {
        commandByToolUseId.set(
          block.id,
          createShowroomCompanionActCommand({
            childId: talk.childId,
            rawInput: block.input,
          }),
        );
      }
      const companionCommands = [...commandByToolUseId.values()].filter(
        (command): command is NonNullable<typeof command> => Boolean(command),
      );
      let text = extractAnthropicText(msg);
      if (toolUseBlocks.length > 0) {
        const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((block) => {
          const command = commandByToolUseId.get(block.id);
          return {
            type: "tool_result",
            tool_use_id: block.id,
            is_error: !command,
            content: JSON.stringify({
              type: "showroom_companion_act_result",
              accepted: Boolean(command),
              commandType: command?.type ?? null,
              instruction:
                "If spoken words add value, answer with the exact short words the companion should say aloud. If the visual action is enough, return an empty string. Do not include stage directions.",
            }),
          };
        });
        const afterTool = await client.messages.create({
          model: HOMEWORK_SONNET_MODEL,
          max_tokens: 160,
          system,
          messages: [
            ...(messages as Anthropic.MessageParam[]),
            {
              role: "assistant",
              content: msg.content as Anthropic.ContentBlockParam[],
            },
            {
              role: "user",
              content: toolResults,
            },
          ],
          tools: getShowroomCompanionActTools(),
          tool_choice: { type: "none" },
        });
        text = extractAnthropicText(afterTool) || text;
      }
      const spokenText = resolveShowroomSpokenText({
        rawText: text,
        companionCommandCount: companionCommands.length,
      });
      let audioBase64: string | undefined;
      let audioContentType: string | undefined;
      if (spokenText) {
        const elevenlabs = new ElevenLabsClient({ apiKey });
        const locators = getPronunciationLocators();
        const audio = await elevenlabs.textToSpeech.convert(talk.voiceId, {
          text: spokenText,
          modelId: companion.voiceModelId ?? DEFAULT_ELEVENLABS_MODEL,
          ...(locators && { pronunciationDictionaryLocators: locators }),
        });
        const buffer = await audioLikeToBuffer(audio);
        audioBase64 = buffer.toString("base64");
        audioContentType = "audio/mpeg";
      }
      const event = createShowroomTalkCompletedEvent({
        childId: talk.childId,
        companionId: talk.companionId,
        showroomTheme: talk.showroomTheme,
        question: talk.question,
        responseText: spokenText,
        mode: talk.mode,
        visionUsed: Boolean(talk.visualSnapshot),
        visualSnapshot: talk.visualSnapshot,
      });
      const visualSummary =
        talk.mode === "video_call" && talk.visualSnapshot
          ? spokenText.slice(0, 220)
          : undefined;

      console.log(
        ` 🎮 [showroom-talk] completed child=${talk.childId} companion=${talk.companionId} room=${talk.showroomTheme} mode=${talk.mode ?? "showroom"} vision=${Boolean(talk.visualSnapshot)} companionCommands=${companionCommands.length}`,
      );
      res.json({
        ok: true,
        text: spokenText,
        ...(audioBase64 && { audioBase64 }),
        ...(audioContentType && { audioContentType }),
        companionCommands,
        ...(visualSummary && { visualSummary }),
        event,
        phaseCommands: {
          speaking: createShowroomTalkPhaseCommand({
            childId: talk.childId,
            companionId: companion.id,
            phase: "speaking",
          }),
          idle: createShowroomTalkPhaseCommand({
            childId: talk.childId,
            companionId: companion.id,
            phase: "idle",
          }),
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
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

  app.get("/api/homework/game/:childId/:filename", async (req: Request, res: Response) => {
    const childId =
      typeof req.params.childId === "string" ? req.params.childId.trim().toLowerCase() : "";
    const filename = typeof req.params.filename === "string" ? req.params.filename.trim() : "";
    if (!childId || !filename || !/^[\w.\- ]+$/.test(filename)) {
      return res.status(404).json({ error: "File not found" });
    }
    const profile = await buildProfile(childId);
    const configuredPaths = [
      profile?.games?.quest?.generatedGamePath,
      profile?.games?.boss?.generatedGamePath,
    ].filter((p): p is string => typeof p === "string" && p.trim().length > 0);
    const resolved = configuredPaths
      .map((p) => path.resolve(p))
      .find((p) => path.basename(p) === filename && fs.existsSync(p));
    if (!resolved) {
      return res.status(404).json({ error: "File not found" });
    }
    res.type("html");
    return res.sendFile(resolved);
  });

  app.post("/api/homework/clarification", (req: Request, res: Response) => {
    try {
    const childId =
      typeof req.body?.childId === "string" ? req.body.childId.trim().toLowerCase() : "";
    const date = typeof req.body?.date === "string" ? req.body.date.trim() : "";
    const questionId =
      typeof req.body?.questionId === "string" ? req.body.questionId.trim() : "";
    const answer = typeof req.body?.answer === "string" ? req.body.answer.trim() : "";
    const answeredBy =
      typeof req.body?.answeredBy === "string" ? req.body.answeredBy.trim() : "parent";
    const allowedAnswers = new Set<HomeworkTargetPurpose>([
      "spell_from_memory",
      "recognize",
      "read_fluently",
      "pronounce",
      "define",
      "unknown",
    ]);
    if (!childId || !date || !questionId || !allowedAnswers.has(answer as HomeworkTargetPurpose)) {
      return res.status(400).json({
        ok: false,
        error: "childId, date, questionId, and valid answer required",
      });
    }
    const profile = readLearningProfile(childId);
    const pending = profile?.pendingHomework;
    const captured = pending?.capturedContent as CapturedHomeworkContent | null | undefined;
    const interpretation = captured?.assignmentInterpretation;
    if (!profile || !pending || !captured || !interpretation) {
      return res.status(404).json({ ok: false, error: "no pending homework interpretation" });
    }
    const homeworkId = pending.homeworkId ?? pending.weekOf;
    const clarified = applyHomeworkClarificationAnswer(interpretation, {
      questionId,
      answer: answer as HomeworkTargetPurpose,
      answeredBy,
      answeredAt: new Date().toISOString(),
    });
    captured.assignmentInterpretation = clarified;
    captured.wordGroups = clarified.wordGroups;

    profile.pendingHomework = {
      ...pending,
      homeworkId,
      capturedContent: captured,
    };
    const patternKey = [
      captured.title,
      ...clarified.wordGroups.map((group) => `${group.label}:${group.purpose}`),
    ]
      .join("|")
      .toLowerCase()
      .replace(/[^a-z0-9|:-]+/g, "-")
      .slice(0, 160);
    const existingMemory = profile.homeworkInterpretationMemory ?? [];
    const previous = existingMemory.find((item) => item.patternKey === patternKey);
    profile.homeworkInterpretationMemory = [
      {
        patternKey,
        confirmedAt: new Date().toISOString(),
        useCount: (previous?.useCount ?? 0) + 1,
        confidenceBoost: previous?.confidenceBoost ?? 0.12,
        evidence: clarified.humanAnswers.map((item) => `${item.questionId}:${item.answer}`),
      },
      ...existingMemory.filter((item) => item.patternKey !== patternKey),
    ].slice(0, 20);
    writeLearningProfile(childId, profile);

    const pendingDir = path.join(
      process.cwd(),
      "src",
      "context",
      childId,
      "homework",
      "pending",
      date,
    );
    if (fs.existsSync(pendingDir)) {
      fs.writeFileSync(
        path.join(pendingDir, "assignment-interpretation.json"),
        JSON.stringify(clarified, null, 2),
        "utf8",
      );
    }
    console.log(
      ` 🎮 [homework-clarification] [truth-saved-replan-required] child=${childId} homeworkId=${homeworkId} question=${questionId} answer=${answer}`,
    );
      return res.json({ ok: true, interpretation: clarified, requiresReplan: true });
    } catch (err) {
      console.error(" 🎮 [homework-clarification] [failed]", err);
      return res.status(500).json({ ok: false, error: "homework_clarification_failed" });
    }
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
    if (node.type === "quest" || node.type === "boss") {
      const pending = profile.pendingHomework as typeof profile.pendingHomework & {
        homeworkId?: string;
      };
      const snapshot = buildAdaptiveEvidenceSnapshot(childId, {
        homeworkId: pending.homeworkId ?? pending.weekOf,
      });
      const gate = questGateFromSnapshot(snapshot);
      if (!gate.canOpenQuest) {
        return res.status(409).json({
          ok: false,
          error: "quest_gate_blocked",
          reason: gate.reason,
          requiredMissingEvidence: gate.requiredMissingEvidence,
        });
      }
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
      const briefId =
        typeof req.body?.briefId === "string" ? req.body.briefId.trim() : "";
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
        const result = await generateExperienceArtifactFromChart({
          childId,
          kind: node.type,
          ...(briefId ? { briefId } : {}),
          ...(feedback ? { parentFeedback: feedback } : {}),
          generateHtml: generateExperienceHtmlWithSonnet,
        });
        if (!result.ok) {
          const status = result.reason === "generated_game_validation_failed"
            ? 409
            : result.reason === "homework_cycle_missing" ||
                result.reason === "generated_experience_brief_missing"
              ? 404
              : 409;
          return res.status(status).json({
            ok: false,
            error: result.reason,
            reason: result.reason,
            ...("validationReport" in result && result.validationReport
              ? { validationReport: result.validationReport }
              : {}),
          });
        }
        newFile = result.filename;
      } else {
        return res.json({ ok: true, newFile: "" });
      }
      if (node.type !== "quest" && node.type !== "boss") {
        writeLearningProfile(childId, profile);
      }
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

  app.get("/api/activity-config/:childId/:homeworkId/:filename", (req: Request, res: Response) => {
    const childId =
      typeof req.params.childId === "string" ? req.params.childId.trim().toLowerCase() : "";
    const homeworkId = typeof req.params.homeworkId === "string" ? req.params.homeworkId.trim() : "";
    const filename = typeof req.params.filename === "string" ? req.params.filename.trim() : "";
    if (!childId || !homeworkId || !/^[\w.\-]+\.json$/.test(filename)) {
      return res.status(400).json({ error: "invalid_activity_config_request" });
    }
    const base = path.resolve(
      process.cwd(),
      "src",
      "context",
      childId,
      "homework",
      "games",
      homeworkId,
    );
    const filePath = path.resolve(base, filename);
    if (!filePath.startsWith(base)) {
      return res.status(400).json({ error: "invalid_activity_config_path" });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "activity_config_not_found" });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return res.status(422).json({ error: "invalid_activity_config", findings: ["invalid_json"] });
    }
    const activityId = activityIdFromConfig(parsed);
    if (activityId !== "concept-check" && activityId !== "letter-rush") {
      return res.status(422).json({
        error: "unsupported_activity_engine",
        activityId: activityId || null,
      });
    }
    const validation = activityId === "letter-rush"
      ? validateLetterRushConfig(parsed)
      : validateActivityEngineConfig(parsed);
    if (!validation.ok) {
      return res.status(422).json({
        error: "invalid_activity_config",
        findings: validation.errors,
      });
    }
    res.json(validation.normalized);
  });

  app.post("/api/map/start", async (req: Request, res: Response) => {
    const childId =
      typeof req.body?.childId === "string" ? req.body.childId : "";
    const runtime =
      req.body?.runtime != null &&
      typeof req.body.runtime === "object" &&
      !Array.isArray(req.body.runtime)
        ? (req.body.runtime as SunnyRuntimeOverrides)
        : undefined;
    if (!childId.trim()) {
      return res.status(400).json({ error: "childId required" });
    }
    try {
      const out = await startMapSession(childId, runtime);
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
      payload?: Record<string, unknown>;
      amount?: unknown;
      reason?: unknown;
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
      if (
        body.phase === "game_state_update" &&
        body.payload != null &&
        typeof body.payload === "object"
      ) {
        const events = handleMapClientMessage(sessionId, {
          type: "game_state_update",
          payload: body.payload as Record<string, unknown>,
        });
        return res.json({ events });
      }
      if (body.phase === "currency_award") {
        const pv = body.preview;
        const clientPreviewFree = pv === "free" || pv === true;
        const events = handleMapClientMessage(sessionId, {
          type: "currency_award",
          payload: {
            amount: body.amount,
            reason: body.reason,
            skipPersistence: clientPreviewFree,
          },
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
	      if (
	        body.phase === "choice_event" &&
	        body.payload != null &&
	        typeof body.payload === "object"
	      ) {
	        const pv = body.preview;
	        const skipPersistence = pv === "free" || pv === "go-live" || pv === true;
	        const out = await recordMapChoiceEvent(
	          sessionId,
	          body.payload as Parameters<typeof recordMapChoiceEvent>[1],
	          { skipPersistence },
	        );
	        return res.json(out);
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

  app.post("/api/map/story-reward-purchase", (req: Request, res: Response) => {
    const body = req.body as {
      sessionId?: string;
      preview?: string | boolean;
    };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }
    try {
      const pv = body.preview;
      const clientPreviewFree = pv === "free" || pv === true;
      const out = purchaseStoryMovieReward(sessionId, clientPreviewFree);
      if (!out.ok) {
        return res.status(409).json(out);
      }
      return res.json(out);
    } catch (err: unknown) {
      if (err instanceof MapSessionError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/map/spell-check-results", (req: Request, res: Response) => {
    const body = req.body as {
      childId?: string;
      wordsCorrect?: string[];
      wordsStruggled?: string[];
      sessionId?: string;
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
        sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
        previewMode: body.previewMode,
      });
      return res.json(out);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/map/attempt", (req: Request, res: Response) => {
    try {
      const out = recordLearningAttempt(req.body as Record<string, unknown>);
      return res.json({
        ok: true,
        recorded: out.skipped ? 0 : 1,
        skipped: out.skipped,
        word: out.attempt.word,
        domain: out.attempt.domain,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
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
