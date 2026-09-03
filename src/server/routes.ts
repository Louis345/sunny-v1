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
import { listChildProfileIds } from "../shared/childRegistry";
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
import { resolveChildContextDir } from "../utils/contextRoot";
import {
  applyPassiveDepletion,
  applyTamagotchiFill,
} from "../engine/vrrEngine";
import { DEFAULT_TAMAGOTCHI } from "../shared/vrrTypes";
import {
  applyCompanionFeedItem,
  companionCareToView,
  purchaseCompanionStoreItem,
  awardHomeworkBonusCoins,
  grantVideoCallTicket,
  markVideoCallTicketOpened,
} from "../engine/companionCareEngine";
import {
  applyChoiceEventPreference,
  findChoiceEventById,
  recordChoiceEvent,
  type ChoiceEventInput,
} from "../engine/choiceEvents";
import { interpretDirectExperienceOutcome } from "../engine/directExperienceFeedback";
import {
  completeDiscoveryEvaluation,
  getMathGenerationStatus,
  queueTargetedMathGeneration,
  recordDiscoveryAttempt,
  type MathDiscoveryAttempt,
} from "../engine/adaptiveMathDiscovery";

export function launchAdaptiveMathWorker(childId: string, homeworkId: string): void {
  if (process.env.VITEST) return;
  const logPath = path.join(resolveChildContextDir(childId), "homework", "direct-drafts", homeworkId, "adaptive-generation-worker.log");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logDescriptor = fs.openSync(logPath, "a");
  try {
    const worker = spawn("npx", ["tsx", "src/scripts/runAdaptiveMathGeneration.ts", `--child=${childId}`, `--homework=${homeworkId}`], {
      cwd: process.cwd(), env: process.env, detached: true, stdio: ["ignore", logDescriptor, logDescriptor],
    });
    worker.once("error", (error) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      fs.appendFileSync(logPath, ` 🎮 [adaptive-math] [worker-launch] [failed] child=${childId} homework=${homeworkId} ${message}\n`, "utf8");
      console.error(` 🎮 [adaptive-math] [worker-launch] [failed] child=${childId} homework=${homeworkId}`, error);
    });
    worker.unref();
    console.log(` 🎮 [adaptive-math] [worker-launch] [started] child=${childId} homework=${homeworkId} pid=${worker.pid ?? "unknown"} log=${logPath}`);
  } finally {
    fs.closeSync(logDescriptor);
  }
}

export function resumeAdaptiveMathWorkers(): void {
  if (process.env.VITEST) return;
  for (const childId of listChildProfileIds()) {
    const drafts = path.join(resolveChildContextDir(childId), "homework", "direct-drafts");
    if (!fs.existsSync(drafts)) continue;
    for (const homeworkId of fs.readdirSync(drafts)) {
      try {
        const job = getMathGenerationStatus(childId, homeworkId);
        if (job && job.phase !== "board_ready" && job.phase !== "needs_attention") launchAdaptiveMathWorker(childId, homeworkId);
      } catch (error) {
        console.error(` 🎮 [adaptive-math] [worker-resume] [skipped] child=${childId} homework=${homeworkId}`, error);
      }
    }
  }
}
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
import { recordQuestBossArtifactReview } from "../engine/generatedArtifactReview";
import { appendContentFeedbackLesson } from "../engine/contentFeedbackMemory";
import {
  readQuestBossArtifactPreparationStatus,
  startQuestBossArtifactPreparation,
} from "../engine/questBossArtifactPreparation";
import {
  prepareQuestVisualCandidates,
  resolveQuestVisualCandidateImagePath,
  selectQuestVisualCandidate,
} from "../engine/questVisualCandidateService";
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
  buildShowroomTalkMemoryPrompt,
  buildShowroomTalkSystemPrompt,
  createShowroomCompanionActivityRequest,
  createShowroomCompanionActCommand,
  createShowroomTalkCompletedEvent,
  createShowroomTalkPhaseCommand,
  getShowroomCompanionActivityTools,
  getShowroomCompanionActTools,
  resolveShowroomSpokenText,
  resolveShowroomTalkRequest,
  shouldRunShowroomToolFollowup,
} from "./companionShowroomTalk";
import {
  createElevenLabsPcmSpeaker,
  writeCompanionTalkSseEvent,
  COMPANION_TALK_STREAM_PCM_SAMPLE_RATE,
} from "./companionTalkStream";
import { getCompanionActivityDescriptor } from "../shared/companionActivities/registry";
import {
  maybeCompactCompanionInteractionMemory,
  readCompanionCareMemoryForPrompt,
  recordCompanionInteractionEvent,
  recordCompanionGameResult,
} from "./companionInteractionMemory";
import {
  readCompanionVideoCallTracePacket,
  recordCompanionVideoCallTraceEvent,
  type CompanionVideoCallTraceEventName,
} from "./companionVideoCallTrace";
import type { SunnyRuntimeOverrides } from "../shared/runtimeConfig";
import { resolveSunnyRuntimeConfig } from "../shared/runtimeConfig";
import { reconcileCompanionCareCurrencyAward } from "./currencyAward";
import { companionPickerIdentity } from "./companionPickerRows";
import { advanceCanonicalCycleFromEvidence, recordCanonicalNodeCompletion } from "../engine/learningCycleRuntime";
import { generateCanonicalProgressionArtifact } from "../engine/canonicalProgressionGenerator";
import {
  getLearningCycle,
  getLatestLearningCycle,
  transitionLearningCycle,
} from "../engine/learningCycleRepository";
import {
  confirmReturnedWorkDraft,
  createReturnedWorkDraft,
  getAssignmentLearningReport,
  listReturnedWorkAssignments,
} from "../engine/returnedWorkPipeline";
import type { ConfirmedReturnedWorkItem } from "../engine/longitudinalLearning";

const companions = {
  Ila: ELLI,
  Reina: MATILDA,
} as const;

type ChildName = keyof typeof companions;

export function learningRouteShouldPersist(
  runtime = resolveSunnyRuntimeConfig(process.env),
): boolean {
  return runtime.persistenceMode === "live";
}

const GAME_GRADE_HAIKU_MODEL = "claude-haiku-4-5-20251001";
const HOMEWORK_SONNET_MODEL = process.env.SUNNY_HOMEWORK_MODEL ?? "claude-sonnet-5";
const COMPANION_TALK_SONNET_MODEL =
  process.env.SUNNY_COMPANION_TALK_MODEL ?? "claude-sonnet-4-5";
const DEFAULT_ELEVENLABS_MODEL = "eleven_multilingual_v2";
const VIDEO_CALL_FLASH_TTS_MODEL = "eleven_flash_v2_5";
const COMPANION_VIDEO_CALL_TRACE_EVENTS = new Set<CompanionVideoCallTraceEventName>([
  "call_started",
  "call_ended",
  "call_greeting_selected",
  "call_greeting_audio_start",
  "call_greeting_audio_ended",
  "call_greeting_skipped",
  "speech_listen_start",
  "speech_result",
  "speech_error",
  "echo_suppressed",
  "loop_suspected",
  "talk_request_start",
  "talk_response_received",
  "talk_stream_first_token",
  "talk_stream_first_audio",
  "talk_stream_fallback",
  "audio_play_start",
  "audio_ended",
  "audio_error",
  "activity_reaction_request_start",
  "activity_reaction_response_received",
  "activity_reaction_stale_dropped",
  "activity_reaction_audio_start",
  "activity_reaction_audio_ended",
  "activity_reaction_fallback",
  "activity_move_packet_requested",
  "activity_move_packet_arrived",
  "activity_move_packet_timeout",
  "handsfree_rearm_scheduled",
  "handsfree_rearm_starting",
  "handsfree_rearm_skipped",
  "activity_context_changed",
  "conversation_mode_changed",
  "activity_phase_changed",
]);

function isValidChild(name: string): name is ChildName {
  return name === "Ila" || name === "Reina";
}

function isValidRegistryChildId(childId: string): boolean {
  const normalized = childId.trim().toLowerCase();
  return normalized.length > 0 && listChildProfileIds().includes(normalized);
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

function tracePayloadFromRequestBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const raw = body as Record<string, unknown>;
  const payload =
    raw.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload)
      ? (raw.payload as Record<string, unknown>)
      : {};
  return payload;
}

function safeRecordCompanionVideoCallTrace(input: {
  callTraceId?: string;
  turnId?: string;
  eventName: CompanionVideoCallTraceEventName;
  origin?: "client" | "server";
  childId?: string;
  companionId?: string;
  callSource?: string;
  relationshipState?: string;
  payload?: Record<string, unknown>;
  timestamp?: number;
}): void {
  if (!input.callTraceId) return;
  try {
    recordCompanionVideoCallTraceEvent({
      traceId: input.callTraceId,
      turnId: input.turnId,
      eventName: input.eventName,
      origin: input.origin ?? "server",
      childId: input.childId,
      companionId: input.companionId,
      callSource: input.callSource,
      relationshipState: input.relationshipState,
      timestamp: input.timestamp,
      payload: input.payload,
    });
  } catch (err: unknown) {
    console.error(
      " 🔴 [companion-video-trace] [append] [error]",
      err instanceof Error ? err.message : String(err),
    );
  }
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
const SHOWROOM_BANTER_SPEECH_SOURCE = "video_game_banter";
const SHOWROOM_VIDEO_CALL_GREETING_SPEECH_SOURCE = "video_call_greeting";
const SHOWROOM_BANTER_SPEECH_MAX_CHARS = 180;

export function normalizeShowroomBanterSpeechText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, SHOWROOM_BANTER_SPEECH_MAX_CHARS);
}

