/**
 * Spec-first contract for pausing server-owned canvas activities.
 *
 * These assertions are expected to FAIL until SessionManager and context
 * injection support a universal pause/resume flow for worksheet and other
 * server-owned activities.
 *
 * Run: npx tsx src/tests/test-canvas-activity-pause.ts
 */
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

const sessionManagerPath = path.join(
  process.cwd(),
  "src",
  "server",
  "session-manager.ts",
);
const sessionContextPath = path.join(
  process.cwd(),
  "src",
  "server",
  "session-context.ts",
);

const sessionManagerSrc = fs.readFileSync(sessionManagerPath, "utf-8");
const sessionContextSrc = fs.readFileSync(sessionContextPath, "utf-8");

console.log("\nSuite 1 — SessionManager exposes a server-owned pause/resume API");
ok(
  "session-manager defines pauseActiveCanvasForCheckIn()",
  /pauseActiveCanvasForCheckIn\s*\(/.test(sessionManagerSrc),
);
ok(
  "session-manager defines resumeActiveCanvasActivity()",
  /resumeActiveCanvasActivity\s*\(/.test(sessionManagerSrc),
);
ok(
  "session-manager defines captureActiveCanvasSnapshot()",
  /captureActiveCanvasSnapshot\s*\(/.test(sessionManagerSrc),
);

console.log("\nSuite 2 — SessionManager tracks active activity + pause state");
ok(
  "session-manager has an active canvas activity field",
  /activeCanvasActivity/.test(sessionManagerSrc),
);
ok(
  "session-manager has a pause state field",
  /pauseState/.test(sessionManagerSrc),
);
ok(
  "session-manager stores a resumable snapshot",
  /snapshot/.test(sessionManagerSrc),
);

console.log("\nSuite 3 — Pause transition hides the canvas without giving ownership to the companion");
ok(
  "pause transition sends canvas_draw idle",
  /pauseActiveCanvasForCheckIn[\s\S]*send\("canvas_draw",\s*\{\s*mode:\s*"idle"\s*\}\)/.test(
    sessionManagerSrc,
  ),
);
ok(
  "worksheet ownership gate still blocks companion showCanvas",
  /ctx && !this\.ctx\.isToolCallAllowed\(tool\)/.test(sessionManagerSrc),
);

console.log("\nSuite 4 — Pause transition prevents worksheet progression while paused");
ok(
  "worksheet answer handling checks pause state",
  /tryConsumeWorksheetTurn[\s\S]*pauseState/.test(sessionManagerSrc) ||
    /tryConsumeWorksheetTurn[\s\S]*paused_for_checkin/.test(sessionManagerSrc),
);
ok(
  "logWorksheetAttempt progression checks pause state",
  /logWorksheetAttempt[\s\S]*pauseState/.test(sessionManagerSrc) ||
    /logWorksheetAttempt[\s\S]*paused_for_checkin/.test(sessionManagerSrc),
);

console.log("\nSuite 5 — Companion context explains that the hidden activity is paused");
ok(
  "session-context mentions paused activity",
  /activity is paused/i.test(sessionContextSrc) ||
    /paused for child check-?in/i.test(sessionContextSrc),
);
ok(
  "session-context warns not to grade hidden activity while paused",
  /do not grade/i.test(sessionContextSrc) &&
    /paused/i.test(sessionContextSrc),
);

console.log("\n--- Summary ---");
if (failures > 0) {
  console.log(`  ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("  All assertions passed");
