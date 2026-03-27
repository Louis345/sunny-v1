import fs from "node:fs";
import path from "node:path";
import { ALL_TOOLS } from "../agents/elli/tools/generateToolDocs";

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
const sessionManagerSrc = fs.readFileSync(sessionManagerPath, "utf-8");

console.log("\nSuite 1 — logWorksheetAttempt tool exists and is registered");
ok(
  "ALL_TOOLS has logWorksheetAttempt",
  "logWorksheetAttempt" in ALL_TOOLS &&
    typeof (ALL_TOOLS as { logWorksheetAttempt?: { execute?: unknown } })
      .logWorksheetAttempt?.execute === "function",
);

console.log("\nSuite 2 — server no longer calls evaluateWorksheetAnswer / gradeWorksheetTurn");
ok(
  "session-manager does not reference gradeWorksheetTurn",
  !sessionManagerSrc.includes("gradeWorksheetTurn"),
);
ok(
  "session-manager does not reference evaluateWorksheetAnswer",
  !sessionManagerSrc.includes("evaluateWorksheetAnswer"),
);

console.log("\nSuite 3 — server advances worksheet only via logWorksheetAttempt + advanceWorksheetAfterLogAttempt");
ok(
  "tryConsumeWorksheetTurn forwards to runCompanionResponse",
  /tryConsumeWorksheetTurn[\s\S]*runCompanionResponse/.test(sessionManagerSrc),
);
ok(
  "handleToolCall sets pendingWorksheetLog for logWorksheetAttempt",
  sessionManagerSrc.includes("pendingWorksheetLog") &&
    sessionManagerSrc.includes('tool === "logWorksheetAttempt"'),
);
ok(
  "session-manager does not server-grade worksheet transcripts (Matilda via logWorksheetAttempt only)",
  !sessionManagerSrc.includes("gradeWorksheetTranscript("),
);
ok(
  "session-manager normalizes worksheet rows before queuing",
  sessionManagerSrc.includes("normalizeWorksheetProblem("),
);
ok(
  "runCompanionResponse flushes pending worksheet log after audio_done",
  /audio_done[\s\S]*pendingWorksheetLog[\s\S]*advanceWorksheetAfterLogAttempt/.test(
    sessionManagerSrc,
  ),
);

console.log("\nSuite 4 — confused utterances still reach Matilda (no server-side grading skip)");
ok(
  "tryConsumeWorksheetTurn does not use isConfusedUtterance to block",
  !/tryConsumeWorksheetTurn[\s\S]*isConfusedUtterance/.test(sessionManagerSrc),
);

console.log("\n--- Summary ---");
if (failures > 0) {
  console.log(`  ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("  All assertions passed");
process.exit(0);
