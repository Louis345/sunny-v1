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
import {
  DEMO_MODE_PROMPT,
  HOMEWORK_MODE_PROMPT,
  TEST_MODE_PROMPT,
  WORD_BUILDER_ROUND_COMPLETE,
  WORD_BUILDER_ROUND_FAILED,
  WORD_BUILDER_SESSION_COMPLETE,
  SPELL_CHECK_CORRECT,
  buildSessionPrompt,
  buildCanvasContext,
  extractWordsFromHomework,
  normalizeSessionSubject,
} from "../agents/prompts";
import { loadHomeworkPayload } from "../utils/loadHomeworkFolder";
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
import { resetMathProbeSession } from "../agents/elli/tools/mathProblem";
import { resetSessionStart } from "../agents/elli/tools/startSession";
import { resetTransitionToWork } from "../agents/elli/tools/transitionToWork";
import { generateText, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
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
  type SessionContext,
  createSessionContext,
  buildCanvasContextMessage,
} from "./session-context";
import {
  CANONICAL_AGENT_TOOL_KEYS,
  getSessionTypeConfig,
  resolveSessionType,
} from "./session-type-registry";
import {
  deriveWorksheetCanvasModel,
  renderWorksheetCanvasModelSvg,
  summarizeWorksheetCanvasModel,
} from "./worksheet-canvas-model";
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
  normalizeWorksheetProblem,
  toWorksheetCanvasSource,
  toWorksheetPromptProblem,
  type CanonicalWorksheetProblem,
} from "./worksheet-problem";
import {
  buildTruthForCanonicalProblem,
  detectWorksheetDomain,
  formatTrustedAmountsSummaryForLearningArc,
  validateLogWorksheetAttempt,
  type WorksheetProblemTruth,
} from "./worksheet-truth";
import {
  buildSanitizedGamePool,
  clearEarnedReward,
  createWorksheetSession as createWSSession,
  detectWorksheetDomain as detectWorksheetDomainForGamePool,
  saveEarnedReward,
  type WorksheetSession,
} from "./worksheet-tools";
import { createLaunchGameTool } from "../agents/elli/tools/worksheetTools";
import { createSixTools } from "../agents/tools/six-tools";
import { launchGame } from "../agents/elli/tools/launchGame";
import { dateTime } from "../agents/elli/tools/dateTime";
import { buildWorksheetToolPrompt } from "../agents/prompts/worksheetSessionPrompt";
import { classifyWorksheetNonAnswerTranscript } from "./worksheet-turn-guards";
import { appendWorksheetAttemptLine } from "../utils/attempts";
import {
  isDemoMode,
  isHomeworkMode,
  isSunnyTestMode,
  shouldPersistSessionData,
} from "../utils/runtimeMode";
import { readRasterDimensionsFromFile } from "../utils/rasterDimensions";

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

type WorksheetTurnOutcomeKind =
  | "accepted_correct"
  | "accepted_incorrect"
  | "clarification_only"
  | "blocked_stale";

/** @deprecated — kept for type compatibility; grading is now model-owned */
type WorksheetTurnOutcome = {
  kind: WorksheetTurnOutcomeKind;
  prompt: string;
  correct?: boolean;
  recordAttempt?: boolean;
};

