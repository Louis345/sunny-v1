import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { WebSocket } from "ws";
import {
  getCompanionConfig,
  type ChildName,
  type CompanionConfig,
} from "../companions/loader";
import {
  getTtsNameForSessionChild,
} from "../profiles/childrenConfig";
import { generateStoryImage } from "../utils/generateStoryImage";
import {
  TEST_MODE_PROMPT,
  normalizeSessionSubject,
} from "../agents/prompts";
import { getReadingCanvasPreferencesForChild } from "../utils/learningProfileIO";
import { recordSession } from "../agents/slp-recorder/recorder";
import { connectFlux, type FluxHandle } from "../deepgram-turn";
import {
  checkUserGoodbye,
  getRewardDurations,
} from "./session-triggers";
import { WsTtsBridge } from "./ws-tts-bridge";
import { appendRewardLog } from "../agents/elli/tools/logReward";
import { mathProblem } from "../agents/elli/tools/mathProblem";
import {
  recordAttempt,
  finalizeSession,
  childIdFromName,
} from "../engine/learningEngine";
import { computeProgression } from "../engine/progression";
import { finalizeClockSession } from "../engine/clockTracker";
import {
  applyWordRadarResultToWordBank,
  type WordRadarWireResultRow,
} from "../utils/wordRadarProfile";
import { recordWordRadarAttempts } from "./recordWordRadarAttempts";
import { recordLearningAttempt } from "./learningAttemptEvents";
import { type ModelMessage } from "ai";
import type { HomeworkExtractionResult } from "../agents/psychologist/psychologist";
import { GameBridge } from "./game-bridge";
import {
  REWARD_GAMES,
  TEACHING_TOOLS,
} from "./games/registry";
import { TurnStateMachine } from "./session-state";
import {
  type ActivityMode,
  type ActivityPauseState,
  type SessionContext,
  type WordScaffoldSessionState,
} from "./session-context";
import {
  type AssignmentManifest,
  type WorksheetInteractionMode,
  type WorksheetPlayerState,
} from "./assignment-player";
import {
  validateProblem,
  type CanonicalWorksheetProblem,
} from "./worksheet-problem";
import {
  type WorksheetSession,
} from "./worksheet-tools";
import { createLaunchGameTool } from "../agents/elli/tools/worksheetTools";
import { createCompanionActTool } from "../agents/tools/companionAct";
import { createSixTools } from "../agents/tools/six-tools";
import {
  buildLaunchGameTool,
} from "../agents/elli/tools/launchGame";
import { createTakeGameScreenshotTool } from "../agents/elli/tools/takeGameScreenshot";
import { dateTime } from "../agents/elli/tools/dateTime";
import {
  isDebugClaude,
  isSunnyTestMode,
  shouldPersistSessionData,
} from "../utils/runtimeMode";
import { shouldUseAdventureMapVoiceSlimToolkit } from "../utils/adventureMapAgentPolicy";
import {
  buildCurrentBoardSnapshot,
  buildCurrentBoardSnapshotContext,
  findCompanionTruthContradictions,
  type CurrentBoardSnapshot,
} from "./currentBoardSnapshot";
import { compressGameScreenshotBase64 } from "./compressGameScreenshot";
import { REWARD_CHARACTER_SVG } from "./canvas/registry";
import { canvasStatePersistsThroughBargeIn } from "../shared/canvasRenderability";
import { auditLog, ttsLogLabel } from "./audit-log";
import {
  createSpellingHomeworkGate,
  type SpellingHomeworkGate,
} from "./spelling-homework-gate";
import { sessionEventBus } from "./session-event-bus";
import {
  registerActiveVoiceSession,
  registerActiveVoiceSessionManager,
  unregisterActiveVoiceSessionIfCurrent,
  unregisterActiveVoiceSessionManager,
} from "./voice-session-registry";
import type { ExternalContextEvent } from "./companion-context/externalContextEvent";
import { RewardEngine } from "./reward-engine";
import { ServerCompanionBridge } from "./companion-bridge";
import * as gev from "./game-event-handler";
import { runHandleToolCall } from "./tool-call-router";
import { runSessionStart } from "./session-bootstrap";
import { runCompanionResponseForSession } from "./companion-response-runner";
import {
  hostCanvasClear,
  hostCanvasShow,
  hostCanvasStatus,
  hostRecordChildSignal,
  hostRecordProductIssue,
  hostSessionEnd,
  hostSessionLog,
  hostSessionStatus,
} from "./host-tool-handlers";
import {
  debugCreatorOpeningLineForSession,
  prependDebugClaudeDeveloperBlock,
} from "./debug-helpers";
import {
  buildSessionDebugFinalState,
  createProcessSessionDebugRecorder,
  finalizeSessionDebugPacket,
  type SessionDebugRecorder,
} from "./session-debug-recorder";
import { buildPronunciationCompleteFields, buildReadingProgressFields } from "./flow-game-debug";
import {
  clearCreatorDiagSessionForReadingTest,
  setCreatorDiagSessionForReadingTest,
} from "./creatorDiagControls";
import {
  detectUrgentLearningRoute,
  activeLearningSuppressionReason,
  recordUrgentLearningEvidenceForOrganicTurn,
  recordPronunciationReadingStruggleSignal,
  runSessionLearningSignalAudit,
  shouldSuppressTranscriptDuringActiveLearningGame,
} from "./urgentLearningRuntime";
import {
  isSpellingAttempt,
  rewriteChildNameForTts,
  stripSvgFences,
} from "./sessionTextHelpers";

