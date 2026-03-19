/**
 * Tests for known session bugs.
 * Run with: npx tsx src/tests/test-session-bugs.ts
 *
 * Each test is intentionally written to fail BEFORE the fix is applied.
 */
import assert from "node:assert/strict";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✅ ${name}`);
      passed++;
    })
    .catch((err: unknown) => {
      console.error(`  ❌ ${name}`);
      console.error(`     ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bug 4 — showCanvas: empty phonemeBox values should become "?"
// ─────────────────────────────────────────────────────────────────────────────

import { showCanvas } from "../agents/elli/tools/showCanvas";
import { buildAgentTools } from "../agents/elli/run";
import { canvasHasRenderableContent } from "../shared/canvasRenderability";

async function testShowCanvasEmptyPhonemeBoxes() {
  const execute = showCanvas.execute;
  assert.ok(execute, "showCanvas.execute should exist");

  const result = await execute(
    {
      mode: "teaching",
      content: "bad",
      phonemeBoxes: [
        { position: "first", value: "", highlighted: true },
        { position: "middle", value: "", highlighted: false },
        { position: "last", value: "", highlighted: false },
      ],
    },
    { toolCallId: "test-1", messages: [] }
  ) as Awaited<ReturnType<NonNullable<typeof showCanvas.execute>>> & {
    phonemeBoxes?: Array<{ position: string; value: string; highlighted: boolean }>;
  };

  assert.ok(result.phonemeBoxes, "phonemeBoxes should exist in result");
  for (const box of result.phonemeBoxes!) {
    assert.notEqual(
      box.value,
      "",
      `phonemeBox at position "${box.position}" has empty value — should be "?"`
    );
    assert.equal(
      box.value,
      "?",
      `phonemeBox at position "${box.position}" should be "?" but got "${box.value}"`
    );
  }
}

