import type { WebSocket } from "ws";
import {
  getCompanionConfig,
  type ChildName,
  type CompanionConfig,
} from "../companions/loader";
import {
  TEST_MODE_PROMPT,
  WORD_BUILDER_ROUND_COMPLETE,
  WORD_BUILDER_ROUND_FAILED,
  buildSessionPrompt,
  extractWordsFromHomework,
} from "../agents/prompts";
import { loadHomeworkPayload } from "../utils/loadHomeworkFolder";
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
  private toolCallsMadeThisTurn = 0;
  private activeWord: string | null = null;
  private isSpellingSession = false;
  private sessionStartedToolCalled = false;
  private transitionedToWork = false;

  private activeWordBuilderWord = "";
  private wordBuilderSessionActive = false;
  private activeWordContext: string = "";
  private wordAttemptCounts: Map<string, number> = new Map();

  private turnSM: TurnStateMachine;

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

    // Folder-based homework (images) — inject at session startup
    if (process.env.SUNNY_TEST_MODE !== "true") {
      const homeworkPayload = await loadHomeworkPayload(this.childName);
      if (homeworkPayload) {
        console.log(
          `  📚 Homework loaded for ${this.childName}: ` +
            `${homeworkPayload.fileCount} pages`
        );
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
        );
        this.companion = { ...this.companion, systemPrompt: sessionPrompt };
        console.log(
          `  ✅ Session prompt ready (${sessionPrompt.length} chars)`
        );
        this.isSpellingSession = true;
        console.log("  📝 Spelling session mode active");
      }
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
  }

  /** Iframe game events (word-builder fill-blanks) forwarded from the browser. */
  handleGameEvent(event: Record<string, unknown>): void {
    const type = event.type as string;
    if (type === "ready") {
      return;
    }
    if (type === "round_complete") {
      const round = Number(event.round) || 1;
      const word = String(event.word ?? this.activeWordBuilderWord);
      const attempts = Number(event.attempts) || 1;
      void this.runCompanionResponse(
        WORD_BUILDER_ROUND_COMPLETE(round, word, attempts)
      ).then(() => {
        if (
          round < 4 &&
          this.wordBuilderSessionActive &&
          this.activeWordBuilderWord
        ) {
          this.send("game_message", {
            forward: {
              type: "next_round",
              round: round + 1,
              word: this.activeWordBuilderWord,
            },
          });
        }
      });
      return;
    }
    if (type === "round_failed") {
      const round = Number(event.round) || 1;
      const word = String(event.word ?? this.activeWordBuilderWord);
      void this.runCompanionResponse(WORD_BUILDER_ROUND_FAILED(round, word)).then(
        () => {
          if (
            round < 4 &&
            this.wordBuilderSessionActive &&
            this.activeWordBuilderWord
          ) {
            this.send("game_message", {
              forward: {
                type: "next_round",
                round: round + 1,
                word: this.activeWordBuilderWord,
              },
            });
          } else if (round >= 4) {
            this.wordBuilderSessionActive = false;
            this.activeWordBuilderWord = "";
            this.send("canvas_draw", { mode: "idle" });
          }
        }
      );
      return;
    }
    if (type === "game_complete") {
      this.wordBuilderSessionActive = false;
      this.activeWordBuilderWord = "";
      this.send("canvas_draw", { mode: "idle" });
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

    if (this.fluxHandle) {
      this.fluxHandle.close();
      this.fluxHandle = null;
    }

    if (this.ttsBridge) {
      this.ttsBridge.close();
      this.ttsBridge = null;
    }

    this.wordBuilderSessionActive = false;
    this.activeWordBuilderWord = "";
    this.activeWordContext = "";
    this.wordAttemptCounts.clear();

    this.turnSM.onInterrupt();

    try {
      if (process.env.SUNNY_TEST_MODE === "true") {
        console.log("  🧪 Test mode — skipping session recording, psychologist, and reward log.");
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
      this.lastEagerTranscript = normalized;
      this.lastEagerTranscriptTime = Date.now();
      if (this.turnSM.getState() === "IDLE") {
        // Letter-by-letter spelling (spaces between single letters). Not the
        // naive /^([a-zA-Z]\s?)+$/ — that matches normal words like "I want".
        const isSpelling = /^([a-zA-Z]\s+)+[a-zA-Z]$/i.test(transcript.trim());
        if (isSpelling) {
          return;
        }
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

      await runAgent({
        history: historyWithPin,
        userMessage,
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
            const args = (tc.args ?? tc.input ?? {}) as Record<string, unknown>;
            const result = toolResults[i];
            this.handleToolCall(toolName, args, result);

            if (toolName === "startWordBuilder") {
              // Do not trigger CANVAS_PENDING — the iframe loads independently
              // and does not send canvas_done. State machine stays PROCESSING → SPEAKING.
            }

            if (toolName === "showCanvas") {
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
      this.activeWordBuilderWord = word;
      this.wordBuilderSessionActive = true;
      console.log(`  🎮 Word-builder (fill-blanks) started — word: ${word}`);
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
      this.lastCanvasMode = (args.mode as string) ?? "idle";
      this.lastCanvasWasMath = this.isTeachingMathCanvas(args);

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
