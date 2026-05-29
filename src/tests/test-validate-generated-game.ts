import { describe, it, expect } from "vitest";
import { validateGeneratedGame } from "../scripts/validateGeneratedGame";

const BASE =
  '<!DOCTYPE html><html><head><script src="/games/_contract.js"></script></head><body>';

function compliantHtml(childIdToken: string, extraBody = ""): string {
  return `${BASE}
<div id="sunny-companion"></div>
${extraBody}<script>
const GAME_PARAMS = { childId: "${childIdToken}" };
function sendNodeComplete() {}
fireCompanionEvent("idle", {});
fireAttemptEvent({ domain: "spelling", target: "apple", correct: true, quality: 5, scaffoldLevel: 0 });
</script></body></html>`;
}

describe("validateGeneratedGame", () => {
  it("rejects HTML missing _contract.js", () => {
    const html = "<html><body>sendNodeComplete(); GAME_PARAMS</body></html>";
    const r = validateGeneratedGame(html, {
      words: [],
      homeworkType: "reading",
      childId: "ila",
    });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("_contract.js"))).toBe(true);
  });

  it("rejects HTML missing sendNodeComplete", () => {
    const html = `${BASE}<script>const GAME_PARAMS = {};</script>fireCompanionEvent;fireAttemptEvent</body></html>`;
    const r = validateGeneratedGame(html, {
      words: [],
      homeworkType: "reading",
      childId: "ila",
    });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("sendNodeComplete"))).toBe(true);
  });

  it("rejects HTML with hardcoded childId", () => {
    const html = `${BASE}<p>ila</p><div id="sunny-companion"></div><script>const GAME_PARAMS = { childId: "x" };
function sendNodeComplete() {}
fireCompanionEvent("a", {});
fireAttemptEvent({ domain: "spelling", target: "apple", correct: true, quality: 5, scaffoldLevel: 0 });
</script></body></html>`;
    const r = validateGeneratedGame(html, {
      words: [],
      homeworkType: "reading",
      childId: "ila",
    });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("Hardcoded childId"))).toBe(true);
    expect(r.shouldRegenerate).toBe(true);
  });

  it("warns when #sunny-companion missing", () => {
    const html = `${BASE}<script>const GAME_PARAMS = { childId: "ila" };
function sendNodeComplete() {}
fireCompanionEvent("a", {});
fireAttemptEvent({ domain: "spelling", target: "apple", correct: true, quality: 5, scaffoldLevel: 0 });
</script></body></html>`;
    const r = validateGeneratedGame(html, {
      words: [],
      homeworkType: "reading",
      childId: "ila",
    });
    expect(r.warnings.some((w) => w.includes("sunny-companion"))).toBe(true);
    expect(r.score).toBe(90);
  });

  it("blocks Quest/Boss artifacts that omit the Sunny companion anchor", () => {
    const html = `${BASE}
<script>
const params = window.GAME_PARAMS || {};
window.fireCompanionEvent("correct_answer", {});
window.fireAttemptEvent({ domain: "spelling", target: "apple", attemptedValue: "apple", correct: true, quality: 5, scaffoldLevel: 0 });
window.sendNodeComplete({ completed: true, accuracy: 1, wordsAttempted: 1 });
</script></body></html>`;
    const r = validateGeneratedGame(html, {
      words: ["apple"],
      homeworkType: "spelling_test",
      childId: "uqchildmarker012",
      generationStage: "quest",
    });

    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("sunny-companion"))).toBe(true);
    expect(r.shouldRegenerate).toBe(true);
  });

  it("blocks Quest/Boss artifacts that render their own companion chrome", () => {
    const html = `${BASE}
<div id="sunny-companion"></div>
<div class="quest-giver"><div class="quest-avatar">Matilda</div></div>
<div class="speech-bubble">I will help from inside the game.</div>
<script>
const params = window.GAME_PARAMS || {};
window.fireCompanionEvent("correct_answer", {});
window.fireAttemptEvent({ domain: "spelling", target: "apple", attemptedValue: "apple", correct: true, quality: 5, scaffoldLevel: 0 });
window.sendNodeComplete({ completed: true, accuracy: 1, wordsAttempted: 1 });
</script></body></html>`;
    const r = validateGeneratedGame(html, {
      words: ["apple"],
      homeworkType: "spelling_test",
      childId: "uqchildmarker012",
      generationStage: "quest",
    });

    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("own companion chrome"))).toBe(true);
    expect(r.shouldRegenerate).toBe(true);
  });

  it("allows non-companion game-world speech bubble styling", () => {
    const html = `${BASE}
<div id="sunny-companion"></div>
<div class="speech-bubble">The door creaks open after you solve the clue.</div>
<script>
const params = window.GAME_PARAMS || {};
window.fireCompanionEvent("correct_answer", {});
window.fireAttemptEvent({ domain: "spelling", target: "apple", attemptedValue: "apple", correct: true, quality: 5, scaffoldLevel: 0 });
window.sendNodeComplete({ completed: true, accuracy: 1, wordsAttempted: 1 });
</script></body></html>`;
    const r = validateGeneratedGame(html, {
      words: ["apple"],
      homeworkType: "spelling_test",
      childId: "uqchildmarker012",
      generationStage: "quest",
    });

    expect(r.passed).toBe(true);
    expect(r.failures).toHaveLength(0);
  });

  it("warns when spelling test shows word list", () => {
    const html = compliantHtml("ila", '<div class="word-chip">apple</div>\n');
    const r = validateGeneratedGame(html, {
      words: ["apple"],
      homeworkType: "spelling_test",
      childId: "ila",
    });
    expect(r.warnings.some((w) => w.includes("Word list may be visible"))).toBe(true);
    expect(r.score).toBe(80);
  });

  it("blocks boss validation when spelling targets are visible", () => {
    const html = compliantHtml("ila", '<div class="word-chip">apple</div>\n');
    const r = validateGeneratedGame(html, {
      words: ["apple"],
      homeworkType: "spelling_test",
      childId: "ila",
      generationStage: "boss",
    });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("Visible spelling targets"))).toBe(true);
  });

  it("blocks quest validation when spelling targets are visible", () => {
    const html = `${BASE}
<div id="sunny-companion"></div>
<div class="word-chip">apple</div>
<script>
const params = window.GAME_PARAMS || {};
window.fireCompanionEvent("correct_answer", {});
window.fireAttemptEvent({ domain: "spelling", target: "apple", attemptedValue: "apple", correct: true, quality: 5, scaffoldLevel: 0 });
window.sendNodeComplete({ completed: true, accuracy: 1, wordsAttempted: 1 });
</script></body></html>`;
    const r = validateGeneratedGame(html, {
      words: ["apple"],
      homeworkType: "spelling_test",
      childId: "ila",
      generationStage: "quest",
    });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("Visible spelling targets"))).toBe(true);
  });

  it("rejects generated games that do not report attempt events", () => {
    const html = `${BASE}
<div id="sunny-companion"></div>
<script>
const GAME_PARAMS = { childId: "uqchildmarker012" };
function sendNodeComplete() {}
fireCompanionEvent("idle", {});
</script></body></html>`;
    const r = validateGeneratedGame(html, {
      words: ["apple"],
      homeworkType: "spelling_test",
      childId: "uqchildmarker012",
    });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("fireAttemptEvent"))).toBe(true);
  });

  it("rejects Quest/Boss artifacts that advertise one-click completion without enough assessable attempts", () => {
    const html = compliantHtml("uqchildmarker012", `
<button id="finish">Finish quest</button>
<script>
document.getElementById("finish").addEventListener("click", () => {
  fireAttemptEvent({ word: "apple", correct: true });
  sendNodeComplete({ completed: true, accuracy: 1, wordsAttempted: 1 });
});
</script>`);
    const r = validateGeneratedGame(html, {
      words: ["apple", "banana", "carrot", "date", "elder"],
      homeworkType: "spelling_test",
      childId: "uqchildmarker012",
      generationStage: "quest",
    });

    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("one-click"))).toBe(true);
    expect(r.shouldRegenerate).toBe(true);
  });

  it("rejects Quest/Boss artifacts that use bare contract globals instead of window contract calls", () => {
    const html = `${BASE}
<div id="sunny-companion"></div>
<script>
const params = window.GAME_PARAMS || {};
fireCompanionEvent("correct_answer", {});
fireAttemptEvent({ domain: "spelling", target: "apple", attemptedValue: "apple", correct: true, quality: 5, scaffoldLevel: 0 });
sendNodeComplete({ completed: true, accuracy: 1, wordsAttempted: 1 });
</script></body></html>`;

    const r = validateGeneratedGame(html, {
      words: ["apple"],
      homeworkType: "spelling_test",
      childId: "uqchildmarker012",
      generationStage: "quest",
    });

    expect(r.passed).toBe(false);
    expect(r.failures.join(" ")).toMatch(/window\.fireAttemptEvent/);
    expect(r.failures.join(" ")).toMatch(/window\.sendNodeComplete/);
    expect(r.shouldRegenerate).toBe(true);
  });

  it("rejects Quest/Boss artifacts that load the contract from a relative path", () => {
    const html = `<!DOCTYPE html><html><head><script src="_contract.js"></script></head><body>
<div id="sunny-companion"></div>
<script>
const params = window.GAME_PARAMS || {};
window.fireCompanionEvent("correct_answer", {});
window.fireAttemptEvent({ domain: "spelling", target: "apple", attemptedValue: "apple", correct: true, quality: 5, scaffoldLevel: 0 });
window.sendNodeComplete({ completed: true, accuracy: 1, wordsAttempted: 1 });
</script></body></html>`;

    const r = validateGeneratedGame(html, {
      words: ["apple"],
      homeworkType: "spelling_test",
      childId: "uqchildmarker012",
      generationStage: "quest",
    });

    expect(r.passed).toBe(false);
    expect(r.failures.join(" ")).toContain("/games/_contract.js");
  });

  it("rejects Quest/Boss artifacts with hardcoded child fallback values", () => {
    const html = `${BASE}
<div id="sunny-companion"></div>
<script>
const params = window.GAME_PARAMS || {};
window.fireCompanionEvent("correct_answer", {});
window.fireAttemptEvent({ domain: "spelling", target: "apple", attemptedValue: "apple", correct: true, quality: 5, scaffoldLevel: 0 });
window.sendNodeComplete({ completed: true, accuracy: 1, wordsAttempted: 1, childId: window.GAME_PARAMS?.childId || "reina" });
</script></body></html>`;
    const r = validateGeneratedGame(html, {
      words: ["apple"],
      homeworkType: "spelling_test",
      childId: "reina",
      generationStage: "quest",
    });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("Hardcoded childId"))).toBe(true);
  });

  it("accepts Quest/Boss artifacts that use window contract calls", () => {
    const html = `${BASE}
<div id="sunny-companion"></div>
<script>
const params = window.GAME_PARAMS || {};
window.fireCompanionEvent("correct_answer", { childId: params.childId || "" });
window.fireAttemptEvent({ domain: "spelling", target: "apple", attemptedValue: "apple", correct: true, quality: 5, scaffoldLevel: 0 });
window.sendNodeComplete({ completed: true, accuracy: 1, wordsAttempted: 1 });
</script></body></html>`;

    const r = validateGeneratedGame(html, {
      words: ["apple"],
      homeworkType: "spelling_test",
      childId: "uqchildmarker012",
      generationStage: "quest",
    });

    expect(r.passed).toBe(true);
    expect(r.failures).toHaveLength(0);
  });

  it("does not block separate correct and wrong feedback branches just because wrong copy says correct spelling", () => {
    const html = `${BASE}
<div id="sunny-companion"></div>
<p class="feedback"></p>
<script>
const params = window.GAME_PARAMS || {};
function gradeAnswer(isCorrect) {
  const feedback = document.querySelector(".feedback");
  if (isCorrect) {
    feedback.className = "feedback correct";
    feedback.textContent = "Correct!";
    window.fireCompanionEvent("correct_answer", {});
  } else {
    feedback.className = "feedback incorrect";
    feedback.textContent = "Not quite. The correct spelling appears after this attempt.";
    window.fireCompanionEvent("wrong_answer", {});
  }
  window.fireAttemptEvent({ domain: "spelling", target: "apple", attemptedValue: "aple", correct: isCorrect, quality: isCorrect ? 5 : 1, scaffoldLevel: 0 });
  window.sendNodeComplete({ completed: true, accuracy: isCorrect ? 1 : 0, wordsAttempted: 1 });
}
</script></body></html>`;

    const r = validateGeneratedGame(html, {
      words: ["apple"],
      homeworkType: "spelling_test",
      childId: "uqchildmarker012",
      generationStage: "quest",
    });

    expect(r.passed).toBe(true);
    expect(r.failures).toHaveLength(0);
  });

  it("does not warn on generic word-chip UI when spelling targets appear only inside script data", () => {
    const html = `${BASE}
<div id="sunny-companion"></div>
<div class="word-chip">Silent Letters</div>
<script>
const params = window.GAME_PARAMS || {};
const targetWords = ["sign"];
window.fireCompanionEvent("correct_answer", {});
window.fireAttemptEvent({ domain: "spelling", target: targetWords[0], attemptedValue: targetWords[0], correct: true, quality: 5, scaffoldLevel: 0 });
window.sendNodeComplete({ completed: true, accuracy: 1, wordsAttempted: 1 });
</script></body></html>`;

    const r = validateGeneratedGame(html, {
      words: ["sign"],
      homeworkType: "spelling_test",
      childId: "uqchildmarker012",
      generationStage: "quest",
    });

    expect(r.passed).toBe(true);
    expect(r.warnings.some((warning) => warning.includes("Word list may be visible"))).toBe(false);
  });

  it("passes valid generated game HTML", () => {
    const html = compliantHtml("uqchildmarker012");
    const r = validateGeneratedGame(html, {
      words: ["apple"],
      homeworkType: "reading",
      childId: "uqchildmarker012",
    });
    expect(r.passed).toBe(true);
    expect(r.failures).toHaveLength(0);
  });

  it("score is 100 for fully compliant game", () => {
    const html = compliantHtml("uqchildmarker012");
    const r = validateGeneratedGame(html, {
      words: [],
      homeworkType: "reading",
      childId: "uqchildmarker012",
    });
    expect(r.score).toBe(100);
  });

  it("score deducts for each warning", () => {
    const html = `${BASE}<script>const GAME_PARAMS = { childId: "ila" };
function sendNodeComplete() {}
</script></body></html>`;
    const r = validateGeneratedGame(html, {
      words: [],
      homeworkType: "reading",
      childId: "ila",
    });
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
    expect(r.score).toBe(80);
  });
});
