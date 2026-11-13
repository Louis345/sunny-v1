import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CallClock, COINS_CHANGED_EVENT } from "../components/CallClock";

// Owner, 2026-11-07: the earned call burns time. Each minute is paid on the server before it is used;
// when time runs out she buys more with coins or says goodbye, and Elli reacts to each moment.
type Fake = { minutes: number; coins: number; spent: string[]; bought: string[] };
function fakeServer(start: { minutes: number; coins: number }): Fake {
  const fake: Fake = { ...start, spent: [], bought: [] };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const json = (data: unknown) => ({ ok: true, json: async () => data });
    if (url === "/api/rewards/call/ila") return json({ minutesLeft: fake.minutes, coins: fake.coins, price: 30, minutes: 5, warnAtSecondsLeft: 60 });
    if (url === "/api/rewards/call/minute") {
      if (fake.spent.includes(body.receiptId)) return json({ ok: true, minutesLeft: fake.minutes, coins: fake.coins });
      if (fake.minutes < 1) return json({ ok: false, reason: "no_minutes", coins: fake.coins });
      fake.minutes -= 1; fake.spent.push(body.receiptId);
      return json({ ok: true, minutesLeft: fake.minutes, coins: fake.coins });
    }
    if (url === "/api/rewards/purchase") {
      if (fake.coins < 30) return json({ ok: false, reason: "not_enough_coins", price: 30, balance: fake.coins });
      fake.coins -= 30; fake.minutes += 5; fake.bought.push(body.receiptId);
      return json({ ok: true, balance: fake.coins, price: 30, duplicate: false, callMinutes: fake.minutes });
    }
    throw new Error(`unexpected ${url}`);
  }));
  return fake;
}
const pass = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("pays each minute before it is used and counts down what is saved", async () => {
  const fake = fakeServer({ minutes: 2, coins: 0 });
  render(<CallClock childId="ila" callId="c1" active onMoment={() => {}} onGoodbye={() => {}} />);
  await pass(0);
  expect(fake.spent).toEqual(["call:c1:1"]);
  expect(screen.getByText("2:00")).toBeTruthy();
  await pass(60_000);
  expect(fake.spent).toEqual(["call:c1:1", "call:c1:2"]);
  expect(screen.getByText("1:00")).toBeTruthy();
});

