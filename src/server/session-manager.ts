import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import type { WebSocket } from "ws";
import {
  getCompanionConfig,
  type ChildName,
  type CompanionConfig,
} from "../companions/loader";
import { CHARLOTTE_DIAG_DEFAULT_VOICE_ID } from "../diag-voices";
import { generateStoryImage } from "../utils/generateStoryImage";
import {
  DEMO_MODE_PROMPT,
  HOMEWORK_MODE_PROMPT,
  TEST_MODE_PROMPT,
  WORD_BUILDER_ROUND_COMPLETE,
  WORD_BUILDER_ROUND_FAILED,
  WORD_BUILDER_SESSION_COMPLETE,
  SPELL_CHECK_CORRECT,
  buildDebugPrompt,
  buildSessionPrompt,
  buildCanvasContext,
  extractWordsFromHomework,
  normalizeSessionSubject,
} from "../agents/prompts";
import { loadHomeworkPayload } from "../utils/loadHomeworkFolder";
import { getReadingCanvasPreferencesForChild } from "../utils/learningProfileIO";
import { appendDeferredActivity } from "../utils/appendToContext";
import { classifyAndRoute } from "../agents/classifier/classifier";
import { runAgent } from "../agents/elli/run";
import { recordSession } from "../agents/slp-recorder/recorder";
import { connectFlux, type FluxHandle } from "../deepgram-turn";
import {
  checkUserGoodbye,
  checkAssistantGoodbye,
  startMaxDurationTimer,
  getRewardDurations,
} from "./session-triggers";
import { WsTtsBridge } from "./ws-tts-bridge";
import { appendRewardLog } from "../agents/elli/tools/logReward";
import { mathProblem, resetMathProbeSession } from "../agents/elli/tools/mathProblem";
import { resetSessionStart } from "../agents/elli/tools/startSession";
import { resetTransitionToWork } from "../agents/elli/tools/transitionToWork";
import {
  planSession,
  recordAttempt,
  finalizeSession,
  childIdFromName,
} from "../engine/learningEngine";
import { computeProgression } from "../engine/progression";
import { recordClockAttempt, finalizeClockSession } from "../engine/clockTracker";
import { computeQualityFromAttempt } from "../algorithms/spacedRepetition";
import type { AttemptInput, ScaffoldLevel } from "../algorithms/types";
import { type ModelMessage } from "ai";
import {
  extractHomeworkProblems,
  type HomeworkExtractionResult,
} from "../agents/psychologist/psychologist";
import { GameBridge } from "./game-bridge";
import type { GameDefinition } from "./games/registry";
import {
  getReward,
  getTool,
  REWARD_GAMES,
  TEACHING_TOOLS,
} from "./games/registry";
import { resolveLaunchGameRequest } from "./games/resolveLaunchGameRequest";
import { TurnStateMachine } from "./session-state";
import {
  type ActivityMode,
  type ActivityPauseState,
  type CanvasOwner,
  type CanvasState,
  type SessionContext,
  createSessionContext,
  buildCanvasContextMessage,
  type WordScaffoldSessionState,
} from "./session-context";
import {
  CANONICAL_AGENT_TOOL_KEYS,
  getSessionTypeConfig,
  resolveSessionType,
  sessionTypeFromSubject,
} from "./session-type-registry";
import {
  buildAssignmentManifestFromWorksheetProblems,
  buildWorksheetPlayerState,
  detectWorksheetInteractionMode,
  resumeAssignmentProblem,
  type AssignmentManifest,
  type WorksheetInteractionMode,
  type WorksheetPlayerState,
} from "./assignment-player";
import {
  validateProblem,
  type CanonicalWorksheetProblem,
} from "./worksheet-problem";
import {
  clearEarnedReward,
  createWorksheetSession as createWSSession,
  saveEarnedReward,
  type WorksheetSession,
} from "./worksheet-tools";
import { createLaunchGameTool } from "../agents/elli/tools/worksheetTools";
import { createCompanionActTool } from "../agents/tools/companionAct";
import { createSixTools } from "../agents/tools/six-tools";
import {
  buildLaunchGameTool,
  SC_ALREADY_ACTIVE,
  WB_ALREADY_ACTIVE,
} from "../agents/elli/tools/launchGame";
import {
  dateTime,
  formatDateTimeEastern,
} from "../agents/elli/tools/dateTime";
import { buildWorksheetToolPrompt } from "../agents/prompts/worksheetSessionPrompt";
import { appendWorksheetAttemptLine, appendAttemptLine } from "../utils/attempts";
import {
  isDebugClaude,
  isDemoMode,
  isHomeworkMode,
  isSunnyTestMode,
  shouldPersistSessionData,
} from "../utils/runtimeMode";
import { readRasterDimensionsFromFile } from "../utils/rasterDimensions";
import {
  REWARD_CHARACTER_SVG,
  generateCanvasCapabilitiesManifest,
} from "./canvas/registry";
import { canvasStatePersistsThroughBargeIn } from "../shared/canvasRenderability";
import { generateToolDocs } from "../agents/elli/tools/generateToolDocs";
import { auditLog, ttsLogLabel } from "./audit-log";
import {
  createSpellingHomeworkGate,
  type SpellingHomeworkGate,
} from "./spelling-homework-gate";
import { broadcastCompanionEventToMapChild } from "./map-coordinator";
import type { CompanionEventPayload } from "../shared/companionTypes";
import { isCompanionEmote } from "../shared/companionEmotes";
import { COMPANION_CAPABILITIES } from "../shared/companions/registry";
import { validateCompanionCommand } from "../shared/companions/validateCompanionCommand";

type CanvasActivitySnapshot = {
  mode: ActivityMode;
  canvasState: Record<string, unknown> | null;
  contextCanvas?: Record<string, unknown>;
  worksheet?: {
    problemIndex: number;
    wrongForCurrent: number;
    question: string;
  };
  wordBuilder?: {
    word: string;
    round: number;
  };
  spellCheck?: {
    word: string;
  };
};

type PendingGameStart = {
  gameUrl: string;
  childName: string;
  companionName: string;
  config: Record<string, unknown>;
};

/**
 * Strip markdown fences from SVG output.
 * Called at the rendering boundary, before SVG is sent to the browser.
 * This is the canonical place for fence stripping — avoid duplicating elsewhere.
 */
