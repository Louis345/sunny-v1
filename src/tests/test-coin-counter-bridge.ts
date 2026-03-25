import * as fs from "node:fs";
import * as path from "node:path";
import { GameBridge } from "../server/game-bridge";
import { getTool } from "../server/games/registry";
import { PSYCHOLOGIST_PROMPT } from "../agents/prompts";

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

// ── Test 1: coin-counter is in TEACHING_TOOLS ───────────────────────────────
{
  const def = getTool("coin-counter");
  assert(
    "Test 1a: getTool(\"coin-counter\") !== null",
    def !== null,
    def === null ? "coin-counter missing from TEACHING_TOOLS" : undefined,
  );
  assert(
    "Test 1b: url contains \"coin-counter\"",
    def !== null &&
      typeof def.url === "string" &&
      def.url.includes("coin-counter"),
    def ? `url=${JSON.stringify(def.url)}` : "no tool entry",
  );
  assert(
    "Test 1c: voiceEnabled === true",
    def !== null && def.voiceEnabled === true,
    def ? `voiceEnabled=${String(def.voiceEnabled)}` : "no tool entry",
  );
}

// ── Test 2: launchByName sends correct config ─────────────────────────────────
{
  const sent: Record<string, unknown>[] = [];
  const bridge = new GameBridge((msg) => sent.push(msg));
  const coins = ["quarter", "dime", "nickel", "penny"] as const;
  bridge.launchByName("coin-counter", "tool", "Reina", {
    coins: [...coins],
    targetAmount: 0.51,
  });
  assertDeep("Test 2: postMessage start payload", sent[0], {
    type: "start",
    childName: "Reina",
    config: { coins: [...coins], targetAmount: 0.51 },
  });
}

// ── Test 3: game_complete fires onEvent (and onComplete per payload rules) ──
{
  let completed: unknown;
  let eventType = "";
  let eventData: unknown;
  const bridge = new GameBridge();
  bridge.onComplete = (data) => {
    completed = data;
  };
  bridge.onEvent = (type, data) => {
    eventType = type;
    eventData = data;
  };
  bridge.handleGameEvent({
    type: "game_complete",
    correct: true,
    amount: 0.51,
    attempts: 1,
  });
  assert(
    "Test 3a: onEvent fires for game_complete",
    eventType === "game_complete" &&
      typeof eventData === "object" &&
      eventData !== null &&
      (eventData as Record<string, unknown>).correct === true,
    `type=${JSON.stringify(eventType)} data=${JSON.stringify(eventData)}`,
  );
  assert(
    "Test 3b: onComplete fires",
    completed !== undefined,
    "onComplete was not called",
  );
  assert(
    "Test 3c: onComplete data contains correct: true",
    typeof completed === "object" &&
      completed !== null &&
      (completed as Record<string, unknown>).correct === true,
    `completed=${JSON.stringify(completed)}`,
  );
}

// ── Test 4: Reina psychologist prompt offers coin-counter; Ila does not ───────
{
  const reinaPrompt = PSYCHOLOGIST_PROMPT("Reina");
  const ilaPrompt = PSYCHOLOGIST_PROMPT("Ila");
  assert(
    "Test 4a: Psychologist prompt for Reina includes coin-counter in capabilities",
    reinaPrompt.includes("coin-counter"),
    "Expected coin-counter in Reina psychologist / canvas capabilities text",
  );
  assert(
    "Test 4b: Psychologist prompt for Ila does NOT offer coin-counter",
    !ilaPrompt.includes("coin-counter"),
    "Ila prompt should omit coin-counter (math-only / registry-driven gating)",
  );
}

// ── Test 5: config is dynamic, not hardcoded in bridge ──────────────────────
{
  const sent: Record<string, unknown>[] = [];
  const bridge = new GameBridge((msg) => sent.push(msg));
  const setA = { coins: ["penny", "nickel"] as string[], targetAmount: 0.06 };
  const setB = { coins: ["quarter"] as string[], targetAmount: 0.25 };
  bridge.launchByName("coin-counter", "tool", "Reina", setA);
  bridge.launchByName("coin-counter", "tool", "Ila", setB);
  assertDeep("Test 5a: first launch config matches setA", sent[0]?.config, setA);
  assertDeep("Test 5b: second launch config matches setB", sent[1]?.config, setB);

  const bridgePath = path.join(__dirname, "../server/game-bridge.ts");
  const src = fs.readFileSync(bridgePath, "utf8");
  const coinLiterals = ["quarter", "dime", "nickel", "penny"].filter((c) =>
    src.includes(`"${c}"`),
  );
  assert(
    "Test 5c: no hardcoded coin name strings in game-bridge.ts",
    coinLiterals.length === 0,
    coinLiterals.length
      ? `found hardcoded: ${coinLiterals.join(", ")}`
      : undefined,
  );
}

console.log(
  failures === 0
    ? "\nAll coin-counter-bridge tests passed."
    : `\n${failures} test(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
