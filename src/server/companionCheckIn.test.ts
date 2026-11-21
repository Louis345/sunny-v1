import { afterEach, expect, it, vi } from "vitest";
import { scheduleCompanionCheckIn } from "./companionCheckIn";
import { noteGamePace } from "./gamePace";

// 2026-11-10, both audits plus the owner: when a child goes quiet, nobody gets a turn to notice. Silence can be
// thinking, so the companion must not blurt. It may ask to check back in later, its way: raise a hand on screen
// (she taps it or ignores it) or ask gently in its own words. Code only keeps the appointment and skips it if she
// answered meanwhile. When and how is the companion's judgment, learned per child.
afterEach(() => { vi.useRealTimers(); });

it("keeps the companion's appointment: raises a hand only if she has not answered since", () => {
  vi.useFakeTimers({ now: new Date("2026-11-10T12:00:00Z") });
  const sent: unknown[] = [], spoken: string[] = [], traces: Array<Record<string, unknown>> = [];
  const deps = { send: (command: unknown) => sent.push(command), speak: (words: string) => spoken.push(words), trace: (row: Record<string, unknown>) => traces.push(row) };
  scheduleCompanionCheckIn({ childId: "ila", afterSeconds: 90, how: "raise_hand", words: "", why: "quiet on the tap step" }, deps);
  vi.advanceTimersByTime(89_000);
  expect(sent).toHaveLength(0);
  vi.advanceTimersByTime(2_000);
  expect(sent).toHaveLength(1);
  expect(traces).toEqual([expect.objectContaining({ type: "companion_checkin", action: "offered", how: "raise_hand" })]);
  // She answers before the next appointment: it is skipped.
  scheduleCompanionCheckIn({ childId: "ila", afterSeconds: 60, how: "ask", words: "Want a hint?", why: "still quiet" }, deps);
  vi.advanceTimersByTime(30_000);
  noteGamePace("ila", "gate", "answer", Date.now());
  vi.advanceTimersByTime(31_000);
  expect(spoken).toEqual([]);
  expect(traces.at(-1)).toMatchObject({ action: "skipped", reason: "she_answered" });
});

it("keeps one appointment per child: a new one replaces the old", () => {
  vi.useFakeTimers({ now: new Date("2026-11-10T13:00:00Z") });
  const spoken: string[] = [];
  const deps = { send: () => undefined, speak: (words: string) => spoken.push(words), trace: () => undefined };
  scheduleCompanionCheckIn({ childId: "reina", afterSeconds: 60, how: "ask", words: "First", why: "a" }, deps);
  scheduleCompanionCheckIn({ childId: "reina", afterSeconds: 120, how: "ask", words: "Second", why: "b" }, deps);
  vi.advanceTimersByTime(200_000);
  expect(spoken).toEqual(["Second"]);
});