export {
  tryPushCreatorDiagPronunciation,
  tryPushCreatorDiagReadingKaraoke,
} from "./creatorDiagControls";

function pronunciationCueFor(word: string | undefined): string | null {
  const clean = String(word ?? "").trim().toLowerCase();
  if (!clean) return null;
  if (clean === "able") return "a-ble";
  if (clean.length <= 3) return clean.split("").join("-");
  const midpoint = Math.max(1, Math.floor(clean.length / 2));
  return `${clean.slice(0, midpoint)}-${clean.slice(midpoint)}`;
}
export { isSpellingAttempt, stripSvgFences } from "./sessionTextHelpers";

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

/** Options passed from the client on `start_session` (see ws-handler). */
export type SessionManagerOptions = {
  silentTts?: boolean;
  /** No LLM / no server TTS — Deepgram STT only (e.g. diag reading kiosk). */
  sttOnly?: boolean;
  /** Chart/storage child id. Lets sandbox runs use a real companion voice without touching real charts. */
  chartChildId?: string;
};

function normalizeSessionChartChildId(
  childName: ChildName,
  chartChildId?: string,
): string {
  const normalized = chartChildId?.trim().toLowerCase();
  if (normalized && /^[a-z0-9_-]+$/.test(normalized)) return normalized;
  return childIdFromName(childName);
}

export class SessionManager {
  /** When true, child speech is not sent to the companion (silent reward games). */
  public suppressTranscripts: boolean = false;

  public readonly chartChildId: string;
  private currentActivityState: Record<string, unknown> | null = null;
  private currentBoardSnapshot: CurrentBoardSnapshot | null = null;
  private pronunciationStruggleSignals = new Set<string>();

  private ws: WebSocket;
  private childName: ChildName;
  /** Phonetic / friendly name for strings sent to TTS (from children.config.json). */
  private readonly sessionTtsLabel: string;
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

  private readonly sessionId = randomUUID();
  private readonly rewardEngine = new RewardEngine();
  private readonly companionBridge = new ServerCompanionBridge();
  private readonly debugRecorder: SessionDebugRecorder;
  public debugPacketFinalized = false;

