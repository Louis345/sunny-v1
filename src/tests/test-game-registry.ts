import { GameBridge } from "../server/game-bridge";
import {
  getReward,
  getTool,
  REWARD_GAMES,
  TEACHING_TOOLS,
} from "../server/games/registry";

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

// ── getTool / getReward ───────────────────────────────────────────────────────
assertDeep(
  "getTool word-builder url",
  getTool("word-builder")?.url,
  TEACHING_TOOLS["word-builder"].url,
);
assertDeep(
  "getTool word-builder defaultConfig",
  getTool("word-builder")?.defaultConfig,
  TEACHING_TOOLS["word-builder"].defaultConfig,
);
{
  const bd = getTool("bd-reversal");
  const pw = bd
    ? (bd.defaultConfig as { probeWords?: unknown }).probeWords
    : undefined;
  assert("getTool bd-reversal includes probeWords", Array.isArray(pw));
}
assert("getTool unknown → null", getTool("not-a-game") === null);
assertDeep(
  "getTool store-game defaultConfig",
  getTool("store-game")?.defaultConfig,
  { itemPool: [] },
);
assertDeep(
  "getTool store-game voiceEnabled",
  getTool("store-game")?.voiceEnabled,
  true,
);

assertDeep(
  "getReward space-invaders defaultConfig",
  getReward("space-invaders")?.defaultConfig,
  REWARD_GAMES["space-invaders"].defaultConfig,
);
assert("getReward unknown → null", getReward("not-a-reward") === null);

// ── GameBridge.launchByName ───────────────────────────────────────────────────
{
  const sent: Record<string, unknown>[] = [];
  const bridge = new GameBridge((msg) => sent.push(msg));
  bridge.launchByName("spell-check", "tool", "Ila", { word: "bathroom" });
  assertDeep("launchByName tool merges config", sent[0], {
    type: "start",
    childName: "Ila",
    config: { word: "bathroom" },
  });
}

{
  const sent: Record<string, unknown>[] = [];
  const bridge = new GameBridge((msg) => sent.push(msg));
  bridge.launchByName("space-invaders", "reward", "Reina");
  assertDeep("launchByName reward uses REWARD_GAMES defaults", sent[0], {
    type: "start",
    childName: "Reina",
    config: { duration_seconds: 180, level: 1 },
  });
}

{
  const sent: Record<string, unknown>[] = [];
  const bridge = new GameBridge((msg) => sent.push(msg));
  bridge.launchByName("no-such-tool", "tool", "Ila");
  assert("launchByName unknown tool → no postMessage", sent.length === 0);
}

{
  const sent: Record<string, unknown>[] = [];
  const bridge = new GameBridge((msg) => sent.push(msg));
  bridge.launchByName("no-such-reward", "reward", "Ila");
  assert("launchByName unknown reward → no postMessage", sent.length === 0);
}

console.log(
  failures === 0
    ? "\nAll game-registry tests passed."
    : `\n${failures} test(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
