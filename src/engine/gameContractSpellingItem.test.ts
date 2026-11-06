import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

// Generated games open each spelling word through the contract, so the measurement bookkeeping
// (item binding, whether the word is on screen) belongs to code, not to the game's own claims.
const CONTRACT = fs.readFileSync(path.join(process.cwd(), "web/public/games/_contract.js"), "utf8");
const BINDINGS = [{ itemId: "item-raincoat", word: "raincoat" }];

function loadContract(screenText: string) {
  const posted: Array<Record<string, unknown>> = [];
  const query = new URLSearchParams({ words: "raincoat", nodeId: "quest-1", launchToken: "token-1", spellingItemBindings: JSON.stringify(BINDINGS) });
  const window: Record<string, unknown> = {
    location: { search: `?${query}` },
    parent: { postMessage: (message: Record<string, unknown>) => posted.push(message) },
    addEventListener: () => undefined,
  };
  window.window = window;
  const document = { title: "Generated quest", body: { innerText: screenText }, addEventListener: () => undefined, readyState: "complete" };
  vm.runInNewContext(CONTRACT, { window, document, location: window.location, parent: window.parent, URLSearchParams, console: { log: () => undefined, warn: () => undefined, error: () => undefined }, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, Object });
  return { window: window as { openSpellingItem?: (word: string, progress?: string) => void }, posted };
}

describe("openSpellingItem", () => {
  it("binds the word to its frozen item and reports it hidden when it is not on screen", () => {
    const { window, posted } = loadContract("Spell the word Elli says. Tap the lantern.");
    window.openSpellingItem!("raincoat", "Lantern 1 of 8");
    const state = posted.find(row => row.type === "game_state_update")?.payload as Record<string, unknown>;
    // Reported as Sunny's generated-game, whatever the game's own title, so Elli knows it is a spelling word.
    expect(state).toMatchObject({ game: "generated-game", itemId: "item-raincoat", practiceCapture: true, spellingItemOpened: true, answerVisibility: "hidden", launchToken: "token-1", nodeId: "quest-1" });
    expect(posted.find(row => row.type === "narration_request")).toMatchObject({ word: "raincoat", nodeId: "quest-1" });
  });

  it("reports the word visible when the game shows it, whatever the game claims", () => {
    const { window, posted } = loadContract("Put on your RAINCOAT before we go outside!");
    window.openSpellingItem!("raincoat");
    const state = posted.find(row => row.type === "game_state_update")?.payload as Record<string, unknown>;
    expect(state.answerVisibility).toBe("visible");
  });
});
