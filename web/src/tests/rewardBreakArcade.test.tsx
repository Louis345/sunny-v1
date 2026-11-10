import fs from "node:fs";
import path from "node:path";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ArcadeClock, rewardBreakArcadeTerms } from "../components/CallClock";
import { ARCADE_RULES } from "../../../src/shared/rewardCatalog";

// Bug 2026-11-10 (Ila's session): she tapped the finished "French Toast Treasure" mystery stop again and again and
// played arcade games for free, without end; and a Space Invaders break ended after about a minute ("I didn't
// finish it") because the game's own game-over closed the break.
// Why the human caught it: she watched a child replay a finished reward stop endlessly and heard her say she was cut off.
// Why the logs did not: each replay logged a normal `choice-event … selected=…:stop-6:mystery` and a completion with
// transitioned=false; nothing said "free arcade time" because no rule existed to break.
// Why the lab missed it: lab runs launch each stop once; no scenario taps a completed reward stop twice, and board
// stops were never wrapped in the arcade clock (only games Elli opens in the live session were).

type Fake = { minutes: number; coins: number; spent: string[] };
function fakeServer(start: { minutes: number; coins: number }): Fake {
  const fake: Fake = { ...start, spent: [] };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const json = (data: unknown) => ({ ok: true, json: async () => data });
    if (url === "/api/rewards/arcade/ila") return json({ minutesLeft: fake.minutes, coins: fake.coins, price: 25, minutes: 3, warnAtSecondsLeft: 60 });
    if (url === "/api/rewards/wallet/ila") return json({ coins: fake.coins, ownedRewardIds: [] });
    if (url === "/api/rewards/arcade/minute") {
      if (fake.minutes < 1) return json({ ok: false, reason: "no_minutes", coins: fake.coins });
      fake.minutes -= 1; fake.spent.push(body.receiptId);
      return json({ ok: true, minutesLeft: fake.minutes, coins: fake.coins });
    }
    throw new Error(`unexpected ${url}`);
  }));
  return fake;
}
const pass = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("earns the first play of a reward stop and charges coins to replay it; learning stops stay free", () => {
  expect(rewardBreakArcadeTerms({ type: "mystery", isCompleted: false })).toEqual({ freeSeconds: ARCADE_RULES.earnedMinutesFirstPlay * 60 });
  expect(rewardBreakArcadeTerms({ type: "mystery", isCompleted: true })).toEqual({ freeSeconds: 0 });
  for (const type of ["word-radar", "quest", "boss", "pronunciation", "karaoke"]) {
    expect(rewardBreakArcadeTerms({ type, isCompleted: true })).toBeNull();
    expect(rewardBreakArcadeTerms({ type, isCompleted: false })).toBeNull();
  }
});

it("a replayed reward stop waits for a coin before the game runs", async () => {
  const fake = fakeServer({ minutes: 0, coins: 60 });
  render(<ArcadeClock childId="ila" playId="r1" gameMode="space-invaders" active freeSeconds={0} onLeave={() => {}} />);
  await pass(0);
  expect(screen.getByTestId("arcade-clock-blocker")).toBeTruthy();
  expect(screen.getByText(/insert coin to play/i)).toBeTruthy();
  expect(fake.spent).toEqual([]);
});

it("the earned first play shows coins and a countdown, warns before the end, then offers a coin or her map", async () => {
  const fake = fakeServer({ minutes: 0, coins: 60 });
  render(<ArcadeClock childId="ila" playId="f1" gameMode="space-invaders" active freeSeconds={180} onLeave={() => {}} />);
  await pass(0);
  expect(screen.queryByTestId("arcade-clock-blocker")).toBeNull();
  const hud = screen.getByTestId("arcade-clock");
  expect(hud.textContent).toContain("3:00");
  expect(hud.textContent).toContain("60");
  expect(fake.spent).toEqual([]);
  await pass(121_000);
  expect(screen.getByText(/1 minute left/i)).toBeTruthy();
  await pass(60_000);
  expect(screen.getByTestId("arcade-clock-blocker")).toBeTruthy();
  expect(screen.getByText(/time's up/i)).toBeTruthy();
  expect(screen.getByRole("button", { name: /insert coin/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /back to my map/i })).toBeTruthy();
  expect(fake.spent).toEqual([]);
});

it("the board wraps every reward stop in the arcade clock and a round ending never ends the break", () => {
  const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
  expect(app).toContain("rewardBreakArcadeTerms(plannerBoardLaunch.node)");
  expect(app).toContain("<ArcadeClock");
  expect(app).toContain("[reward-break] [round] [restarted]");
});
