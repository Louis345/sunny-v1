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

const sessionContextSrc = fs.readFileSync(
  path.join(process.cwd(), "src", "server", "session-context.ts"),
  "utf-8",
);
const sessionManagerSrc = fs.readFileSync(
  path.join(process.cwd(), "src", "server", "session-manager.ts"),
  "utf-8",
);
const wsHandlerSrc = fs.readFileSync(
  path.join(process.cwd(), "src", "server", "ws-handler.ts"),
  "utf-8",
);
const useSessionSrc = fs.readFileSync(
  path.join(process.cwd(), "web", "src", "hooks", "useSession.ts"),
  "utf-8",
);
const canvasSrc = fs.readFileSync(
  path.join(process.cwd(), "web", "src", "components", "Canvas.tsx"),
  "utf-8",
);
const classifierSrc = fs.readFileSync(
  path.join(process.cwd(), "src", "agents", "classifier", "classifier.ts"),
  "utf-8",
);
const advanceWorksheetBlock = (() => {
  const start = sessionManagerSrc.indexOf("private async advanceWorksheetAfterLogAttempt");
  const end = sessionManagerSrc.indexOf("private launchWorksheetCompletionReward");
  return start >= 0 && end > start
    ? sessionManagerSrc.slice(start, end)
    : sessionManagerSrc;
})();

console.log("\nworksheet pdf contract\n");

ok(
  "session-context supports worksheet_pdf canvas mode",
  /worksheet_pdf/.test(sessionContextSrc),
);
ok(
  "session-context carries pdf asset and overlay fields",
  /pdfAssetUrl/.test(sessionContextSrc) &&
    /overlayFields/.test(sessionContextSrc) &&
    /interactionMode/.test(sessionContextSrc),
);
ok(
  "useSession recognizes worksheet_pdf mode",
  /worksheet_pdf/.test(useSessionSrc) && /interactionMode/.test(useSessionSrc),
);
ok(
  "Canvas renders worksheet_pdf mode",
  /worksheet_pdf/.test(canvasSrc),
);
ok(
  "Canvas distinguishes review worksheet mode",
  /interactionMode/.test(canvasSrc) && /review/.test(canvasSrc),
);
ok(
  "websocket handler accepts worksheet_answer events",
  /worksheet_answer/.test(wsHandlerSrc),
);
ok(
  "session-manager grades via assignment truth",
  /gradeAssignmentAnswer/.test(sessionManagerSrc),
);
ok(
  "session-manager prefers worksheet_pdf when assignment truth exists",
  /mode:\s*"worksheet_pdf"/.test(sessionManagerSrc) &&
    /pdfAssetUrl:\s*this\.assignmentManifest\.pdfAssetUrl/.test(sessionManagerSrc),
);
ok(
  "session-manager logs explicit worksheet_pdf fallback reasons",
  /worksheet_pdf unavailable/.test(sessionManagerSrc),
);
ok(
  "session-manager no longer launches worksheet reward immediately on completion",
  !/launchWorksheetCompletionReward/.test(advanceWorksheetBlock) &&
    /pendingEndSessionReward\s*=\s*true/.test(advanceWorksheetBlock),
);
ok(
  "classifier preserves original PDF in homework destination",
  /copyFileSync\(filePath,\s*destFile\)/.test(classifierSrc) &&
    /ext === "\.pdf"/.test(classifierSrc),
);
ok(
  "classifier includes homework routing guardrail",
  /stabilizeClassification/.test(classifierSrc) &&
    /routing guardrail promoted/.test(classifierSrc),
);

if (failures > 0) {
  console.log(`\n  ${failures} assertion(s) failed\n`);
  process.exit(1);
}

console.log("\n  All worksheet pdf contract assertions passed\n");