  private lastTranscript = "";
  private lastTranscriptTime = 0;
  private lastEagerTranscript = "";
  private lastEagerTranscriptTime = 0;
  private speakingStartedAt = 0;
  private lastCanvasWasMath = false;
  /** Latest karaoke story body from canvasShow — used for optional story illustration after reading complete. */
  private lastKaraokeStoryText = "";
  /** While true, block canvasShow so the client can show the Grok illustration without karaoke redraw. */
  public storyImagePending = false;
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
  public shouldBlockKaraokeCanvasRefresh(): boolean {
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
    if (
      shouldSuppressTranscriptDuringActiveLearningGame({
        transcript,
        currentActivityState: this.currentActivityState,
        currentCanvasState: this.currentCanvasState,
      })
    ) return true;
    const mode = (this.currentCanvasState as { mode?: string } | null)?.mode;
    if (mode !== "karaoke" || this.karaokeReadingComplete) return false;
    if (this.karaokeReadingInProgress()) { console.log("  📖 [karaoke] transcript suppressed during active reading"); return true; }
    const st = this.ctx?.sessionType;
    if (st === "reading") { console.log("  📖 [reading] transcript suppressed during karaoke"); return true; }
    if (st === "diag") {
      const t = transcript.trim();
      const words = t.split(/\s+/).filter(Boolean);
      const looksLikeCommand =
        t.includes("?") ||
        /^(hey|charlotte|stop|clear)\b/i.test(t) ||
        words.length > 8;
      if (!looksLikeCommand) { console.log("  📖 [diag-reading] transcript suppressed"); return true; }
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
  public sessionStartedToolCalled = false;
  public transitionedToWork = false;

  // ── Word Builder — server owns all round state ──────────────────────────
  private wbWord: string = "";
  private wbRound: number = 0;
  public wbActive: boolean = false;
  /** round_* iframe events while SPEAKING or PROCESSING — flushed after playback or agent step */
  public pendingRoundComplete: Record<string, unknown> | null = null;
  /** Hold agent TTS until browser posts `ready` for this canvas revision */
  public gamePendingRevision: number | null = null;
  /** When true, defer ttsBridge.finish + audio_done until canvas_done or game ready */
  public deferredTtsFinish = false;
  public gameTtsFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  /** Safety: exit Word Builder if no round activity for this long */
  public wbActivityTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Dedup duplicate iframe round_complete for the same round number */
  public wbLastProcessedRound = 0;
  /** After game_complete: block startWordBuilder until child spells wbWord (sessionLog). */
  public wbAwaitingSpell = false;
  /** Prevents two ok:true startWordBuilder executes in one agent step before handleToolCall runs. */
  private wbToolExecuteClaimed = false;
  /** Same for startSpellCheck / one step. */
  private spellCheckToolExecuteClaimed = false;
  // ────────────────────────────────────────────────────────────────────────

  // Legacy aliases kept for spell-check (different flow)
  public activeWordBuilderWord = "";
  private wordBuilderSessionActive = false;
  private activeSpellCheckWord = "";
  private spellCheckSessionActive = false;
  public activeWordContext: string = "";
  private wordAttemptCounts: Map<string, number> = new Map();
  private wordScaffoldState = new Map<string, WordScaffoldSessionState>();
  public pendingGameStart: PendingGameStart | null = null;

  private turnSM: TurnStateMachine;

  public readonly gameBridge = new GameBridge(
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
  public spellingWordsWithAttempt = new Set<string>();
  public spaceInvadersRewardActive = false;
  public spaceInvadersRewardLaunched = false;

  /** Option C worksheet session — pure state, Claude calls tools */
  private worksheetSession: WorksheetSession | null = null;

  /** Worksheet mode — companion prompt + canvas context for assignment flow */
  private worksheetMode = false;
  private worksheetProblems: CanonicalWorksheetProblem[] = [];
  private assignmentManifest: AssignmentManifest | null = null;
  private worksheetPlayerState: WorksheetPlayerState | null = null;
  public worksheetInteractionMode: WorksheetInteractionMode = "answer_entry";
  private worksheetProblemIndex = 0;
  public worksheetRewardAfterN = 5;
  public worksheetSubjectLabel = "";
  /** Per-problem trusted/suspect cents and reveal eligibility — single source for pool + reveals. */
  /** Actual worksheet PDF/image bytes — pinned into conversation so the model sees the real worksheet */
  public worksheetPageFile: { data: Buffer; mimeType: string } | null = null;
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
  public bustPromptCache(): void {
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
  public showCanvasShapeFromCanvasShowArgs(
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
  public applyCompanionCanvasSurfaceSync(legacyArgs: Record<string, unknown>): void {
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
      this.rewardEngine.logRewardEvent("takeover", takeover_ms);
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

  public setActiveCanvasActivity(
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
    this.sessionTtsLabel = getTtsNameForSessionChild(childName);
    this.options = options;
    this.chartChildId = normalizeSessionChartChildId(childName, options?.chartChildId);
    this.companion = getCompanionConfig(childName);
    this.debugRecorder = createProcessSessionDebugRecorder({
      sessionId: this.sessionId,
      childName,
      subject: diagKioskFast
        ? "diag"
        : normalizeSessionSubject(process.env.SUNNY_SUBJECT),
      mode: process.env.SUNNY_MODE || (isSunnyTestMode() ? "test" : "default"),
    });
    this.debugRecorder.recordEvent("session", "constructed", {
      diagKiosk: diagKioskFast,
      silentTts: options?.silentTts === true,
      sttOnly: options?.sttOnly === true,
      chartChildId: this.chartChildId,
    });

    if (isSunnyTestMode()) {
      this.companion = {
        ...this.companion,
        systemPrompt: prependDebugClaudeDeveloperBlock(
          TEST_MODE_PROMPT(childName),
        ),
        openingLine: `[TEST MODE] Diagnostic session for ${this.sessionTtsLabel}. Ready. Give me a tool call to verify.`,
      };
      if (isDebugClaude()) {
        this.companion = {
          ...this.companion,
          openingLine: debugCreatorOpeningLineForSession(this),
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
        this.debugRecorder.recordEvent("turn", "state_changed", { state });
        if (state === "SPEAKING") {
          this.speakingStartedAt = Date.now();
        } else if (state === "IDLE") {
          this.speakingStartedAt = 0;
        }
      },
    );

    const cid = this.chartChildId;
    this.rewardEngine.attach(
      (type, data) => this.send(type, data),
      this.childName,
      cid,
      this.sessionId,
    );
    this.companionBridge.attach(
      cid,
      (type, data) => this.send(type, data),
      this.diagKioskFast,
    );
    registerActiveVoiceSession(cid, this.sessionId);
    registerActiveVoiceSessionManager(cid, this);
  }

  public refreshSpellingHomeworkGate(): void {
    this.spellingHomeworkGate = createSpellingHomeworkGate(
      this.spellingHomeworkWordsByNorm,
    );
  }

  private screenshotPending: {
    resolve: (v: string | null) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  requestGameScreenshot(
    callback: (base64: string | null) => void,
  ): void {
    if (this.screenshotPending) {
      clearTimeout(this.screenshotPending.timer);
      this.screenshotPending.resolve(null);
    }
    const timer = setTimeout(() => {
      if (this.screenshotPending) {
        this.screenshotPending = null;
        callback(null);
      }
    }, 5000);
    this.screenshotPending = {
      resolve: (data) => {
        clearTimeout(timer);
        this.screenshotPending = null;
        callback(data);
      },
      timer,
    };
    this.send("screenshot_request", {});
  }

  /** Voice client posts base64 after `screenshot_request` (PNG base64 without data URL prefix). */
  receiveScreenshot(data: string | null): void {
    const p = this.screenshotPending;
    if (!p) return;
    clearTimeout(p.timer);
    this.screenshotPending = null;
    if (!data) {
      p.resolve(null);
      return;
    }
    void compressGameScreenshotBase64(data)
      .then((compressed) => {
        p.resolve(compressed);
      })
      .catch((err: unknown) => {
        console.warn(
          "  ⚠️  screenshot compress failed — forwarding original:",
          err,
        );
        p.resolve(data);
      });
  }

  injectGameContext(state: Record<string, unknown>): void {
    this.updateCurrentBoardSnapshot(state);
  }

  updateCurrentBoardSnapshot(state: Record<string, unknown>): void {
    const incomingPhase = String(state.phase ?? "").trim();
    const incomingNodeId = String(state.nodeId ?? "").trim();
    if (
      this.currentBoardSnapshot?.phase === "node_complete" &&
      incomingPhase !== "node_complete" &&
      !incomingNodeId
    ) {
      console.log("  🎮 [board-snapshot] [ignored] stale state after node_complete");
      return;
    }
    const snapshot = buildCurrentBoardSnapshot({
      childId: this.chartChildId,
      sessionId: this.sessionId,
      state,
    });
    this.currentBoardSnapshot = snapshot;
    this.currentActivityState = {
      ...snapshot,
      currentWord: snapshot.currentTarget,
      updatedAt: snapshot.updatedAt,
    };
  }

  /**
   * Queue a one-shot map node completion summary for the next companion turn.
   * Survives subsequent `injectGameContext` calls until consumed (merged first in take).
   */
  public queueNodeCompletionHandoff(state: Record<string, unknown>): void {
    this.updateCurrentBoardSnapshot(state);
  }

  public buildCurrentBoardContextForTurn(childSpeech?: string): string {
    return buildCurrentBoardSnapshotContext(this.currentBoardSnapshot, {
      childSpeech,
    });
  }

  public recordCompanionTruthContradictions(response: string): string[] {
    const contradictions = findCompanionTruthContradictions(response, this.currentBoardSnapshot);
    for (const code of contradictions) {
      console.warn(`  🎮 [companion-truth] [contradiction] ${code}`);
      this.recordGameTrace({
        type: "companion_truth_contradiction",
        code,
        game: this.currentBoardSnapshot?.game,
        activityId: this.currentBoardSnapshot?.activityId,
        phase: this.currentBoardSnapshot?.phase,
        accuracy: this.currentBoardSnapshot?.accuracy,
        evidenceTier: this.currentBoardSnapshot?.evidenceTier,
        masteryEligible: this.currentBoardSnapshot?.masteryEligible,
        questState: this.currentBoardSnapshot?.questState,
        bossState: this.currentBoardSnapshot?.bossState,
        response: response.slice(0, 240),
      });
    }
    return contradictions;
  }

  getFreshActivityStateForScreenshot(): Record<string, unknown> | null {
    const state = this.currentActivityState;
    if (!state) return null;
    const updatedAt = typeof state.updatedAt === "string" ? Date.parse(state.updatedAt) : 0;
    if (!updatedAt || Number.isNaN(updatedAt)) return state;
    return Date.now() - updatedAt <= 15_000 ? state : null;
  }

  /** Returns 0–2 synthetic messages for the next Claude call, then clears (never accumulates). */
  takePendingGameContextMessages(): ModelMessage[] {
    return [
    ];
  }

  private send(type: string, payload: Record<string, unknown> = {}): void {
    if (
      type === "session_started" ||
      type === "session_ended" ||
      type === "error" ||
      type === "session_state"
    ) {
      this.debugRecorder.recordEvent("ws", "send", { type, ...payload });
    } else if (type === "canvas_draw") {
      this.debugRecorder.recordEvent("canvas", "draw", {
        mode: payload.mode,
        canvasRevision: payload.canvasRevision,
      });
    } else if (type === "tool_call") {
      this.debugRecorder.recordEvent("tool", "client_result", {
        tool: payload.tool,
      });
    }
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

  recordDebugEvent(component: string, action: string, fields: Record<string, unknown> = {}): void {
    this.debugRecorder.recordEvent(component, action, fields);
  }
  recordGameTrace(fields: Record<string, unknown>): void {
    this.debugRecorder.recordGameTrace(fields);
  }

  recordGameSummary(fields: Record<string, unknown>): void {
    this.debugRecorder.recordGameSummary(fields);
  }
  recordDebugTranscript(role: "user" | "assistant" | "system", text: string): void {
    this.debugRecorder.recordTranscript(role, text);
  }
  recordDebugError(message: string, detail?: unknown): void {
    this.debugRecorder.recordError(message, detail);
  }

  public emitRewardAttempt(correct: boolean, word?: string, domain?: string): void {
    const cid = this.chartChildId;
    const ts = Date.now();
    if (correct) {
      sessionEventBus.fire({
        type: "correct_answer",
        childId: cid,
        sessionId: this.sessionId,
        data:
          word !== undefined
            ? { word, ...(domain !== undefined ? { domain } : {}) }
            : undefined,
        timestamp: ts,
      });
    } else {
      sessionEventBus.fire({
        type: "wrong_answer",
        childId: cid,
        sessionId: this.sessionId,
        data: word !== undefined ? { word } : undefined,
        timestamp: ts,
      });
    }
  }
  async start(): Promise<void> {
    this.debugRecorder.recordEvent("session", "start_requested", {
      childName: this.childName,
      companionName: this.companion.name,
    });
    await runSessionStart(this, {
      registerCreatorDiagReadingSession: (s) => setCreatorDiagSessionForReadingTest(s),
    });
    this.debugRecorder.recordEvent("session", "started", {
      sessionType: this.ctx?.sessionType,
      companionName: this.companion.name,
    });
  }

  /** Inject a transcript directly — used by test harness to bypass Deepgram */
  injectTranscript(text: string): void {
    this.handleEndOfTurn(text).catch(console.error);
  }

  receiveAudio(pcm: Buffer): void {
    this.fluxHandle?.sendAudio(pcm);
  }

  /** Append background context from an external event without triggering a new agent turn (GAME-EVENT-001). */
  public noteExternalEvent(event: ExternalContextEvent): void {
    this.conversationHistory.push({
      role: "user",
      content: `[background: ${event.source}] ${event.summary}`,
    });
  }

  public async speakGameNarration(
    text: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const spoken = rewriteChildNameForTts(
      text.trim().slice(0, 120),
      this.childName,
      this.sessionTtsLabel,
    );
    if (!spoken) return;
    const event = {
      text: spoken,
      activityId: metadata.activityId,
      nodeId: metadata.nodeId,
      reason: metadata.reason,
    };
    this.debugRecorder.recordEvent("game_narration", "speak", event);
    if (this.ttsBridge) {
      await this.ttsBridge.connect().catch((err) =>
        console.error("  🔴 [game_narration] TTS connect failed:", err),
      );
      this.ttsBridge.sendText(spoken);
      await this.ttsBridge.finish().catch((err) =>
        console.error("  🔴 [game_narration] TTS finish failed:", err),
      );
    }
    this.debugRecorder.recordEvent("game_narration", "playback_done", event);
    this.send("audio_done");
  }

  public recordWorksheetAttempt(transcript: string, correct: boolean): void {
    if (!this.ctx?.assignment) return;
    this.ctx.assignment.attempts.push({
      questionIndex: this.worksheetProblemIndex,
      answer: transcript,
      correct,
      timestamp: new Date().toISOString(),
    });
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

  bargeIn(): void {
    this.pendingRoundComplete = null;
    gev.abortGameTtsGate(this);
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
    this.debugRecorder.recordEvent("turn", "barge_in", {
      stateBefore,
      turnState: this.turnSM.getState(),
      round: this.roundNumber,
      tts: ttsLogLabel(),
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

  flushPendingRoundComplete(): void {
    gev.flushPendingRoundCompleteForSession(this);
  }

  /** Iframe game events (word-builder fill-blanks) forwarded from the browser. */
  handleGameEvent(event: Record<string, unknown>, fromPendingFlush = false): void {
    gev.handleGameEventForSession(this, event, fromPendingFlush);
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
    void gev.tryCompleteTtsTurnAsync(this);
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
    this.debugRecorder.recordEvent(
      "session",
      "ending",
      buildSessionDebugFinalState(this),
    );

    const endChildId = this.chartChildId;
    unregisterActiveVoiceSessionIfCurrent(endChildId, this.sessionId);
    unregisterActiveVoiceSessionManager(endChildId, this);
    sessionEventBus.fire({
      type: "session_end",
      sessionId: this.sessionId,
      childId: endChildId,
      timestamp: Date.now(),
    });
    this.rewardEngine.detach();
    this.companionBridge.detach();
    if (this.screenshotPending) {
      clearTimeout(this.screenshotPending.timer);
      this.screenshotPending.resolve(null);
      this.screenshotPending = null;
    }

    clearCreatorDiagSessionForReadingTest(this);

    const ts = new Date().toISOString();
    console.log(`  🏁 [${ts}] Ending session for ${this.childName}`);
    await runSessionLearningSignalAudit({
      childId: endChildId,
      sessionId: this.sessionId,
      conversationHistory: this.conversationHistory,
      recentActivityState: this.currentActivityState,
      hostRecordChildSignal: (args) => this.hostRecordChildSignal(args),
      hostRecordProductIssue: (args) => this.hostRecordProductIssue(args),
    });

    if (this.clearSessionTimer) {
      this.clearSessionTimer();
      this.clearSessionTimer = null;
    }

    gev.wbEndCleanup(this);
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
      finalizeClockSession(this.chartChildId);
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
        const childId = this.chartChildId;
        try {
          const summary = finalizeSession(childId);
          this.debugRecorder.recordEvent("engine", "session_finalized", {
            totalAttempts: summary.totalAttempts,
            accuracy: summary.accuracy,
          });
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
          this.debugRecorder.recordEvent("engine", "progression_computed", {
            level: endProgression.level,
            totalXP: endProgression.totalXP,
            wordsMastered: endProgression.wordsMastered,
          });
        } catch {
          // Silent
        }
        await recordSession(this.conversationHistory, this.childName);
        appendRewardLog(this.childName, this.rewardEngine.getRewardLog());
      }

      finalizeSessionDebugPacket(this, "completed", {
        persistedSessionData: shouldPersistSessionData(),
        sessionNotesWritten: shouldPersistSessionData(),
        rewardsWritten: shouldPersistSessionData(),
      });
      this.send("session_ended", {
        summary: `Session ended. ${this.conversationHistory.length} turns.`,
        duration_ms: Date.now() - this.sessionStartTime,
        debugPacketPath: this.debugRecorder.sessionDir || undefined,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.debugRecorder.recordError("Post-session chain error", err);
      finalizeSessionDebugPacket(this, "errored", {
        persistedSessionData: shouldPersistSessionData(),
        postSessionError: message,
      });
      console.error("  🔴 Post-session chain error:", message);
      this.send("error", {
        message: "Post-session processing failed",
        debugPacketPath: this.debugRecorder.sessionDir || undefined,
      });
    }
  }

  public async connectDeepgram(): Promise<void> {
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
        this.debugRecorder.recordError("Deepgram error", err);
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
      this.debugRecorder.recordEvent("transcript", "replay", {
        turnState: this.turnSM.getState(),
        round: auditRound,
        transcriptLength: transcript.length,
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
        this.debugRecorder.recordEvent("transcript", "duplicate_suppressed", {
          turnState: this.turnSM.getState(),
          round: auditRound,
          transcriptLength: transcript.length,
        });
        return;
      }
      this.lastTranscript = normalized;
      this.lastTranscriptTime = now;
    }

    if (this.options?.sttOnly) {
      auditLog("transcript", {
        action: "accepted",
        turnState: this.turnSM.getState(),
        tts,
        childName: auditChild,
        round: auditRound,
      });
      this.debugRecorder.recordEvent("transcript", "accepted", {
        turnState: this.turnSM.getState(),
        round: auditRound,
        source: "stt_only",
        transcriptLength: transcript.length,
      });
      this.debugRecorder.recordTranscript("user", transcript);
      this.send("final", { text: transcript });
      return;
    }

    let state = this.turnSM.getState();
    const urgentRoute =
      !isReplay && !opts?.fromReadingComplete
        ? detectUrgentLearningRoute({
            transcript,
            childName: this.childName,
            companionName: this.companion.name,
            currentActivityState: this.currentActivityState,
            currentCanvasState: this.currentCanvasState,
          })
        : null;

    if (urgentRoute && !checkUserGoodbye(transcript)) {
      if (
        state === "PROCESSING" ||
        state === "SPEAKING" ||
        state === "CANVAS_PENDING"
      ) {
        this.bargeIn();
        state = this.turnSM.getState();
      }
      void recordUrgentLearningEvidenceForOrganicTurn({
        transcript,
        stateBefore: state,
        auditRound,
        auditChild,
        tts,
        context: urgentRoute.context,
        intent: urgentRoute.intent,
        sessionId: this.sessionId,
        debugRecorder: this.debugRecorder,
        hostRecordChildSignal: (args) => this.hostRecordChildSignal(args),
        hostRecordProductIssue: (args) => this.hostRecordProductIssue(args),
      }).catch((err: unknown) => {
        console.error("  🔴 [urgent-learning] organic evidence failed:", err);
      });
      if (
        urgentRoute.context.activityId === "pronunciation" &&
        (urgentRoute.intent.type === "help_request" ||
          urgentRoute.intent.type === "frustration")
      ) {
        const cue = pronunciationCueFor(urgentRoute.context.currentWord);
        const currentWord = urgentRoute.context.currentWord ?? "this word";
        const supportText = cue
          ? `I can help. Try breaking ${currentWord} into ${cue}, then say it slowly once.`
          : "I can help. Say it slowly once, then try it again.";
        this.turnSM.clearPendingTranscript("urgent_pronunciation_support");
        this.debugRecorder.recordTranscript("user", transcript);
        this.debugRecorder.recordEvent("urgent_learning", "pronunciation_support", {
          intent: urgentRoute.intent.type,
          currentWord: urgentRoute.context.currentWord,
          cue,
        });
        this.send("game_message", {
          forward: {
            type: "pronunciation_support",
            currentWord: urgentRoute.context.currentWord,
            cue,
            source: "companion",
            timestamp: Date.now(),
          },
        });
        console.log(
          `  🎮 [urgent-learning] [pronunciation_support] word=${currentWord} cue=${cue ?? "none"}`,
        );
        await this.handleCompanionTurn(supportText);
        return;
      }
    }

    if (
      !opts?.fromReadingComplete &&
      state === "IDLE" &&
      this.shouldSuppressTranscriptDuringKaraoke(transcript)
    ) {
      // Still forward to client for karaoke word-match; do not pass to LLM below.
      const suppressReason = activeLearningSuppressionReason({
        currentActivityState: this.currentActivityState,
        currentCanvasState: this.currentCanvasState,
      });
      this.debugRecorder.recordEvent("transcript", "suppressed", {
        reason: suppressReason,
        turnState: state,
        round: auditRound,
        transcriptLength: transcript.length,
      });
      this.debugRecorder.recordGameTrace({
        type: "transcript_suppressed",
        source: "session_manager",
        reason: suppressReason,
        game: this.currentActivityState?.game,
        activityId: this.currentActivityState?.activityId,
        nodeId: this.currentActivityState?.nodeId,
        phase: this.currentActivityState?.phase,
        transcript,
      });
      this.send("interim", { text: transcript });
      return;
    }

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
        this.debugRecorder.recordEvent("transcript", "dropped", {
          reason: "junk",
          turnState: state,
          round: auditRound,
          transcriptLength: transcript.length,
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
      this.debugRecorder.recordEvent("transcript", "queued", {
        turnState: state,
        round: auditRound,
        transcriptLength: transcript.length,
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
        this.debugRecorder.recordEvent("transcript", "dropped", {
          reason: "junk",
          turnState: state,
          round: auditRound,
          transcriptLength: transcript.length,
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
      this.debugRecorder.recordEvent("transcript", "dropped", {
        reason: "assistant_owns_turn",
        turnState: state,
        round: auditRound,
        transcriptLength: transcript.length,
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
    this.debugRecorder.recordEvent("transcript", "accepted", {
      turnState: state,
      round: auditRound,
      transcriptLength: transcript.length,
    });
    this.debugRecorder.recordTranscript("user", transcript);

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
      console.log("  🔇 Transcript suppressed — forwarding to client, skipping LLM");
      // Still forward to client so flow-state games (word-radar, etc.) can read the transcript.
      this.send("final", { text: transcript });
      this.turnSM.onInterrupt();
      return;
    }

    await this.runCompanionResponse(userMessage);
  }

  private async runCompanionResponse(userMessage: string): Promise<void> {
    await runCompanionResponseForSession(this, userMessage);
  }

  public buildAgentToolkit(): Record<string, unknown> {
    const six = createSixTools({
      canvasShow: (a) => this.hostCanvasShow(a),
      canvasClear: () => this.hostCanvasClear(),
      canvasStatus: () => this.hostCanvasStatus(),
      sessionLog: (a) => this.hostSessionLog(a),
      sessionStatus: () => this.hostSessionStatus(),
      spinWheel: () => this.hostSpinWheel(),
      sessionEnd: (a) => this.hostSessionEnd(a),
      recordChildSignal: (a) => this.hostRecordChildSignal(a),
      recordProductIssue: (a) => this.hostRecordProductIssue(a),
      expressCompanion: (a) => this.companionBridge.expressCompanion(a),
    });
    const companionActTool = createCompanionActTool({
      companionAct: (a) => this.companionBridge.companionAct(a),
    });
    const slimVoice = shouldUseAdventureMapVoiceSlimToolkit({
      worksheetMode: this.worksheetMode,
      sessionType: this.ctx?.sessionType,
    });
    const baseTools = slimVoice
      ? {
          sessionLog: six.sessionLog,
          sessionStatus: six.sessionStatus,
          spinWheel: six.spinWheel,
          sessionEnd: six.sessionEnd,
          recordChildSignal: six.recordChildSignal,
          recordProductIssue: six.recordProductIssue,
          expressCompanion: six.expressCompanion,
          companionAct: companionActTool,
        }
      : { ...six, companionAct: companionActTool };
    const screenshotTools = {
      takeGameScreenshot: createTakeGameScreenshotTool(this),
    };
    if (this.worksheetSession && this.worksheetMode) {
      return {
        ...baseTools,
        launchGame: createLaunchGameTool(this.worksheetSession),
        dateTime,
        ...screenshotTools,
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
        ...screenshotTools,
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
        ...screenshotTools,
      };
    }
    return {
      ...baseTools,
      launchGame: buildLaunchGameTool(undefined, launchGameKaraokeGuard),
      dateTime,
      ...screenshotTools,
    };
  }

  private async hostCanvasShow(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return hostCanvasShow(this as never, args);
  }

  private async hostCanvasClear(): Promise<{
    canvasShowing: "idle";
    ok?: boolean;
  }> {
    return hostCanvasClear(this as never);
  }

  private async hostCanvasStatus(): Promise<Record<string, unknown>> {
    return hostCanvasStatus(this as never);
  }

  private async hostSessionLog(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return hostSessionLog(this as never, args);
  }

  private async hostSessionStatus(): Promise<Record<string, unknown>> {
    return hostSessionStatus(this as never);
  }

  private async hostRecordChildSignal(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return hostRecordChildSignal(this as never, args);
  }

  private async hostRecordProductIssue(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return hostRecordProductIssue(this as never, args);
  }

  private async hostSpinWheel(): Promise<Record<string, unknown>> {
    const state = this.currentActivityState;
    const game = String(state?.game ?? "").toLowerCase();
    if (!game.includes("wheel")) {
      return {
        ok: false,
        reason: "wheel_not_active",
        currentActivityState: state,
      };
    }
    this.send("game_message", {
      forward: {
        type: "wheel_spin",
        source: "companion",
        timestamp: Date.now(),
      },
    });
    console.log("  🎮 [wheel] spin requested by companion");
    return { ok: true, action: "wheel_spin" };
  }

  private async hostSessionEnd(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return hostSessionEnd(this as never, args);
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
    if (tool === "record_child_signal") return "recordChildSignal";
    if (tool === "record_product_issue") return "recordProductIssue";
    if (tool === "express_companion") return "expressCompanion";
    if (tool === "companion_act") return "companionAct";
    if (tool === "request_pause_for_check_in") return "requestPauseForCheckIn";
    if (tool === "request_resume_activity") return "requestResumeActivity";
    return tool;
  }

  public sendLaunchGameRegistryError(
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
  public maybeRelaxMisdetectedReviewMode(
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

  public selectWorksheetProblems(
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
    const ttsText = rewriteChildNameForTts(text, this.childName, this.sessionTtsLabel);
    this.send("response_text", { chunk: ttsText });
    if (this.ttsBridge) {
      await this.ttsBridge.connect().catch(() => {});
      this.ttsBridge.sendText(ttsText);
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
        this.chartChildId,
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
  public normalizeCanvasShowArgs(
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
    runHandleToolCall(this, tool, args, result);
  }

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
    this.debugRecorder.recordEvent("flow_game", event === "complete" ? "karaoke_complete" : "karaoke_progress", buildReadingProgressFields({ ...payload, wordIndex, totalWords, accuracy: Number.isFinite(accuracy) ? accuracy : 0, hesitations, flaggedWords, skippedWords, spelledWords, event }));
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
      const childId = this.chartChildId;
      sessionEventBus.fire({
        type: "reading_complete",
        sessionId: this.sessionId,
        childId,
        timestamp: Date.now(),
      });
      const flagged = this.ctx?.readingProgress?.flaggedWords ?? [];
      const skipped = this.ctx?.readingProgress?.skippedWords ?? [];
      for (const word of [...flagged, ...skipped]) {
        const w = word.toLowerCase().trim();
        if (!w) continue;
        try {
          recordAttempt(childId, {
            word: w,
            domain: "reading",
            correct: false,
            quality: 1,
            scaffoldLevel: 0,
          });
        } catch (err) {
          console.error(`  [engine] reading word failed for "${word}":`, err);
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
        `  🎮 [engine] reading complete: ${flagged.length} flagged, ${skipped.length} skipped, ${spelledWords.length} spelled → word bank (${childId})`,
      );

      void this.handleEndOfTurn(
        "[reading_progress] event=complete — the reader finished the karaoke story. Reply with exactly one short sentence acknowledging the reading. Do not call canvasShow or refresh karaoke unless the child or parent/caregiver explicitly asks for something new.",
        true,
        { fromReadingComplete: true },
      ).catch((err) => console.error(err));

      const fromCanvas =
        this.currentCanvasState &&
        typeof (this.currentCanvasState as { content?: unknown }).content ===
          "string"
          ? String((this.currentCanvasState as { content: string }).content).trim()
          : "";
      const promptRaw = (this.currentCanvasState as { storyImagePrompt?: unknown } | null)?.storyImagePrompt;
      const fromPrompt = typeof promptRaw === "string" ? promptRaw.trim() : "";
      const storyText =
        fromPrompt || this.lastKaraokeStoryText.trim() || fromCanvas;
      if (storyText.length > 0) {
        if (this.storyImageGeneratedThisStory) {
          console.log(
            "  🖼️  [story-image] skip auto after reading complete — already generated for this story",
          );
        } else {
          this.storyImageGeneratedThisStory = true;
          this.storyImagePending = true;
          this.send("story_image_loading", {});
          void generateStoryImage(storyText, {
            sessionType: this.ctx?.sessionType,
          })
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

  receiveWordRadarComplete(msg: Record<string, unknown>): void {
    const raw = msg.rawResults;
    if (!Array.isArray(raw)) {
      console.warn("  ⚠️  word_radar_complete: missing rawResults");
      return;
    }
    const rows: WordRadarWireResultRow[] = [];
    for (const r of raw) {
      if (!r || typeof r !== "object") continue;
      const o = r as Record<string, unknown>;
      const item = o.item;
      const correct = o.correct === true;
      const responseTime_ms = Number(o.responseTime_ms);
      if (!item || typeof item !== "object") continue;
      const display = String((item as Record<string, unknown>).display ?? "");
      if (!display) continue;
      rows.push({
        item: { display },
        correct,
        responseTime_ms: Number.isFinite(responseTime_ms) ? responseTime_ms : 0,
      });
    }
    const childId = this.chartChildId;
    try {
      applyWordRadarResultToWordBank(childId, rows);
      console.log(
        `  🎮 [word_radar_complete] merged ${rows.length} row(s) → word_bank (${childId})`,
      );
    } catch (e) {
      console.error("  🔴 word_radar_complete word bank merge failed", e);
    }
    recordWordRadarAttempts(childId, rows, this.sessionId);
  }

  receivePronunciationComplete(msg: Record<string, unknown>): void {
    const accuracyRaw = Number(msg.accuracy);
    const totalRaw = Number(msg.totalWords);
    const correctRaw = Number(msg.correctCount);
    const accuracy = Number.isFinite(accuracyRaw) ? accuracyRaw : 0;
    const totalWords = Number.isFinite(totalRaw) ? totalRaw : 0;
    const correctCount = Number.isFinite(correctRaw) ? correctRaw : 0;
    const accPct =
      accuracy <= 1 && accuracy >= 0 ? Math.round(accuracy * 100) : Math.round(accuracy);
    console.log(
      `  🎮 [pronunciation_complete] words=${correctCount}/${totalWords} acc=${accPct}%`,
    );
    this.debugRecorder.recordEvent("flow_game", "pronunciation_complete", buildPronunciationCompleteFields({ ...msg, accuracy, totalWords, correctCount }));
    this.debugRecorder.recordGameTrace({
      ...msg,
      type: "pronunciation_complete",
      source: "session_manager",
      game: "pronunciation",
      childId: this.chartChildId,
      totalWords,
      correctCount,
      accuracy,
    });
    const targetResults = Array.isArray(msg.targetResults) ? msg.targetResults : [];
    targetResults.forEach((row, rowIndex) => {
      if (!row || typeof row !== "object") return;
      const target = String((row as Record<string, unknown>).target ?? "").trim();
      if (!target) return;
      const attemptsRaw = Number((row as Record<string, unknown>).attempts);
      const attempts = Number.isFinite(attemptsRaw) && attemptsRaw > 0
        ? Math.max(1, Math.round(attemptsRaw))
        : 1;
      const correct = (row as Record<string, unknown>).correct === true;
      const scaffoldLevel = Number((row as Record<string, unknown>).scaffoldLevel);
      for (let attemptIndex = 0; attemptIndex < attempts; attemptIndex += 1) {
        const isFinalAttempt = attemptIndex === attempts - 1;
        const attemptCorrect = correct && isFinalAttempt;
        try {
          recordLearningAttempt({
            attemptId: `${this.sessionId}:pronunciation:${rowIndex}:${attemptIndex}:${target.toLowerCase()}`,
            childId: this.chartChildId,
            sessionId: this.sessionId,
            domain: "reading",
            target,
            correct: attemptCorrect,
            quality: attemptCorrect ? 4 : 1,
            scaffoldLevel: Number.isFinite(scaffoldLevel) ? scaffoldLevel : 0,
          }, this.chartChildId);
        } catch (err) {
          console.error("  🔴 [pronunciation_complete] attempt record failed:", err);
        }
      }
    });
    recordPronunciationReadingStruggleSignal({
      totalWords,
      accPct,
      correctCount,
      childName: this.childName,
      sessionId: this.sessionId,
      emittedKeys: this.pronunciationStruggleSignals,
      hostRecordChildSignal: (args) => this.hostRecordChildSignal(args),
    });
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

}
