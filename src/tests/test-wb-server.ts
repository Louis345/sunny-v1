/**
 * Word Builder server-side flow tests.
 *
 * These tests verify the contract between the server's handleGameEvent logic
 * and the iframe postMessage protocol. Run with: npx tsx src/tests/test-wb-server.ts
 */
import { strict as assert } from "assert";

// ── Minimal fakes ──────────────────────────────────────────────────────────

type WbState = "IDLE" | "WORD_BUILDER" | "SPEAKING" | "PROCESSING";

interface SentMessage {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Minimal stub of the Word Builder portion of SessionManager.
 * Mirrors the production fields and logic without WebSocket / XState / Claude.
 */
class WbTestHarness {
  // ── server round state ──────────────────────────────────
  wbWord = "";
  wbRound = 0;
  wbActive = false;
  wbPendingEvent: Record<string, unknown> | null = null;

  // ── observable side-effects ─────────────────────────────
  sent: SentMessage[] = [];
  companionPrompts: string[] = [];
  stateOverride: WbState = "WORD_BUILDER";

  // ── transcript dedup state (mirrors session-manager.ts) ─
  lastEagerTranscript = "";
  lastEagerTranscriptTime = 0;

  // ── helpers ─────────────────────────────────────────────
  private send(type: string, payload: Record<string, unknown> = {}): void {
    this.sent.push({ type, payload });
  }

  getState(): WbState {
    return this.stateOverride;
  }

  // Simulate companion response: records the prompt, returns resolved promise
  runCompanionResponse(prompt: string): Promise<void> {
    this.companionPrompts.push(prompt);
    return Promise.resolve();
  }

  // ── production methods (copied verbatim from session-manager.ts) ──────────

  wbSendRound(): void {
    if (!this.wbActive || !this.wbWord || this.wbRound < 2) return;
    this.send("game_message", {
      forward: {
        type: "next_round",
        round: this.wbRound,
        word: this.wbWord,
      },
    });
  }

  wbAdvanceRound(): void {
    this.wbRound++;
    if (this.wbRound <= 4 && this.wbActive) {
      this.wbSendRound();
    }
  }

  wbEndCleanup(): void {
    this.wbActive = false;
    this.wbRound = 0;
    this.wbPendingEvent = null;
  }

  handleGameEvent(event: Record<string, unknown>): void {
    const type = event.type as string;

    if (type === "ready") {
      // Acknowledgment from iframe — server does NOT respond.
      // Round 1 is driven by Canvas onLoad; rounds 2-4 by wbSendRound().
      return;
    }

    if (type === "round_complete") {
      if (!this.wbActive) return;
      const state = this.getState();

      if (
        state === "SPEAKING" ||
        state === "PROCESSING"
      ) {
        this.wbPendingEvent = event;
        return;
      }

      const attempts = Number(event.attempts) || 1;

      if (this.wbRound === 2) {
        void this.runCompanionResponse(
          `ROUND_COMPLETE round=${this.wbRound} word=${this.wbWord} attempts=${attempts}`
        )
          .then(() => this.wbAdvanceRound())
          .catch(() => this.wbAdvanceRound());
        return;
      }

      this.wbAdvanceRound();
      return;
    }

    if (type === "round_failed") {
      if (!this.wbActive) return;
      const state = this.getState();
      const word = this.wbWord;

      if (state === "SPEAKING" || state === "PROCESSING") {
        this.wbPendingEvent = event;
        return;
      }

      void this.runCompanionResponse(
        `ROUND_FAILED round=${this.wbRound} word=${word}`
      )
        .then(() => this.wbAdvanceRound())
        .catch(() => this.wbAdvanceRound());
      return;
    }

    if (type === "game_complete") {
      const completedWord = this.wbWord;
      this.wbEndCleanup();
      this.send("canvas_draw", { mode: "idle" });
      void this.runCompanionResponse(
        `GAME_COMPLETE word=${completedWord}`
      ).catch(() => {});
    }
  }

  /** Start a Word Builder session (mirrors handleToolCall "startWordBuilder") */
  startWordBuilder(word: string): void {
    this.wbWord = word;
    this.wbRound = 1;
    this.wbActive = true;
    this.wbPendingEvent = null;
    this.sent = [];
    this.companionPrompts = [];
  }

