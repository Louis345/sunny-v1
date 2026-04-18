import { determineScaffoldLevel } from "../algorithms/retrievalPractice";
import type { Domain, ScaffoldLevel } from "../algorithms/types";
import { getSessionTypeConfig } from "./session-type-registry";
import { REWARD_GAMES, TEACHING_TOOLS } from "./games/registry";
import type { OverlayField, WorksheetInteractionMode } from "./assignment-player";
import {
  getSessionDifficultySignal,
  getSessionRewardState,
  type SessionPlan,
} from "../engine/learningEngine";
import { readLearningProfile } from "../utils/learningProfileIO";
import { getReadingCanvasPreferences } from "../shared/readingCanvasPreferences";

export type SessionType =
  | "freeform"
  | "worksheet"
  | "spelling"
  | "wordle"
  | "game"
  | "reading"
  | "clocks"
  | "math"
  | "homework"
  | "pronunciation"
  | "wilson"
  | "diag";
export type CanvasOwner = "server" | "companion";
export type ActivityMode =
  | "none"
  | "worksheet"
  | "word-builder"
  | "spell-check"
  | "reward-game";
export type ActivityPauseState = "active" | "paused_for_checkin" | "resuming";

export interface CanvasState {
  mode:
    | "idle"
    | "teaching"
    | "worksheet_pdf"
    | "reward"
    | "riddle"
    | "championship"
    | "karaoke"
    | "sound_box"
    | "clock"
    | "score_meter"
    | keyof typeof TEACHING_TOOLS
    | keyof typeof REWARD_GAMES;
  svg?: string;
  label?: string;
  content?: string;
  gameUrl?: string;
  gameWord?: string;
  gamePlayerName?: string;
  rewardGameConfig?: Record<string, unknown>;
  phonemeBoxes?: { position: string; value: string; highlighted: boolean }[];
  /** Plain-text description of the visual scene the child sees (e.g. "Cookie shop. Oatmeal 10¢, Chocolate chip 15¢, Sugar 10¢.") */
  sceneDescription?: string;
  /** The correct answer for the current problem — so the companion knows what to grade toward. */
  problemAnswer?: string;
  /** A hint to offer when the child is stuck. */
  problemHint?: string;
  pdfAssetUrl?: string;
  pdfPage?: number;
  pdfPageWidth?: number;
  pdfPageHeight?: number;
  activeProblemId?: string;
  activeFieldId?: string;
  overlayFields?: OverlayField[];
  interactionMode?: WorksheetInteractionMode;
}

export interface AssignmentQuestion {
  index: number;
  text: string;
  answerType: "multiple_choice" | "open" | "numeric" | "syllable_division";
  options?: string[];
  correctAnswer?: string;
}

export interface AssignmentManifest {
  childName: string;
  title: string;
  questions: AssignmentQuestion[];
  source: string;
  createdAt: string;
}

export interface AttemptRecord {
  questionIndex: number;
  answer: string;
  correct: boolean;
  timestamp: string;
}

export interface SessionContext {
  childName: string;
  companionName: string;
  sessionType: SessionType;

  canvas: {
    owner: CanvasOwner;
    current: CanvasState;
    locked: boolean;
    revision: number;
    browserRevision: number;
    browserVisible: boolean;
    gameReadyRevision: number;
  };

  assignment?: {
    questions: AssignmentQuestion[];
    currentIndex: number;
    attempts: AttemptRecord[];
  };

  correctStreak: number;
  sessionPhase: string;
  roundNumber: number;
  availableToolNames: string[];
  activity: {
    mode: ActivityMode;
    pauseState: ActivityPauseState;
    hidden: boolean;
    reason?: string;
  };

  updateCanvas: (state: Partial<CanvasState>) => void;
  markCanvasIssued: (revision: number) => void;
  markCanvasRendered: (revision: number) => void;
  markGameReady: (revision: number) => void;
  updateActivity: (
    state: Partial<SessionContext["activity"]>
  ) => void;
  /** Karaoke / reading mode — browser sends reading_progress; cleared when leaving reading. */
  readingProgress: ReadingProgressSnapshot | null;
  setReadingProgress: (p: ReadingProgressSnapshot | null) => void;
  serialize: () => SerializedSessionContext;
  /** Spelling plan from learning engine — injected each turn in canvas context (not cached in system prompt). */
  enginePlan?: SessionPlan;
}

