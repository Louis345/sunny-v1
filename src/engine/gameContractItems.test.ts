import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

// One pipeline for every subject (owner, 2026-11-08): a built game opens each item through the contract, and
// code (not the game) keeps her first answer per item and hands Sunny the per-item results to score.
const CONTRACT = fs.readFileSync(path.join(process.cwd(), "web/public/games/_contract.js"), "utf8");
const BINDINGS = [{ itemId: "m1", display: "7 + 6" }, { itemId: "m2", display: "4 + 8" }];

function loadContract(screen: { text: string }) {
  const posted: Array<Record<string, unknown>> = [];
  const query = new URLSearchParams({ nodeId: "check-1", launchToken: "token-1", sessionId: "s1", itemBindings: JSON.stringify(BINDINGS) });
  const window: Record<string, unknown> = {
    location: { search: `?${query}` },
    parent: { postMessage: (message: Record<string, unknown>) => posted.push(message) },
    addEventListener: () => undefined,
  };
  window.window = window;
  const document = { title: "Number Scout", body: { get innerText() { return screen.text; } }, addEventListener: () => undefined, readyState: "complete" };
  vm.runInNewContext(CONTRACT, { window, document, location: window.location, parent: window.parent, URLSearchParams, console: { log: () => undefined, warn: () => undefined, error: () => undefined }, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, Object });
  return { window: window as Record<string, (...args: unknown[]) => void>, posted };
}

const completion = (posted: Array<Record<string, unknown>>) =>
  posted.find(row => row.type === "node_complete") as { targetResults?: Array<Record<string, unknown>> } | undefined;

describe("openItem", () => {
  it("binds any subject's item and reports it opened", () => {
    const screen = { text: "Camp 1. Is the sum even or odd?" };
    const { window, posted } = loadContract(screen);
    window.openItem("m1", "Camp 1 of 2");
    const state = posted.find(row => row.type === "game_state_update")?.payload as Record<string, unknown>;
    expect(state).toMatchObject({ game: "generated-game", itemId: "m1", itemOpened: true, nodeId: "check-1", launchToken: "token-1" });
  });

  it("hands Sunny her first answer per item, whatever results the game claims", () => {
    const screen = { text: "Camp 1. 7 + 6. Even or odd?" };
    const { window, posted } = loadContract(screen);
    window.openItem("m1");
    window.fireAttemptEvent({ target: "m1", attemptedValue: "odd", correct: false });
    window.fireAttemptEvent({ target: "m1", attemptedValue: "even", correct: true });
    screen.text = "Camp 2. 4 + 8 = 12. Even or odd?";
    window.openItem("4 + 8");
    window.fireAttemptEvent({ target: "4 + 8", attemptedValue: "even", correct: true });
    window.sendNodeComplete({ completed: true, accuracy: 1, targetResults: [{ target: "m1", correct: true }] });
    const results = completion(posted)?.targetResults;
    expect(results).toEqual([
      expect.objectContaining({ target: "m1", attemptedValue: "odd" }),
      expect.objectContaining({ target: "m2", attemptedValue: "even", screenAtOpen: "Camp 2. 4 + 8 = 12. Even or odd?" }),
    ]);
  });

  // 2026-11-10, Ila's math: 34 answers in the game, 26 saved. Her three fast "34"s on one problem were folded
  // into one first answer. Human caught it comparing the game's count with the saved count; logs showed both
  // numbers but nothing explained the gap; the lab's synthetic children never retry a problem.
  it("hands Sunny every try on an item, in order, beside her first answer", () => {
    const { window, posted } = loadContract({ text: "29, 26, 23, 20, ?" });
    window.openItem("m1");
    window.fireAttemptEvent({ target: "m1", attemptedValue: "34" });
    window.fireAttemptEvent({ target: "m1", attemptedValue: "34" });
    window.fireAttemptEvent({ target: "m1", attemptedValue: "17" });
    window.openItem("m2");
    window.fireAttemptEvent({ target: "m2", attemptedValue: "even" });
    const results = completion(posted)?.targetResults as Array<{ target: string; attemptedValue: string; tries: Array<{ attemptedValue: string; at: number }> }>;
    expect(results[0]).toMatchObject({ target: "m1", attemptedValue: "34" });
    expect(results[0].tries.map(row => row.attemptedValue)).toEqual(["34", "34", "17"]);
    expect(results[1].tries.map(row => row.attemptedValue)).toEqual(["even"]);
  });

  // 2026-11-10 Ila's kappa game: openItem bound the problem, then each reportStep replaced the state with only
  // "Type where the kappa lands next", so Sunny and Elli lost which problem (and its numbers) was on screen.
  // Human caught Elli guessing; logs showed the step text with no item; the lab never mixed steps with items.
  it("keeps the open item and its problem text on every state report until the next item opens", () => {
    const { window, posted } = loadContract({ text: "Kappa river" });
    window.openItem("m1");
    window.reportStep("hop", "Type where the kappa lands next");
    const states = posted.filter(row => row.type === "game_state_update").map(row => row.payload as Record<string, unknown>);
    expect(states[0]).toMatchObject({ itemId: "m1", itemPrompt: "7 + 6" });
    expect(states.at(-1)).toMatchObject({ gameStep: "hop", itemId: "m1", itemPrompt: "7 + 6", currentChallenge: "Type where the kappa lands next" });
  });

  it("marks an item she never answered as not captured instead of dropping it", () => {
    const { window, posted } = loadContract({ text: "Camp 1" });
    window.openItem("m1");
    window.fireAttemptEvent({ target: "m1", attemptedValue: "12" });
    window.sendNodeComplete({ completed: true });
    expect(completion(posted)?.targetResults).toEqual([
      expect.objectContaining({ target: "m1", attemptedValue: "12" }),
      expect.objectContaining({ target: "m2", attemptedValue: "" }),
    ]);
  });
});