export function stripSvgFences(raw: string): string {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:svg|xml|html)?\s*\n?/i, "");
  cleaned = cleaned.replace(/\n?```\s*$/i, "");
  return cleaned.trim();
}

function stripSvgField(obj: Record<string, unknown>): void {
  const svg = obj.svg;
  if (typeof svg === "string") obj.svg = stripSvgFences(svg);
}

/** Homework + classifier path: SUNNY_CHILD=reina|ila overrides WebSocket session child. */
function parseSunnyChildEnv(): ChildName | null {
  const v = process.env.SUNNY_CHILD?.trim().toLowerCase();
  if (v === "ila") return "Ila";
  if (v === "reina") return "Reina";
  if (v === "creator") return "creator";
  return null;
}

export function shouldTriggerTransitionToWorkPhase(
  roundNumber: number,
  childName: ChildName,
  transitionedToWork: boolean,
): boolean {
  const companion = getCompanionConfig(childName);
  return (
    companion.transitionToWorkAfterRounds != null &&
    roundNumber >= companion.transitionToWorkAfterRounds &&
    !transitionedToWork
  );
}

interface RewardEvent {
  timestamp: string;
  rewardStyle: "flash" | "takeover" | "none";
  displayDuration_ms: number;
  timeToNextUtterance_ms: number;
  nextAnswerCorrect: boolean | null;
  childVerbalReaction: string | null;
  sessionPhase: string;
  correctStreakAtTime: number;
}

/** True only when the child is likely spelling the active word (not social chat). */
export function isSpellingAttempt(text: string, word: string): boolean {
  const w = word.toLowerCase().trim();
  if (!w) return false;
  const raw = text.trim();
  const t = raw.toLowerCase();

  const socialPhrases = [
    "thank you",
    "what's next",
    "whats next",
    "what next",
    "got it",
    "all right",
  ];
  if (socialPhrases.some((p) => t.includes(p))) {
    return false;
  }
  // Word-boundary match avoids false positives (e.g. "notebook", "yesterday").
  if (/\b(okay|ok|yes|no|alright|thanks)\b/i.test(t)) {
    return false;
  }

  const compact = raw.replace(/\s+/g, " ").trim();
  if (/^([a-z]\s*)+$/i.test(compact)) {
    return true;
  }

  const lettersOnly = t.replace(/[^a-z]/g, "");
  const wLetters = w.replace(/[^a-z]/g, "");
  if (lettersOnly.length > 0 && lettersOnly === wLetters) {
    return true;
  }

  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const asWord = new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i");
  return asWord.test(t);
}

/** Unwrap AI SDK tool result wrapper. The SDK wraps execute() return in { output: ... }. */
function unwrapToolResult(result: unknown): unknown {
  if (result && typeof result === "object" && "output" in result) {
    return (result as { output: unknown }).output;
  }
  return result;
}

/** Creator diag voice session — `POST /api/map/test-reading-mode` pushes karaoke here. */
let creatorDiagSessionForReadingTest: SessionManager | null = null;

export function tryPushCreatorDiagReadingKaraoke(
  text: string,
): { ok: true } | { ok: false; error: string } {
  const s = creatorDiagSessionForReadingTest;
  if (!s) return { ok: false, error: "no_active_creator_diag_voice_session" };
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "text_required" };
  const words = trimmed.split(/\s+/).filter(Boolean);
  s.applyClientToolCall("canvasShow", {
    type: "karaoke",
    storyText: trimmed,
    words,
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1600",
  });
  return { ok: true };
}

const TEST_PRONUNCIATION_WORDS = [
  "blister",
  "carpet",
  "thirteen",
  "orbit",
  "harvest",
  "confirm",
  "interrupt",
  "perfume",
  "hamburger",
  "corner",
  "kindergarten",
  "chimp",
  "inhabit",
  "instruments",
  "band",
];

export function tryPushCreatorDiagPronunciation(): { ok: true } | { ok: false; error: string } {
  const s = creatorDiagSessionForReadingTest;
  if (!s) return { ok: false, error: "no_active_creator_diag_voice_session" };
  s.applyClientToolCall("canvasShow", {
    type: "pronunciation",
    pronunciationWords: TEST_PRONUNCIATION_WORDS,
  });
  return { ok: true };
}

/** Options passed from the client on `start_session` (see ws-handler). */
export type SessionManagerOptions = {
  silentTts?: boolean;
  /** No LLM / no server TTS — Deepgram STT only (e.g. diag reading kiosk). */
  sttOnly?: boolean;
};

export class SessionManager {
  /** When true, child speech is not sent to the companion (silent reward games). */
  public suppressTranscripts: boolean = false;

  private ws: WebSocket;
  private childName: ChildName;
  private companion: CompanionConfig;
  private conversationHistory: ModelMessage[] = [];
  private readonly options?: SessionManagerOptions;
  private ttsBridge: WsTtsBridge | null = null;
  private currentAbort: AbortController | null = null;
  private clearSessionTimer: (() => void) | null = null;
  private fluxHandle: FluxHandle | null = null;
  private isEnding = false;
  private sessionStartTime = 0;
  private roundNumber = 0;

  private rewardLog: RewardEvent[] = [];
  private correctStreak = 0;

  private lastTranscript = "";
  private lastTranscriptTime = 0;
  private lastEagerTranscript = "";
  private lastEagerTranscriptTime = 0;
  private speakingStartedAt = 0;
  private lastCanvasWasMath = false;
  private lastCanvasMode: string = "idle";
  /** Latest karaoke story body from canvasShow — used for optional story illustration after reading complete. */
  private lastKaraokeStoryText = "";
  /** While true, block canvasShow so the client can show the Grok illustration without karaoke redraw. */
  private storyImagePending = false;
  /** One automatic illustration per karaoke story; reset when story text changes. Explicit sessionLog generate_image always allowed. */
  private storyImageGeneratedThisStory = false;
  /** After reading_progress event=complete, allow STT through while karaoke canvas may still be visible. */
  private karaokeReadingComplete = false;
  /** Ensures event=complete triggers at most one companion turn per karaoke story. */
  private readingProgressCompleteConsumed = false;

  /** Karaoke on screen and reader has not finished (no reading_progress complete yet). */
  private karaokeReadingInProgress(): boolean {
    if ((this.currentCanvasState as { mode?: string } | null)?.mode !== "karaoke") {
      return false;
    }
    const rp = this.ctx?.readingProgress;
    if (!rp || rp.totalWords <= 0) return false;
    if (rp.event === "complete") return false;
    return rp.wordIndex < rp.totalWords;
  }

  /** Block a second canvasShow karaoke while the child is mid-story (after first word advance). */
  private shouldBlockKaraokeCanvasRefresh(): boolean {
    if ((this.currentCanvasState as { mode?: string } | null)?.mode !== "karaoke") {
      return false;
    }
    const rp = this.ctx?.readingProgress;
    if (!rp || rp.totalWords <= 0) return false;
    if (rp.event === "complete") return false;
    return rp.wordIndex > 0;
  }

  /**
   * Reading mode: child STT is for local word match only — do not run Claude per word.
   * Diag: suppress unless utterance looks like a command to the assistant.
   */
  private shouldSuppressTranscriptDuringKaraoke(transcript: string): boolean {
    const mode = (this.currentCanvasState as { mode?: string } | null)?.mode;
    if (mode !== "karaoke" || this.karaokeReadingComplete) return false;
    const st = this.ctx?.sessionType;
    if (st === "reading") {
      console.log("  📖 [reading] transcript suppressed during karaoke");
      return true;
    }
    if (st === "diag") {
      const t = transcript.trim();
      const words = t.split(/\s+/).filter(Boolean);
      const looksLikeCommand =
        t.includes("?") ||
        /^(hey|charlotte|stop|clear)\b/i.test(t) ||
        words.length > 8;
      if (!looksLikeCommand) {
        console.log("  📖 [diag-reading] transcript suppressed");
        return true;
      }
    }
    return false;
  }
  /** Server-canonical record of what is currently displayed on the canvas.
   *  Updated when the canvas changes; cleared on session end and when the client
   *  is reset to idle (barge-in only does that for ephemeral modes — worksheet/games persist).
   *  Injected into each user turn so the AI knows what's already on screen. */
  private currentCanvasState: Record<string, unknown> | null = null;
  private currentCanvasRevision = 0;
  private toolCallsMadeThisTurn = 0;
  private activeWord: string | null = null;
  private isSpellingSession = false;
  private sessionStartedToolCalled = false;
  private transitionedToWork = false;

  // ── Word Builder — server owns all round state ──────────────────────────
  private wbWord: string = "";
  private wbRound: number = 0;
  private wbActive: boolean = false;
  /** round_* iframe events while SPEAKING or PROCESSING — flushed after playback or agent step */
  private pendingRoundComplete: Record<string, unknown> | null = null;
  /** Hold agent TTS until browser posts `ready` for this canvas revision */
  private gamePendingRevision: number | null = null;
  /** When true, defer ttsBridge.finish + audio_done until canvas_done or game ready */
  private deferredTtsFinish = false;
  private gameTtsFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  /** Safety: exit Word Builder if no round activity for this long */
  private wbActivityTimeout: ReturnType<typeof setTimeout> | null = null;
  private static readonly WB_ACTIVITY_MS = 90_000;
  /** Dedup duplicate iframe round_complete for the same round number */
  private wbLastProcessedRound = 0;
  /** After game_complete: block startWordBuilder until child spells wbWord (sessionLog). */
  private wbAwaitingSpell = false;
  /** Prevents two ok:true startWordBuilder executes in one agent step before handleToolCall runs. */
  private wbToolExecuteClaimed = false;
  /** Same for startSpellCheck / one step. */
  private spellCheckToolExecuteClaimed = false;
  // ────────────────────────────────────────────────────────────────────────

  // Legacy aliases kept for spell-check (different flow)
  private activeWordBuilderWord = "";
  private wordBuilderSessionActive = false;
  private activeSpellCheckWord = "";
  private spellCheckSessionActive = false;
  private activeWordContext: string = "";
  private wordAttemptCounts: Map<string, number> = new Map();
  private wordScaffoldState = new Map<string, WordScaffoldSessionState>();
  private pendingGameStart: PendingGameStart | null = null;

  private turnSM: TurnStateMachine;

  private readonly gameBridge = new GameBridge(
    (payload) => this.send("game_message", { forward: payload }),
    (voiceEnabled) => {
      this.suppressTranscripts = !voiceEnabled;
      console.log(`  🎮 Voice: ${voiceEnabled ? "active" : "silent"}`);
    },
  );

  /** Homework spelling list (normalized) — sessionStatus spellingWordsCompleted tracks words with sessionLog(word) */
  private spellingHomeworkWordsByNorm: string[] = [];
  private spellingHomeworkGate: SpellingHomeworkGate =
    createSpellingHomeworkGate([]);
  private spellingWordsWithAttempt = new Set<string>();
  private spaceInvadersRewardActive = false;
  private spaceInvadersRewardLaunched = false;

  /** Option C worksheet session — pure state, Claude calls tools */
  private worksheetSession: WorksheetSession | null = null;

  /** Worksheet mode — companion prompt + canvas context for assignment flow */
  private worksheetMode = false;
  private worksheetProblems: CanonicalWorksheetProblem[] = [];
  private assignmentManifest: AssignmentManifest | null = null;
  private worksheetPlayerState: WorksheetPlayerState | null = null;
  private worksheetInteractionMode: WorksheetInteractionMode = "answer_entry";
  private worksheetProblemIndex = 0;
  private worksheetRewardAfterN = 5;
  private worksheetSubjectLabel = "";
  /** Per-problem trusted/suspect cents and reveal eligibility — single source for pool + reveals. */
  /** Actual worksheet PDF/image bytes — pinned into conversation so the model sees the real worksheet */
  private worksheetPageFile: { data: Buffer; mimeType: string } | null = null;
  private activeCanvasActivity: {
    mode: ActivityMode;
    pauseState: ActivityPauseState;
    resumable: boolean;
    snapshot: CanvasActivitySnapshot | null;
    reason?: string;
  } = {
    mode: "none",
    pauseState: "active",
    resumable: false,
    snapshot: null,
  };

  /** Canonical session state — drives tool filtering, canvas ownership, context injection. */
  private ctx: SessionContext | null = null;

  /** Delete all files in .prompt-cache/ to force re-generation after new homework lands. */
  private bustPromptCache(): void {
    const cacheDir = path.join(process.cwd(), ".prompt-cache");
    if (!fs.existsSync(cacheDir)) return;
    for (const file of fs.readdirSync(cacheDir)) {
      try {
        fs.unlinkSync(path.join(cacheDir, file));
      } catch {
        // best-effort
      }
    }
    console.log("  🗑️  Prompt cache cleared (new homework arrived)");
  }

  private isTeachingMathCanvas(args: Record<string, unknown>): boolean {
    if (args.mode !== "teaching") return false;
    const content = args.content;
    return (
      typeof content === "string" && /[\d]+\s*([+\-×÷])\s*[\d]+/.test(content)
    );
  }

  private isWordTeachingCanvas(args: Record<string, unknown>): boolean {
    if (args.mode !== "teaching") return false;
    if (this.isTeachingMathCanvas(args)) return false;
    const content = args.content;
    return typeof content === "string" && /[a-z]/i.test(content);
  }

  /** Map canvasShow args to legacy showCanvas shape for math/word/reward sync. */
  private showCanvasShapeFromCanvasShowArgs(
    args: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const t = String(args.type ?? "");
    if (t === "text") {
      return {
        mode: "teaching",
        content: args.content,
        phonemeBoxes: args.phonemeBoxes,
      };
    }
    if (t === "math_inline") {
      return {
        mode: "teaching",
        content: args.expression,
        label: args.label,
      };
    }
    if (t === "spelling") {
      const w = String(args.spellingWord ?? args.word ?? "").trim();
      return { mode: "spelling", content: w, spellingWord: w };
    }
    if (t === "reward" || t === "championship") {
      return {
        mode: t,
        content: args.content,
        label: args.label,
        svg: args.svg,
        lottieData: args.lottieData,
      };
    }
    return null;
  }

  /** Canonical math TTS, active word, reward takeover — shared by canvasShow surface types. */
  private applyCompanionCanvasSurfaceSync(legacyArgs: Record<string, unknown>): void {
    this.lastCanvasMode = (legacyArgs.mode as string) ?? "idle";
    this.lastCanvasWasMath = this.isTeachingMathCanvas(legacyArgs);
    if (this.companion.usesCanonicalMathProblem && this.lastCanvasWasMath) {
      const spoken = this.mathContentToSpoken(legacyArgs.content as string);
      this.turnSM.setCanonicalProblem(spoken);
      console.log(`  📐 Canonical problem set: "${spoken}"`);
    } else {
      this.turnSM.setCanonicalProblem(null);
    }
    if (this.companion.tracksActiveWord && this.isWordTeachingCanvas(legacyArgs)) {
      const word = (legacyArgs.content as string | undefined)?.trim() ?? null;
      this.activeWord = word;
      if (word) console.log(`  📝 Active word set: "${word}"`);
      const boxes = legacyArgs.phonemeBoxes as
        | Array<{ position: string; value: string; highlighted: boolean }>
        | undefined;
      if (boxes) {
        const emptyBoxes = boxes.filter(
          (b) => b.value === "" || b.value == null,
        );
        if (emptyBoxes.length > 0) {
          const positions = emptyBoxes.map((b) => b.position).join(", ");
          console.warn(
            `  ⚠️  phonemeBoxes with empty value for word "${word ?? "?"}": [${positions}] — boxes will appear blank on screen`,
          );
        }
      }
    } else if (this.companion.tracksActiveWord) {
      if (legacyArgs.mode === "spelling") {
        const w = String(
          legacyArgs.spellingWord ?? legacyArgs.content ?? "",
        ).trim();
        this.activeWord = w || null;
      } else {
        this.activeWord = null;
      }
    }
    const mode = legacyArgs.mode as string;
    if (mode === "reward" || mode === "championship") {
      const { takeover_ms } = getRewardDurations(this.childName);
      const rewardSvg =
        typeof legacyArgs.svg === "string"
          ? stripSvgFences(legacyArgs.svg)
          : legacyArgs.svg;
      this.send("reward", {
        rewardStyle: "takeover",
        svg: rewardSvg as string | undefined,
        label: legacyArgs.label as string | undefined,
        lottieData: legacyArgs.lottieData as
          | Record<string, unknown>
          | undefined,
        displayDuration_ms: takeover_ms,
      });
      this.logRewardEvent("takeover", takeover_ms);
    }
    if (this.ctx) this.broadcastContext();
  }

  private syncActivityContext(): void {
    if (!this.ctx) return;
    this.ctx.updateActivity({
      mode: this.activeCanvasActivity.mode,
      pauseState: this.activeCanvasActivity.pauseState,
      hidden: this.activeCanvasActivity.pauseState === "paused_for_checkin",
      reason: this.activeCanvasActivity.reason,
    });
  }

  private setActiveCanvasActivity(
    mode: ActivityMode,
    opts: {
      resumable?: boolean;
      reason?: string;
      snapshot?: CanvasActivitySnapshot | null;
    } = {},
  ): void {
    this.activeCanvasActivity = {
      mode,
      pauseState: "active",
      resumable: opts.resumable ?? mode !== "none",
      snapshot: opts.snapshot ?? null,
      reason: opts.reason,
    };
    this.syncActivityContext();
  }

  private clearActiveCanvasActivity(): void {
    this.pendingGameStart = null;
    this.activeCanvasActivity = {
      mode: "none",
      pauseState: "active",
      resumable: false,
      snapshot: null,
    };
    this.syncActivityContext();
  }

  private isPauseForCheckInRequest(transcript: string): boolean {
    const t = transcript.toLowerCase().trim();
    if (!t) return false;
    if (/(clear|hide|turn off).*(canvas|screen)/i.test(t)) return true;
    if (
      /(talk about my day|tell you about my day|tell you something|need to talk|bad experience)/i.test(
        t,
      ) &&
      /(can i|can we|i want to|i need to|could we|just|really quickly|before)/i.test(
        t,
      )
    ) {
      return true;
    }
    return false;
  }

  private isResumeActivityRequest(transcript: string): boolean {
    const t = transcript.toLowerCase().trim();
    if (!t) return false;
    return /(\bi'?m ready\b|\blet'?s go back\b|\bgo back to\b|\bresume\b|\bcontinue\b|\bback to (math|the problem|the worksheet)\b)/i.test(
      t,
    );
  }

  private captureActiveCanvasSnapshot(): CanvasActivitySnapshot | null {
    const mode = this.activeCanvasActivity.mode;
    if (mode === "none") return null;
    const canvasState = this.currentCanvasState
      ? { ...this.currentCanvasState }
      : null;
    const contextCanvas = this.ctx
      ? ({ ...this.ctx.canvas.current } as Record<string, unknown>)
      : undefined;

    if (mode === "worksheet") {
      const p = this.worksheetProblems[this.worksheetProblemIndex];
      return {
        mode,
        canvasState,
        contextCanvas,
        worksheet: {
          problemIndex: this.worksheetProblemIndex,
          wrongForCurrent: 0,
          question: p?.question ?? "",
        },
      };
    }

    if (mode === "word-builder") {
      return {
        mode,
        canvasState,
        contextCanvas,
        wordBuilder: {
          word: this.wbWord,
          round: this.wbRound,
        },
      };
    }

    if (mode === "spell-check") {
      return {
        mode,
        canvasState,
        contextCanvas,
        spellCheck: {
          word: this.activeSpellCheckWord,
        },
      };
    }

    return {
      mode,
      canvasState,
      contextCanvas,
    };
  }

  private async pauseActiveCanvasForCheckIn(reason: string): Promise<boolean> {
    if (
      this.activeCanvasActivity.mode === "none" ||
      !this.activeCanvasActivity.resumable ||
      this.activeCanvasActivity.pauseState === "paused_for_checkin"
    ) {
      return false;
    }

    const snapshot = this.captureActiveCanvasSnapshot();
    if (!snapshot) return false;

    this.activeCanvasActivity = {
      ...this.activeCanvasActivity,
      pauseState: "paused_for_checkin",
      snapshot,
      reason,
    };
    this.syncActivityContext();
    this.currentCanvasState = null;
    if (this.ctx) {
      this.ctx.updateCanvas({
        mode: "idle",
        svg: undefined,
        label: undefined,
        content: undefined,
        sceneDescription: undefined,
        problemAnswer: undefined,
        problemHint: undefined,
      });
    }
    this.broadcastContext();
    this.send("canvas_draw", { mode: "idle" });
    return true;
  }

  private async resumeActiveCanvasActivity(
    replayQuestion = true,
  ): Promise<boolean> {
    if (this.activeCanvasActivity.pauseState !== "paused_for_checkin") {
      return false;
    }

    const snapshot = this.activeCanvasActivity.snapshot;
    if (!snapshot) return false;

    this.activeCanvasActivity = {
      ...this.activeCanvasActivity,
      pauseState: "resuming",
    };
    this.syncActivityContext();

    if (snapshot.mode === "worksheet" && snapshot.worksheet) {
      this.worksheetProblemIndex = snapshot.worksheet.problemIndex;
      if (snapshot.canvasState) {
        this.currentCanvasState = { ...snapshot.canvasState };
      }
      if (this.ctx && snapshot.contextCanvas) {
        this.ctx.updateCanvas(snapshot.contextCanvas as any);
      }
      this.broadcastContext();
      if (snapshot.canvasState) {
        this.send("canvas_draw", {
          args: snapshot.canvasState,
          result: snapshot.canvasState,
        });
      }
      if (replayQuestion) {
        await this.handleCompanionTurn(snapshot.worksheet.question);
      }
      this.activeCanvasActivity = {
        ...this.activeCanvasActivity,
        pauseState: "active",
        snapshot: null,
        reason: undefined,
      };
      this.syncActivityContext();
      this.broadcastContext();
      return true;
    }

    if (snapshot.canvasState) {
      this.currentCanvasState = { ...snapshot.canvasState };
      if (this.ctx && snapshot.contextCanvas) {
        this.ctx.updateCanvas(snapshot.contextCanvas as any);
      }
      this.send("canvas_draw", snapshot.canvasState);
    }
    this.activeCanvasActivity = {
      ...this.activeCanvasActivity,
      pauseState: "active",
      snapshot: null,
      reason: undefined,
    };
    this.syncActivityContext();
    this.broadcastContext();
    return true;
  }

  /**
   * Convert a math canvas string like "16 - 8" or "7 + 9" into spoken TTS form.
   * The server speaks the problem — Claude only speaks feedback ("Nice!").
   */
  private mathContentToSpoken(content: string): string {
    return content
      .replace(/\s*\+\s*/g, " plus ")
      .replace(/\s*-\s*/g, " minus ")
      .replace(/\s*×\s*/g, " times ")
      .replace(/\s*÷\s*/g, " divided by ")
      .replace(/\s*=\s*$/, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  /**
   * @param diagKioskFast — picker "Creator / Diag": skip homework load, classifier, extraction, care plan.
   */
  constructor(
    ws: WebSocket,
    childName: ChildName,
    private readonly diagKioskFast = false,
    options?: SessionManagerOptions,
  ) {
    this.ws = ws;
    this.childName = childName;
    this.options = options;
    this.companion = getCompanionConfig(childName);

    if (isSunnyTestMode()) {
      this.companion = {
        ...this.companion,
        systemPrompt: this.prependDebugClaudeToPrompt(
          TEST_MODE_PROMPT(childName),
        ),
        openingLine: `[TEST MODE] Diagnostic session for ${childName}. Ready. Give me a tool call to verify.`,
      };
      if (isDebugClaude()) {
        this.companion = {
          ...this.companion,
          openingLine: this.debugCreatorOpeningLine(),
        };
      }
      console.log(
        `  🧪 TEST MODE active — diagnostic prompt loaded for ${childName}`,
      );
    }

    this.turnSM = new TurnStateMachine(
      (text) => this.ttsBridge?.sendText(text),
      (msg) => console.log(msg),
      (state) => {
        this.send("session_state", { state });
        if (state === "SPEAKING") {
          this.speakingStartedAt = Date.now();
        } else if (state === "IDLE") {
          this.speakingStartedAt = 0;
        }
      },
    );
  }

  private refreshSpellingHomeworkGate(): void {
    this.spellingHomeworkGate = createSpellingHomeworkGate(
      this.spellingHomeworkWordsByNorm,
    );
  }

  private send(type: string, payload: Record<string, unknown> = {}): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(
        JSON.stringify({
          type,
          timestamp: new Date().toISOString(),
          ...payload,
        }),
      );
    }
  }

  async start(): Promise<void> {
    this.spellingHomeworkWordsByNorm = [];
    this.refreshSpellingHomeworkGate();
    this.spellingWordsWithAttempt.clear();
    this.spaceInvadersRewardLaunched = false;
    this.spaceInvadersRewardActive = false;

    const ts = new Date().toISOString();
    this.sessionStartTime = Date.now();
    console.log(
      `  🌟 [${ts}] Starting session: ${this.childName} with ${this.companion.name}`,
    );

    const envSubject = normalizeSessionSubject(process.env.SUNNY_SUBJECT);
    const subject = this.diagKioskFast ? "diag" : envSubject;

    const detectedChild = this.childName;
    const homeworkChild = this.diagKioskFast
      ? this.childName
      : (parseSunnyChildEnv() ?? detectedChild ?? "Ila");
    console.log(`  👤 Child override: ${homeworkChild}`);

    let homeworkPayload: Awaited<ReturnType<typeof loadHomeworkPayload>> | null =
      null;

    if (!this.diagKioskFast) {
      // Check drop/ for new files and route them before loading homework
      this.send("loading_status", {
        message: "Checking for new assignments...",
      });
      try {
        if (isDemoMode() || isHomeworkMode()) {
          console.log("  🎭 Demo/homework mode — skipping classifier");
        } else {
          const { hasNewFiles, routed } = await classifyAndRoute(homeworkChild);
          if (hasNewFiles) {
            console.log("  📥 New files processed:");
            routed.forEach((r) => console.log(`    ${r}`));
            this.send("loading_status", {
              message: `Loading ${homeworkChild}'s assignments...`,
            });
            this.bustPromptCache();
          }
        }
      } catch (err) {
        console.warn(
          "  ⚠️  Classifier failed:",
          err instanceof Error ? err.message : String(err),
        );
      }

      // Folder-based homework — load in demo too when a folder exists (worksheet + vision)
      homeworkPayload = await loadHomeworkPayload(homeworkChild);
    } else {
      console.log(
        "  ⚡ [diag-kiosk] fast path — no classifier, no homework folder, no extraction",
      );
    }

    if (isHomeworkMode() && homeworkPayload) {
      // HOMEWORK MODE: loads real homework but uses parent-facing prompt (no progression loop)
      console.log(
        `  📚 Homework loaded for ${homeworkChild}: ${homeworkPayload.fileCount} pages`,
      );
      this.send("loading_status", { message: "Preparing homework review..." });

      let extraction: HomeworkExtractionResult = { subject: "", problems: [] };
      try {
        console.log("  🧠 Psychologist extracting worksheet problems...");
        this.send("loading_status", {
          message: "Reading worksheet questions...",
        });
        extraction = await extractHomeworkProblems({
          rawText: homeworkPayload.rawContent,
          pageAssets: homeworkPayload.pageAssets,
        });
        console.log(
          `  🎮 [worksheet] extraction — subject: "${extraction.subject}", ` +
            `problems: ${extraction.problems.length}`,
        );
      } catch (err) {
        console.warn(
          "  ⚠️  Extraction failed:",
          err instanceof Error ? err.message : String(err),
        );
      }

      // Load worksheet PDF as canvas + pin image for vision — same as normal mode
      const pdfFilename = homeworkPayload.assetFilenames.find((n) =>
        n.toLowerCase().endsWith(".pdf"),
      );
      if (pdfFilename) {
        const pdfAssetUrl = `/api/homework/${homeworkPayload.childName}/${homeworkPayload.date}/${encodeURIComponent(pdfFilename)}`;
        // Show PDF on canvas
        this.currentCanvasState = {
          mode: "worksheet_pdf",
          pdfAssetUrl,
          pdfPage: 1,
          overlayFields: [],
        };
        this.send("canvas_draw", this.currentCanvasState);
        // Convert PDF → PNG for companion vision
        try {
          const pdfPath = path.join(homeworkPayload.folderPath, pdfFilename);
          const tmpDir = os.tmpdir();
          const pdfBase = path.basename(pdfPath);
          execSync(`/usr/bin/qlmanage -t -s 2000 -o "${tmpDir}" "${pdfPath}"`, {
            stdio: "pipe",
          });
          const pngPath = path.join(tmpDir, `${pdfBase}.png`);
          this.worksheetPageFile = {
            data: fs.readFileSync(pngPath),
            mimeType: "image/png",
          };
          try {
            fs.unlinkSync(pngPath);
          } catch {
            /* cleanup best-effort */
          }
          console.log(
            `  👁️  [worksheet] loaded PDF PNG for homework review (${(this.worksheetPageFile.data.length / 1024).toFixed(0)} KB)`,
          );
        } catch (e) {
          // Fall back to page asset
          if (
            !this.worksheetPageFile &&
            homeworkPayload.pageAssets.length > 0
          ) {
            const asset = homeworkPayload.pageAssets[0];
            this.worksheetPageFile = {
              data: Buffer.from(asset.data, "base64"),
              mimeType: asset.mediaType,
            };
          }
          console.warn(
            "  ⚠️  PDF→PNG conversion failed:",
            e instanceof Error ? e.message : String(e),
          );
        }
      } else if (homeworkPayload.pageAssets.length > 0) {
        const asset = homeworkPayload.pageAssets[0];
        this.worksheetPageFile = {
          data: Buffer.from(asset.data, "base64"),
          mimeType: asset.mediaType,
        };
      }

      this.worksheetSubjectLabel = extraction.subject.trim() || "worksheet";

      this.companion = {
        ...this.companion,
        systemPrompt: this.prependDebugClaudeToPrompt(
          HOMEWORK_MODE_PROMPT(
            this.childName,
            this.companion.name,
            extraction.subject,
          ),
        ),
        openingLine:
          `Hello — I'm ${this.companion.name} in homework review mode. ` +
          `I've loaded ${homeworkChild}'s worksheet on ${extraction.subject || "homework"}. ` +
          "What would you like to review?",
      };
      console.log(`  📋 Homework mode — parent/developer review prompt active`);
      console.log(`  📚 Subject: ${extraction.subject || subject}`);
      this.send("loading_status", { message: "Ready for review..." });
    } else if (subject === "diag" && !homeworkPayload) {
      this.send("loading_status", { message: "Preparing diagnostic session..." });
      console.log(
        `  🎮 [diag] no homework folder — diagnostic prompt (${homeworkChild})`,
      );
      const sessionPrompt = isDebugClaude()
        ? buildDebugPrompt(
            homeworkChild,
            this.companion.name,
            generateCanvasCapabilitiesManifest(),
            generateToolDocs(),
          )
        : await buildSessionPrompt(
            homeworkChild,
            this.companion.markdownPath,
            "",
            [],
            "diag",
            { carePlan: null },
          );
      this.companion = {
        ...this.companion,
        systemPrompt: isDebugClaude()
          ? sessionPrompt
          : this.prependDebugClaudeToPrompt(sessionPrompt),
      };
      this.isSpellingSession = false;
      console.log(`  ✅ Session prompt ready (${sessionPrompt.length} chars)`);
      console.log(`  📚 Subject mode: ${subject}`);
    } else if (isDemoMode() && !homeworkPayload) {
      this.companion = {
        ...this.companion,
        systemPrompt: this.prependDebugClaudeToPrompt(
          DEMO_MODE_PROMPT(this.childName, this.companion.name),
        ),
        openingLine:
          `Hello — I'm ${this.companion.name} in demo mode. ` +
          "I'm ready to demonstrate my capabilities. " +
          "What would you like to see?",
      };
      console.log(
        `  🎭 Demo mode — parent/developer prompt (no homework folder for ${homeworkChild})`,
      );
      console.log(`  📚 Subject mode: ${subject}`);
      this.send("loading_status", { message: "Starting demo session..." });
    } else if (homeworkPayload) {
      console.log(
        `  📚 Homework loaded for ${homeworkChild}: ` +
          `${homeworkPayload.fileCount} pages`,
      );
      this.send("loading_status", { message: "Preparing session prompt..." });

      // ── Extraction cache ────────────────────────────────────────────────────
      // extraction.json lives alongside the PDF. Once written, all future
      // sessions load instantly with zero tokens and no overload risk.
      const cacheFile = path.join(
        homeworkPayload.folderPath,
        "extraction.json",
      );

      let extraction: HomeworkExtractionResult = {
        subject: "",
        problems: [],
      };

      // Try loading from cache first
      let loadedFromCache = false;
      if (fs.existsSync(cacheFile)) {
        try {
          const cached = JSON.parse(
            fs.readFileSync(cacheFile, "utf-8"),
          ) as HomeworkExtractionResult;
          if (cached.subject && cached.problems.length > 0) {
            extraction = cached;
            loadedFromCache = true;
            console.log(
              `  ⚡ [worksheet] loaded extraction from cache — subject: "${extraction.subject}", ` +
                `problems: ${extraction.problems.length}`,
            );
          }
        } catch (e) {
          console.warn(
            "  ⚠️  extraction.json corrupt — re-extracting:",
            e instanceof Error ? e.message : String(e),
          );
        }
      }

      if (!loadedFromCache) {
        try {
          console.log("  🧠 Psychologist extracting worksheet problems...");
          this.send("loading_status", {
            message: "Reading worksheet questions...",
          });
          extraction = await extractHomeworkProblems({
            rawText: homeworkPayload.rawContent,
            pageAssets: homeworkPayload.pageAssets,
          });
          console.log(
            `  🎮 [worksheet] extraction — subject: "${extraction.subject}", ` +
              `problems: ${extraction.problems.length}`,
          );
          // Persist to cache so next session is instant
          if (extraction.subject && extraction.problems.length > 0) {
            try {
              fs.writeFileSync(
                cacheFile,
                JSON.stringify(extraction, null, 2),
                "utf-8",
              );
              console.log(
                `  💾 [worksheet] extraction cached → extraction.json`,
              );
            } catch (e) {
              console.warn(
                "  ⚠️  Could not write extraction.json:",
                e instanceof Error ? e.message : String(e),
              );
            }
          }
        } catch (err) {
          console.warn(
            "  ⚠️  Worksheet extraction failed:",
            err instanceof Error ? err.message : String(err),
          );
          // Stale cache is better than nothing — check once more
          if (fs.existsSync(cacheFile)) {
            try {
              const stale = JSON.parse(
                fs.readFileSync(cacheFile, "utf-8"),
              ) as HomeworkExtractionResult;
              if (stale.subject) {
                extraction = stale;
                console.warn("  ⚠️  Using stale extraction.json as fallback");
              }
            } catch {
              /* ignore */
            }
          }
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      this.worksheetProblems = this.selectWorksheetProblems(extraction);
      this.worksheetProblemIndex = 0;
      this.worksheetRewardAfterN =
        extraction.session_directives?.reward_after ?? 5;
      this.worksheetSubjectLabel = extraction.subject.trim() || "worksheet";
      this.worksheetMode = this.worksheetProblems.length > 0;
      this.worksheetInteractionMode = this.worksheetMode
        ? (extraction.session_directives?.interaction_mode ??
          detectWorksheetInteractionMode({
            rawContent: homeworkPayload.rawContent,
            extractionProblems: extraction.problems,
          }))
        : "answer_entry";
      if (this.worksheetMode) {
        this.worksheetInteractionMode = this.maybeRelaxMisdetectedReviewMode(
          extraction,
          this.worksheetInteractionMode,
        );
      }
      this.assignmentManifest = null;
      this.worksheetPlayerState = null;

      // ── PDF + vision loading ─────────────────────────────────────────────────
      // Always load the PDF and convert to PNG regardless of whether extraction
      // succeeded — the child should always be able to see their worksheet, and
      // the companion needs vision even in visual-only fallback mode.
      const pdfFilename = homeworkPayload.assetFilenames.find((name) =>
        name.toLowerCase().endsWith(".pdf"),
      );
      if (pdfFilename) {
        const pdfAssetUrl = `/api/homework/${homeworkPayload.childName}/${homeworkPayload.date}/${encodeURIComponent(pdfFilename)}`;
        const pdfPath = path.join(homeworkPayload.folderPath, pdfFilename);

        // Convert PDF → PNG for companion vision (always — not gated on worksheetMode)
        try {
          const tmpDir = os.tmpdir();
          const pdfBase = path.basename(pdfPath);
          execSync(`/usr/bin/qlmanage -t -s 2000 -o "${tmpDir}" "${pdfPath}"`, {
            stdio: "pipe",
          });
          const pngPath = path.join(tmpDir, `${pdfBase}.png`);
          this.worksheetPageFile = {
            data: fs.readFileSync(pngPath),
            mimeType: "image/png",
          };
          try {
            fs.unlinkSync(pngPath);
          } catch {
            /* cleanup best-effort */
          }
          console.log(
            `  👁️  [worksheet] converted PDF → PNG for companion vision (${(this.worksheetPageFile.data.length / 1024).toFixed(0)} KB)`,
          );
        } catch (e) {
          console.warn(
            "  ⚠️  Could not convert worksheet PDF for companion vision:",
            e instanceof Error ? e.message : String(e),
          );
        }

        if (this.worksheetMode) {
          try {
            this.assignmentManifest =
              buildAssignmentManifestFromWorksheetProblems({
                assignmentId: `${homeworkPayload.childName.toLowerCase()}-${homeworkPayload.date}`,
                childName: homeworkPayload.childName,
                title: `${this.companion.name} worksheet`,
                createdAt: new Date().toISOString(),
                pdfAssetUrl,
                problems: this.worksheetProblems,
              });
            this.worksheetPlayerState = buildWorksheetPlayerState(
              this.assignmentManifest,
              this.worksheetInteractionMode,
            );
            console.log(
              `  📄 [worksheet] worksheet_pdf enabled — using asset ${pdfAssetUrl} (${this.worksheetInteractionMode})`,
            );
          } catch (err) {
            console.warn(
              "  ⚠️  Worksheet player manifest build failed:",
              err instanceof Error ? err.message : String(err),
            );
          }
        } else {
          // Extraction failed or produced no usable problems — show the PDF on canvas
          // anyway so the child can see it and the companion can tutor from vision.
          this.currentCanvasState = {
            mode: "worksheet_pdf" as const,
            pdfAssetUrl,
            pdfPage: 1,
            overlayFields: [],
          };
          this.send("canvas_draw", this.currentCanvasState);
          console.log(
            `  📄 [worksheet] visual-only fallback — PDF visible, no structured problem queue`,
          );
        }
      } else {
        const imageFilename = homeworkPayload.assetFilenames.find((name) => {
          const lower = name.toLowerCase();
          return (
            lower.endsWith(".png") ||
            lower.endsWith(".jpg") ||
            lower.endsWith(".jpeg") ||
            lower.endsWith(".gif") ||
            lower.endsWith(".webp")
          );
        });

        if (imageFilename) {
          const imageAssetUrl = `/api/homework/${homeworkPayload.childName}/${homeworkPayload.date}/${encodeURIComponent(imageFilename)}`;
          console.log(`  📄 [worksheet] using image asset: ${imageAssetUrl}`);
          const imagePath = path.join(
            homeworkPayload.folderPath,
            imageFilename,
          );
          let rasterPageW = 800;
          let rasterPageH = 1000;
          const rasterDims = readRasterDimensionsFromFile(imagePath);
          if (rasterDims) {
            rasterPageW = rasterDims.width;
            rasterPageH = rasterDims.height;
            console.log(
              `  📐 [worksheet] raster page size ${rasterPageW}×${rasterPageH} (from file)`,
            );
          } else {
            console.log(
              `  📐 [worksheet] raster page size ${rasterPageW}×${rasterPageH} (default — could not read headers)`,
            );
          }

          if (this.worksheetMode) {
            try {
              this.assignmentManifest =
                buildAssignmentManifestFromWorksheetProblems({
                  assignmentId: `${homeworkPayload.childName.toLowerCase()}-${homeworkPayload.date}`,
                  childName: homeworkPayload.childName,
                  title: `${this.companion.name} worksheet`,
                  createdAt: new Date().toISOString(),
                  pdfAssetUrl: imageAssetUrl,
                  problems: this.worksheetProblems,
                  pageWidth: rasterPageW,
                  pageHeight: rasterPageH,
                });
              this.worksheetPlayerState = buildWorksheetPlayerState(
                this.assignmentManifest,
                this.worksheetInteractionMode,
              );
              console.log(
                `  📄 [worksheet] worksheet_pdf enabled via image — ${imageAssetUrl} (${this.worksheetInteractionMode})`,
              );
            } catch (err) {
              console.warn(
                "  ⚠️  Worksheet player manifest build failed:",
                err instanceof Error ? err.message : String(err),
              );
            }
          } else {
            this.currentCanvasState = {
              mode: "worksheet_pdf" as const,
              pdfAssetUrl: imageAssetUrl,
              pdfPage: 1,
              overlayFields: [],
            };
            this.send("canvas_draw", this.currentCanvasState);
            console.log(
              `  📄 [worksheet] visual-only fallback — image visible, no structured problem queue`,
            );
          }

          if (!this.worksheetPageFile) {
            if (fs.existsSync(imagePath)) {
              const lower = imageFilename.toLowerCase();
              const mimeType = lower.endsWith(".png")
                ? "image/png"
                : lower.endsWith(".webp")
                  ? "image/webp"
                  : lower.endsWith(".gif")
                    ? "image/gif"
                    : "image/jpeg";
              this.worksheetPageFile = {
                data: fs.readFileSync(imagePath),
                mimeType,
              };
              console.log(
                `  👁️  [worksheet] loaded image for companion vision (${(this.worksheetPageFile.data.length / 1024).toFixed(0)} KB)`,
              );
            }
          }
        } else {
          console.warn(
            `  ⚠️  [worksheet] no PDF or image found in homework/${homeworkPayload.childName.toLowerCase()}/${homeworkPayload.date}/`,
          );
        }
      }

      if (!this.worksheetPageFile && homeworkPayload.pageAssets.length > 0) {
        const asset = homeworkPayload.pageAssets[0];
        this.worksheetPageFile = {
          data: Buffer.from(asset.data, "base64"),
          mimeType: asset.mediaType,
        };
        console.log(
          `  👁️  [worksheet] loaded worksheet image for companion vision (${(this.worksheetPageFile.data.length / 1024).toFixed(0)} KB)`,
        );
      }
      // ────────────────────────────────────────────────────────────────────────

      console.log("  🧠 Psychologist building session prompt...");
      const extractSpellingWords =
        !this.worksheetMode &&
        (subject === "spelling" || subject === "homework");
      const wordList =
        this.worksheetMode || !extractSpellingWords
          ? []
          : extractWordsFromHomework(homeworkPayload.rawContent);
      if (!this.worksheetMode && extractSpellingWords && wordList.length > 0) {
        console.log(`  📋 Spelling words extracted: ${wordList.join(", ")}`);
        this.spellingHomeworkWordsByNorm = [
          ...new Set(
            wordList.map((w) => String(w).toLowerCase().trim()).filter(Boolean),
          ),
        ];
        this.refreshSpellingHomeworkGate();
      } else if (this.worksheetMode) {
        this.spellingHomeworkWordsByNorm = [];
        this.refreshSpellingHomeworkGate();
        console.log(
          `  🎮 [worksheet] ${this.worksheetProblems.length} problem(s) queued; ` +
            `reward_after=${this.worksheetRewardAfterN}`,
        );
      } else {
        this.spellingHomeworkWordsByNorm = [];
        this.refreshSpellingHomeworkGate();
      }

      const homeworkForPrompt =
        this.worksheetMode && this.worksheetProblems.length > 0
          ? `## Worksheet extraction (validated; server presents only canonical supported problems)\n${JSON.stringify(
              {
                subject: extraction.subject,
                problems: this.worksheetProblems.map((p) => ({
                  id: p.id,
                  question: p.question,
                  hint: p.hint,
                  page: p.page,
                })),
                session_directives: extraction.session_directives,
              },
              null,
              2,
            )}\n\n--- ORIGINAL HOMEWORK ---\n${homeworkPayload.rawContent}`
          : homeworkPayload.rawContent;

      let sessionPrompt: string;
      if (isDebugClaude()) {
        sessionPrompt = buildDebugPrompt(
          homeworkChild,
          this.companion.name,
          generateCanvasCapabilitiesManifest(),
          generateToolDocs(),
        );
      } else {
        sessionPrompt = await buildSessionPrompt(
          homeworkChild,
          this.companion.markdownPath,
          homeworkForPrompt,
          wordList,
          subject,
        );
      }
      // Option C worksheet session + tool instructions — same for debug and normal (debug only swaps base prompt above).
      if (this.worksheetMode && subject !== "diag") {
        if (this.worksheetProblems.length > 0) {
          this.worksheetSession = createWSSession({
            childName: homeworkChild,
            companionName: this.companion.name,
            problems: this.worksheetProblems.map((p) => ({
              id: String(p.id),
              question: p.question,
              hint: p.hint,
              page: p.page ?? 1,
              linkedGames: p.linkedGames ?? [],
            })),
            rewardThreshold: this.worksheetRewardAfterN,
            rewardGame: "space-invaders",
          });
          const wsStatus = this.worksheetSession.getSessionStatus();
          if (wsStatus.pendingRewardFromLastSession) {
            console.log(
              `  🎁 Pending reward from last session: ${wsStatus.pendingRewardFromLastSession}`,
            );
          }
          sessionPrompt +=
            "\n\n" +
            buildWorksheetToolPrompt({
              childName: homeworkChild,
              companionName: this.companion.name,
              subjectLabel: this.worksheetSubjectLabel,
              problemCount: this.worksheetProblems.length,
              rewardThreshold: this.worksheetRewardAfterN,
              rewardGame: "space-invaders",
              pendingRewardFromLastSession:
                wsStatus.pendingRewardFromLastSession,
              interactionMode: this.worksheetInteractionMode,
            });
          sessionPrompt +=
            "\n\n## Worksheet session (canvas)\n" +
            `Subject label (informational): ${this.worksheetSubjectLabel}.\n` +
            `Use **canvasShow** with type "worksheet" and the correct problemId to show each page. ` +
            `Use **sessionLog** to record graded answers (correct + what the child said). ` +
            `Use **canvasClear** when switching away from the worksheet. ` +
            `Use **sessionStatus** / **canvasStatus** when you need state.\n`;
          console.log(
            `  📋 Worksheet tool prompt appended (Option C — ${this.worksheetProblems.length} problems)`,
          );
        } else {
          sessionPrompt +=
            "\n\n## Worksheet session (visual-only)\n" +
            `The worksheet image is available for discussion. There is no structured problem queue this session. ` +
            `Help ${homeworkChild} using the image. Subject: ${this.worksheetSubjectLabel}.\n`;
        }
      }
      this.companion = {
        ...this.companion,
        systemPrompt: isDebugClaude()
          ? sessionPrompt
          : this.prependDebugClaudeToPrompt(sessionPrompt),
      };
      console.log(`  ✅ Session prompt ready (${sessionPrompt.length} chars)`);
      this.isSpellingSession =
        !this.worksheetMode &&
        (subject === "spelling" || subject === "homework");
      if (this.isSpellingSession) {
        console.log("  📝 Spelling session mode active");
      }
      console.log(`  📚 Subject mode: ${subject}`);
    } else {
      this.send("loading_status", { message: "Starting free session..." });
      console.log(`  📚 Subject mode: ${subject}`);
    }

    // ── Resolve session type and create canonical SessionContext ──
    const hasHomeworkManifest = this.worksheetMode;
    const hasSpellingWords = this.spellingHomeworkWordsByNorm.length > 0;
    const sessionType = resolveSessionType({
      childName: this.childName,
      hasHomeworkManifest,
      hasSpellingWords,
      explicitType: sessionTypeFromSubject(subject),
    });
    this.ctx = createSessionContext({
      childName: this.childName,
      sessionType,
      companionName: this.companion.name,
      assignment: this.assignmentManifest
        ? {
            childName: this.childName,
            title: this.assignmentManifest.title,
            source: this.assignmentManifest.source,
            createdAt: this.assignmentManifest.createdAt,
            questions: this.assignmentManifest.problems.map(
              (problem, index) => ({
                index,
                text: problem.prompt,
                answerType:
                  problem.gradingMode === "choice"
                    ? "multiple_choice"
                    : "numeric",
                correctAnswer: "",
                options:
                  problem.gradingMode === "choice"
                    ? problem.overlayFields[0]?.options
                    : undefined,
              }),
            ),
          }
        : undefined,
    });
    if (this.ctx && isDebugClaude() && sessionType === "worksheet") {
      this.ctx.canvas.owner = "claude" as CanvasOwner;
      this.ctx.canvas.locked = false;
    }
    if (this.worksheetSession && this.ctx) {
      this.ctx.availableToolNames = [...CANONICAL_AGENT_TOOL_KEYS];
    }
    console.log(
      `  📋 Session type: ${sessionType}, canvas owner: ${this.ctx.canvas.owner}`,
    );

    if (
      this.isSpellingSession &&
      subject === "spelling" &&
      !this.worksheetMode &&
      sessionType === "spelling"
    ) {
      const childId = this.childName.toLowerCase();
      let enginePlan = planSession(childId, "spelling");
      const selected =
        enginePlan.reviewWords.length + enginePlan.newWords.length;
      if (selected === 0 && this.spellingHomeworkWordsByNorm.length > 0) {
        enginePlan = planSession(childId, "spelling", {
          homeworkFallbackWords: this.spellingHomeworkWordsByNorm,
        });
      }
      this.ctx.enginePlan = enginePlan;
    }

    if (sessionType === "reading" && subject === "reading" && this.ctx) {
      const childId = this.childName.toLowerCase();
      const enginePlan = planSession(childId, "reading");
      this.ctx.enginePlan = enginePlan;
      console.log(
        `  🎮 [engine] reading session plan — focusWords: ${enginePlan.focusWords.length ? enginePlan.focusWords.join(", ") : "none"}`,
      );
    }

    if (subject === "diag") {
      const diagVoice = process.env.ELEVENLABS_VOICE_ID_DIAG?.trim();
      this.companion = {
        ...this.companion,
        voiceId:
          diagVoice ||
          CHARLOTTE_DIAG_DEFAULT_VOICE_ID ||
          this.companion.voiceId,
        openingLine: "",
      };
      console.log(
        "  🎮 [diag] voice: ELEVENLABS_VOICE_ID_DIAG → Charlotte premade (diag-only) → companion default",
      );
    }

    this.applyDebugClaudeOpeningLine();

    this.send("session_started", {
      child: this.childName,
      childName: this.childName,
      companion: this.companion.name,
      companionName: this.companion.name,
      emoji: this.companion.emoji,
      voiceId: this.companion.voiceId,
      openingLine: this.companion.openingLine,
      goodbye: this.companion.goodbye,
      debugBrowserTts: process.env.DEBUG_BROWSER_TTS === "true",
      debugMode: isDebugClaude(),
      diagKiosk: this.diagKioskFast,
    });
    try {
      const progression = computeProgression(childIdFromName(this.childName));
      this.send("progression", { ...progression } as Record<string, unknown>);
      console.log(
        `  🎮 [engine] progression: level ${progression.level}, ` +
          `${progression.totalXP} XP, ${progression.wordsMastered} words mastered`,
      );
    } catch (err) {
      console.error("[engine] progression failed:", err);
    }
    this.broadcastContext();

    // Explicit blank-canvas signal at session start — the server owns canvas
    // state, so we always declare the initial state rather than relying on
    // the frontend's initial value.
    this.currentCanvasState = null;
    this.clearActiveCanvasActivity();
    this.send("canvas_draw", { mode: "idle" });

    this.clearSessionTimer = startMaxDurationTimer(this.childName, () => {
      console.log(
        `  ⏰ Session timeout reached (${Math.round((Date.now() - this.sessionStartTime) / 60000)} min wall)`,
      );
      this.end();
    });

    resetMathProbeSession(this.childName);
    resetSessionStart();
    resetTransitionToWork();
    if (this.worksheetMode) {
      this.isSpellingSession = false;
    }
    this.sessionStartedToolCalled = false;
    this.transitionedToWork = false;

    if (!this.options?.silentTts && !this.options?.sttOnly) {
      this.ttsBridge = new WsTtsBridge(this.ws, this.companion.voiceId);
      await this.ttsBridge.prime();
    }

    await this.connectDeepgram();

    if (subject === "diag") {
      if (!this.options?.sttOnly) {
        const sessionTime = formatDateTimeEastern();
        await this.handleEndOfTurn(
          `[Session started at: ${sessionTime}]\n\n` +
            "[Session start — diagnostics] The current time is above. " +
            "dateTime has already been resolved for this session — do not call the dateTime tool unless Jamal explicitly asks for the time or date again.\n\n" +
            "At most two short sentences: (1) greet Jamal as your creator using the time of day naturally, (2) ask who is with him. " +
            "Stop — do not list capabilities or canvas modes unless he asks.",
          true,
        );
      }
    } else {
      await this.handleCompanionTurn(this.companion.openingLine);
    }

    if (this.diagKioskFast && this.childName === "creator") {
      creatorDiagSessionForReadingTest = this;
      console.log(
        "  📖 [diag] creator voice session registered for test-reading-mode",
      );
    }
  }

  /** Inject a transcript directly — used by test harness to bypass Deepgram */
  injectTranscript(text: string): void {
    this.handleEndOfTurn(text).catch(console.error);
  }

  private recordWorksheetAttempt(transcript: string, correct: boolean): void {
    if (!this.ctx?.assignment) return;
    this.ctx.assignment.attempts.push({
      questionIndex: this.worksheetProblemIndex,
      answer: transcript,
      correct,
      timestamp: new Date().toISOString(),
    });
  }

  private retireWorksheetSession(): void {
    this.worksheetMode = false;
    this.worksheetPlayerState = null;
    this.worksheetPageFile = null;
    this.currentCanvasState = null;
    this.clearActiveCanvasActivity();
    this.send("canvas_draw", { mode: "idle" });
    if (this.ctx) {
      const freeformConfig = getSessionTypeConfig("freeform");
      this.ctx.sessionType = "freeform";
      this.ctx.availableToolNames = Object.keys(freeformConfig.tools);
      this.ctx.canvas.owner = freeformConfig.canvasOwner;
      this.ctx.canvas.locked = false;
      if (this.ctx.assignment) {
        this.ctx.assignment.currentIndex = this.ctx.assignment.questions.length;
      }
      this.ctx.updateCanvas({
        mode: "idle",
        content: undefined,
        label: undefined,
        svg: undefined,
        sceneDescription: undefined,
        problemAnswer: undefined,
        problemHint: undefined,
        pdfAssetUrl: undefined,
        pdfPage: undefined,
        pdfPageWidth: undefined,
        pdfPageHeight: undefined,
        activeProblemId: undefined,
        activeFieldId: undefined,
        overlayFields: undefined,
        interactionMode: undefined,
      });
      this.broadcastContext();
    }
  }

  receiveWorksheetAnswer(payload: {
    problemId?: string;
    fieldId?: string;
    value?: string;
  }): void {
    const value = String(payload.value ?? "").trim();
    if (!value || !this.assignmentManifest || !this.worksheetPlayerState)
      return;
    if (
      payload.problemId &&
      String(payload.problemId) !== this.worksheetPlayerState.activeProblemId
    ) {
      console.warn(
        `  ⚠️  worksheet_answer ignored — stale problem ${String(payload.problemId)} vs ${this.worksheetPlayerState.activeProblemId}`,
      );
      return;
    }
    if (payload.fieldId) {
      this.worksheetPlayerState = {
        ...this.worksheetPlayerState,
        activeFieldId: String(payload.fieldId),
      };
    }
    this.send("echo_answer", { text: value });
    this.handleEndOfTurn(value).catch(console.error);
  }

  receiveAudio(pcm: Buffer): void {
    if (this.fluxHandle) {
      this.fluxHandle.sendAudio(pcm);
    }
  }

  bargeIn(): void {
    const ts = new Date().toISOString();
    console.log(`  🛑 [${ts}] Barge-in received`);

    this.pendingRoundComplete = null;
    this.abortGameTtsGate();
    this.deferredTtsFinish = false;

    const stateBefore = this.turnSM.getState();
    this.turnSM.onInterrupt();
    auditLog("turn", {
      action: "barge_in",
      stateBefore,
      turnState: this.turnSM.getState(),
      tts: ttsLogLabel(),
      childName: this.childName,
      round: this.roundNumber,
    });

    if (this.currentAbort) {
      this.currentAbort.abort();
      this.currentAbort = null;
    }

    if (this.ttsBridge) {
      this.ttsBridge.stop();
    }

    this.send("audio_done");
    // Ephemeral assistant canvas (teaching SVG, etc.) is stale after interrupt.
    // Worksheet PDF, iframe games, word-builder, spell-check stay visible.
    if (!canvasStatePersistsThroughBargeIn(this.currentCanvasState)) {
      this.send("canvas_draw", { mode: "idle" });
    } else {
      const m = (this.currentCanvasState as { mode?: string } | null)?.mode;
      console.log(`  🛑 Barge-in — preserving canvas (mode=${m ?? "?"})`);
    }
  }

  private clearWbActivityTimeout(): void {
    if (this.wbActivityTimeout) {
      clearTimeout(this.wbActivityTimeout);
      this.wbActivityTimeout = null;
    }
  }

  private armWbActivityTimeout(): void {
    this.clearWbActivityTimeout();
    this.wbActivityTimeout = setTimeout(() => {
      this.wbActivityTimeout = null;
      if (!this.wbActive) return;
      if (this.wbAwaitingSpell) {
        return;
      }
      console.warn(
        "  ⚠️  Word Builder timeout — no activity in 90s; returning to IDLE",
      );
      this.wbEndCleanup();
      this.turnSM.onWordBuilderEnd();
      this.send("canvas_draw", { mode: "idle" });
      this.send("game_message", { forward: { type: "clear" } });
    }, SessionManager.WB_ACTIVITY_MS);
  }

  private wbEndCleanup(): void {
    this.clearWbActivityTimeout();
    this.wbAwaitingSpell = false;
    this.wbToolExecuteClaimed = false;
    this.wbActive = false;
    this.wbRound = 0;
    this.wbWord = "";
    this.wbLastProcessedRound = 0;
    this.pendingRoundComplete = null;
    this.abortGameTtsGate();
    this.wordBuilderSessionActive = false;
    this.activeWordBuilderWord = "";
  }

  private clearGameTtsFallbackTimer(): void {
    if (this.gameTtsFallbackTimer) {
      clearTimeout(this.gameTtsFallbackTimer);
      this.gameTtsFallbackTimer = null;
    }
  }

  /** Drop iframe TTS gate without speaking (barge-in / cleanup). */
  private abortGameTtsGate(): void {
    this.gamePendingRevision = null;
    this.clearGameTtsFallbackTimer();
    this.turnSM.clearGameTtsHold();
  }

  private armGameTtsGate(revision: number): void {
    this.clearGameTtsFallbackTimer();
    this.gamePendingRevision = revision;
    this.turnSM.armGameTtsHold();
    this.gameTtsFallbackTimer = setTimeout(() => {
      this.gameTtsFallbackTimer = null;
      if (this.gamePendingRevision !== revision) return;
      console.warn("  ⏱️  game `ready` TTS gate timeout — releasing buffer");
      this.releaseGameTtsFlush();
    }, 5000);
  }

  private releaseGameTtsFlush(): void {
    if (this.gamePendingRevision === null) return;
    this.gamePendingRevision = null;
    this.clearGameTtsFallbackTimer();
    this.turnSM.releaseDeferredTts();
    void this.tryCompleteTtsTurnAsync();
  }

  /**
   * Close ElevenLabs for this turn only after pending canvas / iframe gates clear.
   * Prevents sendText from being dropped when finish() ran before canvas_done / game ready.
   */
  private async tryCompleteTtsTurnAsync(): Promise<void> {
    if (!this.deferredTtsFinish) return;
    if (this.turnSM.getState() === "CANVAS_PENDING") return;
    if (this.gamePendingRevision !== null) return;
    this.deferredTtsFinish = false;
    if (this.ttsBridge) {
      await this.ttsBridge.finish();
    }
    this.send("audio_done");
  }

  flushPendingRoundComplete(): void {
    const ev = this.pendingRoundComplete;
    if (!ev) return;
    this.pendingRoundComplete = null;
    this.handleGameEvent(ev, true);
  }

  private finalizeWordBuilderSessionFromIframe(completedWord: string): void {
    this.wbAwaitingSpell = true;
    this.clearWbActivityTimeout();
    this.turnSM.onWordBuilderEnd();
    this.clearActiveCanvasActivity();
    this.send("canvas_draw", { mode: "idle" });
    void this.runCompanionResponse(
      WORD_BUILDER_SESSION_COMPLETE(this.childName, completedWord),
    ).catch(console.error);
  }

  /** Server drives rounds 2-4 via next_round.
   *  Round 1 is started by the Canvas onLoad handler sending "start" directly. */
  private wbSendRound(): void {
    if (!this.wbActive || !this.wbWord || this.wbRound < 2) return;
    console.log(`  🎮 → round ${this.wbRound} sent (word: ${this.wbWord})`);
    this.send("game_message", {
      forward: {
        type: "next_round",
        round: this.wbRound,
        word: this.wbWord,
        playerName: this.childName,
      },
    });
    this.armWbActivityTimeout();
  }

  private wbAdvanceRound(): void {
    this.wbRound++;
    // Rounds 2–4 only: round 1 is iframe onLoad; server never mirrors round 1 via game_message.
    if (this.wbActive && this.wbRound >= 2 && this.wbRound <= 4) {
      this.wbSendRound();
    }
  }

  /** Iframe game events (word-builder fill-blanks) forwarded from the browser. */
  handleGameEvent(event: Record<string, unknown>, fromPendingFlush = false): void {
    const type = event.type as string;

    if (type === "clock_answer") {
      recordClockAttempt(
        childIdFromName(this.childName),
        event.correct === true,
        Number(event.hour),
        Number(event.minute),
      );
      return;
    }

    if (type === "ready") {
      if (this.pendingGameStart) {
        this.gameBridge.startGame(
          this.pendingGameStart.gameUrl,
          this.pendingGameStart.childName,
          this.pendingGameStart.config,
          this.pendingGameStart.companionName,
        );
        console.log(
          `  🎮 resend start after ready — ${this.ctx?.canvas.current.mode ?? "game"}`,
        );
        this.pendingGameStart = null;
      }
      if (this.ctx) {
        this.ctx.markCanvasRendered(this.currentCanvasRevision);
        this.ctx.markGameReady(this.currentCanvasRevision);
        console.log(
          `  🖼️  Browser confirmed game ready for revision ${this.currentCanvasRevision} (${this.ctx.canvas.current.mode})`,
        );
        this.broadcastContext();
        if (
          this.gamePendingRevision !== null &&
          this.currentCanvasRevision === this.gamePendingRevision
        ) {
          this.releaseGameTtsFlush();
        }
      }
      return;
    }

    if (type === "correct" && this.spellCheckSessionActive) {
      const word = String(event.word ?? this.activeSpellCheckWord);
      if (this.turnSM.getState() !== "IDLE") {
        this.spellCheckSessionActive = false;
        this.activeSpellCheckWord = "";
        this.clearActiveCanvasActivity();
        this.send("canvas_draw", { mode: "idle" });
        return;
      }
      void this.runCompanionResponse(SPELL_CHECK_CORRECT(this.childName, word));
      this.spellCheckSessionActive = false;
      this.activeSpellCheckWord = "";
      this.clearActiveCanvasActivity();
      this.send("canvas_draw", { mode: "idle" });
      return;
    }

    if (type === "round_complete") {
      if (!this.wbActive) return;
      this.armWbActivityTimeout();

      const state = this.turnSM.getState();
      if (!fromPendingFlush && (state === "SPEAKING" || state === "PROCESSING")) {
        console.log(`  🎮 round_complete deferred (state=${state})`);
        this.pendingRoundComplete = { ...event };
        return;
      }

      const er = Number(event.round);
      const completedRound = Number.isFinite(er) && er > 0 ? er : this.wbRound;

      if (completedRound <= this.wbLastProcessedRound) {
        return;
      }
      this.wbLastProcessedRound = completedRound;

      const attempts = Number(event.attempts) || 1;
      console.log(
        `  🎮 round_complete received — round ${completedRound} (wbRound ${this.wbRound})`,
      );

      if (completedRound === 4) {
        this.finalizeWordBuilderSessionFromIframe(this.wbWord);
        return;
      }
      if (completedRound === 3) {
        this.wbAdvanceRound();
        return;
      }
      if (completedRound === 1 || completedRound === 2) {
        void this.runCompanionResponse(
          WORD_BUILDER_ROUND_COMPLETE(completedRound, this.wbWord, attempts),
        )
          .then(() => this.wbAdvanceRound())
          .catch((err) => {
            console.error("  ❌ WB round response failed:", err);
            this.wbAdvanceRound();
          });
        return;
      }

      this.wbAdvanceRound();
      return;
    }

    if (type === "round_failed") {
      if (!this.wbActive) return;
      this.armWbActivityTimeout();

      const state = this.turnSM.getState();
      const word = this.wbWord;

      if (!fromPendingFlush && (state === "SPEAKING" || state === "PROCESSING")) {
        console.log(`  🎮 round_failed deferred (state=${state})`);
        this.pendingRoundComplete = { ...event };
        return;
      }

      console.log(`  🎮 round_failed — round ${this.wbRound}`);

      void this.runCompanionResponse(
        WORD_BUILDER_ROUND_FAILED(this.wbRound, word),
      )
        .then(() => this.wbAdvanceRound())
        .catch((err) => {
          console.error("  ❌ WB fail response failed:", err);
          this.wbAdvanceRound();
        });
      return;
    }

    if (type === "game_complete") {
      if (this.wbActive) {
        if (this.wbLastProcessedRound >= 4) {
          console.log(
            "  🎮 game_complete ignored (Word Builder already ended at round 4)",
          );
          return;
        }
        this.finalizeWordBuilderSessionFromIframe(this.wbWord);
        return;
      }
      if (this.activeCanvasActivity.snapshot?.worksheet) {
        const snapshot = this.activeCanvasActivity.snapshot;
        const ws = snapshot.worksheet;
        if (ws) {
          this.worksheetProblemIndex = ws.problemIndex;
          if (snapshot.canvasState) {
            this.currentCanvasState = { ...snapshot.canvasState };
          }
          if (this.ctx && snapshot.contextCanvas) {
            this.ctx.updateCanvas(snapshot.contextCanvas as any);
          }
          this.clearActiveCanvasActivity();
          this.setActiveCanvasActivity("worksheet");
          if (snapshot.canvasState) {
            this.send("canvas_draw", {
              args: snapshot.canvasState,
              result: snapshot.canvasState,
            });
          }
          this.broadcastContext();
        }
        return;
      }
      if (
        this.ctx &&
        String(this.ctx.canvas.current.mode) === "clock-game"
      ) {
        this.clearActiveCanvasActivity();
        this.send("canvas_draw", { mode: "idle" });
        if (this.ctx) {
          this.ctx.updateCanvas({ mode: "idle" });
          this.broadcastContext();
        }
        console.log(
          `  🎮 clock-game complete — correct=${String(event.correct)}`,
        );
        return;
      }
      if (this.spaceInvadersRewardActive) {
        this.spaceInvadersRewardActive = false;
        this.suppressTranscripts = false;
        console.log("  🎮 reward game ended — transcript capture normal");
        this.gameBridge.handleGameEvent(event);
      }
    }
  }

  canvasDone(payload?: Record<string, unknown>): void {
    const revision = Number(payload?.canvasRevision);
    const resolvedRevision =
      Number.isFinite(revision) && revision > 0
        ? revision
        : this.currentCanvasRevision;
    if (this.ctx && resolvedRevision > 0) {
      this.ctx.markCanvasRendered(resolvedRevision);
      console.log(
        `  🖼️  Browser confirmed canvas revision ${resolvedRevision} (${this.ctx.canvas.current.mode})`,
      );
      this.broadcastContext();
    }
    this.turnSM.onCanvasDone();
    void this.tryCompleteTtsTurnAsync();
  }

  playbackDone(): void {
    this.turnSM.onPlaybackComplete();
    this.flushPendingRoundComplete();
    const pending = this.turnSM.consumePendingTranscript();
    if (pending) {
      void this.handleEndOfTurn(pending, true);
    }
  }

  async end(): Promise<void> {
    if (this.isEnding) return;
    this.isEnding = true;
    this.isSpellingSession = false;

    if (creatorDiagSessionForReadingTest === this) {
      creatorDiagSessionForReadingTest = null;
    }

    const ts = new Date().toISOString();
    console.log(`  🏁 [${ts}] Ending session for ${this.childName}`);

    if (this.clearSessionTimer) {
      this.clearSessionTimer();
      this.clearSessionTimer = null;
    }

    this.wbEndCleanup();
    this.spaceInvadersRewardActive = false;
    this.spaceInvadersRewardLaunched = false;
    this.clearActiveCanvasActivity();

    if (this.fluxHandle) {
      this.fluxHandle.close();
      this.fluxHandle = null;
    }

    if (this.ttsBridge) {
      this.ttsBridge.close();
      this.ttsBridge = null;
    }

    this.spellCheckSessionActive = false;
    this.activeSpellCheckWord = "";
    this.activeWordContext = "";
    this.wordAttemptCounts.clear();
    try {
      finalizeClockSession(childIdFromName(this.childName));
    } catch (err) {
      console.error("  [engine] finalizeClockSession failed:", err);
    }
    this.wordScaffoldState.clear();
    this.currentCanvasState = null;
    this.pendingGameStart = null;

    this.turnSM.onInterrupt();

    try {
      if (!shouldPersistSessionData()) {
        console.log(
          "  🔇 Stateless run — skipping session recording and reward log.",
        );
      } else {
        const childId = childIdFromName(this.childName);
        try {
          const summary = finalizeSession(childId);
          console.log(
            `  🎮 [engine] session finalized: ${summary.totalAttempts} attempts, ` +
              `${Math.round(summary.accuracy * 100)}% accuracy`,
          );
        } catch (err) {
          console.error("  [engine] finalizeSession failed:", err);
        }
        try {
          const endProgression = computeProgression(childId);
          this.send("progression_end", {
            ...endProgression,
          } as Record<string, unknown>);
        } catch {
          // Silent
        }
        await recordSession(this.conversationHistory, this.childName);
        appendRewardLog(this.childName, this.rewardLog);
      }

      this.send("session_ended", {
        summary: `Session ended. ${this.conversationHistory.length} turns.`,
        duration_ms: Date.now() - this.sessionStartTime,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("  🔴 Post-session chain error:", message);
      this.send("error", { message: "Post-session processing failed" });
    }
  }

  private async connectDeepgram(): Promise<void> {
    this.fluxHandle = await connectFlux({
      onOpen: () => {
        console.log("  ✅ Deepgram Flux connected");
      },
      onStartOfTurn: () => {
        const MIN_SPEAK_MS = 1500;
        if (
          this.turnSM.getState() === "SPEAKING" &&
          this.speakingStartedAt > 0 &&
          Date.now() - this.speakingStartedAt >= MIN_SPEAK_MS
        ) {
          this.bargeIn();
        }
      },
      onEagerEndOfTurn: (transcript: string) => {
        this.handleFluxEndOfTurn(transcript, "eager");
      },
      onInterim: (text) => {
        this.send("interim", { text });
      },
      onEndOfTurn: (transcript) => {
        this.handleFluxEndOfTurn(transcript, "final");
      },
      onError: (err) => {
        console.error("  🔴 Deepgram error:", err.message);
      },
    });
  }

  private handleFluxEndOfTurn(
    transcript: string,
    source: "eager" | "final",
  ): void {
    const normalized = transcript.toLowerCase().trim();
    if (!normalized) return;

    if (source === "eager") {
      if (this.turnSM.getState() === "IDLE") {
        // Letter-by-letter spelling (spaces between single letters). Not the
        // naive /^([a-zA-Z]\s?)+$/ — that matches normal words like "I want".
        const isSpelling = /^([a-zA-Z]\s+)+[a-zA-Z]$/i.test(transcript.trim());
        if (isSpelling) {
          return;
        }
        // Only stamp the dedup token when we actually process the eager transcript.
        // If we stamp it without processing (e.g. during WORD_BUILDER), the
        // subsequent final transcript would be silently dropped.
        this.lastEagerTranscript = normalized;
        this.lastEagerTranscriptTime = Date.now();
        this.handleEndOfTurn(transcript).catch(console.error);
      }
      return;
    }

    if (
      normalized === this.lastEagerTranscript &&
      Date.now() - this.lastEagerTranscriptTime < 3000
    ) {
      return;
    }

    this.handleEndOfTurn(transcript).catch(console.error);
  }

  private shouldAcceptInterruptedTranscript(transcript: string): boolean {
    const trimmed = transcript.trim();

    // Only discard single non-alphabetic character (e.g. "?", ".", "-")
    if (trimmed.length === 1 && !/^[a-zA-Z]$/.test(trimmed)) {
      console.log(`  🗑️  Transcript fragment discarded: "${transcript}"`);
      return false;
    }

    // Only discard pure filler
    if (/^(um+|uh+|hmm+|uhm+)$/i.test(trimmed)) {
      console.log(`  🗑️  Transcript fragment discarded: "${transcript}"`);
      return false;
    }

    return true;
  }

  private async handleEndOfTurn(
    transcript: string,
    isReplay = false,
    opts?: { fromReadingComplete?: boolean },
  ): Promise<void> {
    const tts = ttsLogLabel();
    const auditRound = this.roundNumber;
    const auditChild = this.childName;

    if (isReplay) {
      auditLog("transcript", {
        action: "replay",
        turnState: this.turnSM.getState(),
        tts,
        childName: auditChild,
        round: auditRound,
      });
    }

    if (!isReplay) {
      const now = Date.now();
      const normalized = transcript.toLowerCase().trim();
      if (
        normalized === this.lastTranscript &&
        now - this.lastTranscriptTime < 3000
      ) {
        console.log(`  ⚠️  Duplicate transcript suppressed: "${transcript}"`);
        auditLog("transcript", {
          action: "duplicate_suppressed",
          turnState: this.turnSM.getState(),
          tts,
          childName: auditChild,
          round: auditRound,
        });
        return;
      }
      this.lastTranscript = normalized;
      this.lastTranscriptTime = now;
    }

    if (
      !opts?.fromReadingComplete &&
      this.turnSM.getState() === "IDLE" &&
      this.shouldSuppressTranscriptDuringKaraoke(transcript)
    ) {
      // Still forward to client for karaoke word-match; do not pass to LLM below.
      this.send("interim", { text: transcript });
      return;
    }

    const state = this.turnSM.getState();

    if (state === "PROCESSING") {
      if (!this.shouldAcceptInterruptedTranscript(transcript)) {
        auditLog("transcript", {
          action: "dropped",
          reason: "junk",
          turnState: state,
          tts,
          childName: auditChild,
          round: auditRound,
        });
        return;
      }
      this.turnSM.setPendingTranscript(transcript);
      console.log("  📬 Queued transcript for after turn");
      auditLog("transcript", {
        action: "queued",
        turnState: state,
        tts,
        childName: auditChild,
        round: auditRound,
      });
      return;
    }

    if (
      !opts?.fromReadingComplete &&
      (state === "CANVAS_PENDING" || state === "SPEAKING")
    ) {
      if (!this.shouldAcceptInterruptedTranscript(transcript)) {
        auditLog("transcript", {
          action: "dropped",
          reason: "junk",
          turnState: state,
          tts,
          childName: auditChild,
          round: auditRound,
        });
        return;
      }
      console.log(
        `  🗑️  Ignoring transcript while assistant owns turn (${state}): "${transcript}"`,
      );
      auditLog("transcript", {
        action: "dropped",
        reason: "assistant_owns_turn",
        turnState: state,
        tts,
        childName: auditChild,
        round: auditRound,
      });
      return;
    }

    auditLog("transcript", {
      action: "accepted",
      turnState: state,
      tts,
      childName: auditChild,
      round: auditRound,
    });

    // WORD_BUILDER: the child is filling in the game but can still speak.
    // Let the transcript fall through — runCompanionResponse uses onCompanionRunFromWordBuilder()
    // so the game stays visible while Elli responds verbally.

    this.turnSM.onEndOfTurn();

    // Pre-connect TTS while we wait for Claude — saves ~200-400ms
    if (this.ttsBridge) {
      this.ttsBridge.connect().catch(() => {});
    }

    const ts = new Date().toISOString();
    console.log(`  💬 [${ts}] ${this.childName}: "${transcript}"`);

    this.send("final", { text: transcript });
    this.send("echo_answer", { text: transcript });

    if (checkUserGoodbye(transcript)) {
      console.log(`  👋 [${ts}] Goodbye detected`);
      await this.end();
      return;
    }

    this.roundNumber++;

    if (this.activeCanvasActivity.pauseState === "paused_for_checkin") {
      if (this.isResumeActivityRequest(transcript)) {
        await this.resumeActiveCanvasActivity();
        return;
      }
      await this.runCompanionResponse(transcript);
      return;
    }

    if (
      this.isPauseForCheckInRequest(transcript) &&
      this.activeCanvasActivity.mode !== "none"
    ) {
      await this.pauseActiveCanvasForCheckIn("child_request");
      await this.runCompanionResponse(transcript);
      return;
    }

    let userMessage = transcript;

    if (
      this.isSpellingSession &&
      !this.worksheetMode &&
      this.activeWord &&
      isSpellingAttempt(transcript, this.activeWord)
    ) {
      const ev = this.evaluateSpelling(transcript, this.activeWord);
      console.log(
        `  🔤 Spelling eval: "${transcript}" vs "${this.activeWord}" → ` +
          `${ev.correct ? "✅" : "❌"} (${ev.note})`,
      );
      userMessage =
        `[Spelling verdict: Ila said "${transcript}" for "${this.activeWord}" — ` +
        `${ev.correct ? "this is CORRECT, celebrate and move on" : "this is INCORRECT, encourage and give a hint"}]\n\n` +
        transcript;
    }

    if (this.suppressTranscripts) {
      console.log("  🔇 Transcript suppressed — voice disabled");
      this.turnSM.onInterrupt();
      return;
    }

    await this.runCompanionResponse(userMessage);
  }

  private async runCompanionResponse(userMessage: string): Promise<void> {
    const st = this.turnSM.getState();
    if (st === "WORD_BUILDER") {
      this.turnSM.onCompanionRunFromWordBuilder();
    } else if (st === "IDLE") {
      this.turnSM.onStartCompanionFromIdle();
    }

    this.currentAbort = new AbortController();
    let fullResponse = "";
    this.toolCallsMadeThisTurn = 0;

    // TTS connect and Claude run in parallel — don't serialize the handshake.
    // Fire-and-forget the TTS connect; it'll be ready by the time the first
    // sentence flushes from PROCESSING.
    if (this.ttsBridge) {
      const previousText = this.conversationHistory
        .filter((m) => m.role === "assistant")
        .slice(-3)
        .map((m) => (typeof m.content === "string" ? m.content : ""))
        .filter(Boolean)
        .join(" ");
      this.ttsBridge.connect(previousText || undefined).catch(() => {});
    }

    const transitionToWorkPhase = shouldTriggerTransitionToWorkPhase(
      this.roundNumber,
      this.childName,
      this.transitionedToWork,
    );

    try {
      // Window the history to reduce Claude's input size and improve TTFT.
      // Keep the last 10 messages (5 turns) — wide enough to retain active-word
      // context across barge-ins while keeping latency acceptable.
      const recentHistory =
        this.conversationHistory.length > 10
          ? this.conversationHistory.slice(-10)
          : this.conversationHistory;

      // Pin context messages at the front so they survive history truncation.
      const pins: ModelMessage[] = [];
      if (this.worksheetPageFile && (this.worksheetMode || isHomeworkMode())) {
        const imageCaption =
          "This is the worksheet. Grade from what you see in this image.";
        pins.push({
          role: "user",
          content: [
            {
              type: "image" as const,
              image: this.worksheetPageFile.data,
            },
            {
              type: "text" as const,
              text: imageCaption,
            },
          ],
        } as ModelMessage);
      }
      if (this.activeWordContext && this.ctx?.sessionType !== "diag") {
        pins.push({ role: "user", content: this.activeWordContext });
      }
      const historyWithPin: typeof recentHistory =
        pins.length > 0 ? [...pins, ...recentHistory] : recentHistory;

      // Prepend canvas state context so the AI always knows what is currently
      // displayed — prevents duplicate showCanvas calls and enables intelligent
      // decisions about whether to update or hold the current display.
      const canvasCtx = this.ctx
        ? buildCanvasContextMessage(this.ctx, {
            turnState: this.turnSM.getState(),
            lastChildUtterance: this.lastTranscript || null,
            wordBuilderRound:
              this.wbActive && this.wbRound > 0 ? this.wbRound : null,
            activeWord: this.activeWord,
            wordScaffoldState: this.wordScaffoldState,
          })
        : this.currentCanvasState
          ? buildCanvasContext(this.currentCanvasState)
          : "";
      const messageWithContext = [userMessage, canvasCtx]
        .filter(Boolean)
        .join("\n\n");

      const finalTools = this.buildAgentToolkit();

      this.debugPrintClaudePreRun(userMessage);

      if (this.options?.sttOnly) {
        this.turnSM.onInterrupt();
        return;
      }

      await runAgent({
        history: historyWithPin,
        userMessage: messageWithContext,
        profile: this.companion,
        tools: finalTools,
        onToken: (chunk) => {
          fullResponse += chunk;
          this.send("response_text", { chunk });
          console.log(
            `  📝 token(${chunk.length}): "${chunk.slice(0, 30).replace(/\n/g, "↵")}"`,
          );
          this.turnSM.onToken(chunk);
        },
        signal: this.currentAbort?.signal,
        transitionToWorkPhase,
        allowTransitionToWork: !this.transitionedToWork,
        onStepFinish: (step) => {
          const toolCalls = (step.toolCalls ?? []) as Array<{
            toolName?: string;
            name?: string;
            args?: Record<string, unknown>;
            input?: Record<string, unknown>;
          }>;
          const toolResults = (step.toolResults ?? []) as unknown[];
          for (let i = 0; i < toolCalls.length; i++) {
            const tc = toolCalls[i];
            let toolName = tc.toolName ?? tc.name ?? "unknown";
            if (toolName === "show_canvas") toolName = "showCanvas";
            if (toolName === "end_session") toolName = "endSession";
            if (toolName === "launch_game") toolName = "launchGame";
            if (toolName === "get_session_status")
              toolName = "getSessionStatus";
            if (toolName === "get_next_problem") toolName = "getNextProblem";
            if (toolName === "submit_answer") toolName = "submitAnswer";
            if (toolName === "clear_canvas") toolName = "clearCanvas";
            if (toolName === "canvas_show") toolName = "canvasShow";
            if (toolName === "canvas_clear") toolName = "canvasClear";
            if (toolName === "canvas_status") toolName = "canvasStatus";
            if (toolName === "session_log") toolName = "sessionLog";
            if (toolName === "session_status") toolName = "sessionStatus";
            if (toolName === "session_end") toolName = "sessionEnd";
            if (toolName === "express_companion") toolName = "expressCompanion";
            if (toolName === "companion_act") toolName = "companionAct";
            let args = (tc.args ?? tc.input ?? {}) as Record<string, unknown>;
            const result = toolResults[i];

            if (toolName === "canvasShow") {
              args = this.normalizeCanvasShowArgs(args);
            }

            if (
              toolName === "canvasShow" &&
              this.turnSM.getState() === "WORD_BUILDER"
            ) {
              const c = String(args.content ?? "").trim();
              const isTeachingWord =
                args.type === "text" &&
                c.length > 0 &&
                !/\s/.test(c) &&
                /[a-z]/i.test(c) &&
                !this.isTeachingMathCanvas({
                  mode: "teaching",
                  content: c,
                });
              if (isTeachingWord) {
                console.warn(
                  "  ⚠️  canvasShow(text) blocked during Word Builder — use canvasShow(blackboard) or blackboard",
                );
                toolName = "blackboard";
                args = { gesture: "reveal", word: c };
              }
            }

            this.debugLogToolCall(toolName, args, result);

            this.handleToolCall(toolName, args, result);

            if (toolName === "canvasShow" && !this.storyImagePending) {
              const ct = String(args.type ?? "");
              if (ct === "text" || ct === "svg" || ct === "svg_raw") {
                const drawPayload =
                  ct === "text"
                    ? {
                        mode: "teaching",
                        content: args.content,
                        phonemeBoxes: args.phonemeBoxes,
                      }
                    : {
                        mode: "teaching",
                        svg: args.svg,
                        label: args.label,
                      };
                this.send(
                  "canvas_draw",
                  this.withCanvasRevision({
                    args: drawPayload as Record<string, unknown>,
                    result,
                  }),
                );
                const st = this.turnSM.getState();
                if (st === "PROCESSING") {
                  this.turnSM.onShowCanvas();
                }
              } else if (ct === "place_value") {
                const placeValueData: Record<string, unknown> = {
                  operandA: Number(args.operandA),
                  operandB: Number(args.operandB),
                  operation: args.operation,
                  layout: args.layout ?? "column",
                };
                if (args.activeColumn != null) {
                  placeValueData.activeColumn = args.activeColumn;
                }
                if (args.scaffoldLevel != null) {
                  placeValueData.scaffoldLevel = args.scaffoldLevel;
                }
                if (args.revealedColumns != null) {
                  placeValueData.revealedColumns = args.revealedColumns;
                }
                const drawPayload = {
                  mode: "place_value" as const,
                  placeValueData,
                };
                this.send(
                  "canvas_draw",
                  this.withCanvasRevision({
                    args: drawPayload as Record<string, unknown>,
                    result,
                  }),
                );
                const st = this.turnSM.getState();
                if (st === "PROCESSING") {
                  this.turnSM.onShowCanvas();
                }
              } else if (ct === "spelling") {
                const word = String(
                  args.spellingWord ?? args.word ?? "",
                ).trim();
                if (!this.spellingHomeworkGate.allows(word)) {
                  auditLog("canvas_show", {
                    action: "spelling_rejected",
                    word,
                    childName: this.childName,
                  });
                  console.warn(
                    `  ⚠️  canvasShow spelling skipped — not on homework list: "${word}"`,
                  );
                } else {
                  const drawPayload: Record<string, unknown> = {
                    mode: "spelling",
                    spellingWord: word,
                  };
                  if (args.spellingRevealed != null) {
                    drawPayload.spellingRevealed = Array.isArray(
                      args.spellingRevealed,
                    )
                      ? [...(args.spellingRevealed as string[])]
                      : args.spellingRevealed;
                  }
                  if (args.compoundBreak != null) {
                    drawPayload.compoundBreak = args.compoundBreak;
                  }
                  if (args.showWord != null) {
                    drawPayload.showWord = args.showWord;
                  }
                  if (args.streakCount != null) {
                    drawPayload.streakCount = args.streakCount;
                  }
                  if (args.personalBest != null) {
                    drawPayload.personalBest = args.personalBest;
                  }
                  this.send(
                    "canvas_draw",
                    this.withCanvasRevision({
                      args: drawPayload,
                      result,
                    }),
                  );
                  const st = this.turnSM.getState();
                  if (st === "PROCESSING" && word.length > 0) {
                    this.turnSM.onShowCanvas();
                  }
                }
              } else if (ct === "riddle") {
                const drawPayload = {
                  mode: "riddle" as const,
                  content: args.text,
                  label: args.label ?? "Riddle",
                };
                this.send(
                  "canvas_draw",
                  this.withCanvasRevision({
                    args: drawPayload as Record<string, unknown>,
                    result,
                  }),
                );
                const st = this.turnSM.getState();
                if (st === "PROCESSING") {
                  this.turnSM.onShowCanvas();
                }
              } else if (ct === "math_inline") {
                const drawPayload = {
                  mode: "teaching" as const,
                  content: args.expression,
                  label: args.label,
                };
                this.send(
                  "canvas_draw",
                  this.withCanvasRevision({
                    args: drawPayload as Record<string, unknown>,
                    result,
                  }),
                );
                const st = this.turnSM.getState();
                if (st === "PROCESSING") {
                  this.turnSM.onShowCanvas();
                }
              } else if (ct === "reward") {
                const drawPayload: Record<string, unknown> = {
                  mode: "reward",
                  content: "",
                  label: args.label,
                  svg: args.svg,
                };
                if (args.lottieData != null) {
                  drawPayload.lottieData = args.lottieData;
                }
                this.send(
                  "canvas_draw",
                  this.withCanvasRevision({ args: drawPayload, result }),
                );
                const st = this.turnSM.getState();
                if (st === "PROCESSING") {
                  this.turnSM.onShowCanvas();
                }
              } else if (ct === "championship") {
                const drawPayload: Record<string, unknown> = {
                  mode: "championship",
                  content: args.content ?? "",
                  label: args.label,
                  svg: args.svg,
                };
                this.send(
                  "canvas_draw",
                  this.withCanvasRevision({ args: drawPayload, result }),
                );
                const st = this.turnSM.getState();
                if (st === "PROCESSING") {
                  this.turnSM.onShowCanvas();
                }
              } else if (ct === "game") {
                const rawName = String(args.name ?? "").trim();
                const entry = getTool(rawName);
                if (entry) {
                  const drawPayload: Record<string, unknown> = {
                    mode: rawName,
                    gameUrl: entry.url,
                    gameWord: args.gameWord,
                    gamePlayerName: args.gamePlayerName,
                  };
                  this.send(
                    "canvas_draw",
                    this.withCanvasRevision({ args: drawPayload, result }),
                  );
                  const st = this.turnSM.getState();
                  if (st === "PROCESSING") {
                    this.turnSM.onShowCanvas();
                  }
                } else {
                  console.warn(
                    `  ⚠️  canvasShow game: unknown teaching tool "${rawName}"`,
                  );
                }
              } else if (ct === "blackboard") {
                // handleToolCall already sent `blackboard` — no canvas_draw
              } else if (ct === "karaoke") {
                const karaokeHost = unwrapToolResult(result) as
                  | { dispatched?: boolean }
                  | undefined;
                if (karaokeHost?.dispatched === false) {
                  console.log(
                    "  📖 [canvas] canvas_draw skipped — karaoke refresh blocked during reading",
                  );
                } else {
                  const words = (args.words as string[]) ?? [];
                  const storyRaw = args.storyText;
                  if (typeof storyRaw === "string" && storyRaw.trim()) {
                    const trimmed = storyRaw.trim();
                    if (trimmed !== this.lastKaraokeStoryText) {
                      this.storyImageGeneratedThisStory = false;
                    }
                    this.lastKaraokeStoryText = trimmed;
                  }
                  const drawPayload = {
                    mode: "karaoke" as const,
                    content: args.storyText,
                    label: words.join(" "),
                    karaokeWords: words,
                    storyTitle:
                      typeof args.storyTitle === "string"
                        ? args.storyTitle
                        : undefined,
                    backgroundImageUrl:
                      typeof args.backgroundImageUrl === "string"
                        ? args.backgroundImageUrl
                        : undefined,
                  };
                  this.send(
                    "canvas_draw",
                    this.withCanvasRevision({
                      args: drawPayload as Record<string, unknown>,
                      result,
                    }),
                  );
                  const st = this.turnSM.getState();
                  if (st === "PROCESSING") {
                    this.turnSM.onShowCanvas(6000);
                  }
                }
              } else if (ct === "sound_box") {
                const tw = String(args.targetWord ?? "");
                const drawPayload = {
                  mode: "sound_box" as const,
                  content: tw,
                  label: JSON.stringify(args.phonemes ?? []),
                };
                this.send(
                  "canvas_draw",
                  this.withCanvasRevision({
                    args: drawPayload as Record<string, unknown>,
                    result,
                  }),
                );
                const st = this.turnSM.getState();
                if (st === "PROCESSING") {
                  this.turnSM.onShowCanvas();
                }
              } else if (ct === "clock") {
                const m = Number(args.minute) || 0;
                const h = Number(args.hour) || 3;
                const disp = String(args.display ?? "analog");
                const label = `${h}:${String(m).padStart(2, "0")} (${disp})`;
                const drawPayload = {
                  mode: "clock" as const,
                  clockHour: h,
                  clockMinute: m,
                  clockDisplay: disp,
                  content: label,
                  label,
                };
                this.send(
                  "canvas_draw",
                  this.withCanvasRevision({
                    args: drawPayload as Record<string, unknown>,
                    result,
                  }),
                );
                const st = this.turnSM.getState();
                if (st === "PROCESSING") {
                  this.turnSM.onShowCanvas();
                }
              } else if (ct === "score_meter") {
                const drawPayload = {
                  mode: "score_meter" as const,
                  content: `${args.score}/${args.max}`,
                  label: args.label,
                };
                this.send(
                  "canvas_draw",
                  this.withCanvasRevision({
                    args: drawPayload as Record<string, unknown>,
                    result,
                  }),
                );
              }
            }

            if (toolName === "launchGame") {
              // Do not trigger CANVAS_PENDING — iframe games use game TTS gate, not canvas_done.
            }
          }
        },
      });

      this.turnSM.onAgentComplete();
      this.flushPendingRoundComplete();

      if (!fullResponse.trim()) {
        console.warn(
          "  ⚠️  runAgent completed with empty fullResponse — check onToken wiring",
        );
      }

      // In math mode every turn should log an answer — warn if tools were skipped entirely
      if (this.lastCanvasWasMath && this.toolCallsMadeThisTurn === 0) {
        console.warn(
          "  ⚠️  Math mode: agent completed with ZERO tool calls — canvas is out of sync",
        );
      }

      this.conversationHistory.push(
        { role: "user", content: userMessage },
        { role: "assistant", content: fullResponse },
      );

      if (checkAssistantGoodbye(fullResponse)) {
        console.log("  👋 Companion said goodbye");
        await this.end();
        return;
      }

      const pendingCanvas = this.turnSM.getState() === "CANVAS_PENDING";
      const pendingGame = this.gamePendingRevision !== null;
      if (pendingCanvas || pendingGame) {
        this.deferredTtsFinish = true;
      } else {
        if (this.ttsBridge) {
          await this.ttsBridge.finish();
        }
        this.send("audio_done");
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("  ⚡ Agent aborted (barge-in)");
        this.turnSM.onInterrupt();
        return;
      }

      // Detect Anthropic 529 "overloaded" error — speak a friendly retry message
      // instead of going silent. The AI SDK wraps this as AI_RetryError → AI_APICallError.
      const isOverloaded = (() => {
        const e = err as Record<string, unknown>;
        // Check the error itself or its lastError for a 529 status or overloaded body
        const check = (x: unknown): boolean => {
          if (!x || typeof x !== "object") return false;
          const obj = x as Record<string, unknown>;
          if (obj.statusCode === 529) return true;
          if (
            typeof obj.responseBody === "string" &&
            obj.responseBody.includes("overloaded_error")
          )
            return true;
          if (obj.lastError) return check(obj.lastError);
          return false;
        };
        return check(e);
      })();

      this.turnSM.onInterrupt();
      const message = err instanceof Error ? err.message : String(err);

      if (isOverloaded) {
        console.warn("  ⚠️  Anthropic overloaded (529) — speaking fallback");
        const fallback = `Hmm, my brain is a little busy right now — give me a second and say that again!`;
        this.send("response_text", { chunk: fallback });
        if (this.ttsBridge) {
          this.ttsBridge.sendText(fallback);
          await this.ttsBridge.finish().catch(() => {});
        }
        return;
      }

      console.error("  🔴 Agent error:", message);
      this.send("error", { message: "Companion response failed" });
    } finally {
      this.currentAbort = null;
    }
  }

  private debugSafeJson(value: unknown, maxLen = 4000): string {
    try {
      const s =
        typeof value === "string"
          ? JSON.stringify(value)
          : JSON.stringify(value, (_k, v) =>
              typeof v === "bigint" ? String(v) : v,
            );
      return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
    } catch {
      return JSON.stringify(String(value));
    }
  }

  /** When DEBUG_CLAUDE=true, log the turn input right before the model runs. */
  private debugPrintClaudePreRun(rawUserMessage: string): void {
    if (!isDebugClaude()) return;
    const c = this.ctx?.canvas.current;
    const modeStr = String(
      c?.mode ??
        (this.currentCanvasState as { mode?: string } | null)?.mode ??
        "idle",
    );
    let showing = "(idle)";
    if (modeStr === "worksheet_pdf" && c?.activeProblemId) {
      showing = `problem ${c.activeProblemId} image`;
    } else if (modeStr === "teaching" && c?.content) {
      const full = String(c.content);
      const t = full.replace(/\s+/g, " ").slice(0, 80);
      showing = t.length < full.length ? `${t}…` : t;
    } else if (modeStr !== "idle") {
      showing = modeStr;
    }

    const lines: string[] = [
      "═══════════════════════════════",
      "CLAUDE SEES THIS:",
      "───────────────────────────────",
      "[Canvas State]",
      `Mode: ${modeStr}`,
      `Showing: ${showing}`,
      `canvasShowing: ${modeStr}`,
      "",
      "[Session State]",
    ];

    if (this.worksheetSession) {
      const st = this.worksheetSession.getSessionStatus();
      lines.push(
        `Problems: ${st.problemsCompleted}/${st.problemsTotal} complete`,
      );
      lines.push(`Reward threshold: ${st.rewardThreshold}`);
    } else if (this.ctx?.assignment) {
      const a = this.ctx.assignment;
      const done = a.attempts.filter((x) => x.correct).length;
      lines.push(
        `Problems: ${done}/${a.questions.length} correct (q index ${a.currentIndex})`,
      );
      lines.push(`Reward threshold: —`);
    } else {
      lines.push("Problems: —");
      lines.push(
        `Reward threshold: ${this.worksheetMode ? String(this.worksheetRewardAfterN) : "—"}`,
      );
    }

    const elapsedMin =
      this.sessionStartTime > 0
        ? Math.max(0, Math.round((Date.now() - this.sessionStartTime) / 60000))
        : 0;
    lines.push(
      `Elapsed: ${this.sessionStartTime > 0 ? `${elapsedMin} min` : "—"}`,
    );
    lines.push("");
    lines.push("[User said]");
    lines.push(JSON.stringify(rawUserMessage));
    lines.push("═══════════════════════════════");
    console.log(lines.join("\n"));
  }

  private debugLogToolCall(
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
  ): void {
    if (!isDebugClaude()) return;
    const argStr = this.debugSafeJson(args, 3000);
    const resStr = this.debugSafeJson(
      result === undefined ? "(undefined)" : result,
      3000,
    );
    console.log(`→ TOOL: ${toolName}(${argStr})`);
    console.log(`← RESULT: ${resStr}`);
  }

  /** First spoken line when DEBUG_CLAUDE=true (scripted; not from Claude). */
  private debugCreatorOpeningLine(): string {
    const name = this.companion.name;
    const child = this.childName;
    const worksheetBit = this.worksheetMode
      ? " Worksheet is loaded — grade from the pinned image, and drive canvasShow, sessionLog, canvasClear, sessionStatus, and launchGame."
      : "";
    return (
      `Hi creator — ${name} here, DEBUG session.${worksheetBit} ` +
      `I'm not running a normal kid session with ${child}; you're stress-testing reasoning and tool use. ` +
      `Tell me what to verify first and I'll say what I'm doing and why.`
    );
  }

  /** Swap opening line for developer diagnostic runs only. */
  private applyDebugClaudeOpeningLine(): void {
    if (!isDebugClaude()) return;
    this.companion = {
      ...this.companion,
      openingLine: this.debugCreatorOpeningLine(),
    };
  }

  /** Prepends developer-testing instructions when DEBUG_CLAUDE=true. */
  private prependDebugClaudeToPrompt(prompt: string): string {
    if (!isDebugClaude()) return prompt;
    return (
      `⚠️  DEBUG MODE — DEVELOPER IS TESTING YOU\n\n` +
      `You are NOT tutoring a child. You are a test harness.\n` +
      `A developer is verifying your capabilities and reasoning.\n\n` +
      `YOUR ONLY JOB:\n` +
      `- Demonstrate capabilities when asked\n` +
      `- Show what you can and cannot do\n` +
      `- Be direct about what tools you have\n` +
      `- Execute requests immediately — no redirecting\n\n` +
      `RULES:\n` +
      `- If asked to show a riddle → show it using canvasShow with the best available type\n` +
      `- If asked to show math → show it\n` +
      `- If asked to clear → clear it\n` +
      `- Do NOT say 'but we should do the worksheet first'\n` +
      `- Do NOT redirect to homework unprompted\n` +
      `- Do NOT act like a tutor\n\n` +
      `CAPABILITY LOGIC:\n` +
      `When asked to display something:\n` +
      `  1. Check if a specific canvas type fits (riddle, place_value, spelling, etc.)\n` +
      `  2. If yes → use it\n` +
      `  3. If no dedicated type → use svg_raw or text\n` +
      `  4. Never say 'I can't' if text or svg can achieve it\n\n` +
      `The worksheet is present but irrelevant unless the developer specifically asks about it.\n` +
      `Confirm every tool call you make and why.\n\n` +
      prompt
    );
  }

  private buildAgentToolkit(): Record<string, unknown> {
    const six = createSixTools({
      canvasShow: (a) => this.hostCanvasShow(a),
      canvasClear: () => this.hostCanvasClear(),
      canvasStatus: () => this.hostCanvasStatus(),
      sessionLog: (a) => this.hostSessionLog(a),
      sessionStatus: () => this.hostSessionStatus(),
      sessionEnd: (a) => this.hostSessionEnd(a),
      expressCompanion: (a) => this.hostExpressCompanion(a),
    });
    const companionActTool = createCompanionActTool({
      companionAct: (a) => this.hostCompanionAct(a),
    });
    const baseTools = { ...six, companionAct: companionActTool };
    if (this.worksheetSession && this.worksheetMode) {
      return {
        ...baseTools,
        launchGame: createLaunchGameTool(this.worksheetSession),
        dateTime,
      };
    }
    const launchGameKaraokeGuard = {
      blockDuringKaraokeReading: () => this.karaokeReadingInProgress(),
    };
    if (this.ctx?.sessionType === "math") {
      return {
        ...baseTools,
        mathProblem,
        launchGame: buildLaunchGameTool(undefined, launchGameKaraokeGuard),
        dateTime,
      };
    }
    if (this.isSpellingSession) {
      return {
        ...baseTools,
        launchGame: buildLaunchGameTool(
          {
            isWordBuilderSessionActive: () => this.wordBuilderSessionActive,
            tryClaimWordBuilderToolSlot: () => {
              if (this.wbToolExecuteClaimed) return false;
              this.wbToolExecuteClaimed = true;
              return true;
            },
            isSpellCheckSessionActive: () => this.spellCheckSessionActive,
            tryClaimSpellCheckToolSlot: () => {
              if (this.spellCheckToolExecuteClaimed) return false;
              this.spellCheckToolExecuteClaimed = true;
              return true;
            },
            isHomeworkSpellingWordAllowed: (w) => this.spellingHomeworkGate.allows(w),
            getHomeworkSpellingRejectMessage: (w) =>
              this.spellingHomeworkGate.explainReject(w),
          },
          launchGameKaraokeGuard,
        ),
        dateTime,
      };
    }
    return {
      ...baseTools,
      launchGame: buildLaunchGameTool(undefined, launchGameKaraokeGuard),
      dateTime,
    };
  }

  private async hostCanvasShow(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (this.storyImagePending) {
      return {
        dispatched: false,
        canvasShowing: "idle",
        message:
          "Story image is rendering. Wait for the image to appear before calling canvasShow again.",
      };
    }
    const type = String(args.type ?? "");
    if (type === "karaoke" && this.shouldBlockKaraokeCanvasRefresh()) {
      return {
        ok: false,
        dispatched: false,
        canvasShowing: "karaoke",
        message:
          "Reading in progress. Do not call canvasShow during active reading. Wait for reading_progress event=complete.",
      };
    }
    if (type === "worksheet" && this.worksheetSession) {
      const pid = String(args.problemId ?? "");
      const res = this.worksheetSession.showProblemById(pid);
      return {
        dispatched: res.ok === true,
        canvasShowing: "worksheet",
        ...res,
      };
    }
    if (type === "text") {
      return { dispatched: true, canvasShowing: "text" };
    }
    if (type === "svg") {
      return { dispatched: true, canvasShowing: "svg" };
    }
    if (type === "game") {
      return { dispatched: true, canvasShowing: "game", name: args.name };
    }
    if (type === "place_value") {
      return { dispatched: true, canvasShowing: "place_value" };
    }
    if (type === "spelling") {
      const w = String(args.spellingWord ?? args.word ?? "").trim();
      if (!w) {
        return {
          dispatched: false,
          canvasShowing: "idle",
          reason: "empty_word",
        };
      }
      if (!this.spellingHomeworkGate.allows(w)) {
        return {
          dispatched: false,
          canvasShowing: "idle",
          reason: "not_on_homework_list",
          message: this.spellingHomeworkGate.explainReject(w),
        };
      }
      return { dispatched: true, canvasShowing: "spelling" };
    }
    if (type === "riddle") {
      return { dispatched: true, canvasShowing: "riddle" };
    }
    if (type === "math_inline") {
      return { dispatched: true, canvasShowing: "text" };
    }
    if (type === "svg_raw") {
      return { dispatched: true, canvasShowing: "svg" };
    }
    if (type === "reward") {
      return { dispatched: true, canvasShowing: "reward" };
    }
    if (type === "championship") {
      return { dispatched: true, canvasShowing: "championship" };
    }
    if (type === "blackboard") {
      return { dispatched: true, canvasShowing: "blackboard" };
    }
    if (type === "karaoke") {
      return { dispatched: true, canvasShowing: "karaoke" };
    }
    if (type === "sound_box") {
      return { dispatched: true, canvasShowing: "sound_box" };
    }
    if (type === "clock") {
      return { dispatched: true, canvasShowing: "clock" };
    }
    if (type === "score_meter") {
      return { dispatched: true, canvasShowing: "score_meter" };
    }
    return { dispatched: false, canvasShowing: "idle" };
  }

  private async hostCanvasClear(): Promise<{
    canvasShowing: "idle";
    ok?: boolean;
  }> {
    this.turnSM.clearPendingTranscript("canvasClear");
    if (this.worksheetSession) {
      return this.worksheetSession.clearCanvas();
    }
    return { canvasShowing: "idle", ok: true };
  }

  private async hostCanvasStatus(): Promise<Record<string, unknown>> {
    return {
      mode: this.ctx?.canvas.current.mode ?? "idle",
      revision: this.ctx?.canvas.revision ?? 0,
      browserVisible: this.ctx?.canvas.browserVisible ?? false,
    };
  }

  private async hostSessionLog(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const action = String(args.action ?? "").trim();
    if (action === "generate_image") {
      const scene = String(
        args.observation ?? args.scene ?? args.childSaid ?? "",
      ).trim();
      if (!scene) {
        return { logged: false, error: "generate_image_requires_observation" };
      }
      console.log(
        `  🎮 [story-image] explicit request via sessionLog scene="${scene.slice(0, 120)}${scene.length > 120 ? "…" : ""}"`,
      );
      this.storyImagePending = true;
      this.send("story_image_loading", {});
      void generateStoryImage(scene, { useDirectScene: true })
        .then((url) => {
          this.send("story_image", { url: url ?? null });
        })
        .catch(() => {
          this.send("story_image", { url: null });
        })
        .finally(() => {
          this.storyImagePending = false;
        });
      return { logged: true, imageGeneration: "queued" };
    }

    if (args.skipped === true) {
      const reason = String(args.reason ?? "").trim();
      if (!reason) {
        return { logged: false, error: "reason_required_when_skipped" };
      }
      const activityRaw =
        (args.activity as string | undefined)?.trim() ||
        (args.observation as string | undefined)?.trim() ||
        (args.word as string | undefined)?.trim() ||
        "";
      const activity = activityRaw || "Activity";
      await appendDeferredActivity(this.childName, activity, reason);
      return { logged: true, deferred: true };
    }

    if (this.worksheetSession) {
      const wp = this.worksheetProblems[this.worksheetProblemIndex];
      if (!wp) {
        auditLog("worksheet", {
          action: "sessionLog_reject",
          error: "no_active_problem",
          childName: this.childName,
          round: this.roundNumber,
        });
        return { logged: false, error: "no_active_problem" };
      }
      const res = this.worksheetSession.submitAnswer({
        problemId: String(wp.id),
        correct: args.correct === true,
        childSaid: String(args.childSaid ?? ""),
      });
      return { logged: res.ok === true, ...res };
    }
    this.processReward({ correct: args.correct === true });

    const loggedWordKey =
      (args.word as string | undefined)?.toLowerCase().trim() ?? "";
    if (loggedWordKey) {
      const domain =
        this.ctx?.sessionType === "reading" ? "reading" : "spelling";
      const scaffoldLevel = (
        typeof args.scaffoldLevel === "number" ? args.scaffoldLevel : 0
      ) as ScaffoldLevel;
      const attempt: AttemptInput = {
        word: loggedWordKey,
        domain,
        correct: args.correct === true,
        quality: computeQualityFromAttempt({
          word: loggedWordKey,
          domain,
          correct: args.correct === true,
          quality: 0,
          scaffoldLevel,
        }),
        scaffoldLevel,
      };
      try {
        recordAttempt(childIdFromName(this.childName), attempt);
        console.log(
          `  🎮 [engine] recordAttempt: "${loggedWordKey}" ${args.correct ? "correct" : "incorrect"} (${domain})`,
        );
      } catch (err) {
        console.error("  [engine] recordAttempt failed:", err);
      }
      appendAttemptLine(this.childName, {
        word: loggedWordKey,
        correct: args.correct === true,
      });

      const scaffoldState =
        this.wordScaffoldState.get(loggedWordKey) ?? {
          word: loggedWordKey,
          domain,
          lastCorrect: null,
          lastScaffoldLevel: 0 as ScaffoldLevel,
          attemptCount: 0,
        };
      scaffoldState.lastCorrect = args.correct === true;
      scaffoldState.lastScaffoldLevel = scaffoldLevel;
      scaffoldState.attemptCount++;
      this.wordScaffoldState.set(loggedWordKey, scaffoldState);

      const count = (this.wordAttemptCounts.get(loggedWordKey) ?? 0) + 1;
      this.wordAttemptCounts.set(loggedWordKey, count);
      const correct = args.correct === true;
      const lastAttempt =
        this.lastTranscript?.trim() ||
        String(args.childSaid ?? "").trim() ||
        "unknown";
      this.activeWordContext =
        `[Active word: "${loggedWordKey}". ` +
        `Attempts this word: ${count}. ` +
        `Last attempt: "${lastAttempt}" — ` +
        `${correct ? "correct" : "incorrect"}.]`;
      console.log(`  📌 activeWordContext: ${this.activeWordContext}`);

      if (this.companion.tracksActiveWord && this.activeWord) {
        const active = this.activeWord.toLowerCase().trim();
        if (loggedWordKey !== active) {
          console.warn(
            `  ⚠️  activeWord mismatch: canvas="${active}" sessionLog.word="${loggedWordKey}"`,
          );
        }
      }

      if (
        this.spellingHomeworkWordsByNorm.length > 0 &&
        !this.spaceInvadersRewardLaunched
      ) {
        if (this.spellingHomeworkWordsByNorm.includes(loggedWordKey)) {
          this.spellingWordsWithAttempt.add(loggedWordKey);
        }
        if (
          this.spellingWordsWithAttempt.size >=
          this.spellingHomeworkWordsByNorm.length
        ) {
          this.spaceInvadersRewardLaunched = true;
          this.spaceInvadersRewardActive = true;
          const inv = getReward("space-invaders");
          if (inv) {
            this.send("canvas_draw", {
              mode: "space-invaders",
              gameUrl: inv.url,
              gamePlayerName: this.childName,
              rewardGameConfig: { ...inv.defaultConfig },
            });
          }
          this.gameBridge.launchByName(
            "space-invaders",
            "reward",
            this.childName,
          );
          this.currentCanvasState = {
            mode: "space-invaders",
            gameUrl: inv?.url,
            gamePlayerName: this.childName,
          };
          this.setActiveCanvasActivity("reward-game");
          this.gameBridge.onComplete = () => {
            this.clearActiveCanvasActivity();
            this.send("canvas_draw", { mode: "idle" });
            this.send("session_ended", {
              summary: "Session complete.",
              duration_ms: Date.now() - this.sessionStartTime,
            });
          };
        }
      }

      const wbNorm = this.wbWord.toLowerCase().trim();
      if (this.wbAwaitingSpell && loggedWordKey === wbNorm) {
        this.wbAwaitingSpell = false;
        this.wbEndCleanup();
      }
    }

    return { logged: true };
  }

  private async hostSessionStatus(): Promise<Record<string, unknown>> {
    if (this.worksheetSession) {
      return {
        ...(this.worksheetSession.getSessionStatus() as object),
      } as Record<string, unknown>;
    }
    const base = { ...(this.ctx?.serialize() ?? { ok: true }) } as Record<
      string,
      unknown
    >;
    return {
      ...base,
      turnState: this.turnSM.getState(),
      activeWord: this.activeWord,
      wordBuilderRound: this.wbActive && this.wbRound > 0 ? this.wbRound : null,
      lastChildUtterance: this.lastTranscript || null,
    };
  }

  private async hostSessionEnd(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return { ended: true, childName: args.childName };
  }

  private async hostExpressCompanion(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const emoteRaw = args.emote;
    if (!isCompanionEmote(emoteRaw)) {
      return { ok: false, error: "invalid_emote" };
    }
    let intensity = 0.8;
    if (args.intensity != null) {
      const n = Number(args.intensity);
      if (Number.isFinite(n)) {
        intensity = Math.min(1, Math.max(0, n));
      }
    }
    const childId = childIdFromName(this.childName);
    const payload: CompanionEventPayload = {
      emote: emoteRaw,
      intensity,
      timestamp: Date.now(),
      childId,
    };
    this.send("companion_event", { payload });
    const envelope: { type: "companion_event"; payload: CompanionEventPayload } =
      { type: "companion_event", payload };
    broadcastCompanionEventToMapChild(childId, envelope);
    console.log(
      `  [companion] expressCompanion emote=${emoteRaw} intensity=${intensity} childId=${childId}`,
    );
    return { ok: true, emote: emoteRaw, intensity };
  }

  private async hostCompanionAct(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const childId = childIdFromName(this.childName);
    const cmd = validateCompanionCommand(args, COMPANION_CAPABILITIES, {
      childId,
      source: "claude",
    });
    if (!cmd) {
      return { ok: false, error: "invalid_or_unknown_companion_command" };
    }
    this.send("companion_command", { command: cmd });
    broadcastCompanionEventToMapChild(childId, {
      type: "companion_command",
      command: cmd,
    });
    console.log(
      `  [companion] companionAct type=${cmd.type} childId=${childId}`,
    );
    return { ok: true, type: cmd.type };
  }

  private normalizeToolName(tool: string): string {
    if (tool === "start_spell_check") return "startSpellCheck";
    if (tool === "launch_game") return "launchGame";
    if (tool === "get_session_status") return "getSessionStatus";
    if (tool === "get_next_problem") return "getNextProblem";
    if (tool === "submit_answer") return "submitAnswer";
    if (tool === "clear_canvas") return "clearCanvas";
    if (tool === "canvas_show") return "canvasShow";
    if (tool === "canvas_clear") return "canvasClear";
    if (tool === "canvas_status") return "canvasStatus";
    if (tool === "session_log") return "sessionLog";
    if (tool === "session_status") return "sessionStatus";
    if (tool === "session_end") return "sessionEnd";
    if (tool === "express_companion") return "expressCompanion";
    if (tool === "companion_act") return "companionAct";
    if (tool === "request_pause_for_check_in") return "requestPauseForCheckIn";
    if (tool === "request_resume_activity") return "requestResumeActivity";
    return tool;
  }

  private sendLaunchGameRegistryError(
    tool: string,
    args: Record<string, unknown>,
    gameName: string,
  ): void {
    this.toolCallsMadeThisTurn++;
    this.send("tool_call", {
      tool,
      args,
      result: {
        error: `Unknown game "${gameName}"`,
        available_tools: Object.keys(TEACHING_TOOLS),
        available_rewards: Object.keys(REWARD_GAMES),
      },
    });
  }

  /**
   * Extraction sometimes marks "review" when the sheet is actually blank.
   * If nothing in extraction hints at handwritten/filled answers, prefer answer_entry.
   */
  private maybeRelaxMisdetectedReviewMode(
    extraction: HomeworkExtractionResult,
    mode: WorksheetInteractionMode,
  ): WorksheetInteractionMode {
    if (mode !== "review") return mode;
    const problems = extraction.problems;
    if (problems.length === 0) return mode;

    const handwritingHint =
      /\b(handwrit|filled in|student wrote|their answer|answers in the box|already completed|wrote in|pencil)\b/i;
    const anyHandwritingEvidence = problems.some((p) =>
      (p.structured?.evidence ?? []).some((line) => handwritingHint.test(line)),
    );
    if (anyHandwritingEvidence) return mode;

    const anyOverlayFilled = problems.some((p) => {
      const targets = p.structured?.overlayTargets;
      if (!targets?.length) return false;
      return targets.some((t) => {
        const o = t as Record<string, unknown>;
        const v = o.value ?? o.filledValue ?? o.childAnswer ?? o.text;
        return v != null && String(v).trim() !== "";
      });
    });
    if (anyOverlayFilled) return mode;

    console.log(
      "  ℹ️  [worksheet] review → answer_entry (no handwriting / filled-overlay signals in extraction)",
    );
    return "answer_entry";
  }

  private selectWorksheetProblems(
    extraction: HomeworkExtractionResult,
  ): CanonicalWorksheetProblem[] {
    const byId = new Map<number, CanonicalWorksheetProblem>();
    for (const p of extraction.problems) {
      const validated = validateProblem(p);
      if (!validated.ok) {
        console.warn(
          `  ⚠️  [worksheet] skipping problem ${String((p as { id?: unknown }).id)}: ${validated.reason}`,
        );
        continue;
      }
      byId.set(validated.problem.id, validated.problem);
    }
    if (byId.size === 0) return [];

    const dir = extraction.session_directives;
    // teaching_order defines presentation sequence. problems_today defines which problems to include.
    // If both exist: filter teaching_order to only include IDs from problems_today.
    // If only problems_today: use that order.
    // If only teaching_order: use that order.
    const problemsToInclude = dir?.problems_today?.length
      ? new Set(dir.problems_today)
      : null;
    const preferredOrder =
      dir?.teaching_order != null && dir.teaching_order.length > 0
        ? problemsToInclude
          ? dir.teaching_order.filter((id) => problemsToInclude.has(id))
          : dir.teaching_order
        : (dir?.problems_today ?? null);

    let ordered: CanonicalWorksheetProblem[] = [];
    if (preferredOrder) {
      for (const id of preferredOrder) {
        const item = byId.get(id);
        if (item) ordered.push(item);
      }
    }
    if (ordered.length === 0) {
      ordered = Array.from(byId.values()).sort((a, b) => a.id - b.id);
    }

    return ordered.slice(0, 5);
  }

  private async handleCompanionTurn(text: string): Promise<void> {
    this.turnSM.onEndOfTurn();
    // onEndOfTurn uses setImmediate for LOADING → PROCESSING — wait for it
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.turnSM.onAgentComplete();
    this.send("response_text", { chunk: text });
    if (this.ttsBridge) {
      await this.ttsBridge.connect().catch(() => {});
      this.ttsBridge.sendText(text);
      await this.ttsBridge.finish();
    }
    this.send("audio_done");
    this.turnSM.onSpeakingDone();
  }

  private broadcastContext(): void {
    if (this.ctx) {
      const payload = {
        ...(this.ctx.serialize() as unknown as Record<string, unknown>),
      };
      payload.readingCanvas = getReadingCanvasPreferencesForChild(
        this.childName.toLowerCase(),
      );
      this.send("session_context", payload);
    }
  }

  private issueCanvasRevision(): number {
    this.currentCanvasRevision += 1;
    if (this.ctx) {
      this.ctx.markCanvasIssued(this.currentCanvasRevision);
    }
    return this.currentCanvasRevision;
  }

  private withCanvasRevision<T extends Record<string, unknown>>(
    payload: T,
  ): T & { canvasRevision: number } {
    return {
      ...payload,
      canvasRevision: this.issueCanvasRevision(),
    };
  }

  /** Aliases for canvasShow from registry (word/revealed, reward character → svg). */
  private normalizeCanvasShowArgs(
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    const a = { ...args };
    if (String(a.type) === "spelling") {
      if (a.spellingWord == null && a.word != null) {
        a.spellingWord = a.word;
      }
      if (a.spellingRevealed == null && a.revealed != null) {
        a.spellingRevealed = Array.isArray(a.revealed)
          ? [...(a.revealed as string[])]
          : a.revealed;
      } else if (Array.isArray(a.spellingRevealed)) {
        a.spellingRevealed = [...(a.spellingRevealed as string[])];
      }
    }
    if (String(a.type) === "reward") {
      const svgStr = typeof a.svg === "string" ? a.svg.trim() : "";
      const ch = typeof a.character === "string" ? a.character.trim() : "";
      if (!svgStr && ch && REWARD_CHARACTER_SVG[ch]) {
        a.svg = REWARD_CHARACTER_SVG[ch];
      }
    }
    return a;
  }

  /** Browser test overlay — run tool handler and push canvas_draw. */
  applyClientToolCall(tool: string, args: Record<string, unknown>): void {
    const t = this.normalizeToolName(tool);
    this.handleToolCall(t, args, {});
    if (t === "canvasShow" && this.currentCanvasState) {
      const payload = { ...this.currentCanvasState };
      this.send("canvas_draw", this.withCanvasRevision(payload));
    }
  }

  handleToolCall(
    tool: string,
    args: Record<string, unknown>,
    result: unknown,
  ): void {
    tool = this.normalizeToolName(tool);

    let launchGameResolvedEntry: GameDefinition | null = null;
    let launchGameCanonicalName: string | null = null;
    let canvasRevision: number | undefined;

    const bbGesture =
      tool === "blackboard"
        ? String(args.gesture ?? "")
        : tool === "canvasShow" && String(args.type) === "blackboard"
          ? String(args.gesture ?? "")
          : null;
    if (
      bbGesture &&
      this.turnSM.getState() === "WORD_BUILDER" &&
      bbGesture !== "clear" &&
      bbGesture !== "reveal"
    ) {
      console.warn(
        "  ⚠️  blackboard blocked during Word Builder — only clear and reveal allowed",
      );
      return;
    }

    if (tool === "launchGame") {
      const sessionLaunch = unwrapToolResult(result) as
        | { ok?: boolean; error?: string }
        | undefined;
      if (
        this.worksheetSession &&
        sessionLaunch &&
        sessionLaunch.ok === false
      ) {
        console.warn(
          `  ⚠️  launchGame: worksheet session rejected — ${sessionLaunch.error ?? "unknown"}`,
        );
        return;
      }
      const rawName = String(args.name ?? "").trim();
      const gt = args.type;
      if (gt !== "tool" && gt !== "reward") {
        console.warn('  ⚠️  launchGame: type must be "tool" or "reward"');
        return;
      }
      const resolved = resolveLaunchGameRequest({
        name: rawName,
        type: gt,
      });
      if (!resolved.ok || !resolved.canonicalName) {
        console.warn(`  ⚠️  launchGame: unknown ${gt} game "${rawName}"`);
        this.sendLaunchGameRegistryError(tool, args, rawName);
        return;
      }
      const entry =
        gt === "tool"
          ? getTool(resolved.canonicalName)
          : getReward(resolved.canonicalName);
      if (!entry) {
        console.warn(
          `  ⚠️  launchGame: missing live registry entry "${resolved.canonicalName}"`,
        );
        this.sendLaunchGameRegistryError(tool, args, rawName);
        return;
      }
      launchGameResolvedEntry = entry;
      launchGameCanonicalName = resolved.canonicalName;
    }

    let wireToolResult: unknown = result;
    if (tool === "launchGame" && launchGameCanonicalName === "word-builder") {
      const out = unwrapToolResult(wireToolResult) as { ok?: boolean } | undefined;
      if (this.wordBuilderSessionActive && out?.ok === true) {
        auditLog("word_builder", {
          action: "wire_corrected",
          reason: "session_already_active",
          childName: this.childName,
        });
        wireToolResult = {
          ok: false,
          error: WB_ALREADY_ACTIVE,
          launched: false,
        };
      }
    }
    if (tool === "launchGame" && launchGameCanonicalName === "spell-check") {
      const out = unwrapToolResult(wireToolResult) as { ok?: boolean } | undefined;
      if (this.spellCheckSessionActive && out?.ok === true) {
        auditLog("spell_check", {
          action: "wire_corrected",
          reason: "session_already_active",
          childName: this.childName,
        });
        wireToolResult = {
          ok: false,
          error: SC_ALREADY_ACTIVE,
          launched: false,
        };
      }
    }

    this.toolCallsMadeThisTurn++;
    this.send("tool_call", {
      tool,
      args,
      result: wireToolResult,
      ...(canvasRevision ? { canvasRevision } : {}),
    });

    if (tool === "endSession" || tool === "sessionEnd") {
      this.send("session_ended", {});
      setTimeout(() => process.exit(0), 500);
    }

    if (tool === "startSession") {
      if (this.sessionStartedToolCalled) {
        console.warn("  ⚠️  Duplicate startSession tool call ignored");
        return;
      }
      this.sessionStartedToolCalled = true;
    }

    if (tool === "transitionToWork") {
      if (this.transitionedToWork) {
        console.warn("  ⚠️  Duplicate transitionToWork tool call ignored");
        return;
      }
      this.transitionedToWork = true;
    }

    if (tool === "launchGame" && launchGameCanonicalName === "word-builder") {
      this.wbToolExecuteClaimed = false;
      const wbRes = unwrapToolResult(wireToolResult) as {
        ok?: boolean;
        error?: string;
        word?: string;
      } | null;
      if (wbRes?.ok !== true) {
        auditLog("word_builder", {
          action: "rejected",
          error: String(wbRes?.error ?? "not_launched"),
          childName: this.childName,
        });
        console.warn(
          `  ⚠️  launchGame(word-builder) rejected — ${String(wbRes?.error ?? "not_launched")}`,
        );
        return;
      }
      this.pendingGameStart = null;
      const word = String(wbRes.word ?? args.word ?? "")
        .toLowerCase()
        .trim();
      if (word.length < 3) {
        console.warn("  ⚠️  launchGame(word-builder): word must be at least 3 letters");
        return;
      }
      if (!this.spellingHomeworkGate.allows(word)) {
        auditLog("word_builder", {
          action: "rejected",
          error: "not_on_homework_list",
          childName: this.childName,
        });
        console.warn(
          `  ⚠️  launchGame(word-builder) blocked — not on homework list: "${word}"`,
        );
        return;
      }
      // Server owns all round state from here
      this.wbWord = word;
      this.wbRound = 1;
      this.wbActive = true;
      this.wbLastProcessedRound = 0;
      this.pendingRoundComplete = null;
      this.activeWordBuilderWord = word;
      this.wordBuilderSessionActive = true;
      this.turnSM.onWordBuilderStart();
      console.log(`  🎮 Word-builder started — word: ${word}`);
      // Canvas onLoad posts round 1 "start" to the iframe — do not wbSendRound here.
      const wordBuilderCanvas = {
        mode: "word-builder",
        gameUrl: "/games/wordd-builder.html",
        gameWord: word,
        gamePlayerName: this.childName,
        wordBuilderRound: 1,
        wordBuilderMode: "fill_blanks",
      };
      const wordBuilderDraw = this.withCanvasRevision(wordBuilderCanvas);
      this.currentCanvasState = { ...wordBuilderDraw };
      if (this.ctx) {
        this.ctx.updateCanvas({
          mode: "word-builder",
          gameUrl: wordBuilderCanvas.gameUrl,
          gameWord: wordBuilderCanvas.gameWord,
          gamePlayerName: wordBuilderCanvas.gamePlayerName,
          content: undefined,
          label: undefined,
          svg: undefined,
          sceneDescription: undefined,
          problemAnswer: undefined,
          problemHint: undefined,
        });
        this.broadcastContext();
      }
      this.setActiveCanvasActivity("word-builder");
      this.send("canvas_draw", wordBuilderDraw);
      this.armGameTtsGate(wordBuilderDraw.canvasRevision);
      return;
    }

    if (tool === "launchGame" && launchGameCanonicalName === "spell-check") {
      this.spellCheckToolExecuteClaimed = false;
      const scRes = unwrapToolResult(wireToolResult) as {
        ok?: boolean;
        error?: string;
        word?: string;
      } | null;
      if (scRes?.ok !== true) {
        auditLog("spell_check", {
          action: "rejected",
          error: String(scRes?.error ?? "not_launched"),
          childName: this.childName,
        });
        console.warn(
          `  ⚠️  launchGame(spell-check) rejected — ${String(scRes?.error ?? "not_launched")}`,
        );
        return;
      }
      this.pendingGameStart = null;
      const word = String(scRes.word ?? args.word ?? "")
        .toLowerCase()
        .trim();
      if (word.length < 2) {
        console.warn("  ⚠️  launchGame(spell-check): word must be at least 2 letters");
        return;
      }
      if (!this.spellingHomeworkGate.allows(word)) {
        auditLog("spell_check", {
          action: "rejected",
          error: "not_on_homework_list",
          childName: this.childName,
        });
        console.warn(
          `  ⚠️  launchGame(spell-check) blocked — not on homework list: "${word}"`,
        );
        return;
      }
      this.activeSpellCheckWord = word;
      this.spellCheckSessionActive = true;
      console.log(`  ⌨️  Spell-check typing game started — word: ${word}`);
      const spellCheckCanvas = {
        mode: "spell-check",
        gameUrl: "/games/spell-check.html",
        gameWord: word,
        gamePlayerName: this.childName,
      };
      const spellCheckDraw = this.withCanvasRevision(spellCheckCanvas);
      this.currentCanvasState = { ...spellCheckDraw };
      if (this.ctx) {
        this.ctx.updateCanvas({
          mode: "spell-check",
          gameUrl: spellCheckCanvas.gameUrl,
          gameWord: spellCheckCanvas.gameWord,
          gamePlayerName: spellCheckCanvas.gamePlayerName,
          content: undefined,
          label: undefined,
          svg: undefined,
          sceneDescription: undefined,
          problemAnswer: undefined,
          problemHint: undefined,
        });
        this.broadcastContext();
      }
      this.setActiveCanvasActivity("spell-check");
      this.send("canvas_draw", spellCheckDraw);
      this.armGameTtsGate(spellCheckDraw.canvasRevision);
      return;
    }

    if (tool === "launchGame") {
      const gameName =
        launchGameCanonicalName ??
        String(args.name ?? "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "-");
      const gt = args.type as "tool" | "reward";
      const worksheetResumeSnapshot =
        gt === "tool" && this.activeCanvasActivity.mode === "worksheet"
          ? this.captureActiveCanvasSnapshot()
          : null;

      if (this.turnSM.getState() === "WORD_BUILDER") {
        this.wbEndCleanup();
        this.turnSM.onWordBuilderEnd();
      }

      const gameEntry = launchGameResolvedEntry;
      if (!gameEntry) {
        console.error(
          "  ❌ launchGame: invariant — missing resolved entry after validate",
        );
        return;
      }

      const canvasDraw: Record<string, unknown> = {
        mode: gameName,
        gameUrl: gameEntry.url,
        gamePlayerName: this.childName,
        gameCompanionName: this.companion.name,
      };
      if (gt === "reward") {
        canvasDraw.rewardGameConfig = { ...gameEntry.defaultConfig };
        this.spaceInvadersRewardActive = true;
      }
      const revisedCanvasDraw = this.withCanvasRevision(canvasDraw);
      this.send("canvas_draw", revisedCanvasDraw);

      const launchConfig: Record<string, unknown> = {
        ...gameEntry.defaultConfig,
      };
      if (typeof args.hour === "number" && Number.isFinite(args.hour)) {
        launchConfig.hour = args.hour;
      }
      if (typeof args.minute === "number" && Number.isFinite(args.minute)) {
        launchConfig.minute = args.minute;
      }

      if (gameName === "store-game") {
        console.log(
          `  🎮 [store-game] using built-in item pool from game config (no worksheet-derived amounts)`,
        );
      }

      this.pendingGameStart = {
        gameUrl: gameEntry.url,
        childName: this.childName,
        companionName: this.companion.name,
        config: launchConfig,
      };
      this.gameBridge.launchByName(
        gameName,
        gt,
        this.childName,
        launchConfig,
        this.companion.name,
      );
      if (this.worksheetSession && gt === "reward") {
        clearEarnedReward(this.childName);
      }
      console.log(`  🎮 launchGame — ${gameName} (${gt})`);
      this.currentCanvasState = { ...revisedCanvasDraw };
      if (this.ctx) {
        this.ctx.updateCanvas({
          mode: gameName as any,
          gameUrl: gameEntry.url,
          gamePlayerName: this.childName,
          rewardGameConfig:
            gt === "reward" ? { ...gameEntry.defaultConfig } : undefined,
          content: undefined,
          label: undefined,
          svg: undefined,
          sceneDescription: undefined,
          problemAnswer: undefined,
          problemHint: undefined,
        });
        this.broadcastContext();
      }
      this.setActiveCanvasActivity("reward-game", {
        resumable: worksheetResumeSnapshot != null,
        reason:
          worksheetResumeSnapshot != null
            ? "worksheet_instructional_game"
            : undefined,
        snapshot: worksheetResumeSnapshot,
      });
      this.armGameTtsGate(revisedCanvasDraw.canvasRevision);
      return;
    }

    if (
      tool === "getNextProblem" ||
      (tool === "canvasShow" && String(args.type) === "worksheet")
    ) {
      const res = unwrapToolResult(result) as {
        ok?: boolean;
        canvasRendered?: boolean;
        problemId?: string;
      };
      if (
        res?.ok &&
        res?.canvasRendered &&
        res.problemId &&
        this.assignmentManifest &&
        this.worksheetPlayerState
      ) {
        const problemId = res.problemId;
        const problem = this.worksheetProblems.find(
          (p) => String(p.id) === problemId,
        );
        const idx = this.worksheetProblems.findIndex(
          (p) => String(p.id) === problemId,
        );
        if (idx >= 0) {
          this.worksheetProblemIndex = idx;
          if (this.ctx?.assignment) {
            this.ctx.assignment.currentIndex = idx;
          }
        }
        const assignmentProblem = this.assignmentManifest.problems.find(
          (entry) => entry.problemId === problemId,
        );
        if (problem && assignmentProblem) {
          this.turnSM.clearPendingTranscript("new worksheet problem");
          this.worksheetPlayerState = resumeAssignmentProblem(
            this.assignmentManifest,
            {
              activeProblemId: problemId,
              currentPage: this.worksheetPlayerState.currentPage ?? 1,
              activeFieldId: this.worksheetPlayerState.activeFieldId,
              interactionMode:
                this.worksheetPlayerState.interactionMode ??
                this.worksheetInteractionMode,
            },
          );
          const worksheetPdfDraw = this.withCanvasRevision({
            mode: "worksheet_pdf",
            content: problem.question,
            pdfAssetUrl: this.assignmentManifest.pdfAssetUrl,
            pdfPage: assignmentProblem.page,
            pdfPageWidth:
              this.assignmentManifest.pages.find(
                (pg) => pg.page === assignmentProblem.page,
              )?.width ?? 1000,
            pdfPageHeight:
              this.assignmentManifest.pages.find(
                (pg) => pg.page === assignmentProblem.page,
              )?.height ?? 1400,
            activeProblemId: this.worksheetPlayerState.activeProblemId,
            activeFieldId: this.worksheetPlayerState.activeFieldId,
            overlayFields: this.worksheetPlayerState.overlayFields,
            interactionMode: this.worksheetPlayerState.interactionMode,
            problemHint: problem.hint.trim() || undefined,
          });
          this.currentCanvasState = { ...worksheetPdfDraw };
          this.setActiveCanvasActivity("worksheet");
          if (this.ctx) {
            this.ctx.updateCanvas({
              mode: "worksheet_pdf",
              content: problem.question,
              pdfAssetUrl: this.assignmentManifest.pdfAssetUrl,
              pdfPage: assignmentProblem.page,
              pdfPageWidth:
                this.assignmentManifest.pages.find(
                  (page) => page.page === assignmentProblem.page,
                )?.width ?? 1000,
              pdfPageHeight:
                this.assignmentManifest.pages.find(
                  (page) => page.page === assignmentProblem.page,
                )?.height ?? 1400,
              activeProblemId: this.worksheetPlayerState.activeProblemId,
              activeFieldId: this.worksheetPlayerState.activeFieldId,
              overlayFields: this.worksheetPlayerState.overlayFields,
              interactionMode: this.worksheetPlayerState.interactionMode,
              problemHint: problem.hint.trim() || undefined,
              sceneDescription:
                "The child sees the exact worksheet page with a server-owned answer box overlay.",
            });
            this.broadcastContext();
          }
          this.send("canvas_draw", worksheetPdfDraw);
          console.log(
            `  🖼️  [worksheet] Canvas rendered for problem ${problemId} (Option C)`,
          );
        }
      }
      return;
    }

    if (
      tool === "submitAnswer" ||
      (tool === "sessionLog" && this.worksheetSession)
    ) {
      if (tool === "sessionLog" && this.worksheetSession) {
        const wp = this.worksheetProblems[this.worksheetProblemIndex];
        if (wp) {
          args = {
            ...args,
            problemId: String(wp.id),
            childSaid: String(args.childSaid ?? ""),
            correct: args.correct === true,
          };
        }
      }
      const res = unwrapToolResult(result) as {
        ok?: boolean;
        rewardEarned?: boolean;
        rewardGame?: string;
      };
      if (res?.ok) {
        const problemId = String(args.problemId ?? "");
        const idx = this.worksheetProblems.findIndex(
          (p) => String(p.id) === problemId,
        );
        const correct = args.correct === true;
        if (idx >= 0) {
          this.worksheetProblemIndex = idx;
          if (this.ctx?.assignment) {
            this.ctx.assignment.currentIndex = idx;
          }
          this.processReward({ correct });
          this.recordWorksheetAttempt(String(args.childSaid ?? ""), correct);
          if (shouldPersistSessionData()) {
            void appendWorksheetAttemptLine({
              childName: this.childName,
              problemId,
              correct,
            }).catch((e) =>
              console.warn(
                "  ⚠️  appendWorksheetAttemptLine failed:",
                e instanceof Error ? e.message : String(e),
              ),
            );
          }
          if (correct) {
            this.worksheetProblemIndex =
              idx + 1 < this.worksheetProblems.length ? idx + 1 : idx;
            if (this.ctx?.assignment) {
              this.ctx.assignment.currentIndex = this.worksheetProblemIndex;
            }
          }
        }
        if (res.rewardEarned && res.rewardGame) {
          saveEarnedReward(this.childName, res.rewardGame);
          console.log(`  🎁 Reward earned and saved: ${res.rewardGame}`);
        }
      }
      return;
    }

    if (tool === "clearCanvas" || tool === "canvasClear") {
      const res = unwrapToolResult(result) as { ok?: boolean };
      if (res && typeof res === "object" && res.ok === false) {
        return;
      }
      this.turnSM.clearPendingTranscript("canvas cleared");
      if (this.wbActive) {
        this.wbEndCleanup();
        this.turnSM.onWordBuilderEnd();
        console.log("  🎮 canvasClear ended active Word Builder session");
      }
      this.currentCanvasState = null;
      if (this.ctx) {
        this.ctx.updateCanvas({ mode: "idle" });
        this.broadcastContext();
      }
      this.send("canvas_draw", { mode: "idle" });
      this.clearActiveCanvasActivity();
      console.log(`  🖼️  [worksheet] Canvas cleared by companion (Option C)`);
      return;
    }

    if (tool === "requestPauseForCheckIn") {
      void this.pauseActiveCanvasForCheckIn(
        String(args.reason ?? "checkin_request"),
      ).catch(console.error);
      return;
    }

    if (tool === "requestResumeActivity") {
      if (args.childConfirmedReady === true) {
        void this.resumeActiveCanvasActivity(false).catch(console.error);
      }
      return;
    }

    if (tool === "mathProblem" && args.childAnswer != null) {
      try {
        const raw = unwrapToolResult(result) as
          | Record<string, unknown>
          | string
          | undefined;
        const output =
          typeof raw === "string"
            ? raw
            : ((raw?.output as string | undefined) ?? raw);
        const parsed = typeof output === "string" ? JSON.parse(output) : output;
        const correct = (parsed as Record<string, unknown>)?.correct === true;
        this.processReward({ correct });
      } catch {
        console.error("  ⚠️  Could not parse mathProblem result for reward");
      }
    }

    if (tool === "canvasShow") {
      if (this.storyImagePending) {
        console.log(
          "  🖼️  [canvas] canvasShow skipped in handleToolCall — story image pending",
        );
        return;
      }
      args = this.normalizeCanvasShowArgs(args);
      const ct = String(args.type ?? "");
      if (ct === "karaoke" && this.shouldBlockKaraokeCanvasRefresh()) {
        console.log(
          "  📖 [canvas] canvasShow karaoke skipped — reading in progress",
        );
        return;
      }
      const isWbGame =
        ct === "game" && String(args.name ?? "").trim() === "word-builder";
      if (!isWbGame && (this.wbActive || this.turnSM.getState() === "WORD_BUILDER")) {
        this.pendingGameStart = null;
        this.wbEndCleanup();
        if (this.turnSM.getState() === "WORD_BUILDER") {
          this.turnSM.onWordBuilderEnd();
        }
        console.log("  🎮 Word Builder cleared by canvasShow switch");
      }
      if (ct === "text" || ct === "svg" || ct === "svg_raw") {
        this.pendingGameStart = null;
        const phonemeBoxes = args.phonemeBoxes as
          | CanvasState["phonemeBoxes"]
          | undefined;
        this.currentCanvasState = {
          mode: "teaching",
          content: args.content as string | undefined,
          svg: args.svg as string | undefined,
          label: args.label as string | undefined,
          phonemeBoxes,
        };
        if (this.ctx) {
          this.ctx.updateCanvas({
            mode: "teaching",
            content: args.content as string | undefined,
            svg: args.svg as string | undefined,
            label: args.label as string | undefined,
            phonemeBoxes,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          this.broadcastContext();
        }
        this.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=${ct}`);
      } else if (ct === "place_value") {
        this.pendingGameStart = null;
        const placeValueData: Record<string, unknown> = {
          operandA: Number(args.operandA),
          operandB: Number(args.operandB),
          operation: args.operation,
          layout: args.layout ?? "column",
        };
        if (args.activeColumn != null) {
          placeValueData.activeColumn = args.activeColumn;
        }
        if (args.scaffoldLevel != null) {
          placeValueData.scaffoldLevel = args.scaffoldLevel;
        }
        if (args.revealedColumns != null) {
          placeValueData.revealedColumns = args.revealedColumns;
        }
        this.currentCanvasState = {
          mode: "place_value",
          placeValueData,
        };
        if (this.ctx) {
          this.ctx.updateCanvas({
            mode: "place_value" as CanvasState["mode"],
            content: undefined,
            svg: undefined,
            label: undefined,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          this.broadcastContext();
        }
        this.clearActiveCanvasActivity();
        console.log(
          `  🖼️  [canvas] canvasShow type=place_value a=${placeValueData.operandA} b=${placeValueData.operandB}`,
        );
      } else if (ct === "spelling") {
        this.pendingGameStart = null;
        const spellingWord = String(
          args.spellingWord ?? args.word ?? "",
        ).trim();
        if (!this.spellingHomeworkGate.allows(spellingWord)) {
          auditLog("canvas_show", {
            action: "spelling_rejected",
            word: spellingWord,
            childName: this.childName,
          });
          console.warn(
            `  🖼️  [canvas] canvasShow type=spelling rejected — not on list: ${spellingWord || "(empty)"}`,
          );
        } else {
        const nextState: Record<string, unknown> = {
          mode: "spelling",
          spellingWord,
        };
        if (args.spellingRevealed != null) {
          nextState.spellingRevealed = Array.isArray(args.spellingRevealed)
            ? [...(args.spellingRevealed as string[])]
            : args.spellingRevealed;
        }
        if (args.compoundBreak != null) {
          nextState.compoundBreak = args.compoundBreak;
        }
        if (args.showWord != null) {
          nextState.showWord = args.showWord;
        }
        if (args.streakCount != null) {
          nextState.streakCount = args.streakCount;
        }
        if (args.personalBest != null) {
          nextState.personalBest = args.personalBest;
        }
        this.currentCanvasState = nextState;
        if (this.ctx) {
          this.ctx.updateCanvas({
            mode: "spelling" as CanvasState["mode"],
            content: spellingWord || undefined,
            svg: undefined,
            label: undefined,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          this.broadcastContext();
        }
        this.clearActiveCanvasActivity();
        console.log(
          `  🖼️  [canvas] canvasShow type=spelling word=${spellingWord || "(empty)"}`,
        );
        }
      } else if (ct === "riddle") {
        this.pendingGameStart = null;
        this.currentCanvasState = {
          mode: "riddle",
          content: args.text as string | undefined,
          label: (args.label as string | undefined) ?? "Riddle",
        };
        if (this.ctx) {
          this.ctx.updateCanvas({
            mode: "riddle" as CanvasState["mode"],
            content: args.text as string | undefined,
            label: (args.label as string | undefined) ?? "Riddle",
            svg: undefined,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          this.broadcastContext();
        }
        this.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=riddle`);
      } else if (ct === "math_inline") {
        this.pendingGameStart = null;
        this.currentCanvasState = {
          mode: "teaching",
          content: args.expression as string | undefined,
          label: args.label as string | undefined,
        };
        if (this.ctx) {
          this.ctx.updateCanvas({
            mode: "teaching",
            content: args.expression as string | undefined,
            label: args.label as string | undefined,
            svg: undefined,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          this.broadcastContext();
        }
        this.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=math_inline`);
      } else if (ct === "reward") {
        this.pendingGameStart = null;
        this.currentCanvasState = {
          mode: "reward",
          content: "",
          label: args.label as string | undefined,
          svg: args.svg as string | undefined,
          lottieData: args.lottieData as Record<string, unknown> | undefined,
        };
        if (this.ctx) {
          this.ctx.updateCanvas({
            mode: "reward" as CanvasState["mode"],
            content: "",
            label: args.label as string | undefined,
            svg: args.svg as string | undefined,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          this.broadcastContext();
        }
        this.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=reward`);
      } else if (ct === "championship") {
        this.pendingGameStart = null;
        this.currentCanvasState = {
          mode: "championship",
          content: (args.content as string | undefined) ?? "",
          label: args.label as string | undefined,
          svg: args.svg as string | undefined,
        };
        if (this.ctx) {
          this.ctx.updateCanvas({
            mode: "championship" as CanvasState["mode"],
            content: (args.content as string | undefined) ?? "",
            label: args.label as string | undefined,
            svg: args.svg as string | undefined,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          this.broadcastContext();
        }
        this.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=championship`);
      } else if (ct === "game") {
        this.pendingGameStart = null;
        const rawName = String(args.name ?? "").trim();
        const entry = getTool(rawName);
        if (entry) {
          const gameCanvas = {
            mode: rawName,
            gameUrl: entry.url,
            gameWord: args.gameWord,
            gamePlayerName: args.gamePlayerName,
          };
          const draw = this.withCanvasRevision(
            gameCanvas as Record<string, unknown>,
          );
          this.currentCanvasState = { ...draw };
          if (this.ctx) {
            this.ctx.updateCanvas({
              mode: rawName as CanvasState["mode"],
              gameUrl: entry.url,
              gameWord: args.gameWord as string | undefined,
              gamePlayerName: args.gamePlayerName as string | undefined,
              content: undefined,
              svg: undefined,
              label: undefined,
              sceneDescription: undefined,
              problemAnswer: undefined,
              problemHint: undefined,
            });
            this.broadcastContext();
          }
          this.clearActiveCanvasActivity();
          this.send("canvas_draw", draw);
          this.armGameTtsGate(draw.canvasRevision);
          console.log(`  🖼️  [canvas] canvasShow type=game name=${rawName}`);
        } else {
          console.warn(
            `  ⚠️  canvasShow game: unknown teaching tool "${rawName}"`,
          );
        }
      } else if (ct === "blackboard") {
        this.send("blackboard", {
          gesture: String(args.gesture ?? "clear"),
          word: args.word as string | undefined,
          maskedWord: args.maskedWord as string | undefined,
          duration: args.duration as number | undefined,
        });
        console.log(`  🖼️  [canvas] canvasShow type=blackboard`);
      } else if (ct === "karaoke") {
        this.karaokeReadingComplete = false;
        this.readingProgressCompleteConsumed = false;
        this.pendingGameStart = null;
        const words = (args.words as string[]) ?? [];
        const st = args.storyText;
        if (typeof st === "string" && st.trim()) {
          const trimmed = st.trim();
          if (trimmed !== this.lastKaraokeStoryText) {
            this.storyImageGeneratedThisStory = false;
          }
          this.lastKaraokeStoryText = trimmed;
        }
        this.currentCanvasState = {
          mode: "karaoke",
          content: args.storyText as string,
          label: words.join(" "),
          karaokeWords: words,
          storyTitle:
            typeof args.storyTitle === "string" ? args.storyTitle : undefined,
          backgroundImageUrl:
            typeof args.backgroundImageUrl === "string"
              ? args.backgroundImageUrl
              : undefined,
        };
        if (this.ctx) {
          this.ctx.updateCanvas({
            mode: "karaoke",
            content: args.storyText as string,
            label: words.join(" "),
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          this.broadcastContext();
        }
        this.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=karaoke`);
      } else if (ct === "pronunciation") {
        this.karaokeReadingComplete = false;
        this.readingProgressCompleteConsumed = false;
        this.pendingGameStart = null;
        const wlist = Array.isArray(args.pronunciationWords)
          ? (args.pronunciationWords as string[])
          : [];
        this.currentCanvasState = {
          mode: "pronunciation",
          pronunciationWords: wlist,
          backgroundImageUrl:
            typeof args.backgroundImageUrl === "string"
              ? args.backgroundImageUrl
              : undefined,
        };
        if (this.ctx) {
          this.ctx.updateCanvas({
            mode: "pronunciation",
            content: wlist.join(" "),
            label: wlist.join(" "),
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          this.broadcastContext();
        }
        this.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=pronunciation`);
      } else if (ct === "sound_box") {
        this.pendingGameStart = null;
        const tw = String(args.targetWord ?? "");
        this.currentCanvasState = {
          mode: "sound_box",
          content: tw,
          label: JSON.stringify(args.phonemes ?? []),
        };
        if (this.ctx) {
          this.ctx.updateCanvas({
            mode: "sound_box",
            content: tw,
            label: JSON.stringify(args.phonemes ?? []),
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          this.broadcastContext();
        }
        this.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=sound_box`);
      } else if (ct === "clock") {
        this.pendingGameStart = null;
        const label = `${args.hour}:${String(args.minute).padStart(2, "0")} (${args.display})`;
        this.currentCanvasState = {
          mode: "clock",
          content: label,
          label,
        };
        if (this.ctx) {
          this.ctx.updateCanvas({
            mode: "clock",
            content: label,
            label,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          this.broadcastContext();
        }
        this.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=clock`);
      } else if (ct === "score_meter") {
        this.pendingGameStart = null;
        const label = String(args.label ?? "");
        const content = `${args.score}/${args.max}`;
        this.currentCanvasState = {
          mode: "score_meter",
          content,
          label,
        };
        if (this.ctx) {
          this.ctx.updateCanvas({
            mode: "score_meter",
            content,
            label,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          this.broadcastContext();
        }
        this.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=score_meter`);
      }

      const legacy = this.showCanvasShapeFromCanvasShowArgs(args);
      if (legacy) {
        this.applyCompanionCanvasSurfaceSync(legacy);
      }
    }
  }

  /** Browser karaoke / reading tracker — updates session context for the next turn. */
  receiveReadingProgress(payload: Record<string, unknown>): void {
    if (!this.ctx) return;
    const wordIndex = Number(payload.wordIndex);
    const totalWords = Number(payload.totalWords);
    const accuracy = Number(payload.accuracy);
    const hesitationsRaw = Number(payload.hesitations);
    const hesitations = Number.isFinite(hesitationsRaw) ? hesitationsRaw : 0;
    const flaggedWords = Array.isArray(payload.flaggedWords)
      ? (payload.flaggedWords as string[])
      : [];
    const spelledWords = Array.isArray(payload.spelledWords)
      ? (payload.spelledWords as string[])
      : [];
    const skippedWords = Array.isArray(payload.skippedWords)
      ? (payload.skippedWords as string[]).filter(
          (w): w is string => typeof w === "string",
        )
      : [];
    const event =
      typeof payload.event === "string" ? payload.event : undefined;
    if (!Number.isFinite(wordIndex) || !Number.isFinite(totalWords)) {
      console.warn("  ⚠️  reading_progress: invalid wordIndex/totalWords");
      return;
    }
    this.ctx.setReadingProgress({
      wordIndex,
      totalWords,
      accuracy: Number.isFinite(accuracy) ? accuracy : 0,
      hesitations,
      flaggedWords,
      skippedWords,
      spelledWords,
      event,
    });
    this.broadcastContext();
    const accPct =
      Number.isFinite(accuracy) && accuracy <= 1 && accuracy >= 0
        ? Math.round(accuracy * 100)
        : accuracy;
    console.log(
      `  📖 reading_progress: idx ${wordIndex}/${totalWords} acc=${accPct}% hesitations=${hesitations} event=${event ?? "—"}`,
    );

    if (event === "complete") {
      if (this.readingProgressCompleteConsumed) return;
      this.readingProgressCompleteConsumed = true;

      if (this.turnSM.getState() === "CANVAS_PENDING") {
        this.canvasDone({});
      }

      this.karaokeReadingComplete = true;
      console.log("  📖 [reading] suppression lifted — story complete");
      const childId = childIdFromName(this.childName);
      const flagged = this.ctx?.readingProgress?.flaggedWords ?? [];
      for (const word of flagged) {
        try {
          recordAttempt(childId, {
            word: word.toLowerCase().trim(),
            domain: "reading",
            correct: false,
            quality: 1,
            scaffoldLevel: 0,
          });
        } catch (err) {
          console.error(
            `  [engine] reading flaggedWord failed for "${word}":`,
            err,
          );
        }
      }
      for (const word of spelledWords) {
        const w = word.toLowerCase().trim();
        if (!w) continue;
        try {
          recordAttempt(childId, {
            word: w,
            domain: "reading",
            correct: true,
            quality: 5,
            scaffoldLevel: 0,
          });
        } catch (err) {
          console.error(
            `  [engine] reading spelledWord failed for "${word}":`,
            err,
          );
        }
      }
      console.log(
        `  🎮 [engine] reading complete: ${flagged.length} flagged → word bank, ${spelledWords.length} spelled → word bank (${childId})`,
      );

      void this.handleEndOfTurn(
        "[reading_progress] event=complete — the reader finished the karaoke story. Reply with exactly one short sentence acknowledging the reading. Do not call canvasShow or refresh karaoke unless the child or Jamal explicitly asks for something new.",
        true,
        { fromReadingComplete: true },
      ).catch((err) => console.error(err));

      const fromCanvas =
        this.currentCanvasState &&
        typeof (this.currentCanvasState as { content?: unknown }).content ===
          "string"
          ? String((this.currentCanvasState as { content: string }).content).trim()
          : "";
      const storyText =
        this.lastKaraokeStoryText.trim() || fromCanvas;
      if (storyText.length > 0) {
        if (this.storyImageGeneratedThisStory) {
          console.log(
            "  🖼️  [story-image] skip auto after reading complete — already generated for this story",
          );
        } else {
          this.storyImageGeneratedThisStory = true;
          this.storyImagePending = true;
          this.send("story_image_loading", {});
          void generateStoryImage(storyText)
            .then((url) => {
              this.send("story_image", { url: url ?? null });
            })
            .catch(() => {
              this.send("story_image", { url: null });
            })
            .finally(() => {
              this.storyImagePending = false;
            });
        }
      }
    }
  }

  private evaluateSpelling(
    transcript: string,
    targetWord: string,
  ): { correct: boolean; note: string } {
    const raw = transcript
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .trim();
    const target = targetWord.toLowerCase().trim();
    if (raw === target) return { correct: true, note: "exact match" };
    const dist = this.levenshtein(raw, target);
    if (dist <= 1) return { correct: true, note: `close match (dist=${dist})` };
    return { correct: false, note: `dist=${dist}` };
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  private processReward(attemptArgs: Record<string, unknown>): void {
    const correct = attemptArgs.correct === true;

    if (correct) {
      this.correctStreak++;

      const { flash_ms } = getRewardDurations(this.childName);
      this.send("reward", {
        rewardStyle: "flash",
        displayDuration_ms: flash_ms,
      });
      this.logRewardEvent("flash", flash_ms);

      if (this.correctStreak === 3) {
        this.send("phase", { phase: "riddle" });
      }

      if (this.correctStreak === 5) {
        this.send("phase", { phase: "championship" });
        this.correctStreak = 0;
      }
    } else {
      this.correctStreak = 0;
    }
  }

  private logRewardEvent(style: string, duration_ms: number): void {
    this.rewardLog.push({
      timestamp: new Date().toISOString(),
      rewardStyle: style as "flash" | "takeover" | "none",
      displayDuration_ms: duration_ms,
      timeToNextUtterance_ms: -1,
      nextAnswerCorrect: null,
      childVerbalReaction: null,
      sessionPhase: "learning",
      correctStreakAtTime: this.correctStreak,
    });
  }
}
