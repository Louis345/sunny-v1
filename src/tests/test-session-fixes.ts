/**
 * Regression tests for session fixes (ElevenLabs clear, Deepgram spelling patience,
 * canvas-before-attempt prompt rule).
 *
 * Run: npm run test:session-fixes
 *
 * TDD / fail-first check: revert any fix below and this file should fail assertions:
 * - deepgram-turn.ts: FLUX_LISTEN_OPTIONS back to 3000 / 0.6 / 0.45
 * - ws-tts-bridge.ts: remove the JSON.stringify({ type: "clear" }) send in stop()
 * - prompts.ts: remove "CANVAS BEFORE ATTEMPT — ABSOLUTE RULE" block
 */
import { strict as assert } from "assert";
import fs from "node:fs";
import path from "node:path";
import { FLUX_LISTEN_OPTIONS } from "../deepgram-turn";

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), "src", rel), "utf-8");
}

function testDeepgramFluxPatience(): void {
  assert.equal(
    FLUX_LISTEN_OPTIONS.eot_timeout_ms,
    5000,
    "Deepgram: eot_timeout_ms should be 5000ms for letter-by-letter spelling patience"
  );
  assert.equal(
    FLUX_LISTEN_OPTIONS.eot_threshold,
    0.8,
    "Deepgram: eot_threshold should be 0.8"
  );
  assert.equal(
    FLUX_LISTEN_OPTIONS.eager_eot_threshold,
    0.65,
    "Deepgram: eager_eot_threshold should be 0.65"
  );
}

function testElevenLabsClearOnStop(): void {
  const src = readSrc("server/ws-tts-bridge.ts");
  assert.ok(
    src.includes('JSON.stringify({ type: "clear" })'),
    "WsTtsBridge.stop() must send ElevenLabs clear payload before tearing down socket"
  );
  // Must appear in stop() before terminate path
  const stopIdx = src.indexOf("stop(): void");
  assert.ok(stopIdx >= 0, "stop() method must exist");
  const stopBlock = src.slice(stopIdx, stopIdx + 800);
  const clearIdx = stopBlock.indexOf("clear");
  const termIdx = stopBlock.indexOf("terminate");
  assert.ok(clearIdx >= 0 && termIdx >= 0 && clearIdx < termIdx,
    "clear send must occur before terminate() in stop()");
}

function testPromptCanvasBeforeAttempt(): void {
  const src = readSrc("agents/prompts.ts");
  assert.ok(
    src.includes("CANVAS BEFORE ATTEMPT — ABSOLUTE RULE"),
    "buildSessionPrompt psychologist template must include CANVAS BEFORE ATTEMPT block"
  );
  assert.ok(
    src.includes("Never call showCanvas(teaching) before the"),
    "Canvas rule must forbid showCanvas(teaching) before attempt"
  );
  assert.ok(
    src.includes("If you find yourself about to call showCanvas"),
    "Canvas rule must include self-check before showCanvas"
  );
}

function main(): void {
  console.log("\n📋 Session fixes regression tests\n");
  testDeepgramFluxPatience();
  console.log("  ✅ Deepgram Flux listen options");
  testElevenLabsClearOnStop();
  console.log("  ✅ ElevenLabs clear on stop()");
  testPromptCanvasBeforeAttempt();
  console.log("  ✅ Prompt canvas-before-attempt rule");
  console.log("\n  All session-fix tests passed.\n");
}

main();