  sentGameMessages(): Array<Record<string, unknown>> {
    return this.sent
      .filter((m) => m.type === "game_message")
      .map((m) => m.payload.forward as Record<string, unknown>);
  }
}

// ── Test harness ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result
        .then(() => {
          console.log(`  ✅ ${name}`);
          passed++;
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  ❌ ${name}\n     ${msg}`);
          failed++;
        });
    } else {
      console.log(`  ✅ ${name}`);
      passed++;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ❌ ${name}\n     ${msg}`);
    failed++;
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

console.log("\n🎮 WORD BUILDER SERVER FLOW TESTS\n");

// ─── ready event ─────────────────────────────────────────────────────────
console.log("ready event");

test("ready does NOT send any game_message (no infinite loop)", () => {
  const h = new WbTestHarness();
  h.startWordBuilder("running");

  // Simulate iframe responding with "ready" after receiving "start"
  h.handleGameEvent({ type: "ready" });
  // Simulate it again (as would happen in a loop)
  h.handleGameEvent({ type: "ready" });
  h.handleGameEvent({ type: "ready" });

  const msgs = h.sentGameMessages();
  assert.equal(
    msgs.length,
    0,
    `ready should send 0 game_messages; got ${msgs.length}: ${JSON.stringify(msgs)}`
  );
});

test("ready when wbActive=false sends nothing", () => {
  const h = new WbTestHarness();
  // wbActive is false (no game started)
  h.handleGameEvent({ type: "ready" });
  assert.equal(h.sentGameMessages().length, 0);
});

// ─── round progression ────────────────────────────────────────────────────
console.log("\nround progression");

test("round_complete round 1 → sends next_round for round 2", async () => {
  const h = new WbTestHarness();
  h.startWordBuilder("running");

  h.handleGameEvent({ type: "round_complete", round: 1, word: "running", attempts: 1 });

  // wbAdvanceRound is sync for rounds 1 and 3
  const msgs = h.sentGameMessages();
  assert.equal(msgs.length, 1, `expected 1 game_message, got ${msgs.length}`);
  assert.equal(msgs[0].type, "next_round");
  assert.equal(msgs[0].round, 2);
});

test("round_complete round 2 → companion prompt fired before advance", async () => {
  const h = new WbTestHarness();
  h.startWordBuilder("running");
  h.wbRound = 2;

  h.handleGameEvent({ type: "round_complete", round: 2, word: "running", attempts: 2 });

  // Companion response is async — wait for microtasks
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(h.companionPrompts.length, 1, "should have fired one companion prompt");
  assert.ok(
    h.companionPrompts[0].includes("ROUND_COMPLETE"),
    "prompt should indicate round complete"
  );
  assert.ok(
    h.companionPrompts[0].includes("round=2"),
    "prompt should include round number"
  );

  // After promise resolves, round should have advanced to 3
  const msgs = h.sentGameMessages();
  assert.equal(msgs.length, 1, `expected 1 next_round message, got ${msgs.length}`);
  assert.equal(msgs[0].round, 3);
});

test("round_complete round 3 → sends next_round for round 4", async () => {
  const h = new WbTestHarness();
  h.startWordBuilder("running");
  h.wbRound = 3;

  h.handleGameEvent({ type: "round_complete", round: 3, word: "running", attempts: 1 });

  const msgs = h.sentGameMessages();
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].type, "next_round");
  assert.equal(msgs[0].round, 4);
});

test("round_complete round 4 → no more game_messages", async () => {
  const h = new WbTestHarness();
  h.startWordBuilder("running");
  h.wbRound = 4;

  h.handleGameEvent({ type: "round_complete", round: 4, word: "running", attempts: 1 });

  const msgs = h.sentGameMessages();
  assert.equal(
    msgs.length,
    0,
    `round 4 should send no next_round; got ${JSON.stringify(msgs)}`
  );
});

