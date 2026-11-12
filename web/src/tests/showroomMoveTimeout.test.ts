import { expect, it } from "vitest";
import { SHOWROOM_ACTIVITY_MOVE_PACKET_TIMEOUT_MS } from "../components/CompanionShowroom";

// Owner 2026-11-12: "FaceTime is still extremely buggy." In Ila's 11/10 Connect Four call the companion went quiet:
// her move waited 4 s for the spoken line, then revealed silently and dropped the line, 22 times. Her lines took
// 3.4-4.9 s end to end. Why the human caught it: the companion stopped talking mid-game. Why logs missed it: each
// timeout logged as a deliberate fallback. Why the lab missed it: it used fast fake replies.
const SLOWEST_OBSERVED_REPLY_MS = 4900;

it("waits long enough for her slowest observed spoken line, with margin", () => {
  expect(SHOWROOM_ACTIVITY_MOVE_PACKET_TIMEOUT_MS).toBeGreaterThanOrEqual(SLOWEST_OBSERVED_REPLY_MS + 1500);
  // Not so long that the child is left waiting on a frozen board.
  expect(SHOWROOM_ACTIVITY_MOVE_PACKET_TIMEOUT_MS).toBeLessThanOrEqual(8000);
});
