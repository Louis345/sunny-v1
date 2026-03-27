import fs from "node:fs";
import path from "node:path";

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

const pkgPath = path.join(process.cwd(), "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
  scripts?: Record<string, string>;
};
const logAttemptSrc = fs.readFileSync(
  path.join(process.cwd(), "src", "agents", "elli", "tools", "logAttempt.ts"),
  "utf-8",
);
const logWorksheetAttemptSrc = fs.readFileSync(
  path.join(
    process.cwd(),
    "src",
    "agents",
    "elli",
    "tools",
    "logWorksheetAttempt.ts",
  ),
  "utf-8",
);
const runtimeModeSrc = fs.readFileSync(
  path.join(process.cwd(), "src", "utils", "runtimeMode.ts"),
  "utf-8",
);
const promptsSrc = fs.readFileSync(
  path.join(process.cwd(), "src", "agents", "prompts.ts"),
  "utf-8",
);
const sessionManagerSrc = fs.readFileSync(
  path.join(process.cwd(), "src", "server", "session-manager.ts"),
  "utf-8",
);

console.log("\nSuite 1 — Testmode launchers are stateless");
const reinaScript = pkg.scripts?.["sunny:testmode:reina"] ?? "";
ok(
  "sunny:testmode:reina enables demo or test mode",
  /DEMO_MODE=true|SUNNY_TEST_MODE=true|SUNNY_STATELESS=true/.test(reinaScript),
  reinaScript,
);
ok(
  "sunny:testmode:reina is not wired to demo mode",
  !/DEMO_MODE=true/.test(reinaScript),
  reinaScript,
);

const spellingScript = pkg.scripts?.["sunny:testmode:spelling"] ?? "";
ok(
  "sunny:testmode:spelling enables demo or test mode",
  /DEMO_MODE=true|SUNNY_TEST_MODE=true|SUNNY_STATELESS=true/.test(spellingScript),
  spellingScript,
);
ok(
  "sunny:testmode:spelling is not wired to demo mode",
  !/DEMO_MODE=true/.test(spellingScript),
  spellingScript,
);

console.log("\nSuite 2 — Attempt logging is blocked in demo/test mode");
ok(
  "runtime mode helper defines stateless contract",
  /isStatelessRun/.test(runtimeModeSrc) &&
    /shouldPersistSessionData/.test(runtimeModeSrc) &&
    /shouldLoadPersistedHistory/.test(runtimeModeSrc),
);
ok(
  "logAttempt uses shared stateless persistence helper",
  /shouldPersistSessionData/.test(logAttemptSrc),
);
ok(
  "logWorksheetAttempt uses shared stateless persistence helper",
  /shouldPersistSessionData/.test(logWorksheetAttemptSrc),
);
ok(
  "logAttempt has explicit no-write branch",
  /appendFile[\s\S]*(return|skip)|return[\s\S]*appendFile/.test(logAttemptSrc) &&
    /(demo|test)/i.test(logAttemptSrc),
);
ok(
  "logWorksheetAttempt has explicit no-write branch",
  /appendFile[\s\S]*(return|skip)|return[\s\S]*appendFile/.test(logWorksheetAttemptSrc) &&
    /(demo|test)/i.test(logWorksheetAttemptSrc),
);

console.log("\nSuite 3 — Prompt building does not load memory in stateless mode");
ok(
  "session prompt checks shared load-history helper",
  /shouldLoadPersistedHistory/.test(promptsSrc),
);

console.log("\nSuite 4 — Session manager uses shared runtime-mode helpers");
ok(
  "session manager avoids raw env checks for stateless/test modes",
  !/process\.env\.(DEMO_MODE|SUNNY_TEST_MODE)/.test(sessionManagerSrc),
);
ok(
  "session manager uses shared runtime-mode helpers",
  /isDemoMode/.test(sessionManagerSrc) &&
    /shouldPersistSessionData/.test(sessionManagerSrc) &&
    /isSunnyTestMode/.test(sessionManagerSrc),
);

console.log("\n--- Summary ---");
if (failures > 0) {
  console.log(`  ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("  All assertions passed");