test("wbRound tracks correctly through all 4 rounds", () => {
  const h = new WbTestHarness();
  h.startWordBuilder("running");
  assert.equal(h.wbRound, 1);

  h.handleGameEvent({ type: "round_complete", round: 1, word: "running", attempts: 1 });
  assert.equal(h.wbRound, 2);

  // skip round 2 response by setting round to 3 (async path tested separately)
  h.wbRound = 3;
  h.handleGameEvent({ type: "round_complete", round: 3, word: "running", attempts: 1 });
  assert.equal(h.wbRound, 4);
});

// ─── buffering ────────────────────────────────────────────────────────────
console.log("\nbuffering during SPEAKING/PROCESSING");

test("round_complete while SPEAKING → buffers event", () => {
  const h = new WbTestHarness();
  h.startWordBuilder("running");
  h.stateOverride = "SPEAKING";

  h.handleGameEvent({ type: "round_complete", round: 1, word: "running", attempts: 1 });

  assert.notEqual(h.wbPendingEvent, null, "event should be buffered");
  assert.equal(h.wbRound, 1, "round should not advance while buffered");
  assert.equal(h.sentGameMessages().length, 0, "no messages sent while SPEAKING");
});

test("round_complete while PROCESSING → buffers event", () => {
  const h = new WbTestHarness();
  h.startWordBuilder("running");
  h.stateOverride = "PROCESSING";

  h.handleGameEvent({ type: "round_complete", round: 1, word: "running", attempts: 1 });

  assert.notEqual(h.wbPendingEvent, null);
  assert.equal(h.wbRound, 1);
});

test("buffered event flushes when state returns to WORD_BUILDER", () => {
  const h = new WbTestHarness();
  h.startWordBuilder("running");
  h.stateOverride = "SPEAKING";

  h.handleGameEvent({ type: "round_complete", round: 1, word: "running", attempts: 1 });
  assert.notEqual(h.wbPendingEvent, null);

  // Simulate WORD_BUILDER re-entry — flush the pending event
  h.stateOverride = "WORD_BUILDER";
  const pending = h.wbPendingEvent!;
  h.wbPendingEvent = null;
  h.handleGameEvent(pending);

  assert.equal(h.wbRound, 2, "round should advance after flush");
  const msgs = h.sentGameMessages();
  assert.equal(msgs.length, 1, "next_round should be sent after flush");
  assert.equal(msgs[0].round, 2);
});

// ─── game_complete ────────────────────────────────────────────────────────
console.log("\ngame_complete");

test("game_complete → wbActive=false, canvas cleared, companion prompt", async () => {
  const h = new WbTestHarness();
  h.startWordBuilder("running");
  h.wbRound = 4;

  h.handleGameEvent({ type: "game_complete", word: "running" });

  await Promise.resolve();

  assert.equal(h.wbActive, false);
  assert.equal(h.wbRound, 0);
  const canvasClear = h.sent.find(
    (m) => m.type === "canvas_draw" && m.payload.mode === "idle"
  );
  assert.ok(canvasClear, "canvas should be cleared");
  assert.equal(h.companionPrompts.length, 1);
  assert.ok(h.companionPrompts[0].includes("GAME_COMPLETE"));
});

test("round_complete after game_complete is ignored (wbActive=false)", () => {
  const h = new WbTestHarness();
  h.startWordBuilder("running");
  h.handleGameEvent({ type: "game_complete", word: "running" });

  h.sent = [];
  h.companionPrompts = [];

  h.handleGameEvent({ type: "round_complete", round: 1, word: "running", attempts: 1 });

  assert.equal(h.sentGameMessages().length, 0);
});

// ─── ready-loop regression ────────────────────────────────────────────────
console.log("\nready-loop regression");

test("simulating iframe start→ready→start loop: server must not respond to ready", () => {
  const h = new WbTestHarness();
  h.startWordBuilder("running");

  // Iframe receives start, sends ready, server (BUGGY) sends start again, loop...
  for (let i = 0; i < 5; i++) {
    h.handleGameEvent({ type: "ready" });
  }

  const msgs = h.sentGameMessages();
  assert.equal(
    msgs.length,
    0,
    `INFINITE LOOP BUG: server sent ${msgs.length} game_messages in response to ready`
  );
});

// ─── verbal input during WORD_BUILDER ────────────────────────────────────
console.log("\nverbal input during WORD_BUILDER");

