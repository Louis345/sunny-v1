/**
 * Word Builder sync contract tests (spec-first).
 *
 * These tests encode the desired behavior for round_complete / round_failed
 * handling. They are run against a harness that mirrors production logic in
 * session-manager.ts — assertions are expected to fail until implementation
 * matches this contract.
 *
 * Run: npm run test:word-builder-sync
 */
import { strict as assert } from "assert";
import {
  WORD_BUILDER_ROUND_COMPLETE,
  WORD_BUILDER_ROUND_FAILED,
} from "../agents/prompts";

type WbTurnState =
  | "IDLE"
  | "LOADING"
  | "WORD_BUILDER"
  | "SPEAKING"
  | "PROCESSING"
  | "CANVAS_PENDING";

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Heuristic: instructional / definitional content (not allowed for short praise). */
function looksLikeWordExplanation(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(means|definition|like when|for example|refers to|synonym)\b/i.test(
    t
  );
}

/**
 * Mirrors session-manager handleGameEvent for Word Builder events only
 * (round_complete, round_failed, ready noop). Keeps production branching
 * so tests fail when spec diverges from code.
 */
class WordBuilderSyncHarness {
  wbWord = "";
  wbRound = 0;
  wbActive = false;
  /** Mirrors session-manager wordBuilderSessionActive — cleared after post-game logAttempt for wbWord */
  wordBuilderSessionActive = false;
  /** Mirrors session-manager wbAwaitingSpell */
  wbAwaitingSpell = false;
  wbPendingEvent: Record<string, unknown> | null = null;
  wbLastProcessedRound = 0;
  turnState: WbTurnState = "WORD_BUILDER";

  /** Ordered trace for ordering assertions */
  trace: Array<"companion" | "next_round"> = [];

  /** Payloads passed to runCompanionResponse */
  companionPrompts: string[] = [];

  /** game_message forwards (next_round) */
  nextRoundSends: Array<{ round: number; word: string }> = [];

  /** All send() calls — for game_complete detection */
  allSends: Array<{ type: string; payload: Record<string, unknown> }> = [];

  /** @returns false if blocked (session still active), like handleToolCall guard */
  startWordBuilder(word: string): boolean {
    if (this.wordBuilderSessionActive) {
      return false;
    }
    this.wbWord = word;
    this.wbRound = 1;
    this.wbActive = true;
    this.wordBuilderSessionActive = true;
    this.wbPendingEvent = null;
    this.wbLastProcessedRound = 0;
    return true;
  }

  private send(type: string, payload: Record<string, unknown> = {}): void {
    this.allSends.push({ type, payload });
    if (type === "game_message") {
      const forward = payload.forward as Record<string, unknown> | undefined;
      if (forward?.type === "next_round") {
        this.trace.push("next_round");
        this.nextRoundSends.push({
          round: Number(forward.round),
          word: String(forward.word ?? ""),
        });
      }
    }
  }

  private armWbActivityTimeout(): void {
    /* no-op in harness */
  }

  private wbSendRound(): void {
    if (!this.wbActive || !this.wbWord || this.wbRound < 2) return;
    this.send("game_message", {
      forward: {
        type: "next_round",
        round: this.wbRound,
        word: this.wbWord,
        playerName: "Ila",
      },
    });
  }

  private wbAdvanceRound(): void {
    this.wbRound++;
    if (this.wbActive && this.wbRound >= 2 && this.wbRound <= 4) {
      this.wbSendRound();
    }
  }

  runCompanionResponse(prompt: string): Promise<void> {
    this.trace.push("companion");
    this.companionPrompts.push(prompt);
    return Promise.resolve();
  }

  /**
   * Call when external state machine enters WORD_BUILDER (mirrors turnSM callback).
   */
  flushPendingIfWordBuilder(): void {
    if (this.turnState === "WORD_BUILDER" && this.wbPendingEvent) {
      const pending = this.wbPendingEvent;
      this.wbPendingEvent = null;
      setImmediate(() => this.handleGameEvent(pending));
    }
  }

  setTurnState(state: WbTurnState): void {
    this.turnState = state;
    this.flushPendingIfWordBuilder();
  }