// Reina's Boss Battle (2026-11-08): the built game offered a made-up "REMATCH" round at victory and reported
// completion only on "I'm done"; she tried the rematch, got stuck, and her Boss answers were never sent. Code
// finishes the stop once every bound problem has a first answer, whatever the game shows after.
describe("a stop finishes when every problem has an answer", () => {
  it("sends the completion itself once the last problem is answered, and only once", () => {
    const { window, posted } = loadContract({ text: "Boss" });
    window.openItem("m1");
    window.fireAttemptEvent({ target: "m1", attemptedValue: "odd" });
    expect(posted.filter(row => row.type === "node_complete")).toHaveLength(0);
    window.openItem("m2");
    window.fireAttemptEvent({ target: "m2", attemptedValue: "12" });
    const done = posted.filter(row => row.type === "node_complete");
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ completed: true, ended: true });
    // The game's own later "I'm done" (or a rematch's answers) does not send a second completion.
    window.fireAttemptEvent({ target: "m2", attemptedValue: "99" });
    window.sendNodeComplete({ completed: true });
    expect(posted.filter(row => row.type === "node_complete")).toHaveLength(1);
  });

  // BUGS.md 2026-11-10 evening: tries on the last problem after the stop finished were dropped. Human caught it
  // (fix/1110-learning caveat); logs showed one completion and nothing after it; the lab never retried after the
  // last first answer. Each later try sends a follow-up record with every try on each problem; Sunny saves the new ones.
  it("sends a follow-up record with every try when she keeps trying after the stop finished", () => {
    const { window, posted } = loadContract({ text: "Boss" });
    window.openItem("m1");
    window.fireAttemptEvent({ target: "m1", attemptedValue: "odd" });
    window.openItem("m2");
    window.fireAttemptEvent({ target: "m2", attemptedValue: "11" });
    expect(posted.filter(row => row.type === "late_tries")).toHaveLength(0);
    window.fireAttemptEvent({ target: "m2", attemptedValue: "12" });
    const late = posted.filter(row => row.type === "late_tries").map(row => row.payload as { nodeId: string; targetResults: Array<{ target: string; attemptedValue: string; tries: Array<{ attemptedValue: string }> }> });
    expect(late).toHaveLength(1);
    expect(late[0].nodeId).toBe("check-1");
    expect(late[0].targetResults.map(row => [row.target, row.attemptedValue, row.tries.map(t => t.attemptedValue)])).toEqual([["m1", "odd", ["odd"]], ["m2", "11", ["11", "12"]]]);
    expect(posted.filter(row => row.type === "node_complete")).toHaveLength(1);
  });
});
