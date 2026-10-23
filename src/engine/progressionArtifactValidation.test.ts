import { describe, expect, it } from "vitest";
import { validateGeneratedGame } from "../scripts/validateGeneratedGame";

// Human catch 2026-10-22: every successor portal was unavailable. Logs held the
// shell errors, but the lab injected a successful validator. The Creator's
// self-contained document was judged as a different, refillable artifact type.
const html = `<!doctype html><html><head><script src="/games/_contract.js"></script></head><body>
<h1>Signal rescue</h1><div id="sunny-companion"></div><button>Send</button>
<script>
const parameters = window.GAME_PARAMS;
window.fireAttemptEvent({domain:"spelling",attemptedValue:"night"});
window.fireCompanionEvent("game_state_update",{currentChallenge:{id:"one",prompt:"Listen, then spell."}});
window.sendNodeComplete({completed:true});
</script></body></html>`;
const context = { words: [], homeworkType: "spelling", childId: "synthetic", generationStage: "baseline" as const };

describe("generated progression document versus refillable baseline shell", () => {
  it("does not require a self-contained activity to implement the refillable shell protocol", () => {
    const result = validateGeneratedGame(html, { ...context, artifactForm: "self-contained" } as Parameters<typeof validateGeneratedGame>[1]);
    expect(result.failures.filter(failure => failure.startsWith("Baseline shell"))).toEqual([]);
  });
  it("retains configuration and state checks for refillable shells", () => {
    const result = validateGeneratedGame(html, context);
    expect(result.failures).toContain("Baseline shell must load refillable config JSON via config URL param");
    expect(result.failures).toContain("Baseline shell must call GameBridge.reportState for companion context");
  });
  it("retains runtime and captured-response checks for self-contained activities", () => {
    const result = validateGeneratedGame(html.replace("window.fireAttemptEvent", "window.fakeAttempt"), { ...context, artifactForm: "self-contained" } as Parameters<typeof validateGeneratedGame>[1]);
    expect(result.failures.join(" ")).toContain("window.fireAttemptEvent");
  });
});
