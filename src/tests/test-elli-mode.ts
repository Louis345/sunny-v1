/**
 * Elli mode: registry `voiceEnabled` drives mic gating; SessionManager gates transcripts.
 *
 * Run: npm run test:elli-mode
 */
import { strict as assert } from "assert";
import { WebSocket } from "ws";
import { SessionManager } from "../server/session-manager";
import { getReward, getTool } from "../server/games/registry";
import type { ChildName } from "../companions/loader";

function mockWebSocket(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    OPEN: WebSocket.OPEN,
    send: () => {},
    close: () => {},
    on: () => {},
    once: () => {},
    off: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as WebSocket;
}

function createSessionManager(): SessionManager {
  return new SessionManager(mockWebSocket(), "Ila" as ChildName);
}

// ── Test 1 ────────────────────────────────────────────────────────────────

function test1(): void {
  const entry = getTool("word-builder");
  assert.ok(entry, "Test 1: word-builder must exist in registry");
  assert.equal(
    entry.voiceEnabled,
    true,
    "Test 1: word-builder voiceEnabled is true"
  );
}

// ── Test 2 ────────────────────────────────────────────────────────────────

function test2(): void {
  const entry = getReward("space-invaders");
  assert.ok(entry, "Test 2: space-invaders must exist in registry");
  assert.equal(
    entry.voiceEnabled,
    true,
    "Test 2: space-invaders voiceEnabled is true"
  );
}

// ── Test 3 ────────────────────────────────────────────────────────────────

function test3(): void {
  const sm = createSessionManager();
  const bridge = (sm as unknown as { gameBridge: { launchByName: (...a: unknown[]) => void } })
    .gameBridge;
  bridge.launchByName("space-invaders", "reward", "Ila");
  assert.equal(
    sm.suppressTranscripts,
    false,
    "Test 3: suppressTranscripts stays false when voice-enabled reward starts"
  );
}

// ── Test 4 ────────────────────────────────────────────────────────────────

function test4(): void {
  const sm = createSessionManager();
  const exposed = sm as unknown as {
    spaceInvadersRewardActive: boolean;
    handleGameEvent: (e: Record<string, unknown>) => void;
  };
  sm.suppressTranscripts = true;
  exposed.spaceInvadersRewardActive = true;
  exposed.handleGameEvent({ type: "game_complete" });
  assert.equal(
    sm.suppressTranscripts,
    false,
    "Test 4: suppressTranscripts cleared on game_complete (reward path)"
  );
}

// ── Test 5 ────────────────────────────────────────────────────────────────

async function test5(): Promise<void> {
  const sm = createSessionManager();
  let runCount = 0;
  const inner = sm as unknown as {
    suppressTranscripts: boolean;
    runCompanionResponse: (msg: string) => Promise<void>;
    handleEndOfTurn: (t: string, replay?: boolean) => Promise<void>;
  };
  inner.runCompanionResponse = async () => {
    runCount++;
  };
  inner.suppressTranscripts = true;
  await inner.handleEndOfTurn("r u n n i n g", true);
  assert.equal(
    runCount,
    0,
    "Test 5: runCompanionResponse must not run when suppressTranscripts is true"
  );
}

// ── Test 6 ────────────────────────────────────────────────────────────────

async function test6(): Promise<void> {
  const sm = createSessionManager();
  assert.ok(
    Object.hasOwn(sm, "suppressTranscripts"),
    "Test 6: SessionManager must declare suppressTranscripts (default false)"
  );
  let runCount = 0;
  const inner = sm as unknown as {
    suppressTranscripts: boolean;
    runCompanionResponse: (msg: string) => Promise<void>;
    handleEndOfTurn: (t: string, replay?: boolean) => Promise<void>;
  };
  inner.runCompanionResponse = async () => {
    runCount++;
  };
  inner.suppressTranscripts = false;
  await inner.handleEndOfTurn("r u n n i n g", true);
  assert.equal(
    runCount,
    1,
    "Test 6: runCompanionResponse runs when suppressTranscripts is false"
  );
}

async function main(): Promise<void> {
  console.log("\n🧪 test-elli-mode\n");

  const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [
    { name: "Test 1: word-builder voiceEnabled is true", fn: test1 },
    { name: "Test 2: space-invaders voiceEnabled is true", fn: test2 },
    { name: "Test 3: no transcript suppress for voice-enabled reward", fn: test3 },
    { name: "Test 4: suppressTranscripts cleared on game_complete", fn: test4 },
    { name: "Test 5: transcript ignored during silent game", fn: test5 },
    { name: "Test 6: transcript reaches Elli during active game", fn: test6 },
  ];

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
