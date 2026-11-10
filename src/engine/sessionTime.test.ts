/**
 * Owner 2026-11-10: "how much time she spent [studying], minus the dopamine time ... this should all be granular."
 * Nothing in Sunny split a session's minutes into learning games, reward play, the FaceTime call, waiting and the map.
 * Why the human caught it: he could not tell effort from play when weighing test results. Why logs did not: screen
 * reports were never saved and no code summed the intervals. Why the lab missed it: it scores answers, never time.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sessionMinutes, minutesByDay } from "./sessionTime";

const T = Date.parse("2026-11-10T15:00:00Z");
const at = (min: number) => new Date(T + min * 60_000).toISOString();

function sessionDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-session-time-"));
  fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify({ sessionId: "s1", startedAt: at(0) }));
  fs.writeFileSync(path.join(dir, "summary.md"), `endedAt: ${at(20)}\n`);
  const screen = (min: number, screen: string, nodeId?: string) => JSON.stringify({ ts: at(min), component: "screen", action: "report", screen, ...(nodeId ? { nodeId } : {}) });
  fs.writeFileSync(path.join(dir, "events.ndjson"), [screen(0, "loading"), screen(2, "board"), screen(3, "activity", "kappa"), screen(10, "board"),
    screen(11, "activity", "mystery-1"), screen(14, "board"), screen(18, "resting")].join("\n"));
  fs.writeFileSync(path.join(dir, "game-traces.ndjson"), [
    { ts: at(3), nodeId: "kappa", type: "game_state_update", phase: "opening" }, { ts: at(9.5), nodeId: "kappa", type: "attempt_event" },
    { ts: at(10), nodeId: "kappa", type: "game_complete" },
    { ts: at(11), nodeId: "mystery-1", type: "game_state_update", phase: "opening" }, { ts: at(14), nodeId: "mystery-1", type: "game_complete" },
    { ts: at(14), type: "companion_video_call_trace", eventName: "call_started" }, { ts: at(18), type: "companion_video_call_trace", eventName: "call_ended" },
  ].map(row => JSON.stringify(row)).join("\n"));
  return dir;
}

const cycle = { nodes: [{ nodeId: "kappa", role: "baseline" }, { nodeId: "mystery-1", role: "mystery" }] } as never;

describe("learning vs play minutes", () => {
  it("splits one session into learning games, play, call, waiting, map and other, from its own records", () => {
    const dir = sessionDir();
    try {
      expect(sessionMinutes(dir, cycle)).toEqual({ learning: 7, play: 3, call: 4, waiting: 2, map: 2, other: 2, unmeasured: 0, total: 20 });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("says unmeasured instead of guessing when a session saved no screen reports", () => {
    const dir = sessionDir();
    try {
      fs.writeFileSync(path.join(dir, "events.ndjson"), "");
      expect(sessionMinutes(dir, cycle)).toMatchObject({ learning: 7, play: 3, call: 4, waiting: 0, map: 0, unmeasured: 6, total: 20 });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("adds sessions up per day", () => {
    const a = { learning: 7, play: 3, call: 4, waiting: 2, map: 2, other: 2, unmeasured: 0, total: 20 };
    expect(minutesByDay([{ startedAt: "2026-11-10T15:00:00Z", minutes: a }, { startedAt: "2026-11-10T19:00:00Z", minutes: a }, { startedAt: "2026-11-11T15:00:00Z", minutes: a }]))
      .toEqual([{ day: "2026-11-10", sessions: 2, minutes: { learning: 14, play: 6, call: 8, waiting: 4, map: 4, other: 4, unmeasured: 0, total: 40 } }, { day: "2026-11-11", sessions: 1, minutes: a }]);
  });
});