/**
 * Mirrors handleFluxEndOfTurn + handleEndOfTurn in session-manager.ts.
 * Returns true if the transcript reached runCompanionResponse, false if dropped anywhere.
 */
function simulateTranscriptPipeline(
  h: WbTestHarness,
  transcript: string,
  source: "eager" | "final"
): boolean {
  const normalized = transcript.toLowerCase().trim();
  if (!normalized) return false;

  if (source === "eager") {
    if (h.getState() !== "IDLE") return false; // not IDLE → not processed, no dedup stamp
    // Only stamp dedup when eager is actually processed (state is IDLE)
    h.lastEagerTranscript = normalized;
    h.lastEagerTranscriptTime = Date.now();
    void h.runCompanionResponse(`VERBAL: ${transcript}`);
    return true;
  }

  // Final transcript: dedup check against recent eager
  if (
    normalized === h.lastEagerTranscript &&
    Date.now() - h.lastEagerTranscriptTime < 3000
  ) {
    return false; // deduplicated
  }

  // handleEndOfTurn state guard (WORD_BUILDER removed in our fix)
  const state = h.getState();
  if (state === "PROCESSING" || state === "SPEAKING") {
    return false;
  }

  void h.runCompanionResponse(`VERBAL: ${transcript}`);
  return true;
}

test("voice input during WORD_BUILDER is NOT dropped — Elli should respond", async () => {
  const h = new WbTestHarness();
  h.startWordBuilder("running");
  h.stateOverride = "WORD_BUILDER";

  const handled = simulateTranscriptPipeline(h, "I don't know how to spell this", "final");

  assert.equal(
    handled,
    true,
    "final transcript during WORD_BUILDER should reach runCompanionResponse, not be dropped"
  );

  await Promise.resolve();
  assert.equal(h.companionPrompts.length, 1, "Elli should respond");
});

test("eager then final: final NOT eaten by dedup when eager was unprocessed (WORD_BUILDER)", async () => {
  const h = new WbTestHarness();
  h.startWordBuilder("running");
  h.stateOverride = "WORD_BUILDER";

  const speech = "I don't know this one";

  // Eager fires first — state is WORD_BUILDER so eager is not processed
  const eagerHandled = simulateTranscriptPipeline(h, speech, "eager");
  assert.equal(eagerHandled, false, "eager during WORD_BUILDER should not be processed");

  // Final fires — MUST NOT be eaten by the eager dedup
  const finalHandled = simulateTranscriptPipeline(h, speech, "final");
  assert.equal(
    finalHandled,
    true,
    "final should reach Elli even though eager just fired the same text (eager was unprocessed)"
  );

  await Promise.resolve();
  assert.equal(h.companionPrompts.length, 1, "Elli should have received the prompt");
});

test("eager then final in IDLE: final still deduplicated correctly (eager WAS processed)", () => {
  const h = new WbTestHarness();
  h.stateOverride = "IDLE"; // no word builder active

  const speech = "let's do some spelling";

  simulateTranscriptPipeline(h, speech, "eager"); // processed (IDLE)
  const finalHandled = simulateTranscriptPipeline(h, speech, "final");

  assert.equal(
    finalHandled,
    false,
    "final should be deduped when eager was actually processed in IDLE"
  );
});

test("voice input during PROCESSING is still correctly dropped (barge-in guard)", () => {
  const h = new WbTestHarness();
  h.startWordBuilder("running");
  h.stateOverride = "PROCESSING";

  const handled = simulateTranscriptPipeline(h, "hello", "final");
  assert.equal(handled, false, "PROCESSING transcripts should still be dropped");
});

test("voice input during SPEAKING is still correctly dropped", () => {
  const h = new WbTestHarness();
  h.startWordBuilder("running");
  h.stateOverride = "SPEAKING";

  const handled = simulateTranscriptPipeline(h, "hello", "final");
  assert.equal(handled, false, "SPEAKING transcripts should still be dropped");
});

// ── Summary ────────────────────────────────────────────────────────────────

setTimeout(() => {
  console.log(`\n${"─".repeat(45)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`\n  ❌ Tests failed — fix the Word Builder server logic`);
    process.exit(1);
  } else {
    console.log(`\n  ✅ All tests pass`);
  }
}, 200);
