function sanitizeForTTS(text: string): string {
  return text
    .replace(/\*[^*\n]+\*/g, "")
    .replace(/\*\*(.*?)\*\*/gs, "$1")
    .replace(/\*(.*?)\*/gs, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\*+/g, "")
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u2600-\u27BF]/g, "")
    .replace(/[\u3000-\u9FFF\uAC00-\uD7AF\u0600-\u06FF]/g, "")
    .replace(/([!?])\s*[!?]/g, "$1")
    .replace(/\s+([!?.,])/g, "$1")
    .replace(/([!?.,])\s{2,}/g, "$1 ")
    // Ensure a space between sentence-ending punctuation and the next word —
    // prevents "us.Perfect!" artifacts when two buffer halves are concatenated.
    .replace(/([.!?])([A-Za-z])/g, "$1 $2")
    .replace(/\n{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * SessionTurnState — controls what happens to TTS text during a turn.
 *
 * IDLE           → waiting for child to speak
 * LOADING        → brief state so browser can show thinking indicator
 * PROCESSING     → runAgent is running, accumulating tokens
 * CANVAS_PENDING → showCanvas fired, holding TTS until canvas_done arrives
 * SPEAKING       → canvas confirmed (or no canvas), flushing TTS buffer
 */

export type SessionTurnState =
  | "IDLE"
  | "LOADING"
  | "PROCESSING"
  | "CANVAS_PENDING"
  | "SPEAKING";

// Legal transitions — anything not listed is illegal and will throw
const TRANSITIONS: Record<SessionTurnState, SessionTurnState[]> = {
  IDLE: ["LOADING"],
  LOADING: ["PROCESSING", "IDLE"],
  PROCESSING: ["CANVAS_PENDING", "SPEAKING", "IDLE"],
  CANVAS_PENDING: ["SPEAKING", "IDLE"],
  SPEAKING: ["IDLE"],
};

export class TurnStateMachine {
  private state: SessionTurnState = "IDLE";
  private ttsBuffer = "";
  private canvasTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly CANVAS_TIMEOUT_MS = 2000;
  private pendingTranscript: string | null = null;
  private canonicalProblemText: string | null = null;

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

  private transition(next: SessionTurnState): void {
    const allowed = TRANSITIONS[this.state];
    if (!allowed.includes(next)) {
      this.onLog(`  ⚠️  Illegal state transition: ${this.state} → ${next} (ignored)`);
      return;
    }
    this.onLog(`  🔄 Session state: ${this.state} → ${next}`);
    this.state = next;
    this.onStateChange(next);
  }

  // ── Public events ─────────────────────────────────────────────────────────

  /** Child spoke — start processing */
  onEndOfTurn(): void {
    this.canonicalProblemText = null;
    this.transition("LOADING");
    setImmediate(() => this.transition("PROCESSING"));
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
    this.transition("CANVAS_PENDING");

    // Hard timeout — if canvas_done never arrives, release after 2s
    this.canvasTimeout = setTimeout(() => {
      this.onLog("  ⚠️  canvas_done timed out — releasing TTS buffer");
      this.onCanvasDone();
    }, this.CANVAS_TIMEOUT_MS);
  }

  /** Browser confirmed canvas animation complete */
  onCanvasDone(): void {
    if (this.state !== "CANVAS_PENDING") return;

    if (this.canvasTimeout) {
      clearTimeout(this.canvasTimeout);
      this.canvasTimeout = null;
    }

    // Append the server-canonical problem text BEFORE flushing the buffer.
    // This guarantees the spoken problem always matches the canvas — Claude
    // only provides the feedback prefix ("Nice!"), the server provides the problem.
    if (this.canonicalProblemText) {
      this.ttsBuffer = this.ttsBuffer.trimEnd() + " " + this.canonicalProblemText;
      this.onLog(`  📢 Canonical problem appended to TTS: "${this.canonicalProblemText}"`);
      this.canonicalProblemText = null;
    }

    this.transition("SPEAKING");
    this._flushBuffer();
  }

  /** runAgent completed — if no canvas was pending, go straight to speaking */
  onAgentComplete(): void {
    this.onLog(`  🔍 onAgentComplete — state: ${this.state}, buffer: "${this.ttsBuffer.slice(0, 60)}"`);

    if (this.state === "PROCESSING") {
      this.transition("SPEAKING");
      this._flushBuffer(); // flush buffered content from PROCESSING
    }
    // Drain any trailing fragment left in SPEAKING state
    if (this.state === "SPEAKING" && this.ttsBuffer.trim()) {
      const clean = sanitizeForTTS(this.ttsBuffer);
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
    if (this.canvasTimeout) {
      clearTimeout(this.canvasTimeout);
      this.canvasTimeout = null;
    }
    this.ttsBuffer = "";
    this.pendingTranscript = null;
    this.canonicalProblemText = null;
    if (this.state !== "IDLE") {
      this.transition("IDLE");
    }
  }

  /** TTS finished speaking */
  onSpeakingDone(): void {
    if (this.state === "SPEAKING") {
      this.transition("IDLE");
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

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
      const clean = sanitizeForTTS(this.ttsBuffer);
      if (clean) {
        this.onLog(`  🔊 Flushing TTS buffer (${clean.length} chars)`);
        this.onFlush(clean);
      }
      this.ttsBuffer = "";
    }
  }
}