  handleGameEvent(event: Record<string, unknown>): void {
    const type = event.type as string;

    if (type === "ready") {
      return;
    }

    if (type === "round_complete") {
      if (!this.wbActive) return;
      this.armWbActivityTimeout();

      const state = this.turnState;
      if (
        state === "SPEAKING" ||
        state === "PROCESSING" ||
        state === "LOADING" ||
        state === "CANVAS_PENDING"
      ) {
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

      if (completedRound === 3) {
        this.wbAdvanceRound();
        return;
      }

      if (completedRound === 4) {
        void this.runCompanionResponse(
          WORD_BUILDER_ROUND_COMPLETE(4, this.wbWord, attempts)
        ).catch(() => {});
        return;
      }

      if (completedRound === 1 || completedRound === 2) {
        void this.runCompanionResponse(
          WORD_BUILDER_ROUND_COMPLETE(completedRound, this.wbWord, attempts)
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
      this.armWbActivityTimeout();

      const state = this.turnState;
      const word = this.wbWord;

      if (
        state === "SPEAKING" ||
        state === "PROCESSING" ||
        state === "LOADING" ||
        state === "CANVAS_PENDING"
      ) {
        this.wbPendingEvent = event;
        return;
      }

      void this.runCompanionResponse(
        WORD_BUILDER_ROUND_FAILED(this.wbRound, word)
      )
        .then(() => this.wbAdvanceRound())
        .catch(() => this.wbAdvanceRound());
      return;
    }

    if (type === "game_complete") {
      /* Mirrors session-manager: defer wb cleanup until logAttempt for wbWord */
      if (!this.wbActive) return;
      this.wbAwaitingSpell = true;
    }
  }

  /** Same fields as SessionManager.wbEndCleanup */
  private clearWordBuilderSession(): void {
    this.wbAwaitingSpell = false;
    this.wbActive = false;
    this.wbRound = 0;
    this.wbWord = "";
    this.wbLastProcessedRound = 0;
    this.wbPendingEvent = null;
    this.wordBuilderSessionActive = false;
  }

  /** Mirrors logAttempt branch that ends Word Builder after memory spell */
  onLogAttempt(args: { word: string; correct: boolean }): void {
    const key = args.word.toLowerCase().trim();
    if (this.wbAwaitingSpell && key && key === this.wbWord.toLowerCase().trim()) {
      this.clearWordBuilderSession();
    }
  }
}

async function flushAsync(): Promise<void> {
  await new Promise<void>((r) => setImmediate(r));
}

const roundComplete = (round: number, word: string, correct = true) => ({
  type: "round_complete" as const,
  round,
  word,
  correct,
});

// ── Test 1 ────────────────────────────────────────────────────────────────

async function test1(): Promise<void> {
  const h = new WordBuilderSyncHarness();
  h.startWordBuilder("running");
  h.handleGameEvent(roundComplete(1, "running", true));
  await flushAsync();

  assert.equal(
    h.companionPrompts.length,
    1,
    "Test 1: runCompanionResponse should be called exactly once for round 1"
  );
  assert.ok(
    h.companionPrompts[0].includes("running"),
    "Test 1: prompt should contain the word \"running\""
  );
}

// ── Test 2 ────────────────────────────────────────────────────────────────

async function test2(): Promise<void> {
  const h = new WordBuilderSyncHarness();
  h.startWordBuilder("running");
  h.handleGameEvent(roundComplete(1, "running", true));
  await flushAsync();

  assert.equal(h.companionPrompts.length, 1, "Test 2: single praise for round 1");
  const praise = h.companionPrompts[0];
  assert.ok(
    wordCount(praise) < 15,
    `Test 2: round 1 praise should be under 15 words (got ${wordCount(praise)})`
  );
  assert.ok(
    !looksLikeWordExplanation(praise),
    "Test 2: no explanation of the word"
  );

  const lastCompanionIdx = h.trace.lastIndexOf("companion");
  const firstNextIdx = h.trace.indexOf("next_round");
  assert.ok(
    lastCompanionIdx !== -1 && firstNextIdx !== -1 && lastCompanionIdx < firstNextIdx,
    "Test 2: next_round 2 must be sent after companion response"
  );
  assert.equal(
    h.nextRoundSends[0]?.round,
    2,
    "Test 2: first next_round should be round 2"
  );
}

// ── Test 3 ────────────────────────────────────────────────────────────────

async function test3(): Promise<void> {
  const h = new WordBuilderSyncHarness();
  h.startWordBuilder("running");
  h.handleGameEvent(roundComplete(1, "running"));
  await flushAsync();
  h.handleGameEvent(roundComplete(2, "running"));
  await flushAsync();

  assert.ok(
    h.companionPrompts.length >= 1,
    "Test 3: need companion for round 2"
  );
  const round2Praise = h.companionPrompts[1];
  assert.ok(
    wordCount(round2Praise) < 20,
    `Test 3: round 2 praise under 20 words (got ${wordCount(round2Praise)})`
  );

  const idxR2 = h.trace.lastIndexOf("companion");
  const nextAfter = h.trace.indexOf("next_round", idxR2);
  assert.ok(
    idxR2 !== -1 && nextAfter !== -1 && idxR2 < nextAfter,
    "Test 3: next_round 3 after round 2 response"
  );
  assert.ok(
    h.nextRoundSends.some((n) => n.round === 3),
    "Test 3: next_round 3 should be sent"
  );
}

// ── Test 4 ────────────────────────────────────────────────────────────────

async function test4(): Promise<void> {
  const h = new WordBuilderSyncHarness();
  h.startWordBuilder("running");
  h.handleGameEvent(roundComplete(1, "running"));
  await flushAsync();
  h.handleGameEvent(roundComplete(2, "running"));
  await flushAsync();
  const before = h.companionPrompts.length;
  h.handleGameEvent(roundComplete(3, "running"));
  await flushAsync();

  assert.equal(
    h.companionPrompts.length,
    before,
    "Test 4: round 3 must NOT call runCompanionResponse (silent advance)"
  );
  assert.ok(
    h.nextRoundSends.some((n) => n.round === 4),
    "Test 4: next_round 4 sent immediately after round 3 complete"
  );
  assert.ok(
    h.companionPrompts.length >= 2,
    "Test 4: rounds 1 and 2 should both produce praise before silent round 3"
  );
}

// ── Test 5 ────────────────────────────────────────────────────────────────

async function test5(): Promise<void> {
  const h = new WordBuilderSyncHarness();
  h.startWordBuilder("running");
  for (const r of [1, 2, 3] as const) {
    h.handleGameEvent(roundComplete(r, "running"));
    await flushAsync();
  }

  const nBefore = h.companionPrompts.length;
  h.handleGameEvent(roundComplete(4, "running"));
  await flushAsync();

  assert.ok(
    h.companionPrompts.length > nBefore,
    "Test 5: round 4 should trigger celebration (runCompanionResponse)"
  );
  const gameCompleteSent = h.allSends.some(
    (s) =>
      s.type === "game_message" &&
      (s.payload.forward as Record<string, unknown> | undefined)?.type ===
        "game_complete"
  );
  assert.equal(
    gameCompleteSent,
    false,
    "Test 5: game_complete must not be sent on round_complete alone (iframe sends game_complete)"
  );
}

// ── Test 6 ────────────────────────────────────────────────────────────────

async function test6(): Promise<void> {
  const h = new WordBuilderSyncHarness();
  h.startWordBuilder("running");
  h.handleGameEvent(roundComplete(1, "running"));
  await flushAsync();

  h.handleGameEvent({
    type: "round_failed",
    round: 2,
    word: "running",
  });
  await flushAsync();

  assert.equal(
    h.companionPrompts.length,
    2,
    "Test 6: round 1 praise + round_failed encouragement"
  );
  const msg = h.companionPrompts[1];
  assert.ok(
    wordCount(msg) < 15,
    `Test 6: encouragement under 15 words (got ${wordCount(msg)})`
  );
  assert.ok(
    !msg.toLowerCase().includes("running"),
    "Test 6: must NOT reveal the answer word in the system prompt"
  );
}

// ── Test 7 ────────────────────────────────────────────────────────────────

async function test7(): Promise<void> {
  const h = new WordBuilderSyncHarness();
  h.startWordBuilder("running");
  h.turnState = "SPEAKING";
  h.handleGameEvent(roundComplete(1, "running"));
  assert.ok(h.wbPendingEvent, "Test 7: event should buffer while SPEAKING");
  assert.equal(h.companionPrompts.length, 0, "Test 7: no companion while SPEAKING");

  h.setTurnState("WORD_BUILDER");
  await flushAsync();

  assert.equal(
    h.companionPrompts.length,
    1,
    "Test 7: flushed pending should call runCompanionResponse once"
  );
}

// ── Test 8 ────────────────────────────────────────────────────────────────

async function test8(): Promise<void> {
  const h = new WordBuilderSyncHarness();
  h.startWordBuilder("running");
  const ev = roundComplete(1, "running");
  h.handleGameEvent(ev);
  h.handleGameEvent({ ...ev });
  await flushAsync();

  assert.equal(
    h.companionPrompts.length,
    1,
    "Test 8: duplicate round_complete deduped — one companion, no double-speak"
  );
  assert.equal(
    h.nextRoundSends.length,
    1,
    "Test 8: duplicate iframe events must not emit multiple next_round messages"
  );
}

// ── Test 9 — session stays active until post-game logAttempt for wbWord ─────

async function test9(): Promise<void> {
  const h = new WordBuilderSyncHarness();
  assert.ok(h.startWordBuilder("running"), "Test 9: first startWordBuilder succeeds");
  for (const r of [1, 2, 3] as const) {
    h.handleGameEvent(roundComplete(r, "running"));
    await flushAsync();
  }
  h.handleGameEvent(roundComplete(4, "running"));
  await flushAsync();

  h.handleGameEvent({ type: "game_complete" });
  await flushAsync();

  assert.equal(h.wbActive, true, "Test 9: wbActive still true after game_complete");
  assert.equal(
    h.wordBuilderSessionActive,
    true,
    "Test 9: wordBuilderSessionActive still true until memory spell logAttempt"
  );
  assert.ok(h.wbAwaitingSpell, "Test 9: wbAwaitingSpell after game_complete");
  assert.equal(h.wbWord, "running", "Test 9: wbWord kept for spell-from-memory");

  assert.equal(
    h.startWordBuilder("hopped"),
    false,
    "Test 9: second startWordBuilder blocked until logAttempt for wbWord"
  );

  h.onLogAttempt({ word: "running", correct: true });
  assert.equal(h.wbActive, false, "Test 9: wbActive false after logAttempt");
  assert.equal(h.wordBuilderSessionActive, false, "Test 9: session cleared after logAttempt");
  assert.equal(h.wbWord, "", "Test 9: wbWord cleared");

  assert.ok(
    h.startWordBuilder("hopped"),
    "Test 9: second startWordBuilder allowed after cleanup"
  );
  assert.equal(h.wbWord, "hopped", "Test 9: new word active");
}

// ── Runner ────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => Promise<void> }> = [
  { name: "Test 1: round_complete triggers Elli response (word in prompt, once)", fn: test1 },
  { name: "Test 2: round 1 — short praise, no explanation, next_round 2 after", fn: test2 },
  { name: "Test 3: round 2 — medium praise, next_round 3 after", fn: test3 },
  { name: "Test 4: round 3 — silent advance, next_round 4", fn: test4 },
  { name: "Test 5: round 4 — celebrate; game_complete not from server yet", fn: test5 },
  { name: "Test 6: round_failed — short encouragement, no answer", fn: test6 },
  { name: "Test 7: buffer while SPEAKING, flush on WORD_BUILDER", fn: test7 },
  { name: "Test 8: no double-speak on duplicate events", fn: test8 },
  {
    name: "Test 9: game_complete keeps session until logAttempt for wbWord",
    fn: test9,
  },
];

async function main(): Promise<void> {
  console.log("\n🧪 test-word-builder-sync (spec vs production harness)\n");

  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (e) {
      failed++;
      console.log(`  ❌ ${name}`);
      if (e instanceof Error) {
        console.log(`     ${e.message}`);
      }
    }
  }

  console.log("\n─────────────────────────────────────────────");
  console.log(`  ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