type WorksheetLearningArcState = {
  gameName: string;
  phase: "instructional_game" | "followup";
  /** 0 = awaiting first child reply after post-game model follow-up; 1 = awaiting second reply before reward */
  followupRound: number;
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

const QUESTION_PREFIXES = /^(circle|how much|how many|what|which|count|find|choose|select|pick|show|draw|look at|read)\b/i;
const WORKSHEET_CLARIFICATION_PATTERNS = [
  /\bwhich one\b/i,
  /\bwhich two\b/i,
  /\bwho are we talking about\b/i,
  /\bwhat do you mean\b/i,
  /\bwhich (girl|student|child)\b/i,
  /\bwhat('?s| is) next\b/i,
  /\bi'?m ready\b/i,
  /\blet'?s go\b/i,
  /^(yeah|yep|yes|okay|ok|sense)\b/i,
];
const WORKSHEET_CARRYOVER_LEADERS = /^(than|then|and|or|is|was|were|bigger|smaller|more|less)\b/i;
const INSTRUCTIONAL_GAME_COMPLETION_CLAIM =
  /\b(i did it|i did|i won|i finished|finished it|i'm done|im done|all done|completed it|i beat it|i got it)\b/i;
const WORKSHEET_NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

function extractWorksheetTurnCount(text: string): number | null {
  const cleaned = String(text ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ");
  const numeric = cleaned.match(/\b(\d+)\b/);
  if (numeric) return Number(numeric[1]);
  const words = cleaned.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const first = words[i];
    const value = WORKSHEET_NUMBER_WORDS[first];
    if (value == null) continue;
    const next = words[i + 1];
    if (value >= 20 && next && WORKSHEET_NUMBER_WORDS[next] != null && WORKSHEET_NUMBER_WORDS[next] < 10) {
      return value + WORKSHEET_NUMBER_WORDS[next];
    }
    return value;
  }
  return null;
}

function normalizeTranscriptForGuards(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Strip question/instruction framing from canvas_display text so the SVG
 * generator receives a pure scene description, not a question to echo.
 *
 * "Circle how much money I need to buy these cookies." → "These cookies."
 * "How many coins do I need to buy a peanut?" → "A peanut."
 * "A cookie shop. Cookie 10¢, Peanut 5¢." → unchanged
 */
/**
 * Check whether Claude's claimed childSaid has meaningful overlap with
 * what the child actually said (the transcript). Prevents stale/hallucinated
 * childSaid from a previous problem being accepted against the current one.
 */
export function hasContentOverlap(claimed: string, actual: string): boolean {
  if (!claimed || !actual) return false;
  const a = claimed.toLowerCase().trim();
  const b = actual.toLowerCase().trim();
  if (/^(who|what|which)\b/i.test(b) || WORKSHEET_CLARIFICATION_PATTERNS.some((pattern) => pattern.test(b))) {
    return false;
  }
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const countA = extractWorksheetTurnCount(a);
  const countB = extractWorksheetTurnCount(b);
  if (countA != null || countB != null) {
    return countA != null && countB != null && countA === countB;
  }
  const ignoredWords = new Set([
    ...Object.keys(WORKSHEET_NUMBER_WORDS),
    "the",
    "this",
    "that",
    "these",
    "those",
    "girl",
    "girls",
    "student",
    "students",
    "child",
    "children",
    "money",
    "amount",
    "amounts",
  ]);
  const wordsA = a.split(/\W+/).filter((w) => w.length >= 3 && !ignoredWords.has(w));
  const wordsB = new Set(
    b.split(/\W+/).filter((w) => w.length >= 3 && !ignoredWords.has(w)),
  );
  if (wordsA.length === 0) return false;
  return wordsA.some((w) => wordsB.has(w));
}

export function sanitizeCanvasDescription(raw: string): string {
  let text = raw.trim();
  if (!text) return text;

  if (!QUESTION_PREFIXES.test(text)) return text;

  text = text
    .replace(/^(circle|count|find|choose|select|pick|show|draw|look at|read)\s+(the\s+)?/i, "")
    .replace(/^(how much|how many)\s+\w+\s+(do\s+)?(i|you|we)\s+(need\s+to\s+|have\s+to\s+)?(buy|spend|pay|have|get)\s*/i, "")
    .replace(/^(how much|how many)\s+\w+(\s+\w+)?\s+(to\s+)?(buy|spend|pay)\s*/i, "")
    .replace(/^(what|which)\s+\w+\s+(do\s+)?(i|you|we)\s+(need|have|see)\s+(to\s+)?(buy|spend|pay|get)?\s*/i, "")
    .replace(/^\s*[?.!]\s*/, "")
    .trim();

  if (!text || text.length < 3) return raw.trim();

  text = text.charAt(0).toUpperCase() + text.slice(1);
  return text;
}

async function generateWorksheetSVG(description: string): Promise<string | null> {
  try {
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: `Generate a clean, colorful educational SVG scene for an 8-year-old child.

LAYOUT (strict):
- width="500" height="300", viewBox="0 0 500 300"
- Warm background: large rounded rect fill="#FFF9E6"
- Items centered horizontally with generous spacing
- Each item: a large colorful illustration on top, item name below in bold friendly font, price in a rounded-rect tag below the name (e.g. orange fill, white text "10¢")
- If the problem involves a total cost, show a "Total Spent:" box on the right side — rounded-rect with light blue fill, coin icon, bold price text, vertically centered with the items
- Font: minimum 18px, bold, friendly rounded style (sans-serif)
- Drop shadows on items for depth

WHAT TO SHOW:
- The SCENE only: the items being bought/counted with their prices
- For buying problems: show each item with its price tag. Show "Total Spent: X¢" if the total is given in the problem
- For coin counting: show the coins to count as large gold circles with ¢ denominations
- For comparison: show both sets of items side by side

NEVER DO THESE:
- NEVER show the question text — the tutor speaks it aloud
- NEVER show multiple choice options or a row of coins to choose from
- NEVER show "Coin Options", "Choose", "Circle", or any selection UI
- NEVER show the answer or solution
- NEVER show equations or sum totals the child must compute (that's the answer)
- NEVER add interactive-looking elements (buttons, checkboxes, circles to select)

Return ONLY the raw <svg> tag. No markdown, no explanation, no code fences.`,
      prompt: description,
    });
    const rawText = text.trim();
    console.log(
      "🎨 [svg-gen]",
      rawText.toLowerCase().includes("<svg")
        ? `✅ ${rawText.length} chars`
        : `❌ no svg tag — got: ${rawText.slice(0, 60)}`,
    );
    const svg = rawText;
    const lower = svg.toLowerCase();
    const svgStart = lower.indexOf("<svg");
    if (svgStart === -1) return null;
    return svg.slice(svgStart);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("🎨 [svg-gen] failed:", msg);
    return null;
  }
}

/** Omit raw worksheet directions from the session prompt — never expose instructions to the tutor LLM. */
function problemsForWorksheetSessionPrompt(
  problems: CanonicalWorksheetProblem[],
): Array<ReturnType<typeof toWorksheetPromptProblem>> {
  return problems.map((problem) => toWorksheetPromptProblem(problem));
}

/** Homework + classifier path: SUNNY_CHILD=reina|ila overrides WebSocket session child. */
function parseSunnyChildEnv(): ChildName | null {
  const v = process.env.SUNNY_CHILD?.trim().toLowerCase();
  if (v === "ila") return "Ila";
  if (v === "reina") return "Reina";
  return null;
}

export function shouldTriggerTransitionToWorkPhase(
  roundNumber: number,
  childName: ChildName,
  transitionedToWork: boolean
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

export class SessionManager {
  /** When true, child speech is not sent to the companion (silent reward games). */
  public suppressTranscripts: boolean = false;

  private ws: WebSocket;
  private childName: ChildName;
  private companion: CompanionConfig;
  private conversationHistory: ModelMessage[] = [];
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
  /** Server-canonical record of what is currently displayed on the canvas.
   *  Updated every time showCanvas fires; cleared on barge-in and session end.
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
  /** round_complete event that arrived while Elli was mid-speech; flushed on WORD_BUILDER re-entry */
  private wbPendingEvent: Record<string, unknown> | null = null;
  /** Safety: exit Word Builder if no round activity for this long */
  private wbActivityTimeout: ReturnType<typeof setTimeout> | null = null;
  private static readonly WB_ACTIVITY_MS = 90_000;
  /** Dedup duplicate iframe round_complete for the same round number */
  private wbLastProcessedRound = 0;
  /** After game_complete: block startWordBuilder until child spells wbWord (logAttempt). */
  private wbAwaitingSpell = false;
  // ────────────────────────────────────────────────────────────────────────

  // Legacy aliases kept for spell-check (different flow)
  private activeWordBuilderWord = "";
  private wordBuilderSessionActive = false;
  private activeSpellCheckWord = "";
  private spellCheckSessionActive = false;
  private activeWordContext: string = "";
  private wordAttemptCounts: Map<string, number> = new Map();
  private pendingGameStart: PendingGameStart | null = null;

  private turnSM: TurnStateMachine;

  private readonly gameBridge = new GameBridge(
    (payload) => this.send("game_message", { forward: payload }),
    (voiceEnabled) => {
      this.suppressTranscripts = !voiceEnabled;
      console.log(
        `  🎮 Voice: ${voiceEnabled ? "active" : "silent"}`
      );
    }
  );

  /** Homework spelling list (normalized) — when every word has a logAttempt, launch reward game */
  private spellingHomeworkWordsByNorm: string[] = [];
  private spellingWordsWithAttempt = new Set<string>();
  private spaceInvadersRewardActive = false;
  private spaceInvadersRewardLaunched = false;
  private endAfterReward = false;

  /** Option C worksheet session — pure state, Claude calls tools */
  private worksheetSession: WorksheetSession | null = null;

  /** Canonical worksheet loop — server validates, renders, and grades from one source of truth. */
  private worksheetMode = false;
  private worksheetReadyForAnswers = false;
  private worksheetProblems: CanonicalWorksheetProblem[] = [];
  private assignmentManifest: AssignmentManifest | null = null;
  private worksheetPlayerState: WorksheetPlayerState | null = null;
  private worksheetInteractionMode: WorksheetInteractionMode = "answer_entry";
  private worksheetProblemIndex = 0;
  private worksheetWrongForCurrent = 0;
  private worksheetTurnsWithoutAttempt = 0;
  private worksheetRewardAfterN = 5;
  private worksheetSubjectLabel = "";
  /** Per-problem trusted/suspect cents and reveal eligibility — single source for pool + reveals. */
  private worksheetTruthById: Map<string, WorksheetProblemTruth> = new Map();
  /** Actual worksheet PDF/image bytes — pinned into conversation so the model sees the real worksheet */
  private worksheetPageFile: { data: Buffer; mimeType: string } | null = null;
  /** Defer worksheet index/canvas advance until after Matilda's response TTS completes. */
  private pendingWorksheetLog: { ok: boolean } | null = null;
  /** Defer first worksheet problem until after the transitionToWork response finishes. */
  private pendingWorksheetStart = false;
  private pendingEndSessionReward = false;
  /** Actual child transcript for the current worksheet turn — validates logWorksheetAttempt childSaid. */
  private worksheetTurnTranscript = "";
  /** True while advancing to next problem (SVG gen + question speak) — blocks concurrent agent runs. */
  private worksheetAdvancing = false;
  /** Transcript that arrived during worksheet advancement — replayed after advance completes. */
  private worksheetBufferedTranscript: string | null = null;
  private worksheetRecentSubmission: {
    problemId: string;
    normalizedValue: string;
    expiresAt: number;
  } | null = null;
  private worksheetPendingOverlaySubmission: {
    problemId: string;
    normalizedValue: string;
  } | null = null;
  private lastWorksheetTurnOutcome: WorksheetTurnOutcomeKind | null = null;
  private recentWorksheetAcceptedTranscript: {
    normalizedValue: string;
    expiresAt: number;
  } | null = null;
  private pendingInstructionalGameCompletion: {
    gameName: string;
  } | null = null;
  private worksheetLearningArc: WorksheetLearningArcState | null = null;
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
      typeof content === "string" &&
      /[\d]+\s*([+\-×÷])\s*[\d]+/.test(content)
    );
  }

  private isWordTeachingCanvas(args: Record<string, unknown>): boolean {
    if (args.mode !== "teaching") return false;
    if (this.isTeachingMathCanvas(args)) return false;
    const content = args.content;
    return typeof content === "string" && /[a-z]/i.test(content);
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
    } = {}
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
    this.pendingInstructionalGameCompletion = null;
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
      /(talk about my day|tell you about my day|tell you something|need to talk|bad experience)/i.test(t) &&
      /(can i|can we|i want to|i need to|could we|just|really quickly|before)/i.test(t)
    ) {
      return true;
    }
    return false;
  }

  private isResumeActivityRequest(transcript: string): boolean {
    const t = transcript.toLowerCase().trim();
    if (!t) return false;
    return /(\bi'?m ready\b|\blet'?s go back\b|\bgo back to\b|\bresume\b|\bcontinue\b|\bback to (math|the problem|the worksheet)\b)/i.test(
      t
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
          wrongForCurrent: this.worksheetWrongForCurrent,
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
    this.worksheetReadyForAnswers = false;
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
    replayQuestion = true
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
      this.worksheetWrongForCurrent = snapshot.worksheet.wrongForCurrent;
      this.worksheetReadyForAnswers = false;
      this.worksheetAdvancing = true;
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
      this.worksheetReadyForAnswers = true;
      this.worksheetAdvancing = false;
      this.activeCanvasActivity = {
        ...this.activeCanvasActivity,
        pauseState: "active",
        snapshot: null,
        reason: undefined,
      };
      this.syncActivityContext();
      this.broadcastContext();
      await this.drainWorksheetBuffer();
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

  private async resumeWorksheetAfterInstructionalGame(
    snapshot: CanvasActivitySnapshot
  ): Promise<void> {
    if (!snapshot.worksheet) return;
    this.worksheetProblemIndex = snapshot.worksheet.problemIndex;
    this.worksheetWrongForCurrent = snapshot.worksheet.wrongForCurrent;
    this.worksheetReadyForAnswers = false;
    this.worksheetAdvancing = true;
    this.clearActiveCanvasActivity();
    try {
      await this.presentCurrentWorksheetProblem();
    } finally {
      this.worksheetAdvancing = false;
    }
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

  constructor(ws: WebSocket, childName: ChildName) {
    this.ws = ws;
    this.childName = childName;
    this.companion = getCompanionConfig(childName);

    if (isSunnyTestMode()) {
      this.companion = {
        ...this.companion,
        systemPrompt: TEST_MODE_PROMPT(childName),
        openingLine: `[TEST MODE] Diagnostic session for ${childName}. Ready. Give me a tool call to verify.`,
      };
      console.log(`  🧪 TEST MODE active — diagnostic prompt loaded for ${childName}`);
    }

    this.turnSM = new TurnStateMachine(
      (text) => this.ttsBridge?.sendText(text),
      (msg) => console.log(msg),
      (state) => {
        this.send("session_state", { state });
        if (state === "SPEAKING") {
          this.speakingStartedAt = Date.now();
        } else if (state === "WORD_BUILDER" && this.wbPendingEvent) {
          const pending = this.wbPendingEvent;
          this.wbPendingEvent = null;
          console.log("  🎮 flushing buffered game event");
          setImmediate(() => this.handleGameEvent(pending));
        } else if (state === "IDLE") {
          this.speakingStartedAt = 0;
        }
      }
    );
  }

  private send(type: string, payload: Record<string, unknown> = {}): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(
        JSON.stringify({
          type,
          timestamp: new Date().toISOString(),
          ...payload,
        })
      );
    }
  }

  async start(): Promise<void> {
    this.spellingHomeworkWordsByNorm = [];
    this.spellingWordsWithAttempt.clear();
    this.spaceInvadersRewardLaunched = false;
    this.spaceInvadersRewardActive = false;

    const ts = new Date().toISOString();
    this.sessionStartTime = Date.now();
    console.log(
      `  🌟 [${ts}] Starting session: ${this.childName} with ${this.companion.name}`
    );

    const subject = normalizeSessionSubject(process.env.SUNNY_SUBJECT);

    const detectedChild = this.childName;
    const homeworkChild =
      parseSunnyChildEnv() ?? detectedChild ?? "Ila";
    console.log(`  👤 Child override: ${homeworkChild}`);

    // Check drop/ for new files and route them before loading homework
    this.send("loading_status", { message: "Checking for new assignments..." });
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
      console.warn("  ⚠️  Classifier failed:", err instanceof Error ? err.message : String(err));
    }

    // Folder-based homework (images) — inject at session startup
    const homeworkPayload =
      isDemoMode() ? null : await loadHomeworkPayload(homeworkChild);

    if (isHomeworkMode() && homeworkPayload) {
      // HOMEWORK MODE: loads real homework but uses parent-facing prompt (no progression loop)
      console.log(
        `  📚 Homework loaded for ${homeworkChild}: ${homeworkPayload.fileCount} pages`
      );
      this.send("loading_status", { message: "Preparing homework review..." });

      let extraction: HomeworkExtractionResult = { subject: "", problems: [] };
      try {
        console.log("  🧠 Psychologist extracting worksheet problems...");
        this.send("loading_status", { message: "Reading worksheet questions..." });
        extraction = await extractHomeworkProblems({
          rawText: homeworkPayload.rawContent,
          pageAssets: homeworkPayload.pageAssets,
        });
        console.log(
          `  🎮 [worksheet] extraction — subject: "${extraction.subject}", ` +
            `problems: ${extraction.problems.length}`
        );
      } catch (err) {
        console.warn("  ⚠️  Extraction failed:", err instanceof Error ? err.message : String(err));
      }

      // Load worksheet PDF as canvas + pin image for vision — same as normal mode
      const pdfFilename = homeworkPayload.assetFilenames.find((n) =>
        n.toLowerCase().endsWith(".pdf")
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
          execSync(
            `/usr/bin/qlmanage -t -s 2000 -o "${tmpDir}" "${pdfPath}"`,
            { stdio: "pipe" },
          );
          const pngPath = path.join(tmpDir, `${pdfBase}.png`);
          this.worksheetPageFile = {
            data: fs.readFileSync(pngPath),
            mimeType: "image/png",
          };
          try { fs.unlinkSync(pngPath); } catch { /* cleanup best-effort */ }
          console.log(
            `  👁️  [worksheet] loaded PDF PNG for homework review (${(this.worksheetPageFile.data.length / 1024).toFixed(0)} KB)`
          );
        } catch (e) {
          // Fall back to page asset
          if (!this.worksheetPageFile && homeworkPayload.pageAssets.length > 0) {
            const asset = homeworkPayload.pageAssets[0];
            this.worksheetPageFile = {
              data: Buffer.from(asset.data, "base64"),
              mimeType: asset.mediaType,
            };
          }
          console.warn("  ⚠️  PDF→PNG conversion failed:", e instanceof Error ? e.message : String(e));
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
        systemPrompt: HOMEWORK_MODE_PROMPT(
          this.childName,
          this.companion.name,
          extraction.subject,
        ),
        openingLine:
          `Hello — I'm ${this.companion.name} in homework review mode. ` +
          `I've loaded ${homeworkChild}'s worksheet on ${extraction.subject || "homework"}. ` +
          "What would you like to review?",
      };
      console.log(`  📋 Homework mode — parent/developer review prompt active`);
      console.log(`  📚 Subject: ${extraction.subject || subject}`);
      this.send("loading_status", { message: "Ready for review..." });
    } else if (isDemoMode()) {
      this.companion = {
        ...this.companion,
        systemPrompt: DEMO_MODE_PROMPT(this.childName, this.companion.name),
        openingLine:
          `Hello — I'm ${this.companion.name} in demo mode. ` +
          "I'm ready to demonstrate my capabilities. " +
          "What would you like to see?",
      };
      console.log(
        `  🎭 Demo mode — parent/developer prompt active`
      );
      console.log(`  📚 Subject mode: ${subject}`);
      this.send("loading_status", { message: "Starting demo session..." });
    } else if (homeworkPayload) {
      console.log(
        `  📚 Homework loaded for ${homeworkChild}: ` +
          `${homeworkPayload.fileCount} pages`
      );
      this.send("loading_status", { message: "Preparing session prompt..." });

      // ── Extraction cache ────────────────────────────────────────────────────
      // extraction.json lives alongside the PDF. Once written, all future
      // sessions load instantly with zero tokens and no overload risk.
      const cacheFile = path.join(homeworkPayload.folderPath, "extraction.json");

      let extraction: HomeworkExtractionResult = {
        subject: "",
        problems: [],
      };

      // Try loading from cache first
      let loadedFromCache = false;
      if (fs.existsSync(cacheFile)) {
        try {
          const cached = JSON.parse(fs.readFileSync(cacheFile, "utf-8")) as HomeworkExtractionResult;
          if (cached.subject && cached.problems.length > 0) {
            extraction = cached;
            loadedFromCache = true;
            console.log(
              `  ⚡ [worksheet] loaded extraction from cache — subject: "${extraction.subject}", ` +
                `problems: ${extraction.problems.length}`
            );
          }
        } catch (e) {
          console.warn("  ⚠️  extraction.json corrupt — re-extracting:", e instanceof Error ? e.message : String(e));
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
              `problems: ${extraction.problems.length}`
          );
          // Persist to cache so next session is instant
          if (extraction.subject && extraction.problems.length > 0) {
            try {
              fs.writeFileSync(cacheFile, JSON.stringify(extraction, null, 2), "utf-8");
              console.log(`  💾 [worksheet] extraction cached → extraction.json`);
            } catch (e) {
              console.warn("  ⚠️  Could not write extraction.json:", e instanceof Error ? e.message : String(e));
            }
          }
        } catch (err) {
          console.warn(
            "  ⚠️  Worksheet extraction failed:",
            err instanceof Error ? err.message : String(err)
          );
          // Stale cache is better than nothing — check once more
          if (fs.existsSync(cacheFile)) {
            try {
              const stale = JSON.parse(fs.readFileSync(cacheFile, "utf-8")) as HomeworkExtractionResult;
              if (stale.subject) {
                extraction = stale;
                console.warn("  ⚠️  Using stale extraction.json as fallback");
              }
            } catch { /* ignore */ }
          }
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      this.worksheetProblems = this.selectWorksheetProblems(extraction);
      this.rebuildWorksheetTruthMap();
      this.worksheetProblemIndex = 0;
      this.worksheetWrongForCurrent = 0;
      this.worksheetReadyForAnswers = false;
      this.worksheetRewardAfterN =
        extraction.session_directives?.reward_after ?? 5;
      this.worksheetSubjectLabel = extraction.subject.trim() || "worksheet";
      this.worksheetMode = this.worksheetProblems.length > 0;
      this.worksheetInteractionMode = this.worksheetMode
        ? extraction.session_directives?.interaction_mode ??
          detectWorksheetInteractionMode({
            rawContent: homeworkPayload.rawContent,
            problems: this.worksheetProblems,
          })
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
          execSync(
            `/usr/bin/qlmanage -t -s 2000 -o "${tmpDir}" "${pdfPath}"`,
            { stdio: "pipe" },
          );
          const pngPath = path.join(tmpDir, `${pdfBase}.png`);
          this.worksheetPageFile = {
            data: fs.readFileSync(pngPath),
            mimeType: "image/png",
          };
          try { fs.unlinkSync(pngPath); } catch { /* cleanup best-effort */ }
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
            this.assignmentManifest = buildAssignmentManifestFromWorksheetProblems({
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
              `  📄 [worksheet] worksheet_pdf enabled — using asset ${pdfAssetUrl} (${this.worksheetInteractionMode})`
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
            `  📄 [worksheet] visual-only fallback — PDF visible, no structured problem queue`
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
          const imagePath = path.join(homeworkPayload.folderPath, imageFilename);
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
              this.assignmentManifest = buildAssignmentManifestFromWorksheetProblems({
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
      const wordList = this.worksheetMode
        ? []
        : extractWordsFromHomework(homeworkPayload.rawContent);
      if (!this.worksheetMode && wordList.length > 0) {
        console.log(`  📋 Spelling words extracted: ${wordList.join(", ")}`);
        this.spellingHomeworkWordsByNorm = [
          ...new Set(
            wordList
              .map((w) => String(w).toLowerCase().trim())
              .filter(Boolean)
          ),
        ];
      } else if (this.worksheetMode) {
        this.spellingHomeworkWordsByNorm = [];
        console.log(
          `  🎮 [worksheet] ${this.worksheetProblems.length} problem(s) queued; ` +
            `reward_after=${this.worksheetRewardAfterN}`
        );
      }

      const homeworkForPrompt =
        this.worksheetMode && this.worksheetProblems.length > 0
          ? `## Worksheet extraction (validated; server presents only canonical supported problems)\n${JSON.stringify(
              {
                subject: extraction.subject,
                problems: problemsForWorksheetSessionPrompt(
                  this.worksheetProblems,
                ),
                session_directives: extraction.session_directives,
              },
              null,
              2
            )}\n\n--- ORIGINAL HOMEWORK ---\n${homeworkPayload.rawContent}`
          : homeworkPayload.rawContent;

      let sessionPrompt = await buildSessionPrompt(
        homeworkChild,
        this.companion.markdownPath,
        homeworkForPrompt,
        wordList,
        subject,
      );
      if (this.worksheetMode) {
        if (this.worksheetProblems.length > 0) {
          this.worksheetSession = createWSSession({
            childName: homeworkChild,
            companionName: this.companion.name,
            problems: this.worksheetProblems.map((p) => {
              const facts: Record<string, number> =
                p.kind === "compare_amounts"
                  ? {
                      leftCents: p.leftAmountCents,
                      rightCents: p.rightAmountCents,
                    }
                  : p.kind === "money_count"
                    ? { totalCents: p.totalSpentCents }
                    : {};
              return {
                id: String(p.id),
                question: p.question,
                canonicalAnswer: p.canonicalAnswer,
                hint: p.hint,
                facts,
              };
            }),
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
              pendingRewardFromLastSession: wsStatus.pendingRewardFromLastSession,
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
      this.companion = { ...this.companion, systemPrompt: sessionPrompt };
      console.log(
        `  ✅ Session prompt ready (${sessionPrompt.length} chars)`
      );
      this.isSpellingSession = !this.worksheetMode;
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
            questions: this.assignmentManifest.problems.map((problem, index) => ({
              index,
              text: problem.prompt,
              answerType: problem.gradingMode === "choice" ? "multiple_choice" : "numeric",
              correctAnswer: problem.canonicalAnswer,
              options:
                problem.gradingMode === "choice"
                  ? problem.overlayFields[0]?.options
                  : undefined,
            })),
          }
        : undefined,
    });
    if (this.worksheetSession && this.ctx) {
      this.ctx.availableToolNames = [...CANONICAL_AGENT_TOOL_KEYS];
    }
    console.log(
      `  📋 Session type: ${sessionType}, canvas owner: ${this.ctx.canvas.owner}`
    );

    this.send("session_started", {
      child: this.childName,
      childName: this.childName,
      companion: this.companion.name,
      companionName: this.companion.name,
      emoji: this.companion.emoji,
      voiceId: this.companion.voiceId,
      openingLine: this.companion.openingLine,
      goodbye: this.companion.goodbye,
    });
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

    this.ttsBridge = new WsTtsBridge(this.ws, this.companion.voiceId);
    await this.ttsBridge.prime();

    await this.connectDeepgram();

    await this.handleCompanionTurn(this.companion.openingLine);
  }

  /** Inject a transcript directly — used by test harness to bypass Deepgram */
  injectTranscript(text: string): void {
    this.handleEndOfTurn(text).catch(console.error);
  }

  private normalizeWorksheetSubmissionValue(text: string): string {
    return String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  private rememberWorksheetAcceptedTranscript(text: string): void {
    const normalizedValue = normalizeTranscriptForGuards(text);
    if (!normalizedValue) return;
    this.recentWorksheetAcceptedTranscript = {
      normalizedValue,
      expiresAt: Date.now() + 2500,
    };
  }

  private shouldIgnoreWorksheetCarryoverTranscript(text: string): boolean {
    if (!this.recentWorksheetAcceptedTranscript) return false;
    if (Date.now() > this.recentWorksheetAcceptedTranscript.expiresAt) {
      this.recentWorksheetAcceptedTranscript = null;
      return false;
    }
    const normalized = normalizeTranscriptForGuards(text);
    if (!normalized) return false;
    const previous = this.recentWorksheetAcceptedTranscript.normalizedValue;
    if (
      normalized === previous ||
      previous.includes(normalized) ||
      normalized.includes(previous) ||
      WORKSHEET_CARRYOVER_LEADERS.test(normalized)
    ) {
      console.log(`  🗑️  Worksheet carryover transcript ignored: "${text}"`);
      return true;
    }
    return false;
  }

  private shouldInterceptInstructionalGameCompletionClaim(
    transcript: string,
  ): boolean {
    return (
      this.pendingInstructionalGameCompletion != null &&
      INSTRUCTIONAL_GAME_COMPLETION_CLAIM.test(transcript)
    );
  }

  private async handleInstructionalGameCompletionClaim(): Promise<void> {
    const gameName = this.pendingInstructionalGameCompletion?.gameName ?? "the game";
    await this.handleCompanionTurn(
      `Tell me when ${gameName} shows that you're finished, and I'll count it. If it doesn't say complete yet, keep going and I can help.`,
    );
  }

  private rebuildWorksheetTruthMap(): void {
    this.worksheetTruthById.clear();
    const domain = detectWorksheetDomain(this.worksheetSubjectLabel);
    for (const p of this.worksheetProblems) {
      const t = buildTruthForCanonicalProblem(p, domain);
      if (!t) continue;
      this.worksheetTruthById.set(String(p.id), t);
      if (!t.usableForReveal) {
        console.warn(
          `  ⚠️  [worksheet-truth] problem ${p.id}: extracted amounts suspect for coin domain — reveal/store pool skip bad cents`,
        );
      }
    }
  }

  private buildWorksheetArcFirstFollowupContext(): string {
    const gameName = this.worksheetLearningArc?.gameName ?? "the game";
    const facts = formatTrustedAmountsSummaryForLearningArc(
      this.worksheetProblems,
      this.worksheetTruthById,
    );
    return (
      `[System: The instructional ${gameName.replace(/-/g, " ")} just ended. The canvas is idle. ` +
      `Ask a brief, warm follow-up: what was one money decision you made in the game? ` +
      `Trusted extracted cent amounts (if any):\n${facts}]`
    );
  }

  private buildWorksheetArcSecondFollowupContext(childTranscript: string): string {
    const facts = formatTrustedAmountsSummaryForLearningArc(
      this.worksheetProblems,
      this.worksheetTruthById,
    );
    return (
      `[System: The child said: "${childTranscript}". ` +
      `Ask one more short follow-up connecting the game to the worksheet's money ideas. ` +
      `Trusted amounts only:\n${facts}]`
    );
  }

  private getWorksheetInstructionalGameName(): string | null {
    const linkedGames = new Set<string>();
    for (const problem of this.assignmentManifest?.problems ?? []) {
      for (const game of problem.linkedGames) {
        linkedGames.add(game);
      }
    }
    if (
      /money|coin|count|compare/i.test(this.worksheetSubjectLabel) &&
      getTool("store-game")
    ) {
      return "store-game";
    }
    if (linkedGames.has("store-game") && getTool("store-game")) {
      return "store-game";
    }
    for (const candidate of linkedGames) {
      if (getTool(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private launchStructuredGame(
    gameName: string,
    type: "tool" | "reward",
  ): void {
    this.handleToolCall(
      "launchGame",
      { name: gameName, type },
      {
        ok: true,
        requestedName: gameName,
        canonicalName: gameName,
        type,
        availableGames:
          type === "tool"
            ? Object.keys(TEACHING_TOOLS)
            : Object.keys(REWARD_GAMES),
      },
    );
  }

  private async startWorksheetLearningArc(): Promise<boolean> {
    const gameName = this.getWorksheetInstructionalGameName();
    if (!gameName) {
      return false;
    }
    this.retireWorksheetSession();
    this.worksheetLearningArc = {
      gameName,
      phase: "instructional_game",
      followupRound: 0,
    };
    await this.handleCompanionTurn(
      `You got them all! Nice work. Now let's use that same money thinking in the ${gameName.replace(/-/g, " ")}.`,
    );
    this.launchStructuredGame(gameName, "tool");
    return true;
  }

  private async handleWorksheetLearningArcFollowup(
    transcript: string,
  ): Promise<boolean> {
    if (!this.worksheetLearningArc || this.worksheetLearningArc.phase !== "followup") {
      return false;
    }
    if (this.worksheetLearningArc.followupRound === 0) {
      await this.runCompanionResponse(
        this.buildWorksheetArcSecondFollowupContext(transcript),
      );
      this.worksheetLearningArc = {
        ...this.worksheetLearningArc,
        followupRound: 1,
      };
      return true;
    }
    if (this.worksheetLearningArc.followupRound === 1) {
      this.worksheetLearningArc = null;
      await this.handleCompanionTurn(
        "That was great thinking. You've earned your reward, so now it's time for Space Invaders.",
      );
      this.launchWorksheetCompletionReward();
      return true;
    }
    return false;
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

  private rememberWorksheetSubmission(problemId: string, value: string): void {
    const normalizedValue = this.normalizeWorksheetSubmissionValue(value);
    if (!normalizedValue) return;
    this.worksheetRecentSubmission = {
      problemId,
      normalizedValue,
      expiresAt: Date.now() + 2500,
    };
  }

  private isDuplicateWorksheetSubmission(problemId: string, value: string): boolean {
    if (!this.worksheetRecentSubmission) return false;
    if (Date.now() > this.worksheetRecentSubmission.expiresAt) {
      this.worksheetRecentSubmission = null;
      return false;
    }
    return (
      this.worksheetRecentSubmission.problemId === problemId &&
      this.worksheetRecentSubmission.normalizedValue ===
        this.normalizeWorksheetSubmissionValue(value)
    );
  }

  private matchesPendingOverlaySubmission(
    problemId: string,
    value: string,
  ): boolean {
    if (!this.worksheetPendingOverlaySubmission) return false;
    return (
      this.worksheetPendingOverlaySubmission.problemId === problemId &&
      this.worksheetPendingOverlaySubmission.normalizedValue ===
        this.normalizeWorksheetSubmissionValue(value)
    );
  }

  private retireWorksheetSession(): void {
    this.worksheetMode = false;
    this.worksheetReadyForAnswers = false;
    this.pendingWorksheetLog = null;
    this.worksheetTurnTranscript = "";
    this.worksheetBufferedTranscript = null;
    this.worksheetRecentSubmission = null;
    this.worksheetPendingOverlaySubmission = null;
    this.lastWorksheetTurnOutcome = null;
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
    if (!value || !this.assignmentManifest || !this.worksheetPlayerState) return;
    if (
      this.isDuplicateWorksheetSubmission(
        this.worksheetPlayerState.activeProblemId,
        value,
      )
    ) {
      this.lastWorksheetTurnOutcome = "blocked_stale";
      console.log("  🔁 worksheet_answer ignored — duplicate recent submission");
      return;
    }
    if (
      this.matchesPendingOverlaySubmission(
        this.worksheetPlayerState.activeProblemId,
        value,
      )
    ) {
      this.lastWorksheetTurnOutcome = "blocked_stale";
      console.log("  🔁 worksheet_answer ignored — duplicate pending overlay submission");
      return;
    }
    if (
      payload.problemId &&
      String(payload.problemId) !== this.worksheetPlayerState.activeProblemId
    ) {
      this.lastWorksheetTurnOutcome = "blocked_stale";
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
    this.worksheetPendingOverlaySubmission = {
      problemId: this.worksheetPlayerState.activeProblemId,
      normalizedValue: this.normalizeWorksheetSubmissionValue(value),
    };
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

    this.turnSM.onInterrupt();

    if (this.currentAbort) {
      this.currentAbort.abort();
      this.currentAbort = null;
    }

    if (this.ttsBridge) {
      this.ttsBridge.stop();
    }

    this.send("audio_done");
    // Reset canvas when child interrupts — any partial drawing is stale.
    this.currentCanvasState = null;
    this.send("canvas_draw", { mode: "idle" });
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
      console.warn("  ⚠️  Word Builder timeout — no activity in 90s; returning to IDLE");
      this.wbEndCleanup();
      this.turnSM.onWordBuilderEnd();
      this.send("canvas_draw", { mode: "idle" });
      this.send("game_message", { forward: { type: "clear" } });
    }, SessionManager.WB_ACTIVITY_MS);
  }

  private wbEndCleanup(): void {
    this.clearWbActivityTimeout();
    this.wbAwaitingSpell = false;
    this.wbActive = false;
    this.wbRound = 0;
    this.wbWord = "";
    this.wbLastProcessedRound = 0;
    this.wbPendingEvent = null;
    // keep legacy alias in sync for handleToolCall guard
    this.wordBuilderSessionActive = false;
    this.activeWordBuilderWord = "";
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
  handleGameEvent(event: Record<string, unknown>): void {
    const type = event.type as string;

    if (type === "ready") {
      if (this.pendingGameStart) {
        this.gameBridge.startGame(
          this.pendingGameStart.gameUrl,
          this.pendingGameStart.childName,
          this.pendingGameStart.config,
          this.pendingGameStart.companionName,
        );
        console.log(
          `  🎮 resend start after ready — ${this.ctx?.canvas.current.mode ?? "game"}`
        );
        this.pendingGameStart = null;
      }
      if (this.ctx) {
        this.ctx.markCanvasRendered(this.currentCanvasRevision);
        this.ctx.markGameReady(this.currentCanvasRevision);
        console.log(
          `  🖼️  Browser confirmed game ready for revision ${this.currentCanvasRevision} (${this.ctx.canvas.current.mode})`
        );
        this.broadcastContext();
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

      // Elli is mid-speech — buffer and handle when she returns to WORD_BUILDER
      if (state === "SPEAKING" || state === "PROCESSING" || state === "LOADING" || state === "CANVAS_PENDING") {
        console.log(`  🎮 round_complete buffered (state=${state})`);
        this.wbPendingEvent = event;
        return;
      }

      const er = Number(event.round);
      const completedRound =
        Number.isFinite(er) && er > 0 ? er : this.wbRound;

      if (completedRound <= this.wbLastProcessedRound) {
        return;
      }
      this.wbLastProcessedRound = completedRound;

      const attempts = Number(event.attempts) || 1;
      console.log(`  🎮 round_complete received — round ${completedRound} (wbRound ${this.wbRound})`);

      // Round 3: silent advance only
      if (completedRound === 3) {
        this.wbAdvanceRound();
        return;
      }

      // Round 4: silent handoff — iframe sends game_complete; one companion run
      // (WORD_BUILDER_SESSION_COMPLETE) speaks there (avoids merged TTS e.g. "NowYES").
      if (completedRound === 4) {
        return;
      }

      // Rounds 1 & 2: praise then advance
      if (completedRound === 1 || completedRound === 2) {
        void this.runCompanionResponse(
          WORD_BUILDER_ROUND_COMPLETE(completedRound, this.wbWord, attempts)
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

      if (state === "SPEAKING" || state === "PROCESSING" || state === "LOADING" || state === "CANVAS_PENDING") {
        console.log(`  🎮 round_failed buffered (state=${state})`);
        this.wbPendingEvent = event;
        return;
      }

      console.log(`  🎮 round_failed — round ${this.wbRound}`);

      void this.runCompanionResponse(WORD_BUILDER_ROUND_FAILED(this.wbRound, word))
        .then(() => this.wbAdvanceRound())
        .catch((err) => {
          console.error("  ❌ WB fail response failed:", err);
          this.wbAdvanceRound();
        });
      return;
    }

    if (type === "game_complete") {
      if (this.pendingInstructionalGameCompletion) {
        console.log(
          `  🎮 instructional game completed — ${this.pendingInstructionalGameCompletion.gameName}`
        );
        this.pendingInstructionalGameCompletion = null;
      }
      if (this.worksheetLearningArc?.phase === "instructional_game") {
        this.currentCanvasState = null;
        this.clearActiveCanvasActivity();
        this.send("canvas_draw", { mode: "idle" });
        if (this.ctx) {
          this.ctx.updateCanvas({
            mode: "idle",
            content: undefined,
            label: undefined,
            svg: undefined,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          this.broadcastContext();
        }
        this.worksheetLearningArc = {
          ...this.worksheetLearningArc,
          phase: "followup",
          followupRound: 0,
        };
        void this.runCompanionResponse(
          this.buildWorksheetArcFirstFollowupContext(),
        ).catch(console.error);
        return;
      }
      if (this.wbActive) {
        const completedWord = this.wbWord;
        // Keep wbActive / wordBuilderSessionActive until Elli logs the post-game spell attempt
        this.wbAwaitingSpell = true;
        this.turnSM.onWordBuilderEnd();
        this.clearActiveCanvasActivity();
        this.send("canvas_draw", { mode: "idle" });
        void this.runCompanionResponse(
          WORD_BUILDER_SESSION_COMPLETE(this.childName, completedWord)
        ).catch(console.error);
        return;
      }
      if (this.activeCanvasActivity.snapshot?.worksheet) {
        const snapshot = this.activeCanvasActivity.snapshot;
        void this.resumeWorksheetAfterInstructionalGame(snapshot).catch(console.error);
        return;
      }
      if (this.spaceInvadersRewardActive) {
        this.spaceInvadersRewardActive = false;
        this.suppressTranscripts = false;
        console.log("  🎮 reward game ended — transcript capture normal");
        this.gameBridge.handleGameEvent(event);
        if (this.endAfterReward) {
          this.endAfterReward = false;
          void this.end().catch(console.error);
        }
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
        `  🖼️  Browser confirmed canvas revision ${resolvedRevision} (${this.ctx.canvas.current.mode})`
      );
      this.broadcastContext();
    }
    this.turnSM.onCanvasDone();
  }

  playbackDone(): void {
    this.turnSM.onPlaybackComplete();
  }

  async end(): Promise<void> {
    if (this.pendingEndSessionReward && !this.spaceInvadersRewardLaunched) {
      this.pendingEndSessionReward = false;
      this.endAfterReward = true;
      this.launchWorksheetCompletionReward();
      return;
    }
    if (this.isEnding) return;
    this.isEnding = true;
    this.isSpellingSession = false;

    const ts = new Date().toISOString();
    console.log(`  🏁 [${ts}] Ending session for ${this.childName}`);

    if (this.clearSessionTimer) {
      this.clearSessionTimer();
      this.clearSessionTimer = null;
    }

    this.wbEndCleanup();
    this.spaceInvadersRewardActive = false;
    this.spaceInvadersRewardLaunched = false;
    this.endAfterReward = false;
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
    this.currentCanvasState = null;
    this.pendingGameStart = null;

    this.turnSM.onInterrupt();

    try {
      if (!shouldPersistSessionData()) {
        console.log("  🔇 Stateless run — skipping session recording and reward log.");
      } else {
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
    source: "eager" | "final"
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
    isReplay = false
  ): Promise<void> {
    if (!isReplay) {
      const now = Date.now();
      const normalized = transcript.toLowerCase().trim();
      if (
        normalized === this.lastTranscript &&
        now - this.lastTranscriptTime < 3000
      ) {
        console.log(
          `  ⚠️  Duplicate transcript suppressed: "${transcript}"`
        );
        return;
      }
      this.lastTranscript = normalized;
      this.lastTranscriptTime = now;
    }

    const state = this.turnSM.getState();

    if (
      state === "PROCESSING" ||
      state === "CANVAS_PENDING" ||
      state === "SPEAKING"
    ) {
      if (!this.shouldAcceptInterruptedTranscript(transcript)) return;
      console.log(`  🗑️  Ignoring transcript while assistant owns turn (${state}): "${transcript}"`);
      return;
    }

    if (this.shouldIgnoreWorksheetCarryoverTranscript(transcript)) {
      return;
    }
    // WORD_BUILDER: the child is filling in the game but can still speak.
    // Let the transcript fall through — runCompanionResponse uses onCompanionRunFromWordBuilder()
    // so the game stays visible while Elli responds verbally.

    if (this.worksheetAdvancing) {
      console.log(`  ⏳ Buffering transcript during worksheet advance: "${transcript}"`);
      this.worksheetBufferedTranscript = transcript;
      return;
    }

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

    if (this.worksheetMode) {
      this.worksheetTurnTranscript = transcript;
    }

    if (await this.tryConsumeWorksheetTurn(transcript)) {
      return;
    }

    if (this.shouldInterceptInstructionalGameCompletionClaim(transcript)) {
      await this.handleInstructionalGameCompletionClaim();
      return;
    }

    if (await this.handleWorksheetLearningArcFollowup(transcript)) {
      return;
    }

    let userMessage = transcript;

    if (this.worksheetMode && this.worksheetReadyForAnswers) {
      this.worksheetTurnsWithoutAttempt++;
      if (this.worksheetTurnsWithoutAttempt >= 5) {
        const wp = this.worksheetProblems[this.worksheetProblemIndex];
        if (wp) {
          console.log("  ⚠️  [worksheet] stuck guard — nudging model to evaluate answer");
          userMessage =
            `${transcript}\n\n[System: The child has been on problem ${wp.id} for several turns. ` +
            `If their last turn sounds like a real answer (even informal), call logWorksheetAttempt. ` +
            `If they repeated the question or only asked for clarification, do not log — give a short, kind hint and restate the question simply.]`;
          this.worksheetTurnsWithoutAttempt = 0;
        }
      }
    }
    if (
      this.isSpellingSession &&
      !this.worksheetMode &&
      this.activeWord &&
      isSpellingAttempt(transcript, this.activeWord)
    ) {
      const ev = this.evaluateSpelling(transcript, this.activeWord);
      console.log(
        `  🔤 Spelling eval: "${transcript}" vs "${this.activeWord}" → ` +
          `${ev.correct ? "✅" : "❌"} (${ev.note})`
      );
      userMessage =
        `[Spelling verdict: Ila said "${transcript}" for "${this.activeWord}" — ` +
        `${ev.correct ? "this is CORRECT, celebrate and move on" : "this is INCORRECT, encourage and give a hint"}]\n\n` +
        transcript;
    }

    if (this.suppressTranscripts) {
      console.log(
        "  🔇 Transcript suppressed — voice disabled"
      );
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
      this.transitionedToWork
    );

    try {
      // Window the history to reduce Claude's input size and improve TTFT.
      // Keep the last 10 messages (5 turns) — wide enough to retain active-word
      // context across barge-ins while keeping latency acceptable.
      const recentHistory = this.conversationHistory.length > 10
        ? this.conversationHistory.slice(-10)
        : this.conversationHistory;

      // Pin context messages at the front so they survive history truncation.
      const pins: ModelMessage[] = [];
      if (this.worksheetPageFile && (this.worksheetMode || isHomeworkMode())) {
        const isCoinWorksheet = /money|coin|count/i.test(this.worksheetSubjectLabel);
        const isReview = this.worksheetInteractionMode === "review";
        let imageCaption =
          "[Worksheet Image] This is the ACTUAL worksheet the child is working on. " +
          "Use what you SEE in this image as the source of truth for all amounts, values, and problem layout. " +
          "The extracted text descriptions may contain OCR errors — always verify against this image.";
        if (isReview) {
          imageCaption +=
            "\nREVIEW MODE: The child has already filled in answers on this worksheet. " +
            "The handwritten values in the boxes are the CHILD'S answers — they may contain mistakes. " +
            "Your job is to CHECK their work. For each problem, independently examine the actual items " +
            "(coins, objects, numbers) shown in the image, calculate the correct answer yourself, " +
            "and compare it to what the child wrote. Catch any errors the child made.";
        }
        if (isCoinWorksheet) {
          imageCaption +=
            "\nHANDWRITING WARNING: The child's handwritten '$0.' can look like '$1.' because the " +
            "decimal dot merges with the zero. If you read $1.xx from a handwritten box, the actual " +
            "value is $0.xx. This is an elementary coin-counting worksheet — all amounts come from " +
            "pennies, nickels, dimes, and quarters, so every value is under $1.00.";
          if (isReview) {
            imageCaption +=
              "\nTo verify each answer: count the individual coins visible in the image for each student. " +
              "Quarters=25¢, dimes=10¢, nickels=5¢, pennies=1¢. Add them up and compare to what the child wrote.";
          }
        }
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
      if (this.activeWordContext) {
        pins.push({ role: "user", content: this.activeWordContext });
      }
      const historyWithPin: typeof recentHistory =
        pins.length > 0 ? [...pins, ...recentHistory] : recentHistory;

      // Prepend canvas state context so the AI always knows what is currently
      // displayed — prevents duplicate showCanvas calls and enables intelligent
      // decisions about whether to update or hold the current display.
      const canvasCtx = this.ctx
        ? buildCanvasContextMessage(this.ctx)
        : this.currentCanvasState
          ? buildCanvasContext(this.currentCanvasState)
          : "";
      let truthCtx = "";
      if (
        this.worksheetMode &&
        this.worksheetProblems[this.worksheetProblemIndex]
      ) {
        const pid = String(this.worksheetProblems[this.worksheetProblemIndex].id);
        const truth = this.worksheetTruthById.get(pid);
        if (truth) {
          truthCtx = truth.toContextInjection();
        }
      }
      const messageWithContext = [userMessage, canvasCtx, truthCtx]
        .filter(Boolean)
        .join("\n\n");

      const finalTools = this.buildAgentToolkit();

      await runAgent({
        history: historyWithPin,
        userMessage: messageWithContext,
        profile: this.companion,
        tools: finalTools,
        onToken: (chunk) => {
          fullResponse += chunk;
          this.send("response_text", { chunk });
          console.log(`  📝 token(${chunk.length}): "${chunk.slice(0, 30).replace(/\n/g, "↵")}"`);
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
            if (toolName === "start_spell_check") toolName = "startSpellCheck";
            if (toolName === "launch_game") toolName = "launchGame";
            if (toolName === "log_worksheet_attempt")
              toolName = "logWorksheetAttempt";
            if (toolName === "get_session_status") toolName = "getSessionStatus";
            if (toolName === "get_next_problem") toolName = "getNextProblem";
            if (toolName === "submit_answer") toolName = "submitAnswer";
            if (toolName === "clear_canvas") toolName = "clearCanvas";
            if (toolName === "canvas_show") toolName = "canvasShow";
            if (toolName === "canvas_clear") toolName = "canvasClear";
            if (toolName === "canvas_status") toolName = "canvasStatus";
            if (toolName === "session_log") toolName = "sessionLog";
            if (toolName === "session_status") toolName = "sessionStatus";
            if (toolName === "session_end") toolName = "sessionEnd";
            let args = (tc.args ?? tc.input ?? {}) as Record<string, unknown>;
            const result = toolResults[i];
            const originalToolName = toolName;

            if (
              toolName === "showCanvas" &&
              this.turnSM.getState() === "WORD_BUILDER"
            ) {
              const c = String(args.content ?? "").trim();
              const isTeachingWord =
                args.mode === "teaching" &&
                c.length > 0 &&
                !/\s/.test(c) &&
                /[a-z]/i.test(c) &&
                !this.isTeachingMathCanvas(args);
              if (isTeachingWord) {
                console.warn(
                  "  ⚠️  showCanvas blocked — use blackboard after Word Builder"
                );
                toolName = "blackboard";
                args = { gesture: "reveal", word: c };
              }
            }

            this.handleToolCall(toolName, args, result);

            if (toolName === "canvasShow") {
              const ct = String(args.type ?? "");
              if (ct === "text" || ct === "svg") {
                const drawPayload =
                  ct === "text"
                    ? { mode: "teaching", content: args.content }
                    : {
                        mode: "teaching",
                        svg: args.svg,
                        label: args.label,
                      };
                this.send("canvas_draw", {
                  args: drawPayload as Record<string, unknown>,
                  result,
                });
                const st = this.turnSM.getState();
                if (st === "PROCESSING") {
                  this.turnSM.onShowCanvas();
                }
              }
            }

            if (
              toolName === "startWordBuilder" ||
              toolName === "startSpellCheck" ||
              toolName === "launchGame"
            ) {
              // Do not trigger CANVAS_PENDING — the iframe loads independently
              // and does not send canvas_done. State machine stays PROCESSING → SPEAKING.
            }

            if (originalToolName === "showCanvas" && toolName === "showCanvas") {
              if (this.turnSM.getState() === "WORD_BUILDER") {
                console.warn(
                  "  ⚠️  showCanvas blocked during Word Builder — iframe owns canvas"
                );
              } else {
                // If a new math problem is shown, any queued transcript belongs
                // to the previous prompt and should not be replayed/scored.
                if (this.isTeachingMathCanvas(args)) {
                  this.turnSM.clearPendingTranscript("new math problem shown");
                }

                const hasRenderableContent =
                  args.mode !== "place_value" || args.placeValueData != null;

                const drawPayload = { ...args } as Record<string, unknown>;
                stripSvgField(drawPayload);

                // Always send the draw event to the browser
                this.send("canvas_draw", { args: drawPayload, result });

                // Only gate TTS on canvas if there's actually something to render
                // and we're still in the processing phase
                const s = this.turnSM.getState();
                if (s === "PROCESSING" && hasRenderableContent) {
                  this.turnSM.onShowCanvas();
                }
              }
            }
          }
        },
      });

      this.turnSM.onAgentComplete();

      if (!fullResponse.trim()) {
        console.warn(
          "  ⚠️  runAgent completed with empty fullResponse — check onToken wiring"
        );
      }

      // In math mode every turn should log an answer — warn if tools were skipped entirely
      if (this.lastCanvasWasMath && this.toolCallsMadeThisTurn === 0) {
        console.warn(
          "  ⚠️  Math mode: agent completed with ZERO tool calls — canvas is out of sync"
        );
      }

      this.conversationHistory.push(
        { role: "user", content: userMessage },
        { role: "assistant", content: fullResponse }
      );

      if (checkAssistantGoodbye(fullResponse)) {
        this.pendingWorksheetLog = null;
        console.log("  👋 Companion said goodbye");
        await this.end();
        return;
      }

      if (this.ttsBridge) {
        await this.ttsBridge.finish();
      }
      this.send("audio_done");

      if (this.pendingWorksheetStart && !this.worksheetSession) {
        this.pendingWorksheetStart = false;
        this.worksheetAdvancing = true;
        await this.presentCurrentWorksheetProblem();
        this.worksheetAdvancing = false;
        await this.drainWorksheetBuffer();
      } else if (
        this.pendingWorksheetLog != null &&
        this.worksheetMode &&
        !this.worksheetSession
      ) {
        const pl = this.pendingWorksheetLog;
        this.pendingWorksheetLog = null;
        this.worksheetAdvancing = true;
        await this.advanceWorksheetAfterLogAttempt(pl.ok);
        this.worksheetAdvancing = false;
        await this.drainWorksheetBuffer();
      } else if (
        this.worksheetMode &&
        this.worksheetProblemIndex < this.worksheetProblems.length &&
        this.worksheetProblems[this.worksheetProblemIndex]
      ) {
        this.worksheetReadyForAnswers = true;
      }
    } catch (err: unknown) {
      this.pendingWorksheetLog = null;
      if (err instanceof Error && err.name === "AbortError") {
        console.log("  ⚡ Agent aborted (barge-in)");
        this.turnSM.onInterrupt();
        if (
          this.worksheetMode &&
          this.worksheetProblems[this.worksheetProblemIndex]
        ) {
          this.worksheetReadyForAnswers = true;
        }
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
          if (typeof obj.responseBody === "string" && obj.responseBody.includes("overloaded_error")) return true;
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
        // If the overload hit before the first worksheet problem was presented,
        // re-queue it so the canvas isn't permanently orphaned.
        if (this.pendingWorksheetStart && !this.worksheetSession) {
          console.log("  🔄 [worksheet] re-queuing pendingWorksheetStart after overload");
          this.pendingWorksheetStart = false;
          this.worksheetAdvancing = true;
          await this.presentCurrentWorksheetProblem().catch(console.error);
          this.worksheetAdvancing = false;
        } else if (
          this.worksheetMode &&
          this.worksheetProblems[this.worksheetProblemIndex]
        ) {
          this.worksheetReadyForAnswers = true;
        }
        return;
      }

      console.error("  🔴 Agent error:", message);
      this.send("error", { message: "Companion response failed" });
      if (
        this.worksheetMode &&
        this.worksheetProblems[this.worksheetProblemIndex]
      ) {
        this.worksheetReadyForAnswers = true;
      }
    } finally {
      this.currentAbort = null;
    }
  }

  private buildAgentToolkit(): Record<string, unknown> {
    const six = createSixTools({
      canvasShow: (a) => this.hostCanvasShow(a),
      canvasClear: () => this.hostCanvasClear(),
      canvasStatus: () => this.hostCanvasStatus(),
      sessionLog: (a) => this.hostSessionLog(a),
      sessionStatus: () => this.hostSessionStatus(),
      sessionEnd: (a) => this.hostSessionEnd(a),
    });
    if (this.worksheetSession && this.worksheetMode) {
      return {
        ...six,
        launchGame: createLaunchGameTool(this.worksheetSession),
        dateTime,
      };
    }
    return { ...six, launchGame, dateTime };
  }

  private async hostCanvasShow(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const type = String(args.type ?? "");
    if (type === "worksheet" && this.worksheetSession) {
      const pid = String(args.problemId ?? "");
      const res = this.worksheetSession.showProblemById(pid);
      return {
        rendered: res.ok === true,
        canvasShowing: "worksheet",
        ...res,
      };
    }
    if (type === "text") {
      return { rendered: true, canvasShowing: "text" };
    }
    if (type === "svg") {
      return { rendered: true, canvasShowing: "svg" };
    }
    if (type === "game") {
      return { rendered: true, canvasShowing: "game", name: args.name };
    }
    return { rendered: false, canvasShowing: "idle" };
  }

  private async hostCanvasClear(): Promise<{ canvasShowing: "idle"; ok?: boolean }> {
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
    if (this.worksheetSession) {
      const wp = this.worksheetProblems[this.worksheetProblemIndex];
      if (!wp) {
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
    return { logged: true };
  }

  private async hostSessionStatus(): Promise<Record<string, unknown>> {
    if (this.worksheetSession) {
      return { ...(this.worksheetSession.getSessionStatus() as object) } as Record<
        string,
        unknown
      >;
    }
    return { ...(this.ctx?.serialize() ?? { ok: true }) } as Record<string, unknown>;
  }

  private async hostSessionEnd(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return { ended: true, childName: args.childName };
  }

  private normalizeToolName(tool: string): string {
    if (tool === "start_spell_check") return "startSpellCheck";
    if (tool === "launch_game") return "launchGame";
    if (tool === "log_worksheet_attempt") return "logWorksheetAttempt";
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
    if (tool === "request_pause_for_check_in") return "requestPauseForCheckIn";
    if (tool === "request_resume_activity") return "requestResumeActivity";
    return tool;
  }

  private sendLaunchGameRegistryError(
    tool: string,
    args: Record<string, unknown>,
    gameName: string
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
      const normalized = normalizeWorksheetProblem(p);
      if (!normalized.ok) {
        console.warn(
          `  ⚠️  [worksheet] skipping problem ${String(p.id)}: ${normalized.reason}${normalized.detail ? ` (${normalized.detail})` : ""}`,
        );
        continue;
      }
      byId.set(p.id, normalized.problem);
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

  private async presentCurrentWorksheetProblem(): Promise<void> {
    if (this.worksheetSession) {
      console.log(
        "  ℹ️  [option-c] Skipping server-driven presentCurrentWorksheetProblem — Claude calls getNextProblem",
      );
      return;
    }
    const p = this.worksheetProblems[this.worksheetProblemIndex];
    if (!p) return;

    this.worksheetReadyForAnswers = false;
    this.worksheetWrongForCurrent = 0;
    this.worksheetTurnsWithoutAttempt = 0;
    this.worksheetTurnTranscript = "";
    this.worksheetPendingOverlaySubmission = null;
    this.lastWorksheetTurnOutcome = null;

    console.log(
      `  🎮 [worksheet] Problem ${this.worksheetProblemIndex + 1}/${this.worksheetProblems.length} (id ${p.id})`
    );
    console.log("📋 [worksheet] instructions (not spoken):", p.instructions);

    if (this.assignmentManifest) {
      this.worksheetPlayerState = resumeAssignmentProblem(this.assignmentManifest, {
        activeProblemId: String(p.id),
        currentPage: this.worksheetPlayerState?.currentPage ?? 1,
        activeFieldId: this.worksheetPlayerState?.activeFieldId,
        interactionMode: this.worksheetPlayerState?.interactionMode ?? this.worksheetInteractionMode,
      });
      const assignmentProblem = this.assignmentManifest.problems.find(
        (entry) => entry.problemId === String(p.id),
      );
      if (assignmentProblem && this.worksheetPlayerState) {
        const worksheetPdfDraw = this.withCanvasRevision({
          mode: "worksheet_pdf",
          content: p.question,
          pdfAssetUrl: this.assignmentManifest.pdfAssetUrl,
          pdfPage: assignmentProblem.page,
          pdfPageWidth:
            this.assignmentManifest.pages.find((page) => page.page === assignmentProblem.page)
              ?.width ?? 1000,
          pdfPageHeight:
            this.assignmentManifest.pages.find((page) => page.page === assignmentProblem.page)
              ?.height ?? 1400,
          activeProblemId: this.worksheetPlayerState.activeProblemId,
          activeFieldId: this.worksheetPlayerState.activeFieldId,
          overlayFields: this.worksheetPlayerState.overlayFields,
          interactionMode: this.worksheetPlayerState.interactionMode,
          problemAnswer: p.canonicalAnswer,
          problemHint: p.hint.trim() || undefined,
        });
        this.currentCanvasState = { ...worksheetPdfDraw };
        this.setActiveCanvasActivity("worksheet");
        this.activeWord = null;
        this.turnSM.setCanonicalProblem(null);
        if (this.ctx) {
          if (this.ctx.assignment) {
            this.ctx.assignment.currentIndex = this.worksheetProblemIndex;
          }
          this.ctx.updateCanvas({
            mode: "worksheet_pdf",
            content: p.question,
            pdfAssetUrl: this.assignmentManifest.pdfAssetUrl,
            pdfPage: assignmentProblem.page,
            pdfPageWidth:
              this.assignmentManifest.pages.find((page) => page.page === assignmentProblem.page)
                ?.width ?? 1000,
            pdfPageHeight:
              this.assignmentManifest.pages.find((page) => page.page === assignmentProblem.page)
                ?.height ?? 1400,
            activeProblemId: this.worksheetPlayerState.activeProblemId,
            activeFieldId: this.worksheetPlayerState.activeFieldId,
            overlayFields: this.worksheetPlayerState.overlayFields,
            interactionMode: this.worksheetPlayerState.interactionMode,
            problemAnswer: p.canonicalAnswer || undefined,
            problemHint: p.hint.trim() || undefined,
            sceneDescription: "The child sees the exact worksheet page with a server-owned answer box overlay.",
          });
          this.broadcastContext();
        }
        this.send("canvas_draw", worksheetPdfDraw);
        await this.handleCompanionTurn(p.question);
        this.worksheetReadyForAnswers = true;
        return;
      }
      console.warn(
        `  ⚠️  [worksheet] worksheet_pdf unavailable for problem ${String(p.id)} — falling back to svg because no matching assignment problem was found`,
      );
    }

    const canvasSource = toWorksheetCanvasSource(p);
    const rawDisplay = canvasSource.canvas_display.trim() || p.question;
    const structuredCanvas = deriveWorksheetCanvasModel(canvasSource);
    const description = structuredCanvas
      ? summarizeWorksheetCanvasModel(structuredCanvas)
      : rawDisplay;
    let svg = structuredCanvas
      ? renderWorksheetCanvasModelSvg(structuredCanvas)
      : null;
    if (svg) {
      svg = stripSvgFences(svg);
    }
    const args: Record<string, unknown> = {
      mode: "teaching",
      content: svg ? "" : description,
    };
    if (svg) {
      args.svg = svg;
    }

    this.wbEndCleanup();
    if (this.turnSM.getState() === "WORD_BUILDER") {
      this.turnSM.onWordBuilderEnd();
    }

    this.lastCanvasMode = "teaching";
    this.lastCanvasWasMath = this.isTeachingMathCanvas(args);
    this.currentCanvasState = { ...args };
    this.setActiveCanvasActivity("worksheet");
    this.activeWord = null;
    this.turnSM.setCanonicalProblem(null);

    if (this.ctx) {
      if (this.ctx.assignment) {
        this.ctx.assignment.currentIndex = this.worksheetProblemIndex;
      }
      this.ctx.updateCanvas({
        mode: "teaching",
        content: p.question,
        svg: svg ?? undefined,
        sceneDescription: description || undefined,
        problemAnswer: p.canonicalAnswer || undefined,
        problemHint: p.hint.trim() || undefined,
      });
      this.broadcastContext();
    }

    const previewSource = svg || description;
    const preview = previewSource.slice(0, 90);
    console.log(
      `  🖼️  [worksheet canvas] ${preview}${previewSource.length > 90 ? "…" : ""}`
    );
    const worksheetDraw = { ...args } as Record<string, unknown>;
    stripSvgField(worksheetDraw);
    this.send("canvas_draw", { args: worksheetDraw, result: worksheetDraw });

    await this.handleCompanionTurn(p.question);
    this.worksheetReadyForAnswers = true;
  }

  /**
   * Worksheet turn gate — swallows duplicate typed/spoken answers, clarification-only
   * turns (server re-anchor), or returns false so the transcript becomes the model turn.
   */
  private async tryConsumeWorksheetTurn(transcript: string): Promise<boolean> {
    if (this.worksheetSession) {
      return false;
    }
    if (
      !this.worksheetMode ||
      !this.worksheetReadyForAnswers ||
      this.worksheetProblemIndex >= this.worksheetProblems.length
    ) {
      return false;
    }
    const problem = this.worksheetProblems[this.worksheetProblemIndex];
    if (!problem) return false;

    const t = transcript.trim();
    if (!t) return false;

    const currentProblemId = String(problem.id ?? "");
    if (
      currentProblemId &&
      this.isDuplicateWorksheetSubmission(currentProblemId, t)
    ) {
      console.log("  🔁 worksheet transcript ignored — duplicate recent submission");
      return true;
    }
    if (
      currentProblemId &&
      this.matchesPendingOverlaySubmission(currentProblemId, t)
    ) {
      console.log(
        "  🔁 worksheet transcript ignored — matches pending typed overlay submission",
      );
      return true;
    }

    const worksheetCount = extractWorksheetTurnCount(t);
    /** "Which two girls?" — the word "two" is not a cent answer; don't skip clarification handling. */
    const numericAnswer =
      worksheetCount != null && !/\bwhich two\b/i.test(t);
    if (numericAnswer) {
      this.worksheetTurnTranscript = t;
      return false;
    }
    if (WORKSHEET_CLARIFICATION_PATTERNS.some((p) => p.test(t))) {
      const amountLine =
        problem.kind === "compare_amounts"
          ? `${problem.leftAmountCents}¢ and ${problem.rightAmountCents}¢`
          : `item ${problem.itemPriceCents}¢, total spent ${problem.totalSpentCents}¢`;
      const reanchor =
        `[Worksheet clarification] The child said: "${t}". ` +
        `Re-anchor warmly: we're still on this problem — ${amountLine} — ` +
        `then repeat the question in simple words: ${problem.question}`;
      console.log("  💬 [worksheet] clarification turn — server re-anchor (no model grading)");
      await this.handleCompanionTurn(reanchor);
      return true;
    }

    this.worksheetTurnTranscript = t;
    return false;
  }

  /**
   * Worksheet progression after Matilda calls logWorksheetAttempt (tool execute already logged to file).
   */
  private async advanceWorksheetAfterLogAttempt(ok: boolean): Promise<void> {
    if (this.worksheetSession) {
      console.log(
        "  ℹ️  [option-c] Skipping server-driven advance — Claude calls getNextProblem",
      );
      return;
    }
    const p = this.worksheetProblems[this.worksheetProblemIndex];
    if (!p) return;

    if (ok) {
      this.worksheetWrongForCurrent = 0;
      this.worksheetProblemIndex++;
      if (this.worksheetProblemIndex >= this.worksheetProblems.length) {
        if (await this.startWorksheetLearningArc()) {
          return;
        }
        await this.handleCompanionTurn("You got them all! Amazing work! We'll save your reward for the end of session.");
        this.pendingEndSessionReward = true;
        this.retireWorksheetSession();
        return;
      }
      await this.presentCurrentWorksheetProblem();
      return;
    }

    this.worksheetWrongForCurrent++;
    if (this.worksheetWrongForCurrent >= 3) {
      if (this.worksheetInteractionMode === "review") {
        this.worksheetWrongForCurrent = 0;
        const truth = this.worksheetTruthById.get(String(p.id));
        const revealFacts = truth?.getRevealFacts();
        if (revealFacts) {
          await this.runCompanionResponse(
            `[System: The child has struggled with this problem. ` +
            `Verified facts: correctAnswer="${revealFacts.correctAnswer}". Hint: ${revealFacts.hint}. ` +
            `Help them understand warmly — do not contradict these amounts with different cent values.]`,
          );
        } else {
          await this.runCompanionResponse(
            `[System: The child has struggled with this problem. ` +
            `Extracted cent values may be unreliable (OCR). Use the worksheet image; be honest if you cannot read a value clearly.]`,
          );
        }
        this.worksheetReadyForAnswers = true;
        return;
      }
      this.worksheetWrongForCurrent = 0;
      this.worksheetProblemIndex++;
      if (this.worksheetProblemIndex >= this.worksheetProblems.length) {
        if (await this.startWorksheetLearningArc()) {
          return;
        }
        await this.handleCompanionTurn("That's everything — great effort! We'll save your reward for the end of session.");
        this.pendingEndSessionReward = true;
        this.retireWorksheetSession();
        return;
      }
      await this.presentCurrentWorksheetProblem();
      return;
    }
  }

  private launchWorksheetCompletionReward(): void {
    if (this.spaceInvadersRewardLaunched) {
      return;
    }
    this.spaceInvadersRewardLaunched = true;
    this.spaceInvadersRewardActive = true;
    const inv = getReward("space-invaders");
    if (inv) {
      const rewardDraw = this.withCanvasRevision({
        mode: "space-invaders",
        gameUrl: inv.url,
        gamePlayerName: this.childName,
        gameCompanionName: this.companion.name,
        rewardGameConfig: { ...inv.defaultConfig },
      });
      this.send("canvas_draw", rewardDraw);
      this.currentCanvasState = { ...rewardDraw };
      this.pendingGameStart = {
        gameUrl: inv.url,
        childName: this.childName,
        companionName: this.companion.name,
        config: { ...inv.defaultConfig },
      };
      if (this.ctx) {
        this.ctx.updateCanvas({
          mode: "space-invaders",
          gameUrl: inv.url,
          gamePlayerName: this.childName,
          rewardGameConfig: { ...inv.defaultConfig },
          content: undefined,
          label: undefined,
          svg: undefined,
          sceneDescription: undefined,
          problemAnswer: undefined,
          problemHint: undefined,
        });
        this.broadcastContext();
      }
    }
    this.gameBridge.launchByName(
      "space-invaders",
      "reward",
      this.childName,
      undefined,
      this.companion.name,
    );
    console.log("  🎮 [worksheet] completion reward — space-invaders");
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

  private async drainWorksheetBuffer(): Promise<void> {
    if (this.worksheetBufferedTranscript) {
      const buffered = this.worksheetBufferedTranscript;
      this.worksheetBufferedTranscript = null;
      console.log(`  ▶️  Replaying buffered transcript: "${buffered}"`);
      await this.handleEndOfTurn(buffered, true);
    }
  }

  private broadcastContext(): void {
    if (this.ctx) {
      this.send("session_context", { ...this.ctx.serialize() } as Record<string, unknown>);
    }
  }

  private issueCanvasRevision(): number {
    this.currentCanvasRevision += 1;
    if (this.ctx) {
      this.ctx.markCanvasIssued(this.currentCanvasRevision);
    }
    return this.currentCanvasRevision;
  }

  private withCanvasRevision<T extends Record<string, unknown>>(payload: T): T & { canvasRevision: number } {
    return {
      ...payload,
      canvasRevision: this.issueCanvasRevision(),
    };
  }

  handleToolCall(
    tool: string,
    args: Record<string, unknown>,
    result: unknown
  ): void {
    tool = this.normalizeToolName(tool);

    let launchGameResolvedEntry: GameDefinition | null = null;
    let launchGameCanonicalName: string | null = null;
    let canvasRevision: number | undefined;

    if (tool === "blackboard") {
      const gesture = String(args.gesture ?? "");
      if (
        this.turnSM.getState() === "WORD_BUILDER" &&
        gesture !== "clear" &&
        gesture !== "reveal"
      ) {
        console.warn(
          "  ⚠️  blackboard blocked during Word Builder — only clear and reveal allowed"
        );
        return;
      }
    }

    if (tool === "startWordBuilder") {
      if (this.wordBuilderSessionActive) {
        console.warn(
          "  ⚠️  startWordBuilder blocked — Word Builder already active"
        );
        return;
      }
    }

    if (tool === "launchGame") {
      const sessionLaunch = unwrapToolResult(result) as
        | { ok?: boolean; error?: string }
        | undefined;
      if (this.worksheetSession && sessionLaunch && sessionLaunch.ok === false) {
        console.warn(
          `  ⚠️  launchGame: worksheet session rejected — ${sessionLaunch.error ?? "unknown"}`,
        );
        return;
      }
      const rawName = String(args.name ?? "").trim();
      const gt = args.type;
      if (gt !== "tool" && gt !== "reward") {
        console.warn("  ⚠️  launchGame: type must be \"tool\" or \"reward\"");
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
        console.warn(`  ⚠️  launchGame: missing live registry entry "${resolved.canonicalName}"`);
        this.sendLaunchGameRegistryError(tool, args, rawName);
        return;
      }
      if (
        resolved.canonicalName === "word-builder" ||
        resolved.canonicalName === "spell-check"
      ) {
        console.warn(
          `  ⚠️  launchGame: use startWordBuilder or startSpellCheck with a word for "${resolved.canonicalName}"`
        );
        return;
      }
      launchGameResolvedEntry = entry;
      launchGameCanonicalName = resolved.canonicalName;
    }

    if (tool === "showCanvas") {
      const c = args.content as string | undefined;
      if (c && c.includes(" ") && !this.isTeachingMathCanvas(args)) {
        console.warn(
          "  ⚠️  showCanvas rejected — content is not a word:",
          c
        );
        args.content = "";
      }
      stripSvgField(args);
      canvasRevision = this.issueCanvasRevision();
    }

    let logWorksheetWireResult: unknown | undefined;
    let logWorksheetAccepted:
      | false
      | { ok: boolean; effectiveChildSaid: string; wp: CanonicalWorksheetProblem } = false;

    if (tool === "logWorksheetAttempt") {
      const unwrappedForLog = unwrapToolResult(result);
      const base =
        typeof unwrappedForLog === "object" &&
        unwrappedForLog !== null &&
        !Array.isArray(unwrappedForLog)
          ? { ...(unwrappedForLog as Record<string, unknown>) }
          : {};
      if (this.worksheetSession) {
        console.log(
          "  ℹ️  [option-c] logWorksheetAttempt ignored — use submitAnswer tool instead",
        );
        logWorksheetWireResult = {
          ...base,
          logged: false,
          rejected: true,
          reason: "option_c_use_submitAnswer",
        };
      } else if (this.activeCanvasActivity.pauseState === "paused_for_checkin") {
        logWorksheetWireResult = {
          ...base,
          logged: false,
          rejected: true,
          reason: "paused_for_checkin",
        };
      } else if (!this.worksheetMode) {
        logWorksheetWireResult = {
          ...base,
          logged: false,
          rejected: true,
          reason: "not_in_worksheet_mode",
        };
      } else {
        const wp = this.worksheetProblems[this.worksheetProblemIndex];
        if (!wp) {
          logWorksheetWireResult = {
            ...base,
            logged: false,
            rejected: true,
            reason: "no_current_problem",
          };
        } else if ((args.childName as string | undefined) !== this.childName) {
          logWorksheetWireResult = {
            ...base,
            logged: false,
            rejected: true,
            reason: "childName_mismatch",
          };
        } else {
          const validation = validateLogWorksheetAttempt({
            modelChildSaid: String(args.childSaid ?? ""),
            actualTranscript: this.worksheetTurnTranscript,
            modelProblemId: String(args.problemId ?? ""),
            serverProblemId: String(wp.id),
          });
          if (!validation.valid) {
            console.warn(
              `  🚫 logWorksheetAttempt rejected: ${validation.reason}`,
            );
            const problemIdMismatch =
              typeof validation.reason === "string" &&
              validation.reason.includes("problemId mismatch");
            logWorksheetWireResult = {
              ...base,
              logged: false,
              rejected: true,
              reason: validation.reason,
              ...(problemIdMismatch
                ? {
                    serverCurrentProblemId: String(wp.id),
                    gentleHint:
                      "The screen is on a different row than the problemId you used. Reassure the child their thinking can still be right. Only log the active problem (id in canvas state). If they were answering an earlier row, acknowledge warmly and invite them to answer the problem showing now, or restate that row in plain language without logging the wrong id.",
                  }
                : {}),
            };
          } else {
            if (validation.warning) {
              console.warn(`  ⚠️  logWorksheetAttempt: ${validation.warning}`);
            }
            const effectiveChildSaid = validation.effectiveChildSaid;
            const na = classifyWorksheetNonAnswerTranscript(
              effectiveChildSaid,
              wp.question,
            );
            if (na.nonAnswer) {
              console.warn(
                `  🚫 logWorksheetAttempt rejected: ${na.reason} (transcript not treated as answer attempt)`,
              );
              logWorksheetWireResult = {
                ...base,
                logged: false,
                rejected: true,
                reason: na.reason,
              };
            } else {
              logWorksheetWireResult = {
                ...base,
                effectiveChildSaid,
              };
              logWorksheetAccepted = {
                ok: args.correct === true,
                effectiveChildSaid,
                wp,
              };
            }
          }
        }
      }
    }

    const wireToolResult = logWorksheetWireResult ?? result;

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
      if (
        this.worksheetMode &&
        this.worksheetProblems.length > 0 &&
        !this.worksheetSession
      ) {
        this.pendingWorksheetStart = true;
      }
    }

    if (tool === "startWordBuilder") {
      this.pendingGameStart = null;
      const word = String(args.word ?? "").toLowerCase().trim();
      if (word.length < 4) {
        console.warn("  ⚠️  startWordBuilder: word must be at least 4 letters");
        return;
      }
      // Server owns all round state from here
      this.wbWord = word;
      this.wbRound = 1;
      this.wbActive = true;
      this.wbLastProcessedRound = 0;
      this.wbPendingEvent = null;
      // Legacy aliases kept for the duplicate-call guard above
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
      return;
    }

    if (tool === "startSpellCheck") {
      this.pendingGameStart = null;
      const word = String(args.word ?? "").toLowerCase().trim();
      if (word.length < 2) {
        console.warn("  ⚠️  startSpellCheck: word must be at least 2 letters");
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
      return;
    }

    if (tool === "launchGame") {
      const gameName = launchGameCanonicalName ?? String(args.name ?? "")
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
          "  ❌ launchGame: invariant — missing resolved entry after validate"
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
        this.pendingInstructionalGameCompletion = null;
      } else {
        this.pendingInstructionalGameCompletion = {
          gameName,
        };
      }
      const revisedCanvasDraw = this.withCanvasRevision(canvasDraw);
      this.send("canvas_draw", revisedCanvasDraw);

      const launchConfig = { ...gameEntry.defaultConfig };

      // For store-game: override itemPool with amounts from the current worksheet
      // so the child practices with the exact values they just worked through.
      if (gameName === "store-game") {
        const domain = detectWorksheetDomainForGamePool(this.worksheetSubjectLabel);
        const allAmounts: number[] = [];
        for (const prob of this.worksheetProblems) {
          if (prob.kind === "compare_amounts") {
            allAmounts.push(prob.leftAmountCents, prob.rightAmountCents);
          } else if (prob.kind === "money_count") {
            if (prob.itemPriceCents > 0) allAmounts.push(prob.itemPriceCents);
            if (prob.totalSpentCents > 0) allAmounts.push(prob.totalSpentCents);
          }
        }
        const worksheetPool = buildSanitizedGamePool({
          domain,
          amounts: allAmounts,
        });
        if (worksheetPool.length > 0) {
          launchConfig.itemPool = worksheetPool;
          console.log(
            `  🎮 [store-game] sanitized worksheet itemPool: ` +
            worksheetPool.map((i) => `${i.emoji} ${i.name} ${i.price}¢`).join(", "),
          );
        } else {
          console.log(
            `  🎮 [store-game] no trusted worksheet amounts — using built-in item pool`,
          );
        }
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
          worksheetResumeSnapshot != null ? "worksheet_instructional_game" : undefined,
        snapshot: worksheetResumeSnapshot,
      });
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
      if (res?.ok && res?.canvasRendered && res.problemId && this.assignmentManifest && this.worksheetPlayerState) {
        const problemId = res.problemId;
        const problem = this.worksheetProblems.find((p) => String(p.id) === problemId);
        const idx = this.worksheetProblems.findIndex((p) => String(p.id) === problemId);
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
          this.worksheetPlayerState = resumeAssignmentProblem(this.assignmentManifest, {
            activeProblemId: problemId,
            currentPage: this.worksheetPlayerState.currentPage ?? 1,
            activeFieldId: this.worksheetPlayerState.activeFieldId,
            interactionMode:
              this.worksheetPlayerState.interactionMode ?? this.worksheetInteractionMode,
          });
          const worksheetPdfDraw = this.withCanvasRevision({
            mode: "worksheet_pdf",
            content: problem.question,
            pdfAssetUrl: this.assignmentManifest.pdfAssetUrl,
            pdfPage: assignmentProblem.page,
            pdfPageWidth:
              this.assignmentManifest.pages.find((pg) => pg.page === assignmentProblem.page)
                ?.width ?? 1000,
            pdfPageHeight:
              this.assignmentManifest.pages.find((pg) => pg.page === assignmentProblem.page)
                ?.height ?? 1400,
            activeProblemId: this.worksheetPlayerState.activeProblemId,
            activeFieldId: this.worksheetPlayerState.activeFieldId,
            overlayFields: this.worksheetPlayerState.overlayFields,
            interactionMode: this.worksheetPlayerState.interactionMode,
            problemAnswer: problem.canonicalAnswer,
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
                this.assignmentManifest.pages.find((page) => page.page === assignmentProblem.page)
                  ?.width ?? 1000,
              pdfPageHeight:
                this.assignmentManifest.pages.find((page) => page.page === assignmentProblem.page)
                  ?.height ?? 1400,
              activeProblemId: this.worksheetPlayerState.activeProblemId,
              activeFieldId: this.worksheetPlayerState.activeFieldId,
              overlayFields: this.worksheetPlayerState.overlayFields,
              interactionMode: this.worksheetPlayerState.interactionMode,
              problemAnswer: problem.canonicalAnswer || undefined,
              problemHint: problem.hint.trim() || undefined,
              sceneDescription:
                "The child sees the exact worksheet page with a server-owned answer box overlay.",
            });
            this.broadcastContext();
          }
          this.send("canvas_draw", worksheetPdfDraw);
          console.log(`  🖼️  [worksheet] Canvas rendered for problem ${problemId} (Option C)`);
        }
      }
      if (res?.ok) {
        this.worksheetReadyForAnswers = true;
      }
      return;
    }

    if (tool === "submitAnswer" || (tool === "sessionLog" && this.worksheetSession)) {
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
        const idx = this.worksheetProblems.findIndex((p) => String(p.id) === problemId);
        const correct = args.correct === true;
        if (idx >= 0) {
          this.worksheetProblemIndex = idx;
          if (this.ctx?.assignment) {
            this.ctx.assignment.currentIndex = idx;
          }
          this.processReward({ correct });
          this.recordWorksheetAttempt(String(args.childSaid ?? ""), correct);
          this.rememberWorksheetSubmission(problemId, String(args.childSaid ?? ""));
          if (correct) {
            this.rememberWorksheetAcceptedTranscript(String(args.childSaid ?? ""));
          }
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

    if (tool === "logAttempt") {
      this.processReward(args);

      // Update active word context pin for history injection
      const loggedWordKey = (args.word as string | undefined)?.toLowerCase().trim() ?? "";
      if (loggedWordKey) {
        const count = (this.wordAttemptCounts.get(loggedWordKey) ?? 0) + 1;
        this.wordAttemptCounts.set(loggedWordKey, count);
        const correct = args.correct === true;
        const lastAttempt = this.lastTranscript || "unknown";
        this.activeWordContext =
          `[Active word: "${loggedWordKey}". ` +
          `Attempts this word: ${count}. ` +
          `Last attempt: "${lastAttempt}" — ` +
          `${correct ? "correct" : "incorrect"}.]`;
        console.log(`  📌 activeWordContext: ${this.activeWordContext}`);
      }

      // Validate Elli's logAttempt references the active word on canvas
      if (this.companion.tracksActiveWord && this.activeWord) {
        const loggedWord = (args.word as string | undefined)?.toLowerCase().trim();
        const active = this.activeWord.toLowerCase().trim();
        if (loggedWord && loggedWord !== active) {
          console.warn(
            `  ⚠️  activeWord mismatch: canvas="${active}" logAttempt.word="${loggedWord}"`
          );
        }
      }

      if (
        loggedWordKey &&
        this.spellingHomeworkWordsByNorm.length > 0 &&
        !this.spaceInvadersRewardLaunched
      ) {
        const norm = loggedWordKey.toLowerCase().trim();
        if (this.spellingHomeworkWordsByNorm.includes(norm)) {
          this.spellingWordsWithAttempt.add(norm);
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
            this.childName
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

      if (
        this.wbAwaitingSpell &&
        loggedWordKey &&
        loggedWordKey === this.wbWord
      ) {
        this.wbAwaitingSpell = false;
        this.wbEndCleanup();
      }
    }

    if (tool === "logWorksheetAttempt") {
      if (!logWorksheetAccepted) {
        this.lastWorksheetTurnOutcome = "blocked_stale";
        return;
      }
      const { ok, effectiveChildSaid, wp } = logWorksheetAccepted;
      console.log(
        `  🎮 [worksheet] model graded — ${ok ? "correct" : "incorrect"} (childSaid: "${effectiveChildSaid}")`,
      );
      this.lastWorksheetTurnOutcome = ok
        ? "accepted_correct"
        : "accepted_incorrect";
      this.worksheetTurnsWithoutAttempt = 0;
      this.processReward({ correct: ok });
      this.recordWorksheetAttempt(effectiveChildSaid, ok);
      this.rememberWorksheetSubmission(String(wp.id), effectiveChildSaid);
      if (ok) {
        this.rememberWorksheetAcceptedTranscript(effectiveChildSaid);
      }
      if (shouldPersistSessionData()) {
        void appendWorksheetAttemptLine({
          childName: this.childName,
          problemId: String(wp.id),
          correct: ok,
        }).catch((e) =>
          console.warn(
            "  ⚠️  appendWorksheetAttemptLine failed:",
            e instanceof Error ? e.message : String(e),
          ),
        );
      }
      this.pendingWorksheetLog = { ok };
    }

    if (tool === "requestPauseForCheckIn") {
      void this.pauseActiveCanvasForCheckIn(
        String(args.reason ?? "checkin_request")
      ).catch(console.error);
      return;
    }

    if (tool === "requestResumeActivity") {
      if (args.childConfirmedReady === true) {
        void (async () => {
          // First try the formal resume path (only works if explicitly paused)
          const resumed = await this.resumeActiveCanvasActivity(false).catch(() => false);
          if (
            !resumed &&
            this.worksheetMode &&
            this.worksheetProblems[this.worksheetProblemIndex] &&
            !this.worksheetSession
          ) {
            // Activity was never formally paused (e.g. session interrupted by overload before
            // the first problem was ever presented) — present the current problem directly.
            console.log("  🔄 [worksheet] requestResumeActivity fallback — presenting current problem");
            this.worksheetAdvancing = true;
            await this.presentCurrentWorksheetProblem().catch(console.error);
            this.worksheetAdvancing = false;
          }
        })().catch(console.error);
      }
      return;
    }

    if (tool === "mathProblem" && args.childAnswer != null) {
      try {
        const raw = unwrapToolResult(result) as Record<string, unknown> | string | undefined;
        const output = typeof raw === "string" ? raw : (raw?.output as string | undefined) ?? raw;
        const parsed = typeof output === "string" ? JSON.parse(output) : output;
        const correct = (parsed as Record<string, unknown>)?.correct === true;
        this.processReward({ correct });
      } catch {
        console.error("  ⚠️  Could not parse mathProblem result for reward");
      }
    }

    if (tool === "canvasShow") {
      const ct = String(args.type ?? "");
      if (ct === "text" || ct === "svg") {
        this.pendingGameStart = null;
        this.currentCanvasState = {
          mode: "teaching",
          content: args.content as string | undefined,
          svg: args.svg as string | undefined,
          label: args.label as string | undefined,
        };
        if (this.ctx) {
          this.ctx.updateCanvas({
            mode: "teaching",
            content: args.content as string | undefined,
            svg: args.svg as string | undefined,
            label: args.label as string | undefined,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          this.broadcastContext();
        }
        this.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=${ct}`);
      }
    }

    if (tool === "showCanvas") {
      this.pendingGameStart = null;
      if (String(args.mode ?? "") !== "word-builder") {
        this.wbEndCleanup();
        if (this.turnSM.getState() === "WORD_BUILDER") {
          this.turnSM.onWordBuilderEnd();
        }
        console.log("  🎮 Word Builder cleared by canvas switch");
      }
      this.lastCanvasMode = (args.mode as string) ?? "idle";
      this.lastCanvasWasMath = this.isTeachingMathCanvas(args);
      // Track the authoritative canvas state so the AI knows what's on screen.
      this.currentCanvasState = { ...args };
      if (this.ctx) {
        this.ctx.updateCanvas({
          mode: (args.mode as any) ?? "idle",
          svg: args.svg as string | undefined,
          label: args.label as string | undefined,
          content: args.content as string | undefined,
          sceneDescription: undefined,
          problemAnswer: undefined,
          problemHint: undefined,
        });
      }
      this.clearActiveCanvasActivity();
      console.log(`  🖼️  [canvas] mode=${args.mode}, content=${args.content ?? "(none)"}`);

      // ── Reina: server-canonical problem announcement ──────────────────────
      // When a math teaching canvas fires, convert the problem to speech and
      // store it on the state machine. It will be appended to the TTS buffer
      // in onCanvasDone() — AFTER the canvas animation — so the spoken problem
      // is always derived from the canvas content, never from Claude's tokens.
      if (this.companion.usesCanonicalMathProblem && this.lastCanvasWasMath) {
        const spoken = this.mathContentToSpoken(args.content as string);
        this.turnSM.setCanonicalProblem(spoken);
        console.log(`  📐 Canonical problem set: "${spoken}"`);
      } else {
        this.turnSM.setCanonicalProblem(null);
      }

      // ── Ila: track the active word, validate phonemeBoxes, count re-shows ──
      if (this.companion.tracksActiveWord && this.isWordTeachingCanvas(args)) {
        const word = (args.content as string | undefined)?.trim() ?? null;
        this.activeWord = word;
        if (word) console.log(`  📝 Active word set: "${word}"`);

        // Validate phonemeBoxes — empty value strings leave blank tiles on screen
        const boxes = args.phonemeBoxes as Array<{ position: string; value: string; highlighted: boolean }> | undefined;
        if (boxes) {
          const emptyBoxes = boxes.filter((b) => b.value === "" || b.value == null);
          if (emptyBoxes.length > 0) {
            const positions = emptyBoxes.map((b) => b.position).join(", ");
            console.warn(
              `  ⚠️  phonemeBoxes with empty value for word "${word ?? "?"}": [${positions}] — boxes will appear blank on screen`
            );
          }
        }
      } else if (this.companion.tracksActiveWord) {
        this.activeWord = null;
      }

      const r = (result ?? args) as {
        svg?: string;
        label?: string;
        mode?: string;
        lottieData?: Record<string, unknown>;
      };
      if (r?.mode === "reward" || r?.mode === "championship") {
        const { takeover_ms } = getRewardDurations(this.childName);
        const rewardSvg =
          typeof r?.svg === "string" ? stripSvgFences(r.svg) : r?.svg;
        this.send("reward", {
          rewardStyle: "takeover",
          svg: rewardSvg,
          label: r?.label,
          lottieData: r?.lottieData,
          displayDuration_ms: takeover_ms,
        });
        this.logRewardEvent("takeover", takeover_ms);
      }

      if (this.ctx) this.broadcastContext();
    }
  }

  private evaluateSpelling(
    transcript: string,
    targetWord: string
  ): { correct: boolean; note: string } {
    const raw = transcript.toLowerCase().replace(/[^a-z]/g, "").trim();
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
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
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