export interface ReadingProgressSnapshot {
  wordIndex: number;
  totalWords: number;
  accuracy: number;
  /** Karaoke phrase restarts (interim shrank) — struggle signal, separate from accuracy. */
  hesitations: number;
  flaggedWords: string[];
  /** Words skipped by tap — recorded, not penalized. */
  skippedWords?: string[];
  /** Words successfully matched in order during karaoke (browser-driven). */
  spelledWords?: string[];
  event?: string;
}

/** Per-word retrieval scaffold state for the active spelling session (session-manager owned). */
export interface WordScaffoldSessionState {
  word: string;
  domain: Domain;
  lastCorrect: boolean | null;
  lastScaffoldLevel: ScaffoldLevel;
  attemptCount: number;
}

export interface SessionContextMessageExtras {
  turnState?: string;
  lastChildUtterance?: string | null;
  wordBuilderRound?: number | null;
  activeWord?: string | null;
  wordScaffoldState?: Map<string, WordScaffoldSessionState>;
}

export interface SerializedSessionContext {
  childName: string;
  sessionType: SessionType;
  canvasOwner: CanvasOwner;
  canvasState: CanvasState;
  correctStreak: number;
  sessionPhase: string;
  roundNumber: number;
  activityMode: ActivityMode;
  activityPauseState: ActivityPauseState;
  activityHidden: boolean;
  activityReason?: string;
  canvasRevision: number;
  browserRevision: number;
  browserVisible: boolean;
  gameReadyRevision: number;
  /** True when browser has confirmed the current canvas revision. */
  canvasReady: boolean;
  readingProgress: ReadingProgressSnapshot | null;
  assignmentProgress?: { currentIndex: number; total: number; completed: number };
}

export function createSessionContext(opts: {
  childName: string;
  sessionType: SessionType;
  companionName?: string;
  assignment?: AssignmentManifest;
  /** When set, overrides registry canvas ownership (e.g. tests). */
  canvasOwner?: CanvasOwner;
  /** When set, overrides registry tool list (e.g. tests). */
  availableToolNames?: string[];
}): SessionContext {
  const config = getSessionTypeConfig(opts.sessionType);
  const canvasOwner = opts.canvasOwner ?? config.canvasOwner;
  const availableToolNames = opts.availableToolNames ?? Object.keys(config.tools);

  const canvas: SessionContext["canvas"] = {
    owner: canvasOwner,
    current: { mode: "idle" },
    locked: canvasOwner === "server",
    revision: 0,
    browserRevision: 0,
    browserVisible: false,
    gameReadyRevision: 0,
  };

  const ctx: SessionContext = {
    childName: opts.childName,
    companionName:
      opts.companionName ??
      (opts.childName === "Ila"
        ? "Elli"
        : opts.childName === "creator"
          ? "Charlotte"
          : "Matilda"),
    sessionType: opts.sessionType,
    canvas,
    correctStreak: 0,
    sessionPhase: "warmup",
    roundNumber: 0,
    availableToolNames,
    activity: {
      mode: "none",
      pauseState: "active",
      hidden: false,
    },
    readingProgress: null as ReadingProgressSnapshot | null,

    setReadingProgress(p: ReadingProgressSnapshot | null): void {
      this.readingProgress = p;
    },

    updateCanvas(state: Partial<CanvasState>): void {
      this.canvas.current = { ...this.canvas.current, ...state };
    },

    markCanvasIssued(revision: number): void {
      this.canvas.revision = revision;
      this.canvas.browserVisible = false;
      this.canvas.gameReadyRevision = 0;
    },

    markCanvasRendered(revision: number): void {
      if (revision !== this.canvas.revision) return;
      this.canvas.browserRevision = revision;
      this.canvas.browserVisible = true;
    },

    markGameReady(revision: number): void {
      if (revision !== this.canvas.revision) return;
      this.canvas.gameReadyRevision = revision;
    },

    updateActivity(state: Partial<SessionContext["activity"]>): void {
      this.activity = { ...this.activity, ...state };
    },

    serialize(): SerializedSessionContext {
      const canvasReady =
        this.canvas.revision > 0 &&
        this.canvas.browserVisible &&
        this.canvas.browserRevision === this.canvas.revision;
      return {
        childName: this.childName,
        sessionType: this.sessionType,
        canvasOwner: this.canvas.owner,
        canvasState: this.canvas.current,
        correctStreak: this.correctStreak,
        sessionPhase: this.sessionPhase,
        roundNumber: this.roundNumber,
        activityMode: this.activity.mode,
        activityPauseState: this.activity.pauseState,
        activityHidden: this.activity.hidden,
        activityReason: this.activity.reason,
        canvasRevision: this.canvas.revision,
        browserRevision: this.canvas.browserRevision,
        browserVisible: this.canvas.browserVisible,
        gameReadyRevision: this.canvas.gameReadyRevision,
        canvasReady,
        readingProgress: this.readingProgress,
        assignmentProgress: this.assignment
          ? {
              currentIndex: this.assignment.currentIndex,
              total: this.assignment.questions.length,
              completed: this.assignment.attempts.filter((a) => a.correct).length,
            }
          : undefined,
      };
    },
  };

  if (opts.assignment) {
    ctx.assignment = {
      questions: opts.assignment.questions,
      currentIndex: 0,
      attempts: [],
    };
  }

  return ctx;
}

