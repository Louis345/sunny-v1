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

it("reports each step and its instruction to Sunny, and reads a stuck step's instruction aloud once", () => {
  vi.useFakeTimers();
  const post = vi.spyOn(window.parent, "postMessage").mockImplementation(() => {});
  loadContract();
  (window as any).reportStep("say", "Go! Say each part. Tap a stone.");
  const state = post.mock.calls.map(([m]) => m as any).find(m => m?.type === "game_state_update");
  expect(state?.payload ?? state).toEqual(expect.objectContaining({ gameStep: "say", currentChallenge: "Go! Say each part. Tap a stone." }));
  expect(typeof (state?.payload ?? state).stepStartedAt).toBe("number");
  vi.advanceTimersByTime(61_000);
  const spoken = post.mock.calls.map(([m]) => m as any).filter(m => m?.type === "narration_request" && m.reason === "step_reminder");
  expect(spoken).toHaveLength(1);
  expect(spoken[0].text).toBe("Go! Say each part. Tap a stone.");
  vi.advanceTimersByTime(120_000);
  expect(post.mock.calls.filter(([m]) => (m as any)?.reason === "step_reminder")).toHaveLength(1);
  // Moving on to a new step resets the clock; progress within a step does too.
  (window as any).reportStep("type", "Now type it.");
  (window as any).fireAttemptEvent({ domain: "spelling", target: "dormant", attemptedValue: "dorm", correct: false });
  vi.advanceTimersByTime(40_000);
  expect(post.mock.calls.filter(([m]) => (m as any)?.reason === "step_reminder")).toHaveLength(1);
});
