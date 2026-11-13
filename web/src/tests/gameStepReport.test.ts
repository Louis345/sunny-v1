import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

// 2026-11-09 Ila, Spelling Voice Gate: the keyboard stayed hidden behind "Go! Say each part. Tap a stone." (small
// text, never spoken). She spent 13.5 minutes before her first answer, then ~90 s per word. The game told Sunny only
// "Lantern 1 of 6", so Elli said "type it" 13 times with no keyboard on screen. The owner caught it; the logs had no
// step; the lab never asked whether a game reports where she is. Built games now report each step and its
// on-screen instruction; after a minute on one step with no progress the game reads its instruction aloud once.
function loadContract() {
  window.history.replaceState({}, "", "/games/gen.html?childId=ila&sessionId=s1&nodeId=n1&launchToken=t1");
  delete (window as unknown as { GameBridge?: unknown }).GameBridge;
  window.eval(fs.readFileSync(path.join(process.cwd(), "public", "games", "_contract.js"), "utf8"));
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("reports each step and its instruction to Sunny as facts, and never speaks on its own schedule", () => {
  vi.useFakeTimers();
  const post = vi.spyOn(window.parent, "postMessage").mockImplementation(() => {});
  loadContract();
  (window as any).reportStep("say", "Go! Say each part. Tap a stone.");
  const state = post.mock.calls.map(([m]) => m as any).find(m => m?.type === "game_state_update");
  expect(state?.payload ?? state).toEqual(expect.objectContaining({ gameStep: "say", currentChallenge: "Go! Say each part. Tap a stone." }));
  expect(typeof (state?.payload ?? state).stepStartedAt).toBe("number");
  // Owner 2026-11-09: no timer script. Judgment about when to help belongs to the companion and the Planner.
  vi.advanceTimersByTime(300_000);
  expect(post.mock.calls.filter(([m]) => (m as any)?.type === "narration_request")).toHaveLength(0);
});

// BUGS.md 2026-11-08 / owner 2026-11-13: an answer after three hints was saved as on her own because games had no way
// to tell Sunny a hint was shown. reportHint sends the fact; the server marks her later tries on that problem helped.
it("reports a hint shown on a problem to Sunny as a fact", () => {
  const post = vi.spyOn(window.parent, "postMessage").mockImplementation(() => {});
  loadContract();
  (window as any).reportHint("p2", "Count by sixes");
  const state = post.mock.calls.map(([m]) => m as any).find(m => m?.type === "game_state_update");
  expect(state?.payload ?? state).toEqual(expect.objectContaining({ hintShownItemId: "p2", hintText: "Count by sixes" }));
});
