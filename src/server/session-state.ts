import { assign, createActor, setup } from "xstate";

/** Strips markdown / noise before ElevenLabs. Bold must run before single-`*` rules. */
export function sanitizeForTTS(text: string): string {
  const raw = text;
  const out = text
    .replace(/\*\*([^*\n]+)\*\*/gs, "$1")
    .replace(/\*[^*]+\*/g, "")
    .replace(/\*[^*\n]*\*+/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\*+/g, "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u2600-\u27BF]/g, "")
    .replace(/[\u3000-\u9FFF\uAC00-\uD7AF\u0600-\u06FF]/g, "")
    .replace(/([!?])\s*[!?]/g, "$1")
    .replace(/\s+([!?.,])/g, "$1")
    .replace(/([!?.,])\s{2,}/g, "$1 ")
    // Ensure a space between sentence-ending punctuation and the next word —
    // prevents "us.Perfect!" artifacts when two buffer halves are concatenated.
    .replace(/([.!?])([A-Za-z])/g, "$1 $2")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    raw !== out &&
    raw.length > 0 &&
    typeof process !== "undefined" &&
    process.env.DEBUG_TTS === "true"
  ) {
    console.debug(
      `  TTS sanitize: stripped → ${JSON.stringify(out.slice(0, 160))}${out.length > 160 ? "…" : ""}`
    );
  }
  return out;
}

/**
 * Whether a TTS buffer should be flushed to ElevenLabs.
 *
 * Flushes on . ? , : — at any buffer length.
 * Flushes on ! only when the buffer is 11+ chars — prevents short excited
 * fragments like "Hey!" or "Cool!" from being flushed as orphaned chunks.
 * Falls back to a 200-char safety valve for punctuation-free text.
 *
 * Exported for unit testing.
 */
export function shouldFlush(buffer: string): boolean {
  if (/[.?,:\u2014](\s|$)/.test(buffer)) return true;
  if (buffer.length >= 11 && /!(\s|$)/.test(buffer)) return true;
  if (buffer.length >= 200) return true;
  return false;
}

/**
 * SessionTurnState — controls what happens to TTS text during a turn.
 *
 * IDLE           → waiting for child to speak
 * LOADING        → brief state so browser can show thinking indicator
 * PROCESSING     → runAgent is running, accumulating tokens
 * CANVAS_PENDING → showCanvas fired, holding TTS until canvas_done arrives
 * SPEAKING       → canvas confirmed (or no canvas), flushing TTS buffer
 * WORD_BUILDER   → fill-blanks iframe owns canvas; companion may still run short reactions
 */

export type SessionTurnState =
  | "IDLE"
  | "LOADING"
  | "PROCESSING"
  | "CANVAS_PENDING"
  | "SPEAKING"
  | "WORD_BUILDER";

type TurnMachineEvent =
  | { type: "START_TURN" }
  | { type: "BEGIN_PROCESSING" }
  | { type: "SHOW_CANVAS" }
  | { type: "CANVAS_DONE" }
  | { type: "AGENT_COMPLETE" }
  | { type: "PLAYBACK_COMPLETE" }
  | { type: "INTERRUPT" }
  | { type: "WORD_BUILDER_START" }
  | { type: "WORD_BUILDER_END" }
  | { type: "COMPANION_RUN" };

