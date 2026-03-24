import fs from "fs";
import path from "path";
import type { WebSocket } from "ws";
import {
  getCompanionConfig,
  type ChildName,
  type CompanionConfig,
} from "../companions/loader";
import {
  DEMO_MODE_PROMPT,
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
import type { ModelMessage } from "ai";
import { TurnStateMachine } from "./session-state";

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

export class SessionManager {
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
  // ────────────────────────────────────────────────────────────────────────

  // Legacy aliases kept for spell-check (different flow)
  private activeWordBuilderWord = "";
  private wordBuilderSessionActive = false;
  private activeSpellCheckWord = "";
  private spellCheckSessionActive = false;
  private activeWordContext: string = "";
  private wordAttemptCounts: Map<string, number> = new Map();

  private turnSM: TurnStateMachine;

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

    if (process.env.SUNNY_TEST_MODE === "true") {
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
    const ts = new Date().toISOString();
    this.sessionStartTime = Date.now();
    console.log(
      `  🌟 [${ts}] Starting session: ${this.childName} with ${this.companion.name}`
    );

    const subject = normalizeSessionSubject(process.env.SUNNY_SUBJECT);

    // Check drop/ for new files and route them before loading homework
    this.send("loading_status", { message: "Checking for new assignments..." });
    try {
      const { hasNewFiles, routed } = await classifyAndRoute(this.childName);
      if (hasNewFiles) {
        console.log("  📥 New files processed:");
        routed.forEach((r) => console.log(`    ${r}`));
        this.send("loading_status", {
          message: `Loading ${this.childName}'s assignments...`,
        });
        this.bustPromptCache();
      }
    } catch (err) {
      console.warn("  ⚠️  Classifier failed:", err instanceof Error ? err.message : String(err));
    }

    // Folder-based homework (images) — inject at session startup
    const homeworkPayload =
      process.env.DEMO_MODE === "true"
        ? null
        : await loadHomeworkPayload(this.childName);

    if (process.env.DEMO_MODE === "true") {
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
        `  📚 Homework loaded for ${this.childName}: ` +
          `${homeworkPayload.fileCount} pages`
      );
      this.send("loading_status", { message: "Preparing session prompt..." });
      console.log("  🧠 Psychologist building session prompt...");
      const wordList = extractWordsFromHomework(homeworkPayload.rawContent);
      if (wordList.length > 0) {
        console.log(`  📋 Spelling words extracted: ${wordList.join(", ")}`);
      }
      const sessionPrompt = await buildSessionPrompt(
        this.childName,
        this.companion.markdownPath,
        homeworkPayload.rawContent,
        wordList,
        subject,
      );
      this.companion = { ...this.companion, systemPrompt: sessionPrompt };
      console.log(
        `  ✅ Session prompt ready (${sessionPrompt.length} chars)`
      );
      this.isSpellingSession = true;
      console.log("  📝 Spelling session mode active");
      console.log(`  📚 Subject mode: ${subject}`);
    } else {
      this.send("loading_status", { message: "Starting free session..." });
      console.log(`  📚 Subject mode: ${subject}`);
    }

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

    // Explicit blank-canvas signal at session start — the server owns canvas
    // state, so we always declare the initial state rather than relying on
    // the frontend's initial value.
    this.currentCanvasState = null;
    this.send("canvas_draw", { mode: "idle" });

    this.clearSessionTimer = startMaxDurationTimer(this.childName, () => {
      console.log("  ⏰ Session timeout reached (15 min)");
      this.end();
    });

    resetMathProbeSession(this.childName);
    resetSessionStart();
    resetTransitionToWork();
    this.isSpellingSession = false;
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
      // Acknowledgment from iframe that it received "start" — no response needed.
      // Round 1 is driven by Canvas onLoad; subsequent rounds by wbSendRound().
      return;
    }

    if (type === "correct" && this.spellCheckSessionActive) {
      const word = String(event.word ?? this.activeSpellCheckWord);
      if (this.turnSM.getState() !== "IDLE") {
        this.spellCheckSessionActive = false;
        this.activeSpellCheckWord = "";
        this.send("canvas_draw", { mode: "idle" });
        return;
      }
      void this.runCompanionResponse(SPELL_CHECK_CORRECT(this.childName, word));
      this.spellCheckSessionActive = false;
      this.activeSpellCheckWord = "";
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

      // Round 4: celebrate — iframe sends game_complete next; do not advance server round
      if (completedRound === 4) {
        void this.runCompanionResponse(
          WORD_BUILDER_ROUND_COMPLETE(4, this.wbWord, attempts)
        ).catch((err) => {
          console.error("  ❌ WB round 4 celebration failed:", err);
        });
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
      const completedWord = this.wbWord;
      this.wbEndCleanup();
      this.turnSM.onWordBuilderEnd();
      this.send("canvas_draw", { mode: "idle" });
      void this.runCompanionResponse(
        WORD_BUILDER_SESSION_COMPLETE(this.childName, completedWord)
      ).catch(console.error);
    }
  }

  canvasDone(): void {
    this.turnSM.onCanvasDone();
  }

  playbackDone(): void {
    this.turnSM.onPlaybackComplete();
  }

  async end(): Promise<void> {
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

    this.turnSM.onInterrupt();

    try {
      const testMode =
        process.env.SUNNY_TEST_MODE === "true" ||
        process.env.TTS_ENABLED === "false";

      if (testMode) {
        console.log("  🔇 Test mode — skipping session recording and reward log.");
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

    let userMessage = transcript;
    if (this.isSpellingSession && this.activeWord) {
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

      // Pin the active word context as the first message so it always survives
      // history truncation, even after a barge-in wipes mid-session turns.
      const historyWithPin: typeof recentHistory = this.activeWordContext
        ? [{ role: "user", content: this.activeWordContext }, ...recentHistory]
        : recentHistory;

      // Prepend canvas state context so the AI always knows what is currently
      // displayed — prevents duplicate showCanvas calls and enables intelligent
      // decisions about whether to update or hold the current display.
      const canvasCtx = this.currentCanvasState
        ? buildCanvasContext(this.currentCanvasState)
        : "";
      const messageWithContext = canvasCtx
        ? `${canvasCtx}\n\n${userMessage}`
        : userMessage;

      await runAgent({
        history: historyWithPin,
        userMessage: messageWithContext,
        profile: this.companion,
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
            const args = (tc.args ?? tc.input ?? {}) as Record<string, unknown>;
            const result = toolResults[i];
            this.handleToolCall(toolName, args, result);

            if (toolName === "startWordBuilder" || toolName === "startSpellCheck") {
              // Do not trigger CANVAS_PENDING — the iframe loads independently
              // and does not send canvas_done. State machine stays PROCESSING → SPEAKING.
            }

            if (toolName === "showCanvas") {
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

                // Always send the draw event to the browser
                this.send("canvas_draw", { args, result });

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
        console.log("  👋 Companion said goodbye");
        await this.end();
        return;
      }

      if (this.ttsBridge) {
        await this.ttsBridge.finish();
      }
      this.send("audio_done");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("  ⚡ Agent aborted (barge-in)");
        this.turnSM.onInterrupt();
        return;
      }
      this.turnSM.onInterrupt();
      const message = err instanceof Error ? err.message : String(err);
      console.error("  🔴 Agent error:", message);
      this.send("error", { message: "Companion response failed" });
    } finally {
      this.currentAbort = null;
    }
  }

  private normalizeToolName(tool: string): string {
    if (tool === "start_spell_check") return "startSpellCheck";
    return tool;
  }

  private async handleCompanionTurn(text: string): Promise<void> {
    this.turnSM.onEndOfTurn();
    // onEndOfTurn uses setImmediate for LOADING → PROCESSING — wait for it
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.turnSM.onAgentComplete();
    this.send("response_text", { chunk: text });
    if (this.ttsBridge) {
      this.ttsBridge.sendText(text);
      await this.ttsBridge.finish();
    }
    this.send("audio_done");
    this.turnSM.onSpeakingDone();
  }

  handleToolCall(
    tool: string,
    args: Record<string, unknown>,
    result: unknown
  ): void {
    tool = this.normalizeToolName(tool);

    if (tool === "blackboard") {
      const gesture = String(args.gesture ?? "");
      if (this.turnSM.getState() === "WORD_BUILDER" && gesture !== "clear") {
        console.warn(
          "  ⚠️  blackboard blocked during Word Builder — only clear allowed"
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

    if (tool === "showCanvas") {
      const c = args.content as string | undefined;
      if (c && c.includes(" ") && !this.isTeachingMathCanvas(args)) {
        console.warn(
          "  ⚠️  showCanvas rejected — content is not a word:",
          c
        );
        args.content = "";
      }
    }

    this.toolCallsMadeThisTurn++;
    this.send("tool_call", { tool, args, result });

    if (tool === "endSession") {
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

    if (tool === "startWordBuilder") {
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
      this.send("canvas_draw", {
        mode: "word-builder",
        gameUrl: "/games/wordd-builder.html",
        gameWord: word,
        gamePlayerName: this.childName,
        wordBuilderRound: 1,
        wordBuilderMode: "fill_blanks",
      });
      return;
    }

    if (tool === "startSpellCheck") {
      const word = String(args.word ?? "").toLowerCase().trim();
      if (word.length < 2) {
        console.warn("  ⚠️  startSpellCheck: word must be at least 2 letters");
        return;
      }
      this.activeSpellCheckWord = word;
      this.spellCheckSessionActive = true;
      console.log(`  ⌨️  Spell-check typing game started — word: ${word}`);
      this.send("canvas_draw", {
        mode: "spell-check",
        gameUrl: "/games/spell-check.html",
        gameWord: word,
        gamePlayerName: this.childName,
      });
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
    }

    if (tool === "mathProblem" && args.childAnswer != null) {
      try {
        const raw = result as Record<string, unknown> | string | undefined;
        const output = typeof raw === "string" ? raw : (raw?.output as string | undefined) ?? raw;
        const parsed = typeof output === "string" ? JSON.parse(output) : output;
        const correct = (parsed as Record<string, unknown>)?.correct === true;
        this.processReward({ correct });
      } catch {
        console.error("  ⚠️  Could not parse mathProblem result for reward");
      }
    }

    if (tool === "showCanvas") {
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
        this.send("reward", {
          rewardStyle: "takeover",
          svg: r?.svg,
          label: r?.label,
          lottieData: r?.lottieData,
          displayDuration_ms: takeover_ms,
        });
        this.logRewardEvent("takeover", takeover_ms);
      }
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
