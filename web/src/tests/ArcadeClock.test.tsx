import { fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ArcadeClock, arcadeItemIdForMode } from "../components/CallClock";
import { REWARD_GAMES, TEACHING_TOOLS } from "../../../src/shared/gameRegistry.generated";

// Owner, 2026-11-08: reward games are timed and cost coins. 25 coins buys 3 minutes on the same paid-minute
// meter as the earned call; when time runs out the game is blocked until she inserts a coin or goes back to her map.
type Fake = { minutes: number; coins: number; owned: string[]; spent: string[]; bought: Array<{ receiptId: string; offer: unknown }> };
function fakeServer(start: { minutes: number; coins: number; owned?: string[] }): Fake {
  const fake: Fake = { owned: [], ...start, spent: [], bought: [] };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const json = (data: unknown) => ({ ok: true, json: async () => data });
    if (url === "/api/rewards/arcade/ila") return json({ minutesLeft: fake.minutes, coins: fake.coins, price: 25, minutes: 3, warnAtSecondsLeft: 60 });
    if (url === "/api/rewards/wallet/ila") return json({ coins: fake.coins, ownedRewardIds: fake.owned });
    if (url === "/api/rewards/arcade/minute") {
      if (fake.spent.includes(body.receiptId)) return json({ ok: true, minutesLeft: fake.minutes, coins: fake.coins });
      if (fake.minutes < 1) return json({ ok: false, reason: "no_minutes", coins: fake.coins });
      fake.minutes -= 1; fake.spent.push(body.receiptId);
      return json({ ok: true, minutesLeft: fake.minutes, coins: fake.coins });
    }
    if (url === "/api/rewards/purchase") {
      if (fake.coins < 25) return json({ ok: false, reason: "not_enough_coins", price: 25, balance: fake.coins });
      fake.coins -= 25; fake.minutes += 3; fake.bought.push({ receiptId: body.receiptId, offer: body.offer });
      return json({ ok: true, balance: fake.coins, price: 25, duplicate: false, callMinutes: 0, arcadeMinutes: fake.minutes });
    }
    throw new Error(`unexpected ${url}`);
  }));
  return fake;
}
const pass = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("times every registered reward game and never a teaching or learning game", () => {
  for (const mode of Object.keys(REWARD_GAMES)) expect(arcadeItemIdForMode(mode)).toBe(`game:${mode}`);
  for (const mode of [...Object.keys(TEACHING_TOOLS), "word-radar", "pronunciation", "spell-check", "word-builder", "wordle", "idle"]) {
    expect(arcadeItemIdForMode(mode)).toBeNull();
  }
});

it("blocks the game until she inserts a coin, then pays each minute before it is used", async () => {
  const fake = fakeServer({ minutes: 0, coins: 60 });
  render(<ArcadeClock childId="ila" playId="g1" gameMode="space-invaders" active onLeave={() => {}} />);
  await pass(0);
  expect(fake.spent).toEqual([]);
  expect(screen.getByTestId("arcade-clock-blocker")).toBeTruthy();
  expect(screen.getByText(/insert coin to play/i)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /insert coin/i }));
  await pass(0);
  expect(fake.bought).toEqual([{ receiptId: "arcade:g1:buy:1", offer: { kind: "game_play", itemId: "game:space-invaders", trial: true } }]);
  expect(fake.spent).toEqual(["arcade:g1:1"]);
  expect(screen.queryByTestId("arcade-clock-blocker")).toBeNull();
  expect(screen.getByText("3:00")).toBeTruthy();
  await pass(60_000);
  expect(fake.spent).toEqual(["arcade:g1:1", "arcade:g1:2"]);
  expect(screen.getByText("2:00")).toBeTruthy();
});

it("marks the play as owned (not a trial) when she found the game in a chest", async () => {
  const fake = fakeServer({ minutes: 0, coins: 60, owned: ["game:asteroid"] });
  render(<ArcadeClock childId="ila" playId="g2" gameMode="asteroid" active onLeave={() => {}} />);
  await pass(0);
  fireEvent.click(screen.getByRole("button", { name: /insert coin/i }));
  await pass(0);
  expect(fake.bought[0]?.offer).toEqual({ kind: "game_play", itemId: "game:asteroid", trial: false });
});

it("at time up blocks the game and offers another coin or the way back to her map", async () => {
  fakeServer({ minutes: 1, coins: 60 });
  const onLeave = vi.fn();
  const post = vi.spyOn(window, "postMessage");
  render(<ArcadeClock childId="ila" playId="g3" gameMode="space-invaders" active onLeave={onLeave} />);
  await pass(0);
  expect(screen.queryByTestId("arcade-clock-blocker")).toBeNull();
  await pass(60_000);
  expect(screen.getByTestId("arcade-clock-blocker")).toBeTruthy();
  expect(screen.getByText(/time's up/i)).toBeTruthy();
  expect(screen.getByRole("button", { name: /insert coin/i })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /back to my map/i }));
  expect(onLeave).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith({ type: "game_complete", reason: "arcade_time_up" }, "*");
});

it("cannot insert a coin when she is short, and says how to earn more", async () => {
  const fake = fakeServer({ minutes: 0, coins: 10 });
  render(<ArcadeClock childId="ila" playId="g4" gameMode="space-invaders" active onLeave={() => {}} />);
  await pass(0);
  const insert = screen.getByRole("button", { name: /insert coin/i }) as HTMLButtonElement;
  expect(insert.disabled).toBe(true);
  expect(screen.getByText(/15 more coins/i)).toBeTruthy();
  fireEvent.click(insert);
  await pass(0);
  expect(fake.bought).toEqual([]);
});
