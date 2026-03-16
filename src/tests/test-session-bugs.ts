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

async function testShowCanvasEmptyPhonemeBoxes() {
  const result = await showCanvas.execute(
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
  );

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

// ─────────────────────────────────────────────────────────────────────────────
// Bug 5 — TurnStateMachine: second barge-in should not silently drop the first
// ─────────────────────────────────────────────────────────────────────────────

import { TurnStateMachine } from "../server/session-state";

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
function testSanitizeSpaceAfterPunctuation() {
  const flushed: string[] = [];
  const machine = new TurnStateMachine(
    (text) => flushed.push(text),
    () => {},
    () => {}
  );

  // Simulate agent completing with a buffer that has "us.Perfect" joined
  machine["ttsBuffer"] = "get everything set up for us.Perfect! How are you feeling today?";
  machine["state"] = "PROCESSING" as never;
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

// ─────────────────────────────────────────────────────────────────────────────
// Run all tests
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\nRunning session bug tests...\n");

  await test("showCanvas: empty phonemeBox values replaced with '?'", testShowCanvasEmptyPhonemeBoxes);
  await test("TurnStateMachine: multiple barge-ins preserved (not overwritten)", testMultiBargeInNotDropped);
  await test("sanitizeForTTS: space inserted between sentence-end punct and next word", testSanitizeSpaceAfterPunctuation);
  await test("hold-until-complete: no eager flush during PROCESSING, full response on onAgentComplete", testNoEagerFlushDuringProcessing);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main();
