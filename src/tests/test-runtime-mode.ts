import assert from "node:assert";
import {
  isDemoMode,
  isStatelessRun,
  shouldLoadPersistedHistory,
  shouldPersistSessionData,
} from "../utils/runtimeMode";

let failures = 0;

function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    console.log(`  ❌ ${name}`);
    if (detail) console.log(`     ${detail}`);
    failures++;
  }
}

console.log("\nruntime mode\n");

ok(
  "demo mode is stateless",
  isDemoMode({ DEMO_MODE: "true" }) === true &&
    isStatelessRun({ DEMO_MODE: "true" }) === true,
);
ok(
  "test mode is stateless",
  isStatelessRun({ SUNNY_TEST_MODE: "true" }) === true,
);
ok(
  "explicit stateless mode is stateless",
  isStatelessRun({ SUNNY_STATELESS: "true" }) === true,
);
ok(
  "tts disabled alone is not stateless",
  isStatelessRun({ TTS_ENABLED: "false" }) === false,
);
ok(
  "stateless runs do not persist session data",
  shouldPersistSessionData({ DEMO_MODE: "true" }) === false &&
    shouldPersistSessionData({ SUNNY_TEST_MODE: "true" }) === false &&
    shouldPersistSessionData({ SUNNY_STATELESS: "true" }) === false,
);
ok(
  "stateless runs do not load persisted history",
  shouldLoadPersistedHistory({ DEMO_MODE: "true" }) === false &&
    shouldLoadPersistedHistory({ SUNNY_TEST_MODE: "true" }) === false &&
    shouldLoadPersistedHistory({ SUNNY_STATELESS: "true" }) === false,
);
ok(
  "normal runs persist and load history",
  shouldPersistSessionData({}) === true &&
    shouldLoadPersistedHistory({}) === true,
);

if (failures > 0) {
  console.log(`\n  ${failures} assertion(s) failed\n`);
  process.exit(1);
}

assert.ok(true);
console.log("\n  All runtime mode assertions passed\n");
