import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isCompanionCallPath, rewardCallHeldReason } from "../utils/rewardCallOffer";

/**
 * A child caught this (Ila, Saori kiosk, 2026-11-05): she finished the last stop of board 8,
 * Sunny instantly published Quest board 9, and in the same moment her earned FaceTime reward
 * opened. The kiosk left the session for /companions and came back as a brand-new session;
 * she lost her place, missed the Quest reveal, and the companion re-greeted her.
 * Why logs missed it: every line was a correct state change on its own (ticket granted,
 * board published, ticket-opened, session_end); no line names the rule "a reward call never
 * interrupts a Quest/Boss board or a pending reveal", so nothing looked wrong.
 * Why labs missed it: reward-loop tests check the ticket is granted and opens, successor tests
 * check the Quest board publishes; nothing tested both in the same moment, and no lab child
 * taps the bright "Call Elli" button offered right beside "Back to map".
 */
describe("the earned reward call waits for the Quest", () => {
  // Owner 2026-11-08, watching Ila finish board 2 and land on the loading screen with no call: FaceTime comes
  // the moment a board ends. The wait for the next board is when she calls Elli; nothing holds the offer.
  it("is offered while the next board is being built and before its reveal", () => {
    for (const lifecycle of ["baseline_evaluating", "baseline_generating", "quest_generating", "boss_evaluating"]) {
      expect(rewardCallHeldReason({ lifecycle, nodes: [] }, false)).toBeNull();
    }
    expect(rewardCallHeldReason({ lifecycle: "baseline_ready", nodes: [] }, true)).toBeNull();
  });

  it("is offered on a Quest or Boss board once its reveal has been seen", () => {
    for (const lifecycle of ["quest_ready", "quest_active", "boss_ready", "boss_active"]) {
      expect(rewardCallHeldReason({ lifecycle, nodes: [] }, false)).toBeNull();
    }
    expect(rewardCallHeldReason({ lifecycle: "baseline_ready", nodes: [{ role: "baseline", state: "completed" }, { role: "quest", state: "locked" }] }, false)).toBeNull();
  });

  it("is offered at a calm moment: an ordinary board, or when the encounters are done", () => {
    expect(rewardCallHeldReason({ lifecycle: "baseline_ready", nodes: [{ role: "baseline", state: "ready" }] }, false)).toBeNull();
    expect(rewardCallHeldReason({ lifecycle: "complete", nodes: [{ role: "quest", state: "completed" }, { role: "boss", state: "completed" }] }, false)).toBeNull();
    expect(rewardCallHeldReason({ lifecycle: "awaiting_calibration", nodes: [] }, false)).toBeNull();
    expect(rewardCallHeldReason(null, false)).toBeNull();
  });
});

describe("App wiring: one held rule gates every way to open the call", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../App.tsx"), "utf8");

  it("computes the held reason once from the chart's learning cycle and the pending reveal", () => {
    expect(src).toMatch(/const rewardCallHeld = rewardCallHeldReason\(\s*plannerBoardPacket\?\.childChart\.learningCycle[^,]*,\s*finishedBoardId != null/);
  });

  it("refuses to navigate to the call while held, and logs it", () => {
    expect(src).toMatch(/const openVideoCallTicket = useCallback\(async \([\s\S]{0,200}if \(rewardCallHeld\) \{[\s\S]{0,200}\[reward-loop\] \[call-offer\] \[held/);
  });

  it("shows neither Call button while held; the saved ticket stays for later", () => {
    const overlayGates = src.match(/postActivityEngagement\.videoCallTicket && !rewardCallHeld \? openEarnedVideoCall : null/g) ?? [];
    expect(overlayGates).toHaveLength(2);
    expect(src).not.toMatch(/postActivityEngagement\.videoCallTicket \? openEarnedVideoCall : null/);
    expect(src).toMatch(/callOffered=\{rewardCallHeld == null\}/);
    expect(src).toMatch(/earnedTicket && props\.callOffered \?/);
  });
});

// BUGS.md 2026-11-07 (AI-caught in the demo): the server redirects /companions to /companions/, and the
// app only opened the call on the exact path, so the earned call landed back on the map.
it("opens the earned call on either spelling of its address", () => {
  expect(isCompanionCallPath("/companions")).toBe(true);
  expect(isCompanionCallPath("/companions/")).toBe(true);
  expect(isCompanionCallPath("/companions/elli.vrm")).toBe(false);
  expect(isCompanionCallPath("/")).toBe(false);
  const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../App.tsx"), "utf8");
  expect(app).toContain("isCompanionCallPath(window.location.pathname)");
});
