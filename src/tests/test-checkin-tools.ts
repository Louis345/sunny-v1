import assert from "node:assert";
import { ALL_TOOLS } from "../agents/elli/tools/generateToolDocs";
import { getToolsForSessionType } from "../server/session-type-registry";

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

async function main(): Promise<void> {
  console.log("\nSuite 1 — pause/resume tools exist");
  ok(
    "ALL_TOOLS has requestPauseForCheckIn",
    "requestPauseForCheckIn" in ALL_TOOLS &&
      typeof (ALL_TOOLS as { requestPauseForCheckIn?: { execute?: unknown } })
        .requestPauseForCheckIn?.execute === "function",
  );
  ok(
    "ALL_TOOLS has requestResumeActivity",
    "requestResumeActivity" in ALL_TOOLS &&
      typeof (ALL_TOOLS as { requestResumeActivity?: { execute?: unknown } })
        .requestResumeActivity?.execute === "function",
  );

  console.log("\nSuite 2 — worksheet sessions expose pause/resume tools");
  {
    const toolNames = Object.keys(getToolsForSessionType("worksheet"));
    ok("worksheet has requestPauseForCheckIn", toolNames.includes("requestPauseForCheckIn"));
    ok("worksheet has requestResumeActivity", toolNames.includes("requestResumeActivity"));
  }

  console.log("\nSuite 3 — spelling sessions expose pause/resume tools for server-owned games");
  {
    const toolNames = Object.keys(getToolsForSessionType("spelling"));
    ok("spelling has requestPauseForCheckIn", toolNames.includes("requestPauseForCheckIn"));
    ok("spelling has requestResumeActivity", toolNames.includes("requestResumeActivity"));
  }

  console.log("\nSuite 4 — tool execute contract is structured");
  {
    const pauseExecute = (ALL_TOOLS as { requestPauseForCheckIn?: { execute?: Function } })
      .requestPauseForCheckIn?.execute;
    const resumeExecute = (ALL_TOOLS as { requestResumeActivity?: { execute?: Function } })
      .requestResumeActivity?.execute;
    ok("pause execute exists", typeof pauseExecute === "function");
    ok("resume execute exists", typeof resumeExecute === "function");
    if (pauseExecute) {
      const result = await pauseExecute(
        {
          reason: "child_requested_privacy",
          urgency: "high",
          childAskedToHideScreen: true,
          wantsToResumeLater: true,
          summary: "Child asked to hide the screen and talk.",
        },
        { toolCallId: "pause-1", messages: [] },
      );
      ok(
        "pause execute returns request-shaped object",
        typeof result === "object" &&
          result !== null &&
          "requested" in (result as Record<string, unknown>) &&
          (result as Record<string, unknown>).requested === true,
        JSON.stringify(result),
      );
    }
    if (resumeExecute) {
      const result = await resumeExecute(
        {
          childConfirmedReady: true,
          summary: "Child is ready to resume.",
        },
        { toolCallId: "resume-1", messages: [] },
      );
      ok(
        "resume execute returns request-shaped object",
        typeof result === "object" &&
          result !== null &&
          "requested" in (result as Record<string, unknown>) &&
          (result as Record<string, unknown>).requested === true,
        JSON.stringify(result),
      );
    }
  }

  console.log("\n--- Summary ---");
  if (failures > 0) {
    console.log(`  ${failures} assertion(s) failed`);
    process.exit(1);
  }
  assert.ok(true);
  console.log("  All assertions passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