/** Per-turn injections below: first line of each function gates diagnostic sessions. */

export function getSessionPhaseBlock(ctx: SessionContext): string {
  if (ctx.sessionType === "diag") return "";
  return `[Session Phase] ${ctx.sessionPhase}`;
}

export function getWordBankBlock(ctx: SessionContext): string {
  if (ctx.sessionType === "diag") return "";
  return "";
}

export function getSLPBlock(ctx: SessionContext): string {
  if (ctx.sessionType === "diag") return "";
  return "";
}

export function getLearningStateBlock(ctx: SessionContext): string {
  if (ctx.sessionType === "diag") return "";
  console.log("[learning-state] injecting into context message");
  const childId = ctx.childName.toLowerCase();
  const diffSignal = getSessionDifficultySignal(childId);
  const rewardState = getSessionRewardState(childId);
  const lines: string[] = [];
  lines.push(`[Learning State]`);
  lines.push(`Difficulty zone: ${diffSignal?.zone ?? "optimal"}`);
  lines.push(
    diffSignal
      ? `Session accuracy (recent window): ${Math.round(diffSignal.currentAccuracy * 100)}%`
      : `Session accuracy (recent window): n/a (no attempts yet)`,
  );
  if (rewardState) {
    lines.push(`Current streak: ${rewardState.correctStreak}`);
  }
  return lines.join("\n");
}

export function getWilsonBlock(ctx: SessionContext): string {
  if (ctx.sessionType === "diag") return "";
  const childId = ctx.childName.toLowerCase();
  let wilsonStep: number;
  let moodAdjustment: boolean;
  if (ctx.enginePlan) {
    wilsonStep = ctx.enginePlan.wilsonStep;
    moodAdjustment = ctx.enginePlan.moodAdjustment;
  } else {
    const prof = readLearningProfile(childId);
    wilsonStep =
      prof?.sessionStats?.currentWilsonStep ?? (childId === "ila" ? 4 : 1);
    moodAdjustment = prof?.moodAdjustment ?? false;
  }
  return [
    `Current Wilson step: ${wilsonStep}`,
    `Mood adjustment active: ${moodAdjustment ? "yes" : "no"}`,
  ].join("\n");
}

export function getReadingProfileBlock(ctx: SessionContext): string {
  if (ctx.sessionType === "diag") return "";
  const childId = ctx.childName.toLowerCase();
  const profReading = readLearningProfile(childId);
  const rc = getReadingCanvasPreferences(profReading?.readingProfile);
  const lines: string[] = [`[Reading Profile]`];
  lines.push(`fontSize: ${rc.fontSize}`);
  lines.push(`wordsPerLine: ${rc.wordsPerLine}`);
  lines.push(`dyslexiaMode: ${rc.dyslexiaMode}`);
  lines.push(`background: ${rc.background}`);
  return lines.join("\n");
}