export function shouldUseShowroomBanterSpeech(input: {
  source?: unknown;
  text?: unknown;
}): boolean {
  return (
    (input.source === SHOWROOM_BANTER_SPEECH_SOURCE ||
      input.source === SHOWROOM_VIDEO_CALL_GREETING_SPEECH_SOURCE) &&
    normalizeShowroomBanterSpeechText(input.text).length > 0
  );
}

type ShowroomJson = {
  personality?: unknown;
  personalityTags?: unknown;
  likes?: unknown;
  catchphrases?: unknown;
  specialSkills?: unknown;
  role?: unknown;
  scripts?: Record<string, Partial<Record<ShowroomLine, unknown>>>;
};

function readShowroomStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

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

export function readShowroomPersonality(
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
  const lines = [personality || "Friendly, patient, and encouraging."];
  const tags = readShowroomStringList(raw?.personalityTags, 5);
  const likes = readShowroomStringList(raw?.likes, 6);
  const catchphrases = readShowroomStringList(raw?.catchphrases, 3);
  const specialSkills = readShowroomStringList(raw?.specialSkills, 4);
  const role = typeof raw?.role === "string" ? raw.role.trim() : "";
  if (tags.length) lines.push(`Tags: ${tags.join(", ")}`);
  if (likes.length) lines.push(`Likes: ${likes.join(", ")}`);
  if (catchphrases.length) lines.push(`Catchphrases: ${catchphrases.join(" | ")}`);
  if (specialSkills.length) lines.push(`Special skills: ${specialSkills.join(", ")}`);
  if (role) lines.push(`Role: ${role}`);
  return lines.join("\n");
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
  setImmediate(() => resumeAdaptiveMathWorkers());
  const themesDir = path.resolve(process.cwd(), "src", "themes");
  if (fs.existsSync(themesDir)) {
    app.use("/themes", express.static(themesDir));
  }

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/learning/:childId/assignments", (req: Request, res: Response) => {
    const childId = String(req.params.childId ?? "").trim().toLowerCase();
    if (!isValidRegistryChildId(childId)) {
      return res.status(404).json({ error: "child_not_found" });
    }
    try {
      return res.json({ assignments: listReturnedWorkAssignments(childId) });
    } catch (error) {
      console.error(" 🎮 [returned-work] [assignments] [failed]", error);
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/learning/:childId/assignments/:homeworkId/report", (req: Request, res: Response) => {
    const childId = String(req.params.childId ?? "").trim().toLowerCase();
    const homeworkId = String(req.params.homeworkId ?? "").trim();
    if (!isValidRegistryChildId(childId)) return res.status(404).json({ error: "child_not_found" });
    if (!homeworkId) return res.status(400).json({ error: "homeworkId is required" });
    try {
      return res.json({ report: getAssignmentLearningReport(childId, homeworkId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(" 🎮 [learning-report] [read] [failed]", error);
      return res.status(message.startsWith("learning_report_assignment_missing:") ? 404 : 500).json({ error: message });
    }
  });

  app.get("/api/learning/:childId/assignments/:homeworkId/generation-status", (req: Request, res: Response) => {
    const childId = String(req.params.childId ?? "").trim().toLowerCase();
    const homeworkId = String(req.params.homeworkId ?? "").trim();
    if (!isValidRegistryChildId(childId)) return res.status(404).json({ error: "child_not_found" });
    if (!homeworkId) return res.status(400).json({ error: "homeworkId is required" });
    try {
      const status = getMathGenerationStatus(childId, homeworkId);
      if (!status) return res.status(404).json({ error: "math_generation_job_not_found" });
      console.log(` 🎮 [adaptive-math-status] [read] [ok] child=${childId} homework=${homeworkId} phase=${status.phase}`);
      return res.json(status);
    } catch (error) {
      console.error(` 🎮 [adaptive-math-status] [read] [failed] child=${childId} homework=${homeworkId}`, error);
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/learning/:childId/assignments/:homeworkId/discovery/attempt", (req: Request, res: Response) => {
    const childId = String(req.params.childId ?? "").trim().toLowerCase();
    const homeworkId = String(req.params.homeworkId ?? "").trim();
    if (!isValidRegistryChildId(childId)) return res.status(404).json({ error: "child_not_found" });
    const body = req.body as Partial<MathDiscoveryAttempt>;
    if (
      !homeworkId
      || typeof body.attemptId !== "string"
      || typeof body.itemId !== "string"
      || typeof body.attemptedValue !== "string"
      || typeof body.observedAt !== "string"
      || !Array.isArray(body.supportEventIds)
      || !Array.isArray(body.instrumentSignals)
    ) {
      return res.status(400).json({ error: "factual Discovery attempt fields are required" });
    }
    const attempt: MathDiscoveryAttempt = {
      attemptId: body.attemptId,
      itemId: body.itemId,
      attemptedValue: body.attemptedValue,
      supportEventIds: body.supportEventIds,
      instrumentSignals: body.instrumentSignals,
      observedAt: body.observedAt,
    };
    if (!learningRouteShouldPersist()) {
      console.log(` 🎮 [adaptive-math] [discovery-attempt] [preview-skipped] child=${childId} homework=${homeworkId}`);
      return res.json({ ok: true, skippedPersistence: true });
    }
    try {
      const cycle = recordDiscoveryAttempt({ childId, homeworkId, attempt });
      console.log(` 🎮 [adaptive-math] [discovery-attempt] [committed] child=${childId} homework=${homeworkId} attempt=${attempt.attemptId}`);
      return res.json({ ok: true, lifecycle: cycle.lifecycle, revision: cycle.revision });
    } catch (error: unknown) {
      return res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/learning/:childId/assignments/:homeworkId/discovery/complete", (req: Request, res: Response) => {
    const childId = String(req.params.childId ?? "").trim().toLowerCase();
    const homeworkId = String(req.params.homeworkId ?? "").trim();
    if (!isValidRegistryChildId(childId)) return res.status(404).json({ error: "child_not_found" });
    if (!homeworkId) return res.status(400).json({ error: "homeworkId is required" });
    if (!learningRouteShouldPersist()) {
      console.log(` 🎮 [adaptive-math] [discovery-complete] [preview-skipped] child=${childId} homework=${homeworkId}`);
      return res.json({ ok: true, skippedPersistence: true });
    }
    try {
      const cycle = completeDiscoveryEvaluation({ childId, homeworkId, completedAt: new Date().toISOString() });
      queueTargetedMathGeneration({ childId, homeworkId });
      launchAdaptiveMathWorker(childId, homeworkId);
      console.log(` 🎮 [adaptive-math] [discovery-complete] [targeted-generation-queued] child=${childId} homework=${homeworkId}`);
      return res.status(202).json({ ok: true, lifecycle: cycle.lifecycle, revision: cycle.revision, targetedGenerationQueued: true });
    } catch (error: unknown) {
      return res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/learning/:childId/assignments/:homeworkId/returned-work/extract", async (req: Request, res: Response) => {
    const childId = String(req.params.childId ?? "").trim().toLowerCase();
    const homeworkId = String(req.params.homeworkId ?? "").trim();
    const filename = typeof req.body?.filename === "string" ? req.body.filename.trim() : "";
    const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType.trim() : "";
    const dataBase64 = typeof req.body?.dataBase64 === "string" ? req.body.dataBase64.trim() : "";
    if (!isValidRegistryChildId(childId)) return res.status(404).json({ error: "child_not_found" });
    if (!childId || !homeworkId || !filename || !mimeType || !dataBase64) {
      return res.status(400).json({ error: "childId, homeworkId, filename, mimeType, and dataBase64 are required" });
    }
    try {
      const draft = await createReturnedWorkDraft({ childId, homeworkId, filename, mimeType, dataBase64 });
      console.log(` 🎮 [returned-work] [extract] [pending-confirmation] child=${childId} homework=${homeworkId} source=${draft.source.sourceId}`);
      return res.json({ draft });
    } catch (error) {
      console.error(" 🎮 [returned-work] [extract] [failed]", error);
      return res.status(422).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/learning/:childId/assignments/:homeworkId/returned-work/:sourceId/confirm", async (req: Request, res: Response) => {
    const childId = String(req.params.childId ?? "").trim().toLowerCase();
    const homeworkId = String(req.params.homeworkId ?? "").trim();
    const sourceId = String(req.params.sourceId ?? "").trim();
    if (!isValidRegistryChildId(childId)) return res.status(404).json({ error: "child_not_found" });
    if (!childId || !homeworkId || !sourceId) {
      return res.status(400).json({ error: "childId, homeworkId, and sourceId are required" });
    }
    try {
      const score = req.body?.score && typeof req.body.score.earned === "number" && typeof req.body.score.possible === "number"
        ? { earned: req.body.score.earned, possible: req.body.score.possible }
        : undefined;
      const items = Array.isArray(req.body?.items) ? req.body.items as ConfirmedReturnedWorkItem[] : undefined;
      const result = await confirmReturnedWorkDraft({
        childId,
        homeworkId,
        sourceId,
        ...(score ? { score } : {}),
        ...(items ? { items } : {}),
      });
      console.log(` 🎮 [returned-work] [confirm] [${result.interpretationStatus}] child=${childId} homework=${homeworkId} source=${sourceId}`);
      return res.json(result);
    } catch (error) {
      console.error(" 🎮 [returned-work] [confirm] [failed]", error);
      return res.status(422).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/learning-cycle/node-complete", (req: Request, res: Response) => {
    const body = req.body as {
      childId?: unknown;
      homeworkId?: unknown;
      nodeId?: unknown;
      result?: Record<string, unknown>;
    };
    const childId = String(body.childId ?? "").trim().toLowerCase();
    const homeworkId = String(body.homeworkId ?? "").trim();
    const nodeId = String(body.nodeId ?? "").trim();
    if (!childId || !homeworkId || !nodeId || !body.result) {
      return res.status(400).json({ error: "childId, homeworkId, nodeId, and result are required" });
    }
    if (!learningRouteShouldPersist()) {
      console.log(` 🎮 [learning-cycle-route] [completion] [preview-skipped] child=${childId} node=${nodeId}`);
      return res.json({ ok: true, skippedPersistence: true });
    }
    try {
      const beforeCycle = getLearningCycle(childId, homeworkId);
      const wasCompleted = beforeCycle?.nodes.some(
        (node) => node.nodeId === nodeId && node.state === "completed",
      ) === true;
      const accuracy = Number(body.result.accuracy ?? 0);
      const updated = recordCanonicalNodeCompletion({
        childId,
        homeworkId,
        nodeId,
        sessionId: String(body.result.sessionId ?? randomUUID()),
        result: {
          completed: body.result.completed === true,
          accuracy: Number.isFinite(accuracy) ? accuracy : 0,
          timeSpent_ms: Math.max(0, Number(body.result.timeSpent_ms ?? 0) || 0),
          targetResults: Array.isArray(body.result.targetResults)
            ? body.result.targetResults as Array<{ target: string; correct: boolean; attemptedValue?: string; responseTime_ms?: number; scaffoldLevel?: number }>
            : undefined,
          frustrationSignals: Array.isArray(body.result.frustrationSignals)
            ? body.result.frustrationSignals.map(String)
            : undefined,
          replay: body.result.replay === true,
          companionInteractions: Array.isArray(body.result.companionInteractions)
            ? body.result.companionInteractions.map(String)
            : undefined,
        },
      });
      if (!updated) return res.status(404).json({ error: "learning_cycle_not_found" });
      const finalCycle = getLearningCycle(childId, homeworkId) ?? updated;
      let videoCallTicket: { homeworkId: string; earnedAt: string; bonusUrl?: string } | undefined;
      if (finalCycle.lifecycle === "baseline_evaluating") {
        try {
          const chart = getChildChart(childId);
          const earnedAt = new Date().toISOString();
          let bonusUrl: string | undefined;
          const planPath = path.join(resolveChildContextDir(childId), "homework", "direct_experience_plan.json");
          try {
            const directPlan = JSON.parse(fs.readFileSync(planPath, "utf8")) as { bonusActivity?: { id?: string } };
            const bonusId = directPlan.bonusActivity?.id?.trim();
            const bonusFile = bonusId
              ? path.join(resolveChildContextDir(childId), "homework", "games", homeworkId, `${bonusId}.html`)
              : "";
            if (bonusId && fs.existsSync(bonusFile)) {
              bonusUrl = `/api/homework/game/${encodeURIComponent(childId)}/${encodeURIComponent(homeworkId)}/${encodeURIComponent(`${bonusId}.html`)}`;
            }
          } catch {
            bonusUrl = undefined;
          }
          const ticket = grantVideoCallTicket(chart.companionCare.plan, homeworkId, earnedAt, bonusUrl);
          if (ticket.granted) {
            saveCompanionCarePlan(chart, ticket.plan);
            mirrorCompanionCareToLearningProfile(chart, ticket.plan);
          }
          const savedTicket = ticket.plan.economy.videoCallTickets?.find(
            (entry) => entry.homeworkId === homeworkId,
          );
          if (savedTicket) {
            videoCallTicket = {
              homeworkId,
              earnedAt: savedTicket.earnedAt,
              ...(savedTicket.bonusUrl ? { bonusUrl: savedTicket.bonusUrl } : {}),
            };
          }
        } catch (error) {
          console.error(` 🎮 [learning-cycle-route] [video-call-ticket] [deferred] ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      console.log(` 🎮 [learning-cycle-route] [completion] [saved] child=${childId} node=${nodeId} lifecycle=${updated.lifecycle} revision=${updated.revision}`);
      if (["baseline_evaluating", "quest_evaluating", "boss_evaluating"].includes(finalCycle.lifecycle)) {
        void advanceCanonicalCycleFromEvidence({ childId, homeworkId })
          .then((decided) => {
            console.log(` 🎮 [learning-cycle-route] [planner-decision] [saved] lifecycle=${decided.lifecycle} revision=${decided.revision}`);
            return ["baseline_generating", "quest_generating", "boss_generating"].includes(decided.lifecycle)
              ? generateCanonicalProgressionArtifact({ childId, homeworkId })
              : decided;
          })
          .then((advanced) => {
            console.log(` 🎮 [learning-cycle-route] [next-session] [ready] lifecycle=${advanced.lifecycle} revision=${advanced.revision}`);
          })
          .catch((error: unknown) => {
            console.error(` 🎮 [learning-cycle-route] [next-session] [deferred] ${error instanceof Error ? error.message : String(error)}`);
          });
      }
      const award = body.result.completed === true && !wasCompleted
        ? reconcileCompanionCareCurrencyAward({
            childId,
            amount: 25,
            dryRun: false,
            reason: `canonical_node_complete:${homeworkId}:${nodeId}`,
          })
        : null;
      return res.json({
        lifecycle: finalCycle.lifecycle,
        revision: finalCycle.revision,
        ...(award?.ok ? { coinAward: { amount: 25, balance: award.balance } } : {}),
        ...(videoCallTicket ? { videoCallTicket } : {}),
      });
    } catch (error) {
      console.error(" 🎮 [learning-cycle-route] [completion] [failed]", error);
      return res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/learning-cycle/reward/open", (req: Request, res: Response) => {
    const childId = String(req.body?.childId ?? "").trim().toLowerCase();
    const homeworkId = String(req.body?.homeworkId ?? "").trim();
    if (!childId || !homeworkId) return res.status(400).json({ error: "childId and homeworkId required" });
    if (!learningRouteShouldPersist()) return res.status(403).json({ error: "preview_read_only" });
    try {
      const chart = getChildChart(childId);
      const openedAt = new Date().toISOString();
      const result = markVideoCallTicketOpened(chart.companionCare.plan, homeworkId, openedAt);
      if (!result.ok) return res.status(404).json({ error: "video_call_ticket_missing" });
      if (!result.alreadyOpened) {
        saveCompanionCarePlan(chart, result.plan);
        mirrorCompanionCareToLearningProfile(chart, result.plan);
      }
      console.log(` 🎮 [reward-loop] [ticket-opened] child=${childId} homework=${homeworkId}`);
      return res.json({ ok: true, alreadyOpened: result.alreadyOpened });
    } catch (error: unknown) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/learning-cycle/reward/bonus-complete", (req: Request, res: Response) => {
    const childId = String(req.body?.childId ?? "").trim().toLowerCase();
    const homeworkId = String(req.body?.homeworkId ?? "").trim();
    const targetResults = Array.isArray(req.body?.targetResults) ? req.body.targetResults : [];
    if (!childId || !homeworkId) return res.status(400).json({ error: "childId and homeworkId required" });
    if (!learningRouteShouldPersist()) return res.status(403).json({ error: "preview_read_only" });
    try {
      const chart = getChildChart(childId);
      const planPath = path.join(resolveChildContextDir(childId), "homework", "direct_experience_plan.json");
      const directPlan = JSON.parse(fs.readFileSync(planPath, "utf8")) as {
        planId?: string;
        bonusActivity?: { items?: Array<{ id?: string; lineage?: { exposure?: string } }> };
      };
      if (directPlan.planId !== homeworkId) {
        return res.status(409).json({ error: "bonus_homework_contract_mismatch" });
      }
      const freshIds = new Set(
        (directPlan.bonusActivity?.items ?? [])
          .filter((item) => item.lineage?.exposure === "unseen" && typeof item.id === "string")
          .map((item) => item.id!.trim())
          .filter(Boolean),
      );
      if (freshIds.size === 0) return res.status(409).json({ error: "bonus_fresh_contract_missing" });
      const submittedById = new Map<string, Record<string, unknown>>();
      for (const row of targetResults) {
        const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
        const target = typeof item.target === "string" ? item.target.trim() : "";
        if (freshIds.has(target) && !submittedById.has(target)) submittedById.set(target, item);
      }
      const independentCorrect = [...submittedById.values()].filter((item) => {
        const scaffoldLevel = Math.max(0, Number(item.scaffoldLevel ?? 0) || 0);
        return item.correct === true && item.assisted !== true && scaffoldLevel === 0;
      });
      const result = awardHomeworkBonusCoins(chart.companionCare.plan, {
        homeworkId,
        completed: req.body?.completed === true,
        independentlyCorrectFreshItems: independentCorrect.length,
        freshItemCount: freshIds.size,
        nowIso: new Date().toISOString(),
      });
      if (result.awarded) {
        saveCompanionCarePlan(chart, result.plan);
        mirrorCompanionCareToLearningProfile(chart, result.plan);
      }
      console.log(` 🎮 [reward-loop] [bonus-complete] child=${childId} homework=${homeworkId} awarded=${result.awarded} amount=${result.amount}`);
      return res.json({
        ok: true,
        awarded: result.awarded,
        amount: result.amount,
        balance: result.plan.economy.coins,
      });
    } catch (error: unknown) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
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
      if (!chart.activeSessionPlan?.adventureBoard) {
        console.warn(
          ` 🎮 [AdventureBoard] child_experience_missing_board child=${childId}`,
        );
        return res.status(409).json({
          error: "active_adventure_board_required",
          message:
            "Active homework requires an activeSessionPlan.adventureBoard. Run homework ingestion before launching the board.",
        });
      }
      res.json(buildChildExperiencePacket(chart));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/homework/generated-candidates/prepare", async (req: Request, res: Response) => {
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    try {
      const result = await prepareQuestVisualCandidates({
        childId: typeof body.childId === "string" ? body.childId : "",
        kind: body.kind === "boss" ? "boss" : "quest",
        nodeId: typeof body.nodeId === "string" ? body.nodeId : "",
        choiceSetId: typeof body.choiceSetId === "string" ? body.choiceSetId : undefined,
        paid: body.paid === true,
        model: typeof body.model === "string" ? body.model : undefined,
      });
      if (!result.ok) return res.status(409).json(result);
      console.log(
        ` 🎮 [quest-visual-candidates] [prepare] [ok] child=${body.childId ?? ""} choiceSet=${result.choiceSetId}`,
      );
      return res.json({
        ok: true,
        choiceSetId: result.choiceSetId,
        cards: result.cards,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(" 🔴 [quest-visual-candidates] [prepare] [error]", message);
      return res.status(500).json({ ok: false, error: message });
    }
  });

  app.post("/api/homework/generated-candidates/select", async (req: Request, res: Response) => {
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    try {
      const result = await selectQuestVisualCandidate({
        childId: typeof body.childId === "string" ? body.childId : "",
        kind: body.kind === "boss" ? "boss" : "quest",
        nodeId: typeof body.nodeId === "string" ? body.nodeId : "",
        choiceSetId: typeof body.choiceSetId === "string" ? body.choiceSetId : "",
        selectedCandidateId:
          typeof body.selectedCandidateId === "string" ? body.selectedCandidateId : "",
      });
      if (!result.ok) return res.status(409).json(result);
      console.log(
        ` 🎮 [quest-visual-candidates] [select] [ok] child=${body.childId ?? ""} selected=${result.selectedCandidateId}`,
      );
      return res.json({
        ok: true,
        selectedCandidateId: result.selectedCandidateId,
        notSelectedCandidateIds: result.notSelectedCandidateIds,
        newFile: result.newFile,
        contentId: result.contentId,
        validationReport: result.validationReport,
        choiceEvent: result.choiceEvent,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(" 🔴 [quest-visual-candidates] [select] [error]", message);
      return res.status(500).json({ ok: false, error: message });
    }
  });

  app.post("/api/homework/quest-boss/prepare", (req: Request, res: Response) => {
    try {
      const rawChildId = typeof req.body?.childId === "string" ? req.body.childId.trim() : "";
      const childId = rawChildId.toLowerCase();
      if (!childId || !isValidRegistryChildId(childId)) {
        return res.status(400).json({ ok: false, error: "invalid_child_id" });
      }
      const status = startQuestBossArtifactPreparation({ childId });
      if (!status.ok) {
        return res.status(404).json(status);
      }
      return res.status(202).json(status);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ ok: false, error: message });
    }
  });

  app.get("/api/homework/quest-boss/status", (req: Request, res: Response) => {
    try {
      const rawChildId = typeof req.query.childId === "string" ? req.query.childId.trim() : "";
      const childId = rawChildId.toLowerCase();
      if (!childId || !isValidRegistryChildId(childId)) {
        return res.status(400).json({ ok: false, error: "invalid_child_id" });
      }
      const status = readQuestBossArtifactPreparationStatus({ childId });
      if (!status.ok) {
        return res.status(404).json(status);
      }
      return res.json(status);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ ok: false, error: message });
    }
  });

  app.post("/api/homework/quest-boss/review", (req: Request, res: Response) => {
    try {
      const rawChildId = typeof req.body?.childId === "string" ? req.body.childId.trim() : "";
      const childId = rawChildId.toLowerCase();
      const decision = req.body?.decision;
      if (!childId || !isValidRegistryChildId(childId)) {
        return res.status(400).json({ ok: false, error: "invalid_child_id" });
      }
      if (decision !== "approve" && decision !== "revise" && decision !== "reject" && decision !== "regenerate") {
        return res.status(400).json({ ok: false, error: "invalid_review_decision" });
      }
      const artifactPath = typeof req.body?.artifactPath === "string" ? req.body.artifactPath : "";
      const contentId = typeof req.body?.contentId === "string" ? req.body.contentId : "";
      const briefId = typeof req.body?.briefId === "string" ? req.body.briefId : "";
      const reason = typeof req.body?.reason === "string" ? req.body.reason : "";
      if (!artifactPath.trim() || !contentId.trim() || !briefId.trim() || !reason.trim()) {
        return res.status(400).json({ ok: false, error: "missing_review_fields" });
      }
      const reusableLessons = Array.isArray(req.body?.reusableLessons)
        ? req.body.reusableLessons.filter((item: unknown): item is string => typeof item === "string")
        : [];
      const review = recordQuestBossArtifactReview({
        childId,
        artifactPath,
        contentId,
        briefId,
        decision,
        reason,
        reusableLessons,
        reviewer: typeof req.body?.reviewer === "string" ? req.body.reviewer : undefined,
      });
      return res.json({ ok: true, review });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ ok: false, error: message });
    }
  });

  app.get(
    "/api/homework/generated-candidates/:childId/:choiceSetId/:filename",
    (req: Request, res: Response) => {
      const childId =
        typeof req.params.childId === "string" ? req.params.childId.trim().toLowerCase() : "";
      const choiceSetId =
        typeof req.params.choiceSetId === "string" ? req.params.choiceSetId.trim() : "";
      const filename = typeof req.params.filename === "string" ? req.params.filename.trim() : "";
      const imagePath = resolveQuestVisualCandidateImagePath({ childId, choiceSetId, filename });
      if (!imagePath) return res.status(404).json({ ok: false, error: "candidate_image_not_found" });
      return res.sendFile(imagePath);
    },
  );

  app.post("/api/child/:childId/choice-event", async (req: Request, res: Response) => {
    const childId =
      typeof req.params.childId === "string" ? req.params.childId.trim().toLowerCase() : "";
    if (!childId) {
      return res.status(400).json({ ok: false, error: "Missing childId" });
    }
    const body = req.body as { payload?: Partial<ChoiceEventInput> } | undefined;
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
    const eventInput = {
      ...payload,
      childId,
      source: payload.source ?? "child_choice",
      createdAt: payload.createdAt ?? new Date().toISOString(),
    } as ChoiceEventInput;
    if (!learningRouteShouldPersist()) {
      console.log(
        `  🎮 [choice-event] [server-preview-skipped] child=${childId} context=${eventInput.context} source=${eventInput.source}`,
      );
      return res.json({ ok: true, applied: false, skippedPersistence: true });
    }
    try {
      const isCanonicalMathEvidence = eventInput.domain === "math" && (
        eventInput.context === "homework_required" ||
        eventInput.context === "baseline_route" ||
        eventInput.context === "quest" ||
        eventInput.context === "boss"
      );
      if (isCanonicalMathEvidence && !eventInput.homeworkId) {
        return res.status(409).json({ ok: false, error: "choice_event_homework_identity_required" });
      }
      const existingEvent = eventInput.choiceEventId
        ? findChoiceEventById(childId, eventInput.choiceEventId)
        : undefined;
      if (existingEvent) {
        console.log(
          `  🎮 [choice-event] [duplicate-acknowledged] child=${childId} event=${existingEvent.choiceEventId}`,
        );
        return res.json({
          ok: true,
          applied: false,
          duplicate: true,
          skippedPersistence: false,
          choiceEventId: existingEvent.choiceEventId,
        });
      }
      if (isCanonicalMathEvidence) {
        const cycle = getLearningCycle(childId, eventInput.homeworkId!);
        if (!cycle) {
          return res.status(409).json({ ok: false, error: "choice_event_homework_not_found" });
        }
        if (
          eventInput.nodeId &&
          eventInput.context !== "baseline_route" &&
          !cycle.nodes.some((node) => node.nodeId === eventInput.nodeId)
        ) {
          return res.status(409).json({ ok: false, error: "choice_event_node_not_in_homework" });
        }
        if (
          typeof eventInput.cycleRevision === "number" &&
          eventInput.cycleRevision !== cycle.revision
        ) {
          return res.status(409).json({ ok: false, error: "choice_event_cycle_revision_stale" });
        }
        eventInput.cycleRevision ??= cycle.revision;
      }
      const event = recordChoiceEvent(eventInput);
      const applied = await applyChoiceEventPreference(event);
      if (event.context === "homework_required" && event.eventName === "activity_completed") {
        void interpretDirectExperienceOutcome(event).catch((error: unknown) => {
          console.warn(
            ` 🎮 [direct-feedback] [deferred] child=${event.childId} node=${event.nodeId ?? "unknown"} reason=${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }
      let selectedRouteId: string | undefined;
      if (event.context === "baseline_route" && event.source === "child_choice" && event.selectedOptionId) {
        const selected = event.shownOptions.find(
          (option) => option.optionId === event.selectedOptionId,
        );
        if (selected) {
          const cycle = getLatestLearningCycle(childId);
          const experiment = cycle?.agencyExperiment;
          const route = experiment?.routes.find((candidate) =>
            candidate.routeId === selected.experimentId || candidate.routeId === event.selectedOptionId);
          if (cycle && experiment && route) {
            const alreadyRecorded = cycle.routeSelection?.history.some(
              (entry) => entry.choiceEventId === event.choiceEventId,
            ) === true;
            const updated = alreadyRecorded
              ? cycle
              : transitionLearningCycle(childId, cycle.homeworkId, cycle.revision, {
                  type: "route_selected",
                  experimentId: experiment.experimentId,
                  routeId: route.routeId,
                  choiceEventId: event.choiceEventId,
                });
            selectedRouteId = updated.routeSelection?.selectedRouteId;
            console.log(
              ` 🎮 [agency-route] [selected] child=${childId} route=${selectedRouteId ?? route.routeId} event=${event.choiceEventId}`,
            );
          }
        }
      }
      return res.json({
        ok: true,
        applied: applied.applied,
        skippedPersistence: false,
        choiceEventId: event.choiceEventId,
        ...(selectedRouteId ? { selectedRouteId } : {}),
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

  app.post(
    "/api/profile/:childId/companion-care/purchase",
    (req: Request, res: Response) => {
      const childId = String(req.params.childId ?? "").trim();
      const body = (req.body ?? {}) as { itemId?: unknown; requestId?: unknown };
      const itemId = String(body.itemId ?? "").trim();
      const requestId = String(body.requestId ?? "").trim();
      if (!childId || !itemId || !requestId) {
        return res.status(400).json({ error: "childId, itemId, and requestId required" });
      }
      const runtime = resolveSunnyRuntimeConfig(process.env);
      if (!companionCareFeedShouldPersist(runtime)) {
        return res.status(403).json({ error: "preview_read_only" });
      }
      try {
        const chart = getChildChart(childId);
        const startingPlan = chart.companionCare.plan;
        const result = purchaseCompanionStoreItem(
          startingPlan,
          itemId,
          requestId,
          new Date().toISOString(),
        );
        if (!result.ok) {
          return res.status(result.reason === "insufficient_funds" ? 409 : 400).json({
            error: result.reason,
          });
        }
        if (!result.duplicate) {
          saveCompanionCarePlan(chart, result.plan);
          try {
            mirrorCompanionCareToLearningProfile(chart, result.plan);
          } catch (error) {
            saveCompanionCarePlan(chart, startingPlan);
            throw error;
          }
        }
        const companionCare = companionCareToView(
          result.plan,
          chart.companion.displayName,
        );
        console.log(
          ` 🎮 [companion-store] [purchase] [${result.duplicate ? "duplicate" : "ok"}] child=${childId} item=${itemId} balance=${result.balance}`,
        );
        return res.json({
          ok: true,
          duplicate: result.duplicate,
          item: result.item,
          companionCare,
          companionCurrency: result.balance,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(` 🔴 [companion-store] [purchase] [failed] ${message}`);
        return res.status(500).json({ error: message });
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
        let chartCompanionId: string | undefined;
        let chartDisplayName: string | undefined;
        try {
          const chart = getChildChart(childName.toLowerCase());
          chartCompanionId = chart.companion.config.companionId;
          chartDisplayName = chart.companion.displayName;
        } catch (error) {
          console.warn(
            ` 🎮 [companion-picker] [chart_identity] [fallback] child=${childName.toLowerCase()} reason=${error instanceof Error ? error.message : String(error)}`,
          );
        }
        const identity = companionPickerIdentity({
          legacyName: config.name,
          chartCompanionId,
          chartDisplayName,
        });
        const companionMetadata = identity.companionId === "elli"
          ? ELLI
          : identity.companionId === "matilda"
            ? MATILDA
            : config;
        return {
          childName,
          companionName: identity.companionName,
          emoji: companionMetadata.emoji,
          voiceId: companionMetadata.voiceId,
          openingLine: companionMetadata.openingLine,
          goodbye: companionMetadata.goodbye,
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
    const banterText = shouldUseShowroomBanterSpeech({
      source: req.body?.source,
      text: req.body?.text,
    })
      ? normalizeShowroomBanterSpeechText(req.body?.text)
      : "";
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
      const text = banterText || readShowroomScript(companion.id, companion.name, line, language);
      console.log(
        ` 🎮 [showroom-speak] [tts] companion=${companion.id} source=${banterText ? String(req.body?.source) : line}`,
      );
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

  app.post("/api/companions/video-call-traces/:traceId/events", (req: Request, res: Response) => {
    const traceId =
      typeof req.params.traceId === "string" ? req.params.traceId.trim() : "";
    const eventName =
      typeof req.body?.eventName === "string" ? req.body.eventName.trim() : "";
    if (!traceId) {
      return res.status(400).json({ ok: false, error: "traceId_required" });
    }
    if (!COMPANION_VIDEO_CALL_TRACE_EVENTS.has(eventName as CompanionVideoCallTraceEventName)) {
      return res.status(400).json({ ok: false, error: "invalid_trace_event" });
    }
    try {
      recordCompanionVideoCallTraceEvent({
        traceId,
        turnId: typeof req.body?.turnId === "string" ? req.body.turnId : undefined,
        eventName: eventName as CompanionVideoCallTraceEventName,
        origin: req.body?.origin === "server" ? "server" : "client",
        childId: typeof req.body?.childId === "string" ? req.body.childId : undefined,
        companionId:
          typeof req.body?.companionId === "string" ? req.body.companionId : undefined,
        callSource:
          typeof req.body?.callSource === "string" ? req.body.callSource : undefined,
        relationshipState:
          typeof req.body?.relationshipState === "string"
            ? req.body.relationshipState
            : undefined,
        timestamp:
          typeof req.body?.timestamp === "number" && Number.isFinite(req.body.timestamp)
            ? req.body.timestamp
            : undefined,
        payload: tracePayloadFromRequestBody(req.body),
      });
      return res.json({
        ok: true,
        traceId,
        traceUrl: `/api/companions/video-call-traces/${encodeURIComponent(traceId)}`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ ok: false, error: message });
    }
  });

  app.get("/api/companions/video-call-traces/:traceId", (req: Request, res: Response) => {
    const traceId =
      typeof req.params.traceId === "string" ? req.params.traceId.trim() : "";
    if (!traceId) {
      return res.status(400).json({ ok: false, error: "traceId_required" });
    }
    try {
      return res.json(readCompanionVideoCallTracePacket(traceId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("trace_not_found:")) {
        return res.status(404).json({ ok: false, error: "trace_not_found" });
      }
      return res.status(500).json({ ok: false, error: message });
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
      const talkTraceStartedAt = Date.now();
      const latencySpans: {
        claudeMs?: number;
        toolFollowupMs?: number;
        ttsMs?: number;
        requestToResponseMs?: number;
      } = {};
      safeRecordCompanionVideoCallTrace({
        callTraceId: talk.callTraceId,
        turnId: talk.turnId,
        eventName: "talk_request_start",
        childId: talk.childId,
        companionId: talk.companionId,
        callSource: talk.callSource,
        relationshipState: talk.relationshipState,
        timestamp: talkTraceStartedAt,
        payload: {
          questionText: talk.question,
          showroomTheme: talk.showroomTheme,
          mode: talk.mode ?? "showroom",
          activeActivity: talk.activeActivity,
          activityReaction: talk.activityReaction,
          conversationIntent: talk.conversationIntent,
          visualSnapshot: talk.visualSnapshot,
          visionRequested: Boolean(talk.visualSnapshot),
        },
      });
      if (talk.activityReaction) {
        safeRecordCompanionVideoCallTrace({
          callTraceId: talk.callTraceId,
          turnId: talk.turnId,
          eventName: "activity_reaction_request_start",
          childId: talk.childId,
          companionId: talk.companionId,
          callSource: talk.callSource,
          relationshipState: talk.relationshipState,
          timestamp: talkTraceStartedAt,
          payload: {
            activityReaction: talk.activityReaction,
            activeActivity: talk.activeActivity,
          },
        });
      }
      const showroomPersonality = readShowroomPersonality(
        companion.id,
        companion.personalityMarkdown ?? "",
      );
      const primaryPersonality =
        talk.mode === "video_call" && companion.personalityMarkdown?.trim()
          ? [
              companion.personalityMarkdown.trim(),
              "Showroom display notes only; do not let these override the companion persona:",
              showroomPersonality,
            ].join("\n")
          : showroomPersonality;
      const companionMemory = buildShowroomTalkMemoryPrompt(
        readCompanionCareMemoryForPrompt(talk.childId, talk.companionId),
      );
      const system = buildShowroomTalkSystemPrompt({
        companionId: companion.id,
        companionName: companion.name,
        showroomTheme: talk.showroomTheme,
        personality: primaryPersonality,
        mode: talk.mode,
        hasFreshVisualSnapshot: Boolean(talk.visualSnapshot),
        lastVisualSummary: talk.lastVisualSummary,
        callSource: talk.callSource,
        relationshipState: talk.relationshipState,
        rewardContext: talk.rewardContext,
        activeActivity: talk.activeActivity,
        activityReaction: talk.activityReaction,
        conversationIntent: talk.conversationIntent,
        companionMemory,
      });
      const messages = buildShowroomClaudeMessages({
        question: talk.question,
        mode: talk.mode,
        visualSnapshot: talk.visualSnapshot,
      });
      const client = new Anthropic();
      const showroomTools = [
        ...getShowroomCompanionActTools(),
        ...getShowroomCompanionActivityTools(),
      ];
      // The system prompt is static across a call (persona + room + memory);
      // caching it cuts Claude's time-to-first-token on every later turn.
      const cachedSystem: Anthropic.TextBlockParam[] = [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
      ];
      // Game beats (activity reactions, move packets) ride the fast model;
      // social turns keep Sonnet for persona and memory nuance.
      const talkModel = talk.activityReaction
        ? process.env.SUNNY_COMPANION_GAME_MODEL || GAME_GRADE_HAIKU_MODEL
        : COMPANION_TALK_SONNET_MODEL;
      // Game beats need one short line + one gesture call; a tight cap bounds
      // tail latency on fast-model turns.
      const talkMaxTokens = talk.activityReaction ? 120 : 180;
      const claudeStartedAt = Date.now();
      const msg = await client.messages.create({
        model: talkModel,
        max_tokens: talkMaxTokens,
        system: cachedSystem,
        messages: messages as Anthropic.MessageParam[],
        tools: showroomTools,
      });
      latencySpans.claudeMs = Date.now() - claudeStartedAt;
      const companionActToolUseBlocks = msg.content
        .filter(
          (block): block is Anthropic.ToolUseBlock =>
            block.type === "tool_use" && block.name === "companionAct",
        )
        .slice(0, 4);
      const activityToolUseBlocks = msg.content
        .filter(
          (block): block is Anthropic.ToolUseBlock =>
            block.type === "tool_use" && block.name === "openCompanionActivity",
        )
        .slice(0, 2);
      const commandByToolUseId = new Map<string, ReturnType<typeof createShowroomCompanionActCommand>>();
      for (const block of companionActToolUseBlocks) {
        commandByToolUseId.set(
          block.id,
          createShowroomCompanionActCommand({
            childId: talk.childId,
            rawInput: block.input,
          }),
        );
      }
      const activityByToolUseId = new Map<
        string,
        ReturnType<typeof createShowroomCompanionActivityRequest>
      >();
      for (const block of activityToolUseBlocks) {
        activityByToolUseId.set(
          block.id,
          createShowroomCompanionActivityRequest({
            childId: talk.childId,
            companionId: talk.companionId,
            rawInput: block.input,
          }),
        );
      }
      const companionCommands = [...commandByToolUseId.values()].filter(
        (command): command is NonNullable<typeof command> => Boolean(command),
      );
      const activityRequests = [...activityByToolUseId.values()].filter(
        (request): request is NonNullable<typeof request> => Boolean(request),
      );
      let text = extractAnthropicText(msg);
      const shouldRunToolFollowup = shouldRunShowroomToolFollowup({
        isActivityReaction: Boolean(talk.activityReaction),
        rawText: text,
        companionActToolUseCount: companionActToolUseBlocks.length,
        activityToolUseCount: activityToolUseBlocks.length,
        activityReactionEventType: talk.activityReaction?.eventType,
      });
      if (shouldRunToolFollowup) {
        const companionToolResults: Anthropic.ToolResultBlockParam[] =
          companionActToolUseBlocks.map((block) => {
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
                  talk.activityReaction
                    ? `Activity reactions need audible companionship. Answer with one short in-character line the companion should say aloud about this ${getCompanionActivityDescriptor(talk.activityReaction.activityId).displayName} moment. Do not include stage directions.`
                    : "If spoken words add value, answer with the exact short words the companion should say aloud. If the visual action is enough, return an empty string. Do not include stage directions.",
              }),
            };
          });
        const activityToolResults: Anthropic.ToolResultBlockParam[] =
          activityToolUseBlocks.map((block) => {
            const activity = activityByToolUseId.get(block.id);
            return {
              type: "tool_result",
              tool_use_id: block.id,
              is_error: !activity,
              content: JSON.stringify({
                type: "showroom_companion_activity_result",
                accepted: Boolean(activity),
                activityId: activity?.activityId ?? null,
                surface: activity?.surface ?? null,
                instruction:
                  "If accepted, say one short playful sentence inviting the child into the game. Do not explain UI implementation.",
              }),
            };
          });
        const toolResults = [...companionToolResults, ...activityToolResults];
        const toolFollowupStartedAt = Date.now();
        const afterTool = await client.messages.create({
          model: talkModel,
          max_tokens: 160,
          system: cachedSystem,
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
          tools: showroomTools,
          tool_choice: { type: "none" },
        });
        latencySpans.toolFollowupMs = Date.now() - toolFollowupStartedAt;
        text = extractAnthropicText(afterTool) || text;
      } else {
        latencySpans.toolFollowupMs = 0;
      }
      const spokenText = resolveShowroomSpokenText({
        rawText: text,
        companionCommandCount: companionCommands.length + activityRequests.length,
      });
      let audioBase64: string | undefined;
      let audioContentType: string | undefined;
      // Video-call turns use the low-latency flash model; it does not support
      // pronunciation dictionaries, which companion banter does not need.
      const isVideoCallTts = talk.mode === "video_call";
      const ttsModelId = isVideoCallTts
        ? process.env.SUNNY_VIDEO_CALL_TTS_MODEL || VIDEO_CALL_FLASH_TTS_MODEL
        : (companion.voiceModelId ?? DEFAULT_ELEVENLABS_MODEL);
      if (spokenText) {
        const elevenlabs = new ElevenLabsClient({ apiKey });
        const locators = getPronunciationLocators();
        const ttsStartedAt = Date.now();
        const audio = await elevenlabs.textToSpeech.convert(talk.voiceId, {
          text: spokenText,
          modelId: ttsModelId,
          ...(!isVideoCallTts && locators && { pronunciationDictionaryLocators: locators }),
        });
        const buffer = await audioLikeToBuffer(audio);
        latencySpans.ttsMs = Date.now() - ttsStartedAt;
        audioBase64 = buffer.toString("base64");
        audioContentType = "audio/mpeg";
      } else {
        latencySpans.ttsMs = 0;
      }
      latencySpans.requestToResponseMs = Date.now() - talkTraceStartedAt;
      const event = createShowroomTalkCompletedEvent({
        childId: talk.childId,
        companionId: talk.companionId,
        showroomTheme: talk.showroomTheme,
        question: talk.question,
        responseText: spokenText,
        mode: talk.mode,
        callSource: talk.callSource,
        relationshipState: talk.relationshipState,
        rewardContext: talk.rewardContext,
        visionUsed: Boolean(talk.visualSnapshot),
        visualSnapshot: talk.visualSnapshot,
      });
      try {
        recordCompanionInteractionEvent({
          childId: talk.childId,
          companionId: talk.companionId,
          callSource: talk.callSource,
          relationshipState: talk.relationshipState,
          eventType: talk.activityReaction
            ? "companion_activity_completed"
            : "companion_talk_completed",
          questionText: talk.question,
          companionText: spokenText,
          commandCount: companionCommands.length,
          visionUsed: Boolean(talk.visualSnapshot),
          visualSnapshot: talk.visualSnapshot,
          rewardContext: talk.rewardContext,
          ...(talk.activityReaction && {
            activityContext: {
              activityId: talk.activityReaction.activityId,
              eventType: talk.activityReaction.eventType,
              ...(talk.activityReaction.result && {
                result: talk.activityReaction.result,
              }),
              machinePrompt: talk.question,
            },
          }),
        });
        // Deterministic win/loss history: counted here, never by a model.
        if (talk.activityReaction?.result) {
          const recorded = recordCompanionGameResult({
            childId: talk.childId,
            companionId: talk.companionId,
            activityId: talk.activityReaction.activityId,
            result: talk.activityReaction.result,
          });
          console.log(
            ` 🎮 [companion-memory] [game_result] [${recorded.recorded ? "ok" : recorded.reason}] child=${talk.childId} companion=${talk.companionId} activity=${talk.activityReaction.activityId} result=${talk.activityReaction.result}`,
          );
        }
        void maybeCompactCompanionInteractionMemory({
          childId: talk.childId,
          companionId: talk.companionId,
        }).catch((err: unknown) => {
          console.error(
            " 🔴 [companion-memory] [compact_async] [error]",
            err instanceof Error ? err.message : String(err),
          );
        });
      } catch (err: unknown) {
        console.error(
          " 🔴 [companion-memory] [ledger_append] [error]",
          err instanceof Error ? err.message : String(err),
        );
      }
      const visualSummary =
        talk.mode === "video_call" && talk.visualSnapshot
          ? spokenText.slice(0, 220)
          : undefined;

      console.log(
        ` 🎮 [showroom-talk] completed child=${talk.childId} companion=${talk.companionId} room=${talk.showroomTheme} mode=${talk.mode ?? "showroom"} vision=${Boolean(talk.visualSnapshot)} companionCommands=${companionCommands.length} activityRequests=${activityRequests.length}`,
      );
      safeRecordCompanionVideoCallTrace({
        callTraceId: talk.callTraceId,
        turnId: talk.turnId,
        eventName: "talk_response_received",
        childId: talk.childId,
        companionId: talk.companionId,
        callSource: talk.callSource,
        relationshipState: talk.relationshipState,
        timestamp: Date.now(),
        payload: {
          responseText: spokenText,
          commandCount: companionCommands.length,
          activityRequestCount: activityRequests.length,
          conversationIntent: talk.conversationIntent,
          visionUsed: Boolean(talk.visualSnapshot),
          requestToResponseMs: latencySpans.requestToResponseMs,
          latencySpans,
          model: talkModel,
          ttsModelId,
          activeActivity: talk.activeActivity,
          activityReaction: talk.activityReaction,
        },
      });
      if (talk.activityReaction) {
        safeRecordCompanionVideoCallTrace({
          callTraceId: talk.callTraceId,
          turnId: talk.turnId,
          eventName: "activity_reaction_response_received",
          childId: talk.childId,
          companionId: talk.companionId,
          callSource: talk.callSource,
          relationshipState: talk.relationshipState,
          timestamp: Date.now(),
          payload: {
            responseText: spokenText,
            commandCount: companionCommands.length,
            activityReaction: talk.activityReaction,
            conversationIntent: talk.conversationIntent,
            activeActivity: talk.activeActivity,
            aiAuthored: true,
            requestToResponseMs: latencySpans.requestToResponseMs,
            latencySpans,
          },
        });
      }
      res.json({
        ok: true,
        text: spokenText,
        ...(audioBase64 && { audioBase64 }),
        ...(audioContentType && { audioContentType }),
        companionCommands,
        activityRequests,
        latencySpans,
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

  /**
   * Small read-only view of what a companion remembers, so the picker can show
   * "you've played 4 games together" instead of treating every visit as a
   * first meeting. Deliberately exposes only the deterministic record.
   */
  app.get("/api/companions/:companionId/recognition", (req: Request, res: Response) => {
    const companionId =
      typeof req.params.companionId === "string" ? req.params.companionId.trim() : "";
    const childId =
      typeof req.query.childId === "string" && req.query.childId.trim()
        ? req.query.childId.trim().toLowerCase()
        : "showroom";
    if (!companionId) {
      return res.status(400).json({ ok: false, error: "companionId_required" });
    }
    try {
      const memory = readCompanionCareMemoryForPrompt(childId, companionId);
      const gameRecord = memory?.gameRecord ?? {};
      const totals = Object.values(gameRecord).reduce(
        (acc, entry) => ({
          played: acc.played + (entry?.played ?? 0),
          childWins: acc.childWins + (entry?.childWins ?? 0),
          companionWins: acc.companionWins + (entry?.companionWins ?? 0),
        }),
        { played: 0, childWins: 0, companionWins: 0 },
      );
      res.json({
        ok: true,
        companionId,
        firstMetAt: memory?.firstMetAt ?? null,
        totals,
        gameRecord,
      });
    } catch (err: unknown) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post(
    "/api/companions/:companionId/talk/stream",
    async (req: Request, res: Response) => {
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

      const talk = resolved.request;
      const ttsEnabled = process.env.TTS_ENABLED !== "false";
      const talkTraceStartedAt = Date.now();
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders?.();

      let aborted = false;
      const sse = (event: string, data: unknown) => {
        if (aborted) return;
        writeCompanionTalkSseEvent(res, event, data);
      };

      const latencySpans: {
        claudeMs?: number;
        toolFollowupMs?: number;
        ttsMs?: number;
        firstTokenMs?: number;
        firstAudioMs?: number;
        requestToResponseMs?: number;
      } = {};

      safeRecordCompanionVideoCallTrace({
        callTraceId: talk.callTraceId,
        turnId: talk.turnId,
        eventName: "talk_request_start",
        childId: talk.childId,
        companionId: talk.companionId,
        callSource: talk.callSource,
        relationshipState: talk.relationshipState,
        timestamp: talkTraceStartedAt,
        payload: {
          questionText: talk.question,
          showroomTheme: talk.showroomTheme,
          mode: talk.mode ?? "showroom",
          transport: "sse_stream",
          conversationIntent: talk.conversationIntent,
          visionRequested: Boolean(talk.visualSnapshot),
        },
      });

      let firstAudioAt: number | undefined;
      const speaker = ttsEnabled
        ? createElevenLabsPcmSpeaker({
            voiceId: talk.voiceId,
            apiKey,
            onAudioChunk: (base64Pcm) => {
              if (aborted) return;
              if (firstAudioAt === undefined) {
                firstAudioAt = Date.now();
                latencySpans.firstAudioMs = firstAudioAt - talkTraceStartedAt;
                safeRecordCompanionVideoCallTrace({
                  callTraceId: talk.callTraceId,
                  turnId: talk.turnId,
                  eventName: "talk_stream_first_audio",
                  childId: talk.childId,
                  companionId: talk.companionId,
                  callSource: talk.callSource,
                  relationshipState: talk.relationshipState,
                  timestamp: firstAudioAt,
                  payload: { firstAudioMs: latencySpans.firstAudioMs },
                });
              }
              sse("audio", { chunk: base64Pcm });
            },
          })
        : null;

      res.on("close", () => {
        if (res.writableEnded) return;
        aborted = true;
        speaker?.stop();
      });

      try {
        const showroomPersonality = readShowroomPersonality(
          companion.id,
          companion.personalityMarkdown ?? "",
        );
        const primaryPersonality =
          talk.mode === "video_call" && companion.personalityMarkdown?.trim()
            ? [
                companion.personalityMarkdown.trim(),
                "Showroom display notes only; do not let these override the companion persona:",
                showroomPersonality,
              ].join("\n")
            : showroomPersonality;
        const companionMemory = buildShowroomTalkMemoryPrompt(
          readCompanionCareMemoryForPrompt(talk.childId, talk.companionId),
        );
        const system = buildShowroomTalkSystemPrompt({
          companionId: companion.id,
          companionName: companion.name,
          showroomTheme: talk.showroomTheme,
          personality: primaryPersonality,
          mode: talk.mode,
          hasFreshVisualSnapshot: Boolean(talk.visualSnapshot),
          lastVisualSummary: talk.lastVisualSummary,
          callSource: talk.callSource,
          relationshipState: talk.relationshipState,
          rewardContext: talk.rewardContext,
          activeActivity: talk.activeActivity,
          activityReaction: talk.activityReaction,
          conversationIntent: talk.conversationIntent,
          companionMemory,
        });
        const messages = buildShowroomClaudeMessages({
          question: talk.question,
          mode: talk.mode,
          visualSnapshot: talk.visualSnapshot,
        });
        const client = new Anthropic();
        const showroomTools = [
          ...getShowroomCompanionActTools(),
          ...getShowroomCompanionActivityTools(),
        ];
        // Static per call; caching cuts time-to-first-token on later turns.
        const cachedSystem: Anthropic.TextBlockParam[] = [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ];
        const talkModel = talk.activityReaction
          ? process.env.SUNNY_COMPANION_GAME_MODEL || GAME_GRADE_HAIKU_MODEL
          : COMPANION_TALK_SONNET_MODEL;
        const talkMaxTokens = talk.activityReaction ? 120 : 180;

        sse("meta", {
          ok: true,
          model: talkModel,
          pcmSampleRate: COMPANION_TALK_STREAM_PCM_SAMPLE_RATE,
          ttsEnabled,
        });

        // Prewarm the TTS socket while Claude thinks.
        const speakerReady = speaker
          ? speaker.connect().catch((err: unknown) => {
              console.warn(" 🔴 [companion-talk-stream] tts_prewarm_failed", err);
            })
          : Promise.resolve();

        const claudeStartedAt = Date.now();
        let firstTokenAt: number | undefined;
        let streamedText = "";
        const messageStream = client.messages.stream({
          model: talkModel,
          max_tokens: talkMaxTokens,
          system: cachedSystem,
          messages: messages as Anthropic.MessageParam[],
          tools: showroomTools,
        });
        messageStream.on("text", (delta: string) => {
          if (aborted || !delta) return;
          if (firstTokenAt === undefined) {
            firstTokenAt = Date.now();
            latencySpans.firstTokenMs = firstTokenAt - talkTraceStartedAt;
            safeRecordCompanionVideoCallTrace({
              callTraceId: talk.callTraceId,
              turnId: talk.turnId,
              eventName: "talk_stream_first_token",
              childId: talk.childId,
              companionId: talk.companionId,
              callSource: talk.callSource,
              relationshipState: talk.relationshipState,
              timestamp: firstTokenAt,
              payload: { firstTokenMs: latencySpans.firstTokenMs },
            });
          }
          streamedText += delta;
          sse("text_delta", { delta });
          speaker?.sendText(delta);
        });

        const msg = await messageStream.finalMessage();
        latencySpans.claudeMs = Date.now() - claudeStartedAt;
        await speakerReady;

        const companionActToolUseBlocks = msg.content
          .filter(
            (block): block is Anthropic.ToolUseBlock =>
              block.type === "tool_use" && block.name === "companionAct",
          )
          .slice(0, 4);
        const activityToolUseBlocks = msg.content
          .filter(
            (block): block is Anthropic.ToolUseBlock =>
              block.type === "tool_use" && block.name === "openCompanionActivity",
          )
          .slice(0, 2);
        const companionCommands = companionActToolUseBlocks
          .map((block) =>
            createShowroomCompanionActCommand({
              childId: talk.childId,
              rawInput: block.input,
            }),
          )
          .filter((command): command is NonNullable<typeof command> => Boolean(command));
        const activityRequests = activityToolUseBlocks
          .map((block) =>
            createShowroomCompanionActivityRequest({
              childId: talk.childId,
              companionId: talk.companionId,
              rawInput: block.input,
            }),
          )
          .filter((request): request is NonNullable<typeof request> => Boolean(request));

        let text = extractAnthropicText(msg) || streamedText.trim();
        const shouldRunToolFollowup = shouldRunShowroomToolFollowup({
          isActivityReaction: Boolean(talk.activityReaction),
          rawText: text,
          companionActToolUseCount: companionActToolUseBlocks.length,
          activityToolUseCount: activityToolUseBlocks.length,
          activityReactionEventType: talk.activityReaction?.eventType,
        });
        if (shouldRunToolFollowup && !aborted) {
          const toolResults: Anthropic.ToolResultBlockParam[] = [
            ...companionActToolUseBlocks,
            ...activityToolUseBlocks,
          ].map((block) => ({
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: JSON.stringify({
              type: "showroom_companion_tool_result",
              accepted: true,
              instruction:
                "Answer with the exact short words the companion should say aloud. Do not include stage directions.",
            }),
          }));
          const toolFollowupStartedAt = Date.now();
          const afterTool = await client.messages.create({
            model: talkModel,
            max_tokens: 160,
            system: cachedSystem,
            messages: [
              ...(messages as Anthropic.MessageParam[]),
              { role: "assistant", content: msg.content as Anthropic.ContentBlockParam[] },
              { role: "user", content: toolResults },
            ],
            tools: showroomTools,
            tool_choice: { type: "none" },
          });
          latencySpans.toolFollowupMs = Date.now() - toolFollowupStartedAt;
          const followupText = extractAnthropicText(afterTool);
          if (followupText) {
            text = followupText;
            sse("text_delta", { delta: followupText });
            speaker?.sendText(followupText);
          }
        } else {
          latencySpans.toolFollowupMs = 0;
        }

        const spokenText = resolveShowroomSpokenText({
          rawText: text,
          companionCommandCount: companionCommands.length + activityRequests.length,
        });
        if (spokenText && spokenText !== text.trim()) {
          // Fallback line was synthesized (no text, no commands); speak it too.
          speaker?.sendText(spokenText);
        }

        const ttsFinishStartedAt = Date.now();
        if (spokenText && speaker) {
          await speaker.finish();
        } else {
          speaker?.stop();
        }
        latencySpans.ttsMs = Date.now() - ttsFinishStartedAt;
        sse("audio_done", { hadAudio: firstAudioAt !== undefined });

        latencySpans.requestToResponseMs = Date.now() - talkTraceStartedAt;
        try {
          recordCompanionInteractionEvent({
            childId: talk.childId,
            companionId: talk.companionId,
            callSource: talk.callSource,
            relationshipState: talk.relationshipState,
            eventType: talk.activityReaction
              ? "companion_activity_completed"
              : "companion_talk_completed",
            questionText: talk.question,
            companionText: spokenText,
            commandCount: companionCommands.length,
            visionUsed: Boolean(talk.visualSnapshot),
            visualSnapshot: talk.visualSnapshot,
            rewardContext: talk.rewardContext,
            ...(talk.activityReaction && {
              activityContext: {
                activityId: talk.activityReaction.activityId,
                eventType: talk.activityReaction.eventType,
                ...(talk.activityReaction.result && {
                  result: talk.activityReaction.result,
                }),
                machinePrompt: talk.question,
              },
            }),
          });
          // Deterministic win/loss history: counted here, never by a model.
          if (talk.activityReaction?.result) {
            const recorded = recordCompanionGameResult({
              childId: talk.childId,
              companionId: talk.companionId,
              activityId: talk.activityReaction.activityId,
              result: talk.activityReaction.result,
            });
            console.log(
              ` 🎮 [companion-memory] [game_result] [${recorded.recorded ? "ok" : recorded.reason}] child=${talk.childId} companion=${talk.companionId} activity=${talk.activityReaction.activityId} result=${talk.activityReaction.result}`,
            );
          }
          void maybeCompactCompanionInteractionMemory({
            childId: talk.childId,
            companionId: talk.companionId,
          }).catch((err: unknown) => {
            console.error(
              " 🔴 [companion-memory] [compact_async] [error]",
              err instanceof Error ? err.message : String(err),
            );
          });
        } catch (err: unknown) {
          console.error(
            " 🔴 [companion-memory] [ledger_append] [error]",
            err instanceof Error ? err.message : String(err),
          );
        }
        const visualSummary =
          talk.mode === "video_call" && talk.visualSnapshot
            ? spokenText.slice(0, 220)
            : undefined;
        safeRecordCompanionVideoCallTrace({
          callTraceId: talk.callTraceId,
          turnId: talk.turnId,
          eventName: "talk_response_received",
          childId: talk.childId,
          companionId: talk.companionId,
          callSource: talk.callSource,
          relationshipState: talk.relationshipState,
          timestamp: Date.now(),
          payload: {
            responseText: spokenText,
            commandCount: companionCommands.length,
            activityRequestCount: activityRequests.length,
            conversationIntent: talk.conversationIntent,
            visionUsed: Boolean(talk.visualSnapshot),
            requestToResponseMs: latencySpans.requestToResponseMs,
            latencySpans,
            model: talkModel,
            transport: "sse_stream",
            activeActivity: talk.activeActivity,
            activityReaction: talk.activityReaction,
          },
        });
        console.log(
          ` 🎮 [companion-talk-stream] completed child=${talk.childId} companion=${talk.companionId} firstToken=${latencySpans.firstTokenMs ?? "n/a"}ms firstAudio=${latencySpans.firstAudioMs ?? "n/a"}ms total=${latencySpans.requestToResponseMs}ms`,
        );
        sse("done", {
          ok: true,
          text: spokenText,
          companionCommands,
          activityRequests,
          latencySpans,
          ...(visualSummary && { visualSummary }),
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
        console.error(" 🔴 [companion-talk-stream] failed", message);
        speaker?.stop();
        sse("error", { ok: false, error: message });
      } finally {
        if (!aborted) res.end();
      }
    },
  );

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
    const contextGamesDir = path.join(resolveChildContextDir(childId), "homework", "games");
    const contextCandidate = path.join(contextGamesDir, filename);
    const resolved = configuredPaths
      .map((p) => path.resolve(p))
      .find((p) => path.basename(p) === filename && fs.existsSync(p))
      ?? (fs.existsSync(contextCandidate) ? path.resolve(contextCandidate) : undefined);
    if (!resolved) {
      return res.status(404).json({ error: "File not found" });
    }
    res.type(path.extname(resolved) || "application/octet-stream");
    return res.sendFile(resolved, { dotfiles: "allow" });
  });

  app.get("/api/homework/game/:childId/:homeworkId/:filename", (req: Request, res: Response) => {
    const childId = typeof req.params.childId === "string" ? req.params.childId.trim().toLowerCase() : "";
    const homeworkId = typeof req.params.homeworkId === "string" ? req.params.homeworkId.trim() : "";
    const filename = typeof req.params.filename === "string" ? req.params.filename.trim() : "";
    if (!childId || !/^[\w.-]+$/.test(homeworkId) || !/^[\w.\- ]+$/.test(filename)) {
      return res.status(404).json({ error: "File not found" });
    }
    const gamesRoot = path.resolve(resolveChildContextDir(childId), "homework", "games");
    const cycleRoot = path.resolve(gamesRoot, homeworkId);
    const resolved = path.resolve(cycleRoot, filename);
    if (!cycleRoot.startsWith(`${gamesRoot}${path.sep}`) || !resolved.startsWith(`${cycleRoot}${path.sep}`) || !fs.existsSync(resolved)) {
      return res.status(404).json({ error: "File not found" });
    }
    res.type(path.extname(resolved) || "application/octet-stream");
    return res.sendFile(resolved, { dotfiles: "allow" });
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
        return res.json({
          ok: true,
          newFile,
          contentId: result.contentId,
          validationReport: result.validationReport,
        });
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
    if (activityId === "generated-baseline") {
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        !Array.isArray((parsed as { rounds?: unknown }).rounds)
      ) {
        return res.status(422).json({
          error: "invalid_activity_config",
          findings: ["generated_baseline_requires_rounds"],
        });
      }
      return res.json(parsed);
    }
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
    const requestedRuntime = resolveSunnyRuntimeConfig(process.env, runtime);
    if (requestedRuntime.subject === "homework") {
      console.warn(
        ` 🎮 [AdventureBoard] legacy_map_start_blocked child=${childId.trim().toLowerCase()}`,
      );
      return res.status(409).json({
        error: "adventure_board_runtime_required",
        message:
          "Homework now launches from /api/child-experience and AdventureBoardExperience, not the legacy map runtime.",
      });
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
      if (
        body.phase === "activity_evidence" &&
        body.payload != null &&
        typeof body.payload === "object"
      ) {
        const events = handleMapClientMessage(sessionId, {
          type: "activity_evidence",
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
