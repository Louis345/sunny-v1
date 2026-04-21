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
    const html = `${BASE}<script>const GAME_PARAMS = {};</script>fireCompanionEvent</body></html>`;
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
</script></body></html>`;
    const r = validateGeneratedGame(html, {
      words: [],
      homeworkType: "reading",
      childId: "ila",
    });
    expect(r.warnings.some((w) => w.includes("sunny-companion"))).toBe(true);
    expect(r.score).toBe(90);
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