export function getFocusWordsBlock(ctx: SessionContext): string {
  if (ctx.sessionType === "diag") return "";
  const st = ctx.sessionType;

  if (st === "reading") {
    const lines: string[] = [];
    lines.push(`[Reading Mode]`);
    lines.push(
      `Do not run spelling drills. Do not launch Word Builder for spelling. Follow the reading session flow exactly:`,
    );
    lines.push(`Phase 1: sound_box for target words`);
    lines.push(`Phase 2: ask child what to read about`);
    lines.push(`Phase 3: generate story → canvasShow karaoke`);
    lines.push(`Phase 4: child reads aloud`);
    lines.push(`Phase 5: comprehension questions`);
    if (ctx.enginePlan) {
      const p = ctx.enginePlan;
      const review =
        p.reviewWords.length > 0 ? p.reviewWords.join(", ") : "none";
      const novel = p.newWords.length > 0 ? p.newWords.join(", ") : "none";
      const storyPool =
        p.focusWords.length > 0 ? p.focusWords.join(", ") : "none";
      lines.push(`[Today's Focus Words]`);
      lines.push(
        `Reading-domain vocabulary from the word bank (spaced repetition). Weave 3–5 of these into karaoke stories when they fit the child's topic — invisibly for SR; never present them as a spelling list.`,
      );
      lines.push(`Review words (due today): ${review}`);
      lines.push(`New words (introducing today): ${novel}`);
      lines.push(`Story emphasis pool (prefer when natural): ${storyPool}`);
    }
    return lines.join("\n");
  }

  if (!ctx.enginePlan) return "";
  if (st === "spelling" || st === "homework") {
    const lines: string[] = [];
    const p = ctx.enginePlan;
    const review =
      p.reviewWords.length > 0 ? p.reviewWords.join(", ") : "none";
    const novel = p.newWords.length > 0 ? p.newWords.join(", ") : "none";
    const focus =
      p.focusWords.length > 0 ? p.focusWords.join(", ") : "none";
    const total = p.focusWords.length;
    lines.push(`[Today's Focus Words]`);
    lines.push(
      `Primary session list (SM-2 schedule — new first, then reviews). Work through ONLY this list in order — not the full homework extraction.`,
    );
    lines.push(`Focus order: ${focus}`);
    lines.push(`Review words (due today): ${review}`);
    lines.push(`New words (introducing today): ${novel}`);
    lines.push(
      `Total scheduled: ${total} words. Quality over quantity. When these are done the session academic goals are complete.`,
    );
    if (p.sessionRecommendation && total === 0) {
      lines.push(
        `No spelling items scheduled — consider shifting toward ${p.sessionRecommendation} or another light activity.`,
      );
    }
    return lines.join("\n");
  }
  return "";
}

/** Minimal per-turn canvas snapshot for creator diagnostic sessions — no learning engine or child-session fields. */
function buildDiagCanvasContextMessage(
  ctx: SessionContext,
  extras?: SessionContextMessageExtras,
): string {
  const lines: string[] = [];
  const c = ctx.canvas.current;
  const snap = ctx.serialize();

  lines.push("[Diagnostic session — canvas snapshot]");
  lines.push(`Mode: ${c.mode}`);
  lines.push(
    `Canvas ready (browser confirmed current revision): ${snap.canvasReady ? "yes" : "no"}`,
  );
  if (extras?.turnState) {
    lines.push(`Turn state (server): ${extras.turnState}`);
  }
  lines.push(`Active activity: ${ctx.activity.mode}`);

  if (ctx.readingProgress) {
    const rp = ctx.readingProgress;
    const accPct =
      rp.accuracy <= 1 && rp.accuracy >= 0
        ? Math.round(rp.accuracy * 100)
        : Math.round(rp.accuracy);
    lines.push(
      `[Reading progress] wordIndex ${rp.wordIndex}/${rp.totalWords} (browser-driven; do not refresh karaoke).`,
    );
    lines.push(
      `Accuracy ${accPct}% (progress through story), hesitations: ${rp.hesitations}, flagged: ${rp.flaggedWords.join(", ") || "none"}, spelled: ${(rp.spelledWords ?? []).length} words`,
    );
    if (rp.event) lines.push(`Reading event: ${rp.event}`);
  }

  if (c.mode === "karaoke" && c.content) {
    lines.push(
      "Karaoke story is already on screen; highlighting follows Jamal's speech.",
    );
  } else if (c.content) {
    const t = String(c.content);
    lines.push(
      `On-screen text: ${t.slice(0, 200)}${t.length > 200 ? "…" : ""}`,
    );
  }
  if (c.label && c.mode === "karaoke") {
    lines.push(`Line / label: ${c.label}`);
  }

  lines.push(
    `Canvas control: ${ctx.canvas.owner === "server" ? "server-driven" : "companion-driven"}`,
  );

  if (ctx.availableToolNames.includes("launchGame")) {
    lines.push(
      `Available teaching games: ${Object.keys(TEACHING_TOOLS).sort().join(", ")}`,
    );
    lines.push(
      `Available reward games: ${Object.keys(REWARD_GAMES).sort().join(", ")}`,
    );
  }

  return lines.join("\n");
}

