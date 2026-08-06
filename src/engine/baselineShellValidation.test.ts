import { describe, expect, it } from "vitest";
import { validateBaselineShellHtml } from "./baselineShellValidation";

const validHtml = `<!DOCTYPE html><html><head><script src="/games/_contract.js"></script></head><body>
<div id="sunny-companion"></div>
<script>
const params = new URLSearchParams(window.location.search);
const configUrl = params.get("config") || "/api/activity-config/child/hw/generated-baseline.json";
const childId = window.GAME_PARAMS?.childId || "child";
fetch(configUrl).then(() => {});
if (window.GameBridge) window.GameBridge.reportState({ ok: true });
window.fireAttemptEvent({ domain: "math" });
window.fireCompanionEvent("correct_answer");
window.sendNodeComplete({});
window.AudioContext = window.AudioContext || function AudioContext() {};
document.body.innerHTML += '<button id="mute">sound</button>';
</script></body></html>`;

describe("baselineShellValidation", () => {
  it("passes refillable companion-safe shell", () => {
    const result = validateBaselineShellHtml(validHtml, {
      childId: "demo-pashley",
      homeworkType: "math",
      targets: [],
    });
    expect(result.passed).toBe(true);
  });

  it("fails when config injection is missing", () => {
    const result = validateBaselineShellHtml("<html><body>no config</body></html>", {
      childId: "demo-pashley",
      homeworkType: "math",
      targets: [],
    });
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toMatch(/config/i);
  });

  it("accepts config-sourced attempt domain", () => {
    const html = validHtml.replace(
      'window.fireAttemptEvent({ domain: "math" });',
      "window.fireAttemptEvent({ domain: gameConfig.domain });",
    );
    const result = validateBaselineShellHtml(html, {
      childId: "demo-pashley",
      homeworkType: "math",
      targets: [],
    });
    expect(result.passed).toBe(true);
  });

  it("still fails when no attempt domain is present", () => {
    const html = validHtml.replace(
      'window.fireAttemptEvent({ domain: "math" });',
      "window.fireAttemptEvent({ correct: true });",
    );
    const result = validateBaselineShellHtml(html, {
      childId: "demo-pashley",
      homeworkType: "math",
      targets: [],
    });
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toMatch(/domain/i);
  });

  it("fails when the rendered artifact title conflicts with the node contract", () => {
    const result = validateBaselineShellHtml(validHtml.replace("<body>", "<body><h1>Rocket Launch</h1>"), {
      childId: "demo-pashley",
      homeworkType: "math",
      targets: [],
      expectedTitle: "Fact Blaster",
    });
    expect(result.failures).toContain("Baseline shell rendered title must match Fact Blaster");
  });

  it("rejects a multi-round shell that never releases its answer lock", () => {
    const lockedHtml = validHtml.replace("<script>", `<script>
let roundLocked = false;
function renderRound(index) { currentRound = index; }
function answer() { if (roundLocked) return; roundLocked = true; }
function advanceAfterDelay() { renderRound(currentRound + 1); }
`);
    const result = validateBaselineShellHtml(lockedHtml, {
      childId: "demo-pashley",
      homeworkType: "math",
      targets: [],
    });
    expect(result.failures).toContain("Baseline shell must release its answer lock for every new round");
  });
});
