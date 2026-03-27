import * as fs from "node:fs";
import * as path from "node:path";
import { GameBridge } from "../server/game-bridge";
import { getReward, getTool } from "../server/games/registry";

let failures = 0;

function assert(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✅ ${name}`);
  } else {
    console.log(`  ❌ ${name}`);
    if (detail) console.log(`     ${detail}`);
    failures++;
  }
}

function assertDeep(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(name, a === e, `expected: ${e}\n     received: ${a}`);
}

// ── Test 1: startGame sends correct postMessage ─────────────────────────────
{
  const sent: Record<string, unknown>[] = [];
  const bridge = new GameBridge((msg) => {
    sent.push(msg);
  });
  bridge.startGame("/games/test.html", "Ila", { word: "running" }, "Elli");
  assertDeep(
    "Test 1: startGame sends { type, childName, companionName, config }",
    sent[0],
    {
      type: "start",
      childName: "Ila",
      companionName: "Elli",
      config: { word: "running" },
    },
  );
}

// ── Test 2: game_complete fires onComplete ────────────────────────────────
{
  let completed: unknown = undefined;
  const bridge = new GameBridge();
  bridge.onComplete = (data) => {
    completed = data;
  };
  bridge.handleGameEvent({ type: "game_complete", score: 100 });
  assertDeep("Test 2: game_complete calls onComplete with payload", completed, {
    score: 100,
  });
}

// ── Test 3: other events fire onEvent, not onComplete ───────────────────────
{
  let eventType = "";
  let eventData: unknown;
  let completeCalled = false;
  const bridge = new GameBridge();
  bridge.onEvent = (type, data) => {
    eventType = type;
    eventData = data;
  };
  bridge.onComplete = () => {
    completeCalled = true;
  };
  bridge.handleGameEvent({ type: "round_complete", round: 1 });
  assert(
    "Test 3a: round_complete calls onEvent with type and data",
    eventType === "round_complete" &&
      JSON.stringify(eventData) === JSON.stringify({ round: 1 }),
    `type=${eventType} data=${JSON.stringify(eventData)}`,
  );
  assert(
    "Test 3b: onComplete NOT called for round_complete",
    !completeCalled,
  );
}

// ── Test 4: endGame sends clear message ─────────────────────────────────────
{
  const sent: Record<string, unknown>[] = [];
  const bridge = new GameBridge((msg) => sent.push(msg));
  bridge.endGame();
  assertDeep("Test 4: endGame sends { type: \"clear\" }", sent[sent.length - 1], {
    type: "clear",
  });
}

// ── Test 5: bridge is stateless about game content ─────────────────────────
{
  const sent: Record<string, unknown>[] = [];
  const bridge = new GameBridge((msg) => sent.push(msg));
  let err: Error | null = null;
  try {
    const inv = getReward("space-invaders")!;
    const sc = getTool("spell-check")!;
    bridge.startGame(inv.url, "Reina", { ...inv.defaultConfig }, "Matilda");
    bridge.startGame(sc.url, "Ila", { word: "dog" }, "Elli");
  } catch (e) {
    err = e as Error;
  }
  assert("Test 5a: two different startGame calls both succeed", err === null);
  assert(
    "Test 5b: two messages recorded",
    sent.length >= 2,
    `sent.length=${sent.length}`,
  );

  const bridgePath = path.join(__dirname, "../server/game-bridge.ts");
  const src = fs.readFileSync(bridgePath, "utf8");
  const banned = ["space-invaders", "spelling", "word-builder", "reversal"];
  const found = banned.filter((s) => src.includes(s));
  assert(
    "Test 5c: no hardcoded game names in game-bridge.ts",
    found.length === 0,
    found.length ? `found: ${found.join(", ")}` : undefined,
  );
}

console.log(failures === 0 ? "\nAll game-bridge tests passed." : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