const turnMachine = setup({
  types: {
    context: {} as { wordBuilderActive: boolean },
    events: {} as TurnMachineEvent,
  },
  guards: {
    wordBuilderReturn: ({ context }) => context.wordBuilderActive,
  },
}).createMachine({
  id: "sessionTurn",
  initial: "IDLE",
  context: { wordBuilderActive: false },
  states: {
    IDLE: {
      on: {
        START_TURN: "LOADING",
        WORD_BUILDER_START: {
          target: "WORD_BUILDER",
          actions: assign({ wordBuilderActive: true }),
        },
      },
    },
    LOADING: {
      on: {
        BEGIN_PROCESSING: "PROCESSING",
        INTERRUPT: "IDLE",
        WORD_BUILDER_START: {
          target: "WORD_BUILDER",
          actions: assign({ wordBuilderActive: true }),
        },
      },
    },
    PROCESSING: {
      on: {
        SHOW_CANVAS: "CANVAS_PENDING",
        AGENT_COMPLETE: "SPEAKING",
        INTERRUPT: { target: "IDLE", actions: assign({ wordBuilderActive: false }) },
        WORD_BUILDER_START: {
          target: "WORD_BUILDER",
          actions: assign({ wordBuilderActive: true }),
        },
      },
    },
    CANVAS_PENDING: {
      on: {
        CANVAS_DONE: "SPEAKING",
        INTERRUPT: { target: "IDLE", actions: assign({ wordBuilderActive: false }) },
        WORD_BUILDER_START: {
          target: "WORD_BUILDER",
          actions: assign({ wordBuilderActive: true }),
        },
      },
    },
    WORD_BUILDER: {
      on: {
        AGENT_COMPLETE: "SPEAKING",
        COMPANION_RUN: "PROCESSING",
        INTERRUPT: { target: "IDLE", actions: assign({ wordBuilderActive: false }) },
        WORD_BUILDER_END: { target: "IDLE", actions: assign({ wordBuilderActive: false }) },
      },
    },
    SPEAKING: {
      on: {
        PLAYBACK_COMPLETE: [
          {
            guard: "wordBuilderReturn",
            target: "WORD_BUILDER",
          },
          { target: "IDLE" },
        ],
        INTERRUPT: { target: "IDLE", actions: assign({ wordBuilderActive: false }) },
        WORD_BUILDER_END: { target: "IDLE", actions: assign({ wordBuilderActive: false }) },
      },
    },
  },
});

export class TurnStateMachine {
  private state: SessionTurnState = "IDLE";
  private ttsBuffer = "";
  private canvasTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly CANVAS_TIMEOUT_MS = 2000;
  private pendingTranscript: string | null = null;
  private canonicalProblemText: string | null = null;
  private actor = createActor(turnMachine);

  private onFlush: (text: string) => void;
  private onLog: (msg: string) => void;
  private onStateChange: (state: SessionTurnState) => void;

  constructor(
    onFlush: (text: string) => void,
    onLog: (msg: string) => void,
    onStateChange: (state: SessionTurnState) => void = () => {}
  ) {
    this.onFlush = onFlush;
    this.onLog = onLog;
    this.onStateChange = onStateChange;
    this.actor.subscribe((snapshot) => {
      const next = snapshot.value as SessionTurnState;
      if (next === this.state) return;
      this.onLog(`  🔄 Session state: ${this.state} → ${next}`);
      this.state = next;
      this.onStateChange(next);
    });
    this.actor.start();
  }

  getState(): SessionTurnState {
    return this.state;
  }

  /**
   * Set the canonical spoken form of the problem currently being displayed.
   * This is appended to the TTS buffer after canvas_done so the server —
   * not Claude's tokens — is always the authoritative source for what gets spoken.
   * Pass null to clear (non-math canvas, or barge-in).
   */
  setCanonicalProblem(text: string | null): void {
    this.canonicalProblemText = text;
  }

  setPendingTranscript(t: string): void {
    if (this.pendingTranscript !== null) {
      // A barge-in already queued — concatenate rather than silently drop the first.
      this.pendingTranscript = `${this.pendingTranscript} ${t}`;
      this.onLog(`  📥 Pending transcript appended: "${t}" → "${this.pendingTranscript}"`);
    } else {
      this.pendingTranscript = t;
      this.onLog(`  📥 Pending transcript saved: "${t}"`);
    }
  }

  /** Returns and clears pending transcript if one was queued mid-turn */
  consumePendingTranscript(): string | null {
    const t = this.pendingTranscript;
    this.pendingTranscript = null;
    return t;
  }