export function getScaffoldBlock(
  activeWord: string | null | undefined,
  scaffoldMap: Map<string, WordScaffoldSessionState>,
): string {
  if (!activeWord || scaffoldMap.size === 0) return "";
  const state = scaffoldMap.get(activeWord);
  if (!state || state.lastCorrect !== false) return "";
  const result = determineScaffoldLevel({
    track: null as unknown as import("../algorithms/types").SM2Track,
    isNewWord: false,
    previousAttemptThisSession: {
      correct: false,
      scaffoldLevel: state.lastScaffoldLevel,
    },
  });
  if (result.scaffoldLevel === 0) return "";
  return (
    `[Scaffold Recommendation]\n` +
    `Active word: ${activeWord}\n` +
    `Recommend scaffold level ${result.scaffoldLevel}: ${result.scaffoldType}\n` +
    (result.canvasMode !== "none"
      ? `Show canvasShow type=${result.canvasMode} before re-testing.`
      : "Give a phonemic hint verbally.")
  );
}

/**
 * Build a context injection string that tells Claude what's on the canvas.
 * Appended to the user message on every turn so Claude stays in sync.
 *
 * This is THE hook that keeps the companion aware of what the child sees.
 * Every canvas-relevant field (scene, answer, hint) must flow through here.
 */
