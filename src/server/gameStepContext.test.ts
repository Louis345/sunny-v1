import { expect, it, vi } from "vitest";
import { buildCurrentBoardSnapshot, buildCurrentBoardSnapshotContext } from "./currentBoardSnapshot";

// 2026-11-09 (Ila, Spelling Voice Gate): Elli said "type it" 13 times while the keyboard was hidden behind
// "Tap a stone". The companion now sees the game's step, its on-screen instruction and how long she has been on it.
it("tells the companion the game's current step, its instruction, and how long she has been on it", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-10T00:30:00.000Z"));
  try {
    const snapshot = buildCurrentBoardSnapshot({ childId: "ila", sessionId: "s", state: { game: "generated-game", nodeId: "n1",
      gameStep: "say", currentChallenge: "Go! Say each part. Tap a stone.", stepStartedAt: Date.parse("2026-11-10T00:28:30.000Z") } } as never);
    const context = buildCurrentBoardSnapshotContext(snapshot);
    expect(context).toContain("Current challenge: Go! Say each part. Tap a stone.");
    expect(context).toContain("Game step: say; she has been on this step for 90 seconds.");
  } finally { vi.useRealTimers(); }
});