  /** Drop queued transcript when it no longer matches current context */
  clearPendingTranscript(reason?: string): void {
    if (!this.pendingTranscript) return;
    if (reason) {
      this.onLog(`  🧹 Clearing queued transcript (${reason}): "${this.pendingTranscript}"`);
    } else {
      this.onLog(`  🧹 Clearing queued transcript: "${this.pendingTranscript}"`);
    }
    this.pendingTranscript = null;
  }

  private send(event: TurnMachineEvent): void {
    this.actor.send(event);
  }

  private clearCanvasTimeout(): void {
    if (this.canvasTimeout) {
      clearTimeout(this.canvasTimeout);
      this.canvasTimeout = null;
    }
  }

  // ── Public events ─────────────────────────────────────────────────────────

  /** Child spoke — start processing */
  onEndOfTurn(): void {
    this.canonicalProblemText = null;
    this.send({ type: "START_TURN" });
    setImmediate(() => this.send({ type: "BEGIN_PROCESSING" }));
  }

  /**
   * Companion response not tied to a user turn (e.g. game_complete) — enter
   * LOADING → PROCESSING from IDLE.
   */
  onStartCompanionFromIdle(): void {
    this.canonicalProblemText = null;
    this.send({ type: "START_TURN" });
    setImmediate(() => this.send({ type: "BEGIN_PROCESSING" }));
  }

  /** startWordBuilder tool — iframe owns canvas until WORD_BUILDER_END */
  onWordBuilderStart(): void {
    this.send({ type: "WORD_BUILDER_START" });
  }

  /** game_complete — exit Word Builder mode */
  onWordBuilderEnd(): void {
    this.send({ type: "WORD_BUILDER_END" });
  }

  /** runCompanionResponse while in WORD_BUILDER (between rounds) */
  onCompanionRunFromWordBuilder(): void {
    this.send({ type: "COMPANION_RUN" });
  }

  /**
   * Token arrived from Claude.
   *
   * During PROCESSING and CANVAS_PENDING: accumulate silently.
   * Audio only flushes when the full response is ready (onAgentComplete or
   * onCanvasDone). This guarantees clean, unbroken speech — no orphan
   * fragments from tool-call interruptions mid-sentence.
   *
   * During SPEAKING: flush incrementally so audio streams smoothly once
   * the canvas gate has lifted and playback has begun.
   */
  onToken(chunk: string): void {
    this.ttsBuffer += chunk;

    // PROCESSING / WORD_BUILDER / CANVAS_PENDING: accumulate only — full flush on
    // onAgentComplete / onCanvasDone (see comment on onToken above).
    if (
      this.state === "PROCESSING" ||
      this.state === "WORD_BUILDER" ||
      this.state === "CANVAS_PENDING"
    ) {
      return;
    }

    if (this.state === "SPEAKING") {
      if (this._shouldFlush(this.ttsBuffer)) {
        const clean = sanitizeForTTS(this.ttsBuffer);
        if (clean) this.onFlush(clean);
        this.ttsBuffer = "";
      }
    }
  }

  /** showCanvas tool fired in this step */
  onShowCanvas(): void {
    if (this.state !== "PROCESSING") return;
    this.send({ type: "SHOW_CANVAS" });

    // Hard timeout — if canvas_done never arrives, release after 2s
    this.canvasTimeout = setTimeout(() => {
      this.onLog("  ⚠️  canvas_done timed out — releasing TTS buffer");
      this.onCanvasDone();
    }, this.CANVAS_TIMEOUT_MS);
  }