export function buildCanvasContextMessage(
  ctx: SessionContext,
  extras?: SessionContextMessageExtras,
): string {
  if (ctx.sessionType === "diag") {
    return buildDiagCanvasContextMessage(ctx, extras);
  }

  const lines: string[] = [];
  const c = ctx.canvas.current;
  const activityPaused = ctx.activity.pauseState === "paused_for_checkin";
  const snap = ctx.serialize();

  lines.push("[Canvas State]");
  lines.push(`Mode: ${c.mode}`);
  lines.push(`Canvas ready (browser confirmed current revision): ${snap.canvasReady ? "yes" : "no"}`);
  if (extras?.turnState) {
    lines.push(`Turn state (server): ${extras.turnState}`);
  }
  if (extras?.activeWord != null && extras.activeWord !== "") {
    lines.push(`Active word (session): ${extras.activeWord}`);
  }
  if (extras?.wordBuilderRound != null && extras.wordBuilderRound > 0) {
    lines.push(`Word Builder round: ${extras.wordBuilderRound}`);
  }
  if (extras?.lastChildUtterance != null && extras.lastChildUtterance.trim() !== "") {
    lines.push(`Last child utterance: ${extras.lastChildUtterance.trim()}`);
  }
  lines.push(`Active activity: ${ctx.activity.mode}`);
  lines.push(`Activity pause state: ${ctx.activity.pauseState}`);
  lines.push(
    `Browser render: ${
      ctx.canvas.browserVisible && ctx.canvas.browserRevision === ctx.canvas.revision
        ? "confirmed for current canvas"
        : "pending for current canvas"
    }`,
  );

  if (ctx.readingProgress) {
    const rp = ctx.readingProgress;
    const accPct =
      rp.accuracy <= 1 && rp.accuracy >= 0
        ? Math.round(rp.accuracy * 100)
        : Math.round(rp.accuracy);
    lines.push(
      `[Reading progress] wordIndex ${rp.wordIndex}/${rp.totalWords} (0-based next slot; equals total when finished), accuracy ${accPct}% (progress), hesitations: ${rp.hesitations}, flagged: ${rp.flaggedWords.join(", ") || "none"}, spelled count: ${(rp.spelledWords ?? []).length}`,
    );
    if (rp.event) lines.push(`Reading event: ${rp.event}`);
  }

  if (c.sceneDescription && !activityPaused) {
    lines.push(`Scene on screen: ${c.sceneDescription}`);
  }
  if (c.pdfAssetUrl && !activityPaused) {
    lines.push(`Worksheet PDF: visible`);
  }
  if (c.pdfPage && !activityPaused) {
    lines.push(`Worksheet page: ${c.pdfPage}`);
  }
  if (c.activeProblemId && !activityPaused) {
    lines.push(`Active worksheet problem id: ${c.activeProblemId}`);
  }
  if (c.interactionMode && !activityPaused) {
    lines.push(`Worksheet interaction mode: ${c.interactionMode}`);
  }
  if (c.content && !activityPaused) {
    lines.push(`Question: ${c.content}`);
  }
  if (c.label && !activityPaused) {
    lines.push(`Label: ${c.label}`);
  }
  if (c.svg && !activityPaused) {
    lines.push("SVG: (visual rendered on screen — the child can see the scene described above)");
  }

  if (c.problemAnswer && !activityPaused) {
    if (c.interactionMode === "review") {
      lines.push(`Child's written answer: ${c.problemAnswer} (VERIFY this — the child may have miscounted)`);
    } else {
      lines.push(`Correct answer: ${c.problemAnswer}`);
    }
  }
  if (c.problemHint && !activityPaused) {
    lines.push(`Hint (if child is stuck): ${c.problemHint}`);
  }
  if (c.overlayFields && c.overlayFields.length > 0 && !activityPaused) {
    lines.push(`Worksheet input fields: ${c.overlayFields.length}`);
  }

  lines.push(`Canvas control: ${ctx.canvas.owner === "server" ? "server-driven" : "companion-driven"}`);

  if (ctx.canvas.owner === "server") {
    lines.push(
      `IMPORTANT: Canvas is server-driven for this ${ctx.sessionType} session. Do not call showCanvas — the server controls what the child sees.`
    );
  }

  if (ctx.availableToolNames.includes("launchGame")) {
    lines.push(`Available teaching games: ${Object.keys(TEACHING_TOOLS).sort().join(", ")}`);
    lines.push(`Available reward games: ${Object.keys(REWARD_GAMES).sort().join(", ")}`);
  }

  if (c.mode in TEACHING_TOOLS || c.mode in REWARD_GAMES) {
    lines.push(
      `Game startup: ${
        ctx.canvas.gameReadyRevision === ctx.canvas.revision
          ? "confirmed by browser"
          : "waiting for browser confirmation"
      }`
    );
  }

  if (activityPaused) {
    lines.push(
      `IMPORTANT: The active ${ctx.activity.mode} activity is paused for child check-in and hidden from the child right now.`
    );
    lines.push(
      "Do not grade or progress the hidden activity while paused. Stay in relationship mode until the child is ready to resume."
    );
  }

  if (ctx.assignment) {
    const { currentIndex, questions, attempts } = ctx.assignment;
    const total = questions.length;
    const completed = attempts.filter((a) => a.correct).length;
    if (currentIndex >= total) {
      lines.push(`Assignment: complete (${completed} correct out of ${total})`);
    } else {
      lines.push(`Assignment: Question ${currentIndex + 1} of ${total} (${completed} correct so far)`);
    }
    if (questions[currentIndex] && currentIndex < total && !activityPaused) {
      lines.push(`Current question: ${questions[currentIndex].text}`);
    }
  }

  const tailBlocks = [
    getSessionPhaseBlock(ctx),
    getWordBankBlock(ctx),
    getSLPBlock(ctx),
    getLearningStateBlock(ctx),
    getWilsonBlock(ctx),
    getReadingProfileBlock(ctx),
    getFocusWordsBlock(ctx),
    getScaffoldBlock(extras?.activeWord ?? null, extras?.wordScaffoldState ?? new Map()),
  ]
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (tailBlocks.length > 0) {
    lines.push("");
    lines.push(tailBlocks.join("\n\n"));
  }

  return lines.join("\n");
}