async function testShowCanvasSpellingMode() {
  const execute = showCanvas.execute;
  assert.ok(execute, "showCanvas.execute should exist");

  const result = await execute(
    {
      mode: "spelling",
      spellingWord: "railroad",
      spellingRevealed: ["r", "a"],
      showWord: "hidden",
      compoundBreak: 4,
      streakCount: 2,
      personalBest: 5,
    },
    { toolCallId: "test-spelling", messages: [] }
  ) as Awaited<ReturnType<NonNullable<typeof showCanvas.execute>>> & {
    spellingWord?: string;
    spellingRevealed?: string[];
    showWord?: "hidden" | "hint" | "always";
    compoundBreak?: number;
    streakCount?: number;
    personalBest?: number;
  };

  assert.equal(result.spellingWord, "railroad");
  assert.deepEqual(result.spellingRevealed, ["r", "a"]);
  assert.equal(result.showWord, "hidden");
  assert.equal(result.compoundBreak, 4);
  assert.equal(result.streakCount, 2);
  assert.equal(result.personalBest, 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bug 5 — TurnStateMachine: second barge-in should not silently drop the first
// ─────────────────────────────────────────────────────────────────────────────

import { TurnStateMachine } from "../server/session-state";
import { SessionManager, shouldTriggerTransitionToWorkPhase } from "../server/session-manager";
import { transitionToWork, resetTransitionToWork } from "../agents/elli/tools/transitionToWork";

function testMultiBargeInNotDropped() {
  const logs: string[] = [];
  const machine = new TurnStateMachine(
    () => {},
    (msg) => logs.push(msg),
    () => {}
  );

  machine.setPendingTranscript("first answer");
  machine.setPendingTranscript("second answer");

  const consumed = machine.consumePendingTranscript();

  // Both transcripts should be preserved — concatenated or as an array.
  // Currently only "second answer" is kept (the first is silently overwritten).
  assert.ok(
    consumed !== null,
    "consumePendingTranscript should return something"
  );
  assert.ok(
    consumed!.includes("first answer"),
    `Expected consumed transcript to contain "first answer" but got: "${consumed}"`
  );
  assert.ok(
    consumed!.includes("second answer"),
    `Expected consumed transcript to contain "second answer" but got: "${consumed}"`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bug 7 — sanitizeForTTS: no space between "us." and "Perfect" when buffer
// halves are concatenated across a tool-call boundary
// ─────────────────────────────────────────────────────────────────────────────

// sanitizeForTTS is not exported, so we test it indirectly via TurnStateMachine:
// feed tokens that produce "us.Perfect" in the buffer and verify the flushed
// string has a space inserted.
async function testSanitizeSpaceAfterPunctuation() {
  const flushed: string[] = [];
  const machine = new TurnStateMachine(
    (text) => flushed.push(text),
    () => {},
    () => {}
  );

  // Simulate agent completing with a buffer that has "us.Perfect" joined
  machine.onEndOfTurn();
  await new Promise<void>((resolve) => setImmediate(resolve));
  machine["ttsBuffer"] = "get everything set up for us.Perfect! How are you feeling today?";
  machine.onAgentComplete();

  assert.ok(flushed.length > 0, "expected at least one flush");
  const combined = flushed.join("");
  assert.ok(
    !combined.includes("us.Perfect"),
    `Expected "us.Perfect" to have a space inserted, but got: "${combined}"`
  );
  assert.ok(
    combined.includes("us. Perfect"),
    `Expected "us. Perfect" (with space) in flushed text, but got: "${combined}"`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hold-until-complete — tokens during PROCESSING must NOT flush to TTS
// ─────────────────────────────────────────────────────────────────────────────

async function testNoEagerFlushDuringProcessing() {
  const flushed: string[] = [];
  const machine = new TurnStateMachine(
    (text) => flushed.push(text),
    () => {},
    () => {}
  );

  // onEndOfTurn transitions LOADING → PROCESSING via setImmediate;
  // wait for that tick so state is actually PROCESSING when tokens arrive.
  machine.onEndOfTurn();
  await new Promise<void>((resolve) => setImmediate(resolve));

  // Feed tokens that previously triggered an eager flush (>= 80 chars)
  const tokens = [
    "That", " sounds", " perfect!", " Let's", " do", " one", " word",
    " together,", " and", " then", " you", " can", " go", " get", " cozy",
    " for", " bed."
  ];
  for (const t of tokens) machine.onToken(t);

  assert.equal(
    flushed.length,
    0,
    `Expected no flushes during PROCESSING but got ${flushed.length}: ${JSON.stringify(flushed)}`
  );

  // Full response should flush when agent completes
  machine.onAgentComplete();
  assert.ok(flushed.length > 0, "Expected flush after onAgentComplete");
  const combined = flushed.join("");
  assert.ok(
    combined.includes("That sounds perfect"),
    `Expected full response in flush, got: "${combined}"`
  );
  assert.ok(
    combined.includes("cozy for bed"),
    `Expected complete sentence in flush (no orphan 'bed.'), got: "${combined}"`
  );
}

async function testSpeakingPersistsUntilPlaybackComplete() {
  const machine = new TurnStateMachine(
    () => {},
    () => {},
    () => {}
  );

  machine.onEndOfTurn();
  await new Promise<void>((resolve) => setImmediate(resolve));
  machine.onAgentComplete();
  assert.equal(
    machine.getState(),
    "SPEAKING",
    "Agent completion should move turn into SPEAKING"
  );

  assert.equal(
    machine.getState(),
    "SPEAKING",
    "Turn should remain SPEAKING until browser playback completes"
  );

  machine.onPlaybackComplete();
  assert.equal(
    machine.getState(),
    "IDLE",
    "Turn should return to IDLE only after playback completion"
  );
}

async function testNoTranscriptReplayDuringAssistantTurn() {
  const fakeWs = {
    OPEN: 1,
    readyState: 1,
    send: () => {},
  };

  const manager = new SessionManager(fakeWs as never, "Ila") as unknown as {
    handleEndOfTurn: (transcript: string, isReplay?: boolean) => Promise<void>;
    turnSM: TurnStateMachine;
  };

  manager.turnSM.onEndOfTurn();
  await new Promise<void>((resolve) => setImmediate(resolve));
  manager.turnSM.onAgentComplete();
  assert.equal(manager.turnSM.getState(), "SPEAKING");

  await manager.handleEndOfTurn("let's do spelling");

  assert.equal(
    manager.turnSM.consumePendingTranscript(),
    null,
    "Transcript captured during assistant-owned turn should be discarded, not queued for replay"
  );
  assert.equal(
    manager.turnSM.getState(),
    "SPEAKING",
    "Assistant-owned turn should remain SPEAKING after stray transcript is ignored"
  );
}

async function testTransitionToWorkOnlyOncePerSession() {
  resetTransitionToWork();
  const execute = transitionToWork.execute;
  assert.ok(execute, "transitionToWork.execute should exist");

  const first = await execute(
    { childName: "Ila" },
    { toolCallId: "transition-1", messages: [] }
  );
  const second = await execute(
    { childName: "Ila" },
    { toolCallId: "transition-2", messages: [] }
  );

  assert.match(String(first), /transitioned to work/i);
  assert.match(String(second), /already transitioned to work/i);
}

function testAgentToolsHideSessionStartAndConditionalTransition() {
  const defaultTools = buildAgentTools();
  assert.ok(!("startSession" in defaultTools), "startSession should not be exposed to the model");
  assert.ok(!("dateTime" in defaultTools), "dateTime should not be exposed to the model");
  assert.ok("transitionToWork" in defaultTools, "transitionToWork should be available when allowed");

  const learningTools = buildAgentTools({ allowTransitionToWork: false });
  assert.ok(!("transitionToWork" in learningTools), "transitionToWork should be hidden after learning has started");
}

function testMathCanvasDoesNotBecomeActiveWord() {
  const fakeWs = {
    OPEN: 1,
    readyState: 1,
    send: () => {},
  };

  const manager = new SessionManager(fakeWs as never, "Ila") as unknown as {
    handleToolCall: (tool: string, args: Record<string, unknown>, result: unknown) => void;
    activeWord: string | null;
  };

  manager.handleToolCall(
    "showCanvas",
    { mode: "teaching", content: "5 + 3 = ?" },
    { mode: "teaching", content: "5 + 3 = ?" }
  );

  assert.equal(
    manager.activeWord,
    null,
    "Math teaching canvases should not overwrite the active word tracker"
  );
}

function testPhonemeBoxesCountAsRenderableCanvasContent() {
  assert.equal(
    canvasHasRenderableContent({
      mode: "teaching",
      phonemeBoxes: [
        { position: "first", value: "s", highlighted: true },
        { position: "middle", value: "a", highlighted: false },
        { position: "last", value: "d", highlighted: false },
      ],
    }),
    true,
    "Teaching canvases with phonemeBoxes should count as renderable content"
  );
}

function testTransitionPromptStopsAfterLearningStarts() {
  assert.equal(
    shouldTriggerTransitionToWorkPhase(5, "Ila", false),
    true,
    "Ila should get the transition prompt at turn 5 before learning starts"
  );
  assert.equal(
    shouldTriggerTransitionToWorkPhase(6, "Ila", true),
    false,
    "Transition prompt should stop once learning has already started"
  );
  assert.equal(
    shouldTriggerTransitionToWorkPhase(8, "Reina", false),
    false,
    "Transition prompt is Ila-specific"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Run all tests
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\nRunning session bug tests...\n");

  await test("showCanvas: empty phonemeBox values replaced with '?'", testShowCanvasEmptyPhonemeBoxes);
  await test("showCanvas: spelling mode returns spelling fields", testShowCanvasSpellingMode);
  await test("TurnStateMachine: multiple barge-ins preserved (not overwritten)", testMultiBargeInNotDropped);
  await test("sanitizeForTTS: space inserted between sentence-end punct and next word", testSanitizeSpaceAfterPunctuation);
  await test("hold-until-complete: no eager flush during PROCESSING, full response on onAgentComplete", testNoEagerFlushDuringProcessing);
  await test("turn stays SPEAKING until playback completes", testSpeakingPersistsUntilPlaybackComplete);
  await test("transcripts during assistant-owned turn are ignored, not replayed", testNoTranscriptReplayDuringAssistantTurn);
  await test("transitionToWork only succeeds once per session", testTransitionToWorkOnlyOncePerSession);
  await test("agent tools hide session-start tools and conditionally hide transitionToWork", testAgentToolsHideSessionStartAndConditionalTransition);
  await test("math teaching canvas does not become activeWord", testMathCanvasDoesNotBecomeActiveWord);
  await test("phonemeBoxes-only teaching canvas counts as renderable content", testPhonemeBoxesCountAsRenderableCanvasContent);
  await test("transition prompt stops after learning starts", testTransitionPromptStopsAfterLearningStarts);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main();