  /** Browser confirmed canvas animation complete */
  onCanvasDone(): void {
    if (this.state !== "CANVAS_PENDING") return;

    this.clearCanvasTimeout();

    // Append the server-canonical problem text BEFORE flushing the buffer.
    // This guarantees the spoken problem always matches the canvas — Claude
    // only provides the feedback prefix ("Nice!"), the server provides the problem.
    if (this.canonicalProblemText) {
      let pre = this.ttsBuffer.trimEnd();
      if (pre.length > 0 && !/[.!?]["']?\s*$/.test(pre)) {
        pre += ". ";
      }
      this.ttsBuffer = pre + this.canonicalProblemText;
      this.onLog(`  📢 Canonical problem appended to TTS: "${this.canonicalProblemText}"`);
      this.canonicalProblemText = null;
    }

    this.send({ type: "CANVAS_DONE" });
    this._flushBuffer();
  }

  /** runAgent completed — if no canvas was pending, go straight to speaking */
  onAgentComplete(): void {
    this.onLog(`  🔍 onAgentComplete — state: ${this.state}, buffer: "${this.ttsBuffer.slice(0, 60)}"`);

    if (this.state === "PROCESSING" || this.state === "WORD_BUILDER") {
      this.send({ type: "AGENT_COMPLETE" });
      this._flushBuffer(); // flush buffered content from PROCESSING / WORD_BUILDER intro
    }
    // Drain any trailing fragment left in SPEAKING state
    if (this.state === "SPEAKING" && this.ttsBuffer.trim()) {
      let drain = this.ttsBuffer.trimEnd();
      if (drain.length > 0 && !/[.!?]["']?\s*$/.test(drain)) {
        drain += ". ";
      }
      const clean = sanitizeForTTS(drain);
      if (clean) {
        this.onLog(`  🔊 Draining trailing fragment: "${clean}"`);
        this.onFlush(clean);
      }
      this.ttsBuffer = "";
    }
    // If CANVAS_PENDING — wait for onCanvasDone to flush
  }

  /** Barge-in or session end — drop everything */
  onInterrupt(): void {
    this.clearCanvasTimeout();
    this.ttsBuffer = "";
    this.pendingTranscript = null;
    this.canonicalProblemText = null;
    this.send({ type: "INTERRUPT" });
  }

  /** Browser finished playing the current assistant audio */
  onPlaybackComplete(): void {
    if (this.state === "SPEAKING") {
      this.send({ type: "PLAYBACK_COMPLETE" });
    }
  }

  /** Backwards-compatible alias while callers migrate to playback terminology */
  onSpeakingDone(): void {
    this.onPlaybackComplete();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _hasClauseBoundary(buffer: string): boolean {
    return shouldFlush(buffer);
  }

  private _hasCompleteSentence(buffer: string): boolean {
    const trimmed = buffer.trim();
    if (trimmed.length < 10) return false;
    return /[.!?]["']?\s*$/.test(trimmed);
  }

  private _shouldFlush(buffer: string): boolean {
    const trimmed = buffer.trim();
    if (trimmed.length < 4) return false;
    if (/^[!?.,\s]+$/.test(trimmed)) return false;
    // Require at least 15 chars before flushing on sentence-end punctuation —
    // prevents "Perfect!" or "Yes!" from becoming orphaned single-word TTS chunks
    if (trimmed.length >= 15 && /[.!?]["']?\s*$/.test(trimmed)) return true;
    if (trimmed.length >= 25 && /[,\-–]\s*$/.test(trimmed)) return true;
    // Bare-length fallback — only fires on genuinely long token runs with no
    // punctuation. Raised from 40→80 to avoid mid-sentence flushes on short
    // sentences (e.g. "Hi there! I'm so excited to do some reading work").
    if (buffer.length >= 80) return true;
    return false;
  }

  private _flushBuffer(): void {
    if (this.ttsBuffer) {
      let buf = this.ttsBuffer.trimEnd();
      if (buf.length > 0 && !/[.!?]["']?\s*$/.test(buf)) {
        buf += ". ";
      }
      const clean = sanitizeForTTS(buf);
      if (clean) {
        this.onLog(`  🔊 Flushing TTS buffer (${clean.length} chars)`);
        this.onFlush(clean);
      }
      this.ttsBuffer = "";
    }
  }
}
