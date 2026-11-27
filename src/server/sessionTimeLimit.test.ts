import fs from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MAX_BOARD_WAITS, boardBeingBuilt, finalizeStatus, isBoardBeingPrepared, legacyAttemptsNote, startMaxDurationTimer } from "./session-triggers";

// 2026-11-01 Ila's live session: the 15-minute limit ended her session at 14:46 while she waited for her
// Teaching board, which published at 14:47. The human caught it because she sat on a waiting screen; the
// log showed the timeout but nothing tied it to the waiting child; the lab never ran a real-length session.
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
const MINUTE = 60_000;

it("ends a session at the limit when no board is being prepared", () => {
  const expired = vi.fn();
  startMaxDurationTimer("Ila", expired, () => false);
  vi.advanceTimersByTime(35 * MINUTE - 1);
  expect(expired).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(expired).toHaveBeenCalledOnce();
});

it("never ends a session while her board is being prepared, and gives her a full session once it opens", () => {
  const expired = vi.fn();
  let preparing = true;
  startMaxDurationTimer("Ila", expired, () => preparing);
  vi.advanceTimersByTime(40 * MINUTE);
  expect(expired).not.toHaveBeenCalled();
  preparing = false;
  vi.advanceTimersByTime(MINUTE); // The next look sees the board is ready and starts her full window.
  vi.advanceTimersByTime(35 * MINUTE - 1);
  expect(expired).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(expired).toHaveBeenCalledOnce();
});

// 2026-11-12 Ila (S2): board 3 was built mid-session (20:59-21:13) and the 35-minute wall clock kept running
// while she waited, so the limit ended her session with no answers saved. The human saw the waiting child; the log
// only said "Session timeout reached (N min wall)"; the lab only tested a board still building at the 35-minute mark.
it("does not count minutes she spends waiting for a board mid-session", () => {
  const expired = vi.fn();
  let preparing = false;
  startMaxDurationTimer("Ila", expired, () => preparing);
  vi.advanceTimersByTime(10 * MINUTE - 1); // ten minutes of play
  preparing = true;
  vi.advanceTimersByTime(13 * MINUTE); // thirteen minutes waiting for her next board
  preparing = false;
  vi.advanceTimersByTime(25 * MINUTE - 1); // 35 wall minutes long gone; only 35 active minutes end it
  expect(expired).not.toHaveBeenCalled();
  vi.advanceTimersByTime(2);
  expect(expired).toHaveBeenCalledOnce();
});

it("stops waiting after its bound if preparation never finishes", () => {
  const expired = vi.fn(), preparing = vi.fn(() => true);
  startMaxDurationTimer("Ila", expired, preparing);
  vi.advanceTimersByTime((35 + MAX_BOARD_WAITS) * MINUTE - 1);
  expect(expired).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  // Law 2 guard: one look a minute while waiting, and no more looks once the cap is reached.
  expect(preparing).toHaveBeenCalledTimes(MAX_BOARD_WAITS);
  expect(expired).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(120 * MINUTE);
  expect(preparing).toHaveBeenCalledTimes(MAX_BOARD_WAITS);
});

it("cancels cleanly while waiting", () => {
  const expired = vi.fn();
  const cancel = startMaxDurationTimer("Ila", expired, () => true);
  vi.advanceTimersByTime(37 * MINUTE);
  cancel();
  vi.advanceTimersByTime(120 * MINUTE);
  expect(expired).not.toHaveBeenCalled();
});

it("counts only the phases where she is waiting for a board, and the kiosk session uses them", () => {
  for (const phase of ["evidence_ready", "targeted_planning", "board_designing", "board_generating"]) expect(isBoardBeingPrepared(phase)).toBe(true);
  for (const phase of ["board_ready", "needs_attention", "successor_published", undefined]) expect(isBoardBeingPrepared(phase)).toBe(false);
  expect(fs.readFileSync("src/server/session-bootstrap.ts", "utf8")).toMatch(/boardBeingBuilt\(/);
});

// 2026-11-14 (BUGS.md S2): Ila's 11/12 spelling board 3 was built after board 2 ended. Spelling next boards never write
// the math build file, so the clock kept running. A next board still unpublished on her record is waiting too.
it("counts a spelling next board still being built as waiting, from her own board record", () => {
  expect(boardBeingBuilt({ lifecycle: "baseline_ready", boards: [{ publishedAt: "2026-11-12T20:00:00Z" }, { publishedAt: null }] }, null)).toBe(true);
  expect(boardBeingBuilt({ lifecycle: "board_generating", boards: [] }, null)).toBe(true);
  expect(boardBeingBuilt({ lifecycle: "baseline_ready", boards: [{ publishedAt: "2026-11-12T20:00:00Z" }] }, { phase: "targeted_planning" })).toBe(true);
  expect(boardBeingBuilt({ lifecycle: "baseline_ready", boards: [{ publishedAt: "2026-11-12T20:00:00Z" }] }, null)).toBe(false);
  expect(boardBeingBuilt(null, null)).toBe(false);
});

// 2026-11-01: Ila's real board session logged not_a_learning_session and 0 attempts. Her answers are in the
// learning cycle; those two lines read the older session counter, and said so nowhere.
it("says a board session's learning lives in its cycle, not that it was not a learning session", () => {
  expect(finalizeStatus(undefined, true)).toBe("learning_cycle_owns_this_session");
  expect(finalizeStatus(undefined, false)).toBe("not_a_learning_session");
  expect(finalizeStatus("revised", true)).toBe("revised");
  expect(legacyAttemptsNote(0, true)).toBe("0 attempts (older counter; her answers are in the learning cycle)");
  expect(legacyAttemptsNote(3, false)).toBe("3 attempts");
});