it("warns once at a minute left, then offers more time or goodbye when it runs out", async () => {
  fakeServer({ minutes: 1, coins: 40 });
  const onMoment = vi.fn();
  const onGoodbye = vi.fn();
  render(<CallClock childId="ila" callId="c1" active onMoment={onMoment} onGoodbye={onGoodbye} />);
  await pass(0);
  expect(onMoment).toHaveBeenCalledWith("minute_left");
  await pass(60_000);
  expect(onMoment).toHaveBeenLastCalledWith("time_up");
  expect(onMoment.mock.calls.filter(([moment]) => moment === "minute_left")).toHaveLength(1);
  expect(screen.getByText(/time's up/i)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /say goodbye/i }));
  expect(onGoodbye).toHaveBeenCalledTimes(1);
});

it("buys five more minutes with coins and keeps talking", async () => {
  const fake = fakeServer({ minutes: 1, coins: 40 });
  const onMoment = vi.fn();
  render(<CallClock childId="ila" callId="c1" active onMoment={onMoment} onGoodbye={() => {}} />);
  await pass(0);
  await pass(60_000);
  fireEvent.click(screen.getByRole("button", { name: /5 more minutes/i }));
  await pass(0);
  expect(fake.bought).toEqual(["call:c1:buy:1"]);
  expect(onMoment).toHaveBeenLastCalledWith("minutes_bought");
  expect(screen.queryByText(/time's up/i)).toBeNull();
  expect(screen.getByText("5:00")).toBeTruthy();
  expect(screen.getByText("10")).toBeTruthy();
});

it("cannot buy when she is short, and says how to earn more", async () => {
  const fake = fakeServer({ minutes: 1, coins: 12 });
  render(<CallClock childId="ila" callId="c1" active onMoment={() => {}} onGoodbye={() => {}} />);
  await pass(0);
  await pass(60_000);
  const buy = screen.getByRole("button", { name: /5 more minutes/i }) as HTMLButtonElement;
  expect(buy.disabled).toBe(true);
  expect(screen.getByText(/18 more coins/i)).toBeTruthy();
  fireEvent.click(buy);
  await pass(0);
  expect(fake.bought).toEqual([]);
});

it("does nothing until the call is live", async () => {
  const fake = fakeServer({ minutes: 3, coins: 0 });
  render(<CallClock childId="ila" callId="c1" active={false} onMoment={() => {}} onGoodbye={() => {}} />);
  await pass(120_000);
  expect(fake.spent).toEqual([]);
});

it("shows the new balance when the shop spends coins during the call", async () => {
  fakeServer({ minutes: 3, coins: 100 });
  render(<CallClock childId="ila" callId="c1" active onMoment={() => {}} onGoodbye={() => {}} />);
  await pass(0);
  expect(screen.getByText("100")).toBeTruthy();
  act(() => { window.dispatchEvent(new CustomEvent(COINS_CHANGED_EVENT, { detail: { childId: "ila", coins: 40 } })); });
  expect(screen.getByText("40")).toBeTruthy();
  act(() => { window.dispatchEvent(new CustomEvent(COINS_CHANGED_EVENT, { detail: { childId: "reina", coins: 5 } })); });
  expect(screen.getByText("40")).toBeTruthy();
});

// Bug 2026-11-10: call time is earned in seconds (10-20 s per stop), so the clock counts the seconds the server
// grants, not whole minutes. Why the human caught it: FaceTime minutes piled up into long calls; why the logs did not:
// whole-minute spends looked normal; why the lab missed it: the fake server only ever granted whole minutes.
it("counts down the seconds the server grants and ends when they run out", async () => {
  let saved = 15;
  const spent: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const json = (data: unknown) => ({ ok: true, json: async () => data });
    if (url === "/api/rewards/call/ila") return json({ minutesLeft: 0, secondsLeft: saved, coins: 0, price: 30, minutes: 5, warnAtSecondsLeft: 60 });
    if (url === "/api/rewards/call/minute") {
      if (saved < 1) return json({ ok: false, reason: "no_minutes", coins: 0 });
      const granted = Math.min(60, saved); saved -= granted; spent.push(body.receiptId);
      return json({ ok: true, minutesLeft: 0, secondsLeft: saved, secondsGranted: granted, coins: 0 });
    }
    throw new Error(`unexpected ${url}`);
  }));
  const onMoment = vi.fn();
  render(<CallClock childId="ila" callId="s1" active onMoment={onMoment} onGoodbye={() => {}} />);
  await pass(0);
  expect(spent).toEqual(["call:s1:1"]);
  expect(screen.getByText("0:15")).toBeTruthy();
  await pass(15_000);
  expect(screen.getByText(/time's up/i)).toBeTruthy();
  expect(onMoment).toHaveBeenLastCalledWith("time_up");
});

// Owner 2026-11-12: "FaceTime is still extremely buggy." The clock was pinned top-right over the call's X and the
// shop's "Back to the call", and the time's-up card covered Games and Go Shopping. Why the human caught it: the
// buttons under it could not be pressed. Why logs missed it: layout is not logged. Why the lab missed it: no test
// looked at where the clock sits. Rule: the time pill sits bottom-left; the time's-up card is centered on screen.
it("keeps out of the top-right corner, where the call's own buttons are", async () => {
  fakeServer({ minutes: 1, coins: 0 });
  render(<CallClock childId="ila" callId="c1" active onMoment={() => {}} onGoodbye={() => {}} />);
  await pass(0);
  const clock = screen.getByTestId("call-clock");
  expect(clock.className).toMatch(/\bbottom-4\b/);
  expect(clock.className).toMatch(/\bleft-4\b/);
  expect(clock.className).not.toMatch(/\b(top|right)-4\b/);
  await pass(60_000);
  const card = screen.getByRole("dialog", { name: "Call time is up" });
  expect(card.parentElement?.className).toMatch(/\binset-0\b/);
  expect(card.parentElement?.className).toMatch(/\bitems-center\b/);
});
